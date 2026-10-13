-- Contabilidad B2: devoluciones (y cambios), ajustes de stock, fallados (baja y al proveedor) y ajustes del crédito con proveedores. Todos los asientos cuadran.
begin;
create extension if not exists pgtap with schema extensions;
create schema prueba;
grant usage on schema prueba to authenticated;
create function prueba.como_admin() returns void language sql as $$ select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) $$;
create function prueba.hoy() returns date language sql stable as $$ select (now() at time zone 'America/Argentina/Buenos_Aires')::date $$;
create function prueba.variante() returns bigint language sql stable security definer set search_path = public as $$ select variante_id from v_stock where precio_venta > 0 order by disponible desc, variante_id limit 1 $$;
create function prueba.medio(p text) returns bigint language sql stable security definer set search_path = public as $$ select id from medios_pago where codigo = p $$;
create function prueba.cliente() returns bigint language sql stable security definer set search_path = public as $$ select id from clientes where nombre = 'María González' $$;
create function prueba.de(p_origen text, p_doc bigint) returns bigint language sql stable security definer set search_path = public as $$
  select id from asientos where origen = p_origen and documento_id = p_doc and anula_a is null $$;
create function prueba.debe(p_asiento bigint, p_clave text) returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(debe), 0) from asiento_lineas where asiento_id = p_asiento and cuenta_id = (select id from cuentas where clave = p_clave) $$;
create function prueba.haber(p_asiento bigint, p_clave text) returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(haber), 0) from asiento_lineas where asiento_id = p_asiento and cuenta_id = (select id from cuentas where clave = p_clave) $$;
create function prueba.descuadrados() returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from (select asiento_id from asiento_lineas group by 1 having round(sum(debe), 2) <> round(sum(haber), 2)) x $$;
create table prueba.ids (nombre text primary key, id bigint);
grant all on prueba.ids to authenticated;
grant execute on all functions in schema prueba to authenticated;
select plan(13);

set local role authenticated;
select prueba.como_admin();
select ajustar_stock(prueba.variante(), 60, 'Inventario para la prueba');
select iniciar_contabilidad(prueba.hoy());
set constraints all immediate; set constraints all deferred;

-- ── Devolución: una unidad de las dos vendidas, en buen estado ──
insert into prueba.ids select 'v', registrar_venta(jsonb_build_array(jsonb_build_object('variante_id', prueba.variante(), 'cantidad', 2)),
  jsonb_build_array(jsonb_build_object('medio_pago_id', prueba.medio('EFE'))), prueba.cliente());
insert into prueba.ids select 'd', registrar_devolucion((select id from prueba.ids where nombre = 'v'),
  jsonb_build_array(jsonb_build_object('venta_item_id', (select min(id) from venta_items where venta_id = (select id from prueba.ids where nombre = 'v')), 'cantidad', 1, 'estado', 'bueno')), 'talle');
set constraints all immediate; set constraints all deferred;
select ok(prueba.de('devolucion', (select id from prueba.ids where nombre = 'd')) is not null, 'una devolución genera su asiento');
select is(prueba.haber(prueba.de('devolucion', (select id from prueba.ids where nombre = 'd')), 'saldos_clientes'), (select total from devoluciones where id = (select id from prueba.ids where nombre = 'd')), 'el saldo a favor del cliente va al haber');
select is(prueba.debe(prueba.de('devolucion', (select id from prueba.ids where nombre = 'd')), 'mercaderias'),
  (select costo_unitario from venta_items where id = (select min(id) from venta_items where venta_id = (select id from prueba.ids where nombre = 'v'))), 'la mercadería (una unidad) vuelve a su costo');
select is(prueba.debe(prueba.de('devolucion', (select id from prueba.ids where nombre = 'd')), 'ventas_calzado') + prueba.debe(prueba.de('devolucion', (select id from prueba.ids where nombre = 'd')), 'ventas_ropa')
  + prueba.debe(prueba.de('devolucion', (select id from prueba.ids where nombre = 'd')), 'ventas_accesorios') + prueba.debe(prueba.de('devolucion', (select id from prueba.ids where nombre = 'd')), 'ventas_generales'),
  (select bruto from devoluciones where id = (select id from prueba.ids where nombre = 'd')), 'las ventas que se devuelven van al debe');

