-- Escalas de talles: cada artículo solo con talles de su escala (Adulto, Niños, Bebé).
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
select plan(5);
select is((select escala from productos where nombre = 'Zapatilla Escolar'), 'Niños', 'la escolar es de la escala Niños');
select lives_ok($$ insert into talles (nombre, orden, tipo) values ('34', 34, 'Adulto') $$, 'el 34 de adulto convive con el 34 de niños');
select throws_like($$ insert into talles (nombre, orden, tipo) values ('34', 34.1, 'Niños') $$, '%duplicate key%', 'pero no dos 34 en la misma escala');
select throws_ok($$ insert into variantes (producto_id, talle_id, color_id)
  values ((select id from productos where nombre = 'Zapatilla Escolar'), (select id from talles where nombre = '40' and tipo = 'Adulto'), (select min(id) from colores)) $$,
  'El talle 40 es de la escala Adulto, y el artículo es de la escala Niños');
select throws_ok($$ update productos set escala = 'Adulto' where nombre = 'Zapatilla Escolar' $$,
  'El artículo ya tiene talles de la escala Niños: no se puede pasar a Adulto');
select * from finish();
rollback;
