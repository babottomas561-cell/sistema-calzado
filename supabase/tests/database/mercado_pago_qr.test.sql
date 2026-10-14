-- Mercado Pago QR dinámico: preparar sucursal y caja, pedir el QR con el monto, cancelar. Mercado Pago se simula (_mp_point_pedir).
begin;
create extension if not exists pgtap with schema extensions;
create schema prueba;
grant usage on schema prueba to anon, authenticated;
create table prueba.respuestas (metodo text, ruta text, status int, cuerpo jsonb);
create table prueba.llamadas (id serial, metodo text, ruta text, cuerpo jsonb, cabeceras jsonb);
grant all on prueba.respuestas, prueba.llamadas, prueba.llamadas_id_seq to anon, authenticated;
create or replace function public._mp_point_pedir(p_metodo text, p_ruta text, p_cuerpo jsonb default null, p_idempotencia text default null, p_cabeceras jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = public as $$
declare r prueba.respuestas;
begin
  insert into prueba.llamadas (metodo, ruta, cuerpo, cabeceras) values (p_metodo, p_ruta, p_cuerpo, p_cabeceras);
  select * into r from prueba.respuestas where metodo = p_metodo and p_ruta like ruta order by length(ruta) desc limit 1;
  if not found then return jsonb_build_object('status', 404, 'cuerpo', '{}'::jsonb); end if;
  return jsonb_build_object('status', r.status, 'cuerpo', r.cuerpo);
end $$;
create function prueba.responder(p_metodo text, p_ruta text, p_status int, p_cuerpo jsonb) returns void language sql security definer set search_path = public as $$
  delete from prueba.respuestas where metodo = p_metodo and ruta = p_ruta; insert into prueba.respuestas values (p_metodo, p_ruta, p_status, p_cuerpo) $$;
create function prueba.como_admin() returns void language sql as $$ select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) $$;
create function prueba.como_vendedora() returns void language sql as $$ select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true) $$;
grant execute on all functions in schema prueba to anon, authenticated;
select plan(30);

reset role;
update integraciones set mp_access_token = 'APP_USR-1234567890-abcdefghij-xyz', mp_webhook_secret = 'secreto';
set local role authenticated; select prueba.como_vendedora();
select throws_ok($$ select qr_preparar('Mitre', '100', 'Rosario', 'Santa Fe') $$, 'No tenés permiso para configurar las conexiones', 'la vendedora no prepara el QR');
select prueba.como_admin();
select throws_like($$ select qr_preparar('', '100', 'Rosario', 'Santa Fe') $$, 'Completá calle, número, ciudad y provincia%', 'faltan datos del local');
select is(estado_qr() ->> 'listo', 'false', 'al principio el QR no está preparado');
select is(qr_cobrar(1000) ->> 'ok', 'false', 'sin preparar, no se puede cobrar con QR');
select prueba.responder('GET', '/users/me', 200, '{"id":123456}');
select prueba.responder('POST', '/users/123456/stores', 201, '{"id":"98765"}');
select prueba.responder('POST', '/v2/pos', 201, '{"id":"555"}');
select is(qr_preparar('Mitre', '100', 'Rosario', 'Santa Fe') ->> 'ok', 'true', 'crea la sucursal y la caja en Mercado Pago');
select is((select cuerpo -> 'config' -> 'qr' ->> 'operating_mode' from prueba.llamadas where ruta = '/v2/pos'), 'pdv', 'la caja se crea integrada por API');
select is(estado_qr() ->> 'listo', 'true', 'queda preparado');
select is(point_caja() ->> 'qr', 'true', 'la caja sabe que hay QR');

