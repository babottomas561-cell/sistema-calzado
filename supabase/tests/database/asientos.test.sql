-- Contabilidad B1: el motor de asientos (cuadran, no se editan), la apertura y los asientos de venta, anulación, compra y gasto.
-- Los asientos se arman con triggers diferidos (al cerrar la transacción): en las pruebas se fuerzan con «set constraints all immediate» y se vuelve a diferir.
begin;
create extension if not exists pgtap with schema extensions;
create schema prueba;
grant usage on schema prueba to authenticated;
create function prueba.como_admin() returns void language sql as $$ select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) $$;
create function prueba.como_vendedora() returns void language sql as $$ select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true) $$;
create function prueba.variante() returns bigint language sql stable security definer set search_path = public as $$
  select variante_id from v_stock where precio_venta > 0 order by disponible desc, variante_id limit 1 $$;
create function prueba.medio(p text) returns bigint language sql stable security definer set search_path = public as $$ select id from medios_pago where codigo = p $$;
create function prueba.cta(p text) returns bigint language sql stable security definer set search_path = public as $$ select id from cuentas where clave = p $$;
create function prueba.cuantos() returns int language sql stable security definer set search_path = public as $$ select count(*)::int from asientos $$;
create function prueba.de(p_origen text, p_doc bigint) returns bigint language sql stable security definer set search_path = public as $$
  select id from asientos where origen = p_origen and documento_id is not distinct from p_doc and anula_a is null $$;
create function prueba.debe(p_asiento bigint, p_clave text) returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(debe), 0) from asiento_lineas where asiento_id = p_asiento and cuenta_id = (select id from cuentas where clave = p_clave) $$;
create function prueba.haber(p_asiento bigint, p_clave text) returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(haber), 0) from asiento_lineas where asiento_id = p_asiento and cuenta_id = (select id from cuentas where clave = p_clave) $$;
create function prueba.descuadrados() returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from (select asiento_id from asiento_lineas group by 1 having round(sum(debe), 2) <> round(sum(haber), 2)) x $$;
create function prueba.saldo(p_clave text) returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(debe - haber), 0) from asiento_lineas where cuenta_id = (select id from cuentas where clave = p_clave) $$;
create function prueba.hoy() returns date language sql stable as $$ select (now() at time zone 'America/Argentina/Buenos_Aires')::date $$;
create table prueba.ids (nombre text primary key, id bigint);
grant all on prueba.ids to authenticated;
grant execute on all functions in schema prueba to authenticated;
select plan(33);

set local role authenticated;
select prueba.como_admin();
select ajustar_stock(prueba.variante(), 50, 'Inventario para la prueba');

-- ── Sin contabilidad iniciada no se asienta nada ──
insert into prueba.ids select 'v0', registrar_venta(jsonb_build_array(jsonb_build_object('variante_id', prueba.variante(), 'cantidad', 1)), jsonb_build_array(jsonb_build_object('medio_pago_id', prueba.medio('EFE'))));
set constraints all immediate; set constraints all deferred;
select is(prueba.cuantos(), 0, 'sin iniciar la contabilidad, una venta no genera asiento');

-- ── Permisos y apertura ──
select prueba.como_vendedora();
select throws_ok($$ select iniciar_contabilidad(prueba.hoy()) $$, 'No tenés permiso para iniciar la contabilidad', 'la vendedora no la inicia');
select throws_ok($$ select * from libro_diario(prueba.hoy(), prueba.hoy()) $$, 'No tenés permiso para ver la contabilidad', 'ni ve el libro diario');
select prueba.como_admin();
select throws_ok($$ select iniciar_contabilidad(prueba.hoy() + 2) $$, 'Elegí una fecha de hoy o anterior', 'no se puede iniciar en el futuro');
select ok(iniciar_contabilidad(prueba.hoy()) is not null, 'la contabilidad empieza con su asiento de apertura');
select ok(prueba.debe(prueba.de('apertura', null), 'mercaderias') > 0, 'la apertura trae el stock valorizado a costo');
select is(prueba.descuadrados(), 0, 'y cuadra (la diferencia va a Capital)');
select throws_like($$ select iniciar_contabilidad(prueba.hoy()) $$, 'La contabilidad ya empezó el%', 'no se inicia dos veces');

