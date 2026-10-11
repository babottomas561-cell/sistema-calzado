-- Galería de fotos: una sola principal, imagen_url sincronizada y qué ve el público.
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
select plan(9);
insert into prueba.ids values ('running', (select id from productos where nombre = 'Zapatilla Running Pro')),
                              ('escolar', (select id from productos where nombre = 'Zapatilla Escolar'));
insert into producto_imagenes (producto_id, url) select (select id from prueba.ids where nombre = 'running'), u from unnest(array['https://x/a.jpg', 'https://x/b.jpg', 'https://x/c.jpg']) u;
insert into producto_imagenes (producto_id, url) values ((select id from prueba.ids where nombre = 'escolar'), 'https://x/oculta.jpg');

select is((select url from producto_imagenes where principal and producto_id = (select id from prueba.ids where nombre = 'running')), 'https://x/a.jpg', 'la primera foto nace principal');
select is((select array_agg(orden order by id) from producto_imagenes where producto_id = (select id from prueba.ids where nombre = 'running')), array[1, 2, 3], 'se ordenan en el orden en que se suben');
select is((select imagen_url from productos where nombre = 'Zapatilla Running Pro'), 'https://x/a.jpg', 'productos.imagen_url = la principal');

update producto_imagenes set principal = true where url = 'https://x/c.jpg';
select is((select count(*)::int from producto_imagenes where principal and producto_id = (select id from prueba.ids where nombre = 'running')), 1, 'marcar otra desmarca la anterior');
select is((select imagen_url from productos where nombre = 'Zapatilla Running Pro'), 'https://x/c.jpg', 'imagen_url sigue a la principal');

delete from producto_imagenes where url = 'https://x/c.jpg';
select is((select imagen_url from productos where nombre = 'Zapatilla Running Pro'), 'https://x/a.jpg', 'al borrar la principal pasa a la primera que queda');

-- Público: solo fotos de productos publicados, por la vista
set local role anon;
select is((select count(*)::int from producto_imagenes), 0, 'anon: no lee la tabla');
select is((select count(*)::int from v_imagenes_tienda where url = 'https://x/oculta.jpg'), 0, 'anon: no ve fotos de productos sin publicar');
select is((select count(*)::int from v_imagenes_tienda where url like 'https://x/%'), 2, 'anon: ve las del producto publicado');

select * from finish();
rollback;
