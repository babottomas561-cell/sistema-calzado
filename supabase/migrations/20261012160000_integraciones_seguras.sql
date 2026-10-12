-- Conexiones con WhatsApp (Meta) y la IA (Gemini), configurables desde el panel y SEGURAS.
--
-- Las claves (token de Meta, secreto de la app, clave de Gemini) se guardan en una tabla SIN políticas de lectura:
-- nadie las puede leer por la API, ni el público ni el equipo. Desde el panel se guardan y se ve si están cargadas
-- (con los últimos 4 caracteres), nunca el valor.
--
--   · Lo que manda el local (avisos de pedidos, mensaje de prueba) sale desde la base con pg_net: el token no pasa
--     por el navegador ni por la app. Los avisos de pedidos salen solos al cambiar el estado (lo cambie quien lo cambie).
--   · Lo que llega de Meta (webhook) lo verifica la base con la firma (HMAC con el secreto de la app). Solo con la
--     firma válida devuelve lo necesario para que el bot conteste, y solo deja contestarle a quien escribió.
--   · Lo que cobra Meta (viene en los avisos de estado de cada mensaje) se suma solo como gasto «WhatsApp (Meta)».

create extension if not exists pg_net with schema extensions;

-- ── Las claves ─────────────────────────────────────────────────────────
create table public.integraciones (
  unica              boolean primary key default true check (unica),
  wa_phone_number_id text,                 -- el ID del número (no es secreto, pero va junto)
  wa_waba_id         text,                 -- el ID de la cuenta de WhatsApp Business (para plantillas)
  wa_access_token    text,
  wa_app_secret      text,
  wa_verify_token    text not null default encode(extensions.gen_random_bytes(12), 'hex'),
  gemini_api_key     text,
  actualizado_en     timestamptz not null default now(),
  actualizado_por    uuid references public.perfiles (id) on delete set null
);
create index integraciones_actualizado_por_idx on public.integraciones (actualizado_por);
insert into public.integraciones default values;
alter table public.integraciones enable row level security;
-- Sin políticas a propósito: solo las funciones de abajo la leen
revoke all on public.integraciones from anon, authenticated;

-- Precios de Meta por mensaje cobrado (US$, Argentina; editables porque Meta los cambia)
alter table public.configuracion_gastos
  add column wa_precio_marketing      numeric(8,4) not null default 0.0618,
  add column wa_precio_utility        numeric(8,4) not null default 0.0260,
  add column wa_precio_authentication numeric(8,4) not null default 0.0260;

-- ── Registro de lo que se mandó ────────────────────────────────────────
create table public.whatsapp_envios (
  id          bigint generated always as identity primary key,
  fecha       timestamptz not null default now(),
  tipo        text not null check (tipo in ('aviso_pedido', 'prueba', 'respuesta', 'leido')),
  telefono    text not null,
  pedido_id   bigint references public.pedidos (id) on delete set null,
  detalle     text,
  request_id  bigint                          -- el pedido HTTP de pg_net (su respuesta: net._http_response)
);
create index whatsapp_envios_pedido_id_idx on public.whatsapp_envios (pedido_id);
create index whatsapp_envios_fecha_idx on public.whatsapp_envios (fecha);
alter table public.whatsapp_envios enable row level security;
create policy "ve envios de whatsapp" on public.whatsapp_envios for select to authenticated using (tiene_permiso('tienda.editar'));

-- Mensajes de Meta ya cobrados (un mensaje avisa sent/delivered/read: se cuenta una vez)
create table public.whatsapp_cobros (
  message_id  text primary key,
  fecha       timestamptz not null default now(),
  categoria   text not null,
  precio_usd  numeric(8,4) not null
);
alter table public.whatsapp_cobros enable row level security;
create policy "ve cobros de whatsapp" on public.whatsapp_cobros for select to authenticated using (tiene_permiso('gastos.gestionar'));

