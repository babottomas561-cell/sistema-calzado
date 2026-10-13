-- Pantalla Facturas (ARCA, parte de la fase 4): ventas sin factura y facturarlas en tanda. La lista de facturas y el libro IVA ventas se leen de `facturas`
-- (lo que deja ver su política). Facturar en tanda solo crea las facturas: las manda la cola de a poco (ARCA tarda y la pantalla no espera).

-- Ventas sin factura de un período (para regularizarlas). Quien ve todas las ventas.
create function public.ventas_sin_factura(p_desde date, p_hasta date) returns table (id bigint, comprobante text, fecha timestamptz, total numeric, cliente text, medios text)
language sql stable security definer set search_path = public as $$
  select v.id, v.comprobante, v.fecha, v.total, c.nombre,
         (select string_agg(distinct mp.nombre, ', ') from pagos pg join medios_pago mp on mp.id = pg.medio_pago_id where pg.venta_id = v.id)
    from ventas v left join clientes c on c.id = v.cliente_id
   where tiene_permiso('ventas.ver_todas') and v.anulada_en is null and v.total > 0
     and (v.fecha at time zone 'America/Argentina/Buenos_Aires')::date between p_desde and p_hasta
     and not exists (select 1 from facturas f where f.venta_id = v.id and f.clase = 'factura' and f.estado <> 'cancelada')
   order by v.fecha
   limit 1000
$$;

-- Facturar varias ventas de una vez: crea cada factura (con la fecha de hoy) y la deja en la cola. Devuelve cuántas y qué no se pudo (y por qué).
create function public.facturar_en_tanda(p_ventas bigint[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v bigint; n int := 0; v_err jsonb := '[]';
begin
  if not (tiene_permiso('facturas.emitir') and tiene_permiso('ventas.ver_todas')) then raise exception 'No tenés permiso para facturar en tanda'; end if;
  if coalesce(array_length(p_ventas, 1), 0) > 200 then raise exception 'De a 200 ventas como máximo'; end if;
  foreach v in array coalesce(p_ventas, '{}') loop
    begin
      perform _factura_crear(v);
      n := n + 1;
    exception when others then
      v_err := v_err || jsonb_build_object('venta', (select comprobante from ventas where id = v), 'error', sqlerrm);
    end;
  end loop;
  return jsonb_build_object('creadas', n, 'errores', v_err);
end $$;

revoke execute on function public.ventas_sin_factura(date, date), public.facturar_en_tanda(bigint[]) from public, anon;
grant  execute on function public.ventas_sin_factura(date, date), public.facturar_en_tanda(bigint[]) to authenticated;
