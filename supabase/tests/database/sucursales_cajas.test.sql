-- Sucursales y cajas del sistema vinculadas con las de Mercado Pago: la principal siempre existe, permisos, vínculos únicos, cada caja cobra con SU QR y SU posnet.
begin;
create extension if not exists pgtap with schema extensions;
create schema prueba;
grant usage on schema prueba to anon, authenticated;
create table prueba.respuestas (metodo text, ruta text, status int, cuerpo jsonb);
create table prueba.llamadas (id serial, metodo text, ruta text, cuerpo jsonb);
grant all on prueba.respuestas, prueba.llamadas, prueba.llamadas_id_seq to anon, authenticated;
create or replace function public._mp_point_pedir(p_metodo text, p_ruta text, p_cuerpo jsonb default null, p_idempotencia text default null, p_cabeceras jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = public as $$
declare r prueba.respuestas;
begin
  insert into prueba.llamadas (metodo, ruta, cuerpo) values (p_metodo, p_ruta, p_cuerpo);
  select * into r from prueba.respuestas where metodo = p_metodo and p_ruta like ruta order by length(ruta) desc limit 1;
  if not found then return jsonb_build_object('status', 404, 'cuerpo', '{}'::jsonb); end if;
  return jsonb_build_object('status', r.status, 'cuerpo', r.cuerpo);
end $$;
create function prueba.responder(p_metodo text, p_ruta text, p_status int, p_cuerpo jsonb) returns void language sql security definer set search_path = public as $$
  delete from prueba.respuestas where metodo = p_metodo and ruta = p_ruta; insert into prueba.respuestas values (p_metodo, p_ruta, p_status, p_cuerpo) $$;
create function prueba.como_admin() returns void language sql as $$ select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) $$;
create function prueba.como_vendedora() returns void language sql as $$ select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true) $$;
create function prueba.suc(p_nombre text) returns bigint language sql stable security definer set search_path = public as $$ select id from sucursales where nombre = p_nombre $$;
create function prueba.caja(p_nombre text) returns bigint language sql stable security definer set search_path = public as $$ select id from cajas where nombre = p_nombre $$;
grant execute on all functions in schema prueba to anon, authenticated;
select plan(31);
update modulos set activo = true where clave like 'mercadopago/%';   -- parten de «posnet y QR habilitados» (Parametrización)

-- La principal siempre existe
select is((select nombre from sucursales where por_defecto), 'Principal', 'siempre hay una sucursal principal');
select is((select nombre from cajas where por_defecto), 'Caja 1', 'y una caja principal');
select isnt((select deposito_id from sucursales where por_defecto), null, 'la sucursal principal es del depósito principal');

reset role;
update integraciones set mp_access_token = 'APP_USR-1234567890-abcdefghij-xyz', mp_webhook_secret = 'secreto', mp_point_token = null, mp_point_secreto = null;
set local role authenticated; select prueba.como_vendedora();
select throws_ok($$ select guardar_sucursal('Centro') $$, 'Solo el administrador cambia las sucursales', 'la vendedora no crea sucursales');
select throws_ok($$ select sucursal_vincular_mp((select id from sucursales where por_defecto), '999') $$, 'No tenés permiso para configurar las conexiones', 'ni vincula con Mercado Pago');
select prueba.como_admin();
select lives_ok($$ select guardar_sucursal('Centro', null, (select id from depositos where vendible limit 1)) $$, 'el administrador crea una sucursal');
select throws_ok($$ select guardar_sucursal('centro') $$, 'Ya hay una sucursal con ese nombre', 'el nombre no se repite');
select throws_ok($$ select guardar_sucursal('Principal', (select id from sucursales where por_defecto), null, false) $$, 'La sucursal principal no se apaga', 'la principal no se apaga');
select lives_ok($$ select guardar_caja(prueba.suc('Centro'), 'Caja Centro') $$, 'y una caja en ella');
select throws_ok($$ select guardar_caja(prueba.suc('Centro'), 'caja centro') $$, 'Ya hay una caja con ese nombre en esa sucursal', 'sin repetir nombre en la sucursal');
select throws_ok($$ select guardar_caja((select id from sucursales where por_defecto), 'Caja 1', (select id from cajas where por_defecto), null, false) $$, 'La caja principal no se apaga', 'la caja principal no se apaga');

