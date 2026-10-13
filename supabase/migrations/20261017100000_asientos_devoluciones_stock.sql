-- Contabilidad, fase B2: asientos de devoluciones (y por lo tanto de cambios), ajustes de stock, fallados y ajustes del crédito con proveedores.
-- Mismas reglas que la B1 (docs/PLAN_DE_CUENTAS.md): triggers que arman el asiento con lo que cada operación ya guardó; si no cuadra, se deshace todo.

-- ── Devolución ───────────────────────────────────────────────────────────
-- Debe: las ventas que se devuelven (por artículo) y la mercadería que vuelve a su costo.
-- Haber: el saldo a favor del cliente, los descuentos que se le habían hecho (no se devuelven) y el costo de lo vendido que se revierte.
-- Lo fallado vuelve igual a Mercaderías (sigue siendo stock, en el depósito de fallados): su pérdida se asienta cuando se da de baja o se devuelve al proveedor.
create function public._trg_asiento_devolucion() returns trigger language plpgsql security definer set search_path = public as $$
declare d devoluciones; v ventas; l jsonb := '[]'; r record; v_lista numeric; v_resto numeric; v_parte numeric; n int; k int := 0;
begin
  select * into d from devoluciones where id = new.id;
  select * into v from ventas where id = d.venta_id;
  select coalesce(sum(di.cantidad * vi.precio_unitario), 0), count(*) into v_lista, n
    from devolucion_items di join venta_items vi on vi.id = di.venta_item_id where di.devolucion_id = d.id;
  if d.bruto <= 0 and d.total <= 0 then return null; end if;
  v_resto := d.bruto;
  for r in select cuenta_venta_de(p.id) as cv, cuenta_costo_de(p.id) as cc, di.cantidad * vi.precio_unitario as lista, di.cantidad * coalesce(vi.costo_unitario, 0) as costo
             from devolucion_items di join venta_items vi on vi.id = di.venta_item_id join variantes va on va.id = vi.variante_id join productos p on p.id = va.producto_id
            where di.devolucion_id = d.id order by di.id loop
    k := k + 1;
    v_parte := case when k = n then v_resto else round(d.bruto * r.lista / nullif(v_lista, 0), 2) end;
    v_resto := v_resto - v_parte;
    l := l || jsonb_build_object('cuenta', r.cv, 'debe', v_parte, 'haber', 0, 'detalle', 'Ventas que se devuelven');
    if r.costo > 0 then
      l := l || jsonb_build_object('cuenta', _cta('mercaderias'), 'debe', r.costo, 'haber', 0, 'detalle', 'Mercadería que vuelve')
             || jsonb_build_object('cuenta', r.cc, 'haber', r.costo, 'debe', 0, 'detalle', 'Costo de lo vendido que se revierte');
    end if;
  end loop;
  if d.total > 0 then l := l || jsonb_build_object('cuenta', _cta('saldos_clientes'), 'haber', d.total, 'debe', 0, 'detalle', 'Saldo a favor del cliente'); end if;
  if d.bruto - d.total > 0 then l := l || jsonb_build_object('cuenta', _cta('descuentos_otorgados'), 'haber', d.bruto - d.total, 'debe', 0, 'detalle', 'Descuentos que no se devuelven'); end if;
  perform _asentar('devolucion', d.id, _fecha_ar(d.fecha), 'Devolución ' || d.comprobante || ' de la venta ' || v.comprobante, l);
  return null;
end $$;
create constraint trigger asiento_devolucion after insert on public.devoluciones deferrable initially deferred for each row execute function public._trg_asiento_devolucion();

