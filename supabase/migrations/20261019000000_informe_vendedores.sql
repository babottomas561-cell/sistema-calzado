-- Informe por vendedor: ventas, ticket, descuentos que otorgó (manuales y autorizados con PIN) y ventas anuladas, para ver quién usa mucho el descuento.
-- No muestra costos ni ganancia. Solo con «Ventas por período» (informes.ventas): el Vendedor no ve lo que venden los demás.
create function public.informe_vendedores(p_desde date, p_hasta date)
returns table (
  vendedor_id uuid, nombre text, ventas bigint, unidades bigint, cobrado numeric,
  base_descuento numeric, descuento_manual numeric, ventas_con_descuento bigint, descuento_max_pct numeric,
  con_pin bigint, anuladas bigint
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not tiene_permiso('informes.ventas') then raise exception 'No tenés permiso para ver el informe de vendedores'; end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde then raise exception 'Período inválido'; end if;
  return query
  with en_periodo as (
    select ve.id, ve.usuario_id, ve.total, ve.descuento, ve.subtotal - ve.descuento_promociones as base, ve.anulada_en
      from ventas ve
     where (ve.fecha at time zone 'America/Argentina/Buenos_Aires')::date between p_desde and p_hasta
  ), unidades as (
    select vi.venta_id, sum(vi.cantidad)::bigint as n from venta_items vi where vi.venta_id in (select id from en_periodo) group by vi.venta_id
  ), pines as (
    select a.para_usuario, count(*)::bigint as n from autorizaciones a
     where a.ok and a.usada_en is not null and (a.usada_en at time zone 'America/Argentina/Buenos_Aires')::date between p_desde and p_hasta
     group by a.para_usuario
  )
  select e.usuario_id, coalesce(pe.nombre, 'Sin registrar'),
         count(*) filter (where e.anulada_en is null)::bigint,
         coalesce(sum(u.n) filter (where e.anulada_en is null), 0)::bigint,
         coalesce(sum(e.total) filter (where e.anulada_en is null), 0),
         coalesce(sum(e.base) filter (where e.anulada_en is null), 0),
         coalesce(sum(e.descuento) filter (where e.anulada_en is null), 0),
         count(*) filter (where e.anulada_en is null and e.descuento > 0)::bigint,
         coalesce(max(round(e.descuento * 100 / nullif(e.base, 0), 1)) filter (where e.anulada_en is null), 0),
         coalesce(max(pi.n), 0)::bigint,
         count(*) filter (where e.anulada_en is not null)::bigint
    from en_periodo e
    left join perfiles pe on pe.id = e.usuario_id
    left join unidades u on u.venta_id = e.id
    left join pines pi on pi.para_usuario = e.usuario_id
   group by e.usuario_id, pe.nombre
   order by 5 desc, 3 desc;
end $$;
revoke execute on function public.informe_vendedores(date, date) from public, anon;
grant execute on function public.informe_vendedores(date, date) to authenticated;
