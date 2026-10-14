-- Mercado Pago Point: credenciales propias, buscar y pasar a modo PDV el posnet, cobrar desde la caja (monto, orden, estados, cancelar), el aviso con su firma y
-- la consulta a Mercado Pago, y la regla de tarjetas («libre» o «vinculado»). Mercado Pago se simula: _mp_point_pedir se reemplaza por respuestas preparadas.
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
create function prueba.medio(p_codigo text) returns bigint language sql stable security definer set search_path = public as $$ select id from medios_pago where codigo = p_codigo $$;
create function prueba.firma(p_id text, p_req text, p_ts text) returns text language sql immutable as $$
  select 'ts=' || p_ts || ',v1=' || encode(extensions.hmac(convert_to('id:' || p_id || ';request-id:' || p_req || ';ts:' || p_ts || ';', 'UTF8'), convert_to('secreto-point', 'UTF8'), 'sha256'), 'hex') $$;
create function prueba.cobro(p_id bigint) returns point_cobros language sql stable security definer set search_path = public as $$ select * from point_cobros where id = p_id $$;
create function prueba.orden(p_orden text, p_status text, p_detalle text) returns void language sql security definer set search_path = public as $$
  select prueba.responder('GET', '/v1/orders/' || p_orden, 200, jsonb_build_object('id', p_orden, 'status', p_status, 'status_detail', p_detalle,
    'transactions', jsonb_build_object('payments', jsonb_build_array(jsonb_build_object('id', 'PAY' || p_orden, 'status', p_status, 'status_detail', p_detalle,
      'payment_method', jsonb_build_object('id', 'visa', 'type', 'credit_card', 'installments', 1))))) ) $$;
grant execute on all functions in schema prueba to anon, authenticated;
select plan(31);
update modulos set activo = true where clave like 'mercadopago/%';   -- parten de «posnet y QR habilitados» (Parametrización)

-- ── Credenciales ──
set local role authenticated; select prueba.como_vendedora();
select throws_ok($$ select guardar_mp_point('APP_USR-1234567890-abcdefghij-xyz', 'secreto-point') $$, 'No tenés permiso para configurar las conexiones', 'la vendedora no carga credenciales');
select prueba.como_admin();
select throws_like($$ select guardar_mp_point('cualquiera', 'x') $$, 'El Access Token de Mercado Pago empieza con APP_USR-%', 'un token mal copiado se rechaza');
select lives_ok($$ select guardar_mp_point('APP_USR-1234567890-abcdefghij-xyz', 'secreto-point') $$, 'el administrador carga el token y el secreto de Point');
select is(estado_point() ->> 'token', '…-xyz', 'se ve solo el final del token');
select ok(not (estado_point()::text like '%secreto-point%'), 'y nunca el secreto');
select throws_like($$ select guardar_tarjetas_modo('vinculado') $$, 'Primero elegí el posnet que se usa en la caja%', 'no se puede exigir el posnet sin tener uno elegido');
select prueba.responder('GET', '/users/me', 200, '{"id":123456,"nickname":"BLASTLOCAL","first_name":"Tomás","last_name":"B","site_id":"MLA"}');
select is(mp_point_probar() ->> 'usuario', 'BLASTLOCAL', 'probar la conexión dice de quién es la cuenta');
select prueba.responder('GET', '/users/me', 401, '{"message":"invalid token"}');
select matches(mp_point_probar() ->> 'error', 'no reconoce el Access Token', 'con un token malo, lo explica en castellano');

-- ── Buscar y preparar el posnet ──
select prueba.responder('GET', '/terminals/v1/list%', 200, '{"data":{"terminals":[{"id":"NEWLAND_N950__N950NCB801293324","pos_id":88,"store_id":77,"operating_mode":"STANDALONE"}]}}');
select is(mp_point_buscar_terminales() ->> 'cantidad', '1', 'busca los posnets de la cuenta');
select is((select modo from point_terminales), 'STANDALONE', 'y cómo están (todavía no es modo PDV)');
select prueba.responder('PATCH', '/terminals/v1/setup', 200, '{"terminals":[{"id":"NEWLAND_N950__N950NCB801293324","operating_mode":"PDV"}]}');
select is(mp_point_usar_terminal((select id from point_terminales), 'Posnet del mostrador') ->> 'reiniciar', 'true', 'lo pasa a modo PDV y avisa que hay que reiniciarlo');
select ok((select por_defecto and modo = 'PDV' and nombre = 'Posnet del mostrador' from point_terminales), 'queda como el de siempre, con su nombre');
select is(point_caja() ->> 'disponible', 'true', 'la caja sabe que hay posnet');
select is(point_caja() ->> 'modo', 'libre', 'y que la regla de tarjetas es libre de fábrica');

