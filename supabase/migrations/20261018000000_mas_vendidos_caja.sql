-- Caja: «los más vendidos» a un toque. Devuelve los modelos que más se vendieron en los últimos días (solo unidades por modelo,
-- sin montos ni costos), sumando TODAS las ventas del local aunque las haya hecho otra persona: el Vendedor no ve las ventas de los
-- demás, pero esto no revela quién vendió ni cuánto se cobró. Las ventas anuladas no cuentan.
create or replace function public.mas_vendidos_caja(p_dias int default 30, p_limite int default 8)
returns table (producto_id bigint, unidades bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not tiene_permiso('ventas.registrar') then raise exception 'No tenés permiso para vender'; end if;
  return query
    select v.producto_id, sum(i.cantidad)::bigint
      from venta_items i
      join ventas ve on ve.id = i.venta_id
      join variantes v on v.id = i.variante_id
     where ve.anulada_en is null
       and ve.fecha >= now() - make_interval(days => greatest(1, least(coalesce(p_dias, 30), 365)))
     group by v.producto_id
     order by sum(i.cantidad) desc, v.producto_id
     limit greatest(1, least(coalesce(p_limite, 8), 24));
end $$;
revoke execute on function public.mas_vendidos_caja(int, int) from public, anon;
grant execute on function public.mas_vendidos_caja(int, int) to authenticated;
