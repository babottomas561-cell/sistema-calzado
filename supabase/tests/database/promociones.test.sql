-- Promociones: el motor cotizar() y que el mismo número salga en carrito, pedido, entrega y caja.
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
select plan(21);
select prueba.como_equipo();

-- 2×1 en Adidas (la Urbana Classic vale $79.000)
insert into promociones (nombre, tipo, lleva, paga, prioridad) values ('2x1 Adidas', 'nxm', 2, 1, 10);
insert into promocion_alcances (promocion_id, marca_id) select max(p.id), (select id from marcas where nombre = 'Adidas') from promociones p;

select is((cotizar(prueba.items(prueba.par('Zapatilla Urbana Classic', '40', 'Negro', 2)))->>'total')::numeric, 79000::numeric, '2×1: dos pares iguales, se paga uno');
select is((cotizar(prueba.items(prueba.par('Zapatilla Urbana Classic', '40', 'Negro'), prueba.par('Zapatilla Urbana Classic', '41', 'Blanco')))->>'descuento_promociones')::numeric,
  79000::numeric, '2×1 mezclando talle y color');
select is(jsonb_array_length(cotizar(prueba.items(prueba.par('Zapatilla Urbana Classic', '40', 'Negro', 3)))->'renglones'), 2, 'con 3 pares: un renglón de 2 con promo y uno de 1 sin');
select is((cotizar(prueba.items(prueba.par('Zapatilla Urbana Classic', '40', 'Negro', 3)))->'sugerencias'->0->>'faltan')::int, 1, 'avisa que falta 1 par para otro 2×1');
select is((cotizar(prueba.items(prueba.par('Zapatilla Running Pro', '41', 'Negro', 2)))->>'descuento_promociones')::numeric, 0::numeric, 'fuera del alcance (Nike), sin promo');
select is(cotizar(prueba.items(prueba.par('Zapatilla Urbana Classic', '40', 'Negro', 2)))->'renglones'->0->>'etiqueta', '2×1', 'etiqueta 2×1');

-- 2do al 50 % en la Running (Nike) y 20 % off en Botas
insert into promociones (nombre, tipo, descuento_pct) values ('2do al 50 Nike', 'segunda_unidad', 50);
insert into promocion_alcances (promocion_id, marca_id) select max(p.id), (select id from marcas where nombre = 'Nike') from promociones p;
insert into promociones (nombre, tipo, descuento_pct) values ('20 off botas', 'porcentaje', 20);
insert into promocion_alcances (promocion_id, categoria_id) select max(p.id), (select id from categorias where nombre = 'Bota') from promociones p;
select is((cotizar(prueba.items(prueba.par('Zapatilla Running Pro', '41', 'Negro'), prueba.par('Zapatilla Running Pro', '42', 'Negro')))->>'descuento_promociones')::numeric,
  49000::numeric, '2do al 50 %: el segundo par a mitad de precio');
select is((cotizar(prueba.items(prueba.par('Bota Chelsea', '37', 'Blanco')))->>'total')::numeric, 73600::numeric, '20 % off por rubro (92.000 → 73.600)');

-- Exclusión y vigencia
insert into promocion_alcances (promocion_id, producto_id, excluir)
  select (select id from promociones where nombre = '2do al 50 Nike'), (select id from productos where nombre = 'Zapatilla Running Pro'), true;
select is((cotizar(prueba.items(prueba.par('Zapatilla Running Pro', '41', 'Negro'), prueba.par('Zapatilla Running Pro', '42', 'Negro')))->>'descuento_promociones')::numeric,
  0::numeric, '"toda Nike menos la Running": excluida');
update promociones set hasta = now() - interval '1 day', desde = now() - interval '10 days' where nombre = '20 off botas';
select is((cotizar(prueba.items(prueba.par('Bota Chelsea', '37', 'Blanco')))->>'total')::numeric, 92000::numeric, 'promo vencida: no aplica');

-- Canal: solo mostrador
update promociones set en_tienda = false where nombre = '2x1 Adidas';
select is((cotizar(prueba.items(prueba.par('Zapatilla Urbana Classic', '40', 'Negro', 2)), null, 'tienda')->>'descuento_promociones')::numeric, 0::numeric, 'solo mostrador: en la tienda no');
select is((cotizar(prueba.items(prueba.par('Zapatilla Urbana Classic', '40', 'Negro', 2)), null, 'mostrador')->>'descuento_promociones')::numeric, 79000::numeric, 'y en el mostrador sí');
update promociones set en_tienda = true where nombre = '2x1 Adidas';