-- ── Cobrar ──
select prueba.responder('POST', '/v1/orders', 201, '{"id":"ORD01ABC","status":"created","status_detail":"created"}');
select is(point_cobrar(15000.5) ->> 'ok', 'true', 'se manda el cobro al posnet');
select is((select cuerpo -> 'transactions' -> 'payments' -> 0 ->> 'amount' from prueba.llamadas where metodo = 'POST' and ruta = '/v1/orders'), '15000.50', 'con el monto como texto y dos decimales');
select is((select cuerpo -> 'config' -> 'point' ->> 'terminal_id' from prueba.llamadas where metodo = 'POST' and ruta = '/v1/orders'), 'NEWLAND_N950__N950NCB801293324', 'al posnet elegido');
select is((prueba.cobro((select max(id) from point_cobros))).estado, 'en_terminal', 'el cobro queda esperando en el posnet');
select is((prueba.cobro((select max(id) from point_cobros))).orden_id, 'ORD01ABC', 'con la orden de Mercado Pago');
select throws_ok($$ select point_cobrar(0) $$, 'El monto no es válido', 'un monto en cero no se manda');

-- ── El aviso de Mercado Pago ──
reset role;
select is(point_notificacion('ORD01ABC', 'req-1', 'ts=1,v1=' || repeat('0', 64)), 'firma_invalida', 'un aviso con firma falsa se rechaza');
select is(point_notificacion('ORD01ABC', 'req-1', 'basura'), 'firma_invalida', 'y uno sin firma');
select prueba.orden('ORD01ABC', 'processed', 'accredited');
select is(point_notificacion('ORD01ABC', 'req-1', prueba.firma('ord01abc', 'req-1', '1700000000')), 'ok', 'con la firma buena, se procesa (consultando a Mercado Pago)');
select is((prueba.cobro((select max(id) from point_cobros))).estado, 'aprobado', 'el cobro queda aprobado');
select is((prueba.cobro((select max(id) from point_cobros))).medio, 'visa', 'con el medio con que pagó');
select is(point_notificacion('ORD99', 'req-2', prueba.firma('ord99', 'req-2', '1700000001')), 'orden_desconocida', 'una orden que no es nuestra se ignora');

-- ── La regla de tarjetas ──
update configuracion_tienda set tarjetas_modo = 'libre';
set local role authenticated; select prueba.como_admin();
select ajustar_stock((select v.id from variantes v join productos p on p.id = v.producto_id where p.activo order by v.id limit 1), 50, 'Inventario para la prueba');
create function pg_temp.vender(p_medio text, p_ref text, p_precio numeric) returns bigint language sql as $$
  select registrar_venta(jsonb_build_array(jsonb_build_object('variante_id', (select v.id from variantes v join productos p on p.id = v.producto_id where p.activo order by v.id limit 1), 'cantidad', 1, 'precio_unitario', p_precio)),
    jsonb_build_array(jsonb_build_object('medio_pago_id', prueba.medio(p_medio), 'referencia', p_ref))) $$;
select lives_ok($$ select guardar_tarjetas_modo('vinculado') $$, 'con el posnet listo se puede exigir');
-- una tarjeta sin pasar por el posnet
select throws_like($$ do $d$ begin perform pg_temp.vender('DEB', '1234', 9000); set constraints all immediate; end $d$ $$, 'Con tarjeta se cobra con el posnet de Mercado Pago%', 'con la regla «vinculado», una tarjeta anotada a mano se frena');
-- el cobro aprobado de 15000,50 se usa una sola vez
reset role; update point_cobros set monto = 9000 where id = (select max(id) from point_cobros); set local role authenticated; select prueba.como_admin();
select lives_ok($$ do $d$ begin perform pg_temp.vender('DEB', 'ORD01ABC', 9000); set constraints all immediate; end $d$ $$, 'con la referencia del cobro aprobado, pasa y al cierre queda bien');
select is((select venta_id is not null from point_cobros where id = (select max(id) from point_cobros)), true, 'el cobro queda atado a la venta');
select throws_like($$ do $d$ begin perform pg_temp.vender('CRE', 'ORD01ABC', 9000); set constraints all immediate; end $d$ $$, 'El cobro de Mercado Pago ORD01ABC ya se usó en otra venta', 'el mismo cobro no sirve para una segunda venta');
reset role; set constraints all deferred;
select * from finish();
rollback;
