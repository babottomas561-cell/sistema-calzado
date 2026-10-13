-- ARCA, fase 1: datos fiscales, certificado, acceso (WSAA), estado del servicio y puntos de venta. Todavía NO factura (eso es la fase 2).
-- Diseño completo: docs/ARCA.md. Es un módulo opcional: hasta que el dueño lo configura, nada cambia.
--
--   · La llave privada va en el Vault de Supabase (cifrada con una clave que Supabase guarda fuera de la base): una copia de la base sola no
--     alcanza para usarla. `integraciones` guarda solo el id del secreto, los certificados y el acceso vigente (nadie lee esa tabla, regla 16).
--   · Postgres no firma con RSA ni puede conectarse a ARCA (sus servidores usan una seguridad vieja —claves DH cortas— que la extensión http
--     rechaza: «dh key too small»). La base le pide ambas cosas a la ruta /api/arca/firma de la app (firmador y pasarela, sin secretos) por
--     `_pedir_http`. La base sigue decidiendo todo: qué se pide, numeración, reintentos y qué se guarda.
--   · ARCA no da un acceso nuevo mientras haya uno vigente (12 h): el que llega se guarda enseguida y las funciones que lo piden NO lanzan errores
--     después de guardarlo (si la transacción se deshiciera, se perdería y habría que esperar a que venza).

-- ── Datos fiscales del comercio (una sola fuente: datos_legales) ─────────
alter table public.datos_legales
  add column ingresos_brutos    text check (char_length(ingresos_brutos) <= 40),
  add column inicio_actividades date;
-- (condicion_iva ya es de una lista: Responsable Inscripto, Monotributo, IVA Exento)

-- CUIT con su dígito verificador (pesos 5 4 3 2 7 6 5 4 3 2), el mismo criterio que lib/arca/firma.ts
create function public._cuit_valido(p_cuit text) returns boolean
language plpgsql immutable set search_path = public as $$
declare c text := regexp_replace(coalesce(p_cuit, ''), '\D', '', 'g'); v_suma int := 0; v_pesos int[] := array[5,4,3,2,7,6,5,4,3,2]; v_dv int; i int;
begin
  if c !~ '^\d{11}$' then return false; end if;
  for i in 1..10 loop v_suma := v_suma + substr(c, i, 1)::int * v_pesos[i]; end loop;
  v_dv := 11 - v_suma % 11;
  return (case v_dv when 11 then 0 when 10 then 9 else v_dv end) = substr(c, 11, 1)::int;
end $$;

-- ── Configuración fiscal (una fila; la lee el equipo, sin secretos) ───────
create table public.configuracion_fiscal (
  unica                 boolean primary key default true check (unica),
  activa                boolean not null default false,                       -- se prende en la fase 2, cuando ya factura
  ambiente              text not null default 'homologacion' check (ambiente in ('homologacion', 'produccion')),
  alicuota_por_defecto  numeric(4,2) not null default 21 check (alicuota_por_defecto in (0, 2.5, 5, 10.5, 21, 27)),
  modo                  text not null default 'elegir' check (modo in ('todas', 'elegir')),            -- CC1 siempre, o elegir CC1/CC2
  serie_por_defecto     text not null default 'fiscal' check (serie_por_defecto in ('fiscal', 'interna')),
  pedidos_al_cobrar     text not null default 'ofrecer' check (pedidos_al_cobrar in ('no', 'ofrecer', 'siempre')),
  umbral_identificacion numeric(14,2) not null default 10000000 check (umbral_identificacion > 0),
  iva_contenido_en_c    text not null default 'leyenda' check (iva_contenido_en_c in ('leyenda', 'cero')),
  actualizado_en        timestamptz not null default now(),
  actualizado_por       uuid references auth.users (id) on delete set null
);
create index configuracion_fiscal_actualizado_por_idx on public.configuracion_fiscal (actualizado_por);
insert into public.configuracion_fiscal (unica) values (true);
alter table public.configuracion_fiscal enable row level security;
create policy "el equipo ve la configuracion fiscal" on public.configuracion_fiscal for select to authenticated using (es_staff());

