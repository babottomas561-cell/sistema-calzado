-- «Más vendidos» de la caja: suma las ventas de todos, no cuenta las anuladas y no la usa quien no vende.
begin;
create extension if not exists pgtap with schema extensions;
create schema prueba;
grant usage on schema prueba to anon, authenticated;
create function prueba.variante(p_talle text, p_color text) returns bigint language sql stable security definer set search_path = public as $$
  select v.id from variantes v join productos p on p.id = v.producto_id join talles t on t.id = v.talle_id join colores c on c.id = v.color_id
   where p.nombre = 'Zapatilla Urbana Classic' and t.nombre = p_talle and c.nombre = p_color $$;
create function prueba.medio(p_codigo text) returns bigint language sql stable security definer set search_path = public as $$ select id from medios_pago where codigo = p_codigo $$;
create function prueba.producto() returns bigint language sql stable security definer set search_path = public as $$ select id from productos where nombre = 'Zapatilla Urbana Classic' $$;
create function prueba.como_admin() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) $$;
create function prueba.como_vendedor() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true) $$;
create function prueba.como_cliente() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true) $$;
grant execute on all functions in schema prueba to anon, authenticated;
create table prueba.ids (nombre text primary key, id bigint);
grant all on prueba.ids to anon, authenticated;
select plan(5);

set local role authenticated;
select prueba.como_admin();
create temp table antes on commit drop as select coalesce((select unidades from mas_vendidos_caja(30, 24) where producto_id = prueba.producto()), 0) as n;
grant all on antes to authenticated;
insert into prueba.ids select 'v1', registrar_venta(jsonb_build_array(jsonb_build_object('variante_id', prueba.variante('40', 'Negro'), 'cantidad', 2)),
  jsonb_build_array(jsonb_build_object('medio_pago_id', prueba.medio('EFE'))));
select is((select unidades from mas_vendidos_caja(30, 24) where producto_id = prueba.producto()), (select n + 2 from antes), 'suma las unidades vendidas');

-- La vendedora no ve esa venta, pero sí cuenta para los más vendidos
select prueba.como_vendedor();
select is((select unidades from mas_vendidos_caja(30, 24) where producto_id = prueba.producto()), (select n + 2 from antes), 'el Vendedor ve el total del local, no las ventas');
select is((select count(*)::int from mas_vendidos_caja(30, 1)), 1, 'respeta el límite');

-- Anulada: deja de contar
select prueba.como_admin();
select anular_venta((select id from prueba.ids where nombre = 'v1'), 'error_carga');
select is(coalesce((select unidades from mas_vendidos_caja(30, 24) where producto_id = prueba.producto()), 0), (select n from antes), 'una venta anulada no cuenta');

select prueba.como_cliente();
select throws_ok($$ select * from mas_vendidos_caja() $$, 'No tenés permiso para vender');
select * from finish();
rollback;
