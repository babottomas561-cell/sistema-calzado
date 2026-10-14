-- Confirmación de pagos: el efectivo lo confirma un cajero; la transferencia pide lo que decida el dueño (nada, n.º de operación o comprobante adjunto);
-- lo pendiente no cuenta como pagado; en la caja la transferencia pide el n.º de operación; el aviso de pago sale al confirmar.
begin;
create extension if not exists pgtap with schema extensions;
create schema prueba;
grant usage on schema prueba to anon, authenticated;
create function prueba.como_admin() returns void language sql as $$ select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) $$;
create function prueba.como_vendedora() returns void language sql as $$ select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true) $$;
create function prueba.medio(p_codigo text) returns bigint language sql stable security definer set search_path = public as $$ select id from medios_pago where codigo = p_codigo $$;
create function prueba.pagado() returns boolean language sql stable security definer set search_path = public as $$ select pedido_pagado(1) $$;
create function prueba.cuantos(p_tabla text) returns bigint language plpgsql stable security definer set search_path = public as $$ declare n bigint; begin execute format('select count(*) from %I where pedido_id = 1', p_tabla) into n; return n; end $$;
grant execute on all functions in schema prueba to anon, authenticated;
select plan(26);

update configuracion_tienda set envio_requiere_pago = false;
set local role authenticated; select prueba.como_admin();

-- ── Efectivo: queda pendiente hasta que un cajero lo confirma ──
select is(registrar_pago_pedido(1, 87400, null, prueba.medio('EFE'), null, false) ->> 'confirmado', 'false', 'un pago en efectivo anotado sin confirmar queda pendiente');
select is(prueba.pagado(), false, 'el pedido no cuenta como pagado');
select is((select count(*) from pedido_pagos where pedido_id = 1 and confirmado_en is null), 1::bigint, 'el pago figura sin confirmar');
select throws_ok($$ select confirmar_pago_pedido(999999) $$, 'Ese pago no existe', 'confirmar uno que no existe');
select lives_ok($$ select confirmar_pago_pedido((select id from pedido_pagos where pedido_id = 1 and confirmado_en is null)) $$, 'el cajero confirma que recibió el efectivo');
select is(prueba.pagado(), true, 'ahora sí está pagado');
select throws_ok($$ select confirmar_pago_pedido((select id from pedido_pagos where pedido_id = 1 limit 1)) $$, 'Ese pago ya estaba confirmado', 'no se confirma dos veces');
select is((select confirmado_por from pedido_pagos where pedido_id = 1 limit 1), '11111111-1111-1111-1111-111111111111'::uuid, 'queda quién lo confirmó');
select throws_like($$ select quitar_pago_pendiente((select id from pedido_pagos where pedido_id = 1 limit 1)) $$, 'Un pago confirmado no se saca%', 'un pago confirmado no se saca');

-- ── Efectivo con confirmación en el acto ──
reset role; delete from pedido_pagos where pedido_id = 1; set local role authenticated; select prueba.como_admin();
select is(registrar_pago_pedido(1, 87400, null, prueba.medio('EFE'), null, true) ->> 'confirmado', 'true', 'quien tiene el permiso lo confirma al anotarlo');
reset role; delete from pedido_pagos where pedido_id = 1;
update roles set permisos = array_remove(permisos, 'pagos.confirmar') where nombre = 'Vendedor';
set local role authenticated; select prueba.como_vendedora();
select is(registrar_pago_pedido(1, 87400, null, prueba.medio('EFE'), null, true) ->> 'confirmado', 'false', 'sin el permiso, el efectivo queda pendiente aunque pida confirmarlo');
select throws_ok($$ select confirmar_pago_pedido((select id from pedido_pagos where pedido_id = 1 limit 1)) $$, 'No tenés permiso para confirmar pagos', 'y no puede confirmarlo');
select lives_ok($$ select quitar_pago_pendiente((select id from pedido_pagos where pedido_id = 1 limit 1)) $$, 'pero sí sacar el pendiente que anotó por error');
select is(prueba.cuantos('pedido_pagos'), 0::bigint, 'se sacó');