-- ── Internas ───────────────────────────────────────────────────────────
-- Manda un mensaje a la API de Meta desde la base. Devuelve el id del pedido HTTP (o null si no hay conexión).
create function public._wa_enviar(p_telefono text, p_mensaje jsonb, p_tipo text, p_pedido bigint default null, p_detalle text default null)
returns bigint language plpgsql security definer set search_path = public, extensions as $$
declare i integraciones; v_req bigint; v_tel text := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
begin
  select * into i from integraciones;
  if i.wa_access_token is null or i.wa_phone_number_id is null then return null; end if;
  -- Argentina: celulares con el 9 (54 381… → 549 381…)
  if v_tel ~ '^54' and v_tel !~ '^549' and length(v_tel) = 12 then v_tel := '549' || substr(v_tel, 3); end if;
  if length(v_tel) < 8 then return null; end if;
  select net.http_post(
    url := 'https://graph.facebook.com/v23.0/' || i.wa_phone_number_id || '/messages',
    headers := jsonb_build_object('Authorization', 'Bearer ' || i.wa_access_token, 'Content-Type', 'application/json'),
    body := case when p_tipo = 'leido' then jsonb_build_object('messaging_product', 'whatsapp') || p_mensaje   -- marcar leído no lleva destinatario
                 else jsonb_build_object('messaging_product', 'whatsapp', 'recipient_type', 'individual', 'to', v_tel) || p_mensaje end
  ) into v_req;
  insert into whatsapp_envios (tipo, telefono, pedido_id, detalle, request_id) values (p_tipo, v_tel, p_pedido, p_detalle, v_req);
  return v_req;
end $$;
revoke execute on function public._wa_enviar(text, jsonb, text, bigint, text) from public, anon, authenticated;

-- ¿La firma de Meta es válida para este cuerpo? (HMAC-SHA256 del cuerpo crudo con el secreto de la app)
create function public._wa_firma_valida(p_payload text, p_firma text) returns boolean
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_secreto text := (select wa_app_secret from integraciones);
begin
  if v_secreto is null or p_payload is null or coalesce(p_firma, '') !~ '^sha256=[0-9a-f]{64}$' then return false; end if;
  return encode(hmac(convert_to(p_payload, 'UTF8'), convert_to(v_secreto, 'UTF8'), 'sha256'), 'hex') = substr(p_firma, 8);
end $$;
revoke execute on function public._wa_firma_valida(text, text) from public, anon, authenticated;

-- ── Para el panel (Tienda online) ──────────────────────────────────────
-- Guarda lo que venga con algo (vacío = no se toca). p_quitar: qué borrar ('token', 'secreto', 'gemini', 'numero').
create function public.guardar_integraciones(p_phone_number_id text default null, p_waba_id text default null, p_access_token text default null,
                                             p_app_secret text default null, p_gemini_api_key text default null, p_quitar text[] default '{}')
returns void language plpgsql security definer set search_path = public as $$
begin
  if not tiene_permiso('tienda.editar') then raise exception 'No tenés permiso para configurar las conexiones'; end if;
  if nullif(trim(p_phone_number_id), '') is not null and trim(p_phone_number_id) !~ '^\d{6,25}$' then
    raise exception 'El ID del número son solo números (lo ves en Meta → WhatsApp → Configuración de la API)';
  end if;
  if nullif(trim(p_waba_id), '') is not null and trim(p_waba_id) !~ '^\d{6,25}$' then
    raise exception 'El ID de la cuenta de WhatsApp Business son solo números';
  end if;
  update integraciones set
    wa_phone_number_id = case when 'numero' = any (p_quitar) then null else coalesce(nullif(trim(p_phone_number_id), ''), wa_phone_number_id) end,
    wa_waba_id         = case when 'numero' = any (p_quitar) then null else coalesce(nullif(trim(p_waba_id), ''), wa_waba_id) end,
    wa_access_token    = case when 'token' = any (p_quitar) then null else coalesce(nullif(trim(p_access_token), ''), wa_access_token) end,
    wa_app_secret      = case when 'secreto' = any (p_quitar) then null else coalesce(nullif(trim(p_app_secret), ''), wa_app_secret) end,
    gemini_api_key     = case when 'gemini' = any (p_quitar) then null else coalesce(nullif(trim(p_gemini_api_key), ''), gemini_api_key) end,
    actualizado_en = now(), actualizado_por = auth.uid()
   where unica;   -- una sola fila (y Supabase no deja un UPDATE sin WHERE)
end $$;

-- Qué está cargado (sin mostrar las claves): para la pantalla
create function public.estado_integraciones() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare i integraciones; fin text := '…';
begin
  if not tiene_permiso('tienda.editar') then raise exception 'No tenés permiso para ver las conexiones'; end if;
  select * into i from integraciones;
  return jsonb_build_object(
    'phone_number_id', i.wa_phone_number_id, 'waba_id', i.wa_waba_id,
    'token', case when i.wa_access_token is not null then fin || right(i.wa_access_token, 4) end,
    'secreto', case when i.wa_app_secret is not null then fin || right(i.wa_app_secret, 4) end,
    'gemini', case when i.gemini_api_key is not null then fin || right(i.gemini_api_key, 4) end,
    'verify_token', i.wa_verify_token,      -- se pega en Meta al configurar el webhook
    'meta_lista', i.wa_access_token is not null and i.wa_phone_number_id is not null and i.wa_app_secret is not null,
    'actualizado_en', i.actualizado_en);
