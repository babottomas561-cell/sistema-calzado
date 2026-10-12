-- Devoluciones con saldo a favor: la cuenta (promo por grupo, descuento del efectivo sí, recargo no), el stock
-- (bueno al Local, fallado a Fallados), el plazo, el cliente, pagar con saldo, anular y vencer.
begin;
create extension if not exists pgtap with schema extensions;
create schema prueba;
grant usage on schema prueba to anon, authenticated;
create function prueba.variante(p_talle text, p_color text) returns bigint language sql stable security definer set search_path = public as $$
  select v.id from variantes v join productos p on p.id = v.producto_id join talles t on t.id = v.talle_id join colores c on c.id = v.color_id
   where p.nombre = 'Zapatilla Urbana Classic' and t.nombre = p_talle and c.nombre = p_color $$;
create function prueba.en(p_variante bigint, p_deposito text) returns int language sql stable security definer set search_path = public as $$
  select coalesce((select s.cantidad from stock s join depositos d on d.id = s.deposito_id where s.variante_id = p_variante and d.nombre = p_deposito), 0) $$;
create function prueba.medio(p_codigo text) returns bigint language sql stable security definer set search_path = public as $$ select id from medios_pago where codigo = p_codigo $$;
create function prueba.cliente(p_nombre text) returns bigint language sql stable security definer set search_path = public as $$ select id from clientes where nombre = p_nombre $$;
create function prueba.saldo(p_cliente bigint) returns numeric language sql stable security definer set search_path = public as $$ select saldo_disponible(p_cliente) $$;
create function prueba.como_equipo() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) $$;
create function prueba.como_cliente() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true) $$;
create function prueba.rol_equipo(p_rol text) returns void language sql security definer set search_path = public as $$
  update perfiles set rol_id = (select id from roles where nombre = p_rol) where id = '11111111-1111-1111-1111-111111111111' $$;
-- Una venta de N pares de la Urbana (talle, color) a $79.000, con un medio y un cliente
create function prueba.vender(p_talle text, p_color text, p_cant int, p_medio text, p_cliente bigint) returns bigint language sql as $$
  select registrar_venta(jsonb_build_array(jsonb_build_object('variante_id', prueba.variante(p_talle, p_color), 'cantidad', p_cant, 'precio_unitario', 79000)),
                         jsonb_build_array(jsonb_build_object('medio_pago_id', prueba.medio(p_medio))), p_cliente) $$;
-- El renglón de una venta (es uno por variante en estas pruebas)
create function prueba.renglon(p_venta bigint) returns bigint language sql stable security definer set search_path = public as $$
  select min(id) from venta_items where venta_id = p_venta $$;
create function prueba.items(p_venta bigint, p_cant int, p_estado text default 'bueno') returns jsonb language sql stable as $$
  select jsonb_build_array(jsonb_build_object('venta_item_id', prueba.renglon(p_venta), 'cantidad', p_cant, 'estado', p_estado)) $$;
create function prueba.dev_total(p_dev bigint) returns numeric language sql stable security definer set search_path = public as $$ select total from devoluciones where id = p_dev $$;
create function prueba.cierra_stock() returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from stock s where s.cantidad <> coalesce((select sum(m.cantidad) from movimientos_stock m
                     where m.variante_id = s.variante_id and m.deposito_id = s.deposito_id), 0)) $$;
grant execute on all functions in schema prueba to anon, authenticated;
create table prueba.ids (nombre text primary key, id bigint);
grant all on prueba.ids to anon, authenticated;
select plan(34);

set local role authenticated;
select prueba.como_equipo();

-- ── A. Devolución simple: 2 pares en efectivo (−10 %) → cada uno vale $71.100 ──
insert into prueba.ids select 'va', prueba.vender('40', 'Negro', 2, 'EFE', prueba.cliente('María González'));
select is((cotizar_devolucion((select id from prueba.ids where nombre = 'va'), prueba.items((select id from prueba.ids where nombre = 'va'), 1))->>'total')::numeric,
  71100.00, 'cotiza: un par vale lo que se pagó, con el descuento del efectivo');
select throws_ok(format($$ select registrar_devolucion(%s, prueba.items(%s, 1), null) $$, (select id from prueba.ids where nombre = 'va'), (select id from prueba.ids where nombre = 'va')),
  'Elegí el motivo de la devolución');
