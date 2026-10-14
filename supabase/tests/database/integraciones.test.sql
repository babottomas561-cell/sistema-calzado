-- Conexiones con WhatsApp e IA: las claves no se leen nunca por la API, el webhook solo responde con la firma
-- de Meta válida, solo se le contesta a quien escribió, lo cobrado se suma como gasto una vez, y los avisos de
-- pedidos salen solos.
begin;
create extension if not exists pgtap with schema extensions;
create schema prueba;
grant usage on schema prueba to anon, authenticated;
create function prueba.como_admin() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) $$;
create function prueba.como_vendedora() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true) $$;
-- Lo que haría Meta: firmar el cuerpo con el secreto de la app
create function prueba.firma(p_cuerpo text, p_secreto text default 'secreto-de-la-app') returns text language sql immutable as $$
  select 'sha256=' || encode(extensions.hmac(convert_to(p_cuerpo, 'UTF8'), convert_to(p_secreto, 'UTF8'), 'sha256'), 'hex') $$;
create function prueba.aviso(p_de text, p_texto text, p_hace_seg int default 5) returns text language sql stable as $$
  select jsonb_build_object('object', 'whatsapp_business_account', 'entry', jsonb_build_array(jsonb_build_object('changes', jsonb_build_array(
    jsonb_build_object('value', jsonb_build_object('messages', jsonb_build_array(jsonb_build_object(
      'from', p_de, 'id', 'wamid.' || md5(p_texto), 'type', 'text', 'timestamp', (extract(epoch from now())::bigint - p_hace_seg)::text,
      'text', jsonb_build_object('body', p_texto))))))))) ::text $$;
-- Lo que manda Meta cuando el cliente toca una fila de la lista o un botón
create function prueba.eleccion(p_de text, p_tipo text, p_id text, p_titulo text) returns text language sql stable as $$
  select jsonb_build_object('object', 'whatsapp_business_account', 'entry', jsonb_build_array(jsonb_build_object('changes', jsonb_build_array(
    jsonb_build_object('value', jsonb_build_object('messages', jsonb_build_array(jsonb_build_object(
      'from', p_de, 'id', 'wamid.' || md5(p_id), 'type', 'interactive', 'timestamp', (extract(epoch from now())::bigint - 5)::text,
      'interactive', jsonb_build_object('type', p_tipo, p_tipo, jsonb_build_object('id', p_id, 'title', p_titulo)))))))))) ::text $$;
create function prueba.cobro(p_id text, p_categoria text) returns text language sql immutable as $$
  select jsonb_build_object('entry', jsonb_build_array(jsonb_build_object('changes', jsonb_build_array(jsonb_build_object('value',
    jsonb_build_object('statuses', jsonb_build_array(jsonb_build_object('id', p_id, 'status', 'delivered',
      'pricing', jsonb_build_object('billable', true, 'category', p_categoria)))))))))::text $$;
create function prueba.envios(p_tipo text) returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from whatsapp_envios where tipo = p_tipo $$;
create function prueba.ultimo_telefono(p_tipo text) returns text language sql stable security definer set search_path = public as $$
  select telefono from whatsapp_envios where tipo = p_tipo order by id desc limit 1 $$;
create function prueba.gasto_whatsapp() returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(importe), 0) from gastos where referencia like 'whatsapp:%' $$;
create function prueba.config(p_bot boolean, p_avisos boolean) returns void language sql security definer set search_path = public as $$
  update configuracion_tienda set wa_bot_activo = p_bot, wa_notificaciones_pedidos = p_avisos, wa_plantilla_estado = 'estado_pedido';
  update clientes set telefono = '381 555-3003' where usuario_id = '22222222-2222-2222-2222-222222222222' $$;
grant execute on all functions in schema prueba to anon, authenticated;
select plan(26);

set local role authenticated;
select prueba.como_admin();

-- ── Guardar las claves desde el panel ──
select guardar_integraciones('123456789012345', '987654321098', 'EAAtokenmuylargo1234', 'secreto-de-la-app', 'AIzaGeminiClave9876');
select results_eq($$ select estado_integraciones() ->> 'token', estado_integraciones() ->> 'gemini', (estado_integraciones() ->> 'meta_lista')::boolean $$,
  $$ values ('…1234', '…9876', true) $$, 'el panel ve que están cargadas, solo con los últimos 4 caracteres');
select throws_ok($$ select * from integraciones $$, '42501', null, 'ni el administrador lee la tabla de claves');
select guardar_integraciones(p_gemini_api_key := '');
select is(estado_integraciones() ->> 'gemini', '…9876', 'dejar un campo vacío no borra la clave');
select throws_like($$ select guardar_integraciones('12ab') $$, 'El ID del número son solo números%', 'el ID del número se valida');

-- ── La vendedora no las toca ──
select prueba.como_vendedora();
select throws_ok($$ select estado_integraciones() $$, 'No tenés permiso para ver las conexiones');
select throws_ok($$ select guardar_integraciones(p_access_token := 'otro') $$, 'No tenés permiso para configurar las conexiones');

-- ── El público tampoco ──
set local role anon;
select throws_ok($$ select * from integraciones $$, '42501', null, 'el público no lee la tabla de claves');
select ok(not exists (select 1 from information_schema.columns where table_name = 'configuracion_tienda' and column_name ~ 'token|secret|api_key'),
  'la configuración de la tienda (que lee todo el mundo) no tiene claves');

