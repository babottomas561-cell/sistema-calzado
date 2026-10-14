-- Datos fiscales por sucursal (etapa 1): cada venta sabe de qué caja y sucursal salió; cada sucursal es de una razón social (la principal o una adicional) y
-- su comprobante lleva esos datos; facturar por ARCA desde una razón social adicional todavía se frena con un mensaje claro.
begin;
create extension if not exists pgtap with schema extensions;
create schema prueba;
grant usage on schema prueba to anon, authenticated;
create function prueba.como_admin() returns void language sql as $$ select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) $$;
create function prueba.como_vendedora() returns void language sql as $$ select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true) $$;
create function prueba.medio(p_codigo text) returns bigint language sql stable security definer set search_path = public as $$ select id from medios_pago where codigo = p_codigo $$;
create function prueba.suc(p_nombre text) returns bigint language sql stable security definer set search_path = public as $$ select id from sucursales where nombre = p_nombre $$;
create function prueba.caja(p_nombre text) returns bigint language sql stable security definer set search_path = public as $$ select id from cajas where nombre = p_nombre $$;
create table prueba.ids (nombre text primary key, id bigint);
grant all on prueba.ids to anon, authenticated;
grant execute on all functions in schema prueba to anon, authenticated;
select plan(19);

-- Datos de la razón social principal y stock para vender
reset role;
update datos_legales set cuit = '20-12345678-6', razon_social = 'Mi Local SRL', condicion_iva = 'Responsable Inscripto', domicilio_legal = 'Mitre 100', telefono_contacto = '381 555-0000' where unica;
set local role authenticated; select prueba.como_admin();
select ajustar_stock((select v.id from variantes v join productos p on p.id = v.producto_id where p.activo order by v.id limit 1), 50, 'Inventario para la prueba');
create function pg_temp.vender(p_caja bigint) returns bigint language sql as $$
  select registrar_venta(jsonb_build_array(jsonb_build_object('variante_id', (select v.id from variantes v join productos p on p.id = v.producto_id where p.activo order by v.id limit 1), 'cantidad', 1, 'precio_unitario', 10000)),
    jsonb_build_array(jsonb_build_object('medio_pago_id', prueba.medio('EFE'))), null, 0, 'Local', null, null, p_caja) $$;

-- Una venta sin caja es de la principal
insert into prueba.ids select 'v1', pg_temp.vender(null);
select is((select s.nombre from ventas v join sucursales s on s.id = v.sucursal_id where v.id = (select id from prueba.ids where nombre = 'v1')), 'Principal', 'sin caja, la venta es de la sucursal principal');
select is((select c.nombre from ventas v join cajas c on c.id = v.caja_id where v.id = (select id from prueba.ids where nombre = 'v1')), 'Caja 1', 'y de su caja principal');

-- Razones sociales adicionales
select prueba.como_vendedora();
select throws_ok($$ select guardar_empresa('Otra SA', '30-71234567-1', 'Responsable Inscripto', 'Belgrano 200') $$, 'Solo el administrador cambia las razones sociales', 'la vendedora no crea razones sociales');
select prueba.como_admin();
select throws_like($$ select guardar_empresa('Otra SA', '30-12345678-0', 'Responsable Inscripto', 'Belgrano 200') $$, 'El CUIT no es válido%', 'un CUIT mal se rechaza');
select throws_like($$ select guardar_empresa('Mi Local SRL', '20-12345678-6', 'Responsable Inscripto', 'Mitre 100') $$, 'Ese CUIT es el de la razón social principal%', 'el CUIT de la principal no se repite');
select lives_ok($$ select guardar_empresa('Hermanos Pérez SRL', '30-50000000-3', 'Monotributo', 'Belgrano 200') $$, 'el administrador suma una razón social');
select is((select count(*)::int from empresas), 1, 'queda cargada');

-- Una sucursal de esa razón social, con su local y su caja
select lives_ok($$ select guardar_sucursal('Sucursal Norte', null, null, true, (select id from empresas limit 1), 'Belgrano 200, local 3', '381 555-1111') $$, 'una sucursal de la otra razón social');
select lives_ok($$ select guardar_caja(prueba.suc('Sucursal Norte'), 'Caja Norte') $$, 'con su caja');
select throws_like($$ select guardar_sucursal('Principal', (select id from sucursales where por_defecto), null, true, (select id from empresas limit 1)) $$, 'La sucursal principal es de la razón social principal', 'la principal no cambia de razón social');
select throws_like($$ select guardar_empresa('Hermanos Pérez SRL', '30-50000000-3', 'Monotributo', 'Belgrano 200', null, null, (select id from empresas limit 1), false) $$, 'Hay sucursales que usan esta razón social%', 'una razón social en uso no se apaga');

-- Cada venta con su caja: y su comprobante, con los datos de su razón social
insert into prueba.ids select 'v2', pg_temp.vender(prueba.caja('Caja Norte'));
select is((select sucursal_id from ventas where id = (select id from prueba.ids where nombre = 'v2')), prueba.suc('Sucursal Norte'), 'la venta queda en la sucursal de su caja');
select is(comprobante_de('venta', (select id from prueba.ids where nombre = 'v2'), false) -> 'emisor' ->> 'razon_social', 'Hermanos Pérez SRL', 'su comprobante lleva la razón social de esa sucursal');
select is(comprobante_de('venta', (select id from prueba.ids where nombre = 'v2'), false) -> 'emisor' ->> 'cuit', '30-50000000-3', 'con su CUIT');
select is(comprobante_de('venta', (select id from prueba.ids where nombre = 'v2'), false) -> 'emisor' ->> 'sucursal', 'Sucursal Norte', 'y el nombre de la sucursal (hay más de una)');
select is(comprobante_de('venta', (select id from prueba.ids where nombre = 'v1'), false) -> 'emisor' ->> 'razon_social', 'Mi Local SRL', 'la venta de la principal sigue con la razón social principal');

-- Facturar por ARCA desde la razón social adicional: todavía no
reset role; update configuracion_fiscal set activa = true; set local role authenticated; select prueba.como_admin();
select throws_like(format($$ select facturar_venta(%s) $$, (select id from prueba.ids where nombre = 'v2')), 'La razón social de la sucursal de esta venta todavía no puede facturar%', 'facturar desde la otra razón social se frena con un mensaje claro');

-- Una caja apagada no vende
select lives_ok($$ select guardar_caja(prueba.suc('Sucursal Norte'), 'Caja Norte', prueba.caja('Caja Norte'), null, false) $$, 'se apaga una caja');
select throws_like($$ select pg_temp.vender(prueba.caja('Caja Norte')) $$, 'Esa caja no existe o está apagada', 'y no se puede vender con ella');
select * from finish();
rollback;
