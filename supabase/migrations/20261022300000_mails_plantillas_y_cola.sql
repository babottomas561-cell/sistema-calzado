-- Mails al cliente como PLANTILLAS EDITABLES, con una cola de envío y el comprobante en PDF adjunto.
--   · `plantillas_mail`: una por situación (confirmar cuenta, cambiar contraseña, bienvenida, pedido recibido / pagado / confirmado / listo / enviado /
--     entregado / cancelado). El dueño cambia asunto, título, texto, botón y pie, las prende y apaga y ve cómo queda. Las de cuenta (que manda Supabase) son fijas:
--     no se apagan. Se escriben con variables entre llaves (por ejemplo {{nombre}}) y **negrita** entre asteriscos; nunca HTML.
--   · Los mails de pedidos y la bienvenida salen por una COLA (`mails_cola`): el cambio de estado del pedido nunca espera al servidor de correo, se reintenta solo
--     y cada aviso sale una sola vez por pedido. Solo se encolan si el correo está conectado (Integraciones → Correo).
--   · El comprobante viaja como PDF adjunto: la app lo arma en /comprobante/<token>/pdf y el mail lo adjunta (Resend por link, SMTP por la ruta de la app).
--   · Se corrige el mail del comprobante de una venta con factura: decía «Comprobante interno, sin validez fiscal» y no mostraba número ni CAE.

-- ── 1. Plantillas ───────────────────────────────────────────────────────
create table public.plantillas_mail (
  clave          text primary key check (clave in ('confirmacion', 'recuperar', 'cambio_email', 'invitacion', 'bienvenida', 'pedido_recibido', 'pedido_pagado',
                                                  'pedido_confirmado', 'pedido_listo', 'pedido_enviado', 'pedido_entregado', 'pedido_cancelado')),
  grupo          text not null check (grupo in ('cuenta', 'pedido')),
  nombre         text not null,
  cuando         text not null,
  asunto         text not null check (char_length(asunto) between 3 and 150),
  titulo         text not null check (char_length(titulo) between 3 and 100),
  texto          text not null check (char_length(texto) between 3 and 1500),
  boton          text check (char_length(boton) <= 40),
  pie            text check (char_length(pie) <= 300),
  activa         boolean not null default true,
  fija           boolean not null default false,       -- las de cuenta no se apagan (sin ellas nadie puede ingresar)
  con_pdf        boolean not null default false,       -- adjunta el comprobante en PDF
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid references auth.users (id) on delete set null
);
create index plantillas_mail_actualizado_por_idx on public.plantillas_mail (actualizado_por);
alter table public.plantillas_mail enable row level security;
create policy "quien edita la tienda ve las plantillas de mail" on public.plantillas_mail for select to authenticated using (tiene_permiso('tienda.editar'));

-- Qué variables acepta cada mail
create function public._mail_variables(p_clave text) returns text[] language sql immutable as $$
  select case
    when p_clave in ('confirmacion', 'recuperar', 'cambio_email', 'invitacion') then array['tienda', 'email']
    when p_clave = 'bienvenida' then array['tienda', 'nombre', 'sitio']
    else array['tienda', 'nombre', 'pedido', 'total', 'entrega', 'local', 'sitio', 'seguimiento', 'motivo', 'retirar_hasta'] end
$$;

