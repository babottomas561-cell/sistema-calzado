-- QR físico fijo (modo híbrido): Mercado Pago le da a la caja un QR para imprimir y pegar en el mostrador; la caja le «carga» el monto de cada venta
-- y el cliente lo ve al escanear. Se suma al QR en pantalla (dinámico), no lo reemplaza.
alter table public.integraciones
  add column mp_qr_imagen    text,     -- imagen del QR fijo de la caja (la da Mercado Pago)
  add column mp_qr_plantilla text;     -- documento listo para imprimir

-- Guarda el QR fijo al crear la caja (las cajas ya creadas lo traen con qr_fijo())
create or replace function public._qr_guardar_fijo(p_caja jsonb) returns void
language sql security definer set search_path = public as $$
  update integraciones set mp_qr_imagen = coalesce(p_caja -> 'qr_response' ->> 'image', mp_qr_imagen),
                           mp_qr_plantilla = coalesce(p_caja -> 'qr_response' ->> 'template_document', mp_qr_plantilla) where unica
$$;

create function public.qr_fijo() returns jsonb
language plpgsql security definer set search_path = public as $$
declare i integraciones; r jsonb;
begin
  if not es_staff() then raise exception 'No tenés acceso'; end if;
  select * into i from integraciones;
  if i.mp_qr_caja is null then return jsonb_build_object('listo', false); end if;
  if i.mp_qr_imagen is null and i.mp_qr_plantilla is null then
    r := _mp_point_pedir('GET', '/pos/' || i.mp_qr_caja);
    if (r ->> 'status')::int = 200 then perform _qr_guardar_fijo(r -> 'cuerpo'); select * into i from integraciones; end if;
  end if;
  return jsonb_build_object('listo', true, 'imagen', i.mp_qr_imagen, 'plantilla', i.mp_qr_plantilla);
end $$;

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
  -- Sucursal (las coordenadas son de referencia: el QR no depende de ellas)
  r := _mp_point_pedir('POST', '/users/' || v_user || '/stores', jsonb_build_object('name', left((select nombre from configuracion_tienda), 60), 'external_id', 'SUCURSAL1',
         'location', jsonb_build_object('street_name', trim(p_calle), 'street_number', trim(p_numero), 'city_name', trim(p_ciudad), 'state_name', trim(p_provincia),
           'latitude', -34.6037, 'longitude', -58.3816, 'reference', 'Local')));
  v_sucursal := r -> 'cuerpo' ->> 'id';
  if (r ->> 'status')::int not between 200 and 299 or v_sucursal is null then
    return jsonb_build_object('ok', false, 'error', 'Mercado Pago no creó la sucursal: ' || coalesce(r -> 'cuerpo' ->> 'message', 'contestó ' || (r ->> 'status')));
  end if;
  r := _mp_point_pedir('POST', '/v2/pos', jsonb_build_object('name', 'Caja del mostrador', 'external_id', 'CAJA1', 'store_id', v_sucursal::bigint,
         'config', jsonb_build_object('qr', jsonb_build_object('operating_mode', 'pdv'))), 'caja-' || gen_random_uuid());
  v_caja := r -> 'cuerpo';
  if (r ->> 'status')::int not between 200 and 299 or v_caja ->> 'id' is null then
    update integraciones set mp_qr_sucursal = v_sucursal;
    return jsonb_build_object('ok', false, 'error', 'Mercado Pago no creó la caja: ' || coalesce(v_caja ->> 'message', 'contestó ' || (r ->> 'status')));
  end if;
  update integraciones set mp_qr_sucursal = v_sucursal, mp_qr_caja = v_caja ->> 'id', mp_qr_externo = 'CAJA1';
  perform _qr_guardar_fijo(v_caja);
  return jsonb_build_object('ok', true);
end $$;

-- El modo del cobro: 'dynamic' (QR en pantalla) o 'hybrid' (el del mostrador)
drop function public.qr_cobrar(numeric);
create function public.qr_cobrar(p_monto numeric, p_modo text default 'dynamic') returns jsonb
language plpgsql security definer set search_path = public set statement_timeout = '40s' as $$
declare v_id bigint; v_ref text; r jsonb; v_orden text; v_qr text; v_externo text; v_modo text := case when p_modo = 'hybrid' then 'hybrid' else 'dynamic' end;
begin
  if not tiene_permiso('ventas.registrar') then raise exception 'No tenés permiso para cobrar'; end if;
  if coalesce(p_monto, 0) <= 0 or p_monto > 99999999 then raise exception 'El monto no es válido'; end if;
  select mp_qr_externo into v_externo from integraciones;
  if v_externo is null then return jsonb_build_object('ok', false, 'error', 'El cobro con QR todavía no está preparado (Integraciones → Mercado Pago → Cobro con QR)'); end if;
  insert into point_cobros (via, monto, referencia) values ('qr', round(p_monto, 2), 'tmp' || gen_random_uuid()) returning id into v_id;
  v_ref := 'c' || v_id;
  update point_cobros set referencia = v_ref where id = v_id;
  r := _mp_point_pedir('POST', '/v1/orders', jsonb_build_object('type', 'qr', 'external_reference', v_ref, 'expiration_time', 'PT10M',
         'total_amount', trim(to_char(round(p_monto, 2), 'FM999999990.00')),
         'transactions', jsonb_build_object('payments', jsonb_build_array(jsonb_build_object('amount', trim(to_char(round(p_monto, 2), 'FM999999990.00'))))),
         'config', jsonb_build_object('qr', jsonb_build_object('external_pos_id', v_externo, 'mode', v_modo))), 'cobro-' || v_ref || '-' || gen_random_uuid());
  v_orden := r -> 'cuerpo' ->> 'id';
  v_qr := r -> 'cuerpo' -> 'type_response' ->> 'qr_data';
  -- en el modo híbrido el cliente escanea el QR del mostrador: no hace falta el texto del QR
  if (r ->> 'status')::int not between 200 and 299 or v_orden is null or (v_modo = 'dynamic' and v_qr is null) then
    update point_cobros set estado = 'error', actualizado_en = now(), detalle = left(coalesce(r -> 'cuerpo' -> 'errors' -> 0 ->> 'message', r -> 'cuerpo' ->> 'message', 'Mercado Pago contestó ' || (r ->> 'status')), 300) where id = v_id;
    return jsonb_build_object('ok', false, 'error', 'Mercado Pago no generó el cobro: ' || coalesce((select detalle from point_cobros where id = v_id), ''));
  end if;
  update point_cobros set orden_id = v_orden, qr_data = v_qr, estado = 'en_terminal', actualizado_en = now() where id = v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;
revoke execute on function public.qr_cobrar(numeric, text), public.qr_fijo() from public, anon;
grant execute on function public.qr_cobrar(numeric, text), public.qr_fijo() to authenticated;
revoke execute on function public._qr_guardar_fijo(jsonb) from public, anon, authenticated;
