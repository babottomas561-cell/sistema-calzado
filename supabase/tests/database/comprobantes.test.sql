-- Comprobantes: el JSON de una venta, un presupuesto y una devolución (sin costos), el link privado, los permisos y el mail por Resend (simulado).
begin;
create extension if not exists pgtap with schema extensions;
create schema prueba;
grant usage on schema prueba to anon, authenticated;
create table prueba.respuestas (id serial, metodo text, url text, status int, cuerpo jsonb);
create table prueba.llamadas (id serial, metodo text, url text, cabeceras jsonb, cuerpo text);
create table prueba.ids (nombre text primary key, id bigint);
create table prueba.tokens (nombre text primary key, token text);
grant all on prueba.respuestas, prueba.llamadas, prueba.ids, prueba.tokens, prueba.respuestas_id_seq, prueba.llamadas_id_seq to anon, authenticated;
create or replace function public._pedir_http(p_metodo text, p_url text, p_cabeceras jsonb default '{}', p_tipo text default null, p_cuerpo text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r prueba.respuestas;
begin
  insert into prueba.llamadas (metodo, url, cabeceras, cuerpo) values (p_metodo, p_url, p_cabeceras, p_cuerpo);
  select * into r from prueba.respuestas where metodo = p_metodo and p_url like url order by id desc limit 1;
  return jsonb_build_object('status', coalesce(r.status, 404), 'cuerpo', coalesce(r.cuerpo, '{}'), 'cabeceras', '{}'::jsonb);
end $$;
create function prueba.como_admin() returns void language sql as $$ select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) $$;
create function prueba.como_vendedora() returns void language sql as $$ select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true) $$;
create function prueba.como_cliente() returns void language sql as $$ select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true) $$;
create function prueba.variante(p_talle text, p_color text) returns bigint language sql stable security definer set search_path = public as $$
  select v.id from variantes v join productos p on p.id = v.producto_id join talles t on t.id = v.talle_id join colores c on c.id = v.color_id
   where p.nombre = 'Zapatilla Urbana Classic' and t.nombre = p_talle and c.nombre = p_color $$;
create function prueba.medio(p_codigo text) returns bigint language sql stable security definer set search_path = public as $$ select id from medios_pago where codigo = p_codigo $$;
create function prueba.id(p_nombre text) returns bigint language sql stable as $$ select id from prueba.ids where nombre = p_nombre $$;
create function prueba.token(p_nombre text) returns text language sql stable as $$ select token from prueba.tokens where nombre = p_nombre $$;
create function prueba.numero_de(p_id bigint) returns text language sql stable security definer set search_path = public as $$ select comprobante from ventas where id = p_id $$;
create function prueba.vistas(p_tipo text, p_id bigint) returns int language sql stable security definer set search_path = public as $$ select vistas from enlaces_comprobante where tipo = p_tipo and documento_id = p_id $$;
create function prueba.config_mail(p_host text, p_sitio text) returns void language sql security definer set search_path = public as $$
  update integraciones set smtp_host = p_host, smtp_puerto = 465, smtp_usuario = 'resend', smtp_clave = 're_clave_de_prueba', smtp_email = 'ventas@milocal.com', sitio_url = p_sitio where unica $$;
create function prueba.responder(p_url text, p_status int, p_cuerpo jsonb) returns void language sql security definer set search_path = public as $$
  insert into prueba.respuestas (metodo, url, status, cuerpo) values ('POST', p_url, p_status, p_cuerpo) $$;
create function prueba.llamadas_a(p_url text) returns bigint language sql stable security definer set search_path = public as $$ select count(*) from prueba.llamadas where url = p_url $$;
grant execute on all functions in schema prueba to anon, authenticated;
select plan(48);

-- ── Una venta con cliente, descuento y efectivo ──
set local role authenticated;
select prueba.como_admin();
insert into prueba.ids select 'venta', registrar_venta(
  jsonb_build_array(jsonb_build_object('variante_id', prueba.variante('40', 'Negro'), 'cantidad', 2, 'precio_unitario', 79000)),
  jsonb_build_array(jsonb_build_object('medio_pago_id', prueba.medio('EFE'))), (select id from clientes where nombre = 'María González'), 4000);

