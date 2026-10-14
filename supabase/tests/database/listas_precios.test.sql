-- Listas de precios: apagadas de fábrica; la del mostrador la usa precio_de() y la caja, la de la tienda la usa el catálogo y crear_pedido().
begin;
create extension if not exists pgtap with schema extensions;
create schema prueba;
grant usage on schema prueba to anon, authenticated;
create function prueba.variante(p_modelo text, p_talle text, p_color text) returns bigint language sql stable security definer set search_path = public as $$
  select v.id from variantes v join productos p on p.id = v.producto_id join talles t on t.id = v.talle_id join colores c on c.id = v.color_id
   where p.nombre = p_modelo and t.nombre = p_talle and c.nombre = p_color $$;
create function prueba.medio(p_codigo text) returns bigint language sql stable security definer set search_path = public as $$ select id from medios_pago where codigo = p_codigo $$;
create function prueba.como_equipo() returns void language sql as $$ select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) $$;
create function prueba.como_vendedora() returns void language sql as $$ select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true) $$;
create function prueba.como_cliente() returns void language sql as $$ select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true) $$;
create function prueba.lista(p_nombre text) returns bigint language sql stable security definer set search_path = public as $$ select id from listas_precios where nombre = p_nombre $$;
create table prueba.ids (nombre text primary key, id bigint);
grant all on prueba.ids to anon, authenticated;
grant execute on all functions in schema prueba to anon, authenticated;
select plan(13);

insert into prueba.ids values ('v', prueba.variante('Zapatilla Urbana Classic', '40', 'Negro'));
select is(precio_de((select id from prueba.ids where nombre = 'v')), 79000.00::numeric, 'apagadas: el precio es el de siempre');
select is((select precio from v_catalogo where variante_id = (select id from prueba.ids where nombre = 'v')), 79000.00::numeric(12,2), 'y la tienda lo muestra igual');

set local role authenticated; select prueba.como_vendedora();
select throws_ok($$ select guardar_lista_precios('Web', 10, 100) $$, 'No tenés permiso para cambiar precios de venta', 'la vendedora no crea listas');
select prueba.como_equipo();
select lives_ok($$ select guardar_lista_precios('Web', 10, 100) $$, 'el administrador crea la lista Web (+10 %, redondeo a 100)');
select lives_ok($$ select guardar_lista_precios('Local', -5, 0) $$, 'y la del Local (−5 %)');
select throws_ok($$ select guardar_lista_precios('web', 1, 0) $$, 'Ya hay una lista con ese nombre', 'el nombre no se repite');
select lives_ok($$ select configurar_listas_precios(true, prueba.lista('Local'), prueba.lista('Web')) $$, 'se encienden y se asigna una lista a cada canal');

select is(precio_de((select id from prueba.ids where nombre = 'v')), 75050.00::numeric, 'el mostrador usa la lista Local: 79.000 − 5 %');
select is((select precio from v_catalogo where variante_id = (select id from prueba.ids where nombre = 'v')), 86900.00::numeric(12,2), 'la tienda muestra la lista Web: 79.000 + 10 %, redondeado a 100');
select is((select precio_lista from v_stock where variante_id = (select id from prueba.ids where nombre = 'v') limit 1), 75050.00::numeric, 'la caja ve el precio de su lista');

select throws_like($$ select quitar_lista_precios(prueba.lista('Web')) $$, 'Esa lista se está usando%', 'una lista en uso no se quita');

-- El pedido web se cotiza con la lista de la tienda (no con la del mostrador)
select prueba.como_cliente();
insert into prueba.ids select 'p', crear_pedido(format('[{"variante_id": %s, "cantidad": 1}]', (select id from prueba.ids where nombre = 'v'))::jsonb, 'retiro', null, prueba.medio('EFE'));
select is((select precio_unitario from pedido_items where pedido_id = (select id from prueba.ids where nombre = 'p')), 86900.00::numeric(12,2), 'el pedido web usa el precio de la lista Web');

select prueba.como_equipo();
select configurar_listas_precios(false, null, null);
select is(precio_de((select id from prueba.ids where nombre = 'v')), 79000.00::numeric, 'apagadas otra vez, vuelve el precio de siempre');
select * from finish();
rollback;
