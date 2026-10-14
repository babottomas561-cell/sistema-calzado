-- Mercado Pago pide el identificador de la sucursal (store_id) como TEXTO al crear una caja; antes se mandaba como número y rechazaba la caja (400).
-- Mismas funciones, solo cambia eso.

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
    update integraciones set mp_qr_sucursal = v_sucursal;
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
    update integraciones set mp_qr_sucursal = v_sucursal;
    return jsonb_build_object('ok', false, 'error', 'Mercado Pago no creó la caja (' || (r ->> 'status') || '): ' || left(coalesce(v_caja ->> 'message', '') || ' ' || coalesce((v_caja -> 'errors')::text, (v_caja -> 'cause')::text, ''), 400));
  end if;
  update integraciones set mp_qr_sucursal = v_sucursal, mp_qr_caja = v_caja ->> 'id', mp_qr_externo = 'CAJA1';
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
    update integraciones set mp_qr_sucursal = trim(p_sucursal), mp_qr_caja = trim(p_caja), mp_qr_externo = v_externo, mp_qr_imagen = null, mp_qr_plantilla = null;
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
  update integraciones set mp_qr_sucursal = trim(p_sucursal), mp_qr_caja = v_caja ->> 'id', mp_qr_externo = coalesce(v_caja ->> 'external_id', 'CAJA1'), mp_qr_imagen = null, mp_qr_plantilla = null;
  perform _qr_guardar_fijo(v_caja);
  return jsonb_build_object('ok', true);
end $function$;