-- Con efectivo (−10 %): acumula → 10 % sobre los $79.000 que se pagan; no acumula → sin el 10 %
select is((cotizar(prueba.items(prueba.par('Zapatilla Urbana Classic', '40', 'Negro', 2)), prueba.medio('EFE'))->>'total')::numeric, 71100::numeric, 'acumula con efectivo: 79.000 − 10 %');
update promociones set acumula_medio_pago = false where nombre = '2x1 Adidas';
select is((cotizar(prueba.items(prueba.par('Zapatilla Urbana Classic', '40', 'Negro', 2)), prueba.medio('EFE'))->>'total')::numeric, 79000::numeric, 'no acumula: el 10 % no se suma');
update promociones set acumula_medio_pago = true where nombre = '2x1 Adidas';

-- Prioridad: un 10 % en Adidas de menor prioridad se queda con el par que sobra del 2×1
insert into promociones (nombre, tipo, descuento_pct, prioridad) values ('10 off Adidas', 'porcentaje', 10, 0);
insert into promocion_alcances (promocion_id, marca_id) select max(p.id), (select id from marcas where nombre = 'Adidas') from promociones p;
select is((cotizar(prueba.items(prueba.par('Zapatilla Urbana Classic', '40', 'Negro', 3)))->>'descuento_promociones')::numeric, 86900::numeric, 'no se apilan: 2×1 + 10 % al tercero');
delete from promociones where nombre = '10 off Adidas';

-- El público ve la etiqueta en el catálogo
set local role anon;
select ok(exists (select 1 from v_promos_tienda where etiqueta = '2×1'), 'anon: ve "2×1" en el catálogo');
reset role;

-- El mismo número en el pedido, en la entrega y en la caja
set local role authenticated;
select prueba.como_cliente();
insert into prueba.ids select 'ped', crear_pedido(prueba.items(prueba.par('Zapatilla Urbana Classic', '40', 'Negro', 2)), 'retiro', null, prueba.medio('EFE'));
select results_eq($$ select subtotal, descuento_promociones, ajuste_medio_pago, total from pedidos where id = (select id from prueba.ids where nombre = 'ped') $$,
  $$ values (158000.00::numeric(12,2), 79000.00::numeric(12,2), -7900.00::numeric(12,2), 71100.00::numeric(12,2)) $$, 'pedido: 2×1 y efectivo, igual que cotizar()');
select prueba.como_equipo();
update promociones set activa = false where nombre = '2x1 Adidas';   -- termina la promo antes de entregar
insert into prueba.ids select 'venta', cambiar_estado_pedido((select id from prueba.ids where nombre = 'ped'), 'entregado');
select is((select total from ventas where id = (select id from prueba.ids where nombre = 'venta')), 71100.00::numeric(12,2), 'entregado: se respeta la promo prometida aunque haya terminado');
update promociones set activa = true where nombre = '2x1 Adidas';
insert into prueba.ids select 'caja', registrar_venta(prueba.items(prueba.par('Zapatilla Urbana Classic', '41', 'Negro', 2)), jsonb_build_array(jsonb_build_object('medio_pago_id', prueba.medio('DEB'))));
select results_eq($$ select subtotal, descuento_promociones, total from ventas where id = (select id from prueba.ids where nombre = 'caja') $$,
  $$ values (158000.00::numeric(12,2), 79000.00::numeric(12,2), 79000.00::numeric(12,2)) $$, 'mostrador: el 2×1 se aplica solo');
select is((select sum(importe_neto) from v_hechos_ventas where venta_id = (select id from prueba.ids where nombre = 'caja')), 79000.00::numeric, 'informes: el neto de la venta coincide con su total');
select is((select count(*)::int from (select s.variante_id from stock s left join movimientos_stock m on m.variante_id = s.variante_id and m.deposito_id = s.deposito_id
  group by s.variante_id, s.cantidad having s.cantidad <> coalesce(sum(m.cantidad), 0)) x), 0, 'stock = suma de movimientos');

select * from finish();
rollback;