-- ── Ajuste de stock ──
select ajustar_stock(prueba.variante(), (select cantidad from stock where variante_id = prueba.variante() and deposito_id = deposito_principal()) - 2, 'Se rompieron dos');
set constraints all immediate; set constraints all deferred;
select ok(exists (select 1 from asientos where origen = 'ajuste_stock' and concepto like '%Se rompieron dos%'), 'un faltante de inventario se asienta');
select ok((select debe from asiento_lineas l join asientos a on a.id = l.asiento_id where a.origen = 'ajuste_stock' and a.concepto like '%Se rompieron dos%' and l.cuenta_id = (select id from cuentas where clave = 'diferencias_inventario')) > 0, 'como Diferencia de inventario (debe)');

-- ── Fallado: se devuelve fallado, y se da de baja ──
insert into prueba.ids select 'v2', registrar_venta(jsonb_build_array(jsonb_build_object('variante_id', prueba.variante(), 'cantidad', 1)), jsonb_build_array(jsonb_build_object('medio_pago_id', prueba.medio('DEB'))), prueba.cliente());
select registrar_devolucion((select id from prueba.ids where nombre = 'v2'), jsonb_build_array(jsonb_build_object('venta_item_id', (select min(id) from venta_items where venta_id = (select id from prueba.ids where nombre = 'v2')), 'cantidad', 1, 'estado', 'fallado')), 'fallado');
insert into prueba.ids select 'f', id from fallados order by id desc limit 1;
select resolver_fallado((select id from prueba.ids where nombre = 'f'), 'baja');
set constraints all immediate; set constraints all deferred;
select ok(prueba.de('fallado', (select id from prueba.ids where nombre = 'f')) is not null, 'dar de baja un fallado genera su asiento');
select is(prueba.debe(prueba.de('fallado', (select id from prueba.ids where nombre = 'f')), 'fallados_baja'), (select cantidad * costo_unitario from fallados where id = (select id from prueba.ids where nombre = 'f')), 'la pérdida va a Mercadería fallada dada de baja');
select is(prueba.haber(prueba.de('fallado', (select id from prueba.ids where nombre = 'f')), 'mercaderias'), prueba.debe(prueba.de('fallado', (select id from prueba.ids where nombre = 'f')), 'fallados_baja'), 'y sale de Mercaderías');

-- ── Fallado devuelto al proveedor y ajuste del crédito ──
select registrar_devolucion((select id from prueba.ids where nombre = 'v'), jsonb_build_array(jsonb_build_object('venta_item_id', (select min(id) from venta_items where venta_id = (select id from prueba.ids where nombre = 'v')), 'cantidad', 1, 'estado', 'fallado')), 'fallado');
insert into prueba.ids select 'f2', id from fallados order by id desc limit 1;
select resolver_fallado((select id from prueba.ids where nombre = 'f2'), 'proveedor', null, (select id from proveedores order by id limit 1));
set constraints all immediate; set constraints all deferred;
select ok(prueba.debe(prueba.de('fallado', (select id from prueba.ids where nombre = 'f2')), 'credito_proveedores') > 0, 'devuelto al proveedor: crédito con el proveedor');
select ajustar_credito_proveedor((select id from proveedores order by id limit 1), 1500, 'Nota de crédito');
set constraints all immediate; set constraints all deferred;
select is(prueba.debe(prueba.de('credito_proveedor', (select max(id) from creditos_proveedor)), 'credito_proveedores'), 1500::numeric, 'un ajuste a favor suma al crédito');
select is(prueba.haber(prueba.de('credito_proveedor', (select max(id) from creditos_proveedor)), 'proveedores'), 1500::numeric, 'y baja la deuda con el proveedor');

-- ── Todo cuadra ──
select is(prueba.descuadrados(), 0, 'todos los asientos cuadran');
select * from finish();
rollback;
