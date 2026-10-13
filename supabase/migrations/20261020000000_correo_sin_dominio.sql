-- Correo sin dominio propio: el local elige por dónde salen sus mails.
--   · Dominio propio con Resend (como hasta ahora: la base le habla a la API de Resend).
--   · Gmail del local (o cualquier otro servidor SMTP): la base no sabe hablar SMTP, así que le pide a la app (/api/correo/enviar) que lo mande.
-- Supabase Auth (confirmar cuenta, cambiar contraseña) ya aceptaba cualquier SMTP: eso no cambia.
-- La ruta de la app no guarda ni sabe ningún secreto: la base firma cada pedido (HMAC con un secreto que solo vive en `integraciones`) y la ruta le
-- pregunta a la base si la firma es buena (`correo_verificar`) antes de mandar nada. Sin firma válida, nadie puede usarla para mandar mails.

-- El secreto nace con la instalación (no en el primer envío): la ruta lo verifica desde OTRA conexión, que no ve lo que todavía no se confirmó
alter table public.integraciones add column correo_secreto text not null default encode(extensions.gen_random_bytes(32), 'hex');

-- ¿Está cargado todo lo necesario para mandar? (cualquier servidor)
create function public._correo_configurado(i public.integraciones) returns boolean
language sql immutable as $$
  select i.smtp_host is not null and i.smtp_puerto is not null and i.smtp_usuario is not null and i.smtp_clave is not null and i.smtp_email is not null
$$;

-- La ruta de la app pregunta si el pedido que le llegó lo firmó esta base: huella = SHA-256 del cuerpo, marca = segundos desde 1970 (vence a los 5 minutos)
create function public.correo_verificar(p_huella text, p_marca bigint, p_firma text) returns boolean
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_secreto text := (select correo_secreto from integraciones);
begin
  if v_secreto is null or p_huella is null or p_huella !~ '^[0-9a-f]{64}$' or p_marca is null or p_firma is null then return false; end if;
  if abs(extract(epoch from now())::bigint - p_marca) > 300 then return false; end if;
  return encode(hmac(convert_to(p_huella || '.' || p_marca::text, 'UTF8'), convert_to(v_secreto, 'UTF8'), 'sha256'), 'hex') = lower(p_firma);
end $$;

