-- Confirmación de pagos. Un pago recibido a mano en un pedido ya no es una simple constancia:
--   · EFECTIVO: queda «pendiente» hasta que un cajero confirma que el dinero llegó a sus manos (permiso «Confirmar pagos recibidos»). El pedido no cuenta como pagado hasta entonces.
--   · TRANSFERENCIA y otros medios: según lo que decida el dueño (`configuracion_tienda.transferencia_comprobante`): nada, el n.º de operación, o el comprobante adjunto (foto o PDF).
--     Con el comprobante pedido, el pago nace confirmado (el comprobante es la verificación).
--   · Lo que paga el cliente con Mercado Pago (Checkout) se verifica solo: no pide ni confirma nada.
--   · En la caja, una transferencia pide el n.º de operación si el dueño lo exige (la foto no: en el mostrador no se pide).
-- Los pagos anteriores quedan confirmados (eran constancias de lo que ya se había cobrado).

-- ── Permiso ─────────────────────────────────────────────────────────────
insert into public.permisos (orden, grupo, codigo, nombre, descripcion) values
  (18, 'Ventas', 'pagos.confirmar', 'Confirmar pagos recibidos', 'Confirmar que llegó el efectivo de un pedido (o el pago que quedó pendiente). Sin este permiso, quien anota un pago en efectivo lo deja pendiente para que lo confirme un cajero.');
update public.roles set permisos = permisos || '{pagos.confirmar}'
 where not todos and 'ventas.registrar' = any (permisos) and not ('pagos.confirmar' = any (permisos));

-- ── Configuración ───────────────────────────────────────────────────────
alter table public.configuracion_tienda add column transferencia_comprobante text not null default 'no' check (transferencia_comprobante in ('no', 'referencia', 'adjunto'));

