-- Informe de clientes: actividad agregada para decidir a quién contactar. No expone costos ni notas internas.
-- Se calcula en la base para no bajar todo el historial de ventas al navegador.
create function public.informe_clientes(p_desde date, p_hasta date)
returns table (
  cliente_id bigint, codigo integer, nombre text, telefono text,
  primera_compra date, ultima_compra date,
  compras_total bigint, compras_periodo bigint,
  unidades_periodo bigint, vendido_periodo numeric
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not tiene_permiso('clientes.ver') or not tiene_permiso('informes.ventas') then
    raise exception 'No tenés permiso para ver el informe de clientes';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde then raise exception 'Período inválido'; end if;

  return query
  with por_venta as (
    select v.id, v.cliente_id, (v.fecha at time zone 'America/Argentina/Buenos_Aires')::date as dia,
           v.total, coalesce(sum(vi.cantidad), 0)::bigint as unidades
      from ventas v
      join venta_items vi on vi.venta_id = v.id
     where v.cliente_id is not null and v.anulada_en is null
     group by v.id
  )
  select c.id, c.codigo, c.nombre, c.telefono,
         min(pv.dia), max(pv.dia), count(*)::bigint,
         count(*) filter (where pv.dia between p_desde and p_hasta)::bigint,
         coalesce(sum(pv.unidades) filter (where pv.dia between p_desde and p_hasta), 0)::bigint,
         coalesce(sum(pv.total) filter (where pv.dia between p_desde and p_hasta), 0)
    from clientes c
    join por_venta pv on pv.cliente_id = c.id
   group by c.id, c.codigo, c.nombre, c.telefono
   order by vendido_periodo desc, ultima_compra desc;
end $$;

revoke execute on function public.informe_clientes(date, date) from public, anon;
grant execute on function public.informe_clientes(date, date) to authenticated;
