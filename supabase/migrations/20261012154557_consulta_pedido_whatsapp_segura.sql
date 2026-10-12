-- El bot consulta un pedido sin abrir la tabla: exige comprobante exacto y el
-- teléfono del cliente que escribió. Solo devuelve datos aptos para atención.
create or replace function public.consultar_pedido_whatsapp(
  p_comprobante text,
  p_telefono text
) returns table (
  comprobante text,
  estado text,
  entrega text,
  total numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.comprobante, p.estado, p.entrega, p.total
  from public.pedidos p
  join public.clientes c on c.id = p.cliente_id
  where p.comprobante = trim(p_comprobante)
    and c.telefono is not null
    and length(regexp_replace(c.telefono, '\D', '', 'g')) >= 8
    and right(regexp_replace(c.telefono, '\D', '', 'g'), 10)
        = right(regexp_replace(p_telefono, '\D', '', 'g'), 10)
  limit 1
$$;

revoke execute on function public.consultar_pedido_whatsapp(text, text) from public;
grant execute on function public.consultar_pedido_whatsapp(text, text) to anon, authenticated;