-- ── Transferencia según lo que decida el dueño ──
reset role; update configuracion_tienda set transferencia_comprobante = 'no'; set local role authenticated; select prueba.como_admin();
select is(registrar_pago_pedido(1, 1000, null, prueba.medio('TRA'), null, true) ->> 'confirmado', 'true', 'sin exigencias, la transferencia queda confirmada');
reset role; delete from pedido_pagos where pedido_id = 1; update configuracion_tienda set transferencia_comprobante = 'referencia'; set local role authenticated; select prueba.como_admin();
select throws_like($$ select registrar_pago_pedido(1, 1000, null, prueba.medio('TRA'), null, true) $$, 'Anotá el n.º de operación%', 'si se pide el n.º de operación, sin él no se registra');
select is(registrar_pago_pedido(1, 1000, '00123456', prueba.medio('TRA'), null, true) ->> 'confirmado', 'true', 'con el n.º de operación, sí');
reset role; delete from pedido_pagos where pedido_id = 1; update configuracion_tienda set transferencia_comprobante = 'adjunto'; set local role authenticated; select prueba.como_admin();
select throws_like($$ select registrar_pago_pedido(1, 1000, '00123456', prueba.medio('TRA'), null, true) $$, 'Adjuntá el comprobante%', 'si se pide el comprobante, el n.º no alcanza');
select is(registrar_pago_pedido(1, 1000, null, prueba.medio('TRA'), 'pedido-1/transferencia.jpg', true) ->> 'confirmado', 'true', 'con el comprobante adjunto queda confirmada');
select is((select comprobante_path from pedido_pagos where pedido_id = 1), 'pedido-1/transferencia.jpg', 'y queda guardado el archivo');
select throws_ok($$ select registrar_pago_pedido(1, 1000, null, prueba.medio('TRA'), '../../etc/passwd', true) $$, 'El comprobante adjunto no es válido', 'un nombre de archivo raro se rechaza');
select throws_like($$ select guardar_confirmacion_pagos('cualquiera') $$, 'Elegí una de las tres opciones', 'la opción tiene que ser una de las tres');

-- ── El comprobante del pedido cuenta solo lo confirmado ──
reset role; delete from pedido_pagos where pedido_id = 1;
insert into pedido_pagos (pedido_id, monto, referencia, confirmado_en) values (1, 10000, 'a', now());
insert into pedido_pagos (pedido_id, monto, referencia) values (1, 20000, 'b');
set local role authenticated; select prueba.como_admin();
select is(jsonb_array_length(comprobante_de('pedido', 1) -> 'pagos'), 1, 'el comprobante muestra solo el pago confirmado');

-- ── Entregar con un pago sin confirmar ──
reset role;
select throws_like($$ update pedidos set estado = 'entregado' where id = 1 $$, 'Hay un pago anotado sin confirmar%', 'no se entrega un pedido con un pago sin confirmar');
delete from pedido_pagos where pedido_id = 1 and confirmado_en is null;
set local role authenticated; select prueba.como_admin();

-- ── En la caja ──
reset role; update configuracion_tienda set transferencia_comprobante = 'referencia';
set local role authenticated; select prueba.como_admin();
select ajustar_stock((select v.id from variantes v join productos p on p.id = v.producto_id where p.activo order by v.id limit 1), 50, 'Inventario para la prueba');
create function pg_temp.vender(p_ref text) returns bigint language sql as $$
  select registrar_venta(jsonb_build_array(jsonb_build_object('variante_id', (select v.id from variantes v join productos p on p.id = v.producto_id where p.activo order by v.id limit 1), 'cantidad', 1, 'precio_unitario', 9000)),
    jsonb_build_array(jsonb_build_object('medio_pago_id', prueba.medio('TRA'), 'referencia', p_ref))) $$;
select pg_temp.vender(null);
select throws_like($$ set constraints all immediate $$, 'Para cobrar por transferencia anotá el n.º de operación%', 'en la caja, una transferencia sin n.º de operación se frena al cierre');
select lives_ok($$ select pg_temp.vender('00998877') $$, 'con el n.º de operación pasa');
select * from finish();
rollback;