insert into prueba.tokens select 'v1', comprobante_de('venta', prueba.id('venta')) -> 'enlace' ->> 'token';
select matches(comprobante_de('venta', prueba.id('venta')) ->> 'numero', '^0001-\d{8}$', 'el comprobante lleva el número de la venta');
select is(comprobante_de('venta', prueba.id('venta')) ->> 'titulo', 'Comprobante de venta', 'y su título');
select is(comprobante_de('venta', prueba.id('venta')) ->> 'cliente', 'María González', 'el cliente');
select is(jsonb_array_length(comprobante_de('venta', prueba.id('venta')) -> 'renglones'), 1, 'un renglón');
select is(comprobante_de('venta', prueba.id('venta')) -> 'renglones' -> 0 ->> 'variante', 'Talle 40 · Negro', 'con su talle y color');
select is((comprobante_de('venta', prueba.id('venta')) -> 'renglones' -> 0 ->> 'cantidad')::int, 2, 'y la cantidad');
select is((comprobante_de('venta', prueba.id('venta')) -> 'totales' -> -1 ->> 'monto')::numeric, (select total from ventas where id = prueba.id('venta')), 'el último total es el de la venta');
select is((comprobante_de('venta', prueba.id('venta')) -> 'totales' -> -1 ->> 'fuerte')::boolean, true, 'y es el destacado');
select ok(comprobante_de('venta', prueba.id('venta')) -> 'totales' @> '[{"rotulo": "Descuento"}]', 'el descuento figura');
select is(comprobante_de('venta', prueba.id('venta')) -> 'pagos' -> 0 ->> 'medio', 'Efectivo', 'los pagos con su medio');
select ok(comprobante_de('venta', prueba.id('venta'))::text !~* 'costo|margen', 'no lleva costos ni márgenes');
select is(comprobante_de('venta', prueba.id('venta')) -> 'config' ->> 'formato', 'ticket80', 'la configuración de impresión viaja con el comprobante');
select is(comprobante_de('venta', prueba.id('venta')) ->> 'leyenda', 'Comprobante interno, sin validez fiscal.', 'con la leyenda de comprobante sin validez fiscal');

-- ── El link ──
select is(length(prueba.token('v1')), 36, 'el token es largo y al azar');
select is(comprobante_de('venta', prueba.id('venta')) -> 'enlace' ->> 'token', prueba.token('v1'), 'pedirlo de nuevo devuelve el mismo link');
reset role; set local role anon;
select is(comprobante_publico(prueba.token('v1')) ->> 'numero', prueba.numero_de(prueba.id('venta')), 'quien tiene el link lo ve sin ingresar');
select is(comprobante_publico('0123456789abcdef0123456789abcdef0123'), null, 'un link inventado no devuelve nada');
select is(comprobante_publico('corto'), null, 'ni uno cortísimo');
select throws_like($$ select comprobante_de('venta', 1) $$, 'permission denied%', 'el público no usa la función del panel');
select throws_like($$ select * from enlaces_comprobante $$, 'permission denied%', 'ni lee la tabla de links (el token es el secreto)');
reset role; set local role authenticated; select prueba.como_admin();
select is(prueba.vistas('venta', prueba.id('venta')), 1, 'se cuenta cuántas veces lo abrieron');

-- ── Invalidar el link y crear otro ──
insert into prueba.tokens select 'v2', renovar_enlace_comprobante('venta', prueba.id('venta')) ->> 'token';
select isnt(prueba.token('v2'), prueba.token('v1'), 'el link nuevo es otro');
reset role; set local role anon;
select is(comprobante_publico(prueba.token('v1')), null, 'el viejo ya no sirve');
select is(comprobante_publico(prueba.token('v2')) ->> 'titulo', 'Comprobante de venta', 'y el nuevo sí');
reset role; set local role authenticated;

-- ── Permisos: cada uno ve lo suyo ──
select prueba.como_vendedora();
select throws_ok($$ select comprobante_de('venta', (select id from prueba.ids where nombre = 'venta')) $$, 'No tenés acceso a ese comprobante', 'la vendedora no ve la venta de otro');
insert into prueba.ids select 'venta_v', registrar_venta(
  jsonb_build_array(jsonb_build_object('variante_id', prueba.variante('40', 'Blanco'), 'cantidad', 1, 'precio_unitario', 79000)), jsonb_build_array(jsonb_build_object('medio_pago_id', prueba.medio('EFE'))));
select is(comprobante_de('venta', prueba.id('venta_v')) ->> 'atendio', 'Caro', 'pero sí la suya (y dice quién atendió)');
select prueba.como_admin();

-- ── Presupuesto y devolución usan el mismo comprobante ──
insert into prueba.ids select 'presupuesto', crear_presupuesto(
  jsonb_build_array(jsonb_build_object('variante_id', prueba.variante('40', 'Negro'), 'cantidad', 1, 'precio_unitario', 79000)), (select id from clientes where nombre = 'María González'), prueba.medio('EFE'));
