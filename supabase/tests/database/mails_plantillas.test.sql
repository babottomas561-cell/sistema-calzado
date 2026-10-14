-- Mails como plantillas editables: textos de fábrica, edición con sus controles, mails de cuenta que salen de la plantilla, cola de envío,
-- avisos de pedido (cuándo sí y cuándo no), pago con el PDF adjunto, bienvenida, mail del comprobante con factura y comprobante de pedido.
begin;
create extension if not exists pgtap with schema extensions;
create schema prueba;
grant usage on schema prueba to anon, authenticated;
create table prueba.llamadas (id serial, url text, cuerpo text);
create table prueba.config (unica boolean primary key default true, resend int not null default 200);
insert into prueba.config default values;
grant all on prueba.llamadas, prueba.llamadas_id_seq, prueba.config to anon, authenticated;
create or replace function public._pedir_http(p_metodo text, p_url text, p_cabeceras jsonb default '{}', p_tipo text default null, p_cuerpo text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  insert into prueba.llamadas (url, cuerpo) values (p_url, p_cuerpo);
  return jsonb_build_object('status', (select resend from prueba.config), 'cuerpo', case when (select resend from prueba.config) = 200 then '{"id":"abc"}'::jsonb else '{"message":"dominio no verificado"}'::jsonb end, 'cabeceras', '{}'::jsonb);
end $$;
create function prueba.como_admin() returns void language sql as $$ select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) $$;
create function prueba.como_vendedora() returns void language sql as $$ select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true) $$;
create function prueba.correo(p_conectado boolean) returns void language sql security definer set search_path = public as $$
  update integraciones set smtp_host = case when p_conectado then 'smtp.resend.com' end, smtp_puerto = 465, smtp_usuario = 'resend', smtp_clave = case when p_conectado then 're_prueba' end,
    smtp_email = 'ventas@milocal.com', sitio_url = 'https://milocal.com.ar' where unica $$;
create function prueba.cola(p_clave text) returns bigint language sql stable security definer set search_path = public as $$ select count(*) from mails_cola where clave = p_clave $$;
create function prueba.fila(p_clave text) returns mails_cola language sql stable security definer set search_path = public as $$ select * from mails_cola where clave = p_clave order by id desc limit 1 $$;
grant execute on all functions in schema prueba to anon, authenticated;
select plan(42);

-- ── De fábrica ──
select is((select count(*) from plantillas_mail), 12::bigint, 'hay una plantilla por cada situación');
select is((select count(*) from plantillas_mail where fija), 4::bigint, 'las cuatro de cuenta son fijas');
select ok((select con_pdf from plantillas_mail where clave = 'pedido_pagado'), 'el aviso de pago lleva el comprobante en PDF');
select ok((select texto from plantillas_mail where clave = 'pedido_listo') like '%{{retirar_hasta}}%', 'los textos usan variables');

-- ── Editar ──
set local role authenticated; select prueba.como_vendedora();
select throws_ok($$ select guardar_plantilla_mail('bienvenida', 'a', 'Título', 'Texto', null, null, true) $$, 'No tenés permiso para editar los mails', 'la vendedora no edita los mails');
select prueba.como_admin();
select throws_like($$ select guardar_plantilla_mail('bienvenida', 'Hola {{tienda}}', 'Título', 'Tu pedido {{pedido}}', null, null, true) $$, 'La variable {{pedido}} no se puede usar en este mail%', 'una variable que ese mail no tiene se rechaza');
select throws_ok($$ select guardar_plantilla_mail('bienvenida', 'Hola', 'Título', 'Mirá <b>esto</b>', null, null, true) $$, 'Los mails no llevan HTML: escribí texto y usá **negrita** si hace falta', 'nada de HTML');
select throws_like($$ select guardar_plantilla_mail('recuperar', 'Asunto', 'Título', 'Texto', 'Botón', null, false) $$, 'Este mail no se puede apagar%', 'los de cuenta no se apagan');
select throws_ok($$ select guardar_plantilla_mail('bienvenida', '', 'Título', 'Texto', null, null, true) $$, 'El asunto, el título y el texto no pueden quedar vacíos', 'sin asunto no se guarda');
select lives_ok($$ select guardar_plantilla_mail('recuperar', 'Tu clave en {{tienda}}', 'Cambiá tu clave', 'Tocá acá para elegir una clave nueva en **{{tienda}}**.', 'Elegir clave', 'Si no fuiste vos, ignorá esto.', true) $$, 'se edita una plantilla');
select is(vista_previa_mail('bienvenida', 'Hola {{nombre}}', 'Título', 'Texto de **prueba** para {{nombre}}', 'Ir', 'Pie') ->> 'asunto', 'Hola María', 'la vista previa usa datos de ejemplo');
select ok(vista_previa_mail('bienvenida', 'A', 'Título', 'Texto de **prueba**', 'Ir', null) ->> 'html' like '%<b>prueba</b>%', 'y la negrita funciona');