insert into prueba.ids select 'da1', registrar_devolucion((select id from prueba.ids where nombre = 'va'), prueba.items((select id from prueba.ids where nombre = 'va'), 1), 'talle');
select is(prueba.dev_total((select id from prueba.ids where nombre = 'da1')), 71100.00, 'deja $71.100 de saldo a favor');
select matches((select comprobante from devoluciones where id = (select id from prueba.ids where nombre = 'da1')), '^0001-\d{8}$', 'con su comprobante numerado');
select is(prueba.en(prueba.variante('40', 'Negro'), 'Local'), 2, 'el par en buen estado vuelve al Local');
select is(prueba.saldo(prueba.cliente('María González')), 71100.00, 'María tiene $71.100 de saldo');
select is((select vence from saldos_cliente where devolucion_id = (select id from prueba.ids where nombre = 'da1')), (now() at time zone 'America/Argentina/Buenos_Aires')::date + 180, 'el saldo vence a los 180 días');
select throws_like(format($$ select registrar_devolucion(%s, prueba.items(%s, 2), 'talle') $$, (select id from prueba.ids where nombre = 'va'), (select id from prueba.ids where nombre = 'va')),
  'Se quiere devolver más de lo que queda por devolver%', 'no se devuelve más de lo que queda');
insert into prueba.ids select 'da2', registrar_devolucion((select id from prueba.ids where nombre = 'va'), prueba.items((select id from prueba.ids where nombre = 'va'), 1, 'fallado'), 'fallado', 'Se despegó la suela');
select is(prueba.en(prueba.variante('40', 'Negro'), 'Fallados'), 1, 'el par fallado va directo a Fallados');
select is((select origen || ' · ' || motivo from fallados where venta_id = (select id from prueba.ids where nombre = 'va')), 'cliente · Se despegó la suela', 'y queda en la bandeja como devuelto por un cliente');
select is((select sum(total) from devoluciones where venta_id = (select id from prueba.ids where nombre = 'va')),
  (select total from ventas where id = (select id from prueba.ids where nombre = 'va')), 'entre las dos devoluciones, justo lo cobrado');
select is((select sum(cantidad)::int from v_hechos_ventas where venta_id = (select id from prueba.ids where nombre = 'va')
              or devolucion_id in (select id from devoluciones where venta_id = (select id from prueba.ids where nombre = 'va'))), 0,
  'en los informes, la venta y sus devoluciones se compensan');
select throws_ok(format($$ select anular_venta(%s, 'error_carga') $$, (select id from prueba.ids where nombre = 'va')), 'Esta venta tiene devoluciones: ya no se puede anular');

-- ── B. Pagado en 3 cuotas (+15 %): el recargo no se devuelve ──
insert into prueba.ids select 'vb', prueba.vender('40', 'Blanco', 1, 'CR3', prueba.cliente('María González'));
select is((select total from ventas where id = (select id from prueba.ids where nombre = 'vb')), 90850.00, 'la venta en cuotas cobró $90.850');
insert into prueba.ids select 'db', registrar_devolucion((select id from prueba.ids where nombre = 'vb'), prueba.items((select id from prueba.ids where nombre = 'vb'), 1), 'no_gusto');
select is(prueba.dev_total((select id from prueba.ids where nombre = 'db')), 79000.00, 'el saldo es $79.000: sin el recargo');

-- ── C. 2×1: devolver uno de dos no deja saldo; con 3 pares y la promo ya terminada, se recalcula con la de la venta ──
insert into promociones (nombre, tipo, lleva, paga, prioridad) values ('2x1 Adidas prueba', 'nxm', 2, 1, 10);
insert into promocion_alcances (promocion_id, marca_id) select max(p.id), (select id from marcas where nombre = 'Adidas') from promociones p;
insert into prueba.ids select 'vc2', prueba.vender('42', 'Negro', 2, 'EFE', prueba.cliente('María González'));
insert into prueba.ids select 'dc2', registrar_devolucion((select id from prueba.ids where nombre = 'vc2'), prueba.items((select id from prueba.ids where nombre = 'vc2'), 1), 'talle');
select is(prueba.dev_total((select id from prueba.ids where nombre = 'dc2')), 0.00, '2×1: si devuelve uno, el que se queda vale lo que pagó: saldo $0');
insert into prueba.ids select 'vc3', prueba.vender('41', 'Negro', 3, 'EFE', prueba.cliente('María González'));
select is((select total from ventas where id = (select id from prueba.ids where nombre = 'vc3')), 142200.00, '3 pares con 2×1, en efectivo: $142.200');
update promociones set activa = false where nombre = '2x1 Adidas prueba';
insert into prueba.ids select 'dc3', registrar_devolucion((select id from prueba.ids where nombre = 'vc3'), prueba.items((select id from prueba.ids where nombre = 'vc3'), 1), 'talle');
select is(prueba.dev_total((select id from prueba.ids where nombre = 'dc3')), 71100.00, 'con la promo terminada, los 2 que quedan siguen siendo un 2×1: devuelve un par entero');

-- ── D. Venta sin cliente: hay que elegirlo ──
insert into prueba.ids select 'vd', prueba.vender('38', 'Negro', 1, 'EFE', null);
select throws_ok(format($$ select registrar_devolucion(%s, prueba.items(%s, 1), 'talle') $$, (select id from prueba.ids where nombre = 'vd'), (select id from prueba.ids where nombre = 'vd')),
  'La devolución deja saldo a favor: elegí o cargá el cliente');