end $$;

-- Mensaje de prueba: la plantilla «hello_world» que Meta trae en toda cuenta nueva
create function public.wa_mensaje_prueba(p_telefono text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
  if not tiene_permiso('tienda.editar') then raise exception 'No tenés permiso para configurar las conexiones'; end if;
  if (select wa_access_token is null or wa_phone_number_id is null from integraciones) then
    raise exception 'Primero cargá el ID del número y el token de Meta';
  end if;
  v := _wa_enviar(p_telefono, jsonb_build_object('type', 'template', 'template',
         jsonb_build_object('name', 'hello_world', 'language', jsonb_build_object('code', 'en_US'))), 'prueba', null, 'Mensaje de prueba');
  if v is null then raise exception 'Revisá el teléfono: va con código de área (por ejemplo 381 555 1234)'; end if;
  return v;
end $$;

-- Lo último que se mandó y qué contestó Meta (pg_net guarda las respuestas unas horas)
create function public.wa_envios_recientes(p_limite int default 15)
returns table (id bigint, fecha timestamptz, tipo text, telefono text, detalle text, estado text, error text)
language sql stable security definer set search_path = public, extensions as $$
  select e.id, e.fecha, e.tipo, e.telefono, e.detalle,
         case when r.id is null then 'enviando' when r.status_code between 200 and 299 then 'ok' else 'error' end,
         case when r.status_code not between 200 and 299 then coalesce((r.content::jsonb -> 'error' ->> 'message'), r.error_msg) end
    from whatsapp_envios e left join net._http_response r on r.id = e.request_id
   where tiene_permiso('tienda.editar') and e.tipo <> 'leido'
   order by e.id desc limit least(greatest(p_limite, 1), 50)
$$;

revoke execute on function public.guardar_integraciones(text, text, text, text, text, text[]), public.estado_integraciones(),
  public.wa_mensaje_prueba(text), public.wa_envios_recientes(int) from public, anon;
grant execute on function public.guardar_integraciones(text, text, text, text, text, text[]), public.estado_integraciones(),
  public.wa_mensaje_prueba(text), public.wa_envios_recientes(int) to authenticated;

-- ── Para el webhook (lo llama el servidor con la clave pública: lo protege la firma de Meta) ──
create function public.wa_verificar_token(p_token text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(p_token, '') <> '' and p_token = (select wa_verify_token from integraciones)
$$;

-- Recibe lo que manda Meta. Con la firma válida: registra lo cobrado, marca leídos y devuelve los mensajes de
-- texto para el bot (y la clave de Gemini si el bot está activo). Con la firma inválida: nada.
create function public.wa_recibir(p_payload text, p_firma text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb; s jsonb; m jsonb; v_precio numeric; v_cat text; v_mensajes jsonb := '[]'; c configuracion_gastos;
begin
  if not _wa_firma_valida(p_payload, p_firma) then return jsonb_build_object('ok', false); end if;
  v := p_payload::jsonb;
  select * into c from configuracion_gastos;
  for s in select jsonb_array_elements(coalesce(ch -> 'value' -> 'statuses', '[]'))
             from jsonb_array_elements(coalesce(v -> 'entry', '[]')) e, jsonb_array_elements(coalesce(e -> 'changes', '[]')) ch loop
    -- Lo que cobra Meta: una vez por mensaje
    if (s -> 'pricing' ->> 'billable')::boolean then
      v_cat := coalesce(s -> 'pricing' ->> 'category', 'utility');
      v_precio := case v_cat when 'marketing' then c.wa_precio_marketing when 'authentication' then c.wa_precio_authentication
                             when 'utility' then c.wa_precio_utility else 0 end;
      insert into whatsapp_cobros (message_id, categoria, precio_usd) values (s ->> 'id', v_cat, v_precio)
      on conflict (message_id) do nothing;
      if found and v_precio > 0 then
        perform _sumar_gasto_automatico('whatsapp:' || to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM'),
          'WhatsApp (Meta)', 'WhatsApp de Meta ' || to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'MM/YYYY'), v_precio, 'USD');
      end if;
    end if;
  end loop;
  for m in select jsonb_array_elements(coalesce(ch -> 'value' -> 'messages', '[]'))
             from jsonb_array_elements(coalesce(v -> 'entry', '[]')) e, jsonb_array_elements(coalesce(e -> 'changes', '[]')) ch loop
    -- Solo lo reciente (que no se pueda reusar un aviso viejo)
    continue when coalesce((m ->> 'timestamp')::bigint, 0) < extract(epoch from now())::bigint - 600;
    perform _wa_enviar(m ->> 'from', jsonb_build_object('status', 'read', 'message_id', m ->> 'id'), 'leido');
    if m ->> 'type' = 'text' then
      v_mensajes := v_mensajes || jsonb_build_object('de', m ->> 'from', 'id', m ->> 'id', 'texto', m -> 'text' ->> 'body');
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'mensajes', v_mensajes,
    'bot_activo', (select wa_bot_activo from configuracion_tienda),
    'gemini_api_key', case when (select wa_bot_activo from configuracion_tienda) and jsonb_array_length(v_mensajes) > 0
                           then (select gemini_api_key from integraciones) end);
end $$;

-- Contestarle a quien escribió (solo a un remitente de ese mismo aviso firmado, y solo texto)
create function public.wa_responder(p_payload text, p_firma text, p_para text, p_texto text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not _wa_firma_valida(p_payload, p_firma) then return false; end if;
  if coalesce(trim(p_texto), '') = '' or length(p_texto) > 4000 then return false; end if;
  if not exists (select 1 from jsonb_array_elements(coalesce(p_payload::jsonb -> 'entry', '[]')) e,
                   jsonb_array_elements(coalesce(e -> 'changes', '[]')) ch,
                   jsonb_array_elements(coalesce(ch -> 'value' -> 'messages', '[]')) m
                  where m ->> 'from' = p_para) then return false; end if;
  return _wa_enviar(p_para, jsonb_build_object('type', 'text', 'text', jsonb_build_object('preview_url', false, 'body', p_texto)), 'respuesta') is not null;
end $$;

revoke execute on function public.wa_verificar_token(text), public.wa_recibir(text, text), public.wa_responder(text, text, text, text) from public;
grant execute on function public.wa_verificar_token(text), public.wa_recibir(text, text), public.wa_responder(text, text, text, text) to anon, authenticated;

-- ── Avisos de pedidos: salen solos al cambiar el estado ────────────────
create function public._wa_aviso_pedido() returns trigger
language plpgsql security definer set search_path = public as $$
declare t configuracion_tienda; cl clientes; v_estado text;
begin
  select * into t from configuracion_tienda;
  if not coalesce(t.wa_notificaciones_pedidos, false) or t.wa_plantilla_estado is null then return new; end if;
  select * into cl from clientes where id = new.cliente_id;
  if cl.telefono is null then return new; end if;
  v_estado := case new.estado
    when 'confirmado' then 'confirmado y reservado'
    when 'preparado' then case when new.entrega = 'retiro' then 'listo para retirar' else 'listo para despachar' end
    when 'listo_retiro' then 'listo para retirar'
    when 'enviado' then 'en camino'
    when 'entregado' then 'entregado'
    when 'cancelado' then 'cancelado' end;
  if v_estado is null then return new; end if;
  perform _wa_enviar(cl.telefono, jsonb_build_object('type', 'template', 'template', jsonb_build_object(
    'name', t.wa_plantilla_estado, 'language', jsonb_build_object('code', t.wa_idioma_plantilla),
    'components', jsonb_build_array(jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
      jsonb_build_object('type', 'text', 'text', coalesce(split_part(cl.nombre, ' ', 1), 'Hola')),
      jsonb_build_object('type', 'text', 'text', new.comprobante),
      jsonb_build_object('type', 'text', 'text', v_estado)))))), 'aviso_pedido', new.id, 'Pedido ' || new.comprobante || ': ' || v_estado);
  return new;
end $$;
revoke execute on function public._wa_aviso_pedido() from public, anon, authenticated;
create trigger pedidos_aviso_whatsapp after update of estado on public.pedidos
  for each row when (old.estado is distinct from new.estado) execute function public._wa_aviso_pedido();

-- ── Arreglo: el nombre de la plantilla no se podía guardar ─────────────
-- La regla usaba {1,512} y Postgres admite hasta {,255} en una expresión regular: fallaba siempre.
alter table public.configuracion_tienda drop constraint configuracion_tienda_wa_plantilla_estado_valida;
alter table public.configuracion_tienda add constraint configuracion_tienda_wa_plantilla_estado_valida
  check (wa_plantilla_estado is null or (wa_plantilla_estado ~ '^[a-z0-9_]+$' and length(wa_plantilla_estado) <= 512));

-- La tabla de claves tiene RLS y una política que no deja leer a nadie (todo pasa por las funciones de arriba)
create policy "nadie lee las claves" on public.integraciones for select to authenticated using (false);
