-- Un pedido con envío no sale sin pagar (si la regla está prendida); el pago a mano tiene que cubrir productos + envío;
-- retirar en el local no lo pide; apagada la regla, se puede enviar.
begin;
create extension if not exists pgtap with schema extensions;
create schema prueba;
grant usage on schema prueba to anon, authenticated;
create function prueba.como_admin() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) $$;
create function prueba.como_cliente() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true) $$;
create function prueba.variante(p_talle text) returns bigint language sql stable security definer set search_path = public as $$
  select v.id from variantes v join productos p on p.id = v.producto_id join talles t on t.id = v.talle_id join colores c on c.id = v.color_id
   where p.nombre = 'Zapatilla Urbana Classic' and t.nombre = p_talle and c.nombre = 'Negro' $$;
create function prueba.medio(p_codigo text) returns bigint language sql stable security definer set search_path = public as $$ select id from medios_pago where codigo = p_codigo $$;
create function prueba.zona() returns bigint language sql security definer set search_path = public as $$
  insert into zonas_envio (nombre, precio) values ('Centro', 2500) returning id $$;
create function prueba.regla(p_si boolean) returns void language sql security definer set search_path = public as $$
  update configuracion_tienda set envio_requiere_pago = p_si where unica $$;
create function prueba.estado(p_id bigint) returns text language sql stable security definer set search_path = public as $$ select estado from pedidos where id = p_id $$;
grant execute on all functions in schema prueba to anon, authenticated;
create table prueba.ids (nombre text primary key, id bigint);
grant all on prueba.ids to anon, authenticated;
select plan(9);

insert into prueba.ids select 'z', prueba.zona();
set local role authenticated;
select prueba.como_cliente();
-- Transferencia (−5 %): $79.000 → $75.050 + $2.500 de envío = $77.550
insert into prueba.ids select 'e', crear_pedido(jsonb_build_array(jsonb_build_object('variante_id', prueba.variante('41'), 'cantidad', 1)),
  'envio', 'Laprida 100', prueba.medio('TRA'), null, null, 'Web', (select id from prueba.ids where nombre = 'z'));
insert into prueba.ids select 'r', crear_pedido(jsonb_build_array(jsonb_build_object('variante_id', prueba.variante('42'), 'cantidad', 1)),
  'retiro', null, prueba.medio('EFE'));
select is(pedido_pagado((select id from prueba.ids where nombre = 'e')), false, 'recién hecho, no está pagado');
select throws_ok(format($$ select registrar_pago_pedido(%s, 1000) $$, (select id from prueba.ids where nombre = 'e')), 'No tenés permiso para atender pedidos');

select prueba.como_admin();
select cambiar_estado_pedido((select id from prueba.ids where nombre = 'e'), 'confirmado');
select cambiar_estado_pedido((select id from prueba.ids where nombre = 'e'), 'preparado');
select throws_like(format($$ select cambiar_estado_pedido(%s, 'enviado') $$, (select id from prueba.ids where nombre = 'e')),
  'El pedido todavía no está pagado%', 'sin pagar, no sale');
select registrar_pago_pedido((select id from prueba.ids where nombre = 'e'), 75050, 'Transferencia 123');
select throws_like(format($$ select cambiar_estado_pedido(%s, 'enviado') $$, (select id from prueba.ids where nombre = 'e')),
  'El pedido todavía no está pagado%', 'pagando solo los productos (sin el envío), tampoco');
select registrar_pago_pedido((select id from prueba.ids where nombre = 'e'), 2500, 'Transferencia 124');
select lives_ok(format($$ select cambiar_estado_pedido(%s, 'enviado') $$, (select id from prueba.ids where nombre = 'e')), 'con productos + envío pagos, sale');
select lives_ok(format($$ select cambiar_estado_pedido(%s, 'entregado') $$, (select id from prueba.ids where nombre = 'e')), 'y se entrega (la venta se registra como siempre)');

-- Retirar en el local: se paga al retirar
select cambiar_estado_pedido((select id from prueba.ids where nombre = 'r'), 'confirmado');
select cambiar_estado_pedido((select id from prueba.ids where nombre = 'r'), 'listo_retiro');
select lives_ok(format($$ select cambiar_estado_pedido(%s, 'entregado') $$, (select id from prueba.ids where nombre = 'r')), 'retirando en el local no se pide pago antes');

-- Con la regla apagada, un envío sin pagar puede salir (pago contra entrega)
select prueba.regla(false);
select prueba.como_cliente();
insert into prueba.ids select 'c', crear_pedido(jsonb_build_array(jsonb_build_object('variante_id', prueba.variante('43'), 'cantidad', 1)),
  'envio', 'Laprida 100', prueba.medio('EFE'), null, null, 'Web', (select id from prueba.ids where nombre = 'z'));
select prueba.como_admin();
select cambiar_estado_pedido((select id from prueba.ids where nombre = 'c'), 'confirmado');
select cambiar_estado_pedido((select id from prueba.ids where nombre = 'c'), 'preparado');
select lives_ok(format($$ select cambiar_estado_pedido(%s, 'enviado') $$, (select id from prueba.ids where nombre = 'c')), 'apagada la regla, sale sin pagar');
select is(prueba.estado((select id from prueba.ids where nombre = 'c')), 'enviado', 'y queda enviado');

select * from finish();
rollback;
