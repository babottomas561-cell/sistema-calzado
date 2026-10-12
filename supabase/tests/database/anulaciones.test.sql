-- Anular una venta del día: vuelve el stock, deja de contar, permisos, plazo y qué pasa con su pedido o presupuesto.
begin;
create extension if not exists pgtap with schema extensions;
create schema prueba;
grant usage on schema prueba to anon, authenticated;
create function prueba.variante(p_modelo text, p_talle text, p_color text) returns bigint language sql stable security definer set search_path = public as $$
  select v.id from variantes v join productos p on p.id = v.producto_id join talles t on t.id = v.talle_id join colores c on c.id = v.color_id
   where p.nombre = p_modelo and t.nombre = p_talle and c.nombre = p_color $$;
create function prueba.stock(p_variante bigint) returns int language sql stable security definer set search_path = public as $$ select cantidad from stock where variante_id = p_variante $$;
create function prueba.reservado(p_variante bigint) returns int language sql stable security definer set search_path = public as $$ select reservado from stock where variante_id = p_variante $$;
create function prueba.medio(p_codigo text) returns bigint language sql stable security definer set search_path = public as $$ select id from medios_pago where codigo = p_codigo $$;
create function prueba.como_equipo() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) $$;
create function prueba.como_cliente() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true) $$;
create function prueba.rol_equipo(p_rol text) returns void language sql security definer set search_path = public as $$
  update perfiles set rol_id = (select id from roles where nombre = p_rol) where id = '11111111-1111-1111-1111-111111111111' $$;
-- Una venta de N pares de la Urbana 40 negra, en efectivo
create function prueba.vender(p_cant int) returns bigint language sql as $$
  select registrar_venta(jsonb_build_array(jsonb_build_object('variante_id', prueba.variante('Zapatilla Urbana Classic', '40', 'Negro'), 'cantidad', p_cant, 'precio_unitario', 79000)),
                         jsonb_build_array(jsonb_build_object('medio_pago_id', prueba.medio('EFE')))) $$;
create function prueba.cierra_stock() returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from stock s where s.cantidad <> coalesce((select sum(m.cantidad) from movimientos_stock m
                     where m.variante_id = s.variante_id and m.deposito_id = s.deposito_id), 0)) $$;
grant execute on all functions in schema prueba to anon, authenticated;
create table prueba.ids (nombre text primary key, id bigint);
grant all on prueba.ids to anon, authenticated;
select plan(22);

set local role authenticated;
select prueba.como_equipo();
insert into prueba.ids values ('u40', prueba.variante('Zapatilla Urbana Classic', '40', 'Negro'));
insert into prueba.ids select 'v1', prueba.vender(2);
select is(prueba.stock((select id from prueba.ids where nombre = 'u40')), 1, 'la venta descuenta 2 pares');

-- ── Validaciones ──
select throws_ok(format($$ select anular_venta(%s, null) $$, (select id from prueba.ids where nombre = 'v1')), 'Elegí el motivo de la anulación');
select throws_ok(format($$ select anular_venta(%s, 'otro') $$, (select id from prueba.ids where nombre = 'v1')), 'Contá qué pasó (el motivo es «otro»)');

-- ── Anular ──
select lives_ok(format($$ select anular_venta(%s, 'error_carga', 'Se marcó el talle equivocado') $$, (select id from prueba.ids where nombre = 'v1')), 'el administrador anula la venta del día');
select is(prueba.stock((select id from prueba.ids where nombre = 'u40')), 3, 'vuelve todo el stock');
select is((select sum(cantidad)::int from movimientos_stock where venta_id = (select id from prueba.ids where nombre = 'v1') and tipo = 'anulacion'), 2, 'con su movimiento de anulación');
select ok(prueba.cierra_stock(), 'el stock sigue siendo la suma de sus movimientos');
select results_eq(format($$ select motivo_anulacion, comentario_anulacion, anulada_por::text from ventas where id = %s $$, (select id from prueba.ids where nombre = 'v1')),
  $$ values ('error_carga'::text, 'Se marcó el talle equivocado'::text, '11111111-1111-1111-1111-111111111111'::text) $$, 'queda anulada con motivo, comentario y quién');
select throws_ok(format($$ select anular_venta(%s, 'duplicada') $$, (select id from prueba.ids where nombre = 'v1')), 'Esta venta ya está anulada');
select is((select count(*)::int from v_hechos_ventas where venta_id = (select id from prueba.ids where nombre = 'v1')), 0, 'deja de contar en los informes');
select is((select bool_and(anulada) from v_venta_items where venta_id = (select id from prueba.ids where nombre = 'v1')), true, 'el detalle se sigue viendo, marcado como anulado');

