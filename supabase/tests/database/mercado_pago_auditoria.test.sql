-- Auditoría de Mercado Pago: idempotencia estable, Mercado Pago que no contesta, importe cobrado, un cobro = una venta (cualquier medio),
-- devolución del dinero al anular, barrido de pendientes y avisos sin clave. Mercado Pago se simula (_mp_point_pedir).
begin;
create extension if not exists pgtap with schema extensions;
create schema prueba;
grant usage on schema prueba to anon, authenticated;
create table prueba.respuestas (metodo text, ruta text, status int, cuerpo jsonb);
create table prueba.llamadas (id serial, metodo text, ruta text, cuerpo jsonb, idem text);
grant all on prueba.respuestas, prueba.llamadas, prueba.llamadas_id_seq to anon, authenticated;
create or replace function public._mp_point_pedir(p_metodo text, p_ruta text, p_cuerpo jsonb default null, p_idempotencia text default null, p_cabeceras jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = public as $$
declare r prueba.respuestas;
begin
  insert into prueba.llamadas (metodo, ruta, cuerpo, idem) values (p_metodo, p_ruta, p_cuerpo, p_idempotencia);
  select * into r from prueba.respuestas where metodo = p_metodo and p_ruta like ruta order by length(ruta) desc limit 1;
  if not found then return jsonb_build_object('status', 404, 'cuerpo', '{}'::jsonb); end if;
  if r.status = -1 then raise exception 'timeout simulado'; end if;
  return jsonb_build_object('status', r.status, 'cuerpo', r.cuerpo);
end $$;
create function prueba.responder(p_metodo text, p_ruta text, p_status int, p_cuerpo jsonb) returns void language sql security definer set search_path = public as $$
  delete from prueba.respuestas where metodo = p_metodo and ruta = p_ruta; insert into prueba.respuestas values (p_metodo, p_ruta, p_status, p_cuerpo) $$;
create function prueba.como_admin() returns void language sql as $$ select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) $$;
create function prueba.medio(p_codigo text) returns bigint language sql stable security definer set search_path = public as $$ select id from medios_pago where codigo = p_codigo $$;
create function prueba.estado(p_id bigint) returns text language sql stable security definer set search_path = public as $$ select estado from point_cobros where id = p_id $$;
create function prueba.orden(p_orden text, p_status text, p_monto text) returns void language sql security definer set search_path = public as $$
  select prueba.responder('GET', '/v1/orders/' || p_orden, 200, jsonb_build_object('id', p_orden, 'status', p_status, 'status_detail', p_status,
    'transactions', jsonb_build_object('payments', jsonb_build_array(jsonb_build_object('id', 'PAY' || p_orden, 'status', p_status, 'amount', p_monto,
      'payment_method', jsonb_build_object('id', 'visa', 'type', 'credit_card', 'installments', 1))))) ) $$;
grant execute on all functions in schema prueba to anon, authenticated;
select plan(13);

reset role;
update integraciones set mp_access_token = 'APP_USR-1234567890-abcdefghij-xyz', mp_webhook_secret = 'secreto', mp_point_token = null, mp_point_secreto = null;
update cajas set mp_externo = 'CAJA1', mp_caja_id = '1' where por_defecto;
insert into point_terminales (terminal_id, nombre, modo, activa, por_defecto) values ('TERM1', 'Posnet', 'PDV', true, true);
set local role authenticated; select prueba.como_admin();
select ajustar_stock((select v.id from variantes v join productos p on p.id = v.producto_id where p.activo order by v.id limit 1), 50, 'Inventario para la prueba');
create function pg_temp.vender(p_medio text, p_ref text, p_precio numeric) returns bigint language sql as $$
  select registrar_venta(jsonb_build_array(jsonb_build_object('variante_id', (select v.id from variantes v join productos p on p.id = v.producto_id where p.activo order by v.id limit 1), 'cantidad', 1, 'precio_unitario', p_precio)),
    jsonb_build_array(jsonb_build_object('medio_pago_id', prueba.medio(p_medio), 'referencia', p_ref))) $$;

