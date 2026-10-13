-- Menú configurable: módulos que se apagan (solo quien administra el equipo) y favoritos / ocultos de cada persona.
begin;
create extension if not exists pgtap with schema extensions;
create schema prueba;
grant usage on schema prueba to anon, authenticated;
create function prueba.como_admin() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) $$;
create function prueba.como_vendedor() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true) $$;
create function prueba.como_cliente() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true) $$;
grant execute on all functions in schema prueba to anon, authenticated;
select plan(10);
set local role authenticated;

select prueba.como_admin();
select lives_ok($$ select configurar_modulos(array['/admin/presupuestos', '/admin/contabilidad', '/admin/presupuestos']) $$, 'el Administrador apaga módulos');
select is((select count(*)::int from modulos_desactivados), 2, 'sin repetidos');

select prueba.como_vendedor();
select is((select count(*)::int from modulos_desactivados), 2, 'el equipo ve qué está apagado');
select throws_ok($$ select configurar_modulos('{}') $$, 'No tenés permiso para configurar los módulos', 'el Vendedor no los cambia');

-- Menú de cada persona
select lives_ok($$ select guardar_menu_usuario(array['/admin/stock'], array['/admin/pedidos']) $$, 'cada persona guarda su menú');
select is((select favoritos from menu_usuario), array['/admin/stock'], 'guarda sus favoritos');
select prueba.como_admin();
select is((select count(*)::int from menu_usuario), 0, 'y nadie más ve el suyo');
select lives_ok($$ select guardar_menu_usuario(array['/admin/ventas'], '{}') $$, 'cada una el suyo');
select prueba.como_cliente();
select throws_ok($$ select guardar_menu_usuario('{}', '{}') $$, 'Solo el equipo tiene menú', 'un cliente no tiene menú del panel');
select is((select count(*)::int from modulos_desactivados), 0, 'ni ve los módulos');
select * from finish();
rollback;
