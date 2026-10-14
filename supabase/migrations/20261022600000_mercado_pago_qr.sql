-- Mercado Pago QR dinámico: la caja pide un QR con el monto de la venta, el cliente lo escanea y paga con Mercado Pago u otra billetera.
-- Usa el mismo circuito que el posnet (point_cobros, el aviso de «Order» y la consulta a Mercado Pago): solo cambia cómo nace el cobro.
-- Agrega, no rompe: el código de la versión anterior sigue andando.

alter table public.point_cobros alter column terminal_id drop not null;
alter table public.point_cobros
  add column via     text not null default 'point' check (via in ('point', 'qr')),
  add column qr_data text;

alter table public.integraciones
  add column mp_qr_sucursal text,      -- id de la sucursal en Mercado Pago
  add column mp_qr_caja     text,      -- id de la caja
  add column mp_qr_externo  text;      -- external_id de la caja (lo que pide la orden)

-- Crea en Mercado Pago la sucursal y la caja del local (una sola vez). Devuelve {ok} o {ok:false, error}.
create function public.qr_preparar(p_calle text, p_numero text, p_ciudad text, p_provincia text) returns jsonb
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
  return jsonb_build_object('ok', true);
end $$;

create function public.estado_qr() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not tiene_permiso('tienda.editar') then null
    else jsonb_build_object('listo', mp_qr_externo is not null, 'sucursal', mp_qr_sucursal is not null) end
  from integraciones
$$;

-- Lo que necesita la caja (se suma a point_caja sin sacar nada)
create or replace function public.point_caja() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not es_staff() then null else jsonb_build_object(
    'disponible', (coalesce(i.mp_point_token, i.mp_access_token) is not null and coalesce(i.mp_point_secreto, i.mp_webhook_secret) is not null and exists (select 1 from point_terminales where por_defecto and activa and modo = 'PDV')),
    'modo', t.tarjetas_modo, 'terminal', (select nombre from point_terminales where por_defecto and activa),
    'qr', (coalesce(i.mp_point_token, i.mp_access_token) is not null and coalesce(i.mp_point_secreto, i.mp_webhook_secret) is not null and i.mp_qr_externo is not null)) end
  from integraciones i, configuracion_tienda t
$$;

-- Pide el QR para un monto. Devuelve {ok, id} o {ok:false, error}: nunca lanza (el cobro queda anotado aunque falle).
create function public.qr_cobrar(p_monto numeric) returns jsonb
language plpgsql security definer set search_path = public set statement_timeout = '40s' as $$
declare v_id bigint; v_ref text; r jsonb; v_orden text; v_qr text; v_externo text;
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
         'config', jsonb_build_object('qr', jsonb_build_object('external_pos_id', v_externo, 'mode', 'dynamic'))), 'cobro-' || v_ref || '-' || gen_random_uuid());
  v_orden := r -> 'cuerpo' ->> 'id';
  v_qr := r -> 'cuerpo' -> 'type_response' ->> 'qr_data';
  if (r ->> 'status')::int not between 200 and 299 or v_orden is null or v_qr is null then
    update point_cobros set estado = 'error', actualizado_en = now(), detalle = left(coalesce(r -> 'cuerpo' -> 'errors' -> 0 ->> 'message', r -> 'cuerpo' ->> 'message', 'Mercado Pago contestó ' || (r ->> 'status')), 300) where id = v_id;
    return jsonb_build_object('ok', false, 'error', 'Mercado Pago no generó el QR: ' || coalesce((select detalle from point_cobros where id = v_id), ''));
  end if;
  update point_cobros set orden_id = v_orden, qr_data = v_qr, estado = 'en_terminal', actualizado_en = now() where id = v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- Cómo va un cobro: ahora también dice el QR (se suma, no se saca nada)
create or replace function public.point_estado(p_cobro bigint) returns jsonb
language plpgsql security definer set search_path = public set statement_timeout = '30s' as $$
declare c point_cobros;
begin
  if not es_staff() then raise exception 'No tenés acceso'; end if;
  select * into c from point_cobros where id = p_cobro and (usuario_id = auth.uid() or tiene_permiso('ventas.ver_todas'));
  if not found then raise exception 'Ese cobro no existe'; end if;
  if c.estado in ('creado', 'en_terminal') and (c.consultado_en is null or c.consultado_en < now() - interval '10 seconds') and c.creado_en < now() - interval '4 seconds' then
    perform _point_sincronizar(p_cobro);
    select * into c from point_cobros where id = p_cobro;
  end if;
  return jsonb_build_object('estado', c.estado, 'detalle', c.detalle, 'monto', c.monto, 'orden', c.orden_id, 'medio', c.medio, 'cuotas', c.cuotas, 'usado', c.venta_id is not null, 'via', c.via, 'qr', c.qr_data);
end $$;

-- Cancelar: el pedido de «cancelable en la terminal» es solo del posnet
create or replace function public.point_cancelar(p_cobro bigint) returns jsonb
language plpgsql security definer set search_path = public set statement_timeout = '30s' as $$
declare c point_cobros; r jsonb;
begin
  if not tiene_permiso('ventas.registrar') then raise exception 'No tenés permiso para cobrar'; end if;
  select * into c from point_cobros where id = p_cobro and (usuario_id = auth.uid() or tiene_permiso('ventas.ver_todas')) for update;
  if not found then raise exception 'Ese cobro no existe'; end if;
  if c.estado not in ('creado', 'en_terminal') then return jsonb_build_object('ok', false, 'error', 'Ese cobro ya no se puede cancelar (está ' || c.estado || ')'); end if;
  r := _mp_point_pedir('POST', '/v1/orders/' || c.orden_id || '/cancel', null, 'cancelar-' || c.referencia || '-' || gen_random_uuid(), case when c.via = 'point' then jsonb_build_object('x-allow-cancelable-status', 'at_terminal') else '{}'::jsonb end);
  if (r ->> 'status')::int = 200 then update point_cobros set estado = 'cancelado', actualizado_en = now() where id = p_cobro;
  elsif (r ->> 'status')::int = 202 then null;   -- se confirma con el aviso de Mercado Pago
  else return jsonb_build_object('ok', false, 'error', coalesce(r -> 'cuerpo' ->> 'message', 'Mercado Pago no pudo cancelarlo')); end if;
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.qr_preparar(text, text, text, text), public.estado_qr(), public.qr_cobrar(numeric) from public, anon;
grant execute on function public.qr_preparar(text, text, text, text), public.estado_qr(), public.qr_cobrar(numeric) to authenticated;
