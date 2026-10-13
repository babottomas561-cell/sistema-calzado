-- Impresión por persona: lo propio pisa lo de la tienda; lo vacío usa lo de la tienda; solo quien edita Tablas lo cambia.
begin;
create extension if not exists pgtap with schema extensions;
create schema prueba;
grant usage on schema prueba to authenticated;
create function prueba.como_admin() returns void language sql as $$ select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) $$;
create function prueba.como_vendedora() returns void language sql as $$ select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true) $$;
create function prueba.una_venta() returns bigint language sql stable security definer set search_path = public as $$ select max(id) from ventas $$;
grant execute on all functions in schema prueba to authenticated;
select plan(8);

update configuracion_impresion set comprobante_formato = 'ticket80', modo_impresion = 'opcional', comprobante_copias = 1;
set local role authenticated;
select prueba.como_admin();
select is((select modo from impresion_de()), 'opcional', 'sin nada propio, vale lo de la tienda');

insert into impresion_por_usuario (usuario_id, comprobante_formato, modo_impresion) values ('33333333-3333-3333-3333-333333333333', 'a4', 'manual');
select prueba.como_vendedora();
select is((select formato from impresion_de()), 'a4', 'la vendedora tiene su papel');
select is((select modo from impresion_de()), 'manual', 'y su modo');
select is((select copias from impresion_de()), 1, 'lo que dejó vacío (copias) es lo de la tienda');
select is((select count(*)::int from impresion_por_usuario), 1, 've la suya');
update impresion_por_usuario set modo_impresion = 'automatica';
select is((select modo from impresion_de()), 'manual', 'no la puede cambiar (la base no la deja)');

select prueba.como_admin();
select is((select formato from impresion_de()), 'ticket80', 'al administrador no le cambia nada');
select is(comprobante_de('venta', prueba.una_venta(), false) -> 'config' ->> 'formato', 'ticket80', 'el comprobante viaja con el papel de quien lo abre');

select * from finish();
rollback;
