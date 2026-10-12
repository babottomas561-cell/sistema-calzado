-- Ropa: escalas de ropa, línea del rubro y que los informes no mezclen el «38» de calzado con el de jeans.
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
select plan(10);
select prueba.como_equipo();

-- Un rubro de ropa y dos artículos: una remera (talles con letras) y un jean (talles con números)
insert into categorias (codigo, nombre, linea) values ('REM', 'Remera', 'Ropa'), ('JEA', 'Jean', 'Ropa');
select is((select linea from categorias where nombre = 'Zapatilla'), 'Calzado', 'los rubros de antes son de la línea Calzado');
insert into productos (nombre, categoria_id, escala, precio_compra, precio_venta, temporada, material)
  values ('Remera Básica', (select id from categorias where nombre = 'Remera'), 'Ropa letras', 8000, 18000, 'Primavera/Verano', 'Algodón');
insert into productos (nombre, categoria_id, escala, precio_compra, precio_venta)
  values ('Jean Recto', (select id from categorias where nombre = 'Jean'), 'Ropa números', 20000, 45000);

select isnt(buscar_talle('38', 'Ropa números'), buscar_talle('38', 'Adulto'), 'el 38 de jeans y el 38 de calzado son dos talles distintos');
select is((select tipo from talles where id = buscar_talle('xl')), 'Ropa letras', 'buscar_talle sin escala: las letras son de ropa');
select is((select tipo from talles where id = buscar_talle('Único', 'Único')), 'Único', 'existe la escala Único');
select throws_ok($$ select buscar_talle('M', 'Zapatos') $$, 'Escala de talles inválida');

insert into variantes (producto_id, talle_id, color_id)
  select (select id from productos where nombre = 'Remera Básica'), buscar_talle('M'), (select min(id) from colores);
insert into variantes (producto_id, talle_id, color_id)
  select (select id from productos where nombre = 'Jean Recto'), buscar_talle('40', 'Ropa números'), (select min(id) from colores);
select is((select count(*)::int from variantes v join productos p on p.id = v.producto_id where p.nombre in ('Remera Básica', 'Jean Recto')), 2, 'la ropa acepta los talles de su escala');
select throws_ok($$ insert into variantes (producto_id, talle_id, color_id)
  values ((select id from productos where nombre = 'Remera Básica'), buscar_talle('40', 'Ropa números'), (select min(id) from colores)) $$,
  'El talle 40 es de la escala Ropa números, y el artículo es de la escala Ropa letras', 'una remera no acepta talles numéricos');
select throws_ok(format($$ insert into variantes (producto_id, talle_id, color_id) values (%s, buscar_talle('M'), (select min(id) from colores)) $$,
  (select id from productos where nombre = 'Zapatilla Running Pro')), 'El talle M es de la escala Ropa letras, y el artículo es de la escala Adulto', 'una zapatilla no acepta talles de ropa');

-- Se vende una remera: los informes la ven como Ropa, con su escala y temporada
set local role authenticated;
select prueba.como_equipo();
select ajustar_stock(prueba.variante('Remera Básica', 'M', (select nombre from colores where id = (select min(id) from colores))), 5, 'Inventario inicial');
insert into prueba.ids select 'venta', registrar_venta(jsonb_build_array(jsonb_build_object('variante_id',
  prueba.variante('Remera Básica', 'M', (select nombre from colores where id = (select min(id) from colores))), 'cantidad', 2)),
  jsonb_build_array(jsonb_build_object('medio_pago_id', prueba.medio('DEB'))));
select results_eq($$ select linea, escala, temporada, material, cantidad::int from v_hechos_ventas where venta_id = (select id from prueba.ids where nombre = 'venta') $$,
  $$ values ('Ropa'::text, 'Ropa letras'::text, 'Primavera/Verano'::text, 'Algodón'::text, 2) $$, 'informe de ventas: línea, escala, temporada y material');
select is((select linea from v_stock where producto_id = (select id from productos where nombre = 'Remera Básica') limit 1), 'Ropa', 'informe de stock: línea Ropa');

select * from finish();
rollback;
