-- Ajuste masivo de precios: vista previa, ajuste, redondeos, compra por proveedor, deshacer y permisos.
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
create function prueba.como_cajera() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true) $$;
grant execute on function prueba.como_cajera to authenticated;
create function prueba.precio(p_nombre text) returns numeric language sql stable security definer set search_path = public as $$
  select precio_venta from productos where nombre = p_nombre $$;
grant execute on function prueba.precio to authenticated;
select plan(16);

-- Cálculo
select is(precio_ajustado(98000, 0, 'porcentaje', 8, '999'), 105999::numeric, '+8 % terminado en 999');
select is(precio_ajustado(98000, 0, 'porcentaje', 8, '1000'), 106000::numeric, '+8 % redondeado a $1.000 (para arriba)');
select is(precio_ajustado(98000, 0, 'monto', -5000, 'ninguno'), 93000::numeric, '−$5.000');
select is(precio_ajustado(98000, 52000, 'margen', 90, '100'), 98800::numeric, 'costo + 90 % redondeado a $100');
select is(precio_ajustado(1000, 0, 'monto', -5000, 'ninguno'), 0::numeric, 'nunca queda negativo');

select prueba.como_equipo();
insert into prueba.ids values ('running', (select id from productos where nombre = 'Zapatilla Running Pro')),
                              ('norte', (select id from proveedores where nombre = 'Calzados del Norte'));

-- Vista previa: no toca nada
select is((select precio_nuevo from ajustar_precios('venta', array[(select id from prueba.ids where nombre = 'running')], 'porcentaje', 8, '999')), 105999::numeric, 'la vista previa calcula');
select is(prueba.precio('Zapatilla Running Pro'), 98000.00::numeric, 'la vista previa no cambia el precio');

-- Aplicar
select ajustar_precios('venta', array[(select id from prueba.ids where nombre = 'running')], 'porcentaje', 8, '999', null, 'Prueba', true);
select is(prueba.precio('Zapatilla Running Pro'), 105999.00::numeric, 'el ajuste cambia el precio');
select results_eq($$ select cantidad, descripcion, usuario_id from ajustes_precios order by id desc limit 1 $$,
  $$ values (1, 'Prueba'::text, '11111111-1111-1111-1111-111111111111'::uuid) $$, 'queda en el historial, con quién lo hizo');

-- Deshacer no pisa un cambio posterior
insert into prueba.ids select 'aj', max(id) from ajustes_precios;
select ajustar_precios('venta', array[(select id from productos where nombre = 'Bota Chelsea')], 'fijo', 99999, 'ninguno', null, 'Otra', true);
update productos set precio_venta = 110000 where nombre = 'Zapatilla Running Pro';   -- alguien lo cambió a mano
select is(deshacer_ajuste_precios((select id from prueba.ids where nombre = 'aj')), 0, 'deshacer no pisa un precio cambiado después');
select is(deshacer_ajuste_precios((select max(id) from ajustes_precios)), 1, 'deshacer vuelve el precio anterior');
select is(prueba.precio('Bota Chelsea'), 92000.00::numeric, 'la bota volvió a su precio');
select throws_ok(format('select deshacer_ajuste_precios(%s)', (select max(id) from ajustes_precios)), 'Ese ajuste ya se deshizo');

-- Compra de un proveedor: respeta su bonificación y solo toca lo que él vende
select ajustar_precios('compra', array(select id from productos), 'porcentaje', 10, 'ninguno', (select id from prueba.ids where nombre = 'norte'), 'Lista nueva', true);
select results_eq($$ select precio_lista, precio_compra from producto_proveedores where producto_id = (select id from prueba.ids where nombre = 'running') and proveedor_id = (select id from prueba.ids where nombre = 'norte') $$,
  $$ values (61600.00::numeric(12,2), 55440.00::numeric(12,2)) $$, 'compra: sube la lista y el neto respeta la bonificación');

-- Permisos: la cajera no cambia precios
set local role authenticated;
select prueba.como_cajera();
select throws_ok($$ select * from ajustar_precios('venta', array[1::bigint], 'porcentaje', 50) $$, 'No tenés permiso para cambiar precios de venta');
select is((select count(*)::int from ajustes_precios), 0, 'cajera: no ve el historial de precios');

select * from finish();
rollback;
