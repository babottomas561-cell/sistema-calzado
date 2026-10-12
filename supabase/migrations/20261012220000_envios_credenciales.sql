-- Credenciales de Uber Direct y Andreani, cargadas desde Integraciones → Envíos (como las de Meta y Mercado Pago:
-- en `integraciones`, que nadie lee). Cada una tiene su prueba de conexión, que hace la base:
--   · Uber Direct: pide un token OAuth (client credentials, scope eats.deliveries) con el Client ID y el secreto.
--   · Andreani: inicia sesión en su API con usuario y contraseña (Basic) y espera el token.
-- Con las credenciales cargadas y probadas, el paso siguiente (pedir el envío solo) se suma sin tocar esta pantalla.

alter table public.integraciones
  add column uber_customer_id    text,
  add column uber_client_id      text,
  add column uber_client_secret  text,
  add column uber_prueba         jsonb,
  add column andreani_usuario    text,
  add column andreani_clave      text,
  add column andreani_cliente    text,     -- código de cliente
  add column andreani_contrato   text,     -- n.º de contrato (domicilio o sucursal)
  add column andreani_prueba     jsonb;

-- Pedir algo a un servicio de afuera (interna; en las pruebas se reemplaza por respuestas preparadas)
create function public._pedir_http(p_metodo text, p_url text, p_cabeceras jsonb default '{}', p_tipo text default null, p_cuerpo text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r extensions.http_response; v_cab extensions.http_header[] := '{}'; k text; v text;
begin
  for k, v in select * from jsonb_each_text(coalesce(p_cabeceras, '{}')) loop v_cab := v_cab || extensions.http_header(k, v); end loop;
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '15000');
  r := extensions.http((p_metodo, p_url, v_cab, p_tipo, p_cuerpo)::extensions.http_request);
  return jsonb_build_object('status', r.status,
    'cuerpo', case when r.content ~ '^\s*[\[{]' then r.content::jsonb else to_jsonb(r.content) end,
    'cabeceras', (select coalesce(jsonb_object_agg(lower(h.field), h.value), '{}') from unnest(r.headers) h));
end $$;
revoke execute on function public._pedir_http(text, text, jsonb, text, text) from public, anon, authenticated;

create function public.guardar_envios_credenciales(
  p_uber_customer_id text default null, p_uber_client_id text default null, p_uber_client_secret text default null,
  p_andreani_usuario text default null, p_andreani_clave text default null, p_andreani_cliente text default null,
  p_andreani_contrato text default null, p_quitar text[] default '{}')
returns void language plpgsql security definer set search_path = public as $$
begin
  if not tiene_permiso('tienda.editar') then raise exception 'No tenés permiso para configurar las conexiones'; end if;
  update integraciones set
    uber_customer_id   = case when 'uber' = any (p_quitar) then null else coalesce(nullif(trim(p_uber_customer_id), ''), uber_customer_id) end,
    uber_client_id     = case when 'uber' = any (p_quitar) then null else coalesce(nullif(trim(p_uber_client_id), ''), uber_client_id) end,
    uber_client_secret = case when 'uber' = any (p_quitar) then null else coalesce(nullif(trim(p_uber_client_secret), ''), uber_client_secret) end,
    uber_prueba        = case when 'uber' = any (p_quitar) or nullif(trim(p_uber_client_secret), '') is not null then null else uber_prueba end,
    andreani_usuario   = case when 'andreani' = any (p_quitar) then null else coalesce(nullif(trim(p_andreani_usuario), ''), andreani_usuario) end,
    andreani_clave     = case when 'andreani' = any (p_quitar) then null else coalesce(nullif(trim(p_andreani_clave), ''), andreani_clave) end,
    andreani_cliente   = case when 'andreani' = any (p_quitar) then null else coalesce(nullif(trim(p_andreani_cliente), ''), andreani_cliente) end,
    andreani_contrato  = case when 'andreani' = any (p_quitar) then null else coalesce(nullif(trim(p_andreani_contrato), ''), andreani_contrato) end,
    andreani_prueba    = case when 'andreani' = any (p_quitar) or nullif(trim(p_andreani_clave), '') is not null then null else andreani_prueba end,
    actualizado_en = now(), actualizado_por = auth.uid()
   where unica;
