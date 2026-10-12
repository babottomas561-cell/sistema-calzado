-- Cancelación de pedidos web (paso 1 de docs/DEVOLUCIONES.md):
--   · toda cancelación lleva MOTIVO y QUIÉN la hizo (el cliente, el local o el vencimiento automático);
--   · el cliente puede cancelar su pedido desde Mi cuenta mientras el local no lo empezó a preparar;
--   · un pedido "listo para retirar" que nadie retira se cancela solo a los N días (configurable) y
--     libera el stock reservado.
-- Hoy un pedido no registra pagos antes de entregarse, así que cancelar nunca devuelve plata:
-- solo libera la reserva (decidido: pedido sin pagar → no hay nada que devolver).

-- ── Motivo y quién canceló ────────────────────────────────────────────
alter table public.pedidos
  add column motivo_cancelacion text check (motivo_cancelacion in ('arrepentido', 'no_retiro', 'no_pago', 'sin_stock', 'otro')),
  add column cancelado_por text check (cancelado_por in ('cliente', 'local', 'vencimiento'));
-- Los cancelados de antes no tenían motivo: quedan como "otro", del local
update public.pedidos set motivo_cancelacion = 'otro', cancelado_por = 'local' where estado = 'cancelado';
alter table public.pedidos add constraint pedidos_cancelacion_completa
  check ((estado = 'cancelado') = (motivo_cancelacion is not null and cancelado_por is not null));

-- Días que se guarda un pedido listo para retirar
alter table public.configuracion_tienda
  add column dias_retiro int not null default 7 check (dias_retiro between 1 and 90);

-- ── Cancelar (una sola cuenta para los tres caminos) ──────────────────
-- Libera lo reservado, deja el estado con su motivo y anota la novedad en el seguimiento.
-- Interna: la llaman las funciones de abajo, que son las que controlan quién puede.
create function public._cancelar_pedido(p_pedido bigint, p_motivo text, p_por text, p_comentario text)
returns void language plpgsql security definer set search_path = public as $$
declare v_ped pedidos; it record;
begin
  select * into v_ped from pedidos where id = p_pedido for update;
  if v_ped.estado in ('entregado', 'cancelado') then raise exception 'El pedido ya está %', v_ped.estado; end if;
  if p_motivo is null then raise exception 'Elegí el motivo de la cancelación'; end if;
  for it in select * from pedido_items where pedido_id = p_pedido loop
    update stock set reservado = reservado - it.cantidad where variante_id = it.variante_id and deposito_id = v_ped.deposito_id;
  end loop;
  update pedidos set estado = 'cancelado', motivo_cancelacion = p_motivo, cancelado_por = p_por where id = p_pedido;
  insert into pedido_estados (pedido_id, estado, comentario) values (p_pedido, 'cancelado', nullif(trim(p_comentario), ''));
end $$;
revoke execute on function public._cancelar_pedido(bigint, text, text, text) from public, anon, authenticated;

-- El equipo: la cancelación ahora pide motivo (p_motivo, al final para no romper las llamadas de antes)
drop function public.cambiar_estado_pedido(bigint, text, text, jsonb);
create function public.cambiar_estado_pedido(
  p_pedido bigint, p_estado text, p_comentario text default null, p_pagos jsonb default '[]', p_motivo text default null
) returns bigint language plpgsql security definer set search_path = public as $$
declare v_ped pedidos; it record; v_venta bigint;
begin
  if not tiene_permiso('pedidos.gestionar') then raise exception 'Solo el equipo puede cambiar el estado de un pedido'; end if;
  select * into v_ped from pedidos where id = p_pedido for update;
  if not found then raise exception 'El pedido no existe'; end if;
  if v_ped.estado in ('entregado','cancelado') then raise exception 'El pedido ya está %', v_ped.estado; end if;

  if p_estado = 'cancelado' then
    perform _cancelar_pedido(p_pedido, p_motivo, 'local', p_comentario);
    return null;
  end if;

  if p_estado = 'entregado' then
    for it in select * from pedido_items where pedido_id = p_pedido loop
      update stock set reservado = reservado - it.cantidad where variante_id = it.variante_id and deposito_id = v_ped.deposito_id;
    end loop;
    v_venta := _registrar_venta(
      (select jsonb_agg(jsonb_build_object('variante_id', pi.variante_id, 'cantidad', pi.cantidad, 'precio_unitario', pi.precio_unitario,
                                           'descuento_promo', pi.descuento_promo, 'promocion_id', pi.promocion_id,
                                           'acumula', coalesce(pr.acumula_medio_pago, true)))
         from pedido_items pi left join promociones pr on pr.id = pi.promocion_id where pi.pedido_id = p_pedido),
      case when jsonb_array_length(coalesce(p_pagos, '[]')) = 0
           then jsonb_build_array(jsonb_build_object('medio_pago_id', v_ped.medio_pago_id, 'ajuste_pct', v_ped.ajuste_pct))
           else p_pagos end,
      v_ped.cliente_id, 0, v_ped.canal, v_ped.deposito_id, 'Pedido ' || v_ped.comprobante);
    update ventas set pedido_id = p_pedido where id = v_venta;
  end if;

  update pedidos set estado = p_estado where id = p_pedido;
  insert into pedido_estados (pedido_id, estado, comentario) values (p_pedido, p_estado, p_comentario);
  return v_venta;
