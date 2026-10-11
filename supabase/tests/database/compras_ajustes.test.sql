-- Compras (suma stock y actualiza costos por proveedor) y ajustes de stock.
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
select plan(15);
select prueba.como_equipo();

insert into prueba.ids values ('urbana40n', prueba.variante('Zapatilla Urbana Classic', '40', 'Negro')),
                              ('running42n', prueba.variante('Zapatilla Running Pro', '42', 'Negro')),
                              ('bota37n', prueba.variante('Bota Chelsea', '37', 'Negro')),
                              ('distri', (select id from proveedores where nombre = 'Distribuidora Deportiva SRL')),
                              ('norte', (select id from proveedores where nombre = 'Calzados del Norte'));

-- Compra de 6 pares de la Urbana a $43.000 a la Distribuidora (subió de 41.000)
insert into prueba.ids select 'c1', registrar_compra(
  format('[{"variante_id": %s, "cantidad": 6, "costo_unitario": 43000}]', (select id from prueba.ids where nombre = 'urbana40n'))::jsonb,
  (select id from prueba.ids where nombre = 'distri'), null, true, null, 'A-0001-123', current_date);
select is(prueba.stock((select id from prueba.ids where nombre = 'urbana40n')), 9, 'la compra suma 6 pares (3 + 6)');
select is((select total from compras where id = (select id from prueba.ids where nombre = 'c1')), 258000.00::numeric(12,2), 'total de la compra = 6 × 43.000');
select is((select precio_compra from productos where nombre = 'Zapatilla Urbana Classic'), 43000.00::numeric(12,2), 'actualiza el precio de compra de referencia');
select is((select precio_compra from producto_proveedores where producto_id = (select id from productos where nombre = 'Zapatilla Urbana Classic')
           and proveedor_id = (select id from prueba.ids where nombre = 'distri')), 43000.00::numeric(12,2), 'y el del proveedor');

-- Calzados del Norte tiene 10 % de bonificación en la Running: si se paga 54.000 neto, su lista pasa a 60.000
select registrar_compra(format('[{"variante_id": %s, "cantidad": 2, "costo_unitario": 54000}]', (select id from prueba.ids where nombre = 'running42n'))::jsonb,
  (select id from prueba.ids where nombre = 'norte'));
select results_eq($$ select precio_lista, bonificacion_pct, precio_compra from producto_proveedores
  where producto_id = (select id from productos where nombre = 'Zapatilla Running Pro') and proveedor_id = (select id from prueba.ids where nombre = 'norte') $$,
  $$ values (60000.00::numeric(12,2), 10.00::numeric(5,2), 54000.00::numeric(12,2)) $$, 'respeta la bonificación del proveedor');
select is((select principal from producto_proveedores where producto_id = (select id from productos where nombre = 'Zapatilla Running Pro')
           and proveedor_id = (select id from prueba.ids where nombre = 'norte')), false, 'no le quita el "principal" al proveedor habitual');

-- Sin actualizar costo: suma stock pero no toca precios
select registrar_compra(format('[{"variante_id": %s, "cantidad": 1, "costo_unitario": 1}]', (select id from prueba.ids where nombre = 'urbana40n'))::jsonb, null, null, false);
select is((select precio_compra from productos where nombre = 'Zapatilla Urbana Classic'), 43000.00::numeric(12,2), 'con p_actualizar_costo = false el costo no cambia');

select throws_ok(format($$ select registrar_compra('[{"variante_id": %s, "cantidad": 1, "costo_unitario": 1}]', null, null, true, null, null, current_date + 1) $$,
  (select id from prueba.ids where nombre = 'urbana40n')), 'La fecha de la factura no puede ser futura');
select throws_ok($$ select registrar_compra('[{"variante_id": 1, "cantidad": 1, "costo_unitario": 1}]', 999999) $$, 'El proveedor no existe');

-- Ajustes de stock
select ajustar_stock((select id from prueba.ids where nombre = 'urbana40n'), 8, 'Conteo de inventario');
select is(prueba.stock((select id from prueba.ids where nombre = 'urbana40n')), 8, 'el ajuste deja el stock contado');
select results_eq($$ select tipo, cantidad, motivo from movimientos_stock where variante_id = (select id from prueba.ids where nombre = 'urbana40n') order by id desc limit 1 $$,
  $$ values ('ajuste'::text, -2, 'Conteo de inventario'::text) $$, 'queda registrado con su motivo y la diferencia');
select throws_ok(format($$ select ajustar_stock(%s, 5, '  ') $$, (select id from prueba.ids where nombre = 'urbana40n')), 'Indicá el motivo del ajuste');
select throws_ok(format($$ select ajustar_stock(%s, -1, 'x') $$, (select id from prueba.ids where nombre = 'urbana40n')), 'El stock no puede ser negativo');
select throws_like(format($$ select ajustar_stock(%s, 0, 'Rotura') $$, (select id from prueba.ids where nombre = 'bota37n')), 'Hay 1 pares reservados%', 'no deja el stock debajo de lo reservado');

select is((select count(*)::int from (select s.variante_id from stock s left join movimientos_stock m on m.variante_id = s.variante_id and m.deposito_id = s.deposito_id
  group by s.variante_id, s.cantidad having s.cantidad <> coalesce(sum(m.cantidad), 0)) x), 0, 'stock = suma de movimientos');

select * from finish();
rollback;
