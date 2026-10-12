-- Anular una venta del día (paso 2 de docs/DEVOLUCIONES.md).
-- Para una venta que no tendría que existir (se cargó mal, quedó duplicada, el cliente se arrepintió
-- ahí mismo). Un documento hecho no se borra: la venta queda ANULADA con su número, quién y por qué,
-- el stock vuelve con su movimiento y deja de contar en informes, inicio, reposición y la tienda.
-- Solo el mismo día; pasado ese día ya no es un error de carga: es una devolución.

-- ── Permiso ───────────────────────────────────────────────────────────
insert into public.permisos (orden, grupo, codigo, nombre, descripcion) values
  (14, 'Ventas', 'ventas.anular', 'Anular ventas del día',
   'Para una venta cargada por error: el stock vuelve y deja de contar. Solo el mismo día; después se hace una devolución.');
update public.roles set permisos = permisos || '{ventas.anular}' where nombre = 'Encargado' and not ('ventas.anular' = any (permisos));

-- ── La venta anulada ──────────────────────────────────────────────────
alter table public.ventas
  add column anulada_en timestamptz,
  add column anulada_por uuid references public.perfiles (id) on delete set null,
  add column motivo_anulacion text check (motivo_anulacion in ('error_carga', 'duplicada', 'arrepentido', 'otro')),
  add column comentario_anulacion text,
  add constraint ventas_anulacion_completa check ((anulada_en is null) = (motivo_anulacion is null));
create index ventas_anulada_por_idx on public.ventas (anulada_por);

-- El stock que vuelve por una anulación tiene su propio tipo de movimiento
alter table public.movimientos_stock drop constraint movimientos_stock_tipo_check;
alter table public.movimientos_stock add constraint movimientos_stock_tipo_check
  check (tipo in ('venta', 'compra', 'ajuste', 'anulacion'));

