-- Cuentas de clientes y correo, configurables desde el panel (solo el Administrador).
--
-- 1. `configuracion_cuentas` (una fila): quién puede registrarse (abierto / solo con invitación), qué datos pide el
--    formulario (teléfono, documento, nacimiento, dirección: no / opcional / obligatorio), reglas de contraseña,
--    dominios de email permitidos o bloqueados, términos y condiciones y confirmación de email.
--    Las reglas las hace cumplir la BASE (trigger antes de crear el usuario), no la pantalla.
-- 2. `invitaciones_cuenta`: links de un solo uso para sumar a alguien (cliente o del equipo) aunque el registro
--    esté cerrado. La invitación va atada a un email y a un token secreto.
-- 3. Correo: el SMTP del cliente (Resend, etc.) queda en `integraciones` (nadie lo lee) y la base se lo pasa a
--    Supabase Auth por su API junto con las reglas de contraseña, la confirmación y las plantillas de los mails
--    (con el nombre de la tienda). Sin esto, en producción Supabase solo manda mails al equipo del proyecto.
-- Los links de los mails apuntan a /auth/confirmar con el token_hash: andan aunque el cliente abra el mail
-- en otro dispositivo que donde se registró.

-- ── 1. Configuración de cuentas ──────────────────────────────────────
create table public.configuracion_cuentas (
  unica                 boolean primary key default true check (unica),
  registro              text not null default 'abierto' check (registro in ('abierto', 'invitacion')),
  confirmar_email       boolean not null default true,
  telefono              text not null default 'opcional'  check (telefono  in ('no', 'opcional', 'obligatorio')),
  documento             text not null default 'no'        check (documento in ('no', 'opcional', 'obligatorio')),
  nacimiento            text not null default 'no'        check (nacimiento in ('no', 'opcional', 'obligatorio')),
  direccion             text not null default 'no'        check (direccion in ('no', 'opcional', 'obligatorio')),
  clave_min             int  not null default 8 check (clave_min between 6 and 64),
  clave_exige_numero    boolean not null default false,
  clave_exige_mayuscula boolean not null default false,
  dominios_permitidos   text[] not null default '{}',     -- vacío = cualquiera
  dominios_bloqueados   text[] not null default '{}',     -- mails descartables, etc.
  exigir_terminos       boolean not null default false,
  terminos_url          text check (terminos_url is null or terminos_url ~ '^(https://|/)'),
  ofrecer_novedades     boolean not null default true,    -- casilla «quiero recibir novedades» (sin tildar de entrada)
  texto_registro        text check (char_length(texto_registro) <= 200),
  texto_confirmado      text check (char_length(texto_confirmado) <= 300),
  actualizado_en        timestamptz not null default now(),
  actualizado_por       uuid references auth.users (id) on delete set null
);
create index configuracion_cuentas_actualizado_por_idx on public.configuracion_cuentas (actualizado_por);
insert into public.configuracion_cuentas default values;
alter table public.configuracion_cuentas enable row level security;
-- La lee el formulario de registro (público): no tiene ningún secreto
create policy "todos ven" on public.configuracion_cuentas for select to anon, authenticated using (true);
create policy "administrador edita" on public.configuracion_cuentas for update to authenticated
  using (tiene_permiso('equipo.administrar')) with check (tiene_permiso('equipo.administrar'));

-- Dominios en minúscula, sin «@», sin repetidos ni vacíos; y quién/cuándo
create function public._cuentas_normalizar() returns trigger
language plpgsql set search_path = public as $$
declare v_re text := '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$';
begin
  new.dominios_permitidos := coalesce((select array_agg(distinct d order by d) from (select regexp_replace(lower(trim(x)), '^@', '') d from unnest(new.dominios_permitidos) x) q where d <> ''), '{}');
  new.dominios_bloqueados := coalesce((select array_agg(distinct d order by d) from (select regexp_replace(lower(trim(x)), '^@', '') d from unnest(new.dominios_bloqueados) x) q where d <> ''), '{}');
  if exists (select 1 from unnest(new.dominios_permitidos || new.dominios_bloqueados) d where d !~ v_re) then
    raise exception 'Hay un dominio de email mal escrito: tiene que ser algo como gmail.com';
  end if;
  if new.dominios_permitidos && new.dominios_bloqueados then raise exception 'Un mismo dominio no puede estar permitido y bloqueado a la vez'; end if;
  new.terminos_url := nullif(trim(new.terminos_url), '');
  new.texto_registro := nullif(trim(new.texto_registro), '');
  new.texto_confirmado := nullif(trim(new.texto_confirmado), '');
  if new.exigir_terminos and new.terminos_url is null then raise exception 'Para exigir los términos, cargá la dirección donde se leen'; end if;
  new.actualizado_en := now(); new.actualizado_por := auth.uid();
  return new;
