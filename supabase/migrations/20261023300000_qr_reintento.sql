-- «Preparar cobro con QR» se puede repetir: reutiliza la sucursal y la caja que un intento anterior ya creó en Mercado Pago. Misma función.

create or replace function public.qr_preparar(p_calle text, p_numero text, p_ciudad text, p_provincia text) returns jsonb
language plpgsql security definer set search_path = public set statement_timeout = '40s' as $$
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
  r := _mp_point_pedir('POST', '/v2/pos', jsonb_build_object('name', 'Caja del mostrador', 'external_id', 'CAJA1', 'store_id', v_sucursal::bigint,
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
end $$;
