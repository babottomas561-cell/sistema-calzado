-- Auditoría de Mercado Pago (posnet y QR), contrastada con la documentación oficial. Agrega y corrige; no rompe lo anterior.
--   1. La clave de idempotencia de un cobro es estable (un reintento no duplica) y, si Mercado Pago no contesta, el cobro queda anotado como «error» (el cliente pudo haber pagado igual).
--   2. El importe que cobró Mercado Pago tiene que ser el pedido; si no, el cobro no se da por bueno.
--   3. La referencia de un cobro (posnet o QR) sirve una sola vez, por su importe y estando aprobado, para cualquier medio de pago.
--   4. Anular una venta cobrada con el posnet o el QR devuelve el dinero por Mercado Pago (o no se anula).
--   5. Un barrido cada 2 minutos actualiza los cobros pendientes aunque el aviso no llegue y la caja esté cerrada.
--   6. Sin clave secreta cargada, un aviso no se acepta.

alter table public.point_cobros add column monto_pagado numeric(12,2);

CREATE OR REPLACE FUNCTION public._point_sincronizar(p_cobro bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c point_cobros; r jsonb; o jsonb; pg jsonb; v_estado text;
begin
  select * into c from point_cobros where id = p_cobro for update;
  if not found or c.orden_id is null then return; end if;
  r := _mp_point_pedir('GET', '/v1/orders/' || c.orden_id);
  if (r ->> 'status')::int <> 200 then update point_cobros set consultado_en = now() where id = p_cobro; return; end if;
  o := r -> 'cuerpo'; pg := o -> 'transactions' -> 'payments' -> 0;
  v_estado := _point_estado_de(o);
  -- Lo que Mercado Pago dice que cobró tiene que ser lo que se pidió: si no, no se da por bueno
  if v_estado = 'aprobado' and (pg ->> 'amount') is not null and abs((pg ->> 'amount')::numeric - c.monto) > 0.009 then
    update point_cobros set estado = 'error', consultado_en = now(), actualizado_en = now(), monto_pagado = (pg ->> 'amount')::numeric, pago_id = coalesce(pg ->> 'id', pago_id),
           detalle = 'Mercado Pago cobró $ ' || (pg ->> 'amount') || ' y se pidieron $ ' || c.monto || ': revisalo en Mercado Pago' where id = p_cobro and estado not in ('aprobado', 'reembolsado');
    return;
  end if;
  if c.estado in ('aprobado', 'reembolsado') and v_estado not in ('reembolsado') then v_estado := c.estado; end if;   -- un cobro aprobado no vuelve atrás por una consulta tardía
  update point_cobros set estado = v_estado, consultado_en = now(), actualizado_en = now(),
         detalle = coalesce(pg ->> 'status_detail', o ->> 'status_detail', detalle), pago_id = coalesce(pg ->> 'id', pago_id), monto_pagado = coalesce((pg ->> 'amount')::numeric, monto_pagado),
         medio = coalesce(pg -> 'payment_method' ->> 'id', medio), cuotas = coalesce((pg -> 'payment_method' ->> 'installments')::int, cuotas)
   where id = p_cobro;
end $function$;

CREATE OR REPLACE FUNCTION public.point_cobrar(p_monto numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '40s'
AS $function$
declare t point_terminales; v_id bigint; v_ref text; r jsonb; v_orden text;
begin
  if not tiene_permiso('ventas.registrar') then raise exception 'No tenés permiso para cobrar'; end if;
  if coalesce(p_monto, 0) <= 0 or p_monto > 99999999 then raise exception 'El monto no es válido'; end if;
  select * into t from point_terminales where por_defecto and activa;
  if not found or (select coalesce(mp_point_token, mp_access_token) is null from integraciones) then return jsonb_build_object('ok', false, 'error', 'El posnet todavía no está vinculado (Integraciones → Mercado Pago → Posnet)'); end if;
  if t.modo is distinct from 'PDV' then return jsonb_build_object('ok', false, 'error', 'El posnet no está en modo punto de venta: elegilo de nuevo en Integraciones → Mercado Pago y reinicialo'); end if;
  insert into point_cobros (terminal_id, monto, referencia) values (t.terminal_id, round(p_monto, 2), 'tmp' || gen_random_uuid()) returning id into v_id;
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
    update point_cobros set estado = 'error', actualizado_en = now(), detalle = left(coalesce(r -> 'cuerpo' -> 'errors' -> 0 ->> 'message', r -> 'cuerpo' ->> 'message', 'Mercado Pago contestó ' || (r ->> 'status')), 300) where id = v_id;
    return jsonb_build_object('ok', false, 'error', 'Mercado Pago no aceptó el cobro: ' || coalesce((select detalle from point_cobros where id = v_id), ''));
  end if;
  update point_cobros set orden_id = v_orden, estado = 'en_terminal', actualizado_en = now() where id = v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $function$;

CREATE OR REPLACE FUNCTION public.qr_cobrar(p_monto numeric, p_modo text DEFAULT 'dynamic'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '40s'
AS $function$
declare v_id bigint; v_ref text; r jsonb; v_orden text; v_qr text; v_externo text; v_modo text := case when p_modo = 'hybrid' then 'hybrid' else 'dynamic' end;
begin
  if not tiene_permiso('ventas.registrar') then raise exception 'No tenés permiso para cobrar'; end if;
  if coalesce(p_monto, 0) <= 0 or p_monto > 99999999 then raise exception 'El monto no es válido'; end if;
  select mp_qr_externo into v_externo from integraciones;
  if v_externo is null then return jsonb_build_object('ok', false, 'error', 'El cobro con QR todavía no está preparado (Integraciones → Mercado Pago → Cobro con QR)'); end if;
  insert into point_cobros (via, monto, referencia) values ('qr', round(p_monto, 2), 'tmp' || gen_random_uuid()) returning id into v_id;
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
    update point_cobros set estado = 'error', actualizado_en = now(), detalle = left(coalesce(r -> 'cuerpo' -> 'errors' -> 0 ->> 'message', r -> 'cuerpo' ->> 'message', 'Mercado Pago contestó ' || (r ->> 'status')), 300) where id = v_id;
    return jsonb_build_object('ok', false, 'error', 'Mercado Pago no generó el cobro: ' || coalesce((select detalle from point_cobros where id = v_id), ''));
  end if;
  update point_cobros set orden_id = v_orden, qr_data = v_qr, estado = 'en_terminal', actualizado_en = now() where id = v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $function$;

create or replace function public._pago_tarjeta_vinculada() returns trigger
language plpgsql security definer set search_path = public as $$
declare v ventas; m medios_pago; c point_cobros; v_ref text := nullif(trim(coalesce(new.referencia, '')), '');
begin
  select * into m from medios_pago where id = new.medio_pago_id;
  select * into v from ventas where id = new.venta_id;
  -- Si la referencia es la de un cobro de Mercado Pago (posnet o QR), tiene que estar aprobado, ser del mismo importe y no haberse usado: se ata a esta venta
  if v_ref is not null then
    select * into c from point_cobros where orden_id = v_ref for update;
    if found then
      if c.estado <> 'aprobado' then raise exception 'El cobro de Mercado Pago % no está aprobado (está %)', v_ref, c.estado; end if;
      if c.venta_id is not null then raise exception 'El cobro de Mercado Pago % ya se usó en otra venta', v_ref; end if;
      if abs(c.monto - new.monto) >= 0.01 then raise exception 'El cobro de Mercado Pago fue por $ %, y este pago es por $ %', to_char(c.monto, 'FM999G999G990D00'), to_char(new.monto, 'FM999G999G990D00'); end if;
      update point_cobros set venta_id = new.venta_id where id = c.id;
      return null;
    end if;
  end if;
  if m.tipo in ('Débito', 'Crédito') and v.pedido_id is null and (select tarjetas_modo from configuracion_tienda) = 'vinculado' then
    raise exception 'Con tarjeta se cobra con el posnet de Mercado Pago (Point): mandá el cobro al posnet antes de confirmar la venta';
  end if;
  return null;
end $$;

CREATE OR REPLACE FUNCTION public.point_notificacion(p_data_id text, p_request_id text, p_firma text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '30s'
AS $function$
declare v_firma boolean := _mp_point_firma_valida(p_data_id, p_request_id, p_firma); c point_cobros;
begin
  if v_firma is not true then return 'firma_invalida'; end if;
  if coalesce(p_data_id, '') = '' then return 'sin_id'; end if;
  select * into c from point_cobros where orden_id = p_data_id;
  if not found then return 'orden_desconocida'; end if;
  perform _point_sincronizar(c.id);
  return 'ok';
end $function$;

-- 4. Anular una venta cobrada con Mercado Pago: se devuelve el dinero (total, por la API) al cerrar la operación. Si no se puede, no se anula.
create function public._point_reembolsar_al_anular() returns trigger
language plpgsql security definer set search_path = public set statement_timeout = '40s' as $$
declare c record; r jsonb;
begin
  if old.anulada_en is null and new.anulada_en is not null then
    for c in select id, orden_id, estado from point_cobros where venta_id = new.id and estado in ('aprobado', 'reembolsado') loop
      if c.estado = 'aprobado' then perform _point_sincronizar(c.id); end if;   -- por si ya se devolvió a mano
      if (select estado from point_cobros where id = c.id) = 'aprobado' then
        r := _mp_point_pedir('POST', '/v1/orders/' || c.orden_id || '/refund', null, 'reembolso-' || c.id);
        if (r ->> 'status')::int not between 200 and 299 then
          raise exception 'Mercado Pago no devolvió el dinero (%): %. Devolvelo desde Mercado Pago o el posnet y después anulá la venta.',
            r ->> 'status', left(coalesce(r -> 'cuerpo' ->> 'message', 'sin detalle'), 150);
        end if;
        update point_cobros set estado = 'reembolsado', actualizado_en = now() where id = c.id;
      end if;
    end loop;
  end if;
  return null;
end $$;
create constraint trigger ventas_reembolsar_point after update of anulada_en on public.ventas deferrable initially deferred
  for each row execute function public._point_reembolsar_al_anular();

-- 5. Barrido: cobros que siguen pendientes (el aviso no llegó o la caja se cerró)
create function public._point_reconciliar() returns void
language plpgsql security definer set search_path = public set statement_timeout = '60s' as $$
declare c record;
begin
  if (select coalesce(mp_point_token, mp_access_token) from integraciones) is null then return; end if;
  for c in select id from point_cobros where estado in ('creado', 'en_terminal') and orden_id is not null and creado_en > now() - interval '3 hours'
             and (consultado_en is null or consultado_en < now() - interval '1 minute') order by id limit 20 loop
    begin perform _point_sincronizar(c.id); exception when others then null; end;
  end loop;
end $$;
select cron.schedule('point-reconciliar', '*/2 * * * *', $$select public._point_reconciliar()$$);

revoke execute on function public._point_reembolsar_al_anular(), public._point_reconciliar() from public, anon, authenticated;
