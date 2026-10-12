-- La IA: el uso se registra solo con un aviso de Meta firmado, con precio se suma a Gastos, y la prueba de la clave
-- la hace la base (solo quien configura).
begin;
create extension if not exists pgtap with schema extensions;
create schema prueba;
grant usage on schema prueba to anon, authenticated;
create function prueba.como_admin() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) $$;
create function prueba.como_vendedora() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true) $$;
create function prueba.firma(p_cuerpo text) returns text language sql immutable as $$
  select 'sha256=' || encode(extensions.hmac(convert_to(p_cuerpo, 'UTF8'), convert_to('secreto-de-la-app', 'UTF8'), 'sha256'), 'hex') $$;
create function prueba.precios(p_entrada numeric, p_salida numeric) returns void language sql security definer set search_path = public as $$
  update configuracion_gastos set ia_precio_entrada = p_entrada, ia_precio_salida = p_salida, dolar = 1000 $$;
create function prueba.usos() returns int language sql stable security definer set search_path = public as $$ select count(*)::int from ia_usos $$;
create function prueba.gasto_ia() returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(importe), 0) from gastos where referencia like 'ia:%' $$;
grant execute on all functions in schema prueba to anon, authenticated;
select plan(9);

set local role authenticated;
select prueba.como_admin();
select guardar_integraciones('123456789012345', null, 'EAAtoken1234', 'secreto-de-la-app');
select throws_ok($$ select ia_probar() $$, 'Primero cargá la clave de Gemini');

-- ── Uso: solo con la firma de Meta ──
set local role anon;
select is(ia_registrar_uso('{"entry":[]}', 'sha256=' || repeat('0', 64), 1000, 500), false, 'sin firma válida no registra (nadie infla el gasto)');
select is(ia_registrar_uso('{"entry":[]}', prueba.firma('{"entry":[]}'), 1000, 500), true, 'con la firma de Meta registra');
select is(prueba.usos(), 1, 'queda el uso');
select is(prueba.gasto_ia(), 0::numeric, 'con el plan gratis (precio 0) no suma gasto');
select prueba.precios(0.30, 2.50);
select ia_registrar_uso('{"entry":[]}', prueba.firma('{"entry":[]}'), 2000000, 1);
select is(prueba.usos(), 1, 'una cantidad de tokens absurda no se registra');
select ia_registrar_uso('{"entry":[]}', prueba.firma('{"entry":[]}'), 1000000, 1000000);
select is(prueba.gasto_ia(), 2.80::numeric, '1 M de entrada (US$ 0,30) + 1 M de salida (US$ 2,50) = US$ 2,80 de gasto');

-- ── El panel ──
set local role authenticated;
select is((estado_integraciones() -> 'ia_mes' ->> 'respuestas')::int, 2, 'el panel ve el uso del mes');
select prueba.como_vendedora();
select throws_ok($$ select ia_probar() $$, 'No tenés permiso para configurar las conexiones');

select * from finish();
rollback;
