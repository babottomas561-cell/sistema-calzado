-- Ventas de mostrador: stock, importes, pagos con descuento/recargo, numeración y validaciones.
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
select plan(17);
select prueba.como_equipo();

insert into prueba.ids values ('urbana40n', prueba.variante('Zapatilla Urbana Classic', '40', 'Negro')),
                              ('urbana40b', prueba.variante('Zapatilla Urbana Classic', '40', 'Blanco')),
                              ('bota37n',   prueba.variante('Bota Chelsea', '37', 'Negro'));
select is(prueba.stock((select id from prueba.ids where nombre = 'urbana40n')), 3, 'arranca con 3 pares');

-- Venta 1: 2 pares a $79.000, todo en efectivo (−10 %)
insert into prueba.ids select 'v1', registrar_venta(
  jsonb_build_array(jsonb_build_object('variante_id', (select id from prueba.ids where nombre = 'urbana40n'), 'cantidad', 2, 'precio_unitario', 79000)),
  jsonb_build_array(jsonb_build_object('medio_pago_id', prueba.medio('EFE'))));

select is(prueba.stock((select id from prueba.ids where nombre = 'urbana40n')), 1, 'la venta descuenta los 2 pares');
select results_eq($$ select subtotal, descuento, ajuste_medio_pago, total from ventas where id = (select id from prueba.ids where nombre = 'v1') $$,
  $$ values (158000.00::numeric(12,2), 0::numeric(12,2), -15800.00::numeric(12,2), 142200.00::numeric(12,2)) $$, 'total = subtotal − 10 % de efectivo');
select results_eq($$ select base, ajuste_pct, ajuste, monto from pagos where venta_id = (select id from prueba.ids where nombre = 'v1') $$,
  $$ values (158000.00::numeric(12,2), -10.00::numeric(5,2), -15800.00::numeric(12,2), 142200.00::numeric(12,2)) $$, 'el pago guarda base, copia del %, ajuste y monto');
select matches((select comprobante from ventas where id = (select id from prueba.ids where nombre = 'v1')), '^0001-\d{8}$', 'comprobante 0001-00000000');
select is((select sum(cantidad)::int from movimientos_stock where venta_id = (select id from prueba.ids where nombre = 'v1')), -2, 'queda el movimiento de stock');
select is((select costo_unitario from venta_items where venta_id = (select id from prueba.ids where nombre = 'v1')), 41000.00::numeric(12,2), 'guarda una foto del costo al vender');

-- Venta 2: pago mixto con descuento del vendedor: 79.000 − 4.000 = 75.000
-- 45.000 en efectivo (−4.500) + el resto (30.000) en 3 cuotas (+15 % = +4.500) → total 75.000
insert into prueba.ids select 'v2', registrar_venta(
  jsonb_build_array(jsonb_build_object('variante_id', (select id from prueba.ids where nombre = 'urbana40b'), 'cantidad', 1, 'precio_unitario', 79000)),
  jsonb_build_array(jsonb_build_object('medio_pago_id', prueba.medio('EFE'), 'base', 45000), jsonb_build_object('medio_pago_id', prueba.medio('CR3'))),
  null, 4000);
select results_eq($$ select subtotal, descuento, ajuste_medio_pago, total from ventas where id = (select id from prueba.ids where nombre = 'v2') $$,
  $$ values (79000.00::numeric(12,2), 4000.00::numeric(12,2), 0.00::numeric(12,2), 75000.00::numeric(12,2)) $$, 'pago mixto: el descuento y el recargo se compensan');
select results_eq($$ select base, ajuste, monto from pagos where venta_id = (select id from prueba.ids where nombre = 'v2') order by id $$,
  $$ values (45000.00::numeric(12,2), -4500.00::numeric(12,2), 40500.00::numeric(12,2)), (30000.00, 4500.00, 34500.00) $$, 'el pago sin base cubre lo que falta');
select is((select split_part(comprobante, '-', 2)::int from ventas where id = (select id from prueba.ids where nombre = 'v2')),
          (select split_part(comprobante, '-', 2)::int + 1 from ventas where id = (select id from prueba.ids where nombre = 'v1')), 'la numeración es correlativa');

-- Validaciones
select throws_like(format($$ select registrar_venta('[{"variante_id": %s, "cantidad": 5, "precio_unitario": 79000}]') $$, (select id from prueba.ids where nombre = 'urbana40n')),
  'Stock insuficiente%', 'no vende más de lo que hay');
-- Bota 37 negro: 3 en stock pero 1 reservado en un pedido → se pueden vender 2, no 3
select throws_like(format($$ select registrar_venta('[{"variante_id": %s, "cantidad": 3, "precio_unitario": 92000}]') $$, (select id from prueba.ids where nombre = 'bota37n')),
  'Stock insuficiente%', 'lo reservado en pedidos no se vende');
select throws_ok($$ select registrar_venta('[]') $$, 'La venta no tiene productos');
select throws_ok(format($$ select registrar_venta('[{"variante_id": %s, "cantidad": 1, "precio_unitario": 1000}]', '[]', null, 2000) $$, (select id from prueba.ids where nombre = 'urbana40n')),
  'El descuento es mayor que el total');
select throws_ok(format($$ select registrar_venta('[{"variante_id": %s, "cantidad": 1, "precio_unitario": 1000}]', '[{"medio_pago_id": %s, "base": 5000}]') $$,
  (select id from prueba.ids where nombre = 'urbana40n'), prueba.medio('EFE')), 'Los pagos superan el total');
select throws_ok(format($$ select registrar_venta('[{"variante_id": %s, "cantidad": 0, "precio_unitario": 1000}]') $$, (select id from prueba.ids where nombre = 'urbana40n')),
  'Cantidad inválida');

-- La regla de oro: el stock de cada variante es la suma de sus movimientos
select is((select count(*)::int from (select s.variante_id from stock s left join movimientos_stock m on m.variante_id = s.variante_id and m.deposito_id = s.deposito_id
  group by s.variante_id, s.cantidad having s.cantidad <> coalesce(sum(m.cantidad), 0)) x), 0, 'stock = suma de movimientos');

select * from finish();
rollback;