-- El texto de fábrica de cada una (con él nacen y a él vuelve «Restaurar»)
create function public._mail_defecto(p_clave text) returns jsonb language sql immutable as $$
  select case p_clave
    when 'confirmacion' then jsonb_build_object('grupo', 'cuenta', 'nombre', 'Confirmar el email', 'cuando', 'Cuando alguien crea su cuenta en la tienda.', 'fija', true, 'con_pdf', false,
      'asunto', 'Confirmá tu email - {{tienda}}', 'titulo', 'Confirmá tu email',
      'texto', E'¡Hola! Gracias por crear tu cuenta en **{{tienda}}**. Tocá el botón para confirmar tu email y ya vas a poder hacer pedidos y seguirlos desde tu cuenta.',
      'boton', 'Confirmar mi email', 'pie', 'Si no creaste una cuenta en {{tienda}}, ignorá este mail: sin confirmar, la cuenta no se activa.')
    when 'recuperar' then jsonb_build_object('grupo', 'cuenta', 'nombre', 'Cambiar la contraseña', 'cuando', 'Cuando alguien toca «Olvidé mi contraseña».', 'fija', true, 'con_pdf', false,
      'asunto', 'Cambiá tu contraseña - {{tienda}}', 'titulo', 'Cambiá tu contraseña',
      'texto', E'Pediste cambiar la contraseña de tu cuenta en **{{tienda}}**. Tocá el botón para elegir una nueva. El link vale por una hora.',
      'boton', 'Elegir nueva contraseña', 'pie', 'Si no lo pediste vos, ignorá este mail: tu contraseña sigue siendo la misma.')
    when 'cambio_email' then jsonb_build_object('grupo', 'cuenta', 'nombre', 'Cambiar el email', 'cuando', 'Cuando alguien cambia el email de su cuenta.', 'fija', true, 'con_pdf', false,
      'asunto', 'Confirmá tu nuevo email - {{tienda}}', 'titulo', 'Confirmá tu nuevo email',
      'texto', E'Pediste cambiar el email de tu cuenta en **{{tienda}}**. Tocá el botón para confirmar el cambio.',
      'boton', 'Confirmar el cambio', 'pie', 'Si no lo pediste vos, ignorá este mail.')
    when 'invitacion' then jsonb_build_object('grupo', 'cuenta', 'nombre', 'Invitación al equipo', 'cuando', 'Cuando se invita a alguien al equipo del local.', 'fija', true, 'con_pdf', false,
      'asunto', 'Te invitaron a {{tienda}}', 'titulo', 'Te invitaron',
      'texto', E'Te sumaron a **{{tienda}}**. Tocá el botón para aceptar la invitación y elegir tu contraseña.',
      'boton', 'Aceptar la invitación', 'pie', 'Si no esperabas este mail, ignorálo.')
    when 'bienvenida' then jsonb_build_object('grupo', 'cuenta', 'nombre', 'Bienvenida', 'cuando', 'Cuando un cliente confirma su email por primera vez.', 'fija', false, 'con_pdf', false,
      'asunto', '¡Bienvenido/a a {{tienda}}!', 'titulo', '¡Hola, {{nombre}}!',
      'texto', E'Tu cuenta en **{{tienda}}** ya está lista. Desde acá podés ver las novedades, hacer tus pedidos y seguirlos paso a paso.',
      'boton', 'Ir a la tienda', 'pie', 'Si no fuiste vos, escribinos y lo solucionamos.')
    when 'pedido_recibido' then jsonb_build_object('grupo', 'pedido', 'nombre', 'Pedido recibido', 'cuando', 'Apenas el cliente hace un pedido.', 'fija', false, 'con_pdf', false,
      'asunto', 'Recibimos tu pedido {{pedido}} - {{tienda}}', 'titulo', '¡Gracias por tu pedido!',
      'texto', E'Hola {{nombre}}, recibimos tu pedido **{{pedido}}** por **{{total}}** ({{entrega}}).\nTe avisamos por acá cuando avance.',
      'boton', 'Ver mi pedido', 'pie', 'Cualquier duda, respondé este mail.')
    when 'pedido_pagado' then jsonb_build_object('grupo', 'pedido', 'nombre', 'Pago recibido', 'cuando', 'Cuando se acredita el pago de un pedido (Mercado Pago o anotado a mano). Lleva el comprobante en PDF.', 'fija', false, 'con_pdf', true,
      'asunto', 'Recibimos tu pago - pedido {{pedido}}', 'titulo', '¡Recibimos tu pago!',
      'texto', E'Hola {{nombre}}, ya acreditamos el pago de tu pedido **{{pedido}}** por **{{total}}**.\nTe adjuntamos el comprobante en PDF. Ya estamos preparando tus prendas.',
      'boton', 'Ver mi pedido', 'pie', 'Guardá este mail: el PDF es tu comprobante.')
    when 'pedido_confirmado' then jsonb_build_object('grupo', 'pedido', 'nombre', 'Pedido confirmado', 'cuando', 'Cuando el local confirma el pedido y reserva las prendas.', 'fija', false, 'con_pdf', false,
      'asunto', 'Tu pedido {{pedido}} está confirmado', 'titulo', 'Confirmamos tu pedido',
      'texto', E'Hola {{nombre}}, tu pedido **{{pedido}}** está confirmado y las prendas ya están reservadas. Lo estamos preparando.',
      'boton', 'Ver mi pedido', 'pie', null)
    when 'pedido_listo' then jsonb_build_object('grupo', 'pedido', 'nombre', 'Listo para retirar', 'cuando', 'Cuando un pedido con retiro está listo en el local.', 'fija', false, 'con_pdf', false,
      'asunto', 'Tu pedido {{pedido}} está listo para retirar', 'titulo', '¡Tu pedido está listo!',
      'texto', E'Hola {{nombre}}, ya podés pasar a retirar tu pedido **{{pedido}}** por {{local}}.\nLo guardamos hasta el {{retirar_hasta}}.',
      'boton', 'Ver mi pedido', 'pie', 'Si no podés pasar, avisanos y lo coordinamos.')
    when 'pedido_enviado' then jsonb_build_object('grupo', 'pedido', 'nombre', 'Pedido en camino', 'cuando', 'Cuando el pedido sale con el envío.', 'fija', false, 'con_pdf', false,
      'asunto', 'Tu pedido {{pedido}} está en camino', 'titulo', '¡Tu pedido va en camino!',
      'texto', E'Hola {{nombre}}, tu pedido **{{pedido}}** ya salió.\n{{seguimiento}}',
      'boton', 'Ver mi pedido', 'pie', null)
    when 'pedido_entregado' then jsonb_build_object('grupo', 'pedido', 'nombre', 'Pedido entregado', 'cuando', 'Cuando el pedido se entrega o se retira.', 'fija', false, 'con_pdf', false,
      'asunto', '¡Gracias por tu compra! - {{tienda}}', 'titulo', '¡Gracias por tu compra!',
      'texto', E'Hola {{nombre}}, tu pedido **{{pedido}}** ya está en tus manos. Esperamos que lo disfrutes.\nSi algo no te queda bien, contá con nosotros para el cambio.',
      'boton', 'Seguir viendo novedades', 'pie', null)
    when 'pedido_cancelado' then jsonb_build_object('grupo', 'pedido', 'nombre', 'Pedido cancelado', 'cuando', 'Cuando se cancela un pedido.', 'fija', false, 'con_pdf', false,
      'asunto', 'Cancelamos tu pedido {{pedido}}', 'titulo', 'Tu pedido fue cancelado',
      'texto', E'Hola {{nombre}}, el pedido **{{pedido}}** fue cancelado{{motivo}}.\nSi pagaste, el dinero vuelve por el mismo medio. Cualquier duda, escribinos.',
      'boton', 'Ir a la tienda', 'pie', null)
  end
$$;

insert into public.plantillas_mail (clave, grupo, nombre, cuando, asunto, titulo, texto, boton, pie, fija, con_pdf)
select c, d ->> 'grupo', d ->> 'nombre', d ->> 'cuando', d ->> 'asunto', d ->> 'titulo', d ->> 'texto', d ->> 'boton', d ->> 'pie', (d ->> 'fija')::boolean, (d ->> 'con_pdf')::boolean
  from unnest(array['confirmacion', 'recuperar', 'cambio_email', 'invitacion', 'bienvenida', 'pedido_recibido', 'pedido_pagado', 'pedido_confirmado', 'pedido_listo',
                    'pedido_enviado', 'pedido_entregado', 'pedido_cancelado']) c, lateral (select _mail_defecto(c) d) x;

