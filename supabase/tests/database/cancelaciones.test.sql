-- Cancelación de pedidos: motivo obligatorio, el cliente cancela el suyo y el vencimiento de los no retirados.
begin;
create extension if not exists pgtap with schema extensions;
create schema prueba;
grant usage on schema prueba to anon, authenticated;
create function prueba.variante(p_modelo text, p_talle text, p_color text) returns bigint language sql stable security definer set search_path = public as $$
  select v.id from variantes v join productos p on p.id = v.producto_id join talles t on t.id = v.talle_id join colores c on c.id = v.color_id
   where p.nombre = p_modelo and t.nombre = p_talle and c.nombre = p_color $$;
create function prueba.reservado(p_variante bigint) returns int language sql stable security definer set search_path = public as $$ select reservado from stock where variante_id = p_variante $$;
create function prueba.medio(p_codigo text) returns bigint language sql stable security definer set search_path = public as $$ select id from medios_pago where codigo = p_codigo $$;
create function prueba.como_equipo() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) $$;
create function prueba.como_cliente() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true) $$;
-- Un pedido de 1 par del cliente de prueba
create function prueba.pedido() returns bigint language sql as $$
  select crear_pedido(format('[{"variante_id": %s, "cantidad": 1}]', prueba.variante('Zapatilla Urbana Classic', '40', 'Negro'))::jsonb, 'retiro', null, prueba.medio('EFE')) $$;
-- Lee como dueño de la base (el cliente no ve el pedido de otro ni los motivos internos)
create function prueba.pedido_dato(p_id bigint) returns table (estado text, motivo text, por text) language sql security definer set search_path = public as $$
  select estado, motivo_cancelacion, cancelado_por from pedidos where id = p_id $$;
grant execute on all functions in schema prueba to anon, authenticated;
create table prueba.ids (nombre text primary key, id bigint);
grant all on prueba.ids to anon, authenticated;
select plan(17);

-- ── El cliente cancela el suyo ──
set local role authenticated;
select prueba.como_cliente();
insert into prueba.ids select 'p1', prueba.pedido();
select is(prueba.reservado(prueba.variante('Zapatilla Urbana Classic', '40', 'Negro')), 1, 'el pedido reserva el par');
select lives_ok(format($$ select cancelar_mi_pedido(%s) $$, (select id from prueba.ids where nombre = 'p1')), 'el cliente cancela su pedido pendiente');
select results_eq(format($$ select * from prueba.pedido_dato(%s) $$, (select id from prueba.ids where nombre = 'p1')),
  $$ values ('cancelado'::text, 'arrepentido'::text, 'cliente'::text) $$, 'queda cancelado, por el cliente, con motivo');
select is(prueba.reservado(prueba.variante('Zapatilla Urbana Classic', '40', 'Negro')), 0, 'y libera la reserva');
select throws_ok(format($$ select cancelar_mi_pedido(%s) $$, (select id from prueba.ids where nombre = 'p1')), 'Este pedido ya está cancelado');

-- Uno que el local ya está preparando: el cliente no lo puede cancelar
insert into prueba.ids select 'p2', prueba.pedido();
select prueba.como_equipo();
select cambiar_estado_pedido((select id from prueba.ids where nombre = 'p2'), 'confirmado');
select cambiar_estado_pedido((select id from prueba.ids where nombre = 'p2'), 'preparado');
select prueba.como_cliente();
select throws_ok(format($$ select cancelar_mi_pedido(%s) $$, (select id from prueba.ids where nombre = 'p2')),
  'Ya estamos preparando tu pedido: para cancelarlo, escribinos por WhatsApp');

-- Un pedido de OTRA clienta: no lo puede cancelar (ni saber que existe)
insert into prueba.ids select 'ajeno', prueba.pedido();
reset role;
update pedidos set cliente_id = (select id from clientes where nombre = 'María González') where id = (select id from prueba.ids where nombre = 'ajeno');
set local role authenticated;
select prueba.como_cliente();
select throws_ok(format($$ select cancelar_mi_pedido(%s) $$, (select id from prueba.ids where nombre = 'ajeno')),
  'No encontramos ese pedido en tu cuenta');
select is((select estado from prueba.pedido_dato((select id from prueba.ids where nombre = 'ajeno'))), 'pendiente', 'el pedido ajeno sigue pendiente');
-- Qué compró: lo ve por la vista, solo de sus pedidos
select is((select modelo || ' ' || talle || ' ' || color from v_mis_pedido_items where pedido_id = (select id from prueba.ids where nombre = 'p1')),
  'Zapatilla Urbana Classic 40 Negro', 'el cliente ve qué compró en su pedido');
select is((select count(*)::int from v_mis_pedido_items where pedido_id = (select id from prueba.ids where nombre = 'ajeno')), 0, 'y no ve los renglones de un pedido ajeno');
select throws_ok(format($$ select cancelar_mi_pedido(%s, 'sin_stock') $$, (select id from prueba.ids where nombre = 'p2')),
  'Ya estamos preparando tu pedido: para cancelarlo, escribinos por WhatsApp');

-- ── El local: el motivo es obligatorio ──
select prueba.como_equipo();
select throws_ok(format($$ select cambiar_estado_pedido(%s, 'cancelado') $$, (select id from prueba.ids where nombre = 'p2')), 'Elegí el motivo de la cancelación');
select lives_ok(format($$ select cambiar_estado_pedido(%s, 'cancelado', 'No hay más en ese talle', p_motivo => 'sin_stock') $$, (select id from prueba.ids where nombre = 'p2')),
  'el local cancela con motivo');
select results_eq(format($$ select * from prueba.pedido_dato(%s) $$, (select id from prueba.ids where nombre = 'p2')),
  $$ values ('cancelado'::text, 'sin_stock'::text, 'local'::text) $$, 'queda cancelado por el local, sin stock');

-- ── Vencimiento: listo para retirar hace más de 7 días ──
select prueba.como_cliente();
insert into prueba.ids select 'p3', prueba.pedido();
insert into prueba.ids select 'p4', prueba.pedido();
select prueba.como_equipo();
select cambiar_estado_pedido(id, e) from prueba.ids, unnest(array['confirmado', 'preparado', 'listo_retiro']) e where nombre in ('p3', 'p4') order by nombre, array_position(array['confirmado', 'preparado', 'listo_retiro'], e);
select ok(retirar_hasta((select id from prueba.ids where nombre = 'p3')) > now() + interval '6 days', 'el equipo ve hasta cuándo se guarda');
reset role;
-- p3 pasó a "listo para retirar" hace 8 días; p4, hoy
update pedido_estados set fecha = now() - interval '8 days' where pedido_id = (select id from prueba.ids where nombre = 'p3') and estado = 'listo_retiro';
select is(vencer_pedidos_sin_retirar(), 1, 'vence solo el que pasó el plazo');
select results_eq(format($$ select * from prueba.pedido_dato(%s) union all select * from prueba.pedido_dato(%s) $$,
  (select id from prueba.ids where nombre = 'p3'), (select id from prueba.ids where nombre = 'p4')),
  $$ values ('cancelado'::text, 'no_retiro'::text, 'vencimiento'::text), ('listo_retiro'::text, null, null) $$, 'el vencido queda cancelado por vencimiento; el otro sigue');

select * from finish();
rollback;
