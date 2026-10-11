-- Reposición sugerida: lo que falta para cubrir los próximos días al ritmo de venta.
begin;
-- ── Ayudas de prueba (viven solo dentro de esta transacción) ──
-- security definer: leen todo aunque la prueba esté actuando como un cliente sin permisos
create extension if not exists pgtap with schema extensions;
create schema prueba;
grant usage on schema prueba to anon, authenticated;
-- id de la variante modelo + talle + color
create function prueba.variante(p_modelo text, p_talle text, p_color text) returns bigint language sql stable security definer set search_path = public as $$
  select v.id from variantes v join productos p on p.id = v.producto_id join talles t on t.id = v.talle_id join colores c on c.id = v.color_id
   where p.nombre = p_modelo and t.nombre = p_talle and c.nombre = p_color $$;
create function prueba.stock(p_variante bigint) returns int language sql stable security definer set search_path = public as $$ select cantidad from stock where variante_id = p_variante $$;
create function prueba.reservado(p_variante bigint) returns int language sql stable security definer set search_path = public as $$ select reservado from stock where variante_id = p_variante $$;
create function prueba.medio(p_codigo text) returns bigint language sql stable security definer set search_path = public as $$ select id from medios_pago where codigo = p_codigo $$;
-- Actuar como el equipo o como el cliente de prueba (los usuarios que crea seed.sql)
create function prueba.como_equipo() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) $$;
create function prueba.como_cliente() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true) $$;
grant execute on all functions in schema prueba to anon, authenticated;
-- Para guardar ids entre pasos
create table prueba.ids (nombre text primary key, id bigint);
grant all on prueba.ids to anon, authenticated;
select plan(5);
select prueba.como_equipo();
-- Seed: 2 Ojota Slide 40 Negro vendidas, queda 1. Con 120 días de cobertura: 2/60×120 = 4 → faltan 3
select is((select sugerido from reposicion_sugerida(60, 120) where nombre = 'Ojota Slide' and talle = '40'), 3, 'sugiere lo que falta para la cobertura');
select is((select count(*)::int from reposicion_sugerida(60, 120) where vendidos = 0), 0, 'no sugiere talles que no se venden');
select is((select count(*)::int from reposicion_sugerida(60, 30)), 0, 'con poca cobertura y stock suficiente, nada');
select throws_ok($$ select * from reposicion_sugerida(1, 30) $$, 'Elegí un período de ventas de 7 a 365 días y una cobertura de 7 a 180 días');
-- Un cliente no la ve
select prueba.como_cliente();
select throws_ok($$ select * from reposicion_sugerida() $$, 'No tenés permiso para ver la reposición');
select * from finish();
rollback;
