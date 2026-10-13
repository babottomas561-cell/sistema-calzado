-- El rol Vendedor (la familia que atiende el local): lo que no puede (costos, precios, anular, fuera de plazo,
-- ventas y devoluciones ajenas) y lo que sí (encontrar y cambiar una venta que hizo otro).
begin;
create extension if not exists pgtap with schema extensions;
create schema prueba;
grant usage on schema prueba to anon, authenticated;
create function prueba.variante(p_talle text, p_color text) returns bigint language sql stable security definer set search_path = public as $$
  select v.id from variantes v join productos p on p.id = v.producto_id join talles t on t.id = v.talle_id join colores c on c.id = v.color_id
   where p.nombre = 'Zapatilla Urbana Classic' and t.nombre = p_talle and c.nombre = p_color $$;
create function prueba.medio(p_codigo text) returns bigint language sql stable security definer set search_path = public as $$ select id from medios_pago where codigo = p_codigo $$;
create function prueba.cliente(p_nombre text) returns bigint language sql stable security definer set search_path = public as $$ select id from clientes where nombre = p_nombre $$;
create function prueba.como_admin() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) $$;
-- La vendedora de prueba (la crea seed.sql con el rol Vendedor)
create function prueba.como_vendedor() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true) $$;
create function prueba.renglon(p_venta bigint) returns bigint language sql stable security definer set search_path = public as $$ select min(id) from venta_items where venta_id = p_venta $$;
create function prueba.numero(p_venta bigint) returns text language sql stable security definer set search_path = public as $$ select numero::text from ventas where id = p_venta $$;
grant execute on all functions in schema prueba to anon, authenticated;
create table prueba.ids (nombre text primary key, id bigint);
grant all on prueba.ids to anon, authenticated;
select plan(17);

-- ── Los roles ──
select results_eq($$ select permisos, descuento_max_pct from roles where nombre = 'Vendedor' $$,
  $$ values ('{clientes.editar,clientes.ver,facturas.emitir,pedidos.gestionar,stock.ver,ventas.registrar,ventas.sin_factura}'::text[], 10.00::numeric(5,2)) $$,
  'Vendedor: vende (con o sin factura), pedidos, clientes y stock; hasta 10 % de descuento');
select is((select count(*)::int from roles where nombre = 'Cajero'), 0, 'ya no hay «Cajero»');
select is((select activo from roles where nombre = 'Depósito'), false, '«Depósito» queda desactivado');

-- El dueño vende algo y hace una devolución
set local role authenticated;
select prueba.como_admin();
insert into prueba.ids select 'va', registrar_venta(jsonb_build_array(jsonb_build_object('variante_id', prueba.variante('40', 'Negro'), 'cantidad', 2)),
  jsonb_build_array(jsonb_build_object('medio_pago_id', prueba.medio('EFE'))), prueba.cliente('María González'));
insert into prueba.ids select 'da', registrar_devolucion((select id from prueba.ids where nombre = 'va'),
  jsonb_build_array(jsonb_build_object('venta_item_id', prueba.renglon((select id from prueba.ids where nombre = 'va')), 'cantidad', 1)), 'talle');

-- ── La vendedora ──
select prueba.como_vendedor();
select is((select count(*)::int from ventas where id = (select id from prueba.ids where nombre = 'va')), 0, 'no ve la venta que hizo otro');
select is((select count(*)::int from devoluciones where id = (select id from prueba.ids where nombre = 'da')), 0, 'ni su devolución');
select is((select count(*)::int from v_hechos_ventas), 0, 'ni los informes');
select is((select count(*) filter (where precio_compra is not null)::int from v_stock), 0, 've el stock sin costos');
select throws_ok($$ select * from reposicion_sugerida() $$, 'No tenés permiso para ver la reposición');
select is((select (r->>'id')::bigint from jsonb_array_elements(ventas_para_cambio(prueba.numero((select id from prueba.ids where nombre = 'va')))) r limit 1),
  (select id from prueba.ids where nombre = 'va'), 'encuentra la venta por el número del ticket');
select ok(jsonb_array_length(ventas_para_cambio('María')) >= 1, 'y por el nombre del cliente');
select is((venta_para_cambio((select id from prueba.ids where nombre = 'va'))->'items'->0->>'devuelto')::int, 1, 'la lee para el cambio (con lo ya devuelto)');
select is((venta_para_cambio((select id from prueba.ids where nombre = 'va'))->>'visible')::boolean, false, 'sabiendo que no puede abrir su detalle');
-- Hace el cambio del par que queda, por el talle 41
insert into prueba.ids select 'cb', (registrar_cambio((select id from prueba.ids where nombre = 'va'),
  jsonb_build_array(jsonb_build_object('venta_item_id', prueba.renglon((select id from prueba.ids where nombre = 'va')), 'cantidad', 1)),
  jsonb_build_array(jsonb_build_object('variante_id', prueba.variante('41', 'Negro'), 'cantidad', 1)))->>'venta_id')::bigint;
select is((select count(*)::int from ventas where id = (select id from prueba.ids where nombre = 'cb')), 1, 'hace el cambio, y la venta nueva es suya');
select is((select count(*)::int from devoluciones), 1, 've solo su devolución');
select throws_ok(format($$ select anular_venta(%s, 'error_carga') $$, (select id from prueba.ids where nombre = 'cb')), 'No tenés permiso para anular ventas');
select throws_like($$ select registrar_venta(jsonb_build_array(jsonb_build_object('variante_id', prueba.variante('42', 'Negro'), 'cantidad', 1)),
  jsonb_build_array(jsonb_build_object('medio_pago_id', prueba.medio('EFE'))), null, 20000) $$, 'Tu descuento máximo es del 10 %%', 'no pasa su tope de descuento (10 %)');
insert into prueba.ids select 'vp', registrar_venta(jsonb_build_array(jsonb_build_object('variante_id', prueba.variante('42', 'Negro'), 'cantidad', 1, 'precio_unitario', 1000)),
  jsonb_build_array(jsonb_build_object('medio_pago_id', prueba.medio('EFE'))));
select is((select precio_unitario from v_venta_items where venta_id = (select id from prueba.ids where nombre = 'vp')), 79000.00::numeric(12,2), 'no cambia el precio: cobra el de lista');

select * from finish();
rollback;
