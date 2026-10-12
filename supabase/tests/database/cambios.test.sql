-- Cambios en una sola operación: mismo artículo sin diferencia (aunque haya subido), otro artículo al precio de
-- hoy pagando la diferencia o quedando saldo, y todo atado (devolución + venta nueva).
begin;
create extension if not exists pgtap with schema extensions;
create schema prueba;
grant usage on schema prueba to anon, authenticated;
create function prueba.variante(p_modelo text, p_talle text, p_color text) returns bigint language sql stable security definer set search_path = public as $$
  select v.id from variantes v join productos p on p.id = v.producto_id join talles t on t.id = v.talle_id join colores c on c.id = v.color_id
   where p.nombre = p_modelo and t.nombre = p_talle and c.nombre = p_color $$;
create function prueba.en(p_variante bigint, p_deposito text) returns int language sql stable security definer set search_path = public as $$
  select coalesce((select s.cantidad from stock s join depositos d on d.id = s.deposito_id where s.variante_id = p_variante and d.nombre = p_deposito), 0) $$;
create function prueba.medio(p_codigo text) returns bigint language sql stable security definer set search_path = public as $$ select id from medios_pago where codigo = p_codigo $$;
create function prueba.cliente(p_nombre text) returns bigint language sql stable security definer set search_path = public as $$ select id from clientes where nombre = p_nombre $$;
create function prueba.saldo(p_cliente bigint) returns numeric language sql stable security definer set search_path = public as $$ select saldo_disponible(p_cliente) $$;
create function prueba.como_equipo() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) $$;
create function prueba.vender(p_modelo text, p_talle text, p_color text, p_cliente bigint) returns bigint language sql as $$
  select registrar_venta(jsonb_build_array(jsonb_build_object('variante_id', prueba.variante(p_modelo, p_talle, p_color), 'cantidad', 1)),
                         jsonb_build_array(jsonb_build_object('medio_pago_id', prueba.medio('EFE'))), p_cliente) $$;
create function prueba.trae(p_venta bigint, p_estado text default 'bueno') returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_array(jsonb_build_object('venta_item_id', (select min(id) from venta_items where venta_id = p_venta), 'cantidad', 1, 'estado', p_estado)) $$;
create function prueba.lleva(p_modelo text, p_talle text, p_color text) returns jsonb language sql stable as $$
  select jsonb_build_array(jsonb_build_object('variante_id', prueba.variante(p_modelo, p_talle, p_color), 'cantidad', 1)) $$;
create function prueba.venta(p_id bigint) returns table (total numeric, renglon numeric) language sql stable security definer set search_path = public as $$
  select v.total, (select precio_unitario from venta_items where venta_id = v.id limit 1) from ventas v where v.id = p_id $$;
create function prueba.cierra_stock() returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from stock s where s.cantidad <> coalesce((select sum(m.cantidad) from movimientos_stock m
                     where m.variante_id = s.variante_id and m.deposito_id = s.deposito_id), 0)) $$;
grant execute on all functions in schema prueba to anon, authenticated;
create table prueba.ids (nombre text primary key, id bigint);
grant all on prueba.ids to anon, authenticated;
select plan(19);

set local role authenticated;
select prueba.como_equipo();

-- ── A. Mismo artículo, otro talle, y el precio subió: sin diferencia ──
insert into prueba.ids select 'va', prueba.vender('Zapatilla Urbana Classic', '40', 'Negro', prueba.cliente('María González'));
update productos set precio_venta = 99000 where nombre = 'Zapatilla Urbana Classic';
select results_eq(format($$ select (c->>'credito')::numeric, (c->>'total_nuevo')::numeric, (c->>'a_pagar')::numeric from cotizar_cambio(%s, prueba.trae(%s), prueba.lleva('Zapatilla Urbana Classic', '41', 'Negro')) c $$,
  (select id from prueba.ids where nombre = 'va'), (select id from prueba.ids where nombre = 'va')),
  $$ values (71100.00, 71100.00, 0.00) $$, 'cotiza: el talle nuevo vale lo que pagó por el otro, aunque hoy cueste más');
insert into prueba.ids select 'ca', (registrar_cambio((select id from prueba.ids where nombre = 'va'), prueba.trae((select id from prueba.ids where nombre = 'va')),
  prueba.lleva('Zapatilla Urbana Classic', '41', 'Negro'))->>'venta_id')::bigint;
select is(prueba.en(prueba.variante('Zapatilla Urbana Classic', '40', 'Negro'), 'Local'), 3, 'el talle 40 vuelve al Local');
select is(prueba.en(prueba.variante('Zapatilla Urbana Classic', '41', 'Negro'), 'Local'), 2, 'y sale el 41');
select results_eq(format($$ select * from prueba.venta(%s) $$, (select id from prueba.ids where nombre = 'ca')),
  $$ values (71100.00::numeric(12,2), 71100.00::numeric(12,2)) $$, 'la venta nueva es de $71.100');
select is((select sum(monto) from pagos where venta_id = (select id from prueba.ids where nombre = 'ca') and medio_pago_id = prueba.medio('SAF')), 71100.00,
  'y se paga entera con el saldo de lo que trajo');