-- ── El webhook ──
select is(wa_verificar_token('cualquiera'), false, 'un token de verificación inventado no sirve');
select prueba.config(false, false);
select is((wa_recibir(prueba.aviso('5493815553003', 'hola'), 'sha256=' || repeat('0', 64)) ->> 'ok')::boolean, false, 'con la firma falsa no hace nada');
select is((wa_recibir(prueba.aviso('5493815553003', 'hola'), prueba.firma(prueba.aviso('5493815553003', 'hola'))) -> 'mensajes' -> 0 ->> 'texto'), 'hola',
  'con la firma de Meta devuelve el mensaje');
select is(wa_recibir(prueba.aviso('5493815553003', 'hola'), prueba.firma(prueba.aviso('5493815553003', 'hola'))) ->> 'gemini_api_key', null,
  'con el bot apagado no entrega la clave de la IA');
select is(jsonb_array_length(wa_recibir(prueba.aviso('5493815553003', 'viejo', 3600), prueba.firma(prueba.aviso('5493815553003', 'viejo', 3600))) -> 'mensajes'), 0,
  'un aviso viejo no se procesa (no se puede reusar)');
select is(wa_responder(prueba.aviso('5493815553003', 'hola'), prueba.firma(prueba.aviso('5493815553003', 'hola')), '5491100000000', 'spam'), false,
  'no se le puede contestar a otro número');
select is(wa_responder(prueba.aviso('5493815553003', 'hola'), prueba.firma(prueba.aviso('5493815553003', 'hola')), '5493815553003', 'Hola! ¿Qué buscás?'), true,
  'sí a quien escribió');
select is(prueba.envios('respuesta'), 1, 'y queda registrada la respuesta');
select is(prueba.ultimo_telefono('respuesta'), '543815553003',
  'a Meta le va el celular argentino sin el 9 (con 549 rechaza a los destinatarios de prueba: error 131030)');

-- ── Menús: el cliente elige tocando ──
select is(wa_recibir(prueba.eleccion('5493815553003', 'list_reply', 'r:Camisa', 'Camisas'), prueba.firma(prueba.eleccion('5493815553003', 'list_reply', 'r:Camisa', 'Camisas'))) -> 'mensajes' -> 0 ->> 'opcion',
  'r:Camisa', 'una fila elegida de la lista llega como opción (con su id)');
select is(wa_recibir(prueba.eleccion('5493815553003', 'button_reply', 'm:menu', 'Menú'), prueba.firma(prueba.eleccion('5493815553003', 'button_reply', 'm:menu', 'Menú'))) -> 'mensajes' -> 0 ->> 'opcion',
  'm:menu', 'y un botón también');
select is(wa_responder_menu(prueba.aviso('5493815553003', 'hola'), prueba.firma(prueba.aviso('5493815553003', 'hola')), '5493815553003',
  '{"type":"button","body":{"text":"¿Qué querés hacer?"},"action":{"buttons":[{"type":"reply","reply":{"id":"m:menu","title":"Menú"}}]}}'::jsonb), true,
  'se le manda un menú a quien escribió');
select is(wa_responder_menu(prueba.aviso('5493815553003', 'hola'), prueba.firma(prueba.aviso('5493815553003', 'hola')), '5491100000000',
  '{"type":"button","body":{"text":"spam"},"action":{}}'::jsonb), false, 'pero no a otro número');
select is(wa_responder_menu(prueba.aviso('5493815553003', 'hola'), prueba.firma(prueba.aviso('5493815553003', 'hola')), '5493815553003',
  '{"type":"product","body":{"text":"x"}}'::jsonb), false, 'ni de un tipo que no sea lista o botones');
select is(wa_responder_menu(prueba.aviso('5493815553003', 'hola'), 'sha256=' || repeat('0', 64), '5493815553003',
  '{"type":"button","body":{"text":"x"},"action":{}}'::jsonb), false, 'ni con la firma falsa');

-- ── Lo que cobra Meta: una vez por mensaje ──
select wa_recibir(prueba.cobro('wamid.A', 'utility'), prueba.firma(prueba.cobro('wamid.A', 'utility')));
select wa_recibir(prueba.cobro('wamid.A', 'utility'), prueba.firma(prueba.cobro('wamid.A', 'utility')));
select wa_recibir(prueba.cobro('wamid.B', 'marketing'), prueba.firma(prueba.cobro('wamid.B', 'marketing')));
select is(prueba.gasto_whatsapp(), 0.09::numeric, 'utility (US$ 0,026) una vez + marketing (US$ 0,0618) = US$ 0,09 de gasto');

-- ── Avisos de pedidos: salen solos ──
set local role authenticated;
select prueba.como_admin();
select prueba.config(true, true);
select cambiar_estado_pedido(1, 'preparado');
select is(prueba.envios('aviso_pedido'), 1, 'al pasar el pedido a preparado sale el aviso por WhatsApp');
select is((select detalle from wa_envios_recientes() where tipo = 'aviso_pedido'), 'Pedido 0001-00000001: listo para despachar', 'con el estado en palabras');

select * from finish();
rollback;