create function public.anular_venta(p_venta bigint, p_motivo text, p_comentario text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v ventas; it record; v_ped pedidos;
begin
  if not tiene_permiso('ventas.anular') then raise exception 'No tenés permiso para anular ventas'; end if;
  select * into v from ventas where id = p_venta for update;
  if not found then raise exception 'La venta no existe'; end if;
  if v.anulada_en is not null then raise exception 'Esta venta ya está anulada'; end if;
  if (v.fecha at time zone 'America/Argentina/Buenos_Aires')::date <> (now() at time zone 'America/Argentina/Buenos_Aires')::date then
    raise exception 'Solo se puede anular una venta del día. Para una de otro día, hacé una devolución';
  end if;
  if p_motivo is null or p_motivo not in ('error_carga', 'duplicada', 'arrepentido', 'otro') then raise exception 'Elegí el motivo de la anulación'; end if;
  if p_motivo = 'otro' and coalesce(trim(p_comentario), '') = '' then raise exception 'Contá qué pasó (el motivo es «otro»)'; end if;

  -- Vuelve todo el stock al depósito de la venta
  for it in select variante_id, sum(cantidad)::int as cantidad from venta_items where venta_id = p_venta group by variante_id loop
    perform _mover_stock(it.variante_id, v.deposito_id, it.cantidad, 'anulacion', p_venta, null, 'Anulación de la venta ' || v.comprobante);
  end loop;

  update ventas set anulada_en = now(), anulada_por = auth.uid(), motivo_anulacion = p_motivo,
                    comentario_anulacion = nullif(trim(p_comentario), '')
   where id = p_venta;

  -- Si venía de un pedido web: si fue un error, el pedido vuelve a estar listo (con su reserva) para
  -- entregarlo bien; si el cliente se arrepintió, el pedido queda cancelado.
  if v.pedido_id is not null then
    select * into v_ped from pedidos where id = v.pedido_id for update;
    update ventas set pedido_id = null where id = p_venta;   -- el pedido puede volver a convertirse en venta
    if p_motivo = 'arrepentido' then
      update pedidos set estado = 'cancelado', motivo_cancelacion = 'arrepentido', cancelado_por = 'local' where id = v_ped.id;
      insert into pedido_estados (pedido_id, estado, comentario) values (v_ped.id, 'cancelado', null);
    else
      for it in select variante_id, sum(cantidad)::int as cantidad from pedido_items where pedido_id = v_ped.id group by variante_id loop
        update stock set reservado = reservado + it.cantidad where variante_id = it.variante_id and deposito_id = v_ped.deposito_id;
      end loop;
      update pedidos set estado = case when v_ped.entrega = 'envio' then 'enviado' else 'listo_retiro' end where id = v_ped.id;
      insert into pedido_estados (pedido_id, estado, comentario)
      values (v_ped.id, case when v_ped.entrega = 'envio' then 'enviado' else 'listo_retiro' end, null);
    end if;
  end if;

  -- Si venía de un presupuesto, vuelve a estar vigente (se puede convertir de nuevo, bien)
  update presupuestos set estado = 'vigente', venta_id = null where venta_id = p_venta;
end $$;
revoke execute on function public.anular_venta(bigint, text, text) from public, anon;
grant execute on function public.anular_venta(bigint, text, text) to authenticated;

-- ── Las anuladas dejan de contar ──────────────────────────────────────
-- Informes: sin las anuladas
create or replace view public.v_hechos_ventas with (security_invoker = false) as
select vi.id, ve.id as venta_id, ve.comprobante, ve.fecha, (ve.fecha at time zone 'America/Argentina/Buenos_Aires')::date as dia,
       extract(year from ve.fecha at time zone 'America/Argentina/Buenos_Aires')::int as anio,
       extract(month from ve.fecha at time zone 'America/Argentina/Buenos_Aires')::int as mes,
       extract(isodow from ve.fecha at time zone 'America/Argentina/Buenos_Aires')::int as dia_semana,
       ve.canal, d.nombre as deposito, cl.codigo as cliente_codigo, cl.nombre as cliente, cl.origen as cliente_origen,
       ve.usuario_id as vendedor_id, coalesce(pe.nombre, 'Sin registrar') as vendedor,
       p.codigo as articulo, p.nombre as modelo, m.nombre as marca, ca.codigo as rubro_codigo, ca.nombre as rubro,
       sc.nombre as subrubro, p.genero,
       t.nombre as talle, t.orden as talle_orden, co.nombre as color, v.sku,
       vi.cantidad, vi.precio_unitario, vi.descuento_promo, vi.promocion_id, coalesce(pr.nombre, 'Sin promoción') as promocion,
       case when tiene_permiso('costos.ver') then vi.costo_unitario end as costo_unitario,
       vi.cantidad * vi.precio_unitario as importe,
       case when tiene_permiso('costos.ver') then vi.cantidad * vi.costo_unitario end as costo,
       case when tiene_permiso('costos.ver') then vi.cantidad * (vi.precio_unitario - vi.costo_unitario) - vi.descuento_promo end as margen,
       round((vi.cantidad * vi.precio_unitario - vi.descuento_promo) * ve.total / nullif(ve.subtotal - ve.descuento_promociones, 0), 2) as importe_neto,
       case when tiene_permiso('costos.ver') then
         round((vi.cantidad * vi.precio_unitario - vi.descuento_promo) * ve.total / nullif(ve.subtotal - ve.descuento_promociones, 0)
               - vi.cantidad * vi.costo_unitario, 2) end as margen_neto,
       ve.pedido_id is not null as vino_de_pedido,
       p.escala, p.temporada, p.material, ca.linea
from venta_items vi
join ventas ve on ve.id = vi.venta_id
join depositos d on d.id = ve.deposito_id
left join clientes cl on cl.id = ve.cliente_id
left join perfiles pe on pe.id = ve.usuario_id
left join promociones pr on pr.id = vi.promocion_id
join variantes v on v.id = vi.variante_id
join productos p on p.id = v.producto_id
left join marcas m on m.id = p.marca_id
left join categorias ca on ca.id = p.categoria_id
left join subcategorias sc on sc.id = p.subcategoria_id
join talles t on t.id = v.talle_id
join colores co on co.id = v.color_id
where ve.anulada_en is null and (tiene_permiso('informes.ventas') or tiene_permiso('ventas.ver_todas'));

-- Renglones de una venta: se siguen viendo (el detalle de una anulada también), con la marca de anulada
create or replace view public.v_venta_items with (security_invoker = false) as
select vi.id, vi.venta_id, vi.variante_id, vi.cantidad, vi.precio_unitario, vi.descuento_promo, vi.promocion_id, pr.nombre as promocion,
       case when tiene_permiso('costos.ver') then vi.costo_unitario end as costo_unitario,
       ve.fecha, ve.canal, ve.cliente_id, p.id as producto_id, p.nombre, m.nombre as marca,
       t.nombre as talle, co.nombre as color,
       vi.cantidad * vi.precio_unitario - vi.descuento_promo as subtotal,
       case when tiene_permiso('costos.ver') then vi.cantidad * (vi.precio_unitario - vi.costo_unitario) - vi.descuento_promo end as margen,
       ve.anulada_en is not null as anulada
from venta_items vi
join ventas ve on ve.id = vi.venta_id
join variantes v on v.id = vi.variante_id
join productos p on p.id = v.producto_id
join talles t on t.id = v.talle_id
join colores co on co.id = v.color_id
left join marcas m on m.id = p.marca_id
left join promociones pr on pr.id = vi.promocion_id
where es_staff() and puede_ver_venta(ve.usuario_id);

-- Lo más vendido de la tienda: sin las anuladas
create or replace function public.mas_vendidos_tienda(p_dias int default 90)
returns table (producto_id bigint) language sql stable security definer set search_path = public as $$
  select p.id
    from productos p
    left join variantes v on v.producto_id = p.id
    left join venta_items vi on vi.variante_id = v.id
    left join ventas ve on ve.id = vi.venta_id and ve.anulada_en is null
                       and ve.fecha >= now() - make_interval(days => greatest(p_dias, 1))
   where p.publicado_web and p.activo
   group by p.id
   order by coalesce(sum(vi.cantidad) filter (where ve.id is not null), 0) desc, p.creado_en desc, p.id desc
   limit 60
$$;

-- Reposición: el ritmo de venta, sin las anuladas
create or replace function public.reposicion_sugerida(p_dias_ventas integer default 60, p_dias_cobertura integer default 30)
returns table(producto_id bigint, codigo text, nombre text, marca text, proveedor_id bigint, proveedor text, variante_id bigint,
              talle text, talle_orden numeric, color text, color_hex text, vendidos integer, disponible integer, sugerido integer, costo_unitario numeric)
language plpgsql stable security definer set search_path to 'public' as $function$
#variable_conflict use_column
begin
  if not (tiene_permiso('compras.registrar') or tiene_permiso('stock.ver')) then
    raise exception 'No tenés permiso para ver la reposición';
  end if;
  if p_dias_ventas not between 7 and 365 or p_dias_cobertura not between 7 and 180 then
    raise exception 'Elegí un período de ventas de 7 a 365 días y una cobertura de 7 a 180 días';
  end if;

  return query
  with vendidas as (
    select vi.variante_id, sum(vi.cantidad)::int as pares
      from venta_items vi join ventas ve on ve.id = vi.venta_id
     where ve.fecha >= now() - make_interval(days => p_dias_ventas) and ve.anulada_en is null
     group by vi.variante_id
  ), calculo as (
    select v.id as variante_id, v.producto_id, v.stock_minimo,
           coalesce(vd.pares, 0) as vendidos,
           coalesce(sum(s.cantidad - s.reservado), 0)::int as disponible,
           case when coalesce(vd.pares, 0) = 0 then 0
                else greatest(ceil(vd.pares::numeric / p_dias_ventas * p_dias_cobertura)::int, v.stock_minimo) end as objetivo
      from variantes v
      join productos p on p.id = v.producto_id
      left join vendidas vd on vd.variante_id = v.id
      left join stock s on s.variante_id = v.id
     where p.activo
     group by v.id, vd.pares
  )
  select p.id, p.codigo, p.nombre, m.nombre, pv.id, pv.nombre,
         c.variante_id, t.nombre, t.orden, co.nombre, co.hex,
         c.vendidos, c.disponible, greatest(c.objetivo - c.disponible, 0),
         case when tiene_permiso('costos.ver') then coalesce(pp.precio_compra, p.precio_compra) end
    from calculo c
    join productos p on p.id = c.producto_id
    join variantes v on v.id = c.variante_id
    join talles t on t.id = v.talle_id
    join colores co on co.id = v.color_id
    left join marcas m on m.id = p.marca_id
    left join producto_proveedores pp on pp.producto_id = p.id and pp.principal
    left join proveedores pv on pv.id = pp.proveedor_id
   where c.objetivo - c.disponible > 0
   order by pv.nombre nulls last, p.nombre, co.nombre, t.orden;
end $function$;