-- ── Venta en efectivo con redondeo ──
insert into prueba.ids select 'v1', registrar_venta(jsonb_build_array(jsonb_build_object('variante_id', prueba.variante(), 'cantidad', 2)),
  jsonb_build_array(jsonb_build_object('medio_pago_id', prueba.medio('EFE'), 'redondeo', 37)));
set constraints all immediate; set constraints all deferred;
select ok(prueba.de('venta', (select id from prueba.ids where nombre = 'v1')) is not null, 'una venta genera su asiento');
select is(prueba.debe(prueba.de('venta', (select id from prueba.ids where nombre = 'v1')), 'caja'), (select monto from pagos where venta_id = (select id from prueba.ids where nombre = 'v1')), 'el efectivo entra a Caja por lo cobrado');
select ok(prueba.debe(prueba.de('venta', (select id from prueba.ids where nombre = 'v1')), 'descuentos_otorgados') > 0, 'el descuento del efectivo (y el redondeo) va a Descuentos otorgados');
select ok(prueba.debe(prueba.de('venta', (select id from prueba.ids where nombre = 'v1')), 'costo_ropa') + prueba.debe(prueba.de('venta', (select id from prueba.ids where nombre = 'v1')), 'costo_calzado') + prueba.debe(prueba.de('venta', (select id from prueba.ids where nombre = 'v1')), 'costo_accesorios') + prueba.debe(prueba.de('venta', (select id from prueba.ids where nombre = 'v1')), 'costo_general') > 0, 'y el costo de lo vendido se asienta');
select is(prueba.haber(prueba.de('venta', (select id from prueba.ids where nombre = 'v1')), 'mercaderias'),
  (select sum(cantidad * costo_unitario) from venta_items where venta_id = (select id from prueba.ids where nombre = 'v1')), 'saliendo de Mercaderías');

-- ── Venta con débito y una parte sin cobrar ──
insert into prueba.ids select 'v2', registrar_venta(jsonb_build_array(jsonb_build_object('variante_id', prueba.variante(), 'cantidad', 1)),
  jsonb_build_array(jsonb_build_object('medio_pago_id', prueba.medio('DEB'), 'base', 10000)));
set constraints all immediate; set constraints all deferred;
select is(prueba.debe(prueba.de('venta', (select id from prueba.ids where nombre = 'v2')), 'tarjetas_cobrar'), 10000::numeric, 'lo cobrado con débito va a Tarjetas a cobrar');
select ok(prueba.debe(prueba.de('venta', (select id from prueba.ids where nombre = 'v2')), 'deudores_ventas') > 0, 'y lo que no se cobró queda en Deudores por ventas');

-- ── Anulación: el contra-asiento ──
select anular_venta((select id from prueba.ids where nombre = 'v1'), 'error_carga');
set constraints all immediate; set constraints all deferred;
select ok(exists (select 1 from asientos where origen = 'anulacion_venta' and documento_id = (select id from prueba.ids where nombre = 'v1')), 'anular una venta genera el asiento contrario');
select is((select sum(debe - haber) from asiento_lineas l join asientos a on a.id = l.asiento_id where a.documento_id = (select id from prueba.ids where nombre = 'v1') and a.origen in ('venta', 'anulacion_venta')
  and l.cuenta_id = prueba.cta('caja')), 0::numeric, 'y la Caja de esa venta queda en cero');

