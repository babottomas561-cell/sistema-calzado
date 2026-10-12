-- Identidad de la tienda: logo (claro y para fondo oscuro) y color de la marca, configurables en Tienda online.
-- Se suben al bucket público «tienda» (como el ícono). El color pinta botones y detalles de la tienda y del panel y los
-- mails (la app valida que el texto blanco se lea sobre él). Sin logo se muestra el nombre en letras; sin color, el de siempre.
alter table public.configuracion_tienda
  add column logo_url         text check (logo_url is null or logo_url ~ '^https?://'),
  add column logo_ruta        text,
  add column logo_oscuro_url  text check (logo_oscuro_url is null or logo_oscuro_url ~ '^https?://'),   -- versión clara, para la cabecera sobre una foto
  add column logo_oscuro_ruta text,
  add column color_marca      text check (color_marca is null or color_marca ~ '^#[0-9a-f]{6}$');

-- Los mails usan el logo y el color de la tienda (sin logo, la inicial sobre el color)
drop function public._correo_plantilla(text, text);
create function public._correo_plantilla(p_tipo text, p_tienda text, p_color text default '#1d4ed8', p_logo text default null) returns jsonb
language plpgsql immutable set search_path = public as $$
declare
  v_n text := replace(replace(replace(replace(p_tienda, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;');
  v_ini text := upper(left(regexp_replace(p_tienda, '[^A-Za-z0-9]', '', 'g'), 2));
  v_tipo text; v_asunto text; v_titulo text; v_texto text; v_boton text; v_pie text; v_siguiente text := '';
begin
  case p_tipo
    when 'confirmacion' then v_tipo := 'signup'; v_asunto := 'Confirmá tu email - ' || p_tienda; v_titulo := 'Confirmá tu email';
      v_texto := '¡Hola! Gracias por crear tu cuenta en <b>' || v_n || '</b>. Tocá el botón para confirmar tu email y ya vas a poder hacer pedidos y seguirlos desde tu cuenta.';
      v_boton := 'Confirmar mi email'; v_pie := 'Si no creaste una cuenta en ' || v_n || ', ignorá este mail: sin confirmar, la cuenta no se activa.';
    when 'recuperar' then v_tipo := 'recovery'; v_asunto := 'Cambiá tu contraseña - ' || p_tienda; v_titulo := 'Cambiá tu contraseña'; v_siguiente := '&siguiente=/nueva-clave';
      v_texto := 'Pediste cambiar la contraseña de tu cuenta en <b>' || v_n || '</b>. Tocá el botón para elegir una nueva. El link vale por una hora.';
      v_boton := 'Elegir nueva contraseña'; v_pie := 'Si no lo pediste vos, ignorá este mail: tu contraseña sigue siendo la misma.';
    when 'cambio_email' then v_tipo := 'email_change'; v_asunto := 'Confirmá tu nuevo email - ' || p_tienda; v_titulo := 'Confirmá tu nuevo email';
      v_texto := 'Pediste cambiar el email de tu cuenta en <b>' || v_n || '</b>. Tocá el botón para confirmar el cambio.';
      v_boton := 'Confirmar el cambio'; v_pie := 'Si no lo pediste vos, ignorá este mail.';
    else v_tipo := 'invite'; v_asunto := 'Te invitaron a ' || p_tienda; v_titulo := 'Te invitaron'; v_siguiente := '&siguiente=/nueva-clave';
      v_texto := 'Te sumaron a <b>' || v_n || '</b>. Tocá el botón para aceptar la invitación y elegir tu contraseña.';
      v_boton := 'Aceptar la invitación'; v_pie := 'Si no esperabas este mail, ignorálo.';
  end case;
  return jsonb_build_object('asunto', v_asunto, 'html',
    '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' || v_titulo || '</title></head>'
    || '<body style="margin:0;padding:0;background:#f5f6f8;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Helvetica,Arial,sans-serif;color:#111827;">'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;padding:24px 12px;"><tr><td align="center">'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;">'
    || '<tr><td style="padding:28px 28px 8px 28px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr>'
    || case when p_logo is not null then '<td><img src="' || p_logo || '" alt="' || v_n || '" height="40" style="display:block;height:40px;width:auto;max-width:200px;border:0;"></td>'
         else '<td style="background:' || p_color || ';border-radius:10px;width:36px;height:36px;text-align:center;color:#ffffff;font-weight:700;font-size:16px;">' || v_ini || '</td>'
              || '<td style="padding-left:10px;font-size:18px;font-weight:700;color:#111827;">' || v_n || '</td>' end
    || '</tr></table></td></tr>'
    || '<tr><td style="padding:16px 28px 0 28px;"><h1 style="margin:0 0 8px 0;font-size:22px;line-height:1.3;color:#111827;">' || v_titulo || '</h1>'
    || '<p style="margin:0 0 20px 0;font-size:15px;line-height:1.55;color:#374151;">' || v_texto || '</p></td></tr>'
    || '<tr><td style="padding:0 28px;"><a href="{{ .SiteURL }}/auth/confirmar?token_hash={{ .TokenHash }}&type=' || v_tipo || v_siguiente
    || '" style="display:block;background:' || p_color || ';color:#ffffff;text-decoration:none;text-align:center;font-weight:600;font-size:16px;padding:14px 20px;border-radius:10px;">' || v_boton || '</a></td></tr>'
    || '<tr><td style="padding:20px 28px 28px 28px;"><p style="margin:0 0 12px 0;font-size:13px;line-height:1.5;color:#6b7280;">' || v_pie || '</p>'
    || '<p style="margin:0;font-size:12px;line-height:1.5;color:#9ca3af;">Si el botón no funciona, copiá este link en el navegador:<br>'
    || '<span style="word-break:break-all;color:#6b7280;">{{ .SiteURL }}/auth/confirmar?token_hash={{ .TokenHash }}&amp;type=' || v_tipo || v_siguiente || '</span></p></td></tr>'
    || '</table><p style="margin:16px 0 0 0;font-size:12px;color:#9ca3af;">' || v_n || '</p></td></tr></table></body></html>');
end $$;


-- Pasarle a Supabase Auth todo junto: confirmación de email, reglas de contraseña, SMTP y plantillas.
-- Sin la conexión técnica (token de Supabase) no puede: avisa y la pantalla muestra qué cambiar a mano.
create or replace function public.cuentas_aplicar() returns jsonb
language plpgsql security definer set search_path = public as $$
declare i integraciones; c configuracion_cuentas; t configuracion_tienda; r jsonb; v_cuerpo jsonb; v_carac text; v_msg text;
begin
  if not tiene_permiso('equipo.administrar') then raise exception 'Solo el administrador configura las cuentas'; end if;
  select * into i from integraciones; select * into c from configuracion_cuentas; select * into t from configuracion_tienda;
  if i.supabase_token is null or i.supabase_ref is null then
    return jsonb_build_object('aplicado', false, 'motivo', 'sin_conexion');
  end if;
  v_carac := case when c.clave_exige_numero or c.clave_exige_mayuscula then
      array_to_string(array_remove(array['abcdefghijklmnopqrstuvwxyz', case when c.clave_exige_mayuscula then 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' end,
                                         case when c.clave_exige_numero then '0123456789' end], null), ':') else '' end;
  v_cuerpo := jsonb_build_object(
    'mailer_autoconfirm', not c.confirmar_email,
    'password_min_length', c.clave_min,
    'password_required_characters', v_carac,
    'mailer_subjects_confirmation', _correo_plantilla('confirmacion', t.nombre, coalesce(t.color_marca, '#1d4ed8'), t.logo_url) ->> 'asunto',
    'mailer_templates_confirmation_content', _correo_plantilla('confirmacion', t.nombre, coalesce(t.color_marca, '#1d4ed8'), t.logo_url) ->> 'html',
    'mailer_subjects_recovery', _correo_plantilla('recuperar', t.nombre, coalesce(t.color_marca, '#1d4ed8'), t.logo_url) ->> 'asunto',
    'mailer_templates_recovery_content', _correo_plantilla('recuperar', t.nombre, coalesce(t.color_marca, '#1d4ed8'), t.logo_url) ->> 'html',
    'mailer_subjects_email_change', _correo_plantilla('cambio_email', t.nombre, coalesce(t.color_marca, '#1d4ed8'), t.logo_url) ->> 'asunto',
    'mailer_templates_email_change_content', _correo_plantilla('cambio_email', t.nombre, coalesce(t.color_marca, '#1d4ed8'), t.logo_url) ->> 'html',
    'mailer_subjects_invite', _correo_plantilla('invitacion', t.nombre, coalesce(t.color_marca, '#1d4ed8'), t.logo_url) ->> 'asunto',
    'mailer_templates_invite_content', _correo_plantilla('invitacion', t.nombre, coalesce(t.color_marca, '#1d4ed8'), t.logo_url) ->> 'html');
  if i.smtp_host is not null and i.smtp_puerto is not null and i.smtp_usuario is not null and i.smtp_clave is not null and i.smtp_email is not null then
    v_cuerpo := v_cuerpo || jsonb_build_object('smtp_host', i.smtp_host, 'smtp_port', i.smtp_puerto::text, 'smtp_user', i.smtp_usuario,
      'smtp_pass', i.smtp_clave, 'smtp_admin_email', i.smtp_email, 'smtp_sender_name', coalesce(i.smtp_nombre, t.nombre), 'smtp_max_frequency', 30);
  end if;
  r := _pedir_http('PATCH', 'https://api.supabase.com/v1/projects/' || i.supabase_ref || '/config/auth',
         jsonb_build_object('Authorization', 'Bearer ' || i.supabase_token), 'application/json', v_cuerpo::text);
  if (r ->> 'status')::int not between 200 and 299 then
    v_msg := 'Supabase no aceptó los cambios (' || (r ->> 'status') || '): ' || left(coalesce(r -> 'cuerpo' ->> 'message', r ->> 'cuerpo', ''), 200);
    update integraciones set correo_aplicado_error = v_msg where unica;
    raise exception '%', v_msg;
  end if;
  update integraciones set correo_aplicado_en = now(), correo_aplicado_error = null where unica;
  return jsonb_build_object('aplicado', true, 'smtp', i.smtp_host is not null);
end $$;


revoke execute on function public._correo_plantilla(text, text, text, text) from public, anon, authenticated;
revoke execute on function public.cuentas_aplicar() from public, anon;
grant  execute on function public.cuentas_aplicar() to authenticated;
