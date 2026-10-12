-- Presupuestos: se arman con el motor de precios, no tocan el stock, congelan lo prometido y se convierten en venta.
begin;
-- ── Ayudas de prueba (viven solo dentro de esta transacción) ──
-- security definer: leen todo aunque la prueba esté actuando como un cliente sin permisos
create extension if not exists pgtap with schema extensions;
create schema prueba;
grant usage on schema prueba to anon, authenticated;
-- id de la variante modelo + talle + color
create function prueba.variante(p_modelo text, p_talle text, p_color text) returns bigint language sql stable security definer set search_path = public as $$
  select v.id from variantes v join productos p on p.id = v.producto_id join talles t on t.id = v.talle_id join colores c on c.id = v.color_id
   where p.nombre = p_modelo and t.nombre = p_talle and c.nombre = p_color $$;
create function prueba.stock(p_variante bigint) returns int language sql stable security definer set search_path = public as $$ select cantidad from stock where variante_id = p_variante $$;
create function prueba.reservado(p_variante bigint) returns int language sql stable security definer set search_path = public as $$ select reservado from stock where variante_id = p_variante $$;
create function prueba.medio(p_codigo text) returns bigint language sql stable security definer set search_path = public as $$ select id from medios_pago where codigo = p_codigo $$;
-- Actuar como el equipo o como el cliente de prueba (los usuarios que crea seed.sql)
create function prueba.como_equipo() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) $$;
create function prueba.como_cliente() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true) $$;
grant execute on all functions in schema prueba to anon, authenticated;
-- Para guardar ids entre pasos
create table prueba.ids (nombre text primary key, id bigint);
grant all on prueba.ids to anon, authenticated;
-- Arma los ítems de cotizar: [{variante, cantidad}]
create function prueba.items(variadic p jsonb[]) returns jsonb language sql as $$ select to_jsonb(p) $$;
create function prueba.par(p_modelo text, p_talle text, p_color text, p_cant int default 1) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('variante_id', prueba.variante(p_modelo, p_talle, p_color), 'cantidad', p_cant) $$;
grant execute on all functions in schema prueba to anon, authenticated;
select plan(15);
select prueba.como_equipo();

-- 2×1 en Adidas (la Urbana Classic vale $79.000)
insert into promociones (nombre, tipo, lleva, paga, prioridad) values ('2x1 Adidas', 'nxm', 2, 1, 10);
insert into promocion_alcances (promocion_id, marca_id) select max(p.id), (select id from marcas where nombre = 'Adidas') from promociones p;

set local role authenticated;
select prueba.como_equipo();
insert into prueba.ids select 'stock0', prueba.stock(prueba.variante('Zapatilla Urbana Classic', '40', 'Negro'));
insert into prueba.ids select 'pre', crear_presupuesto(prueba.items(prueba.par('Zapatilla Urbana Classic', '40', 'Negro', 2)), null, prueba.medio('EFE'), 0, 'WhatsApp', 5, 'Para Lucas');

select results_eq($$ select subtotal, descuento_promociones, ajuste_medio_pago, total, estado from presupuestos where id = (select id from prueba.ids where nombre = 'pre') $$,
  $$ values (158000.00::numeric(12,2), 79000.00::numeric(12,2), -7900.00::numeric(12,2), 71100.00::numeric(12,2), 'vigente'::text) $$, '2×1 y efectivo: el mismo número que cotizar()');
select is((select count(*)::int from presupuesto_items where presupuesto_id = (select id from prueba.ids where nombre = 'pre') and promocion_id is not null), 1, 'guarda la promoción del renglón');
select matches((select comprobante from presupuestos where id = (select id from prueba.ids where nombre = 'pre')), '^0001-0000000[0-9]+$', 'tiene su propio número');
select is((select valido_hasta - (now() at time zone 'America/Argentina/Buenos_Aires')::date from presupuestos where id = (select id from prueba.ids where nombre = 'pre')), 5, 'vale 5 días');
select is(prueba.stock(prueba.variante('Zapatilla Urbana Classic', '40', 'Negro')), (select id::int from prueba.ids where nombre = 'stock0'), 'presupuestar no toca el stock');

-- Descuento manual: se mide después de la promoción y no puede pasar del total
select throws_ok(format($$ select crear_presupuesto('[{"variante_id": %s, "cantidad": 1}]', null, null, 999999999) $$, prueba.variante('Zapatilla Urbana Classic', '40', 'Negro')),
  'El descuento es mayor que el total', 'descuento mayor que el total');
select throws_ok($$ select crear_presupuesto('[]') $$, 'El presupuesto no tiene productos', 'sin productos');

-- Un cliente de la tienda no hace ni ve presupuestos
select prueba.como_cliente();
select throws_ok(format($$ select crear_presupuesto('[{"variante_id": %s, "cantidad": 1}]') $$, prueba.variante('Zapatilla Urbana Classic', '40', 'Negro')),
  'No tenés permiso para hacer presupuestos', 'cliente: no puede presupuestar');
select is((select count(*)::int from presupuestos), 0, 'cliente: no ve presupuestos');

-- Convertir: la promo termina, igual se respeta lo presupuestado
select prueba.como_equipo();
update promociones set activa = false where nombre = '2x1 Adidas';
insert into prueba.ids select 'venta', convertir_presupuesto((select id from prueba.ids where nombre = 'pre'));
select is((select total from ventas where id = (select id from prueba.ids where nombre = 'venta')), 71100.00::numeric(12,2), 'convertido: se respeta la promo y el % del medio presupuestados');
select results_eq($$ select estado, venta_id = (select id from prueba.ids where nombre = 'venta') from presupuestos where id = (select id from prueba.ids where nombre = 'pre') $$,
  $$ values ('convertido'::text, true) $$, 'queda convertido y enlazado a la venta');
select is(prueba.stock(prueba.variante('Zapatilla Urbana Classic', '40', 'Negro')), (select id::int from prueba.ids where nombre = 'stock0') - 2, 'la venta sí descuenta el stock');
select throws_ok(format($$ select convertir_presupuesto(%s) $$, (select id from prueba.ids where nombre = 'pre')), 'Este presupuesto ya se convirtió en venta', 'no se convierte dos veces');

-- Vencido y anulado
insert into prueba.ids select 'viejo', crear_presupuesto(prueba.items(prueba.par('Zapatilla Urbana Classic', '41', 'Negro')), null, prueba.medio('EFE'));
reset role;
update presupuestos set valido_hasta = valido_hasta - 30 where id = (select id from prueba.ids where nombre = 'viejo');
set local role authenticated;
select prueba.como_equipo();
select throws_like(format($$ select convertir_presupuesto(%s) $$, (select id from prueba.ids where nombre = 'viejo')), 'Este presupuesto venció el %', 'vencido: no se convierte');
select lives_ok(format($$ select anular_presupuesto(%s) $$, (select id from prueba.ids where nombre = 'viejo')), 'se puede anular uno vigente');

select * from finish();
rollback;