select is(comprobante_de('presupuesto', prueba.id('presupuesto')) ->> 'titulo', 'Presupuesto', 'el presupuesto');
select matches(comprobante_de('presupuesto', prueba.id('presupuesto')) ->> 'leyenda', '^Presupuesto sin validez fiscal\. Los precios y las promociones se respetan hasta el \d{2}/\d{2}/\d{4}', 'con su vigencia');
insert into prueba.ids select 'devolucion', registrar_devolucion(prueba.id('venta'),
  jsonb_build_array(jsonb_build_object('venta_item_id', (select min(id) from venta_items where venta_id = prueba.id('venta')), 'cantidad', 1, 'estado', 'bueno')), 'talle');
select is(comprobante_de('devolucion', prueba.id('devolucion')) ->> 'origen', prueba.numero_de(prueba.id('venta')), 'la devolución dice de qué venta viene');
select matches(comprobante_de('devolucion', prueba.id('devolucion')) ->> 'leyenda', '^Saldo a favor para tu próxima compra en el local hasta el', 'y hasta cuándo vale el saldo');
select throws_ok($$ select comprobante_de('factura', 1) $$, 'Ese tipo de comprobante no existe', 'solo esos tres tipos');

-- ── Mail (Resend simulado) ──
select is(comprobante_mail_disponible() ->> 'disponible', 'false', 'sin Resend conectado, el mail no está disponible');
select matches(comprobante_mail_disponible() ->> 'motivo', 'conectar Resend', 'y dice qué falta');
reset role;
select prueba.config_mail('smtp.resend.com', null);
set local role authenticated; select prueba.como_admin();
select matches(comprobante_mail_disponible() ->> 'motivo', 'dirección del sitio', 'con Resend pero sin la dirección del sitio, dice que falta la dirección');
reset role;
select prueba.config_mail('smtp.resend.com', 'https://milocal.com.ar');
select prueba.responder('https://api.resend.com/emails', 200, '{"id":"abc"}');
set local role authenticated; select prueba.como_admin();
select is(comprobante_mail_disponible() ->> 'disponible', 'true', 'con Resend y el sitio cargados, el mail está disponible');
select is(enviar_comprobante_mail('venta', prueba.id('venta'), ' Cliente@Correo.com ') ->> 'ok', 'true', 'el mail se manda');
select is(prueba.llamadas_a('https://api.resend.com/emails'), 1::bigint, 'el mail sale por la API de Resend');
select ok((select cuerpo from prueba.llamadas order by id desc limit 1) like '%"to": ["cliente@correo.com"]%', 'al email indicado (en minúscula y sin espacios)');
select ok((select cuerpo from prueba.llamadas order by id desc limit 1) like '%https://milocal.com.ar/comprobante/%', 'con el link al comprobante');
select is((select estado from comprobante_envios where canal = 'mail' order by id desc limit 1), 'enviado', 'queda registrado');
select throws_ok($$ select enviar_comprobante_mail('venta', prueba.id('venta'), 'sin-arroba') $$, 'Ese email no parece válido', 'un email mal escrito se rechaza');
reset role;
select prueba.responder('https://api.resend.com/emails', 403, '{"statusCode":403,"message":"El dominio milocal.com no está verificado","name":"validation_error"}');
set local role authenticated; select prueba.como_admin();
select is(enviar_comprobante_mail('venta', prueba.id('venta'), 'otro@correo.com') ->> 'error', 'El dominio milocal.com no está verificado', 'si Resend rechaza, se explica por qué (sin lanzar un error)');
select is((select estado from comprobante_envios where canal = 'mail' order by id desc limit 1), 'error', 'y queda registrado como error');
reset role;
select prueba.config_mail('smtp.otro.com', 'https://milocal.com.ar');
set local role authenticated; select prueba.como_admin();
select throws_like($$ select enviar_comprobante_mail('venta', prueba.id('venta'), 'otro@correo.com') $$, 'Para mandar comprobantes por mail hay que conectar Resend%', 'sin Resend conectado, avisa qué falta');

-- La vendedora también ve si está disponible (no trae ningún dato de la conexión); un cliente de la tienda, no
select prueba.como_vendedora();
select ok(comprobante_mail_disponible() ? 'disponible', 'la vendedora ve si el mail está disponible');
select prueba.como_cliente();
select throws_ok($$ select comprobante_mail_disponible() $$, 'No tenés acceso', 'un cliente de la tienda no');
select prueba.como_admin();

-- ── WhatsApp: queda el registro de que se abrió ──
select registrar_envio_comprobante('venta', prueba.id('venta'), 'whatsapp', '+54 9 381 555-1234');
select is((select estado from comprobante_envios where canal = 'whatsapp' order by id desc limit 1), 'abierto', 'WhatsApp queda como «abierto» (no se sabe si lo mandó)');
select throws_ok($$ select registrar_envio_comprobante('venta', prueba.id('venta'), 'fax', null) $$, 'Canal inválido', 'solo WhatsApp o el link');

select * from finish();
rollback;