select prueba.correo(false);
set local role authenticated; select prueba.como_admin();
select is(probar_plantilla_mail('bienvenida') ->> 'ok', 'false', 'sin correo conectado, la prueba avisa que falta conectarlo');
reset role; select prueba.correo(true);
set local role authenticated; select prueba.como_admin();
select is(probar_plantilla_mail('bienvenida') ->> 'para', 'admin@demo.local', 'la prueba va al email de quien la pide');
reset role;
select ok(exists (select 1 from prueba.llamadas where cuerpo like '%[Prueba]%'), 'con el asunto marcado como prueba');

-- ── Los mails de cuenta salen de la plantilla ──
reset role;
select is(_correo_plantilla('recuperar', 'BLAST') ->> 'asunto', 'Tu clave en BLAST', 'el asunto del mail de Supabase es el editado');
select ok(_correo_plantilla('recuperar', 'BLAST') ->> 'html' like '%Elegir clave%' and _correo_plantilla('recuperar', 'BLAST') ->> 'html' like '%{{ .TokenHash }}%type=recovery%', 'con su botón y el link que completa Supabase');
select ok(_correo_plantilla('confirmacion', 'BLAST') ->> 'html' like '%Confirmá tu email%', 'las demás siguen con su texto');
set local role authenticated; select prueba.como_admin();
select lives_ok($$ select restaurar_plantilla_mail('recuperar') $$, 'se restaura');
reset role;
select is(_correo_plantilla('recuperar', 'BLAST') ->> 'asunto', 'Cambiá tu contraseña - BLAST', 'y vuelve al texto de fábrica');

-- ── Avisos de pedido: sin correo conectado no se manda nada ──
update configuracion_tienda set envio_requiere_pago = false;
select prueba.correo(false);
update clientes set email = 'maria@correo.com' where id = 2;
update pedidos set estado = 'enviado' where id = 1;
set constraints all immediate; set constraints all deferred;
select is(prueba.cola('pedido_enviado'), 0::bigint, 'sin correo conectado no se encola nada');

-- ── Con correo conectado ──
select prueba.correo(true);
update pedidos set estado = 'entregado' where id = 1;
set constraints all immediate; set constraints all deferred;
select is(prueba.cola('pedido_entregado'), 1::bigint, 'al entregar el pedido se encola el aviso');
select is((prueba.fila('pedido_entregado')).para, 'maria@correo.com', 'al email del cliente');
select ok((prueba.fila('pedido_entregado')).html like '%0001-%', 'con el número de su pedido');
update pedidos set estado = 'cancelado', motivo_cancelacion = 'sin_stock', cancelado_por = 'local' where id = 1;
set constraints all immediate; set constraints all deferred;
select is(prueba.cola('pedido_cancelado'), 1::bigint, 'cada estado tiene su aviso');
select is(prueba.cola('pedido_entregado'), 1::bigint, 'y nunca se repite');
update plantillas_mail set activa = false where clave = 'pedido_confirmado';
update pedidos set estado = 'confirmado', motivo_cancelacion = null, cancelado_por = null where id = 1;
set constraints all immediate; set constraints all deferred;
select is(prueba.cola('pedido_confirmado'), 0::bigint, 'con la plantilla apagada no sale');
update plantillas_mail set activa = true where clave = 'pedido_confirmado';
update clientes set email = null where id = 2;
update pedidos set estado = 'enviado' where id = 1;
set constraints all immediate; set constraints all deferred;
select is(prueba.cola('pedido_enviado'), 0::bigint, 'sin email del cliente tampoco');
update clientes set email = 'maria@correo.com' where id = 2;

