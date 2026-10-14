-- Cuenta corriente: módulo apagado de fábrica, venta a cuenta con tope, cobros, anulación, ajustes y libro inmutable.
begin;
create extension if not exists pgtap with schema extensions;
create schema prueba;
grant usage on schema prueba to anon, authenticated;
create function prueba.como_admin() returns void language sql as $$ select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) $$;
create function prueba.como_vendedora() returns void language sql as $$ select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true) $$;
create function prueba.medio(p_codigo text) returns bigint language sql stable security definer set search_path = public as $$ select id from medios_pago where codigo = p_codigo $$;
create function prueba.cliente(p_nombre text) returns bigint language sql security definer set search_path = public as $$
  insert into clientes (nombre) values (p_nombre) returning id $$;
create function prueba.saldo(p_cliente bigint) returns numeric language sql stable security definer set search_path = public as $$ select _cc_saldo(p_cliente) $$;
create function prueba.vender(p_cliente bigint, p_precio numeric) returns bigint language sql security definer set search_path = public as $$
  select registrar_venta(jsonb_build_array(jsonb_build_object('variante_id', (select v.id from variantes v join productos p on p.id = v.producto_id where p.activo order by v.id limit 1), 'cantidad', 1, 'precio_unitario', p_precio)),
    jsonb_build_array(jsonb_build_object('medio_pago_id', prueba.medio('CC'))), p_cliente) $$;
grant execute on all functions in schema prueba to anon, authenticated;
select plan(20);

select is((select activo from modulos where clave = 'cuenta-corriente'), false, 'la cuenta corriente viene apagada de fábrica');
select is((select activo from medios_pago where es_cuenta_corriente), false, 'y su medio de pago no se ofrece');
create temp table c as select prueba.cliente('Cliente con deuda') as id, prueba.cliente('Otro cliente') as otro;
grant all on c to authenticated;
set local role authenticated; select prueba.como_admin();
select throws_like($$ select cc_habilitar((select id from c), true, 50000) $$, '%no está activa%', 'apagada, no se habilita a nadie');
select ajustar_stock((select v.id from variantes v join productos p on p.id = v.producto_id where p.activo order by v.id limit 1), 50, 'Inventario para la prueba');

reset role; update modulos set activo = true where clave = 'cuenta-corriente'; set local role authenticated; select prueba.como_admin();
select is((select activo from medios_pago where es_cuenta_corriente), true, 'al encender el módulo, el medio aparece');
select throws_like($$ select cc_habilitar((select id from c), true, 0) $$, 'Poné hasta cuánto puede deber%', 'habilitar pide un tope');
select lives_ok($$ select cc_habilitar((select id from c), true, 50000) $$, 'se habilita a un cliente con su tope');

select throws_like($$ select prueba.vender(null, 10000) $$, 'Para vender a cuenta corriente, elegí el cliente', 'a cuenta sin cliente, no');
select throws_like($$ select prueba.vender((select otro from c), 10000) $$, '%no tiene la cuenta corriente habilitada', 'a un cliente no habilitado, no');
select lives_ok($$ select prueba.vender((select id from c), 30000) $$, 'dentro del tope, sí');
select is(prueba.saldo((select id from c)), 30000::numeric, 'y queda debiendo lo que compró');
select throws_like($$ select prueba.vender((select id from c), 25000) $$, 'Con esta venta % debería $ %', 'pasando el tope, no');

select prueba.como_vendedora();
select throws_ok($$ select cc_cobrar((select id from c), 1000, prueba.medio('EFE')) $$, 'No tenés permiso para cobrar la cuenta corriente', 'la vendedora no cobra deudas');
select prueba.como_admin();
select throws_like($$ select cc_cobrar((select id from c), 99999, prueba.medio('EFE')) $$, 'El cliente debe $ %', 'no se cobra más de lo que debe');
select cc_cobrar((select id from c), 10000, prueba.medio('EFE'));
select is(prueba.saldo((select id from c)), 20000::numeric, 'un cobro parcial baja la deuda');

select throws_like($$ select cc_ajustar((select id from c), 500, '') $$, 'Explicá el motivo del ajuste', 'un ajuste pide motivo');
create temp table v as select prueba.vender((select id from c), 5000) as id;
grant all on v to authenticated;
select is(prueba.saldo((select id from c)), 25000::numeric, 'otra venta a cuenta suma a la deuda');
select anular_venta((select id from v), 'error_carga', null);
select is(prueba.saldo((select id from c)), 20000::numeric, 'anular la venta descuenta esa deuda');
select lives_ok($$ select cc_ajustar((select id from c), -2000, 'Descuento acordado') $$, 'un ajuste con motivo queda en el libro');
reset role;
select throws_like($$ update cc_movimientos set monto = 1 $$, '%no se editan ni se borran%', 'el libro no se edita');
select throws_like($$ delete from cc_movimientos $$, '%no se editan ni se borran%', 'ni se borra');
select * from finish();
rollback;
