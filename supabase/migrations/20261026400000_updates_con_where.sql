-- Supabase en la nube exige un WHERE en todo UPDATE (la base local no): estas funciones actualizaban la fila única de configuración sin WHERE y fallaban en producción
-- («UPDATE requires a WHERE clause»). Mismas funciones, solo se agrega `where unica` (o el filtro que corresponde).

CREATE OR REPLACE FUNCTION public.configurar_listas_precios(p_activas boolean, p_mostrador bigint, p_tienda bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not tiene_permiso('precios.editar') then raise exception 'No tenés permiso para cambiar precios de venta'; end if;
  if p_mostrador is not null and not exists (select 1 from listas_precios where id = p_mostrador and activa) then raise exception 'La lista del mostrador no existe o está apagada'; end if;
  if p_tienda is not null and not exists (select 1 from listas_precios where id = p_tienda and activa) then raise exception 'La lista de la tienda no existe o está apagada'; end if;
  update configuracion_tienda set listas_precios_activas = coalesce(p_activas, false), lista_mostrador_id = p_mostrador, lista_tienda_id = p_tienda where unica;
end $function$;

CREATE OR REPLACE FUNCTION public.guardar_confirmacion_pagos(p_transferencia text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (tiene_permiso('tablas.medios_pago') or tiene_permiso('tablas.editar')) then raise exception 'No tenés permiso para cambiar los medios de pago'; end if;
  if p_transferencia not in ('no', 'referencia', 'adjunto') then raise exception 'Elegí una de las tres opciones'; end if;
  update configuracion_tienda set transferencia_comprobante = p_transferencia where unica;
end $function$;

CREATE OR REPLACE FUNCTION public.guardar_espera_pago(p_activa boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not tiene_permiso('tienda.editar') then raise exception 'No tenés permiso para configurar las conexiones'; end if;
  update configuracion_tienda set cobro_espera_pago = coalesce(p_activa, true) where unica;
end $function$;

CREATE OR REPLACE FUNCTION public.guardar_mp_point(p_access_token text DEFAULT NULL::text, p_webhook_secret text DEFAULT NULL::text, p_quitar text[] DEFAULT '{}'::text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not tiene_permiso('tienda.editar') then raise exception 'No tenés permiso para configurar las conexiones'; end if;
  if nullif(trim(p_access_token), '') is not null and trim(p_access_token) !~ '^(APP_USR|TEST)-[A-Za-z0-9-]{20,}$' then
    raise exception 'El Access Token de Mercado Pago empieza con APP_USR- (o TEST-): copialo entero desde Tus integraciones → Credenciales';
  end if;
  update integraciones set
    mp_point_token   = case when 'point_token' = any (p_quitar) then null else coalesce(nullif(trim(p_access_token), ''), mp_point_token) end,
    mp_point_secreto = case when 'point_secreto' = any (p_quitar) then null else coalesce(nullif(trim(p_webhook_secret), ''), mp_point_secreto) end,
    mp_point_cuenta  = case when nullif(trim(p_access_token), '') is not null or 'point_token' = any (p_quitar) then null else mp_point_cuenta end,
    actualizado_en = now(), actualizado_por = auth.uid()
   where unica;
  if 'point_token' = any (p_quitar) then
    update configuracion_tienda set tarjetas_modo = 'libre' where unica;
    update point_terminales set por_defecto = false where por_defecto;
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.guardar_tarjetas_modo(p_modo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (tiene_permiso('tablas.medios_pago') or tiene_permiso('tablas.editar')) then raise exception 'No tenés permiso para cambiar los medios de pago'; end if;
  if p_modo not in ('libre', 'vinculado') then raise exception 'Elegí una de las dos opciones'; end if;
  if p_modo = 'vinculado' and not (select coalesce(mp_point_token, mp_access_token) is not null and coalesce(mp_point_secreto, mp_webhook_secret) is not null from integraciones) then
    raise exception 'Primero vinculá el posnet: falta cargar el Access Token y la clave secreta de Mercado Pago Point (Integraciones → Mercado Pago)';
  end if;
  if p_modo = 'vinculado' and not exists (select 1 from point_terminales where por_defecto and activa) then
    raise exception 'Primero elegí el posnet que se usa en la caja (Integraciones → Mercado Pago → Posnet)';
  end if;
  update configuracion_tienda set tarjetas_modo = p_modo where unica;
end $function$;

CREATE OR REPLACE FUNCTION public.qr_preparar(p_calle text, p_numero text, p_ciudad text, p_provincia text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '40s'
AS $function$
declare r jsonb; v_user text; v_sucursal text; v_caja jsonb;
begin
  if not tiene_permiso('tienda.editar') then raise exception 'No tenés permiso para configurar las conexiones'; end if;
  if coalesce(trim(p_calle), '') = '' or coalesce(trim(p_numero), '') = '' or coalesce(trim(p_ciudad), '') = '' or coalesce(trim(p_provincia), '') = '' then
    raise exception 'Completá calle, número, ciudad y provincia del local';
  end if;
  if (select mp_qr_externo is not null from integraciones) then return jsonb_build_object('ok', true, 'ya', true); end if;
  r := _mp_point_pedir('GET', '/users/me');
  if (r ->> 'status')::int in (401, 403) then return jsonb_build_object('ok', false, 'error', 'Mercado Pago no reconoce el Access Token'); end if;
  v_user := r -> 'cuerpo' ->> 'id';
  if v_user is null then return jsonb_build_object('ok', false, 'error', 'No se pudo leer la cuenta de Mercado Pago'); end if;
  -- Sucursal: si un intento anterior ya la creó, se reutiliza (Mercado Pago no deja repetir el identificador)
  v_sucursal := (select mp_qr_sucursal from integraciones);
  if v_sucursal is null then
    r := _mp_point_pedir('POST', '/users/' || v_user || '/stores', jsonb_build_object('name', left((select nombre from configuracion_tienda), 60), 'external_id', 'SUCURSAL1',
           'location', jsonb_build_object('street_name', trim(p_calle), 'street_number', trim(p_numero), 'city_name', trim(p_ciudad), 'state_name', trim(p_provincia),
             'latitude', -34.6037, 'longitude', -58.3816, 'reference', 'Local')));
    v_sucursal := r -> 'cuerpo' ->> 'id';
    if v_sucursal is null and coalesce(r -> 'cuerpo' ->> 'message', '') ilike '%already assigned%' then
      r := _mp_point_pedir('GET', '/users/' || v_user || '/stores/search?external_id=SUCURSAL1');
      v_sucursal := coalesce(r -> 'cuerpo' -> 'results' -> 0 ->> 'id', r -> 'cuerpo' ->> 'id');
      if v_sucursal is null then return jsonb_build_object('ok', false, 'error', 'La sucursal ya existe en Mercado Pago pero no se pudo leer. Borrala desde Mercado Pago (Tus integraciones → Sucursales) y probá de nuevo.'); end if;
      r := jsonb_build_object('status', 200);
    end if;
    if (r ->> 'status')::int not between 200 and 299 or v_sucursal is null then
      return jsonb_build_object('ok', false, 'error', 'Mercado Pago no creó la sucursal (' || (r ->> 'status') || '): ' || left(coalesce(r -> 'cuerpo' ->> 'message', '') || ' ' || coalesce((r -> 'cuerpo' -> 'errors')::text, (r -> 'cuerpo' -> 'cause')::text, ''), 400));
    end if;
    update integraciones set mp_qr_sucursal = v_sucursal where unica;
  end if;
  r := _mp_point_pedir('POST', '/v2/pos', jsonb_build_object('name', 'Caja del mostrador', 'external_id', 'CAJA1', 'store_id', v_sucursal,
         'config', jsonb_build_object('qr', jsonb_build_object('operating_mode', 'pdv'))), 'caja-' || gen_random_uuid());
  v_caja := r -> 'cuerpo';
  if v_caja ->> 'id' is null and coalesce(v_caja ->> 'message', '') ilike '%already%' then
    r := _mp_point_pedir('GET', '/pos?external_id=CAJA1');
    v_caja := coalesce(r -> 'cuerpo' -> 'results' -> 0, r -> 'cuerpo');
    r := jsonb_build_object('status', 200);
  end if;
  if (r ->> 'status')::int not between 200 and 299 or v_caja ->> 'id' is null then
    update integraciones set mp_qr_sucursal = v_sucursal where unica;
    return jsonb_build_object('ok', false, 'error', 'Mercado Pago no creó la caja (' || (r ->> 'status') || '): ' || left(coalesce(v_caja ->> 'message', '') || ' ' || coalesce((v_caja -> 'errors')::text, (v_caja -> 'cause')::text, ''), 400));
  end if;
  update integraciones set mp_qr_sucursal = v_sucursal, mp_qr_caja = v_caja ->> 'id', mp_qr_externo = 'CAJA1' where unica;
  perform _qr_guardar_fijo(v_caja);
  return jsonb_build_object('ok', true);
end $function$;

CREATE OR REPLACE FUNCTION public.qr_usar_sucursal(p_sucursal text, p_caja text DEFAULT NULL::text, p_caja_externo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '40s'
AS $function$
declare r jsonb; v_caja jsonb; v_externo text;
begin
  if not tiene_permiso('tienda.editar') then raise exception 'No tenés permiso para configurar las conexiones'; end if;
  if coalesce(trim(p_sucursal), '') = '' then raise exception 'Elegí una sucursal'; end if;
  if coalesce(trim(p_caja), '') <> '' then
    if coalesce(trim(p_caja_externo), '') = '' then
      return jsonb_build_object('ok', false, 'error', 'Esa caja no tiene identificador en Mercado Pago, así que no se puede usar para cobrar. Elegí «Crear una caja nueva en esta sucursal».');
    end if;
    r := _mp_point_pedir('GET', '/pos/' || trim(p_caja));
    v_caja := case when (r ->> 'status')::int between 200 and 299 then r -> 'cuerpo' else '{}'::jsonb end;
    v_externo := trim(p_caja_externo);
    update integraciones set mp_qr_sucursal = trim(p_sucursal), mp_qr_caja = trim(p_caja), mp_qr_externo = v_externo, mp_qr_imagen = null, mp_qr_plantilla = null where unica;
    perform _qr_guardar_fijo(coalesce(v_caja, '{}'::jsonb) || jsonb_build_object('qr_response', coalesce(v_caja -> 'qr_response', v_caja -> 'qr', '{}'::jsonb)));
    return jsonb_build_object('ok', true);
  end if;
  -- Una caja nueva en esa sucursal
  r := _mp_point_pedir('POST', '/v2/pos', jsonb_build_object('name', 'Caja del mostrador', 'external_id', 'CAJA1', 'store_id', trim(p_sucursal),
         'config', jsonb_build_object('qr', jsonb_build_object('operating_mode', 'pdv'))), 'caja-' || gen_random_uuid());
  v_caja := r -> 'cuerpo';
  if v_caja ->> 'id' is null and coalesce(v_caja ->> 'message', '') ilike '%already%' then
    r := _mp_point_pedir('GET', '/pos?external_id=CAJA1');
    v_caja := coalesce(r -> 'cuerpo' -> 'results' -> 0, r -> 'cuerpo');
    r := jsonb_build_object('status', 200);
  end if;
  if (r ->> 'status')::int not between 200 and 299 or v_caja ->> 'id' is null then
    return jsonb_build_object('ok', false, 'error', 'Mercado Pago no creó la caja (' || (r ->> 'status') || '): ' || left(coalesce(v_caja ->> 'message', '') || ' ' || coalesce((v_caja -> 'errors')::text, (v_caja -> 'cause')::text, ''), 400));
  end if;
  update integraciones set mp_qr_sucursal = trim(p_sucursal), mp_qr_caja = v_caja ->> 'id', mp_qr_externo = coalesce(v_caja ->> 'external_id', 'CAJA1'), mp_qr_imagen = null, mp_qr_plantilla = null where unica;
  perform _qr_guardar_fijo(v_caja);
  return jsonb_build_object('ok', true);
end $function$;

create or replace function public.qr_desvincular() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tiene_permiso('tienda.editar') then raise exception 'No tenés permiso para configurar las conexiones'; end if;
  update integraciones set mp_qr_sucursal = null, mp_qr_caja = null, mp_qr_externo = null, mp_qr_imagen = null, mp_qr_plantilla = null where unica;
end $$;