-- Manda UN mail por el servidor que eligió el local. Devuelve {ok, error}; nunca lanza (el que llama decide qué hacer con el fallo).
create function public._correo_enviar(p_para text, p_asunto text, p_html text, p_reply_to text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions set statement_timeout = '45s' as $$
declare i integraciones; t configuracion_tienda; v_nombre text; r jsonb; v_cuerpo jsonb; v_texto text; v_secreto text; v_huella text; v_marca bigint := extract(epoch from now())::bigint; v_msg text;
begin
  select * into i from integraciones; select * into t from configuracion_tienda;
  if not _correo_configurado(i) then return jsonb_build_object('ok', false, 'error', 'Falta conectar el correo (Integraciones → Correo)'); end if;
  v_nombre := replace(coalesce(i.smtp_nombre, t.nombre), '"', '');

  if i.smtp_host = 'smtp.resend.com' then
    -- Resend tiene API: no hace falta pasar por la app
    v_cuerpo := jsonb_build_object('from', '"' || v_nombre || '" <' || i.smtp_email || '>', 'to', jsonb_build_array(p_para), 'subject', p_asunto, 'html', p_html);
    if p_reply_to is not null then v_cuerpo := v_cuerpo || jsonb_build_object('reply_to', p_reply_to); end if;
    r := _pedir_http('POST', 'https://api.resend.com/emails', jsonb_build_object('Authorization', 'Bearer ' || i.smtp_clave), 'application/json', v_cuerpo::text);
    if (r ->> 'status')::int not between 200 and 299 then
      return jsonb_build_object('ok', false, 'error', left(coalesce(r -> 'cuerpo' ->> 'message', 'Resend contestó ' || (r ->> 'status')), 200));
    end if;
    return jsonb_build_object('ok', true);
  end if;

  -- Cualquier otro servidor (Gmail, etc.): lo manda la app por SMTP, con el pedido firmado
  if i.sitio_url is null then
    return jsonb_build_object('ok', false, 'error', 'Falta la dirección del sitio en la instalación: sin ella la base no encuentra la ruta que manda los mails');
  end if;
  v_secreto := i.correo_secreto;
  v_cuerpo := jsonb_build_object('marca', v_marca, 'host', i.smtp_host, 'puerto', i.smtp_puerto, 'usuario', i.smtp_usuario, 'clave', i.smtp_clave,
    'desde_nombre', v_nombre, 'desde_email', i.smtp_email, 'para', p_para, 'asunto', p_asunto, 'html', p_html);
  if p_reply_to is not null then v_cuerpo := v_cuerpo || jsonb_build_object('responder_a', p_reply_to); end if;
  v_texto := v_cuerpo::text;
  v_huella := encode(digest(convert_to(v_texto, 'UTF8'), 'sha256'), 'hex');
  perform set_config('app.http_timeout_ms', '40000', true);   -- la app espera hasta 30 s al servidor de correo
  r := _pedir_http('POST', i.sitio_url || '/api/correo/enviar',
    jsonb_build_object('x-firma', encode(hmac(convert_to(v_huella || '.' || v_marca::text, 'UTF8'), convert_to(v_secreto, 'UTF8'), 'sha256'), 'hex')),
    'application/json', v_texto);
  if (r ->> 'status')::int = 200 and (r -> 'cuerpo' ->> 'ok') = 'true' then return jsonb_build_object('ok', true); end if;
  v_msg := left(coalesce(r -> 'cuerpo' ->> 'error', 'La app respondió ' || coalesce(r ->> 'status', 'sin respuesta')), 200);
  return jsonb_build_object('ok', false, 'error', v_msg);
end $$;

-- El mail del comprobante, por el servidor que tenga el local (antes solo Resend)
create or replace function public.enviar_comprobante_mail(p_tipo text, p_id bigint, p_email text) returns jsonb
language plpgsql security definer set search_path = public set statement_timeout = '45s' as $$
declare v_email text := lower(trim(coalesce(p_email, ''))); i integraciones; t configuracion_tienda; l datos_legales; v_doc jsonb; v_url text; v_enlace jsonb; r jsonb; v_msg text;
begin
  if not _comprobante_acceso(p_tipo, p_id) then raise exception 'No tenés acceso a ese comprobante'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Ese email no parece válido'; end if;
  select * into i from integraciones; select * into t from configuracion_tienda; select * into l from datos_legales;
  if not _correo_configurado(i) then
    raise exception 'Para mandar comprobantes por mail hay que conectar el correo (Integraciones → Correo)';
  end if;
  v_doc := _comprobante_json(p_tipo, p_id);
  v_enlace := _comprobante_enlace(p_tipo, p_id);
  -- Sin la dirección del sitio cargada, el link del mail no se puede armar
  v_url := v_enlace ->> 'url';
  if v_url is null then raise exception 'Falta la dirección del sitio en la instalación: no se puede armar el link del comprobante'; end if;
  r := _correo_enviar(v_email, (v_doc ->> 'titulo') || ' ' || (v_doc ->> 'numero') || ' · ' || t.nombre, _comprobante_mail_html(v_doc, v_url), l.email_contacto);
  if (r ->> 'ok') <> 'true' then
    v_msg := coalesce(r ->> 'error', 'No se pudo mandar el mail');
    insert into comprobante_envios (tipo, documento_id, canal, destino, estado, detalle) values (p_tipo, p_id, 'mail', v_email, 'error', v_msg);
    return jsonb_build_object('ok', false, 'error', v_msg);
  end if;
  insert into comprobante_envios (tipo, documento_id, canal, destino, estado) values (p_tipo, p_id, 'mail', v_email, 'enviado');
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.comprobante_mail_disponible() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare i integraciones;
begin
  if not es_staff() then raise exception 'No tenés acceso'; end if;
  select * into i from integraciones;
  if not _correo_configurado(i) then
    return jsonb_build_object('disponible', false, 'motivo', 'Para mandar por mail hay que conectar el correo (Integraciones → Correo).');
  end if;
  if i.sitio_url is null then
    return jsonb_build_object('disponible', false, 'motivo', 'Falta la dirección del sitio para armar el link: se carga al guardar el correo (Integraciones → Correo).');
  end if;
  return jsonb_build_object('disponible', true);
end $$;

-- guardar_correo: ahora también guarda la dirección del sitio si todavía no hay una (sin dominio propio es la de Vercel; con dominio no se pisa).
-- Los parámetros anteriores siguen igual: la versión anterior de la pantalla sigue andando.
drop function public.guardar_correo(text, int, text, text, text, text);
create function public.guardar_correo(p_host text default null, p_puerto int default null, p_usuario text default null,
                                      p_clave text default null, p_email text default null, p_nombre text default null, p_sitio_url text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not tiene_permiso('equipo.administrar') then raise exception 'Solo el administrador configura el correo'; end if;
  if nullif(trim(p_host), '') is not null and trim(p_host) !~ '^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$' then
    raise exception 'El servidor de correo (host) está mal escrito: algo como smtp.resend.com';
  end if;
  if nullif(trim(p_sitio_url), '') is not null and trim(p_sitio_url) !~ '^https?://[^/\s]+$' then raise exception 'La dirección del sitio no es válida'; end if;
  update integraciones set
    smtp_host = coalesce(nullif(trim(p_host), ''), smtp_host), smtp_puerto = coalesce(p_puerto, smtp_puerto),
    smtp_usuario = coalesce(nullif(trim(p_usuario), ''), smtp_usuario), smtp_clave = coalesce(nullif(trim(p_clave), ''), smtp_clave),
    smtp_email = coalesce(nullif(lower(trim(p_email)), ''), smtp_email), smtp_nombre = case when p_nombre is null then smtp_nombre else nullif(trim(p_nombre), '') end,
    sitio_url = coalesce(sitio_url, nullif(trim(p_sitio_url), '')),
    actualizado_en = now(), actualizado_por = auth.uid()
   where unica;
end $$;

-- estado_correo: suma si hay dirección del sitio (los mails de comprobantes por Gmail la necesitan)
create or replace function public.estado_correo() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare i integraciones; t configuracion_tienda;
begin
  if not tiene_permiso('equipo.administrar') then raise exception 'Solo el administrador configura el correo'; end if;
  select * into i from integraciones; select * into t from configuracion_tienda;
  return jsonb_build_object(
    'smtp', _correo_configurado(i),
    'host', i.smtp_host, 'puerto', i.smtp_puerto, 'usuario', i.smtp_usuario,
    'clave', case when i.smtp_clave is not null then '…' || right(i.smtp_clave, 4) end,
    'email', i.smtp_email, 'nombre', i.smtp_nombre, 'nombre_tienda', t.nombre,
    'conexion', i.supabase_token is not null and i.supabase_ref is not null,
    'sitio', i.sitio_url is not null,
    'aplicado_en', i.correo_aplicado_en, 'error', i.correo_aplicado_error);
end $$;

-- Permisos de ejecución
revoke execute on function public._correo_configurado(public.integraciones), public._correo_enviar(text, text, text, text) from public, anon, authenticated;
revoke execute on function public.correo_verificar(text, bigint, text) from public;
grant  execute on function public.correo_verificar(text, bigint, text) to anon, authenticated;
revoke execute on function public.guardar_correo(text, int, text, text, text, text, text) from public, anon;
grant  execute on function public.guardar_correo(text, int, text, text, text, text, text) to authenticated;
