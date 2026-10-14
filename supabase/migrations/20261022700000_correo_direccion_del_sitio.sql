-- «Guardar y aplicar» del correo también fija la dirección del sitio en Supabase Auth (site_url): los links de los mails de cuenta salían con http://localhost:3000.
-- Agrega, no rompe: es la misma función con un campo más.

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
  -- La dirección que llevan los links de los mails ({{ .SiteURL }}): si queda la de fábrica (localhost), el cliente recibe un link que no abre
  if coalesce(i.sitio_url, '') <> '' then
    v_cuerpo := v_cuerpo || jsonb_build_object('site_url', i.sitio_url,
      'uri_allow_list', array_to_string(array_remove(array[i.sitio_url || '/**', case when i.sitio_original is not null and i.sitio_original <> i.sitio_url then i.sitio_original || '/**' end], null), ','));
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

revoke execute on function public.cuentas_aplicar() from public, anon;
grant execute on function public.cuentas_aplicar() to authenticated;
