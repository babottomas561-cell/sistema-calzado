-- Roles del equipo: qué puede y qué no puede hacer una vendedora, y las protecciones del equipo.
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
-- La vendedora de prueba (la crea seed.sql con el rol Vendedor)
create function prueba.como_vendedora() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true) $$;
grant execute on function prueba.como_vendedora to authenticated;
select plan(26);

insert into prueba.ids values ('urbana40n', prueba.variante('Zapatilla Urbana Classic', '40', 'Negro'));

-- ── Como la vendedora ──
set local role authenticated;
select prueba.como_vendedora();
select ok(tiene_permiso('ventas.registrar'), 'vendedora: puede vender');
select ok(not tiene_permiso('costos.ver'), 'vendedora: no ve costos');

-- Costos: ni la tabla ni las vistas
select is((select count(*)::int from productos), 0, 'vendedora: no lee la tabla productos (tiene costos)');
select ok((select count(*) from v_stock) > 0, 'vendedora: ve el stock por v_stock');
select is((select count(*)::int from v_stock where precio_compra is not null or valor_costo is not null), 0, 'vendedora: v_stock sin costos');
select is((select count(*)::int from producto_proveedores), 0, 'vendedora: no ve precios de proveedores');
select is((select count(*)::int from compras), 0, 'vendedora: no ve compras');
select is((select count(*)::int from v_hechos_ventas), 0, 'vendedora: no ve informes de ventas');

-- Ventas: solo las suyas
select is((select count(*)::int from ventas), 0, 'vendedora: no ve las ventas de otros');
insert into prueba.ids select 'v_caj', registrar_venta(
  format('[{"variante_id": %s, "cantidad": 1, "precio_unitario": 1}]', (select id from prueba.ids where nombre = 'urbana40n'))::jsonb,
  format('[{"medio_pago_id": %s}]', prueba.medio('DEB'))::jsonb);
select is((select count(*)::int from ventas), 1, 'vendedora: ve la venta que hizo');
select is((select subtotal from ventas where id = (select id from prueba.ids where nombre = 'v_caj')), 79000.00::numeric(12,2),
  'vendedora: el precio que manda el navegador no cuenta (cobra el de lista)');
select is((select usuario_id from ventas where id = (select id from prueba.ids where nombre = 'v_caj')), '33333333-3333-3333-3333-333333333333'::uuid,
  'la venta queda a su nombre');
select is((select costo_unitario from v_venta_items where venta_id = (select id from prueba.ids where nombre = 'v_caj')), null, 'vendedora: el detalle de su venta sin costo');

-- Tope de descuento del rol Vendedor: 10 %
select lives_ok(format($$ select registrar_venta('[{"variante_id": %s, "cantidad": 1}]', '[]', null, 7900) $$, (select id from prueba.ids where nombre = 'urbana40n')),
  'vendedora: descuento del 10 % permitido');
select throws_like(format($$ select registrar_venta('[{"variante_id": %s, "cantidad": 1}]', '[]', null, 8000) $$, (select id from prueba.ids where nombre = 'urbana40n')),
  'Tu descuento máximo es del 10 %', 'vendedora: más del 10 % no');

-- Lo que no puede hacer
select throws_ok(format($$ select ajustar_stock(%s, 50, 'me sumo stock') $$, (select id from prueba.ids where nombre = 'urbana40n')), 'No tenés permiso para ajustar stock');
select throws_ok(format($$ select registrar_compra('[{"variante_id": %s, "cantidad": 50, "costo_unitario": 1}]') $$, (select id from prueba.ids where nombre = 'urbana40n')),
  'No tenés permiso para registrar compras');
select throws_like(format($$ select _mover_stock(%s, 1, 50, 'ajuste') $$, (select id from prueba.ids where nombre = 'urbana40n')), '%permission denied%', 'vendedora: no llama a _mover_stock');
update stock set cantidad = 999 where variante_id = (select id from prueba.ids where nombre = 'urbana40n');
select isnt(prueba.stock((select id from prueba.ids where nombre = 'urbana40n')), 999, 'vendedora: no puede escribir stock directo');
update perfiles set rol_id = (select id from roles where todos) where id = auth.uid();
select is((select r.nombre from perfiles p join roles r on r.id = p.rol_id where p.id = '33333333-3333-3333-3333-333333333333'), 'Vendedor', 'vendedora: no se puede hacer administradora');
select throws_ok($$ select asignar_rol('vendedor@demo.local', 1) $$, 'No tenés permiso para administrar el equipo');
update roles set descuento_max_pct = 100 where nombre = 'Vendedor';
select is((select descuento_max_pct from roles where nombre = 'Vendedor'), 10.00::numeric(5,2), 'vendedora: no puede subirse el tope de descuento');

-- ── Como el administrador ──
select prueba.como_equipo();
select throws_ok($$ select quitar_del_equipo('11111111-1111-1111-1111-111111111111') $$, 'No te podés sacar a vos mismo del equipo');
select throws_ok($$ select asignar_rol('admin@demo.local', (select id from roles where nombre = 'Vendedor')) $$, 'Tiene que quedar al menos un Administrador');
select throws_ok($$ delete from roles where todos $$, 'El rol Administrador no se puede borrar');
select throws_ok($$ update roles set permisos = '{ventas.volar}' where nombre = 'Vendedor' $$, 'El permiso "ventas.volar" no existe');

select * from finish();
rollback;
