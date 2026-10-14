-- Curvas de compra: la distribución de talles por escala; se guardan, se reemplazan y se quitan; solo con talles de su escala.
begin;
create extension if not exists pgtap with schema extensions;
create schema prueba;
grant usage on schema prueba to anon, authenticated;
create function prueba.como_admin() returns void language sql as $$ select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) $$;
create function prueba.como_cliente() returns void language sql as $$ select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true) $$;
create function prueba.talle(p_nombre text, p_escala text) returns bigint language sql stable security definer set search_path = public as $$ select id from talles where nombre = p_nombre and tipo = p_escala $$;
create table prueba.ids (nombre text primary key, id bigint);
grant all on prueba.ids to anon, authenticated;
grant execute on all functions in schema prueba to anon, authenticated;
select plan(15);

set local role authenticated; select prueba.como_cliente();
select throws_ok($$ select guardar_curva('Calzado', 'Adulto', '[]') $$, 'No tenés permiso para armar curvas', 'un cliente no arma curvas');
select prueba.como_admin();
select throws_like($$ select guardar_curva('', 'Adulto', jsonb_build_array(jsonb_build_object('talle_id', prueba.talle('40', 'Adulto'), 'cantidad', 2))) $$, 'Ponele un nombre a la curva%', 'la curva lleva nombre');
select throws_like($$ select guardar_curva('Calzado', 'Inventada', jsonb_build_array(jsonb_build_object('talle_id', prueba.talle('40', 'Adulto'), 'cantidad', 2))) $$, 'Elegí la escala de talles%', 'y una escala que existe');
select throws_ok($$ select guardar_curva('Calzado', 'Adulto', '[]') $$, 'La curva no tiene talles', 'y talles');
select throws_like($$ select guardar_curva('Calzado', 'Adulto', jsonb_build_array(jsonb_build_object('talle_id', prueba.talle('XL', 'Ropa letras'), 'cantidad', 2))) $$, 'Hay un talle que no es de la escala Adulto', 'un talle de otra escala se rechaza');

insert into prueba.ids select 'c', guardar_curva('Calzado 39 al 41', 'Adulto', jsonb_build_array(
  jsonb_build_object('talle_id', prueba.talle('39', 'Adulto'), 'cantidad', 1), jsonb_build_object('talle_id', prueba.talle('40', 'Adulto'), 'cantidad', 2), jsonb_build_object('talle_id', prueba.talle('41', 'Adulto'), 'cantidad', 1)));
select is((select sum(cantidad)::int from curva_items where curva_id = (select id from prueba.ids where nombre = 'c')), 4, 'una curva guarda la cantidad de cada talle');
select throws_like($$ select guardar_curva('calzado 39 al 41', 'Adulto', jsonb_build_array(jsonb_build_object('talle_id', prueba.talle('40', 'Adulto'), 'cantidad', 1))) $$, 'Ya hay una curva con ese nombre', 'el nombre no se repite');
select lives_ok(format($$ select guardar_curva('Calzado 39 al 41', 'Adulto', jsonb_build_array(jsonb_build_object('talle_id', %s, 'cantidad', 3)), %s) $$, prueba.talle('40', 'Adulto'), (select id from prueba.ids where nombre = 'c')), 'se reemplaza lo que lleva');
select is((select count(*)::int from curva_items where curva_id = (select id from prueba.ids where nombre = 'c')), 1, 'y queda solo lo nuevo');
-- Se recuerda cuánto se usa cada curva
select is((select usos from curvas where id = (select id from prueba.ids where nombre = 'c')), 0, 'una curva nueva no tiene usos');
select lives_ok(format($$ select usar_curva(%s) $$, (select id from prueba.ids where nombre = 'c')), 'usar una curva se anota');
select is((select usos from curvas where id = (select id from prueba.ids where nombre = 'c')), 1, 'suma un uso');
select is((select ultimo_uso is not null from curvas where id = (select id from prueba.ids where nombre = 'c')), true, 'y cuándo fue');
select lives_ok(format($$ select quitar_curva(%s) $$, (select id from prueba.ids where nombre = 'c')), 'se quita la curva');
select is((select count(*)::int from curva_items), 0, 'y sus renglones con ella');
select * from finish();
rollback;
