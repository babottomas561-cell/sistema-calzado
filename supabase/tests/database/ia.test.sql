-- La IA: el uso se registra solo con un aviso de Meta firmado; con el plan gratis se calcula cuánto costaría pero no
-- suma gasto, con el pago sí; el uso de hoy se cuenta contra el límite gratis; la lista de modelos se actualiza sola.
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
create function prueba.plan(p_plan text) returns void language sql security definer set search_path = public as $$
  update configuracion_tienda set ia_plan = p_plan where unica; update configuracion_gastos set dolar = 1000 where id $$;
create function prueba.limite(p_n int) returns void language sql security definer set search_path = public as $$
  update ia_modelos set limite_diario_gratis = p_n where id = 'gemini-2.5-flash' $$;
create function prueba.usos() returns int language sql stable security definer set search_path = public as $$ select count(*)::int from ia_usos $$;
create function prueba.gasto_ia() returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(importe), 0) from gastos where referencia like 'ia:%' $$;
-- Simula que Google contestó la lista de modelos (como lo deja pg_net)
create function prueba.google_lista(p_modelos text[]) returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  insert into net._http_response (id, status_code, content, created)
  values (999001, 200, jsonb_build_object('models', (select jsonb_agg(jsonb_build_object('name', 'models/' || m,
          'supportedGenerationMethods', jsonb_build_array('generateContent'))) from unnest(p_modelos) m))::text, now());
  update integraciones set ia_modelos_req = 999001 where unica;
end $$;
create function prueba.modelo(p_id text) returns table (disponible boolean, nuevo boolean, precio numeric) language sql stable security definer set search_path = public as $$
  select disponible, nuevo, precio_entrada from ia_modelos where id = p_id $$;
grant execute on all functions in schema prueba to anon, authenticated;
select plan(13);

set local role authenticated;
select prueba.como_admin();
select guardar_integraciones('123456789012345', null, 'EAAtoken1234', 'secreto-de-la-app');
select throws_ok($$ select ia_probar() $$, 'Primero cargá la clave de Gemini');
select is((select count(*)::int from ia_modelos where precio_entrada is not null), 8, 'vienen los modelos con su precio oficial');

-- ── Uso: solo con la firma de Meta ──
set local role anon;
select is(ia_registrar_uso('{"entry":[]}', 'sha256=' || repeat('0', 64), 1000, 500, 1), false, 'sin firma válida no registra (nadie infla el gasto)');
select ia_registrar_uso('{"entry":[]}', prueba.firma('{"entry":[]}'), 1000000, 1000000, 2);
select is(prueba.usos(), 1, 'con la firma de Meta registra');
select is(prueba.gasto_ia(), 0::numeric, 'con el plan gratis no suma gasto');
select is(ia_registrar_uso('{"entry":[]}', prueba.firma('{"entry":[]}'), 2000000, 1, 1), false, 'una cantidad de tokens absurda no se registra');

-- ── Plan pago: suma a Gastos con el precio del modelo (2.5 Flash: US$ 0,30 entrada / 2,50 salida) ──
select prueba.plan('pago');
select ia_registrar_uso('{"entry":[]}', prueba.firma('{"entry":[]}'), 1000000, 1000000, 1);
select is(prueba.gasto_ia(), 2.80::numeric, '1 M de entrada + 1 M de salida = US$ 2,80 de gasto');

-- ── El panel: cuánto costaría y cuánto queda gratis hoy ──
set local role authenticated;
select prueba.limite(250);
select results_eq($$ select (estado_integraciones() -> 'ia_mes' ->> 'estimado_usd')::numeric, (estado_integraciones() -> 'ia_hoy' ->> 'consultas')::int,
                            (estado_integraciones() -> 'ia_hoy' ->> 'limite')::int $$,
  $$ values (5.60::numeric, 3, 250) $$, 'el panel ve lo que costaría (US$ 5,60) y las consultas de hoy (3 de 250 gratis)');

-- ── La lista de modelos se actualiza sola ──
select prueba.google_lista(array['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-4.0-flash', 'gemini-2.5-flash-image']);
select ia_revisar_modelos();
select results_eq($$ select * from prueba.modelo('gemini-4.0-flash') $$, $$ values (true, true, null::numeric) $$,
  'aparece el modelo nuevo de Google, marcado nuevo y sin precio (para confirmar)');
select is((select disponible from prueba.modelo('gemini-2.5-pro')), false, 'el que Google ya no lista queda como no disponible');
select is((select count(*)::int from ia_modelos where id = 'gemini-2.5-flash-image'), 0, 'los de imagen no se suman (no sirven para el bot)');
select ok(estado_integraciones() ->> 'ia_modelos_revisado' is not null, 'queda la fecha de la revisión');

select prueba.como_vendedora();
select throws_ok($$ select ia_revisar_modelos(true) $$, 'No tenés permiso para configurar las conexiones');

select * from finish();
rollback;