create function public.guardar_confirmacion_pagos(p_transferencia text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (tiene_permiso('tablas.medios_pago') or tiene_permiso('tablas.editar')) then raise exception 'No tenés permiso para cambiar los medios de pago'; end if;
  if p_transferencia not in ('no', 'referencia', 'adjunto') then raise exception 'Elegí una de las tres opciones'; end if;
  update configuracion_tienda set transferencia_comprobante = p_transferencia;
end $$;

-- ── Los pagos a mano de un pedido ───────────────────────────────────────
alter table public.pedido_pagos
  add column medio_pago_id bigint references public.medios_pago (id) on delete restrict,
  add column confirmado_en timestamptz,
  add column confirmado_por uuid references auth.users (id) on delete set null,
  add column comprobante_path text check (char_length(comprobante_path) <= 300);
create index pedido_pagos_medio_pago_id_idx on public.pedido_pagos (medio_pago_id);
create index pedido_pagos_confirmado_por_idx on public.pedido_pagos (confirmado_por);
update public.pedido_pagos set confirmado_en = fecha where confirmado_en is null;

-- El comprobante de la transferencia: un archivo privado (solo lo ve el equipo que atiende pedidos)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comprobantes-pago', 'comprobantes-pago', false, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
create policy "pedidos ve comprobantes de pago" on storage.objects for select to authenticated using (bucket_id = 'comprobantes-pago' and public.tiene_permiso('pedidos.gestionar'));
create policy "pedidos sube comprobantes de pago" on storage.objects for insert to authenticated with check (bucket_id = 'comprobantes-pago' and public.tiene_permiso('pedidos.gestionar'));
create policy "pedidos borra comprobantes de pago" on storage.objects for delete to authenticated using (bucket_id = 'comprobantes-pago' and public.tiene_permiso('pedidos.gestionar'));

-- Un pedido está pagado con Mercado Pago o con los pagos a mano YA CONFIRMADOS
create or replace function public.pedido_pagado(p_pedido bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select p.pagado_online or coalesce((select sum(monto) from pedido_pagos where pedido_id = p.id and confirmado_en is not null), 0) + 0.01 >= p.total + p.costo_envio
    from pedidos p where p.id = p_pedido
$$;

-- Registrar un pago recibido. Devuelve {confirmado, motivo}. Con p_confirma y el permiso, un pago en efectivo queda confirmado en el acto; si no, pendiente.
drop function public.registrar_pago_pedido(bigint, numeric, text);
create function public.registrar_pago_pedido(p_pedido bigint, p_monto numeric, p_referencia text default null, p_medio bigint default null,
                                             p_comprobante text default null, p_confirma boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p pedidos; m medios_pago; t configuracion_tienda; v_ref text := nullif(trim(coalesce(p_referencia, '')), ''); v_conf boolean; v_id bigint; v_monto text;
begin
  if not tiene_permiso('pedidos.gestionar') then raise exception 'No tenés permiso para atender pedidos'; end if;
  select * into p from pedidos where id = p_pedido;
  if not found then raise exception 'No existe ese pedido'; end if;
  if p.estado in ('entregado', 'cancelado') then raise exception 'El pedido ya está %', p.estado; end if;
  if coalesce(p_monto, 0) <= 0 then raise exception 'Poné el monto que pagó'; end if;
  select * into m from medios_pago where id = coalesce(p_medio, p.medio_pago_id);
  select * into t from configuracion_tienda;
  if p_comprobante is not null and (p_comprobante !~ ('^pedido-' || p_pedido || '/[A-Za-z0-9._-]{3,200}$') or p_comprobante like '%..%') then raise exception 'El comprobante adjunto no es válido'; end if;
  if m.tipo = 'Efectivo' then
    v_conf := coalesce(p_confirma, true) and tiene_permiso('pagos.confirmar');   -- el efectivo lo confirma un cajero: es quien lo recibió
  else
    if t.transferencia_comprobante = 'referencia' and v_ref is null then raise exception 'Anotá el n.º de operación de la transferencia (la tienda lo pide)'; end if;
    if t.transferencia_comprobante = 'adjunto' and p_comprobante is null then raise exception 'Adjuntá el comprobante de la transferencia (la tienda lo pide)'; end if;
    v_conf := true;   -- con la constancia que se pidió, el pago queda verificado
  end if;
  insert into pedido_pagos (pedido_id, monto, referencia, medio_pago_id, comprobante_path, confirmado_en, confirmado_por)
  values (p_pedido, p_monto, v_ref, m.id, p_comprobante, case when v_conf then now() end, case when v_conf then auth.uid() end) returning id into v_id;
  v_monto := regexp_replace(translate(to_char(p_monto, 'FM999,999,990.00'), ',.', '.,'), ',00$', '');
  insert into pedido_estados (pedido_id, estado, comentario)
  values (p_pedido, p.estado, case when v_conf then format('Pago recibido: $%s%s', v_monto, coalesce(' (' || v_ref || ')', ''))
                                    else format('Pago en efectivo anotado: $%s. Falta que un cajero confirme que lo recibió', v_monto) end);
  return jsonb_build_object('id', v_id, 'confirmado', v_conf);
end $$;

-- Confirmar que el dinero llegó (el cajero)
create function public.confirmar_pago_pedido(p_pago bigint) returns void
language plpgsql security definer set search_path = public as $$
declare q pedido_pagos; p pedidos;
begin
  if not tiene_permiso('pagos.confirmar') then raise exception 'No tenés permiso para confirmar pagos'; end if;
  select * into q from pedido_pagos where id = p_pago for update;
  if not found then raise exception 'Ese pago no existe'; end if;
  if q.confirmado_en is not null then raise exception 'Ese pago ya estaba confirmado'; end if;
  select * into p from pedidos where id = q.pedido_id;
  if p.estado in ('entregado', 'cancelado') then raise exception 'El pedido ya está %', p.estado; end if;
  update pedido_pagos set confirmado_en = now(), confirmado_por = auth.uid() where id = p_pago;
  insert into pedido_estados (pedido_id, estado, comentario)
  values (q.pedido_id, p.estado, format('Pago confirmado: $%s', regexp_replace(translate(to_char(q.monto, 'FM999,999,990.00'), ',.', '.,'), ',00$', '')));
end $$;

-- Un pago anotado por error y todavía sin confirmar se puede sacar
create function public.quitar_pago_pendiente(p_pago bigint) returns void
language plpgsql security definer set search_path = public as $$
declare q pedido_pagos;
begin
  if not tiene_permiso('pedidos.gestionar') then raise exception 'No tenés permiso para atender pedidos'; end if;
  select * into q from pedido_pagos where id = p_pago for update;
  if not found then raise exception 'Ese pago no existe'; end if;
  if q.confirmado_en is not null then raise exception 'Un pago confirmado no se saca: si hubo un error, avisá al administrador'; end if;
  delete from pedido_pagos where id = p_pago;
  insert into pedido_estados (pedido_id, estado, comentario) select q.pedido_id, estado, 'Se sacó un pago pendiente anotado por error' from pedidos where id = q.pedido_id;
end $$;

-- El aviso de «pago recibido» sale cuando el pago está CONFIRMADO (no al anotarlo)
drop trigger pedido_pagos_mail on public.pedido_pagos;
create constraint trigger pedido_pagos_mail after insert on public.pedido_pagos deferrable initially deferred
  for each row when (new.confirmado_en is not null) execute function public._mail_aviso_pago();
create constraint trigger pedido_pagos_mail_confirmado after update of confirmado_en on public.pedido_pagos deferrable initially deferred
  for each row when (old.confirmado_en is null and new.confirmado_en is not null) execute function public._mail_aviso_pago();

-- El comprobante del pedido cuenta solo los pagos confirmados
CREATE OR REPLACE FUNCTION public._comprobante_pedido(p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
declare p pedidos; v_cliente text; v_pagado numeric; v_totales jsonb; v_total numeric;
begin
  select * into p from pedidos where id = p_id;
  if not found then return null; end if;
  select nombre into v_cliente from clientes where id = p.cliente_id;
  v_total := p.total + coalesce(p.costo_envio, 0);
  select coalesce((select sum(monto) from pagos_online where pedido_id = p_id and estado = 'approved'), 0) + coalesce((select sum(monto) from pedido_pagos where pedido_id = p_id and confirmado_en is not null), 0) into v_pagado;
  v_totales := jsonb_build_array(jsonb_build_object('rotulo', 'Subtotal', 'monto', p.subtotal));
  if p.descuento_promociones > 0 then v_totales := v_totales || jsonb_build_object('rotulo', 'Promociones', 'monto', -p.descuento_promociones); end if;
  if p.ajuste_medio_pago <> 0 then
    v_totales := v_totales || jsonb_build_object('rotulo', case when p.ajuste_medio_pago < 0 then 'Descuento por medio de pago' else 'Recargo por medio de pago' end, 'monto', p.ajuste_medio_pago);
  end if;
  if coalesce(p.costo_envio, 0) > 0 then v_totales := v_totales || jsonb_build_object('rotulo', 'Envío', 'monto', p.costo_envio); end if;
  v_totales := v_totales || jsonb_build_object('rotulo', 'Total', 'monto', v_total, 'fuerte', true);
  return jsonb_build_object(
    'tipo', 'pedido', 'titulo', 'Comprobante de pedido', 'numero', p.comprobante, 'fecha', p.fecha, 'anulada', p.estado = 'cancelado',
    'cliente', v_cliente, 'atendio', null, 'origen', null,
    'renglones', (select coalesce(jsonb_agg(jsonb_build_object('detalle', pr.nombre, 'marca', m.nombre, 'variante', 'Talle ' || t.nombre || ' · ' || co.nombre, 'cantidad', i.cantidad,
                    'precio', i.precio_unitario, 'promocion', po.nombre, 'descuento', i.descuento_promo, 'subtotal', i.cantidad * i.precio_unitario - i.descuento_promo) order by i.id), '[]')
                    from pedido_items i join variantes v on v.id = i.variante_id join productos pr on pr.id = v.producto_id join talles t on t.id = v.talle_id join colores co on co.id = v.color_id
                    left join marcas m on m.id = pr.marca_id left join promociones po on po.id = i.promocion_id where i.pedido_id = p.id),
    'totales', v_totales,
    'pagos', (select coalesce(jsonb_agg(x order by x ->> 'fecha'), '[]') from (
                select jsonb_build_object('medio', coalesce(o.medio, 'Mercado Pago'), 'base', o.monto, 'ajuste_pct', 0, 'ajuste', 0, 'monto', o.monto, 'cuotas', coalesce(o.cuotas, 1), 'referencia', o.pago_externo, 'fecha', o.creado_en) x
                  from pagos_online o where o.pedido_id = p_id and o.estado = 'approved'
                union all
                select jsonb_build_object('medio', 'Pago recibido', 'base', q.monto, 'ajuste_pct', 0, 'ajuste', 0, 'monto', q.monto, 'cuotas', 1, 'referencia', q.referencia, 'fecha', q.fecha)
                  from pedido_pagos q where q.pedido_id = p_id and q.confirmado_en is not null) y),
    'saldo', greatest(v_total - v_pagado, 0),
    'leyenda', case when v_pagado >= v_total and v_total > 0 then 'Pedido pagado. Este comprobante no es una factura.' else 'Comprobante de tu pedido. No es una factura.' end);
end $$;

-- No se entrega un pedido con un pago sin confirmar: o se confirma que llegó, o se saca (si no, quedaría colgado para siempre)
create function public._entregar_sin_pagos_pendientes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from pedido_pagos where pedido_id = new.id and confirmado_en is null) then
    raise exception 'Hay un pago anotado sin confirmar: confirmá que lo recibiste (o sacalo si fue un error) antes de entregar el pedido';
  end if;
  return new;
end $$;
create trigger pedidos_entregar_sin_pendientes before update of estado on public.pedidos
  for each row when (new.estado = 'entregado' and old.estado is distinct from new.estado) execute function public._entregar_sin_pagos_pendientes();
revoke execute on function public._entregar_sin_pagos_pendientes() from public, anon, authenticated;

-- ── En la caja: la transferencia pide el n.º de operación si el dueño lo exige ──
-- Al cierre de la operación (no al insertar): al entregar un pedido web la venta se crea antes de marcarla como «de un pedido», y esas no lo piden
-- (el pago ya se verificó en el pedido).
create function public._pago_pide_referencia() returns trigger
language plpgsql security definer set search_path = public as $$
declare v ventas; m medios_pago;
begin
  if (select transferencia_comprobante from configuracion_tienda) = 'no' or nullif(trim(coalesce(new.referencia, '')), '') is not null then return null; end if;
  select * into m from medios_pago where id = new.medio_pago_id;
  if m.tipo <> 'Transferencia' then return null; end if;
  select * into v from ventas where id = new.venta_id;
  if v.pedido_id is not null then return null; end if;
  raise exception 'Para cobrar por transferencia anotá el n.º de operación (la tienda lo pide)';
end $$;
create constraint trigger pagos_pide_referencia after insert on public.pagos deferrable initially deferred for each row execute function public._pago_pide_referencia();

revoke execute on function public._pago_pide_referencia() from public, anon, authenticated;
revoke execute on function public.guardar_confirmacion_pagos(text), public.registrar_pago_pedido(bigint, numeric, text, bigint, text, boolean),
  public.confirmar_pago_pedido(bigint), public.quitar_pago_pendiente(bigint) from public, anon;
grant execute on function public.guardar_confirmacion_pagos(text), public.registrar_pago_pedido(bigint, numeric, text, bigint, text, boolean),
  public.confirmar_pago_pedido(bigint), public.quitar_pago_pendiente(bigint) to authenticated;
