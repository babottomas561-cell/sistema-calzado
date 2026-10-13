-- estado_configuracion: dice qué está configurado (solo sí/no), solo al equipo, sin revelar ningún valor.
begin;
create extension if not exists pgtap with schema extensions;
create schema prueba;
grant usage on schema prueba to anon, authenticated;
create function prueba.como_vendedor() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true) $$;
create function prueba.como_cliente() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true) $$;
grant execute on all functions in schema prueba to anon, authenticated;
select plan(5);
reset role;
update integraciones set gemini_api_key = 'clave-ultra-secreta';
set local role authenticated;
select prueba.como_vendedor();
select is((estado_configuracion()->>'ia')::boolean, true, 'dice que Gemini está configurado');
select is(estado_configuracion()::text like '%ultra-secreta%', false, 'sin revelar la clave');
select is(jsonb_typeof(estado_configuracion()->'modulos_apagados'), 'number', 'cuenta los módulos apagados');
select is((estado_configuracion()->>'pin')::boolean, false, 'el Vendedor no tiene PIN');
select prueba.como_cliente();
select throws_ok($$ select estado_configuracion() $$, 'Solo el equipo ve la configuración', 'un cliente no la ve');
select * from finish();
rollback;