-- ── Pago recibido: con el PDF ──
update pedidos set estado = 'pendiente', pagado_online = false, motivo_cancelacion = null, cancelado_por = null where id = 1;
insert into pedido_pagos (pedido_id, monto, referencia, confirmado_en) values (1, 87400, 'Transferencia', now());
set constraints all immediate; set constraints all deferred;
select is(prueba.cola('pedido_pagado'), 1::bigint, 'un pago anotado a mano encola el aviso de pago');
select is((prueba.fila('pedido_pagado')).adjunto_tipo, 'pedido', 'con el comprobante del pedido para adjuntar');

-- ── La cola manda, con el PDF adjunto ──
select is(_mails_procesar() >= 1, true, 'la cola procesa lo pendiente');
select is((prueba.fila('pedido_pagado')).estado, 'enviado', 'y queda enviado');
select ok(exists (select 1 from prueba.llamadas where url = 'https://api.resend.com/emails' and cuerpo like '%"attachments"%/comprobante/%/pdf%'), 'el mail lleva el PDF adjunto (link a /comprobante/<token>/pdf del propio sitio)');
update prueba.config set resend = 403;
update pedidos set estado = 'listo_retiro' where id = 1;
set constraints all immediate; set constraints all deferred;
select _mails_procesar();
select is((prueba.fila('pedido_listo')).estado, 'pendiente', 'si el servidor rechaza, queda pendiente para reintentar');
select is((prueba.fila('pedido_listo')).error, 'dominio no verificado', 'con el motivo');
update prueba.config set resend = 200;

-- ── Bienvenida ──
update auth.users set email_confirmed_at = null where id = '22222222-2222-2222-2222-222222222222';
update auth.users set email_confirmed_at = now() where id = '22222222-2222-2222-2222-222222222222';
select is(prueba.cola('bienvenida'), 1::bigint, 'al confirmar el email por primera vez se encola la bienvenida');
update auth.users set email_confirmed_at = null where id = '11111111-1111-1111-1111-111111111111';
update auth.users set email_confirmed_at = now() where id = '11111111-1111-1111-1111-111111111111';
select is(prueba.cola('bienvenida'), 1::bigint, 'al equipo no se le manda la bienvenida de clientes');

-- ── El mail del comprobante entiende la factura ──
select ok(_comprobante_mail_html(jsonb_build_object('titulo', 'Comprobante de venta', 'numero', '0001-00000001', 'fecha', now(), 'renglones', '[]'::jsonb, 'totales', '[]'::jsonb, 'leyenda', 'Comprobante interno, sin validez fiscal.',
  'emisor', jsonb_build_object('nombre', 'Mi Tienda'), 'fiscal', jsonb_build_object('estado', 'autorizada', 'clase', 'factura', 'letra', 'B', 'comprobante', '00003-00000045', 'cae', '76123456789012', 'cae_vence', '2026-10-30', 'iva', 4374, 'pruebas', false)),
  'https://x/comprobante/abc') like '%Factura B 00003-00000045%CAE 76123456789012%Ley 27.743%', 'con factura, el mail dice Factura, su número, el CAE y la ley de transparencia');
select ok(_comprobante_mail_html(jsonb_build_object('titulo', 'Comprobante de venta', 'numero', '0001-00000001', 'fecha', now(), 'renglones', '[]'::jsonb, 'totales', '[]'::jsonb, 'leyenda', 'Comprobante interno, sin validez fiscal.', 'emisor', jsonb_build_object('nombre', 'Mi Tienda')),
  'https://x/comprobante/abc') like '%Comprobante interno, sin validez fiscal.%', 'sin factura, sigue diciendo que es interno');

-- ── Comprobante de un pedido ──
set local role authenticated; select prueba.como_admin();
select is(comprobante_de('pedido', 1) ->> 'titulo', 'Comprobante de pedido', 'el pedido tiene su comprobante');
select ok(jsonb_array_length(comprobante_de('pedido', 1) -> 'renglones') >= 1, 'con sus renglones');
select is(jsonb_array_length(comprobante_de('pedido', 1) -> 'pagos'), 1, 'y el pago que recibió');

select * from finish();
rollback;
