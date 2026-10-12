-- Portada configurable: quién ve y quién edita las secciones, los datos de la tienda y el ranking público.
begin;
create extension if not exists pgtap with schema extensions;
create schema prueba;
grant usage on schema prueba to anon, authenticated;
create function prueba.como_equipo() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) $$;
create function prueba.como_cliente() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true) $$;
-- Cambia el rol del usuario del equipo (para probar a alguien sin "Tienda online")
create function prueba.rol_equipo(p_rol text) returns void language sql security definer set search_path = public as $$
  update perfiles set rol_id = (select id from roles where nombre = p_rol) where id = '11111111-1111-1111-1111-111111111111' $$;
grant execute on all functions in schema prueba to anon, authenticated;
select plan(17);

-- La migración deja la portada de siempre armada en secciones
select is((select array_agg(tipo order by orden) from inicio_secciones),
  array['portada', 'cinta', 'accesos', 'productos', 'promociones', 'pasos', 'local'], 'la portada nace con sus siete secciones en orden');
select throws_ok($$ insert into inicio_secciones (tipo) values ('carrusel_3d') $$, '23514', null, 'un tipo de sección desconocido no entra');
select throws_ok($$ update inicio_secciones set boton_enlace = 'javascript:alert(1)' where tipo = 'portada' $$, '23514', null, 'el link del botón solo puede ser interno, ancla o http(s)');
select lives_ok($$ insert into inicio_secciones (tipo, orden, visible) values ('editorial', 99, false) $$, 'acepta el bloque editorial');
delete from inicio_secciones where tipo = 'editorial';
select throws_ok($$ update configuracion_tienda set avisos = array['1','2','3','4','5','6'] $$, '23514', null, 'hasta 5 avisos');
select throws_ok($$ update configuracion_tienda set avisos = array[repeat('x', 121)] $$, '23514', null, 'cada aviso, hasta 120 letras');
update inicio_secciones set visible = false where tipo = 'pasos';

-- Público: solo las prendidas, y no escribe nada
set local role anon;
select is((select count(*)::int from inicio_secciones), 6, 'anon: ve solo las secciones prendidas');
select is((select count(*)::int from inicio_secciones where tipo = 'pasos'), 0, 'anon: no ve la oculta');
select throws_ok($$ insert into inicio_secciones (tipo) values ('banner') $$, '42501', null, 'anon: no agrega secciones');
select ok((select count(*) from mas_vendidos_tienda()) > 0, 'anon: puede pedir el ranking de lo más vendido');
reset role;
-- (se cruza fuera del rol anon: el público no puede leer productos)
select is((select count(*)::int from mas_vendidos_tienda() m join productos p on p.id = m.producto_id where not (p.publicado_web and p.activo)), 0,
  'el ranking no incluye artículos sin publicar ni inactivos');

-- Cliente registrado: igual que el público
set local role authenticated;
select prueba.como_cliente();
select is((select count(*)::int from inicio_secciones), 6, 'cliente: tampoco ve la oculta');
update inicio_secciones set titulo = 'hackeado' where tipo = 'portada';
update configuracion_tienda set nombre = 'hackeado';
reset role;
select is((select count(*)::int from inicio_secciones where titulo = 'hackeado') + (select count(*)::int from configuracion_tienda where nombre = 'hackeado'), 0,
  'cliente: no cambia secciones ni datos de la tienda');

-- Equipo sin "Tienda online" (Cajero): no edita
select prueba.rol_equipo('Cajero');
set local role authenticated;
select prueba.como_equipo();
update inicio_secciones set titulo = 'cajero' where tipo = 'portada';
reset role;
select is((select count(*)::int from inicio_secciones where titulo = 'cajero'), 0, 'cajero: no edita la portada');

-- Administrador: ve todas y edita
select prueba.rol_equipo('Administrador');
set local role authenticated;
select prueba.como_equipo();
select is((select count(*)::int from inicio_secciones), 7, 'administrador: ve también la oculta');
update inicio_secciones set titulo = 'Nueva temporada' where tipo = 'portada';
update configuracion_tienda set avisos = array['Envío gratis', '6 cuotas'], instagram = 'mitienda';
reset role;
select is((select titulo from inicio_secciones where tipo = 'portada'), 'Nueva temporada', 'administrador: edita una sección');
select is((select array_to_string(avisos, ' · ') || ' @' || instagram from configuracion_tienda), 'Envío gratis · 6 cuotas @mitienda', 'administrador: edita avisos e Instagram');

select * from finish();
rollback;