end $$;

-- El cliente: su pedido, y solo mientras el local no lo empezó a preparar
create function public.cancelar_mi_pedido(p_pedido bigint, p_motivo text default 'arrepentido', p_comentario text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_estado text;
begin
  select estado into v_estado from pedidos where id = p_pedido and cliente_id = mi_cliente_id() for update;
  if not found then raise exception 'No encontramos ese pedido en tu cuenta'; end if;
  if v_estado = 'cancelado' then raise exception 'Este pedido ya está cancelado'; end if;
  if v_estado not in ('pendiente', 'confirmado') then
    raise exception 'Ya estamos preparando tu pedido: para cancelarlo, escribinos por WhatsApp';
  end if;
  if p_motivo not in ('arrepentido', 'otro') then raise exception 'Motivo no válido'; end if;
  perform _cancelar_pedido(p_pedido, p_motivo, 'cliente', p_comentario);
end $$;
revoke execute on function public.cancelar_mi_pedido(bigint, text, text) from public, anon;
grant execute on function public.cancelar_mi_pedido(bigint, text, text) to authenticated;

-- ── Vencimiento de los pedidos sin retirar ────────────────────────────
-- Hasta qué día se guarda un pedido listo para retirar: desde que pasó a ese estado + dias_retiro
create function public.retirar_hasta(p_pedido bigint) returns timestamptz
language sql stable security definer set search_path = public as $$
  select max(e.fecha) + make_interval(days => (select dias_retiro from configuracion_tienda))
    from pedidos p join pedido_estados e on e.pedido_id = p.id and e.estado = 'listo_retiro'
   where p.id = p_pedido and p.estado = 'listo_retiro'
     and (p.cliente_id = mi_cliente_id() or tiene_permiso('pedidos.gestionar'))
$$;
grant execute on function public.retirar_hasta(bigint) to authenticated;

-- Cancela los vencidos y devuelve cuántos. La corre la base sola todos los días (pg_cron, abajo).
create function public.vencer_pedidos_sin_retirar() returns int
language plpgsql security definer set search_path = public as $$
declare v_id bigint; n int := 0; v_dias int := (select dias_retiro from configuracion_tienda);
begin
  for v_id in
    select p.id from pedidos p
     where p.estado = 'listo_retiro'
       and (select max(e.fecha) from pedido_estados e where e.pedido_id = p.id and e.estado = 'listo_retiro')
           < now() - make_interval(days => v_dias)
  loop
    perform _cancelar_pedido(v_id, 'no_retiro', 'vencimiento',
      format('No se retiró en los %s días que se guarda. El stock volvió a estar a la venta.', v_dias));
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.vencer_pedidos_sin_retirar() from public, anon, authenticated;

-- Todos los días a las 6 de la mañana de Argentina (9 UTC)
create extension if not exists pg_cron;
select cron.schedule('vencer-pedidos-sin-retirar', '0 9 * * *', $$select public.vencer_pedidos_sin_retirar()$$);

-- ── Los renglones de MIS pedidos (arreglo) ────────────────────────────
-- Desde los roles, el cliente no lee variantes/productos/talles/colores (son del equipo), así que el
-- seguimiento de su pedido no podía mostrar qué compró. Esta vista le da solo eso, y solo de sus pedidos.
create view public.v_mis_pedido_items with (security_invoker = false) as
select pi.id, pi.pedido_id, pi.cantidad, pi.precio_unitario, pi.descuento_promo, pr.nombre as promocion,
       p.nombre as modelo, t.nombre as talle, co.nombre as color
from pedido_items pi
join pedidos pe on pe.id = pi.pedido_id
join variantes v on v.id = pi.variante_id
join productos p on p.id = v.producto_id
join talles t on t.id = v.talle_id
join colores co on co.id = v.color_id
left join promociones pr on pr.id = pi.promocion_id
where pe.cliente_id = mi_cliente_id();
revoke select on public.v_mis_pedido_items from anon;
grant select on public.v_mis_pedido_items to authenticated;