end $$;
create trigger cuentas_normalizar before update on public.configuracion_cuentas for each row execute function public._cuentas_normalizar();

alter table public.perfiles add column terminos_aceptados_en timestamptz;

-- ── 2. Invitaciones ──────────────────────────────────────────────────
create table public.invitaciones_cuenta (
  id          bigint generated always as identity primary key,
  email       text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  rol_id      bigint references public.roles (id) on delete cascade,      -- vacío = cliente; con rol = del equipo
  token       text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  creada_por  uuid references auth.users (id) on delete set null,
  usada_en    timestamptz,
  usada_por   uuid references auth.users (id) on delete set null,
  vence_en    timestamptz not null default now() + interval '7 days',
  creado_en   timestamptz not null default now()
);
create index invitaciones_cuenta_rol_idx on public.invitaciones_cuenta (rol_id);
create index invitaciones_cuenta_creada_por_idx on public.invitaciones_cuenta (creada_por);
create index invitaciones_cuenta_usada_por_idx on public.invitaciones_cuenta (usada_por);
create index invitaciones_cuenta_email_idx on public.invitaciones_cuenta (lower(email));
alter table public.invitaciones_cuenta enable row level security;
create policy "administrador ve invitaciones" on public.invitaciones_cuenta for select to authenticated using (tiene_permiso('equipo.administrar'));

create function public.crear_invitacion(p_email text, p_rol bigint default null) returns text
language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(p_email)); v_token text;
begin
  if not tiene_permiso('equipo.administrar') then raise exception 'Solo el administrador invita personas'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Ese email no parece válido'; end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then
    raise exception 'Ya hay una cuenta con ese email: si es del equipo, sumala desde la lista de personas';
  end if;
  if p_rol is not null and not exists (select 1 from roles where id = p_rol and activo) then raise exception 'Ese rol no existe o está desactivado'; end if;
  delete from invitaciones_cuenta where lower(email) = v_email and usada_en is null;   -- queda una sola vigente por email
  insert into invitaciones_cuenta (email, rol_id, creada_por) values (v_email, p_rol, auth.uid()) returning token into v_token;
  return v_token;
end $$;

