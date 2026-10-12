-- Mercado Pago: el cobro lo arma la base con el total del pedido, el aviso se verifica (firma + consulta a Mercado Pago),
-- el pago aprobado confirma el pedido y anota la comisión una sola vez, cancelar un pedido pagado devuelve la plata
-- (o no cancela), el cliente no lo cancela solo, no se vence solo, y «solo online» lo frena la base.
-- Mercado Pago se simula: _mp_pedir se reemplaza (dentro de la transacción) por respuestas preparadas.
begin;
create extension if not exists pgtap with schema extensions;
create schema prueba;
grant usage on schema prueba to anon, authenticated;
create table prueba.respuestas (metodo text, ruta text, status int, cuerpo jsonb);
create table prueba.llamadas (id serial, metodo text, ruta text, cuerpo jsonb);
grant all on prueba.respuestas, prueba.llamadas, prueba.llamadas_id_seq to anon, authenticated;
create or replace function public._mp_pedir(p_metodo text, p_ruta text, p_cuerpo jsonb default null, p_idempotencia text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r prueba.respuestas;
begin
  insert into prueba.llamadas (metodo, ruta, cuerpo) values (p_metodo, p_ruta, p_cuerpo);
  select * into r from prueba.respuestas where metodo = p_metodo and p_ruta like ruta order by length(ruta) desc limit 1;
  if not found then return jsonb_build_object('status', 404, 'cuerpo', '{}'::jsonb); end if;
  return jsonb_build_object('status', r.status, 'cuerpo', r.cuerpo);
end $$;
create function prueba.responder(p_metodo text, p_ruta text, p_status int, p_cuerpo jsonb) returns void language sql security definer set search_path = public as $$
  delete from prueba.respuestas where metodo = p_metodo and ruta = p_ruta;
  insert into prueba.respuestas values (p_metodo, p_ruta, p_status, p_cuerpo) $$;
create function prueba.como_admin() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) $$;
create function prueba.como_cliente() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true) $$;
create function prueba.variante(p_talle text) returns bigint language sql stable security definer set search_path = public as $$
  select v.id from variantes v join productos p on p.id = v.producto_id join talles t on t.id = v.talle_id join colores c on c.id = v.color_id
   where p.nombre = 'Zapatilla Urbana Classic' and t.nombre = p_talle and c.nombre = 'Negro' $$;
create function prueba.medio(p_codigo text) returns bigint language sql stable security definer set search_path = public as $$ select id from medios_pago where codigo = p_codigo $$;
create function prueba.modo(p_modo text) returns void language sql security definer set search_path = public as $$ update configuracion_tienda set mp_modo = p_modo where unica $$;
create function prueba.pedido(p_id bigint) returns table (estado text, pagado boolean, total numeric) language sql stable security definer set search_path = public as $$
  select estado, pagado_online, total from pedidos where id = p_id $$;
create function prueba.firma(p_id text, p_req text, p_ts text) returns text language sql immutable as $$
  select 'ts=' || p_ts || ',v1=' || encode(extensions.hmac(convert_to('id:' || p_id || ';request-id:' || p_req || ';ts:' || p_ts || ';', 'UTF8'),
         convert_to('secreto-webhook-mp', 'UTF8'), 'sha256'), 'hex') $$;
create function prueba.pago(p_id text, p_pedido bigint, p_estado text, p_monto numeric) returns void language sql security definer set search_path = public as $$
  select prueba.responder('GET', '/v1/payments/' || p_id, 200, jsonb_build_object('id', p_id::bigint, 'status', p_estado, 'status_detail', 'accredited',
    'external_reference', p_pedido::text, 'transaction_amount', p_monto, 'installments', 3, 'payment_method_id', 'visa',
    'fee_details', jsonb_build_array(jsonb_build_object('type', 'mercadopago_fee', 'amount', 500)),
    'transaction_details', jsonb_build_object('net_received_amount', p_monto - 500))) $$;
create function prueba.gastos_mp() returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from gastos where referencia like 'mp:%' $$;
create function prueba.listo_hace_dias(p_pedido bigint, p_dias int) returns void language sql security definer set search_path = public as $$
  update pedidos set estado = 'listo_retiro' where id = p_pedido;
  insert into pedido_estados (pedido_id, estado, fecha) values (p_pedido, 'listo_retiro', now() - make_interval(days => p_dias)) $$;
grant execute on all functions in schema prueba to anon, authenticated;
create table prueba.ids (nombre text primary key, id bigint);
grant all on prueba.ids to anon, authenticated;
select plan(19);

set local role authenticated;
select prueba.como_admin();

-- ── Configurar ──
select throws_like($$ select guardar_mercadopago('mi-clave') $$, 'El Access Token de Mercado Pago empieza con APP_USR-%', 'el token se valida');
select guardar_mercadopago('APP_USR-1234567890123456-abcdef-ghijkl', 'secreto-webhook-mp', 'https://mitienda.vercel.app');
select prueba.responder('GET', '/users/me', 200, '{"nickname":"MITIENDA","first_name":"Mi","last_name":"Tienda","site_id":"MLA"}');
select is(mp_probar() ->> 'usuario', 'MITIENDA', 'probar muestra de quién es la cuenta');
select is(estado_mercadopago() ->> 'token', '…ijkl', 'el panel ve el token solo con los últimos 4');
select prueba.modo('opcional');