-- ── Solo el mismo día ──
insert into prueba.ids select 'ayer', prueba.vender(1);
reset role;
update ventas set fecha = now() - interval '1 day' where id = (select id from prueba.ids where nombre = 'ayer');
set local role authenticated;
select prueba.como_equipo();
select throws_ok(format($$ select anular_venta(%s, 'error_carga') $$, (select id from prueba.ids where nombre = 'ayer')),
  'Solo se puede anular una venta del día. Para una de otro día, hacé una devolución');

-- ── Permisos: la cajera no, el encargado sí ──
insert into prueba.ids select 'v2', prueba.vender(1);
select prueba.rol_equipo('Cajero');
select throws_ok(format($$ select anular_venta(%s, 'duplicada') $$, (select id from prueba.ids where nombre = 'v2')), 'No tenés permiso para anular ventas');
select prueba.rol_equipo('Encargado');
select lives_ok(format($$ select anular_venta(%s, 'duplicada') $$, (select id from prueba.ids where nombre = 'v2')), 'el encargado sí puede');
select prueba.rol_equipo('Administrador');

-- ── Venta que vino de un pedido web ──
select prueba.como_cliente();
insert into prueba.ids select 'p1', crear_pedido(format('[{"variante_id": %s, "cantidad": 1}]', (select id from prueba.ids where nombre = 'u40'))::jsonb, 'retiro', null, prueba.medio('EFE'));
select prueba.como_equipo();
select cambiar_estado_pedido((select id from prueba.ids where nombre = 'p1'), e) from unnest(array['confirmado', 'preparado', 'listo_retiro']) e;
insert into prueba.ids select 'vp1', cambiar_estado_pedido((select id from prueba.ids where nombre = 'p1'), 'entregado');
select anular_venta((select id from prueba.ids where nombre = 'vp1'), 'error_carga');
select is((select estado from pedidos where id = (select id from prueba.ids where nombre = 'p1')), 'listo_retiro', 'error de carga: el pedido vuelve a estar listo para retirar');
select is(prueba.reservado((select id from prueba.ids where nombre = 'u40')), 1, 'con su reserva otra vez');
select isnt((select cambiar_estado_pedido((select id from prueba.ids where nombre = 'p1'), 'entregado')), null::bigint, 'y se puede entregar de nuevo (otra venta)');

select prueba.como_cliente();
insert into prueba.ids select 'p2', crear_pedido(format('[{"variante_id": %s, "cantidad": 1}]', (select id from prueba.ids where nombre = 'u40'))::jsonb, 'retiro', null, prueba.medio('EFE'));
select prueba.como_equipo();
insert into prueba.ids select 'vp2', cambiar_estado_pedido((select id from prueba.ids where nombre = 'p2'), 'entregado');
select anular_venta((select id from prueba.ids where nombre = 'vp2'), 'arrepentido');
select results_eq(format($$ select estado, motivo_cancelacion from pedidos where id = %s $$, (select id from prueba.ids where nombre = 'p2')),
  $$ values ('cancelado'::text, 'arrepentido'::text) $$, 'si el cliente se arrepintió, el pedido queda cancelado');
select is(prueba.reservado((select id from prueba.ids where nombre = 'u40')), 0, 'sin reserva');

-- ── Venta que vino de un presupuesto ──
insert into prueba.ids select 'pre', crear_presupuesto(format('[{"variante_id": %s, "cantidad": 1}]', (select id from prueba.ids where nombre = 'u40'))::jsonb, null, prueba.medio('EFE'));
insert into prueba.ids select 'vpre', convertir_presupuesto((select id from prueba.ids where nombre = 'pre'));
select anular_venta((select id from prueba.ids where nombre = 'vpre'), 'error_carga');
select results_eq(format($$ select estado, venta_id from presupuestos where id = %s $$, (select id from prueba.ids where nombre = 'pre')),
  $$ values ('vigente'::text, null::bigint) $$, 'el presupuesto vuelve a estar vigente');
select ok(prueba.cierra_stock(), 'al final, el stock sigue cerrando');

-- ── La tienda: un cliente no puede anular ──
select prueba.como_cliente();
select throws_ok(format($$ select anular_venta(%s, 'duplicada') $$, (select id from prueba.ids where nombre = 'ayer')), 'No tenés permiso para anular ventas');

select * from finish();
rollback;