-- ── Compra y gasto ──
insert into prueba.ids select 'c1', registrar_compra(format('[{"variante_id": %s, "cantidad": 3, "costo_unitario": 1000}]', prueba.variante())::jsonb);
set constraints all immediate; set constraints all deferred;
select is(prueba.debe(prueba.de('compra', (select id from prueba.ids where nombre = 'c1')), 'mercaderias'), 3000::numeric, 'una compra suma a Mercaderías lo que entró');
select is(prueba.haber(prueba.de('compra', (select id from prueba.ids where nombre = 'c1')), 'proveedores'), 3000::numeric, 'y la deuda con el proveedor');
reset role;
insert into gastos (categoria_id, descripcion, importe) values ((select id from gasto_categorias where lower(nombre) = 'publicidad'), 'Cartel', 5000);
set local role authenticated; select prueba.como_admin();
select is(prueba.debe(prueba.de('gasto', (select max(id) from gastos)), 'gasto_publicidad'), 5000::numeric, 'un gasto va a la cuenta de su categoría');
select is(prueba.haber(prueba.de('gasto', (select max(id) from gastos)), 'caja'), 5000::numeric, 'contra la Caja');

-- ── Asiento manual ──
select throws_like(format($$ select registrar_asiento_manual(prueba.hoy(), 'Desbalanceado', '[{"cuenta": %s, "debe": 100}, {"cuenta": %s, "haber": 90}]'::jsonb) $$, prueba.cta('caja'), prueba.cta('capital')),
  'El asiento de Desbalanceado no cuadra%', 'un asiento que no cuadra se rechaza');
select ok(registrar_asiento_manual(prueba.hoy(), 'Saldo inicial de caja', format('[{"cuenta": %s, "debe": 50000}, {"cuenta": %s, "haber": 50000}]', prueba.cta('caja'), prueba.cta('capital'))::jsonb) is not null, 'uno que cuadra se registra');
select throws_like(format($$ select registrar_asiento_manual(prueba.hoy(), 'A un grupo', '[{"cuenta": %s, "debe": 10}, {"cuenta": %s, "haber": 10}]'::jsonb) $$, (select id from cuentas where codigo = '1100000'), prueba.cta('capital')),
  'La cuenta 1100000 no recibe movimientos%', 'no se asienta en una cuenta que agrupa');

select is((select count(*)::int from asiento_lineas where asiento_id = prueba.de('manual', null)), 2, 'el asiento manual quedó con sus dos renglones');
select throws_ok(format($$ select registrar_asiento_manual(prueba.hoy(), 'Con ambos lados', '[{"cuenta": %s, "debe": 5, "haber": 5}]'::jsonb) $$, prueba.cta('caja')),
  'Cada renglón del asiento va al debe o al haber, con un importe positivo', 'un renglón no puede ser del debe y del haber a la vez');

select throws_like(format($$ select guardar_cuenta(%s, '1102002', 'Deudores por ventas', 'activo', true, false) $$, (select id from cuentas where codigo = '1102002')), 'Esa cuenta la usa el sistema%', 'una cuenta del sistema no se desactiva');

-- ── Inmutables y cuadrados ──
reset role;
select throws_ok($$ update asientos set concepto = 'otro' $$, 'Los asientos no se editan ni se borran: para corregir uno, se hace el asiento contrario', 'un asiento no se edita');
select throws_ok($$ delete from asiento_lineas $$, 'Los asientos no se editan ni se borran: para corregir uno, se hace el asiento contrario', 'ni se borran sus renglones');
select is(prueba.descuadrados(), 0, 'todos los asientos cuadran');

-- ── Libros ──
set local role authenticated; select prueba.como_admin();
select is((select count(distinct asiento_id)::int from libro_diario(prueba.hoy(), prueba.hoy())), prueba.cuantos(), 'el libro diario trae todos los asientos del día');
select is((select sum(debe) from sumas_y_saldos(prueba.hoy())), (select sum(haber) from sumas_y_saldos(prueba.hoy())), 'sumas y saldos: el debe es igual al haber');
select is((select saldo from mayor_cuenta(prueba.cta('caja'), prueba.hoy(), prueba.hoy()) order by numero desc limit 1), prueba.saldo('caja'), 'el mayor termina en el saldo de la cuenta');

select * from finish();
rollback;
