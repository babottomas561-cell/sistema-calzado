-- Parametrización de Mercado Pago: cobrar con el posnet (Point) y cobrar con QR son interruptores aparte, dentro de Mercado Pago.
--   · encendidos solo si ya se usaban (hay un posnet elegido / una caja vinculada con QR); un local nuevo los arranca apagados;
--   · apagados: la caja no los ofrece (point_caja), la base no los cobra y su configuración no aparece.
-- Agrega, no rompe.

insert into public.modulos (clave, nombre, fijo, depende, activo) values
  ('mercadopago/posnet', 'Cobrar con posnet (Point)', false, '{integraciones/mercadopago}', exists (select 1 from public.point_terminales where activa)),
  ('mercadopago/qr', 'Cobrar con QR', false, '{integraciones/mercadopago}', exists (select 1 from public.cajas where mp_externo is not null));

CREATE OR REPLACE FUNCTION public.point_caja(p_caja bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case when not es_staff() then null else jsonb_build_object(
    'caja_id', c.id, 'caja', c.nombre,
    'disponible', (_modulo_activo('mercadopago/posnet') and coalesce(i.mp_point_token, i.mp_access_token) is not null and coalesce(i.mp_point_secreto, i.mp_webhook_secret) is not null
                   and exists (select 1 from point_terminales pt where pt.activa and pt.modo = 'PDV' and pt.id = coalesce(c.terminal_id, (select id from point_terminales where por_defecto and activa limit 1)))),
    'modo', t.tarjetas_modo, 'qr_minimo', t.qr_monto_minimo, 'terminal', (select nombre from point_terminales pt where pt.activa and pt.id = coalesce(c.terminal_id, (select id from point_terminales where por_defecto and activa limit 1))),
    'qr', (_modulo_activo('mercadopago/qr') and coalesce(i.mp_point_token, i.mp_access_token) is not null and coalesce(i.mp_point_secreto, i.mp_webhook_secret) is not null and c.mp_externo is not null)) end
  from integraciones i, configuracion_tienda t, cajas c where c.id = coalesce(p_caja, (select id from cajas where por_defecto))
$function$;

CREATE OR REPLACE FUNCTION public.point_cobrar(p_monto numeric, p_caja bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '40s'
AS $function$
declare t point_terminales; v_caja cajas; v_id bigint; v_ref text; r jsonb; v_orden text;
begin
  if not tiene_permiso('ventas.registrar') then raise exception 'No tenés permiso para cobrar'; end if;
  if not _modulo_activo('mercadopago/posnet') then return jsonb_build_object('ok', false, 'error', 'El cobro con posnet no está habilitado (Parametrización → Mercado Pago)'); end if;
  if coalesce(p_monto, 0) <= 0 or p_monto > 99999999 then raise exception 'El monto no es válido'; end if;
  v_caja := _caja_efectiva(p_caja);
  -- el posnet de la caja; si no tiene uno asignado, el de siempre
  select * into t from point_terminales where activa and id = coalesce(v_caja.terminal_id, (select id from point_terminales where por_defecto and activa limit 1));
  if not found or (select coalesce(mp_point_token, mp_access_token) is null from integraciones) then return jsonb_build_object('ok', false, 'error', 'El posnet todavía no está vinculado (Integraciones → Mercado Pago → Posnet)'); end if;
  if t.modo is distinct from 'PDV' then return jsonb_build_object('ok', false, 'error', 'El posnet no está en modo punto de venta: elegilo de nuevo en Integraciones → Mercado Pago y reinicialo'); end if;
  insert into point_cobros (terminal_id, monto, referencia, caja_id) values (t.terminal_id, round(p_monto, 2), 'tmp' || gen_random_uuid(), v_caja.id) returning id into v_id;
  v_ref := 'c' || v_id;
  update point_cobros set referencia = v_ref where id = v_id;
  begin
    r := _mp_point_pedir('POST', '/v1/orders', jsonb_build_object('type', 'point', 'external_reference', v_ref, 'expiration_time', 'PT10M',
           'transactions', jsonb_build_object('payments', jsonb_build_array(jsonb_build_object('amount', trim(to_char(round(p_monto, 2), 'FM999999990.00'))))),
           'config', jsonb_build_object('point', jsonb_build_object('terminal_id', t.terminal_id, 'print_on_terminal', 'no_ticket'))), 'cobro-' || v_ref);
  exception when others then
    -- Mercado Pago no contestó: el cobro puede haber llegado igual al posnet o al QR. Queda anotado para revisarlo antes de cobrar de nuevo.
    update point_cobros set estado = 'error', actualizado_en = now(), detalle = 'Mercado Pago no respondió a tiempo' where id = v_id;
    return jsonb_build_object('ok', false, 'error', 'Mercado Pago no respondió a tiempo. Antes de cobrar de nuevo, mirá si el cobro llegó al posnet o al QR.');
  end;
  v_orden := r -> 'cuerpo' ->> 'id';
  if (r ->> 'status')::int not between 200 and 299 or v_orden is null then
    update point_cobros set estado = 'error', actualizado_en = now(), detalle = left(_mp_error_texto(r -> 'cuerpo', r ->> 'status'), 300) where id = v_id;
    return jsonb_build_object('ok', false, 'error', 'Mercado Pago no aceptó el cobro: ' || coalesce((select detalle from point_cobros where id = v_id), ''));
  end if;
  update point_cobros set orden_id = v_orden, estado = 'en_terminal', actualizado_en = now() where id = v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $function$;

CREATE OR REPLACE FUNCTION public.qr_cobrar(p_monto numeric, p_modo text DEFAULT 'dynamic'::text, p_caja bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '40s'
AS $function$
declare v_caja cajas; v_id bigint; v_ref text; r jsonb; v_orden text; v_qr text; v_externo text; v_modo text := case when p_modo = 'hybrid' then 'hybrid' else 'dynamic' end;
begin
  if not tiene_permiso('ventas.registrar') then raise exception 'No tenés permiso para cobrar'; end if;
  if not _modulo_activo('mercadopago/qr') then return jsonb_build_object('ok', false, 'error', 'El cobro con QR no está habilitado (Parametrización → Mercado Pago)'); end if;
  if coalesce(p_monto, 0) <= 0 or p_monto > 99999999 then raise exception 'El monto no es válido'; end if;
  v_caja := _caja_efectiva(p_caja);
  v_externo := v_caja.mp_externo;
  if p_monto < (select qr_monto_minimo from configuracion_tienda) then
    return jsonb_build_object('ok', false, 'error', 'Mercado Pago no acepta cobros por QR menores a $ ' || replace(to_char((select qr_monto_minimo from configuracion_tienda), 'FM999999990.00'), '.', ','));
  end if;
  if v_externo is null then return jsonb_build_object('ok', false, 'error', 'El cobro con QR todavía no está preparado (Integraciones → Mercado Pago → Sucursales y cajas)'); end if;
  insert into point_cobros (via, monto, referencia, caja_id) values ('qr', round(p_monto, 2), 'tmp' || gen_random_uuid(), v_caja.id) returning id into v_id;
  v_ref := 'c' || v_id;
  update point_cobros set referencia = v_ref where id = v_id;
  begin
    r := _mp_point_pedir('POST', '/v1/orders', jsonb_build_object('type', 'qr', 'external_reference', v_ref, 'expiration_time', 'PT10M',
           'total_amount', trim(to_char(round(p_monto, 2), 'FM999999990.00')),
           'transactions', jsonb_build_object('payments', jsonb_build_array(jsonb_build_object('amount', trim(to_char(round(p_monto, 2), 'FM999999990.00'))))),
           'config', jsonb_build_object('qr', jsonb_build_object('external_pos_id', v_externo, 'mode', v_modo))), 'cobro-' || v_ref);
  exception when others then
    -- Mercado Pago no contestó: el cobro puede haber llegado igual al posnet o al QR. Queda anotado para revisarlo antes de cobrar de nuevo.
    update point_cobros set estado = 'error', actualizado_en = now(), detalle = 'Mercado Pago no respondió a tiempo' where id = v_id;
    return jsonb_build_object('ok', false, 'error', 'Mercado Pago no respondió a tiempo. Antes de cobrar de nuevo, mirá si el cobro llegó al posnet o al QR.');
  end;
  v_orden := r -> 'cuerpo' ->> 'id';
  v_qr := r -> 'cuerpo' -> 'type_response' ->> 'qr_data';
  -- en el modo híbrido el cliente escanea el QR del mostrador: no hace falta el texto del QR
  if (r ->> 'status')::int not between 200 and 299 or v_orden is null or (v_modo = 'dynamic' and v_qr is null) then
    update point_cobros set estado = 'error', actualizado_en = now(), detalle = left(_mp_error_texto(r -> 'cuerpo', r ->> 'status'), 300) where id = v_id;
    update configuracion_tienda set qr_monto_minimo = greatest(qr_monto_minimo, coalesce(_mp_minimo(r -> 'cuerpo'), 0)) where unica;   -- aprende el mínimo que informa Mercado Pago
    return jsonb_build_object('ok', false, 'error', 'Mercado Pago no generó el cobro: ' || coalesce((select detalle from point_cobros where id = v_id), ''));
  end if;
  update point_cobros set orden_id = v_orden, qr_data = v_qr, estado = 'en_terminal', actualizado_en = now() where id = v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $function$;