-- ── Ajuste de stock (inventario, rotura, pérdida): a costo de referencia ─
create function public._trg_asiento_ajuste_stock() returns trigger language plpgsql security definer set search_path = public as $$
declare v_costo numeric; v_valor numeric;
begin
  if new.tipo <> 'ajuste' or new.cantidad = 0 then return null; end if;
  select coalesce(p.precio_compra, 0) into v_costo from variantes v join productos p on p.id = v.producto_id where v.id = new.variante_id;
  v_valor := abs(new.cantidad) * v_costo;
  if v_valor <= 0 then return null; end if;
  perform _asentar('ajuste_stock', new.id, _fecha_ar(new.fecha), 'Ajuste de stock: ' || coalesce(new.motivo, 'inventario'),
    case when new.cantidad > 0
      then jsonb_build_array(jsonb_build_object('cuenta', _cta('mercaderias'), 'debe', v_valor, 'haber', 0, 'detalle', 'Sobrante'),
                             jsonb_build_object('cuenta', _cta('diferencias_inventario'), 'haber', v_valor, 'debe', 0, 'detalle', 'Diferencia de inventario'))
      else jsonb_build_array(jsonb_build_object('cuenta', _cta('diferencias_inventario'), 'debe', v_valor, 'haber', 0, 'detalle', 'Diferencia de inventario'),
                             jsonb_build_object('cuenta', _cta('mercaderias'), 'haber', v_valor, 'debe', 0, 'detalle', 'Faltante')) end);
  return null;
end $$;
create trigger asiento_ajuste_stock after insert on public.movimientos_stock for each row execute function public._trg_asiento_ajuste_stock();

-- ── Fallados: la baja es una pérdida; devolverlo al proveedor, un crédito con él ──
create function public._trg_asiento_fallado() returns trigger language plpgsql security definer set search_path = public as $$
declare v_valor numeric := new.cantidad * coalesce(new.costo_unitario, 0);
begin
  if v_valor <= 0 then return null; end if;
  perform _asentar('fallado', new.id, _fecha_ar(new.resuelto_en), case new.estado when 'baja' then 'Baja de fallado' else 'Fallado devuelto al proveedor' end,
    jsonb_build_array(jsonb_build_object('cuenta', case new.estado when 'baja' then _cta('fallados_baja') else _cta('credito_proveedores') end, 'debe', v_valor, 'haber', 0,
                                         'detalle', case new.estado when 'baja' then 'Pérdida de mercadería fallada' else 'Crédito con el proveedor' end),
                      jsonb_build_object('cuenta', _cta('mercaderias'), 'haber', v_valor, 'debe', 0, 'detalle', 'Sale de Mercaderías')));
  return null;
end $$;
create trigger asiento_fallado after update of estado on public.fallados for each row
  when (old.estado = 'pendiente' and new.estado in ('baja', 'proveedor')) execute function public._trg_asiento_fallado();

-- ── Ajuste manual del crédito con un proveedor (nota de crédito, algo que no reconoció) ──
create function public._trg_asiento_credito_proveedor() returns trigger language plpgsql security definer set search_path = public as $$
declare v_prov bigint := coalesce((select cuenta_id from proveedores where id = new.proveedor_id), _cta('proveedores'));
begin
  if new.tipo <> 'ajuste' or new.monto = 0 then return null; end if;
  perform _asentar('credito_proveedor', new.id, _fecha_ar(new.fecha), 'Ajuste del crédito con el proveedor' || coalesce(': ' || new.nota, ''),
    case when new.monto > 0
      then jsonb_build_array(jsonb_build_object('cuenta', _cta('credito_proveedores'), 'debe', new.monto, 'haber', 0, 'detalle', 'Crédito a favor'),
                             jsonb_build_object('cuenta', v_prov, 'haber', new.monto, 'debe', 0, 'detalle', 'Menos deuda con el proveedor'))
      else jsonb_build_array(jsonb_build_object('cuenta', v_prov, 'debe', -new.monto, 'haber', 0, 'detalle', 'Más deuda con el proveedor'),
                             jsonb_build_object('cuenta', _cta('credito_proveedores'), 'haber', -new.monto, 'debe', 0, 'detalle', 'Crédito que se reduce')) end);
  return null;
end $$;
create trigger asiento_credito_proveedor after insert on public.creditos_proveedor for each row execute function public._trg_asiento_credito_proveedor();

revoke execute on function public._trg_asiento_devolucion(), public._trg_asiento_ajuste_stock(), public._trg_asiento_fallado(), public._trg_asiento_credito_proveedor() from public, anon, authenticated;
