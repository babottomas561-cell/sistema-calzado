-- Bultos: plantillas de compra con distintos artículos, talles y colores; se guardan, se reemplazan y se quitan; no se pueden armar sin permiso ni con datos inválidos.
begin;
create extension if not exists pgtap with schema extensions;
create schema prueba;
grant usage on schema prueba to anon, authenticated;
create function prueba.como_admin() returns void language sql as $$ select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) $$;
create function prueba.como_cliente() returns void language sql as $$ select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true) $$;
create function prueba.var(p_n int) returns bigint language sql stable security definer set search_path = public as $$ select id from variantes order by id offset p_n limit 1 $$;
create table prueba.ids (nombre text primary key, id bigint);
grant all on prueba.ids to anon, authenticated;
grant execute on all functions in schema prueba to anon, authenticated;
select plan(13);

set local role authenticated; select prueba.como_cliente();
select throws_ok($$ select guardar_bulto('Caja', '[]') $$, 'No tenés permiso para armar bultos', 'un cliente no arma bultos');
select prueba.como_admin();
select throws_like($$ select guardar_bulto('', jsonb_build_array(jsonb_build_object('variante_id', prueba.var(0), 'cantidad', 2))) $$, 'Ponele un nombre al bulto%', 'el bulto lleva nombre');
select throws_ok($$ select guardar_bulto('Caja', '[]') $$, 'El bulto no tiene productos', 'y productos');
select throws_like($$ select guardar_bulto('Caja', jsonb_build_array(jsonb_build_object('variante_id', 999999, 'cantidad', 2))) $$, 'Hay un producto que no existe', 'un producto inexistente se rechaza');
select throws_like($$ select guardar_bulto('Caja', jsonb_build_array(jsonb_build_object('variante_id', prueba.var(0), 'cantidad', 0))) $$, '%mayor a cero%', 'la cantidad es positiva');

-- Un bulto de dos artículos distintos
insert into prueba.ids select 'b', guardar_bulto('Caja de 12 mixta', jsonb_build_array(
  jsonb_build_object('variante_id', prueba.var(0), 'cantidad', 2), jsonb_build_object('variante_id', prueba.var(5), 'cantidad', 3), jsonb_build_object('variante_id', prueba.var(0), 'cantidad', 1)));
select is((select count(*)::int from bulto_items where bulto_id = (select id from prueba.ids where nombre = 'b')), 2, 'un bulto puede mezclar distintas variantes (una repetida se suma)');
select is((select cantidad from bulto_items where bulto_id = (select id from prueba.ids where nombre = 'b') and variante_id = prueba.var(0)), 3, 'la repetida suma su cantidad');
select throws_like($$ select guardar_bulto('caja de 12 mixta', jsonb_build_array(jsonb_build_object('variante_id', prueba.var(1), 'cantidad', 1))) $$, 'Ya hay un bulto con ese nombre', 'el nombre no se repite');

-- Reemplazarlo
select lives_ok(format($$ select guardar_bulto('Caja de 12 mixta', jsonb_build_array(jsonb_build_object('variante_id', prueba.var(2), 'cantidad', 6)), %s) $$, (select id from prueba.ids where nombre = 'b')), 'se reemplaza lo que lleva');
select is((select count(*)::int from bulto_items where bulto_id = (select id from prueba.ids where nombre = 'b')), 1, 'y queda solo lo nuevo');
select is((select cantidad from bulto_items where bulto_id = (select id from prueba.ids where nombre = 'b')), 6, 'con su cantidad');
select lives_ok(format($$ select quitar_bulto(%s) $$, (select id from prueba.ids where nombre = 'b')), 'se quita el bulto');
select is((select count(*)::int from bulto_items), 0, 'y sus renglones con él');
select * from finish();
rollback;