end $$;

-- Qué está cargado (sin mostrar los secretos)
create function public.estado_envios() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare i integraciones;
begin
  if not tiene_permiso('tienda.editar') then raise exception 'No tenés permiso para ver las conexiones'; end if;
  select * into i from integraciones;
  return jsonb_build_object(
    'uber', jsonb_build_object('customer_id', i.uber_customer_id, 'client_id', i.uber_client_id,
              'secreto', case when i.uber_client_secret is not null then '…' || right(i.uber_client_secret, 4) end,
              'completo', i.uber_customer_id is not null and i.uber_client_id is not null and i.uber_client_secret is not null,
              'prueba', i.uber_prueba),
    'andreani', jsonb_build_object('usuario', i.andreani_usuario, 'cliente', i.andreani_cliente, 'contrato', i.andreani_contrato,
              'clave', case when i.andreani_clave is not null then '…' || right(i.andreani_clave, 2) end,
              'completo', i.andreani_usuario is not null and i.andreani_clave is not null and i.andreani_cliente is not null,
              'prueba', i.andreani_prueba));
end $$;

create function public.probar_uber() returns jsonb
language plpgsql security definer set search_path = public as $$
declare i integraciones; r jsonb; v jsonb;
begin
  if not tiene_permiso('tienda.editar') then raise exception 'No tenés permiso para configurar las conexiones'; end if;
  select * into i from integraciones;
  if i.uber_client_id is null or i.uber_client_secret is null then raise exception 'Primero cargá el Client ID y el Client Secret de Uber Direct'; end if;
  r := _pedir_http('POST', 'https://auth.uber.com/oauth/v2/token', '{}', 'application/x-www-form-urlencoded',
         'client_id=' || i.uber_client_id || '&client_secret=' || i.uber_client_secret || '&grant_type=client_credentials&scope=eats.deliveries');
  v := case when (r ->> 'status')::int = 200 and r -> 'cuerpo' ? 'access_token' then jsonb_build_object('ok', true, 'fecha', now())
            else jsonb_build_object('ok', false, 'fecha', now(), 'error',
              case when (r ->> 'status')::int in (400, 401) then 'Uber no reconoce esas credenciales (revisá el Client ID y el Client Secret en direct.uber.com → Developer)'
                   else coalesce(r -> 'cuerpo' ->> 'error_description', r -> 'cuerpo' ->> 'error', 'Uber contestó ' || (r ->> 'status')) end) end;
  update integraciones set uber_prueba = v where unica;
  return v;
end $$;

create function public.probar_andreani() returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare i integraciones; r jsonb; v jsonb;
begin
  if not tiene_permiso('tienda.editar') then raise exception 'No tenés permiso para configurar las conexiones'; end if;
  select * into i from integraciones;
  if i.andreani_usuario is null or i.andreani_clave is null then raise exception 'Primero cargá el usuario y la contraseña de la API de Andreani'; end if;
  r := _pedir_http('GET', 'https://apis.andreani.com/login',
         jsonb_build_object('Authorization', 'Basic ' || encode(convert_to(i.andreani_usuario || ':' || i.andreani_clave, 'UTF8'), 'base64')));
  v := case when (r ->> 'status')::int = 200 and (r -> 'cabeceras' ? 'x-authorization-token' or r -> 'cuerpo' ? 'token')
              then jsonb_build_object('ok', true, 'fecha', now())
            else jsonb_build_object('ok', false, 'fecha', now(), 'error',
              case when (r ->> 'status')::int in (401, 403) then 'Andreani no reconoce ese usuario y contraseña (son los de la API, que da tu ejecutivo de cuenta)'
                   else 'Andreani contestó ' || (r ->> 'status') end) end;
  update integraciones set andreani_prueba = v where unica;
  return v;
end $$;

revoke execute on function public.guardar_envios_credenciales(text, text, text, text, text, text, text, text[]), public.estado_envios(),
  public.probar_uber(), public.probar_andreani() from public, anon;
grant execute on function public.guardar_envios_credenciales(text, text, text, text, text, text, text, text[]), public.estado_envios(),
  public.probar_uber(), public.probar_andreani() to authenticated;