-- 1. Mercado Pago no contesta: el cobro queda anotado, no se pierde
select prueba.responder('POST', '/v1/orders', -1, '{}');
select is(point_cobrar(5000) ->> 'ok', 'false', 'si Mercado Pago no contesta, se avisa');
select is(prueba.estado((select max(id) from point_cobros)), 'error', 'y el cobro queda anotado como error (pudo haber llegado al posnet)');
-- 2. La clave de idempotencia es estable por cobro
select prueba.responder('POST', '/v1/orders', 201, '{"id":"ORDA","status":"created","type_response":{"qr_data":"000201"}}');
select point_cobrar(7000);
select is((select idem from prueba.llamadas where ruta = '/v1/orders' order by id desc limit 1), 'cobro-c' || (select max(id) from point_cobros), 'la clave de idempotencia es la del cobro (un reintento no duplica)');
-- 3. El importe cobrado tiene que ser el pedido
select prueba.orden('ORDA', 'processed', '9999.00');
reset role; select _point_sincronizar((select max(id) from point_cobros)); set local role authenticated; select prueba.como_admin();
select is(prueba.estado((select max(id) from point_cobros)), 'error', 'si Mercado Pago cobró otro importe, no se da por bueno');
select is((select monto_pagado from point_cobros order by id desc limit 1), 9999.00::numeric, 'y queda anotado lo que cobró');

-- 4. Un cobro, una venta (también con un medio que no es tarjeta, como la billetera del QR)
select prueba.responder('POST', '/v1/orders', 201, '{"id":"ORDB","status":"created","type_response":{"qr_data":"000202"}}');
select qr_cobrar(6000);
select prueba.orden('ORDB', 'processed', '6000.00');
reset role; select _point_sincronizar((select max(id) from point_cobros)); set local role authenticated; select prueba.como_admin();
select throws_like($$ do $d$ begin perform pg_temp.vender('MP', 'ORDB', 8000); set constraints all immediate; end $d$ $$, 'El cobro de Mercado Pago fue por $ %', 'el cobro de otro importe no sirve');
select lives_ok($$ do $d$ begin perform pg_temp.vender('MP', 'ORDB', 6000); set constraints all immediate; end $d$ $$, 'con su importe, sirve');
select throws_like($$ do $d$ begin perform pg_temp.vender('EFE', 'ORDB', 6000); set constraints all immediate; end $d$ $$, 'El cobro de Mercado Pago ORDB ya se usó en otra venta', 'y una sola vez, con cualquier medio');

-- 5. Anular la venta devuelve el dinero por Mercado Pago
select prueba.responder('POST', '/v1/orders/ORDB/refund', 200, '{"status":"refunded"}');
create temp table v as select (select venta_id from point_cobros where orden_id = 'ORDB') as id;
grant all on v to authenticated;
select lives_ok($$ do $d$ begin perform anular_venta((select id from v), 'error_carga', null); set constraints all immediate; end $d$ $$, 'se anula la venta cobrada con Mercado Pago');
select is(prueba.estado((select id from point_cobros where orden_id = 'ORDB')), 'reembolsado', 'y el cobro queda reembolsado');
select ok(exists (select 1 from prueba.llamadas where ruta = '/v1/orders/ORDB/refund'), 'se pidió el reembolso a Mercado Pago');

-- 6. Barrido de pendientes (cron) y avisos sin clave
select prueba.responder('POST', '/v1/orders', 201, '{"id":"ORDC","status":"created","type_response":{"qr_data":"000203"}}');
select qr_cobrar(1500);
select prueba.orden('ORDC', 'processed', '1500.00');
reset role; update point_cobros set consultado_en = now() - interval '5 minutes' where orden_id = 'ORDC';
select _point_reconciliar();
select is(prueba.estado((select id from point_cobros where orden_id = 'ORDC')), 'aprobado', 'el barrido actualiza un cobro pendiente aunque el aviso no llegue');
update integraciones set mp_webhook_secret = null;
select is(point_notificacion('ORDC', 'req', 'ts=1,v1=' || repeat('0', 64)), 'firma_invalida', 'sin clave secreta cargada, un aviso no se acepta');
select * from finish();
rollback;