-- ── 2. Armar el mail ─────────────────────────────────────────────────────
-- Texto del cuerpo: se escapa todo (nada de HTML ajeno), **negrita**, las variables con su valor escapado y los saltos de línea
create function public._mail_texto(p text, p_vars jsonb) returns text
language plpgsql immutable set search_path = public as $$
declare r text := coalesce(p, ''); k text;
begin
  r := replace(replace(replace(replace(r, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;');
  r := regexp_replace(r, '\*\*(.+?)\*\*', '<b>\1</b>', 'g');
  for k in select jsonb_object_keys(p_vars) loop r := replace(r, '{{' || k || '}}', _html(coalesce(p_vars ->> k, ''))); end loop;
  r := regexp_replace(r, '\{\{\w+\}\}', '', 'g');
  return replace(r, E'\n', '<br>');
end $$;
-- Asunto: texto plano con las variables
create function public._mail_asunto(p text, p_vars jsonb) returns text
language plpgsql immutable set search_path = public as $$
declare r text := coalesce(p, ''); k text;
begin
  for k in select jsonb_object_keys(p_vars) loop r := replace(r, '{{' || k || '}}', coalesce(p_vars ->> k, '')); end loop;
  return trim(regexp_replace(regexp_replace(r, '\{\{\w+\}\}', '', 'g'), '\s+', ' ', 'g'));
end $$;

-- El mail armado: la marca (logo o iniciales y color), el título, el texto, un botón opcional y el pie
create function public._mail_html(p_tienda text, p_color text, p_logo text, p_titulo_html text, p_texto_html text, p_boton text, p_url text, p_pie_html text) returns text
language plpgsql immutable set search_path = public as $$
declare v_n text := _html(p_tienda); v_ini text := upper(left(regexp_replace(p_tienda, '[^A-Za-z0-9]', '', 'g'), 2)); v_color text := coalesce(nullif(p_color, ''), '#1d4ed8');
begin
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' || regexp_replace(p_titulo_html, '<[^>]+>', '', 'g') || '</title></head>'
    || '<body style="margin:0;padding:0;background:#f5f6f8;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Helvetica,Arial,sans-serif;color:#111827;">'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;padding:24px 12px;"><tr><td align="center">'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;">'
    || '<tr><td style="padding:28px 28px 8px 28px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr>'
    || case when coalesce(p_logo, '') <> '' then '<td><img src="' || _html(p_logo) || '" alt="' || v_n || '" height="40" style="display:block;height:40px;width:auto;max-width:200px;border:0;"></td>'
         else '<td style="background:' || v_color || ';border-radius:10px;width:36px;height:36px;text-align:center;color:#ffffff;font-weight:700;font-size:16px;">' || v_ini || '</td>'
              || '<td style="padding-left:10px;font-size:18px;font-weight:700;color:#111827;">' || v_n || '</td>' end
    || '</tr></table></td></tr>'
    || '<tr><td style="padding:16px 28px 0 28px;"><h1 style="margin:0 0 8px 0;font-size:22px;line-height:1.3;color:#111827;">' || p_titulo_html || '</h1>'
    || '<p style="margin:0 0 20px 0;font-size:15px;line-height:1.55;color:#374151;">' || p_texto_html || '</p></td></tr>'
    || case when coalesce(p_boton, '') <> '' and coalesce(p_url, '') <> '' then '<tr><td style="padding:0 28px;"><a href="' || p_url || '" style="display:block;background:' || v_color
         || ';color:#ffffff;text-decoration:none;text-align:center;font-weight:600;font-size:16px;padding:14px 20px;border-radius:10px;">' || _html(p_boton) || '</a></td></tr>' else '' end
    || '<tr><td style="padding:20px 28px 28px 28px;">'
    || case when coalesce(p_pie_html, '') <> '' then '<p style="margin:0 0 12px 0;font-size:13px;line-height:1.5;color:#6b7280;">' || p_pie_html || '</p>' else '' end
    || case when coalesce(p_boton, '') <> '' and coalesce(p_url, '') <> '' then '<p style="margin:0;font-size:12px;line-height:1.5;color:#9ca3af;">Si el botón no funciona, copiá este link en el navegador:<br><span style="word-break:break-all;color:#6b7280;">'
         || regexp_replace(p_url, '&(?!amp;)', '&amp;', 'g') || '</span></p>' else '' end
    || '</td></tr></table><p style="margin:16px 0 0 0;font-size:12px;color:#9ca3af;">' || v_n || '</p></td></tr></table></body></html>';
end $$;

-- Los mails de cuenta que manda Supabase (confirmar, recuperar, cambiar email, invitar): salen de la plantilla editable. {{ .SiteURL }}, {{ .TokenHash }} y
-- {{ .Email }} los completa Supabase al mandarlo.
create or replace function public._correo_plantilla(p_tipo text, p_tienda text, p_color text default '#1d4ed8', p_logo text default null) returns jsonb
language plpgsql stable set search_path = public as $$
declare pl plantillas_mail; v_tipo text; v_sig text := ''; v_vars jsonb := jsonb_build_object('tienda', p_tienda, 'email', '{{ .Email }}'); v_url text;
begin
  select * into pl from plantillas_mail where clave = case p_tipo when 'confirmacion' then 'confirmacion' when 'recuperar' then 'recuperar' when 'cambio_email' then 'cambio_email' else 'invitacion' end;
  v_tipo := case p_tipo when 'confirmacion' then 'signup' when 'recuperar' then 'recovery' when 'cambio_email' then 'email_change' else 'invite' end;
  if p_tipo in ('recuperar', 'invitacion') or p_tipo not in ('confirmacion', 'cambio_email') then v_sig := '&siguiente=/nueva-clave'; end if;
  v_url := '{{ .SiteURL }}/auth/confirmar?token_hash={{ .TokenHash }}&type=' || v_tipo || v_sig;
  return jsonb_build_object('asunto', _mail_asunto(pl.asunto, v_vars),
    'html', _mail_html(p_tienda, p_color, p_logo, _mail_texto(pl.titulo, v_vars), _mail_texto(pl.texto, v_vars), pl.boton, v_url, _mail_texto(pl.pie, v_vars)));
end $$;

-- ── 3. Editar las plantillas (Tienda online → Mails) ────────────────────
create function public._mail_validar(p_clave text, p_texto text) returns void
language plpgsql immutable set search_path = public as $$
declare v text;
begin
  for v in select m[1] from regexp_matches(coalesce(p_texto, ''), '\{\{\s*([A-Za-z_]+)\s*\}\}', 'g') m loop
    if not (v = any (_mail_variables(p_clave))) then
      raise exception 'La variable {{%}} no se puede usar en este mail. Las que sí: %', v, (select string_agg('{{' || x || '}}', ', ') from unnest(_mail_variables(p_clave)) x);
    end if;
  end loop;
  if coalesce(p_texto, '') ~ '<[A-Za-z/!]' then raise exception 'Los mails no llevan HTML: escribí texto y usá **negrita** si hace falta'; end if;
end $$;

create function public.guardar_plantilla_mail(p_clave text, p_asunto text, p_titulo text, p_texto text, p_boton text, p_pie text, p_activa boolean, p_con_pdf boolean default null)
returns void language plpgsql security definer set search_path = public as $$
declare pl plantillas_mail;
begin
  if not tiene_permiso('tienda.editar') then raise exception 'No tenés permiso para editar los mails'; end if;
  select * into pl from plantillas_mail where clave = p_clave;
  if not found then raise exception 'Ese mail no existe'; end if;
  if trim(coalesce(p_asunto, '')) = '' or trim(coalesce(p_titulo, '')) = '' or trim(coalesce(p_texto, '')) = '' then raise exception 'El asunto, el título y el texto no pueden quedar vacíos'; end if;
  perform _mail_validar(p_clave, p_asunto); perform _mail_validar(p_clave, p_titulo); perform _mail_validar(p_clave, p_texto);
  perform _mail_validar(p_clave, p_boton); perform _mail_validar(p_clave, p_pie);
  if pl.fija and not p_activa then raise exception 'Este mail no se puede apagar: sin él, los clientes no pueden confirmar su cuenta ni cambiar la contraseña'; end if;
  update plantillas_mail set asunto = trim(p_asunto), titulo = trim(p_titulo), texto = trim(p_texto), boton = nullif(trim(coalesce(p_boton, '')), ''),
         pie = nullif(trim(coalesce(p_pie, '')), ''), activa = p_activa, con_pdf = coalesce(p_con_pdf, con_pdf), actualizado_en = now(), actualizado_por = auth.uid()
   where clave = p_clave;
end $$;

create function public.restaurar_plantilla_mail(p_clave text) returns void
language plpgsql security definer set search_path = public as $$
declare d jsonb := _mail_defecto(p_clave);
begin
  if not tiene_permiso('tienda.editar') then raise exception 'No tenés permiso para editar los mails'; end if;
  if d is null then raise exception 'Ese mail no existe'; end if;
  update plantillas_mail set asunto = d ->> 'asunto', titulo = d ->> 'titulo', texto = d ->> 'texto', boton = d ->> 'boton', pie = d ->> 'pie',
         con_pdf = (d ->> 'con_pdf')::boolean, actualizado_en = now(), actualizado_por = auth.uid() where clave = p_clave;
end $$;

-- Cómo queda un mail, con datos de ejemplo y el texto que se está escribiendo (todavía sin guardar)
create function public.vista_previa_mail(p_clave text, p_asunto text, p_titulo text, p_texto text, p_boton text, p_pie text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t configuracion_tienda; v_vars jsonb;
begin
  if not tiene_permiso('tienda.editar') then raise exception 'No tenés permiso para editar los mails'; end if;
  select * into t from configuracion_tienda;
  v_vars := jsonb_build_object('tienda', t.nombre, 'email', 'maria@correo.com', 'nombre', 'María', 'pedido', '0001-00000123', 'total', _dinero(108500), 'entrega', 'retiro en el local',
    'local', coalesce(t.direccion_retiro, 'nuestro local'), 'sitio', 'https://tutienda.com.ar', 'seguimiento', 'Seguimiento: AB123456 (Andreani)', 'motivo', ' porque no hay stock',
    'retirar_hasta', to_char(current_date + 5, 'DD/MM/YYYY'));
  return jsonb_build_object('asunto', _mail_asunto(p_asunto, v_vars),
    'html', _mail_html(t.nombre, coalesce(t.color_marca, '#1d4ed8'), t.logo_url, _mail_texto(p_titulo, v_vars), _mail_texto(p_texto, v_vars), p_boton, 'https://tutienda.com.ar/mi-cuenta', _mail_texto(p_pie, v_vars)));
end $$;

-- Mandarse un mail de prueba con esa plantilla (datos de ejemplo), a la casilla de quien está usando el panel. Va directo (no por la cola).
create function public.probar_plantilla_mail(p_clave text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pl plantillas_mail; v_email text; v_vista jsonb; i integraciones;
begin
  if not tiene_permiso('tienda.editar') then raise exception 'No tenés permiso para editar los mails'; end if;
  select * into pl from plantillas_mail where clave = p_clave;
  if not found then raise exception 'Ese mail no existe'; end if;
  select * into i from integraciones;
  if not _correo_configurado(i) then return jsonb_build_object('ok', false, 'error', 'Todavía no está conectado el correo (Integraciones → Correo)'); end if;
  select email into v_email from auth.users where id = auth.uid();
  v_vista := vista_previa_mail(p_clave, pl.asunto, pl.titulo, pl.texto, pl.boton, pl.pie);
  return _correo_enviar(v_email, '[Prueba] ' || (v_vista ->> 'asunto'), v_vista ->> 'html', null) || jsonb_build_object('para', v_email);
end $$;

-- ── 4. La cola de mails ──────────────────────────────────────────────────
create table public.mails_cola (
  id              bigint generated always as identity primary key,
  creado_en       timestamptz not null default now(),
  clave           text not null,
  para            text not null check (para ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  asunto          text not null,
  html            text not null,
  pedido_id       bigint references public.pedidos (id) on delete cascade,
  cliente_id      bigint references public.clientes (id) on delete set null,
  adjunto_tipo    text check (adjunto_tipo in ('venta', 'presupuesto', 'devolucion', 'pedido')),   -- el comprobante que va en PDF
  adjunto_id      bigint,
  estado          text not null default 'pendiente' check (estado in ('pendiente', 'enviado', 'error')),
  intentos        int not null default 0,
  proximo_intento timestamptz not null default now(),
  error           text,
  enviado_en      timestamptz
);
create index mails_cola_pedido_id_idx on public.mails_cola (pedido_id);
create index mails_cola_cliente_id_idx on public.mails_cola (cliente_id);
create index mails_cola_pendientes_idx on public.mails_cola (proximo_intento) where estado = 'pendiente';
-- Cada aviso de un pedido sale una sola vez
create unique index mails_cola_pedido_clave_key on public.mails_cola (pedido_id, clave) where pedido_id is not null;
alter table public.mails_cola enable row level security;
create policy "el equipo ve los mails de los pedidos" on public.mails_cola for select to authenticated using (tiene_permiso('pedidos.gestionar') or tiene_permiso('tienda.editar'));

-- Variables de un pedido
create function public._mail_vars_pedido(p_pedido bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p pedidos; c clientes; t configuracion_tienda; e envios; v_hasta date;
begin
  select * into p from pedidos where id = p_pedido; select * into c from clientes where id = p.cliente_id; select * into t from configuracion_tienda;
  select * into e from envios where pedido_id = p_pedido;
  begin v_hasta := retirar_hasta(p_pedido); exception when others then v_hasta := null; end;
  return jsonb_build_object('tienda', t.nombre, 'nombre', coalesce(nullif(split_part(c.nombre, ' ', 1), ''), 'Hola'), 'pedido', p.comprobante,
    'total', _dinero(p.total + coalesce(p.costo_envio, 0)), 'entrega', case when p.entrega = 'envio' then 'envío a domicilio' else 'retiro en el local' end,
    'local', coalesce(t.direccion_retiro, 'nuestro local'), 'sitio', coalesce((select sitio_url from integraciones), ''),
    'seguimiento', case when e.seguimiento is not null then 'Seguimiento: ' || e.seguimiento || coalesce(' (' || e.proveedor || ')', '') else 'Te avisamos cuando llegue.' end,
    'motivo', case p.motivo_cancelacion when 'arrepentido' then ' a pedido tuyo' when 'no_retiro' then ' porque no lo retiraste a tiempo' when 'no_pago' then ' porque no recibimos el pago'
                                          when 'sin_stock' then ' porque no tenemos stock' else '' end,
    'retirar_hasta', coalesce(to_char(v_hasta, 'DD/MM/YYYY'), 'unos días'));
end $$;

-- Encola un mail si el correo está conectado, la plantilla está prendida y hay un email válido. No lanza errores: avisar nunca puede frenar la operación.
create function public._mail_encolar(p_clave text, p_para text, p_vars jsonb, p_url text, p_pedido bigint default null, p_cliente bigint default null,
                                     p_adjunto_tipo text default null, p_adjunto_id bigint default null) returns void
language plpgsql security definer set search_path = public as $$
declare i integraciones; t configuracion_tienda; pl plantillas_mail; v_para text := lower(trim(coalesce(p_para, '')));
begin
  select * into i from integraciones;
  if not _correo_configurado(i) or v_para !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return; end if;
  select * into pl from plantillas_mail where clave = p_clave and activa;
  if not found then return; end if;
  select * into t from configuracion_tienda;
  insert into mails_cola (clave, para, asunto, html, pedido_id, cliente_id, adjunto_tipo, adjunto_id)
  values (p_clave, v_para, _mail_asunto(pl.asunto, p_vars),
          _mail_html(t.nombre, coalesce(t.color_marca, '#1d4ed8'), t.logo_url, _mail_texto(pl.titulo, p_vars), _mail_texto(pl.texto, p_vars), pl.boton, p_url, _mail_texto(pl.pie, p_vars)),
          p_pedido, p_cliente, case when pl.con_pdf then p_adjunto_tipo end, case when pl.con_pdf then p_adjunto_id end)
  on conflict do nothing;
exception when others then null;
end $$;

-- Manda lo pendiente (cada minuto, de a pocos). Reintenta con espera creciente y a los 5 intentos queda en «error» a la vista.
create function public._mails_procesar() returns int
language plpgsql security definer set search_path = public as $$
declare m mails_cola; r jsonb; v_n int := 0; v_adj jsonb; v_url text;
begin
  if not pg_try_advisory_xact_lock(7102) then return 0; end if;
  for m in select * from mails_cola where estado = 'pendiente' and proximo_intento <= now() order by id limit 5 for update skip locked loop
    v_adj := '[]';
    if m.adjunto_tipo is not null then
      v_url := _comprobante_enlace(m.adjunto_tipo, m.adjunto_id) ->> 'url';
      if v_url is not null then v_adj := jsonb_build_array(jsonb_build_object('nombre', 'Comprobante-' || coalesce(_comprobante_json(m.adjunto_tipo, m.adjunto_id) ->> 'numero', m.adjunto_id::text) || '.pdf', 'url', v_url || '/pdf')); end if;
    end if;
    r := _correo_enviar(m.para, m.asunto, m.html, (select email_contacto from datos_legales), v_adj);
    if (r ->> 'ok') = 'true' then
      update mails_cola set estado = 'enviado', enviado_en = now(), intentos = intentos + 1, error = null where id = m.id;
    else
      update mails_cola set intentos = intentos + 1, error = left(coalesce(r ->> 'error', 'No se pudo mandar'), 300),
             estado = case when intentos + 1 >= 5 then 'error' else 'pendiente' end,
             proximo_intento = now() + case intentos when 0 then interval '2 minutes' when 1 then interval '10 minutes' when 2 then interval '30 minutes' else interval '2 hours' end
       where id = m.id;
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
select cron.schedule('mails-cola', '* * * * *', $$select public._mails_procesar()$$);
select cron.schedule('mails-cola-limpiar', '50 4 * * *', $$delete from public.mails_cola where creado_en < now() - interval '90 days'$$);

-- ── 5. _correo_enviar con adjuntos ──────────────────────────────────────
-- p_adjuntos: [{nombre, url}]. Resend los baja del link (attachments.path); por SMTP los trae la ruta de la app. Solo links del propio sitio.
drop function public._correo_enviar(text, text, text, text);
create function public._correo_enviar(p_para text, p_asunto text, p_html text, p_reply_to text default null, p_adjuntos jsonb default '[]') returns jsonb
language plpgsql security definer set search_path = public, extensions set statement_timeout = '45s' as $$
declare i integraciones; t configuracion_tienda; v_nombre text; r jsonb; v_cuerpo jsonb; v_texto text; v_secreto text; v_huella text; v_marca bigint := extract(epoch from now())::bigint; v_msg text;
        v_adj jsonb := '[]'; a jsonb;
begin
  select * into i from integraciones; select * into t from configuracion_tienda;
  if not _correo_configurado(i) then return jsonb_build_object('ok', false, 'error', 'Falta conectar el correo (Integraciones → Correo)'); end if;
  v_nombre := replace(coalesce(i.smtp_nombre, t.nombre), '"', '');
  for a in select * from jsonb_array_elements(coalesce(p_adjuntos, '[]')) loop
    if coalesce(a ->> 'url', '') ~ '^https://' and coalesce(i.sitio_url, '') <> '' and (a ->> 'url') like i.sitio_url || '/%' then v_adj := v_adj || a; end if;   -- solo del propio sitio
  end loop;

  if i.smtp_host = 'smtp.resend.com' then
    v_cuerpo := jsonb_build_object('from', '"' || v_nombre || '" <' || i.smtp_email || '>', 'to', jsonb_build_array(p_para), 'subject', p_asunto, 'html', p_html);
    if p_reply_to is not null then v_cuerpo := v_cuerpo || jsonb_build_object('reply_to', p_reply_to); end if;
    if jsonb_array_length(v_adj) > 0 then
      v_cuerpo := v_cuerpo || jsonb_build_object('attachments', (select jsonb_agg(jsonb_build_object('filename', x ->> 'nombre', 'path', x ->> 'url')) from jsonb_array_elements(v_adj) x));
    end if;
    perform set_config('app.http_timeout_ms', '40000', true);
    r := _pedir_http('POST', 'https://api.resend.com/emails', jsonb_build_object('Authorization', 'Bearer ' || i.smtp_clave), 'application/json', v_cuerpo::text);
    if (r ->> 'status')::int not between 200 and 299 then
      return jsonb_build_object('ok', false, 'error', left(coalesce(r -> 'cuerpo' ->> 'message', 'Resend contestó ' || (r ->> 'status')), 200));
    end if;
    return jsonb_build_object('ok', true);
  end if;

  if i.sitio_url is null then
    return jsonb_build_object('ok', false, 'error', 'Falta la dirección del sitio en la instalación: sin ella la base no encuentra la ruta que manda los mails');
  end if;
  v_secreto := i.correo_secreto;
  v_cuerpo := jsonb_build_object('marca', v_marca, 'host', i.smtp_host, 'puerto', i.smtp_puerto, 'usuario', i.smtp_usuario, 'clave', i.smtp_clave,
    'desde_nombre', v_nombre, 'desde_email', i.smtp_email, 'para', p_para, 'asunto', p_asunto, 'html', p_html, 'adjuntos', v_adj);
  if p_reply_to is not null then v_cuerpo := v_cuerpo || jsonb_build_object('responder_a', p_reply_to); end if;
  v_texto := v_cuerpo::text;
  v_huella := encode(digest(convert_to(v_texto, 'UTF8'), 'sha256'), 'hex');
  perform set_config('app.http_timeout_ms', '40000', true);
  r := _pedir_http('POST', i.sitio_url || '/api/correo/enviar',
    jsonb_build_object('x-firma', encode(hmac(convert_to(v_huella || '.' || v_marca::text, 'UTF8'), convert_to(v_secreto, 'UTF8'), 'sha256'), 'hex')),
    'application/json', v_texto);
  if (r ->> 'status')::int = 200 and (r -> 'cuerpo' ->> 'ok') = 'true' then return jsonb_build_object('ok', true); end if;
  v_msg := left(coalesce(r -> 'cuerpo' ->> 'error', 'La app respondió ' || coalesce(r ->> 'status', 'sin respuesta')), 200);
  return jsonb_build_object('ok', false, 'error', v_msg);
end $$;
revoke execute on function public._correo_enviar(text, text, text, text, jsonb) from public, anon, authenticated;

-- ── 6. El comprobante de un PEDIDO ──────────────────────────────────────
alter table public.enlaces_comprobante drop constraint enlaces_comprobante_tipo_check;
alter table public.enlaces_comprobante add constraint enlaces_comprobante_tipo_check check (tipo in ('venta', 'presupuesto', 'devolucion', 'pedido'));
alter table public.comprobante_envios drop constraint comprobante_envios_tipo_check;
alter table public.comprobante_envios add constraint comprobante_envios_tipo_check check (tipo in ('venta', 'presupuesto', 'devolucion', 'pedido'));

create function public._comprobante_pedido(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p pedidos; v_cliente text; v_pagado numeric; v_totales jsonb; v_total numeric;
begin
  select * into p from pedidos where id = p_id;
  if not found then return null; end if;
  select nombre into v_cliente from clientes where id = p.cliente_id;
  v_total := p.total + coalesce(p.costo_envio, 0);
  select coalesce((select sum(monto) from pagos_online where pedido_id = p_id and estado = 'approved'), 0) + coalesce((select sum(monto) from pedido_pagos where pedido_id = p_id), 0) into v_pagado;
  v_totales := jsonb_build_array(jsonb_build_object('rotulo', 'Subtotal', 'monto', p.subtotal));
  if p.descuento_promociones > 0 then v_totales := v_totales || jsonb_build_object('rotulo', 'Promociones', 'monto', -p.descuento_promociones); end if;
  if p.ajuste_medio_pago <> 0 then
    v_totales := v_totales || jsonb_build_object('rotulo', case when p.ajuste_medio_pago < 0 then 'Descuento por medio de pago' else 'Recargo por medio de pago' end, 'monto', p.ajuste_medio_pago);
  end if;
  if coalesce(p.costo_envio, 0) > 0 then v_totales := v_totales || jsonb_build_object('rotulo', 'Envío', 'monto', p.costo_envio); end if;
  v_totales := v_totales || jsonb_build_object('rotulo', 'Total', 'monto', v_total, 'fuerte', true);
  return jsonb_build_object(
    'tipo', 'pedido', 'titulo', 'Comprobante de pedido', 'numero', p.comprobante, 'fecha', p.fecha, 'anulada', p.estado = 'cancelado',
    'cliente', v_cliente, 'atendio', null, 'origen', null,
    'renglones', (select coalesce(jsonb_agg(jsonb_build_object('detalle', pr.nombre, 'marca', m.nombre, 'variante', 'Talle ' || t.nombre || ' · ' || co.nombre, 'cantidad', i.cantidad,
                    'precio', i.precio_unitario, 'promocion', po.nombre, 'descuento', i.descuento_promo, 'subtotal', i.cantidad * i.precio_unitario - i.descuento_promo) order by i.id), '[]')
                    from pedido_items i join variantes v on v.id = i.variante_id join productos pr on pr.id = v.producto_id join talles t on t.id = v.talle_id join colores co on co.id = v.color_id
                    left join marcas m on m.id = pr.marca_id left join promociones po on po.id = i.promocion_id where i.pedido_id = p.id),
    'totales', v_totales,
    'pagos', (select coalesce(jsonb_agg(x order by x ->> 'fecha'), '[]') from (
                select jsonb_build_object('medio', coalesce(o.medio, 'Mercado Pago'), 'base', o.monto, 'ajuste_pct', 0, 'ajuste', 0, 'monto', o.monto, 'cuotas', coalesce(o.cuotas, 1), 'referencia', o.pago_externo, 'fecha', o.creado_en) x
                  from pagos_online o where o.pedido_id = p_id and o.estado = 'approved'
                union all
                select jsonb_build_object('medio', 'Pago recibido', 'base', q.monto, 'ajuste_pct', 0, 'ajuste', 0, 'monto', q.monto, 'cuotas', 1, 'referencia', q.referencia, 'fecha', q.fecha)
                  from pedido_pagos q where q.pedido_id = p_id) y),
    'saldo', greatest(v_total - v_pagado, 0),
    'leyenda', case when v_pagado >= v_total and v_total > 0 then 'Pedido pagado. Este comprobante no es una factura.' else 'Comprobante de tu pedido. No es una factura.' end);
end $$;

-- _comprobante_json y _comprobante_acceso: suman «pedido» (se parte de las versiones actuales)
CREATE OR REPLACE FUNCTION public._comprobante_json(p_tipo text, p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
declare t configuracion_tienda; l datos_legales; c configuracion_impresion; u impresion_por_usuario; v_doc jsonb; v_fiscal jsonb; v_clave text; o jsonb;
begin
  v_doc := case p_tipo when 'venta' then _comprobante_venta(p_id) when 'presupuesto' then _comprobante_presupuesto(p_id) when 'devolucion' then _comprobante_devolucion(p_id) when 'pedido' then _comprobante_pedido(p_id) end;
  if v_doc is null then return null; end if;
  select * into t from configuracion_tienda; select * into l from datos_legales; select * into c from configuracion_impresion;
  select * into u from impresion_por_usuario where usuario_id = auth.uid();
  v_fiscal := case p_tipo when 'venta' then _factura_fiscal(p_id) || jsonb_build_object('clase', 'factura') when 'devolucion' then _nota_credito_fiscal(p_id) end;
  -- Qué comprobante es, para su formato
  v_clave := case
    when p_tipo = 'venta' and v_fiscal ->> 'estado' = 'autorizada' then 'factura'
    when p_tipo = 'venta' then 'interno'
    when p_tipo = 'devolucion' and v_fiscal ->> 'estado' = 'autorizada' then 'nota_credito'
    else p_tipo end;
  o := coalesce(c.por_tipo -> v_clave, '{}');
  return v_doc || jsonb_build_object(
    'emisor', jsonb_build_object('nombre', t.nombre, 'logo_url', coalesce(t.logo_url, t.icono_url), 'es_icono', t.logo_url is null and t.icono_url is not null,
      'razon_social', l.razon_social, 'cuit', l.cuit, 'condicion_iva', l.condicion_iva,
      'domicilio', l.domicilio_legal, 'telefono', l.telefono_contacto, 'email', l.email_contacto, 'local', t.direccion_retiro),
    'config', jsonb_build_object(
      'clave', v_clave,
      'formato', coalesce(o ->> 'formato', u.comprobante_formato, c.comprobante_formato),
      'logo', coalesce((o ->> 'logo')::boolean, c.comprobante_logo), 'datos_legales', coalesce((o ->> 'datos_legales')::boolean, c.comprobante_datos_legales),
      'qr', coalesce((o ->> 'qr')::boolean, c.comprobante_qr), 'barras', coalesce((o ->> 'barras')::boolean, c.comprobante_codigo_barras),
      'copias', coalesce((o ->> 'copias')::int, u.comprobante_copias, c.comprobante_copias),
      'modo', coalesce(u.modo_impresion, c.modo_impresion), 'configurado', c.comprobante_configurado,
      'letra', coalesce(o ->> 'letra', c.comprobante_letra), 'encabezado', coalesce(o ->> 'encabezado', c.comprobante_encabezado),
      'mostrar_cliente', coalesce((o ->> 'mostrar_cliente')::boolean, c.comprobante_mostrar_cliente),
      'mostrar_vendedor', coalesce((o ->> 'mostrar_vendedor')::boolean, c.comprobante_mostrar_vendedor),
      'mostrar_marca', coalesce((o ->> 'mostrar_marca')::boolean, c.comprobante_mostrar_marca)),
    'leyenda', coalesce(v_doc ->> 'leyenda', o ->> 'leyenda', c.comprobante_leyenda), 'pie', coalesce(o ->> 'pie', v_doc ->> 'pie', c.comprobante_pie),
    'fiscal', v_fiscal);
end $$;

CREATE OR REPLACE FUNCTION public._comprobante_acceso(p_tipo text, p_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  select case p_tipo
    when 'venta' then exists (select 1 from ventas v where v.id = p_id and puede_ver_venta(v.usuario_id))
    when 'presupuesto' then exists (select 1 from presupuestos x where x.id = p_id and puede_ver_venta(x.usuario_id))
    when 'devolucion' then exists (select 1 from devoluciones d where d.id = p_id) and (tiene_permiso('ventas.registrar') or tiene_permiso('ventas.ver_todas') or tiene_permiso('clientes.ver'))
    when 'pedido' then exists (select 1 from pedidos x where x.id = p_id) and (tiene_permiso('pedidos.gestionar') or tiene_permiso('ventas.ver_todas'))
    else false end
$$;

CREATE OR REPLACE FUNCTION public.comprobante_de(p_tipo text, p_id bigint, p_con_enlace boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
declare v_doc jsonb;
begin
  if p_tipo not in ('venta', 'presupuesto', 'devolucion', 'pedido') then raise exception 'Ese tipo de comprobante no existe'; end if;
  if not _comprobante_acceso(p_tipo, p_id) then raise exception 'No tenés acceso a ese comprobante'; end if;
  v_doc := _comprobante_json(p_tipo, p_id);
  if p_con_enlace then v_doc := v_doc || jsonb_build_object('enlace', _comprobante_enlace(p_tipo, p_id)); end if;
  return v_doc;
end $$;

CREATE OR REPLACE FUNCTION public._comprobante_mail_html(p_doc jsonb, p_url text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $$
declare e jsonb := p_doc -> 'emisor'; v_color text := coalesce((select color_marca from configuracion_tienda), '#1d4ed8'); r jsonb; v_filas text := ''; v_totales text := '';
        v_marca text; v_legal text; f jsonb := p_doc -> 'fiscal'; v_fac boolean := coalesce(p_doc -> 'fiscal' ->> 'estado', '') = 'autorizada'; v_tit text; v_num text; v_cae text := ''; v_extra text := '';
begin
  v_tit := case when v_fac then (case when f ->> 'clase' = 'nota_credito' then 'Nota de crédito ' else 'Factura ' end) || (f ->> 'letra') else p_doc ->> 'titulo' end;
  v_num := case when v_fac then f ->> 'comprobante' else p_doc ->> 'numero' end;
  if v_fac then
    v_cae := '<p style="margin:4px 0 0 0;font-size:12px;color:#6b7280;">CAE ' || _html(f ->> 'cae') || ' · vence ' || to_char((f ->> 'cae_vence')::date, 'DD/MM/YYYY') || '</p>';
    if f ->> 'letra' = 'B' then v_extra := '<tr><td style="padding:3px 0;font-size:12px;color:#9ca3af;">IVA contenido</td><td align="right" style="padding:3px 0;font-size:12px;color:#9ca3af;">' || _dinero((f ->> 'iva')::numeric) || '</td></tr>'; end if;
  end if;
  v_marca := case when coalesce(e ->> 'logo_url', '') <> '' then '<img src="' || _html(e ->> 'logo_url') || '" alt="' || _html(e ->> 'nombre') || '" height="40" style="display:block;height:40px;width:auto;max-width:220px;border:0;">'
                  else '<span style="font-size:20px;font-weight:700;color:#111827;">' || _html(e ->> 'nombre') || '</span>' end;
  for r in select * from jsonb_array_elements(p_doc -> 'renglones') loop
    v_filas := v_filas || '<tr><td style="padding:8px 0;border-bottom:1px solid #eef0f3;font-size:14px;color:#111827;">' || _html(r ->> 'detalle')
      || '<br><span style="font-size:12px;color:#6b7280;">' || _html(r ->> 'variante') || case when r ->> 'promocion' is not null then ' · ' || _html(r ->> 'promocion') else '' end || '</span></td>'
      || '<td align="right" style="padding:8px 0 8px 12px;border-bottom:1px solid #eef0f3;font-size:14px;color:#111827;white-space:nowrap;">' || (r ->> 'cantidad')
      || case when (r ->> 'precio') is not null then ' × ' || _dinero((r ->> 'precio')::numeric) else ' u.' end || '<br><b>' || _dinero((r ->> 'subtotal')::numeric) || '</b></td></tr>';
  end loop;
  for r in select * from jsonb_array_elements(p_doc -> 'totales') loop
    v_totales := v_totales || '<tr><td style="padding:3px 0;font-size:' || case when (r ->> 'fuerte') = 'true' then '17px;font-weight:700' else '13px;color:#6b7280' end || ';">' || _html(r ->> 'rotulo')
      || '</td><td align="right" style="padding:3px 0;font-size:' || case when (r ->> 'fuerte') = 'true' then '17px;font-weight:700' else '13px;color:#6b7280' end || ';">' || _dinero((r ->> 'monto')::numeric) || '</td></tr>';
  end loop;
  v_legal := case when v_fac then 'Factura electrónica autorizada por ARCA. Régimen de Transparencia Fiscal al Consumidor (Ley 27.743).' || case when (f ->> 'pruebas') = 'true' then ' PRUEBA DE ARCA: sin validez.' else '' end
                  else _html(p_doc ->> 'leyenda') end || case when coalesce(e ->> 'razon_social', '') <> '' then '<br>' || _html(e ->> 'razon_social') || coalesce(' · CUIT ' || _html(e ->> 'cuit'), '') || coalesce(' · ' || _html(e ->> 'domicilio'), '') else '' end;
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' || _html(v_tit) || '</title></head>'
    || '<body style="margin:0;padding:0;background:#f5f6f8;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Helvetica,Arial,sans-serif;color:#111827;">'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;padding:24px 12px;"><tr><td align="center">'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;">'
    || '<tr><td style="padding:24px 28px 4px 28px;">' || v_marca || '</td></tr>'
    || '<tr><td style="padding:12px 28px 0 28px;"><h1 style="margin:0 0 4px 0;font-size:20px;line-height:1.3;">' || _html(v_tit) || ' ' || _html(v_num) || '</h1>'
    || '<p style="margin:0;font-size:13px;color:#6b7280;">' || to_char((p_doc ->> 'fecha')::timestamptz at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI') || '</p>' || v_cae || '</td></tr>'
    || '<tr><td style="padding:12px 28px 0 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">' || v_filas || '</table></td></tr>'
    || '<tr><td style="padding:10px 28px 0 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">' || v_totales || v_extra || '</table></td></tr>'
    || '<tr><td style="padding:20px 28px 0 28px;"><a href="' || _html(p_url) || '" style="display:block;background:' || v_color || ';color:#ffffff;text-decoration:none;text-align:center;font-weight:600;font-size:15px;padding:13px 20px;border-radius:10px;">' || case when v_fac then 'Ver o guardar la factura' else 'Ver o guardar el comprobante' end || '</a></td></tr>'
    || '<tr><td style="padding:16px 28px 24px 28px;font-size:12px;line-height:1.5;color:#9ca3af;">' || v_legal || '</td></tr>'
    || '</table></td></tr></table></body></html>';
end $$;

CREATE OR REPLACE FUNCTION public.enviar_comprobante_mail(p_tipo text, p_id bigint, p_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '45s'
AS $$
declare v_email text := lower(trim(coalesce(p_email, ''))); i integraciones; t configuracion_tienda; l datos_legales; v_doc jsonb; v_url text; v_enlace jsonb; r jsonb; v_msg text;
begin
  if not _comprobante_acceso(p_tipo, p_id) then raise exception 'No tenés acceso a ese comprobante'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Ese email no parece válido'; end if;
  select * into i from integraciones; select * into t from configuracion_tienda; select * into l from datos_legales;
  if not _correo_configurado(i) then
    raise exception 'Para mandar comprobantes por mail hay que conectar el correo (Integraciones → Correo)';
  end if;
  v_doc := _comprobante_json(p_tipo, p_id);
  v_enlace := _comprobante_enlace(p_tipo, p_id);
  -- Sin la dirección del sitio cargada, el link del mail no se puede armar
  v_url := v_enlace ->> 'url';
  if v_url is null then raise exception 'Falta la dirección del sitio en la instalación: no se puede armar el link del comprobante'; end if;
  r := _correo_enviar(v_email,
    case when v_doc -> 'fiscal' ->> 'estado' = 'autorizada' then (case when v_doc -> 'fiscal' ->> 'clase' = 'nota_credito' then 'Nota de crédito ' else 'Factura ' end) || (v_doc -> 'fiscal' ->> 'letra') || ' ' || (v_doc -> 'fiscal' ->> 'comprobante')
         else (v_doc ->> 'titulo') || ' ' || (v_doc ->> 'numero') end || ' · ' || t.nombre,
    _comprobante_mail_html(v_doc, v_url), l.email_contacto,
    jsonb_build_array(jsonb_build_object('nombre', 'Comprobante-' || coalesce(v_doc -> 'fiscal' ->> 'comprobante', v_doc ->> 'numero') || '.pdf', 'url', v_url || '/pdf')));
  if (r ->> 'ok') <> 'true' then
    v_msg := coalesce(r ->> 'error', 'No se pudo mandar el mail');
    insert into comprobante_envios (tipo, documento_id, canal, destino, estado, detalle) values (p_tipo, p_id, 'mail', v_email, 'error', v_msg);
    return jsonb_build_object('ok', false, 'error', v_msg);
  end if;
  insert into comprobante_envios (tipo, documento_id, canal, destino, estado) values (p_tipo, p_id, 'mail', v_email, 'enviado');
  return jsonb_build_object('ok', true);
end $$;

-- ── 7. Los avisos salen solos ────────────────────────────────────────────
-- Pedido nuevo → «recibido»; cada cambio de estado → su aviso. Al cierre de la transacción (con el total y los renglones ya cargados).
create function public._mail_aviso_pedido() returns trigger
language plpgsql security definer set search_path = public as $$
declare p pedidos; c clientes; v_clave text; v_vars jsonb; v_sitio text := coalesce((select sitio_url from integraciones), '');
begin
  select * into p from pedidos where id = new.id;
  select * into c from clientes where id = p.cliente_id;
  if c.email is null then return null; end if;
  if tg_op = 'INSERT' then v_clave := 'pedido_recibido';
  else
    v_clave := case p.estado
      when 'confirmado' then case when p.pagado_online then null else 'pedido_confirmado' end   -- si ya pagó, el aviso del pago dice lo mismo
      when 'preparado' then case when p.entrega = 'retiro' then 'pedido_listo' end
      when 'listo_retiro' then 'pedido_listo'
      when 'enviado' then 'pedido_enviado'
      when 'entregado' then 'pedido_entregado'
      when 'cancelado' then 'pedido_cancelado' end;
  end if;
  if v_clave is null then return null; end if;
  v_vars := _mail_vars_pedido(p.id);
  perform _mail_encolar(v_clave, c.email, v_vars, case when v_sitio <> '' then v_sitio || '/mi-cuenta' end, p.id, c.id, 'pedido', p.id);
  return null;
end $$;
create constraint trigger pedidos_mail_nuevo after insert on public.pedidos deferrable initially deferred for each row execute function public._mail_aviso_pedido();
create constraint trigger pedidos_mail_estado after update of estado on public.pedidos deferrable initially deferred
  for each row when (old.estado is distinct from new.estado) execute function public._mail_aviso_pedido();

-- Pago recibido (Mercado Pago o anotado a mano): con el comprobante en PDF
create function public._mail_aviso_pago() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_pedido bigint := case tg_table_name when 'pedidos' then new.id else new.pedido_id end; p pedidos; c clientes; v_sitio text := coalesce((select sitio_url from integraciones), '');
begin
  select * into p from pedidos where id = v_pedido;
  select * into c from clientes where id = p.cliente_id;
  if c.email is null or p.estado = 'cancelado' then return null; end if;
  perform _mail_encolar('pedido_pagado', c.email, _mail_vars_pedido(p.id), case when v_sitio <> '' then v_sitio || '/mi-cuenta' end, p.id, c.id, 'pedido', p.id);
  return null;
end $$;
create constraint trigger pedidos_mail_pagado after update of pagado_online on public.pedidos deferrable initially deferred
  for each row when (new.pagado_online and not old.pagado_online) execute function public._mail_aviso_pago();
create constraint trigger pedido_pagos_mail after insert on public.pedido_pagos deferrable initially deferred for each row execute function public._mail_aviso_pago();

-- Bienvenida: la primera vez que un cliente confirma su email
create function public._mail_bienvenida() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_sitio text := coalesce((select sitio_url from integraciones), ''); v_nombre text;
begin
  if not exists (select 1 from perfiles where id = new.id and rol = 'cliente') then return new; end if;
  v_nombre := coalesce(nullif(split_part(coalesce(new.raw_user_meta_data ->> 'nombre', (select nombre from perfiles where id = new.id), ''), ' ', 1), ''), 'Hola');
  perform _mail_encolar('bienvenida', new.email, jsonb_build_object('tienda', (select nombre from configuracion_tienda), 'nombre', v_nombre, 'sitio', v_sitio), nullif(v_sitio, ''));
  return new;
exception when others then return new;   -- un fallo acá nunca puede frenar la confirmación de la cuenta
end $$;
create trigger auth_users_bienvenida after update of email_confirmed_at on auth.users
  for each row when (old.email_confirmed_at is null and new.email_confirmed_at is not null) execute function public._mail_bienvenida();

-- ── Permisos de ejecución ───────────────────────────────────────────────
revoke execute on function public._mail_variables(text), public._mail_defecto(text), public._mail_texto(text, jsonb), public._mail_asunto(text, jsonb),
  public._mail_html(text, text, text, text, text, text, text, text), public._mail_validar(text, text), public._mail_vars_pedido(bigint),
  public._mail_encolar(text, text, jsonb, text, bigint, bigint, text, bigint), public._mails_procesar(), public._comprobante_pedido(bigint),
  public._mail_aviso_pedido(), public._mail_aviso_pago(), public._mail_bienvenida() from public, anon, authenticated;
revoke execute on function public.guardar_plantilla_mail(text, text, text, text, text, text, boolean, boolean), public.restaurar_plantilla_mail(text),
  public.vista_previa_mail(text, text, text, text, text, text), public.probar_plantilla_mail(text) from public, anon;
grant execute on function public.guardar_plantilla_mail(text, text, text, text, text, text, boolean, boolean), public.restaurar_plantilla_mail(text),
  public.vista_previa_mail(text, text, text, text, text, text), public.probar_plantilla_mail(text) to authenticated;
