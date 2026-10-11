-- Reposición sugerida: cuántos pares pedir de cada talle y color según lo que se vende.
--
-- Por variante (modelo + talle + color):
--   ritmo     = pares vendidos en los últimos p_dias_ventas días / p_dias_ventas
--   objetivo  = ritmo × p_dias_cobertura (redondeado para arriba), y al menos el stock mínimo si
--               el talle se vendió (para no quedarse en cero en un talle que sale)
--   sugerido  = objetivo − disponible (si da negativo, cero)
-- Lo usa la pantalla Reposición; devuelve solo las variantes con algo para pedir.
-- El costo estimado sale vacío para quien no ve costos (como en las vistas).

create or replace function public.reposicion_sugerida(p_dias_ventas int default 60, p_dias_cobertura int default 30)
returns table (
  producto_id bigint, codigo text, nombre text, marca text, proveedor_id bigint, proveedor text,
  variante_id bigint, talle text, talle_orden numeric, color text, color_hex text,
  vendidos int, disponible int, sugerido int, costo_unitario numeric
) language plpgsql stable security definer set search_path = public as $$
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
     where ve.fecha >= now() - make_interval(days => p_dias_ventas)
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
end $$;

revoke execute on function public.reposicion_sugerida from public, anon;
grant execute on function public.reposicion_sugerida to authenticated;