select registrar_devolucion((select id from prueba.ids where nombre = 'vd'), prueba.items((select id from prueba.ids where nombre = 'vd'), 1), 'talle', null, prueba.cliente('Juan Pérez'));
select is(prueba.saldo(prueba.cliente('Juan Pérez')), 71100.00, 'el saldo queda a nombre del cliente que se eligió');

-- ── E. Fuera de plazo: la cajera no, el encargado sí ──
insert into prueba.ids select 've', prueba.vender('39', 'Negro', 1, 'EFE', prueba.cliente('María González'));
reset role;
update ventas set fecha = now() - interval '40 days' where id = (select id from prueba.ids where nombre = 've');
set local role authenticated;
select prueba.como_equipo();
select prueba.rol_equipo('Cajero');
select throws_like(format($$ select registrar_devolucion(%s, prueba.items(%s, 1), 'talle') $$, (select id from prueba.ids where nombre = 've'), (select id from prueba.ids where nombre = 've')),
  'Pasó el plazo de cambios%', 'pasado el plazo, la cajera no puede');
select prueba.rol_equipo('Encargado');
insert into prueba.ids select 'de', registrar_devolucion((select id from prueba.ids where nombre = 've'), prueba.items((select id from prueba.ids where nombre = 've'), 1), 'talle');
select is((select fuera_de_plazo from devoluciones where id = (select id from prueba.ids where nombre = 'de')), true, 'el encargado sí, y queda marcada fuera de plazo');
select prueba.rol_equipo('Administrador');

-- ── F. Pagar con saldo a favor ──
insert into prueba.ids select 'vf', registrar_venta(jsonb_build_array(jsonb_build_object('variante_id', prueba.variante('38', 'Blanco'), 'cantidad', 1, 'precio_unitario', 79000)),
  jsonb_build_array(jsonb_build_object('medio_pago_id', prueba.medio('SAF'), 'base', 50000), jsonb_build_object('medio_pago_id', prueba.medio('EFE'))), prueba.cliente('Juan Pérez'));
select is(prueba.saldo(prueba.cliente('Juan Pérez')), 21100.00, 'pagar $50.000 con saldo lo descuenta');
select is((select monto from pagos where venta_id = (select id from prueba.ids where nombre = 'vf') and medio_pago_id = prueba.medio('SAF')), 50000.00, 'el saldo no tiene descuento ni recargo');
select throws_like($$ select registrar_venta(jsonb_build_array(jsonb_build_object('variante_id', prueba.variante('39', 'Blanco'), 'cantidad', 1, 'precio_unitario', 79000)),
  jsonb_build_array(jsonb_build_object('medio_pago_id', prueba.medio('SAF'))), prueba.cliente('Juan Pérez')) $$, 'El cliente tiene $%', 'no se paga con más saldo del que hay');
select throws_ok($$ select registrar_venta(jsonb_build_array(jsonb_build_object('variante_id', prueba.variante('39', 'Blanco'), 'cantidad', 1, 'precio_unitario', 79000)),
  jsonb_build_array(jsonb_build_object('medio_pago_id', prueba.medio('SAF'), 'base', 1000), jsonb_build_object('medio_pago_id', prueba.medio('EFE')))) $$,
  'Para pagar con saldo a favor, elegí el cliente');
select anular_venta((select id from prueba.ids where nombre = 'vf'), 'error_carga');
select is(prueba.saldo(prueba.cliente('Juan Pérez')), 71100.00, 'si se anula la venta, el saldo vuelve');

-- ── G. Lo que ve cada cliente ──
insert into prueba.ids select 'vg', prueba.vender('43', 'Negro', 1, 'EFE', prueba.cliente('Cliente Demo'));
select registrar_devolucion((select id from prueba.ids where nombre = 'vg'), prueba.items((select id from prueba.ids where nombre = 'vg'), 1), 'talle');
select prueba.como_cliente();
select is((select sum(restante) from v_mi_saldo), 71100.00, 'el cliente ve su saldo a favor');
select is((select count(*)::int from v_creditos where cliente_id <> prueba.cliente('Cliente Demo')), 0, 'y no ve el de nadie más');
select is((select count(*)::int from saldos_cliente), 0, 'no lee la tabla de saldos');
select throws_ok(format($$ select registrar_devolucion(%s, prueba.items(%s, 1), 'talle') $$, (select id from prueba.ids where nombre = 'vg'), (select id from prueba.ids where nombre = 'vg')),
  'No tenés permiso para hacer devoluciones');

-- ── H. Vencimiento ──
reset role;
update saldos_cliente set vence = _hoy_ar() - 1 where tipo = 'devolucion' and cliente_id = prueba.cliente('María González');
select ok(vencer_saldos() > 0, 'vence lo que pasó su fecha');
select is(prueba.saldo(prueba.cliente('María González')), 0.00, 'y ya no se puede usar');
select ok(prueba.cierra_stock(), 'al final, el stock sigue siendo la suma de sus movimientos');

select * from finish();
rollback;
