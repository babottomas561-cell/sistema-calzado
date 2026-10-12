-- Roles a la medida del local (el dueño y su familia; sin cajas ni cajeros):
--   · «Cajero» pasa a ser «Vendedor»: vende, hace cambios y devoluciones dentro del plazo, atiende pedidos
--     web y clientes, ve el stock. NO ve costos ni ganancias, NO cambia precios, NO anula ni acepta
--     devoluciones fuera de plazo, NO ve informes ni lo que venden los demás. Descuento manual: hasta 10 %.
--   · «Depósito» se desactiva (si nadie lo tiene asignado); se puede reactivar en Equipo.
--   · Administrador y Encargado quedan como estaban.
-- Y para que un vendedor pueda hacer el cambio de una venta que hizo OTRO de la familia (sin ver las ventas
-- ajenas): buscar la venta por el número del ticket o por el cliente, y leerla para el cambio, por funciones
-- que piden el permiso de vender y muestran solo lo necesario.

update public.roles
   set nombre = 'Vendedor',
       descripcion = 'Vende y atiende: ventas, cambios y devoluciones dentro del plazo, pedidos web y clientes. Ve el stock; no ve costos, ni informes, ni lo que venden los demás.',
       permisos = '{ventas.registrar,pedidos.gestionar,clientes.ver,clientes.editar,stock.ver}',
       descuento_max_pct = 10
 where nombre = 'Cajero';

update public.roles set activo = false
 where nombre = 'Depósito' and not exists (select 1 from perfiles p where p.rol_id = roles.id);

-- ── Devoluciones: cada vendedor ve las suyas; el resto, quien ve las ventas de todos ──
drop policy "equipo ve devoluciones" on public.devoluciones;
create policy "ve devoluciones" on public.devoluciones for select to authenticated
  using (tiene_permiso('ventas.ver_todas') or tiene_permiso('informes.ventas') or usuario_id = auth.uid());
drop policy "equipo ve renglones de devoluciones" on public.devolucion_items;
create policy "ve renglones de devoluciones" on public.devolucion_items for select to authenticated
  using (devolucion_id in (select id from devoluciones));

-- ── Buscar la venta para un cambio (número del ticket o cliente) ───────
-- Devuelve lo justo para reconocerla: número, fecha, cliente y qué se llevó (sin montos).
create function public.ventas_para_cambio(p_buscar text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare q text := trim(coalesce(p_buscar, '')); v_num int; v_dias int := (select dias_cambio from configuracion_tienda);
begin
  if not tiene_permiso('ventas.registrar') then raise exception 'No tenés permiso para hacer cambios'; end if;
  if q = '' or (length(q) < 2 and q !~ '^\d+$') then return '[]'; end if;   -- un número de ticket puede ser corto ("3")
  if q ~ '^\d{1,9}$' then v_num := q::int; end if;   -- "123" = la venta n.º 123
  return (
    select coalesce(jsonb_agg(x order by x->>'fecha' desc), '[]') from (
      select jsonb_build_object(
        'id', v.id, 'comprobante', v.comprobante, 'fecha', v.fecha, 'cliente', c.nombre,
        'productos', (select string_agg(p.nombre || ' (' || t.nombre || ' · ' || co.nombre || case when vi.cantidad > 1 then ' ×' || vi.cantidad else '' end || ')', ', ' order by vi.id)
                        from venta_items vi join variantes va on va.id = vi.variante_id join productos p on p.id = va.producto_id
                        join talles t on t.id = va.talle_id join colores co on co.id = va.color_id where vi.venta_id = v.id),
        'en_plazo', (v.fecha at time zone 'America/Argentina/Buenos_Aires')::date + v_dias >= _hoy_ar()) as x
        from ventas v left join clientes c on c.id = v.cliente_id
       where v.anulada_en is null
         and (v.comprobante = q or v.numero = v_num or c.codigo::text = q
              or c.nombre ilike '%' || q || '%' or regexp_replace(coalesce(c.telefono, ''), '\D', '', 'g') like '%' || regexp_replace(q, '\D', '', 'g') || '%' and length(regexp_replace(q, '\D', '', 'g')) >= 6)
       order by v.fecha desc
       limit 20) s);
end $$;

-- ── Leer una venta para hacerle un cambio o una devolución ─────────────
-- Lo que hace falta para elegir qué vuelve: renglones con precio pagado y cuánto ya se devolvió (sin costos).
create function public.venta_para_cambio(p_venta bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v ventas;
begin
  if not tiene_permiso('ventas.registrar') then raise exception 'No tenés permiso para hacer cambios'; end if;
  select * into v from ventas where id = p_venta;
  if not found then return null; end if;
  return jsonb_build_object(
    'id', v.id, 'comprobante', v.comprobante, 'fecha', v.fecha, 'anulada', v.anulada_en is not null,
    'cliente_id', v.cliente_id, 'cliente', (select nombre from clientes where id = v.cliente_id),
    'visible', puede_ver_venta(v.usuario_id),   -- ¿puede abrir el detalle de la venta?
    'items', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', vi.id, 'producto_id', p.id, 'nombre', p.nombre, 'talle', t.nombre, 'color', co.nombre,
        'cantidad', vi.cantidad, 'precio_unitario', vi.precio_unitario, 'descuento_promo', vi.descuento_promo, 'promocion', pr.nombre,
        'devuelto', coalesce((select sum(di.cantidad) from devolucion_items di where di.venta_item_id = vi.id), 0)) order by vi.id), '[]')
      from venta_items vi join variantes va on va.id = vi.variante_id join productos p on p.id = va.producto_id
      join talles t on t.id = va.talle_id join colores co on co.id = va.color_id left join promociones pr on pr.id = vi.promocion_id
     where vi.venta_id = v.id));
end $$;

revoke execute on function public.ventas_para_cambio(text), public.venta_para_cambio(bigint) from public, anon;
grant execute on function public.ventas_para_cambio(text), public.venta_para_cambio(bigint) to authenticated;

-- ── Reposición: solo quien compra ──────────────────────────────────────
-- Muestra el ritmo de venta de TODO el negocio por talle: es para hacer pedidos al proveedor, no para
-- quien vende (que no ve lo que venden los demás). Antes la veía también quien solo veía el stock.
create or replace function public.reposicion_sugerida(p_dias_ventas integer default 60, p_dias_cobertura integer default 30)
returns table(producto_id bigint, codigo text, nombre text, marca text, proveedor_id bigint, proveedor text, variante_id bigint,
              talle text, talle_orden numeric, color text, color_hex text, vendidos integer, disponible integer, sugerido integer, costo_unitario numeric)
language plpgsql stable security definer set search_path to 'public' as $function$
#variable_conflict use_column
begin
  if not tiene_permiso('compras.registrar') then
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
      -- lo fallado no cuenta como stock para vender
      left join stock s on s.variante_id = v.id and s.deposito_id in (select id from depositos where vendible)
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
