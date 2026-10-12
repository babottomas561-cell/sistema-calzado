-- Credenciales de Uber Direct y Andreani: se guardan sin poder leerse, el panel ve solo si están, y las pruebas de
-- conexión interpretan bien lo que contestan (los servicios se simulan reemplazando _pedir_http).
begin;
create extension if not exists pgtap with schema extensions;
create schema prueba;
grant usage on schema prueba to anon, authenticated;
create table prueba.respuestas (url text, status int, cuerpo jsonb, cabeceras jsonb default '{}');
create table prueba.llamadas (id serial, url text, cabeceras jsonb, cuerpo text);
grant all on prueba.respuestas, prueba.llamadas, prueba.llamadas_id_seq to anon, authenticated;
create or replace function public._pedir_http(p_metodo text, p_url text, p_cabeceras jsonb default '{}', p_tipo text default null, p_cuerpo text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r prueba.respuestas;
begin
  insert into prueba.llamadas (url, cabeceras, cuerpo) values (p_url, p_cabeceras, p_cuerpo);
  select * into r from prueba.respuestas where url = p_url;
  return jsonb_build_object('status', coalesce(r.status, 404), 'cuerpo', coalesce(r.cuerpo, '{}'), 'cabeceras', coalesce(r.cabeceras, '{}'));
end $$;
create function prueba.responder(p_url text, p_status int, p_cuerpo jsonb, p_cab jsonb default '{}') returns void language sql security definer set search_path = public as $$
  delete from prueba.respuestas where url = p_url; insert into prueba.respuestas values (p_url, p_status, p_cuerpo, p_cab) $$;
create function prueba.como_admin() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) $$;
create function prueba.como_vendedora() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true) $$;
grant execute on all functions in schema prueba to anon, authenticated;
select plan(9);

set local role authenticated;
select prueba.como_admin();
select guardar_envios_credenciales('cust-123', 'client-abc', 'secreto-uber-9876', 'usuario_api', 'clave-andreani-42', 'CL0001', '400006709');
select results_eq($$ select estado_envios() -> 'uber' ->> 'secreto', (estado_envios() -> 'uber' ->> 'completo')::boolean, estado_envios() -> 'andreani' ->> 'clave' $$,
  $$ values ('…9876', true, '…42') $$, 'el panel ve que están, sin los secretos');
select throws_ok($$ select uber_client_secret from integraciones $$, '42501', null, 'nadie lee las credenciales');

-- ── Uber ──
select prueba.responder('https://auth.uber.com/oauth/v2/token', 401, '{"error":"invalid_client"}');
select is(probar_uber() ->> 'error', 'Uber no reconoce esas credenciales (revisá el Client ID y el Client Secret en direct.uber.com → Developer)', 'credenciales malas: lo dice claro');
select prueba.responder('https://auth.uber.com/oauth/v2/token', 200, '{"access_token":"tok","expires_in":2592000}');
select is((probar_uber() ->> 'ok')::boolean, true, 'credenciales buenas: conectado');
select ok((select cuerpo from prueba.llamadas where url like '%uber%' order by id desc limit 1) like '%scope=eats.deliveries%', 'pide el permiso de envíos');

-- ── Andreani ──
select prueba.responder('https://apis.andreani.com/login', 200, '{}', '{"x-authorization-token":"tok"}');
select is((probar_andreani() ->> 'ok')::boolean, true, 'Andreani: inicia sesión');
select is((select cabeceras ->> 'Authorization' from prueba.llamadas where url like '%andreani%' order by id desc limit 1),
  'Basic ' || encode(convert_to('usuario_api:clave-andreani-42', 'UTF8'), 'base64'), 'con usuario y contraseña (Basic)');

-- ── Quitar y permisos ──
select guardar_envios_credenciales(p_quitar := '{uber}');
select is((estado_envios() -> 'uber' ->> 'completo')::boolean, false, 'quitar borra las de Uber');
select prueba.como_vendedora();
select throws_ok($$ select estado_envios() $$, 'No tenés permiso para ver las conexiones');

select * from finish();
rollback;