select prueba.responder('POST', '/v1/orders', 201, '{"id":"ORDQR1","status":"created","type_response":{"qr_data":"00020101021243650016com.mercadolibre"}}');
select is(qr_cobrar(15000.5) ->> 'ok', 'true', 'se pide el QR con el monto');
select is((select cuerpo -> 'config' -> 'qr' ->> 'mode' from prueba.llamadas where ruta = '/v1/orders'), 'dynamic', 'dinámico');
select is(point_estado((select max(id) from point_cobros)) ->> 'qr', '00020101021243650016com.mercadolibre', 'la caja recibe el texto del QR para dibujarlo');
select prueba.responder('POST', '/v1/orders/ORDQR1/cancel', 200, '{"status":"canceled"}');
select is(point_cancelar((select max(id) from point_cobros)) ->> 'ok', 'true', 'se puede cancelar el QR');
-- Reintento: si la sucursal ya existe (la creó un intento anterior), se reutiliza
reset role; update integraciones set mp_qr_externo = null, mp_qr_caja = null, mp_qr_sucursal = null; set local role authenticated; select prueba.como_admin();
select prueba.responder('POST', '/users/123456/stores', 400, '{"message":"external id ''SUCURSAL1'' is already assigned to this user 123456"}');
select prueba.responder('GET', '/users/123456/stores/search%', 200, '{"results":[{"id":"98765"}]}');
select is(qr_preparar('Mitre', '100', 'Rosario', 'Santa Fe') ->> 'ok', 'true', 'si la sucursal ya existía en Mercado Pago, la reutiliza y sigue con la caja');
select is((select (estado_qr() ->> 'sucursal')), 'true', 'queda la sucursal que ya existía');
reset role; update integraciones set mp_qr_externo = null, mp_qr_caja = null; set local role authenticated; select prueba.como_admin();
select is(qr_preparar('Mitre', '100', 'Rosario', 'Santa Fe') ->> 'ok', 'true', 'y si falló la caja, el reintento no vuelve a crear la sucursal');

-- QR fijo (híbrido)
select prueba.responder('GET', '/pos/555', 200, '{"id":555,"qr_response":{"image":"https://mp/qr.png","template_document":"https://mp/qr.pdf"}}');
select is(qr_fijo() ->> 'imagen', 'https://mp/qr.png', 'trae el QR fijo de la caja para imprimir');
select is(qr_fijo() ->> 'plantilla', 'https://mp/qr.pdf', 'y su documento listo para imprimir');
select prueba.responder('POST', '/v1/orders', 201, '{"id":"ORDQR2","status":"created"}');
select is(qr_cobrar(8000, 'hybrid') ->> 'ok', 'true', 'con el QR del mostrador no hace falta el texto del QR');
select is((select cuerpo -> 'config' -> 'qr' ->> 'mode' from prueba.llamadas where ruta = '/v1/orders' order by id desc limit 1), 'hybrid', 'se pide en modo híbrido');
-- Elegir una sucursal y una caja que ya existen en la cuenta
reset role; update integraciones set mp_qr_externo = null, mp_qr_caja = null, mp_qr_sucursal = null; set local role authenticated; select prueba.como_admin();
select prueba.responder('GET', '/users/123456/stores/search%', 200, '{"results":[{"id":"111","name":"Local Centro","external_id":"CENTRO","location":{"address_line":"Mitre 100"}},{"id":"222","name":"Depósito","external_id":"DEP"}]}');
select prueba.responder('GET', '/pos?store_id=111', 200, '{"results":[{"id":701,"name":"Caja 1","external_id":"C1"},{"id":702,"name":"Caja sin código"}]}');
select prueba.responder('GET', '/pos?store_id=222', 200, '{"results":[]}');
select is(jsonb_array_length(qr_sucursales() -> 'sucursales'), 2, 'lista las sucursales de la cuenta');
select is(qr_sucursales() -> 'sucursales' -> 0 -> 'cajas' -> 0 ->> 'externo', 'C1', 'con sus cajas');
select prueba.responder('GET', '/pos/701', 200, '{"id":701,"external_id":"C1","qr_response":{"image":"https://mp/c1.png","template_document":"https://mp/c1.pdf"}}');
select is(qr_usar_sucursal('111', '701', 'C1') ->> 'ok', 'true', 'se elige una caja que ya existe');
select is(estado_qr() ->> 'caja_externa', 'C1', 'queda usando esa caja');
select is(qr_fijo() ->> 'imagen', 'https://mp/c1.png', 'y trae su QR fijo');
select is(qr_usar_sucursal('111', '702', '') ->> 'ok', 'false', 'una caja sin identificador no sirve para cobrar');
select prueba.responder('POST', '/v2/pos', 201, '{"id":703,"external_id":"CAJA1"}');
select is(qr_usar_sucursal('222') ->> 'ok', 'true', 'una sucursal sin cajas: se crea una ahí');
select lives_ok($$ select qr_desvincular() $$, 'se puede dejar de usar para elegir otra');
-- «Esperar el pago»
select is(cobro_espera_pago(), true, 'de fábrica, la caja espera el pago antes de confirmar la venta');
select lives_ok($$ select guardar_espera_pago(false) $$, 'el administrador lo puede apagar');
select is(cobro_espera_pago(), false, 'y queda apagado');
select * from finish();
rollback;