select is(prueba.saldo(prueba.cliente('María González')), 0.00, 'no le queda saldo ni debe nada');
select is((select venta_cambio_id from devoluciones where venta_id = (select id from prueba.ids where nombre = 'va')), (select id from prueba.ids where nombre = 'ca'),
  'la devolución queda atada a la venta del cambio');
update productos set precio_venta = 79000 where nombre = 'Zapatilla Urbana Classic';

-- ── B. Otro artículo, más caro: paga la diferencia (en efectivo, con su 10 %) ──
insert into prueba.ids select 'vb', prueba.vender('Zapatilla Urbana Classic', '38', 'Negro', prueba.cliente('María González'));
select is((cotizar_cambio((select id from prueba.ids where nombre = 'vb'), prueba.trae((select id from prueba.ids where nombre = 'vb')),
  prueba.lleva('Zapatilla Running Pro', '39', 'Negro'), prueba.medio('EFE'))->>'a_pagar')::numeric, 24210.00,
  'cotiza: $98.000 − $71.100 = $26.900 de diferencia, $24.210 en efectivo');
select throws_like(format($$ select registrar_cambio(%s, prueba.trae(%s), prueba.lleva('Zapatilla Running Pro', '39', 'Negro')) $$,
  (select id from prueba.ids where nombre = 'vb'), (select id from prueba.ids where nombre = 'vb')), 'Falta cobrar la diferencia de $%', 'sin decir cómo paga la diferencia, no se hace');
select is(prueba.en(prueba.variante('Zapatilla Urbana Classic', '38', 'Negro'), 'Local'), 2, 'y si no se hace, no queda nada a medias');
insert into prueba.ids select 'cb', (registrar_cambio((select id from prueba.ids where nombre = 'vb'), prueba.trae((select id from prueba.ids where nombre = 'vb')),
  prueba.lleva('Zapatilla Running Pro', '39', 'Negro'), jsonb_build_array(jsonb_build_object('medio_pago_id', prueba.medio('EFE'))))->>'venta_id')::bigint;
select is((select monto from pagos where venta_id = (select id from prueba.ids where nombre = 'cb') and medio_pago_id = prueba.medio('EFE')), 24210.00,
  'pagó $24.210 en efectivo');
select is((select total from ventas where id = (select id from prueba.ids where nombre = 'cb')), 95310.00, 'la venta nueva: $98.000 − el 10 % de la diferencia');

-- ── C. Otro artículo, más barato: la diferencia queda como saldo ──
insert into prueba.ids select 'vc', prueba.vender('Zapatilla Running Pro', '40', 'Negro', prueba.cliente('Juan Pérez'));
select registrar_cambio((select id from prueba.ids where nombre = 'vc'), prueba.trae((select id from prueba.ids where nombre = 'vc')),
  prueba.lleva('Zapatilla Urbana Classic', '42', 'Negro'), '[]', 'no_gusto');
select is(prueba.saldo(prueba.cliente('Juan Pérez')), 9200.00, 'trajo $88.200, se llevó $79.000: le quedan $9.200 de saldo');

-- ── D. Lo que trae vuelve fallado: a la bandeja ──
insert into prueba.ids select 'vd', prueba.vender('Zapatilla Urbana Classic', '39', 'Negro', prueba.cliente('Juan Pérez'));
select registrar_cambio((select id from prueba.ids where nombre = 'vd'), prueba.trae((select id from prueba.ids where nombre = 'vd'), 'fallado'),
  prueba.lleva('Zapatilla Urbana Classic', '39', 'Blanco'), '[]', 'fallado', 'Costura abierta');
select is(prueba.en(prueba.variante('Zapatilla Urbana Classic', '39', 'Negro'), 'Fallados'), 1, 'el fallado va a Fallados');
select is((select count(*)::int from fallados where venta_id = (select id from prueba.ids where nombre = 'vd') and origen = 'cliente'), 1, 'y queda en la bandeja');

-- ── E. Validaciones ──
insert into prueba.ids select 've', prueba.vender('Zapatilla Urbana Classic', '43', 'Negro', prueba.cliente('Juan Pérez'));
select throws_ok(format($$ select registrar_cambio(%s, prueba.trae(%s), '[]') $$, (select id from prueba.ids where nombre = 've'), (select id from prueba.ids where nombre = 've')),
  'Elegí qué se lleva (si no se lleva nada, es una devolución)');
select throws_ok(format($$ select registrar_cambio(%s, prueba.trae(%s), prueba.lleva('Zapatilla Running Pro', '41', 'Negro'), jsonb_build_array(jsonb_build_object('medio_pago_id', prueba.medio('SAF')))) $$,
  (select id from prueba.ids where nombre = 've'), (select id from prueba.ids where nombre = 've')), 'La diferencia se paga con otro medio (el saldo del cambio ya se usa solo)');
select is((select count(*)::int from devoluciones where venta_id = (select id from prueba.ids where nombre = 've')), 0, 'si el cambio falla, tampoco queda la devolución');
select ok(prueba.cierra_stock(), 'el stock sigue siendo la suma de sus movimientos');

select * from finish();
rollback;