create function public.anular_invitacion(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tiene_permiso('equipo.administrar') then raise exception 'Solo el administrador invita personas'; end if;
  delete from invitaciones_cuenta where id = p_id and usada_en is null;
end $$;

-- Lo que ve quien abre el link de invitación (anon): a qué email es y para qué rol. Sin el token no devuelve nada.
create function public.invitacion_info(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('email', i.email, 'rol', r.nombre)
    from invitaciones_cuenta i left join roles r on r.id = i.rol_id
   where i.token = p_token and i.usada_en is null and i.vence_en > now()
$$;

-- ── 3. Las reglas de registro, en la base ────────────────────────────
-- Devuelve el motivo por el que NO se puede crear la cuenta (en castellano), o null si se puede.
create function public._registro_error(p_email text, p_meta jsonb) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  c configuracion_cuentas; v_inv boolean; v_dom text := lower(split_part(coalesce(p_email, ''), '@', 2));
  v_tel text := trim(coalesce(p_meta ->> 'telefono', '')); v_doc text := trim(coalesce(p_meta ->> 'documento', ''));
  v_nac text := trim(coalesce(p_meta ->> 'nacimiento', '')); v_dir text := trim(coalesce(p_meta ->> 'direccion', ''));
  v_fecha date; v_faltan text[] := '{}';
begin
  select * into c from configuracion_cuentas;
  if p_email is null or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return 'Ese email no parece válido. Revisalo.'; end if;
  select exists (select 1 from invitaciones_cuenta i where i.token = p_meta ->> 'invitacion' and lower(i.email) = lower(p_email)
                  and i.usada_en is null and i.vence_en > now()) into v_inv;
  if v_inv then return null; end if;     -- una invitación vigente salta las reglas de clientes
  if p_meta ->> 'invitacion' is not null then return 'La invitación venció o ya se usó: pedí una nueva.'; end if;

  if c.registro = 'invitacion' then return 'Por ahora solo se puede crear una cuenta con una invitación del local.'; end if;
  if v_dom = any (c.dominios_bloqueados) then return 'No aceptamos emails de ' || v_dom || '. Usá otro.'; end if;
  if cardinality(c.dominios_permitidos) > 0 and not v_dom = any (c.dominios_permitidos) then
    return 'Solo se aceptan emails de: ' || array_to_string(c.dominios_permitidos, ', ') || '.';
  end if;

  if c.telefono = 'obligatorio' and v_tel = '' then v_faltan := array_append(v_faltan, 'el teléfono'); end if;
  if c.documento = 'obligatorio' and v_doc = '' then v_faltan := array_append(v_faltan, 'el DNI'); end if;
  if c.nacimiento = 'obligatorio' and v_nac = '' then v_faltan := array_append(v_faltan, 'la fecha de nacimiento'); end if;
  if c.direccion = 'obligatorio' and v_dir = '' then v_faltan := array_append(v_faltan, 'la dirección'); end if;
  if cardinality(v_faltan) > 0 then return 'Falta completar ' || array_to_string(v_faltan, ', ') || '.'; end if;

  if v_tel <> '' and regexp_replace(v_tel, '\D', '', 'g') !~ '^\d{8,15}$' then return 'El teléfono no parece válido: escribilo con el código de área.'; end if;
  if v_doc <> '' and regexp_replace(v_doc, '\D', '', 'g') !~ '^\d{7,11}$' then return 'El DNI no parece válido: solo números.'; end if;
  if v_nac <> '' then
    begin v_fecha := v_nac::date; exception when others then return 'La fecha de nacimiento no es válida.'; end;
    if v_fecha > current_date or v_fecha < date '1900-01-01' then return 'La fecha de nacimiento no es válida.'; end if;
  end if;
  if c.exigir_terminos and coalesce(p_meta ->> 'terminos', '') <> 'true' then return 'Tenés que aceptar los términos y condiciones.'; end if;
  return null;
end $$;

-- Para que el formulario avise el motivo ANTES de crear el usuario (Supabase Auth ocultaría el mensaje de la base)
create function public.validar_registro(p_email text, p_meta jsonb) returns text
language sql stable security definer set search_path = public as $$ select public._registro_error(p_email, coalesce(p_meta, '{}')) $$;

-- …y la base lo frena igual, venga de donde venga (formulario, API directa, otro cliente)
create function public._antes_de_registrarse() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_error text;
begin
  v_error := _registro_error(new.email, coalesce(new.raw_user_meta_data, '{}'));
  if v_error is not null then raise exception '%', v_error; end if;
  return new;
end $$;
create trigger antes_de_registrarse before insert on auth.users for each row execute function public._antes_de_registrarse();

-- Al vincular o crear la ficha: ahora también documento, nacimiento, dirección y si quiere novedades.
-- Una ficha cargada en el local no se pisa con lo que escriba el cliente.
create or replace function public._vincular_cliente(p_usuario auth.users) returns void
language plpgsql security definer set search_path = public as $$
declare m jsonb := coalesce(p_usuario.raw_user_meta_data, '{}'); v_nombre text := coalesce(nullif(m ->> 'nombre', ''), split_part(p_usuario.email, '@', 1));
begin
  if exists (select 1 from clientes where usuario_id = p_usuario.id) then return; end if;
  update clientes set usuario_id = p_usuario.id
   where id = (select id from clientes where usuario_id is null and lower(email) = lower(p_usuario.email) order by id limit 1);
  if not found then
    insert into clientes (usuario_id, nombre, email, telefono, documento, fecha_nacimiento, direccion, acepta_promos, origen)
    values (p_usuario.id, v_nombre, p_usuario.email, nullif(trim(m ->> 'telefono'), ''), nullif(trim(m ->> 'documento'), ''),
            nullif(trim(m ->> 'nacimiento'), '')::date, nullif(trim(m ->> 'direccion'), ''), coalesce(m ->> 'novedades', 'false') = 'true', 'Web');
  end if;
end $$;

-- Al crearse el usuario: su perfil (con la aceptación de los términos) y, si vino con invitación, se usa y se le da el rol
create or replace function public._nuevo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'); v_nombre text := coalesce(nullif(m ->> 'nombre', ''), split_part(new.email, '@', 1)); v_inv invitaciones_cuenta;
begin
  insert into perfiles (id, rol, nombre, terminos_aceptados_en)
  values (new.id, 'cliente', v_nombre, case when m ->> 'terminos' = 'true' then now() end) on conflict (id) do nothing;
  select * into v_inv from invitaciones_cuenta
   where token = m ->> 'invitacion' and lower(email) = lower(new.email) and usada_en is null and vence_en > now();
  if found then
    update invitaciones_cuenta set usada_en = now(), usada_por = new.id where id = v_inv.id;
    if v_inv.rol_id is not null and exists (select 1 from roles where id = v_inv.rol_id and activo) then
      update perfiles set rol = 'staff', rol_id = v_inv.rol_id where id = new.id;
    end if;
  end if;
  if new.email_confirmed_at is not null then perform _vincular_cliente(new); end if;
  return new;
end $$;

revoke execute on function public._cuentas_normalizar, public._registro_error, public._antes_de_registrarse from public, anon, authenticated;
revoke execute on function public.crear_invitacion(text, bigint), public.anular_invitacion(bigint) from public, anon;
grant  execute on function public.crear_invitacion(text, bigint), public.anular_invitacion(bigint) to authenticated;
revoke execute on function public.validar_registro(text, jsonb), public.invitacion_info(text) from public;
grant  execute on function public.validar_registro(text, jsonb), public.invitacion_info(text) to anon, authenticated;

-- ── 4. Correo (SMTP) y plantillas ────────────────────────────────────
alter table public.integraciones
  add column smtp_host    text,
  add column smtp_puerto  int check (smtp_puerto in (25, 465, 587, 2465, 2525, 2587)),
  add column smtp_usuario text,
  add column smtp_clave   text,
  add column smtp_email   text check (smtp_email is null or smtp_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),   -- desde qué dirección salen
  add column smtp_nombre  text,                                                                             -- cómo figura quien manda (vacío = nombre de la tienda)
  add column correo_aplicado_en timestamptz,                                                                -- la última vez que se le pasó todo a Supabase
  add column correo_aplicado_error text;

create function public.guardar_correo(p_host text default null, p_puerto int default null, p_usuario text default null,
                                      p_clave text default null, p_email text default null, p_nombre text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not tiene_permiso('equipo.administrar') then raise exception 'Solo el administrador configura el correo'; end if;
  if nullif(trim(p_host), '') is not null and trim(p_host) !~ '^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$' then
    raise exception 'El servidor de correo (host) está mal escrito: algo como smtp.resend.com';
  end if;
  update integraciones set
    smtp_host = coalesce(nullif(trim(p_host), ''), smtp_host), smtp_puerto = coalesce(p_puerto, smtp_puerto),
    smtp_usuario = coalesce(nullif(trim(p_usuario), ''), smtp_usuario), smtp_clave = coalesce(nullif(trim(p_clave), ''), smtp_clave),
    smtp_email = coalesce(nullif(lower(trim(p_email)), ''), smtp_email), smtp_nombre = case when p_nombre is null then smtp_nombre else nullif(trim(p_nombre), '') end,
    actualizado_en = now(), actualizado_por = auth.uid()
   where unica;
end $$;

create function public.estado_correo() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare i integraciones; t configuracion_tienda;
begin
  if not tiene_permiso('equipo.administrar') then raise exception 'Solo el administrador configura el correo'; end if;
  select * into i from integraciones; select * into t from configuracion_tienda;
  return jsonb_build_object(
    'smtp', i.smtp_host is not null and i.smtp_puerto is not null and i.smtp_usuario is not null and i.smtp_clave is not null and i.smtp_email is not null,
    'host', i.smtp_host, 'puerto', i.smtp_puerto, 'usuario', i.smtp_usuario,
    'clave', case when i.smtp_clave is not null then '…' || right(i.smtp_clave, 4) end,
    'email', i.smtp_email, 'nombre', i.smtp_nombre, 'nombre_tienda', t.nombre,
    'conexion', i.supabase_token is not null and i.supabase_ref is not null,
    'aplicado_en', i.correo_aplicado_en, 'error', i.correo_aplicado_error);
end $$;

-- Texto de cada mail con el nombre de la tienda. {{ .SiteURL }} y {{ .TokenHash }} los completa Supabase al mandarlo.
create function public._correo_plantilla(p_tipo text, p_tienda text) returns jsonb
language plpgsql immutable set search_path = public as $$
declare
  v_n text := replace(replace(replace(replace(p_tienda, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;');
  v_ini text := upper(left(regexp_replace(p_tienda, '[^A-Za-z0-9]', '', 'g'), 2));
  v_tipo text; v_asunto text; v_titulo text; v_texto text; v_boton text; v_pie text; v_siguiente text := '';
begin
  case p_tipo
    when 'confirmacion' then v_tipo := 'signup'; v_asunto := 'Confirmá tu email - ' || p_tienda; v_titulo := 'Confirmá tu email';
      v_texto := '¡Hola! Gracias por crear tu cuenta en <b>' || v_n || '</b>. Tocá el botón para confirmar tu email y ya vas a poder hacer pedidos y seguirlos desde tu cuenta.';
      v_boton := 'Confirmar mi email'; v_pie := 'Si no creaste una cuenta en ' || v_n || ', ignorá este mail: sin confirmar, la cuenta no se activa.';
    when 'recuperar' then v_tipo := 'recovery'; v_asunto := 'Cambiá tu contraseña - ' || p_tienda; v_titulo := 'Cambiá tu contraseña'; v_siguiente := '&siguiente=/nueva-clave';
      v_texto := 'Pediste cambiar la contraseña de tu cuenta en <b>' || v_n || '</b>. Tocá el botón para elegir una nueva. El link vale por una hora.';
      v_boton := 'Elegir nueva contraseña'; v_pie := 'Si no lo pediste vos, ignorá este mail: tu contraseña sigue siendo la misma.';
    when 'cambio_email' then v_tipo := 'email_change'; v_asunto := 'Confirmá tu nuevo email - ' || p_tienda; v_titulo := 'Confirmá tu nuevo email';
      v_texto := 'Pediste cambiar el email de tu cuenta en <b>' || v_n || '</b>. Tocá el botón para confirmar el cambio.';
      v_boton := 'Confirmar el cambio'; v_pie := 'Si no lo pediste vos, ignorá este mail.';
    else v_tipo := 'invite'; v_asunto := 'Te invitaron a ' || p_tienda; v_titulo := 'Te invitaron'; v_siguiente := '&siguiente=/nueva-clave';
      v_texto := 'Te sumaron a <b>' || v_n || '</b>. Tocá el botón para aceptar la invitación y elegir tu contraseña.';
      v_boton := 'Aceptar la invitación'; v_pie := 'Si no esperabas este mail, ignorálo.';
  end case;
  return jsonb_build_object('asunto', v_asunto, 'html',
    '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' || v_titulo || '</title></head>'
    || '<body style="margin:0;padding:0;background:#f5f6f8;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Helvetica,Arial,sans-serif;color:#111827;">'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;padding:24px 12px;"><tr><td align="center">'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;">'
    || '<tr><td style="padding:28px 28px 8px 28px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr>'
    || '<td style="background:#1d4ed8;border-radius:10px;width:36px;height:36px;text-align:center;color:#ffffff;font-weight:700;font-size:16px;">' || v_ini || '</td>'
    || '<td style="padding-left:10px;font-size:18px;font-weight:700;color:#111827;">' || v_n || '</td></tr></table></td></tr>'
    || '<tr><td style="padding:16px 28px 0 28px;"><h1 style="margin:0 0 8px 0;font-size:22px;line-height:1.3;color:#111827;">' || v_titulo || '</h1>'
    || '<p style="margin:0 0 20px 0;font-size:15px;line-height:1.55;color:#374151;">' || v_texto || '</p></td></tr>'
    || '<tr><td style="padding:0 28px;"><a href="{{ .SiteURL }}/auth/confirmar?token_hash={{ .TokenHash }}&type=' || v_tipo || v_siguiente
    || '" style="display:block;background:#1d4ed8;color:#ffffff;text-decoration:none;text-align:center;font-weight:600;font-size:16px;padding:14px 20px;border-radius:10px;">' || v_boton || '</a></td></tr>'
    || '<tr><td style="padding:20px 28px 28px 28px;"><p style="margin:0 0 12px 0;font-size:13px;line-height:1.5;color:#6b7280;">' || v_pie || '</p>'
    || '<p style="margin:0;font-size:12px;line-height:1.5;color:#9ca3af;">Si el botón no funciona, copiá este link en el navegador:<br>'
    || '<span style="word-break:break-all;color:#6b7280;">{{ .SiteURL }}/auth/confirmar?token_hash={{ .TokenHash }}&amp;type=' || v_tipo || v_siguiente || '</span></p></td></tr>'
    || '</table><p style="margin:16px 0 0 0;font-size:12px;color:#9ca3af;">' || v_n || '</p></td></tr></table></body></html>');
end $$;

-- Pasarle a Supabase Auth todo junto: confirmación de email, reglas de contraseña, SMTP y plantillas.
-- Sin la conexión técnica (token de Supabase) no puede: avisa y la pantalla muestra qué cambiar a mano.
create function public.cuentas_aplicar() returns jsonb
language plpgsql security definer set search_path = public as $$
declare i integraciones; c configuracion_cuentas; t configuracion_tienda; r jsonb; v_cuerpo jsonb; v_carac text; v_msg text;
begin
  if not tiene_permiso('equipo.administrar') then raise exception 'Solo el administrador configura las cuentas'; end if;
  select * into i from integraciones; select * into c from configuracion_cuentas; select * into t from configuracion_tienda;
  if i.supabase_token is null or i.supabase_ref is null then
    return jsonb_build_object('aplicado', false, 'motivo', 'sin_conexion');
  end if;
  v_carac := case when c.clave_exige_numero or c.clave_exige_mayuscula then
      array_to_string(array_remove(array['abcdefghijklmnopqrstuvwxyz', case when c.clave_exige_mayuscula then 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' end,
                                         case when c.clave_exige_numero then '0123456789' end], null), ':') else '' end;
  v_cuerpo := jsonb_build_object(
    'mailer_autoconfirm', not c.confirmar_email,
    'password_min_length', c.clave_min,
    'password_required_characters', v_carac,
    'mailer_subjects_confirmation', _correo_plantilla('confirmacion', t.nombre) ->> 'asunto',
    'mailer_templates_confirmation_content', _correo_plantilla('confirmacion', t.nombre) ->> 'html',
    'mailer_subjects_recovery', _correo_plantilla('recuperar', t.nombre) ->> 'asunto',
    'mailer_templates_recovery_content', _correo_plantilla('recuperar', t.nombre) ->> 'html',
    'mailer_subjects_email_change', _correo_plantilla('cambio_email', t.nombre) ->> 'asunto',
    'mailer_templates_email_change_content', _correo_plantilla('cambio_email', t.nombre) ->> 'html',
    'mailer_subjects_invite', _correo_plantilla('invitacion', t.nombre) ->> 'asunto',
    'mailer_templates_invite_content', _correo_plantilla('invitacion', t.nombre) ->> 'html');
  if i.smtp_host is not null and i.smtp_puerto is not null and i.smtp_usuario is not null and i.smtp_clave is not null and i.smtp_email is not null then
    v_cuerpo := v_cuerpo || jsonb_build_object('smtp_host', i.smtp_host, 'smtp_port', i.smtp_puerto::text, 'smtp_user', i.smtp_usuario,
      'smtp_pass', i.smtp_clave, 'smtp_admin_email', i.smtp_email, 'smtp_sender_name', coalesce(i.smtp_nombre, t.nombre), 'smtp_max_frequency', 30);
  end if;
  r := _pedir_http('PATCH', 'https://api.supabase.com/v1/projects/' || i.supabase_ref || '/config/auth',
         jsonb_build_object('Authorization', 'Bearer ' || i.supabase_token), 'application/json', v_cuerpo::text);
  if (r ->> 'status')::int not between 200 and 299 then
    v_msg := 'Supabase no aceptó los cambios (' || (r ->> 'status') || '): ' || left(coalesce(r -> 'cuerpo' ->> 'message', r ->> 'cuerpo', ''), 200);
    update integraciones set correo_aplicado_error = v_msg where unica;
    raise exception '%', v_msg;
  end if;
  update integraciones set correo_aplicado_en = now(), correo_aplicado_error = null where unica;
  return jsonb_build_object('aplicado', true, 'smtp', i.smtp_host is not null);
end $$;

revoke execute on function public._correo_plantilla(text, text) from public, anon, authenticated;
revoke execute on function public.guardar_correo(text, int, text, text, text, text), public.estado_correo(), public.cuentas_aplicar() from public, anon;
grant  execute on function public.guardar_correo(text, int, text, text, text, text), public.estado_correo(), public.cuentas_aplicar() to authenticated;