-- ── Puntos de venta de ARCA que usa el sistema ──────────────────────────
-- Se crean en la página de ARCA (no hay servicio para crearlos desde otro sistema); acá se traen los habilitados para web services.
create table public.puntos_venta_fiscales (
  id            bigint generated always as identity primary key,
  ambiente      text not null check (ambiente in ('homologacion', 'produccion')),
  numero        int not null check (numero between 1 and 99999),
  nombre        text check (char_length(nombre) <= 60),
  activo        boolean not null default true,
  por_defecto   boolean not null default false,
  emisor        text not null default 'web_service' check (emisor in ('web_service', 'controlador_fiscal')),
  tipo_arca     text,                    -- cómo lo informa ARCA (por ejemplo «CAE - RECE»)
  bloqueado     boolean not null default false,
  baja          date,
  verificado_en timestamptz,
  unique (ambiente, numero)
);
create unique index puntos_venta_fiscales_defecto_key on public.puntos_venta_fiscales (ambiente) where por_defecto;
alter table public.puntos_venta_fiscales enable row level security;
create policy "el equipo ve los puntos de venta" on public.puntos_venta_fiscales for select to authenticated using (es_staff());

-- ── Secretos y acceso (integraciones: nadie la lee) ─────────────────────
alter table public.integraciones
  add column arca_clave_vault_id        uuid,          -- la llave en uso (en el Vault)
  add column arca_clave_nueva_vault_id  uuid,          -- la del último pedido de certificado, hasta que llegue su certificado
  add column arca_csr                   text,          -- el último pedido de certificado (no es secreto: es para subir a ARCA)
  add column arca_cert_homologacion     text,
  add column arca_cert_homologacion_vence timestamptz,
  add column arca_cert_produccion       text,
  add column arca_cert_produccion_vence timestamptz,
  add column arca_token                 text,
  add column arca_sign                  text,
  add column arca_token_vence           timestamptz,
  add column arca_token_ambiente        text,
  add column arca_ultimo_error          text,
  add column arca_probado_en            timestamptz;

-- ── Bitácora de llamadas a ARCA (sin el acceso ni la llave) ─────────────
create table public.arca_llamadas (
  id         bigint generated always as identity primary key,
  servicio   text not null,              -- wsaa, wsfe, firma
  metodo     text not null,
  ambiente   text not null,
  status     int,
  ms         int,
  ok         boolean not null,
  detalle    text,                       -- el error, o un resumen de la respuesta
  creado_en  timestamptz not null default now()
);
create index arca_llamadas_creado_en_idx on public.arca_llamadas (creado_en desc);
alter table public.arca_llamadas enable row level security;
create policy "el administrador ve las llamadas a arca" on public.arca_llamadas for select to authenticated using (tiene_permiso('equipo.administrar'));
select cron.schedule('arca-limpiar-bitacora', '40 4 * * *', $$delete from public.arca_llamadas where creado_en < now() - interval '180 days'$$);