-- Vincular con Mercado Pago: una sucursal de Mercado Pago, una sola sucursal del sistema
select prueba.responder('GET', '/users/me', 200, '{"id":123456}');
select prueba.responder('POST', '/users/123456/stores', 201, '{"id":"5001"}');
select is(sucursal_crear_en_mp(prueba.suc('Centro'), 'Mitre', '100', 'Rosario', 'Santa Fe') ->> 'ok', 'true', 'se crea la sucursal en Mercado Pago');
select throws_ok($$ select sucursal_vincular_mp((select id from sucursales where por_defecto), '5001') $$, 'Esa sucursal de Mercado Pago ya está vinculada con otra sucursal del sistema', 'una sucursal de Mercado Pago no se vincula dos veces');
select is(caja_crear_en_mp((select id from cajas where por_defecto)) ->> 'ok', 'false', 'sin la sucursal vinculada, no se crea la caja');
select prueba.responder('POST', '/v2/pos', 201, '{"id":777,"external_id":"CAJAX","qr_response":{"image":"https://mp/x.png","template_document":"https://mp/x.pdf"}}');
select is(caja_crear_en_mp(prueba.caja('Caja Centro')) ->> 'ok', 'true', 'se crea la caja en esa sucursal de Mercado Pago');
select is((select jsonb_typeof(cuerpo -> 'store_id') from prueba.llamadas where ruta = '/v2/pos' order by id desc limit 1), 'string', 'con el identificador de la sucursal como texto');
select is(caja_vincular_mp((select id from cajas where por_defecto), '888', '') ->> 'ok', 'false', 'una caja sin identificador no se vincula');

-- Cada caja cobra con su QR
select prueba.responder('POST', '/v1/orders', 201, '{"id":"ORDQ","status":"created","type_response":{"qr_data":"0002"}}');
select is(qr_cobrar(1000, 'dynamic', prueba.caja('Caja Centro')) ->> 'ok', 'true', 'se cobra con el QR de la caja del Centro');
select is((select cuerpo -> 'config' -> 'qr' ->> 'external_pos_id' from prueba.llamadas where ruta = '/v1/orders' order by id desc limit 1), (select mp_externo from cajas where nombre = 'Caja Centro'), 'la orden usa la caja de Mercado Pago de esa caja');
select is((select caja_id from point_cobros order by id desc limit 1), prueba.caja('Caja Centro'), 'y el cobro queda anotado en esa caja');
select is(qr_cobrar(1000, 'dynamic', (select id from cajas where por_defecto)) ->> 'ok', 'false', 'la caja principal, sin QR preparado, avisa que no está lista');
select is(qr_cobrar(10, 'dynamic', prueba.caja('Caja Centro')) ->> 'error', 'Mercado Pago no acepta cobros por QR menores a $ 15,00', 'por debajo del mínimo, ni se le pide a Mercado Pago');
select is(point_caja(prueba.caja('Caja Centro')) ->> 'qr_minimo', '15.00', 'la caja conoce el mínimo del QR');
reset role; update configuracion_tienda set qr_monto_minimo = 0; set local role authenticated; select prueba.como_admin();
select prueba.responder('POST', '/v1/orders', 400, '{"errors":[{"code":"property_value","message":"Invalid value for property","details":["Amount must be greater than or equal to 15.00"]}]}');
select is(qr_cobrar(1.05, 'dynamic', prueba.caja('Caja Centro')) ->> 'error', 'Mercado Pago no generó el cobro: Mercado Pago no acepta cobros menores a $ 15,00', 'el monto mínimo de Mercado Pago se explica en castellano');
select is((select detalle from point_cobros order by id desc limit 1), 'Mercado Pago no acepta cobros menores a $ 15,00', 'y queda anotado en el cobro');
select is(point_caja(prueba.caja('Caja Centro')) ->> 'qr_minimo', '15.00', 'el sistema aprende el mínimo que informa Mercado Pago');
select lives_ok($$ select guardar_qr_minimo(20) $$, 'y el administrador lo puede cambiar');
select is(point_caja(prueba.caja('Caja Centro')) ->> 'qr', 'true', 'la caja dice si tiene QR');

-- Cada dispositivo cobra con la caja que tiene asignada
create temp table dis as select registrar_dispositivo('Tablet del Centro') as clave;
grant all on dis to authenticated;
select dispositivo_asignar_caja((select id from dispositivos where clave = (select clave from dis)), prueba.caja('Caja Centro'));
select is(cobro_medios((select clave from dis)) -> 'caja' ->> 'caja', 'Caja Centro', 'un dispositivo cobra con la caja que tiene asignada');
select is(cobro_medios() -> 'caja' ->> 'caja', 'Caja 1', 'y sin dispositivo, con la principal');
select is(jsonb_array_length(sucursales_estado() -> 'sucursales'), 2, 'la pantalla ve las dos sucursales');
select * from finish();
rollback;
