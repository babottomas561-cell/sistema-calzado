-- Identidad de la tienda: logo y color de la marca (en la tienda y en los mails).
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

select is((select color_marca from configuracion_tienda), null, 'de fábrica no hay color propio (se usa el de siempre)');
select lives_ok($$ update configuracion_tienda set color_marca = '#0f766e', logo_url = 'https://ejemplo.com/logo.png' $$, 'se guarda un color y un logo');
select throws_like($$ update configuracion_tienda set color_marca = 'rojo' $$, '%color_marca%', 'un color mal escrito se rechaza');
select throws_like($$ update configuracion_tienda set color_marca = '#0F766E' $$, '%color_marca%', 'el color va en minúscula (#rrggbb)');
select throws_like($$ update configuracion_tienda set logo_url = 'javascript:alert(1)' $$, '%logo_url%', 'el logo tiene que ser una dirección web');
select ok((select _correo_plantilla('confirmacion', 'Mi Local', '#0f766e', null) ->> 'html') like '%background:#0f766e%', 'el mail usa el color de la tienda');
select ok((select _correo_plantilla('confirmacion', 'Mi Local', '#0f766e', 'https://ejemplo.com/logo.png') ->> 'html') like '%<img src="https://ejemplo.com/logo.png"%', 'y, si hay logo, lo muestra en vez de la inicial');

select * from finish();
rollback;
