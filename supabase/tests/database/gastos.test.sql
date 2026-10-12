-- Gastos: en pesos y en dólares (la cotización queda copiada), fijos por mes sin repetirse, automáticos que
-- se acumulan y no se tocan a mano, y quién los ve.
begin;
create extension if not exists pgtap with schema extensions;
create schema prueba;
grant usage on schema prueba to anon, authenticated;
create function prueba.cat(p_nombre text) returns bigint language sql stable security definer set search_path = public as $$
  select id from gasto_categorias where nombre = p_nombre $$;
create function prueba.como_admin() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) $$;
create function prueba.como_vendedora() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true) $$;
-- Lo que hace el sistema por su cuenta (WhatsApp, IA): no pasa por los permisos de nadie
create function prueba.automatico(p_importe numeric) returns bigint language sql security definer set search_path = public as $$
  select _sumar_gasto_automatico('whatsapp:2026-10', 'WhatsApp (Meta)', 'WhatsApp octubre', p_importe) $$;
create function prueba.dolar(p_valor numeric) returns void language sql security definer set search_path = public as $$
  update configuracion_gastos set dolar = p_valor $$;
grant execute on all functions in schema prueba to anon, authenticated;
select plan(13);

select prueba.dolar(1200);
set local role authenticated;
select prueba.como_admin();

-- ── A mano ──
insert into gastos (categoria_id, descripcion, importe) values (prueba.cat('Insumos'), 'Bolsas', 15000);
select is((select monto from gastos where descripcion = 'Bolsas'), 15000.00::numeric(14,2), 'un gasto en pesos vale lo que dice');
insert into gastos (categoria_id, descripcion, moneda, importe) values (prueba.cat('Inteligencia artificial'), 'Plan de IA', 'USD', 20);
select is((select monto from gastos where descripcion = 'Plan de IA'), 24000.00::numeric(14,2), 'en dólares toma la cotización del sistema: US$ 20 × 1.200');
select prueba.dolar(1500);
select is((select monto from gastos where descripcion = 'Plan de IA'), 24000.00::numeric(14,2), 'y cambiar el dólar no toca lo viejo');
select throws_ok($$ insert into gastos (categoria_id, descripcion, importe) values (1, 'x', 0) $$, '23514', null, 'el importe tiene que ser mayor que cero');

-- ── Fijos por mes ──
insert into gastos_fijos (descripcion, categoria_id, moneda, importe, dia, desde)
values ('Vercel', prueba.cat('Servicios digitales'), 'USD', 20, 1, date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires')::date - interval '2 months');
select is(generar_gastos_fijos(), 3, 'genera los meses atrasados y el actual: 3');
select is(generar_gastos_fijos(), 0, 'y otra vez no repite ninguno');
select is((select monto from gastos where descripcion = 'Vercel' limit 1), 30000.00::numeric(14,2), 'el fijo en dólares, con el dólar de hoy');

-- ── Automáticos: se acumulan por referencia y no se tocan a mano ──
select prueba.automatico(0.5);
select prueba.automatico(0.25);
select results_eq($$ select importe, origen from gastos where referencia = 'whatsapp:2026-10' $$,
  $$ values (0.75::numeric(12,2), 'automatico'::text) $$, 'los mensajes cobrados se suman al gasto del mes');
select throws_ok($$ insert into gastos (categoria_id, descripcion, importe, origen) values (1, 'trucho', 10, 'automatico') $$,
  '42501', null, 'a mano no se carga un gasto automático');
update gastos set importe = 1 where referencia = 'whatsapp:2026-10';
select is((select importe from gastos where referencia = 'whatsapp:2026-10'), 0.75::numeric(12,2), 'ni se corrige');
delete from gastos where referencia = 'whatsapp:2026-10';
select is((select count(*)::int from gastos where referencia = 'whatsapp:2026-10'), 1, 'ni se borra');

-- ── La vendedora no ve nada ──
select prueba.como_vendedora();
select is((select count(*)::int from gastos), 0, 'la vendedora no ve los gastos');
select throws_ok($$ select generar_gastos_fijos() $$, 'No tenés permiso para ver los gastos');

select * from finish();
rollback;