-- ── Ayudas internas ─────────────────────────────────────────────────────
-- _pedir_http corta a los 15 s; ARCA a veces tarda más (sobre todo el acceso, en pruebas). Quien necesite más margen lo pide para su transacción
-- con app.http_timeout_ms (misma firma de siempre: las pruebas la siguen pudiendo reemplazar).
create or replace function public._pedir_http(p_metodo text, p_url text, p_cabeceras jsonb default '{}', p_tipo text default null, p_cuerpo text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r extensions.http_response; v_cab extensions.http_header[] := '{}'; k text; v text;
begin
  for k, v in select * from jsonb_each_text(coalesce(p_cabeceras, '{}')) loop v_cab := v_cab || extensions.http_header(k, v); end loop;
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', coalesce(nullif(current_setting('app.http_timeout_ms', true), ''), '15000'));
  r := extensions.http((p_metodo, p_url, v_cab, p_tipo, p_cuerpo)::extensions.http_request);
  return jsonb_build_object('status', r.status,
    'cuerpo', case when r.content ~ '^\s*[\[{]' then r.content::jsonb else to_jsonb(r.content) end,
    'cabeceras', (select coalesce(jsonb_object_agg(lower(h.field), h.value), '{}') from unnest(r.headers) h));
end $$;
revoke execute on function public._pedir_http(text, text, jsonb, text, text) from public, anon, authenticated;
-- Las direcciones de ARCA según el ambiente (verificar en los manuales vigentes antes de producción)
create function public._arca_url(p_servicio text, p_ambiente text) returns text
language sql immutable set search_path = public as $$
  select case p_servicio
    when 'wsaa' then case p_ambiente when 'produccion' then 'https://wsaa.afip.gov.ar/ws/services/LoginCms' else 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms' end
    when 'wsfe' then case p_ambiente when 'produccion' then 'https://servicios1.afip.gov.ar/wsfev1/service.asmx' else 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx' end
  end
$$;

-- El texto del primer nodo que coincide (sin espacios de nombres) y sin los escapes de XML
create function public._xml_texto(p_xml text, p_nombre text) returns text
language plpgsql immutable set search_path = public as $$
declare v xml[]; t text;
begin
  begin
    v := xpath(format('//*[local-name()=%L]/text()', p_nombre), xmlparse(document regexp_replace(coalesce(p_xml, ''), '^\s*<\?xml[^>]*\?>', '')));
  exception when others then return null;
  end;
  if coalesce(array_length(v, 1), 0) = 0 then return null; end if;
  t := v[1]::text;
  return replace(replace(replace(replace(replace(t, '&lt;', '<'), '&gt;', '>'), '&quot;', '"'), '&apos;', ''''), '&amp;', '&');
end $$;

create function public._arca_anotar(p_servicio text, p_metodo text, p_ambiente text, p_status int, p_ms int, p_ok boolean, p_detalle text) returns void
language sql security definer set search_path = public as $$
  insert into arca_llamadas (servicio, metodo, ambiente, status, ms, ok, detalle) values (p_servicio, p_metodo, p_ambiente, p_status, p_ms, p_ok, left(p_detalle, 1000))
$$;

-- Pide algo a la ruta de la app (/api/arca/firma): generar, firmar, leer o enviar a ARCA. Devuelve el JSON o lanza el error en castellano.
create function public._arca_app(p_accion text, p_datos jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_sitio text := (select sitio_url from integraciones); r jsonb; v_t0 timestamptz := clock_timestamp(); v_ambiente text := (select ambiente from configuracion_fiscal);
begin
  if v_sitio is null then raise exception 'Falta la dirección del sitio en la instalación: sin ella la base no encuentra el firmador'; end if;
  perform set_config('app.http_timeout_ms', '40000', true);   -- la pasarela espera hasta 35 s a ARCA
  r := _pedir_http('POST', v_sitio || '/api/arca/firma', '{}'::jsonb, 'application/json', (p_datos || jsonb_build_object('accion', p_accion))::text);
  -- Los envíos a ARCA los anota quien los pide (wsaa, wsfe); acá solo lo de la firma
  if p_accion <> 'enviar' or (r ->> 'status')::int <> 200 then
    perform _arca_anotar('firma', p_accion, v_ambiente, (r ->> 'status')::int, extract(milliseconds from clock_timestamp() - v_t0)::int,
      (r ->> 'status')::int = 200, case when (r ->> 'status')::int <> 200 then coalesce(r -> 'cuerpo' ->> 'error', r ->> 'cuerpo') end);
  end if;
  if (r ->> 'status')::int <> 200 then
    raise exception 'La app no pudo hacerlo: %', coalesce(r -> 'cuerpo' ->> 'error', 'respondió ' || (r ->> 'status'));
  end if;
  return r -> 'cuerpo';
end $$;

-- Un mensaje SOAP a ARCA, por la pasarela de la app. Devuelve {status, cuerpo (texto), error}; status 0 = no hubo conexión.
create function public._arca_http(p_url text, p_soap_action text, p_xml text) returns jsonb
language sql security definer set search_path = public as $$
  select _arca_app('enviar', jsonb_build_object('url', p_url, 'soap_action', p_soap_action, 'xml', p_xml))
$$;

-- La llave privada en uso (o la nueva), leída del Vault
create function public._arca_clave(p_nueva boolean default false) returns text
language sql stable security definer set search_path = public as $$
  select decrypted_secret from vault.decrypted_secrets
   where id = (select case when p_nueva then arca_clave_nueva_vault_id else arca_clave_vault_id end from integraciones)
$$;

-- ── Para la pantalla (Integraciones → ARCA; solo el Administrador) ───────
create function public.guardar_datos_fiscales(p_cuit text, p_razon_social text, p_condicion_iva text, p_domicilio text,
  p_ingresos_brutos text default null, p_inicio_actividades date default null) returns void
language plpgsql security definer set search_path = public as $$
declare c text := regexp_replace(coalesce(p_cuit, ''), '\D', '', 'g');
begin
  if not tiene_permiso('equipo.administrar') then raise exception 'Solo el administrador configura la facturación'; end if;
  if not _cuit_valido(c) then raise exception 'El CUIT no es válido: revisá los 11 números (el último es el dígito verificador)'; end if;
  if coalesce(trim(p_razon_social), '') = '' then raise exception 'Falta la razón social'; end if;
  if p_condicion_iva not in ('Responsable Inscripto', 'Monotributo', 'IVA Exento') then raise exception 'Elegí la categoría frente al IVA'; end if;
  if coalesce(trim(p_domicilio), '') = '' then raise exception 'Falta el domicilio comercial'; end if;
  update datos_legales set cuit = substr(c, 1, 2) || '-' || substr(c, 3, 8) || '-' || substr(c, 11, 1), razon_social = trim(p_razon_social),
    condicion_iva = p_condicion_iva, domicilio_legal = trim(p_domicilio), ingresos_brutos = nullif(trim(p_ingresos_brutos), ''),
    inicio_actividades = p_inicio_actividades, actualizado_en = now(), actualizado_por = auth.uid()
   where unica;
end $$;

create function public.guardar_configuracion_fiscal(p_alicuota numeric, p_umbral numeric, p_iva_contenido_en_c text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tiene_permiso('equipo.administrar') then raise exception 'Solo el administrador configura la facturación'; end if;
  update configuracion_fiscal set alicuota_por_defecto = p_alicuota, umbral_identificacion = p_umbral, iva_contenido_en_c = p_iva_contenido_en_c,
    actualizado_en = now(), actualizado_por = auth.uid() where unica;
end $$;

-- Pruebas (homologación) o de verdad (producción). Al cambiar, el acceso anterior no sirve.
create function public.arca_cambiar_ambiente(p_ambiente text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tiene_permiso('equipo.administrar') then raise exception 'Solo el administrador configura la facturación'; end if;
  if p_ambiente not in ('homologacion', 'produccion') then raise exception 'Ambiente inválido'; end if;
  update configuracion_fiscal set ambiente = p_ambiente, actualizado_en = now(), actualizado_por = auth.uid() where unica;
end $$;

-- Genera la llave (queda en el Vault, como «nueva») y devuelve el pedido de certificado para subir a ARCA. La llave en uso no se toca
-- hasta que llegue el certificado de la nueva: así un clic por error no rompe una conexión que anda.
create function public.arca_generar_pedido_certificado(p_alias text default 'sistema') returns text
language plpgsql security definer set search_path = public as $$
declare l datos_legales; r jsonb; v_viejo uuid; v_id uuid;
begin
  if not tiene_permiso('equipo.administrar') then raise exception 'Solo el administrador configura la facturación'; end if;
  select * into l from datos_legales;
  if not _cuit_valido(l.cuit) or l.razon_social is null then raise exception 'Primero cargá el CUIT y la razón social (paso 1)'; end if;
  r := _arca_app('generar', jsonb_build_object('cuit', l.cuit, 'razon_social', l.razon_social, 'alias', coalesce(nullif(trim(p_alias), ''), 'sistema')));
  select arca_clave_nueva_vault_id into v_viejo from integraciones;
  if v_viejo is not null then delete from vault.secrets where id = v_viejo; end if;
  v_id := vault.create_secret(r ->> 'clave', 'arca_clave_' || gen_random_uuid(), 'Llave privada de ARCA (pedido de certificado)');
  update integraciones set arca_clave_nueva_vault_id = v_id, arca_csr = r ->> 'csr', actualizado_en = now(), actualizado_por = auth.uid() where unica;
  return r ->> 'csr';
end $$;

-- Guarda el certificado que dio ARCA para el ambiente actual: controla que sea de la llave nueva (o de la que está en uso) y del CUIT del local
create function public.arca_guardar_certificado(p_certificado text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare i integraciones; l datos_legales; v_ambiente text := (select ambiente from configuracion_fiscal); r jsonb; v_nueva boolean := false; v_pem text := trim(p_certificado);
begin
  if not tiene_permiso('equipo.administrar') then raise exception 'Solo el administrador configura la facturación'; end if;
  if v_pem !~ '-----BEGIN CERTIFICATE-----' then raise exception 'Eso no parece un certificado: tiene que empezar con -----BEGIN CERTIFICATE-----'; end if;
  select * into i from integraciones; select * into l from datos_legales;
  if i.arca_clave_nueva_vault_id is not null then
    r := _arca_app('leer', jsonb_build_object('certificado', v_pem, 'clave', _arca_clave(true)));
    v_nueva := (r ->> 'coincide')::boolean;
  end if;
  if not v_nueva then
    if i.arca_clave_vault_id is null then raise exception 'Primero generá el pedido de certificado (paso 2)'; end if;
    r := _arca_app('leer', jsonb_build_object('certificado', v_pem, 'clave', _arca_clave(false)));
    if not (r ->> 'coincide')::boolean then raise exception 'Ese certificado no corresponde al último pedido que generó el sistema: generá un pedido nuevo y subilo a ARCA'; end if;
  end if;
  if r ->> 'cuit' is distinct from regexp_replace(coalesce(l.cuit, ''), '\D', '', 'g') then
    raise exception 'El certificado es del CUIT % y el del local es %', r ->> 'cuit', l.cuit;
  end if;
  if (r ->> 'hasta')::timestamptz < now() then raise exception 'El certificado está vencido'; end if;
  if v_nueva then
    -- La llave nueva pasa a ser la de uso; la vieja se borra y los certificados que eran de ella ya no sirven
    if i.arca_clave_vault_id is not null then delete from vault.secrets where id = i.arca_clave_vault_id; end if;
    update integraciones set arca_clave_vault_id = arca_clave_nueva_vault_id, arca_clave_nueva_vault_id = null,
      arca_cert_homologacion = null, arca_cert_homologacion_vence = null, arca_cert_produccion = null, arca_cert_produccion_vence = null where unica;
  end if;
  if v_ambiente = 'produccion' then
    update integraciones set arca_cert_produccion = v_pem, arca_cert_produccion_vence = (r ->> 'hasta')::timestamptz where unica;
  else
    update integraciones set arca_cert_homologacion = v_pem, arca_cert_homologacion_vence = (r ->> 'hasta')::timestamptz where unica;
  end if;
  update integraciones set arca_token = null, arca_sign = null, arca_token_vence = null, arca_token_ambiente = null, arca_ultimo_error = null,
    actualizado_en = now(), actualizado_por = auth.uid() where unica;
  return jsonb_build_object('cuit', r ->> 'cuit', 'vence', r ->> 'hasta', 'emisor', r ->> 'emisor', 'ambiente_certificado', r ->> 'ambiente', 'ambiente', v_ambiente);
end $$;

-- ── El acceso a ARCA (WSAA) ─────────────────────────────────────────────
-- Devuelve {token, sign, cuit}. Usa el vigente; si no hay, firma un TRA y lo pide. Lo guarda ENSEGUIDA (ver el encabezado).
create function public._arca_acceso() returns jsonb
language plpgsql security definer set search_path = public as $$
declare i integraciones; v_ambiente text := (select ambiente from configuracion_fiscal); v_cert text; v_tra text; v_cms text; r jsonb; v_xml text;
        v_ret text; v_falla text; v_t0 timestamptz; v_ahora timestamptz := now(); v_cuit text := (select regexp_replace(cuit, '\D', '', 'g') from datos_legales);
begin
  select * into i from integraciones;
  if i.arca_token is not null and i.arca_token_ambiente = v_ambiente and i.arca_token_vence > v_ahora + interval '5 minutes' then
    return jsonb_build_object('token', i.arca_token, 'sign', i.arca_sign, 'cuit', v_cuit);
  end if;
  v_cert := case v_ambiente when 'produccion' then i.arca_cert_produccion else i.arca_cert_homologacion end;
  if v_cert is null then raise exception 'Falta el certificado de % (paso 3)', case v_ambiente when 'produccion' then 'producción' else 'pruebas' end; end if;
  if i.arca_clave_vault_id is null then raise exception 'Falta la llave: generá el pedido de certificado (paso 2)'; end if;
  v_tra := '<?xml version="1.0" encoding="UTF-8"?><loginTicketRequest version="1.0"><header><uniqueId>' || extract(epoch from v_ahora)::bigint
    || '</uniqueId><generationTime>' || to_char((v_ahora - interval '10 minutes') at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD"T"HH24:MI:SS') || '-03:00'
    || '</generationTime><expirationTime>' || to_char((v_ahora + interval '10 minutes') at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD"T"HH24:MI:SS') || '-03:00'
    || '</expirationTime></header><service>wsfe</service></loginTicketRequest>';
  v_cms := _arca_app('firmar', jsonb_build_object('clave', _arca_clave(false), 'certificado', v_cert, 'contenido', v_tra)) ->> 'firmado';
  v_t0 := clock_timestamp();
  r := _arca_http(_arca_url('wsaa', v_ambiente), '""',
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">'
    || '<soapenv:Header/><soapenv:Body><wsaa:loginCms><wsaa:in0>' || v_cms || '</wsaa:in0></wsaa:loginCms></soapenv:Body></soapenv:Envelope>');
  v_xml := r ->> 'cuerpo';
  v_ret := _xml_texto(v_xml, 'loginCmsReturn');
  if (r ->> 'status')::int <> 200 or v_ret is null then
    v_falla := coalesce(_xml_texto(v_xml, 'faultstring'), r ->> 'error', 'ARCA respondió ' || (r ->> 'status'));
    perform _arca_anotar('wsaa', 'loginCms', v_ambiente, (r ->> 'status')::int, extract(milliseconds from clock_timestamp() - v_t0)::int, false, v_falla);
    raise exception '%', case
      when v_falla ilike '%ya posee un TA valido%' or v_falla ilike '%alreadyAuthenticated%' then
        'ARCA ya dio un acceso que el sistema no tiene guardado: se puede volver a pedir cuando venza (en menos de 12 horas)'
      when v_falla ilike '%untrusted%' or v_falla ilike '%cert%invalid%' or v_falla ilike '%AC de confianza%' then 'ARCA no reconoce el certificado: ¿es del ambiente correcto (pruebas o producción)?'
      when v_falla ilike '%notAuthorized%' or v_falla ilike '%no autorizado%' then 'El certificado no está autorizado para Factura electrónica: en ARCA, asociale el servicio «wsfe» (ver el manual)'
      else 'ARCA no dio el acceso: ' || v_falla end;
  end if;
  update integraciones set arca_token = _xml_texto(v_ret, 'token'), arca_sign = _xml_texto(v_ret, 'sign'),
    arca_token_vence = _xml_texto(v_ret, 'expirationTime')::timestamptz, arca_token_ambiente = v_ambiente where unica;
  perform _arca_anotar('wsaa', 'loginCms', v_ambiente, 200, extract(milliseconds from clock_timestamp() - v_t0)::int, true, 'acceso hasta ' || _xml_texto(v_ret, 'expirationTime'));
  return jsonb_build_object('token', _xml_texto(v_ret, 'token'), 'sign', _xml_texto(v_ret, 'sign'), 'cuit', v_cuit);
end $$;

-- Un método de WSFEv1 (SOAP). p_cuerpo va dentro del método, después de Auth. Devuelve el XML de la respuesta.
create function public._arca_wsfe(p_metodo text, p_cuerpo text default '', p_con_acceso boolean default true) returns text
language plpgsql security definer set search_path = public as $$
declare v_ambiente text := (select ambiente from configuracion_fiscal); a jsonb; r jsonb; v_t0 timestamptz; v_auth text := ''; v_err text;
begin
  if p_con_acceso then
    a := _arca_acceso();
    v_auth := '<ar:Auth><ar:Token>' || _html(a ->> 'token') || '</ar:Token><ar:Sign>' || _html(a ->> 'sign') || '</ar:Sign><ar:Cuit>' || (a ->> 'cuit') || '</ar:Cuit></ar:Auth>';
  end if;
  v_t0 := clock_timestamp();
  r := _arca_http(_arca_url('wsfe', v_ambiente), '"http://ar.gov.afip.dif.FEV1/' || p_metodo || '"',
    '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/"><soap:Header/><soap:Body><ar:' || p_metodo || '>'
    || v_auth || coalesce(p_cuerpo, '') || '</ar:' || p_metodo || '></soap:Body></soap:Envelope>');
  v_err := case when (r ->> 'status')::int <> 200 then coalesce(_xml_texto(r ->> 'cuerpo', 'faultstring'), r ->> 'error', 'ARCA respondió ' || (r ->> 'status'))
                else (select _xml_texto(r ->> 'cuerpo', 'Code') || ' ' || _xml_texto(r ->> 'cuerpo', 'Msg') where _xml_texto(r ->> 'cuerpo', 'Err') is not null or _xml_texto(r ->> 'cuerpo', 'Msg') is not null) end;
  perform _arca_anotar('wsfe', p_metodo, v_ambiente, (r ->> 'status')::int, extract(milliseconds from clock_timestamp() - v_t0)::int, v_err is null, v_err);
  if (r ->> 'status')::int <> 200 then raise exception 'ARCA no respondió bien (%): %', p_metodo, v_err; end if;
  return r ->> 'cuerpo';
end $$;

-- Trae de ARCA los puntos de venta habilitados para web services del ambiente actual y los guarda (sin borrar los nombres que les pusiste)
create function public._arca_traer_puntos_venta() returns int
language plpgsql security definer set search_path = public as $$
declare v_ambiente text := (select ambiente from configuracion_fiscal); v_xml text; v_doc xml; n xml; v_cant int := 0;
begin
  v_xml := _arca_wsfe('FEParamGetPtosVenta');
  if _xml_texto(v_xml, 'Code') = '602' then return 0; end if;   -- «Sin resultados»: no hay puntos de venta para web services
  v_doc := xmlparse(document regexp_replace(v_xml, '^\s*<\?xml[^>]*\?>', ''));
  for n in select unnest(xpath('//*[local-name()="PtoVenta"]', v_doc)) loop
    insert into puntos_venta_fiscales (ambiente, numero, tipo_arca, bloqueado, baja, verificado_en)
    values (v_ambiente, _xml_texto(n::text, 'Nro')::int, _xml_texto(n::text, 'EmisionTipo'), _xml_texto(n::text, 'Bloqueado') = 'S',
            nullif(nullif(_xml_texto(n::text, 'FchBaja'), 'NULL'), '')::date, now())
    on conflict (ambiente, numero) do update set tipo_arca = excluded.tipo_arca, bloqueado = excluded.bloqueado, baja = excluded.baja, verificado_en = now();
    v_cant := v_cant + 1;
  end loop;
  -- Si es el primero, queda como el de siempre
  update puntos_venta_fiscales set por_defecto = true
   where id = (select id from puntos_venta_fiscales where ambiente = v_ambiente and activo and not bloqueado and baja is null order by numero limit 1)
     and not exists (select 1 from puntos_venta_fiscales where ambiente = v_ambiente and por_defecto);
  return v_cant;
end $$;

-- Probar la conexión, en tres pasos que la pantalla pide de a uno: cada uno es una transacción corta (el panel corta a los 8 segundos y lo que
-- se corta se deshace; así el acceso que da ARCA queda guardado apenas llega). Ninguno lanza errores: devuelven {ok, texto}.
create function public.arca_probar_servicio() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_xml text; v_ok boolean;
begin
  if not tiene_permiso('equipo.administrar') then raise exception 'Solo el administrador configura la facturación'; end if;
  begin
    v_xml := _arca_wsfe('FEDummy', '', false);
    v_ok := _xml_texto(v_xml, 'AppServer') = 'OK' and _xml_texto(v_xml, 'DbServer') = 'OK' and _xml_texto(v_xml, 'AuthServer') = 'OK';
    return jsonb_build_object('paso', 'servicio', 'ok', v_ok, 'texto', case when v_ok then 'ARCA responde' else 'ARCA responde, pero con problemas: probá más tarde' end);
  exception when others then
    return jsonb_build_object('paso', 'servicio', 'ok', false, 'texto', 'No se pudo hablar con ARCA: ' || sqlerrm);
  end;
end $$;

create function public.arca_probar_acceso() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_error text;
begin
  if not tiene_permiso('equipo.administrar') then raise exception 'Solo el administrador configura la facturación'; end if;
  begin
    perform _arca_acceso();
  exception when others then v_error := sqlerrm;
  end;
  -- Fuera del bloque: lo que se anota acá no se deshace con el error
  if v_error is not null then
    perform _arca_anotar('wsaa', 'loginCms', (select ambiente from configuracion_fiscal), null, null, false, v_error);
  end if;
  update integraciones set arca_ultimo_error = v_error, arca_probado_en = now() where unica;
  return jsonb_build_object('paso', 'acceso', 'ok', v_error is null, 'texto', coalesce(v_error, 'El certificado anda: ARCA dio el acceso'));
end $$;

create function public.arca_probar_puntos_venta() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_cant int; v_error text;
begin
  if not tiene_permiso('equipo.administrar') then raise exception 'Solo el administrador configura la facturación'; end if;
  begin
    v_cant := _arca_traer_puntos_venta();
  exception when others then v_error := sqlerrm;
  end;
  if v_error is not null then
    update integraciones set arca_ultimo_error = v_error where unica;
    return jsonb_build_object('paso', 'puntos_venta', 'ok', false, 'texto', v_error);
  end if;
  return jsonb_build_object('paso', 'puntos_venta', 'ok', v_cant > 0, 'texto', case when v_cant > 0
    then v_cant || case when v_cant = 1 then ' punto de venta habilitado' else ' puntos de venta habilitados' end
    else 'ARCA no lista puntos de venta para web services: en producción creá uno (ver el manual); en pruebas agregá uno a mano' end);
end $$;

create function public.arca_guardar_punto_venta(p_id bigint, p_nombre text, p_activo boolean, p_por_defecto boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v puntos_venta_fiscales;
begin
  if not tiene_permiso('equipo.administrar') then raise exception 'Solo el administrador configura la facturación'; end if;
  select * into v from puntos_venta_fiscales where id = p_id;
  if not found then raise exception 'Ese punto de venta no existe'; end if;
  if p_por_defecto and (not p_activo or v.bloqueado or v.baja is not null) then raise exception 'El de siempre tiene que estar activo y habilitado en ARCA'; end if;
  if p_por_defecto then update puntos_venta_fiscales set por_defecto = false where ambiente = v.ambiente and por_defecto and id <> p_id; end if;
  update puntos_venta_fiscales set nombre = nullif(trim(p_nombre), ''), activo = p_activo, por_defecto = p_por_defecto and p_activo where id = p_id;
end $$;

-- En pruebas, ARCA suele no listar puntos de venta (y acepta cualquier número): se puede agregar uno a mano. En producción, solo los de ARCA.
create function public.arca_agregar_punto_venta_prueba(p_numero int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tiene_permiso('equipo.administrar') then raise exception 'Solo el administrador configura la facturación'; end if;
  if (select ambiente from configuracion_fiscal) <> 'homologacion' then raise exception 'En producción se usan los puntos de venta que da ARCA: probá la conexión para traerlos'; end if;
  if p_numero not between 1 and 99999 then raise exception 'El punto de venta va del 1 al 99999'; end if;
  insert into puntos_venta_fiscales (ambiente, numero, nombre, tipo_arca, por_defecto)
  values ('homologacion', p_numero, 'Pruebas', 'Agregado a mano (pruebas)', not exists (select 1 from puntos_venta_fiscales where ambiente = 'homologacion' and por_defecto))
  on conflict (ambiente, numero) do nothing;
end $$;

-- Qué está listo y qué falta, sin secretos
create function public.arca_estado() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare i integraciones; l datos_legales; c configuracion_fiscal; v_cert_vence timestamptz;
begin
  if not tiene_permiso('equipo.administrar') then raise exception 'Solo el administrador configura la facturación'; end if;
  select * into i from integraciones; select * into l from datos_legales; select * into c from configuracion_fiscal;
  v_cert_vence := case c.ambiente when 'produccion' then i.arca_cert_produccion_vence else i.arca_cert_homologacion_vence end;
  return jsonb_build_object(
    'ambiente', c.ambiente, 'activa', c.activa,
    'datos', jsonb_build_object('cuit', l.cuit, 'cuit_valido', _cuit_valido(l.cuit), 'razon_social', l.razon_social, 'condicion_iva', l.condicion_iva,
      'domicilio', l.domicilio_legal, 'ingresos_brutos', l.ingresos_brutos, 'inicio_actividades', l.inicio_actividades),
    'configuracion', jsonb_build_object('alicuota_por_defecto', c.alicuota_por_defecto, 'umbral_identificacion', c.umbral_identificacion, 'iva_contenido_en_c', c.iva_contenido_en_c),
    'sitio', i.sitio_url is not null,
    'llave', i.arca_clave_vault_id is not null, 'pedido_pendiente', i.arca_clave_nueva_vault_id is not null, 'csr', case when i.arca_clave_nueva_vault_id is not null then i.arca_csr end,
    'certificado', jsonb_build_object('homologacion', i.arca_cert_homologacion_vence, 'produccion', i.arca_cert_produccion_vence),
    'certificado_vence', v_cert_vence,
    'acceso_vigente', i.arca_token is not null and i.arca_token_ambiente = c.ambiente and i.arca_token_vence > now(),
    'acceso_vence', case when i.arca_token_ambiente = c.ambiente then i.arca_token_vence end,
    'ultimo_error', i.arca_ultimo_error, 'probado_en', i.arca_probado_en);
end $$;

-- ── Tiempo: ARCA puede tardar más que los 8 segundos que la API le da a cada pedido del panel ──
-- La API (PostgREST) aplica la configuración propia de cada función antes de llamarla: solo estas tienen más margen.
alter function public.arca_probar_servicio() set statement_timeout = '30s';
alter function public.arca_probar_acceso() set statement_timeout = '45s';
alter function public.arca_probar_puntos_venta() set statement_timeout = '45s';
alter function public.arca_generar_pedido_certificado(text) set statement_timeout = '30s';
alter function public.arca_guardar_certificado(text) set statement_timeout = '30s';

-- ── Permisos de ejecución ───────────────────────────────────────────────
revoke execute on function public._cuit_valido(text), public._arca_url(text, text), public._xml_texto(text, text),
  public._arca_anotar(text, text, text, int, int, boolean, text), public._arca_app(text, jsonb), public._arca_http(text, text, text), public._arca_clave(boolean),
  public._arca_acceso(), public._arca_wsfe(text, text, boolean), public._arca_traer_puntos_venta() from public, anon, authenticated;
revoke execute on function public.guardar_datos_fiscales(text, text, text, text, text, date), public.guardar_configuracion_fiscal(numeric, numeric, text),
  public.arca_cambiar_ambiente(text), public.arca_generar_pedido_certificado(text), public.arca_guardar_certificado(text), public.arca_probar_servicio(), public.arca_probar_acceso(), public.arca_probar_puntos_venta(),
  public.arca_guardar_punto_venta(bigint, text, boolean, boolean), public.arca_estado(), public.arca_agregar_punto_venta_prueba(int) from public, anon;
grant execute on function public.guardar_datos_fiscales(text, text, text, text, text, date), public.guardar_configuracion_fiscal(numeric, numeric, text),
  public.arca_cambiar_ambiente(text), public.arca_generar_pedido_certificado(text), public.arca_guardar_certificado(text), public.arca_probar_servicio(), public.arca_probar_acceso(), public.arca_probar_puntos_venta(),
  public.arca_guardar_punto_venta(bigint, text, boolean, boolean), public.arca_estado(), public.arca_agregar_punto_venta_prueba(int) to authenticated;