-- ── El cliente hace un pedido con Mercado Pago y lo paga ──
select prueba.como_cliente();
insert into prueba.ids select 'p1', crear_pedido(jsonb_build_array(jsonb_build_object('variante_id', prueba.variante('41'), 'cantidad', 1)), 'retiro', null, prueba.medio('MP'));
select prueba.responder('POST', '/checkout/preferences', 201, '{"id":"pref-1","init_point":"https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-1"}');
select alike(mp_pagar_pedido((select id from prueba.ids where nombre = 'p1')), 'https://www.mercadopago.com.ar/%', 'devuelve el link de pago');
select is((select (cuerpo -> 'items' -> 0 ->> 'unit_price')::numeric from prueba.llamadas where ruta = '/checkout/preferences'),
  (select total from prueba.pedido((select id from prueba.ids where nombre = 'p1'))), 'el cobro es por el total que calculó la base');
select is((select cuerpo ->> 'notification_url' from prueba.llamadas where ruta = '/checkout/preferences'), 'https://mitienda.vercel.app/api/mercadopago',
  'y avisa a la tienda');
insert into prueba.ids select 'p2', crear_pedido(jsonb_build_array(jsonb_build_object('variante_id', prueba.variante('42'), 'cantidad', 1)), 'retiro', null, prueba.medio('EFE'));
select throws_ok(format($$ select mp_pagar_pedido(%s) $$, (select id from prueba.ids where nombre = 'p2')), 'Este pedido se paga con otro medio');
set local role anon;
select throws_ok(format($$ select mp_pagar_pedido(%s) $$, (select id from prueba.ids where nombre = 'p1')), '42501', null, 'sin ingresar no se paga un pedido ajeno');

-- ── El aviso de Mercado Pago ──
select prueba.pago('111', (select id from prueba.ids where nombre = 'p1'), 'approved', (select total from prueba.pedido((select id from prueba.ids where nombre = 'p1'))));
select is(mp_notificacion('payment', '111', 'req-1', 'ts=1700000000,v1=' || repeat('0', 64)), 'firma_invalida', 'con la firma falsa no hace nada');
select is(mp_notificacion('payment', '111', 'req-1', prueba.firma('111', 'req-1', '1700000000')), 'approved', 'con la firma de Mercado Pago, consulta el pago');
select results_eq(format($$ select estado, pagado from prueba.pedido(%s) $$, (select id from prueba.ids where nombre = 'p1')),
  $$ values ('confirmado'::text, true) $$, 'el pedido queda pagado y confirmado');
select mp_notificacion('payment', '111', 'req-2', prueba.firma('111', 'req-2', '1700000001'));
select is(prueba.gastos_mp(), 1, 'la comisión queda como gasto una sola vez, aunque el aviso se repita');
set local role authenticated;
select prueba.como_cliente();
select is((select count(*)::int from pagos_online where estado = 'approved'), 1, 'el cliente ve el pago de su pedido');
set local role anon;

-- ── Cancelar un pedido pagado ──
set local role authenticated;
select prueba.como_cliente();
select throws_ok(format($$ select cancelar_mi_pedido(%s) $$, (select id from prueba.ids where nombre = 'p1')),
  'Tu pedido ya está pagado: escribinos y lo cancelamos devolviéndote el pago');
select prueba.como_admin();
select prueba.responder('POST', '/v1/payments/111/refunds', 400, '{"message":"insufficient funds"}');
select throws_like(format($$ select cambiar_estado_pedido(%s, 'cancelado', null, '[]', 'sin_stock') $$, (select id from prueba.ids where nombre = 'p1')),
  'Mercado Pago no pudo devolver el pago%', 'si la devolución falla, no se cancela');
select prueba.responder('POST', '/v1/payments/111/refunds', 201, '{"id":1}');
select cambiar_estado_pedido((select id from prueba.ids where nombre = 'p1'), 'cancelado', null, '[]', 'sin_stock');
select results_eq(format($$ select estado, pagado from prueba.pedido(%s) $$, (select id from prueba.ids where nombre = 'p1')),
  $$ values ('cancelado'::text, false) $$, 'el local lo cancela y se devuelve el pago');

-- ── Un pedido pagado no se vence solo ──
select prueba.como_cliente();
insert into prueba.ids select 'p3', crear_pedido(jsonb_build_array(jsonb_build_object('variante_id', prueba.variante('43'), 'cantidad', 1)), 'retiro', null, prueba.medio('MP'));
select prueba.pago('333', (select id from prueba.ids where nombre = 'p3'), 'approved', (select total from prueba.pedido((select id from prueba.ids where nombre = 'p3'))));
select mp_notificacion('payment', '333', 'req-3', prueba.firma('333', 'req-3', '1700000003'));
select prueba.listo_hace_dias((select id from prueba.ids where nombre = 'p3'), 90);
reset role;
select vencer_pedidos_sin_retirar();
select is((select estado from prueba.pedido((select id from prueba.ids where nombre = 'p3'))), 'listo_retiro', 'pagado y sin retirar: no se vence');

-- ── «Solo online» ──
select prueba.modo('obligatorio');
set local role authenticated;
select prueba.como_cliente();
select throws_ok($$ select crear_pedido(jsonb_build_array(jsonb_build_object('variante_id', prueba.variante('40'), 'cantidad', 1)), 'retiro', null, prueba.medio('EFE')) $$,
  'La tienda cobra solo con Mercado Pago: elegí ese medio de pago');
select is(tienda_pagos() ->> 'mp_modo', 'obligatorio', 'la tienda sabe que es solo online (sin ver ninguna clave)');

select * from finish();
rollback;
