-- Configuración (etapa 4 de docs/CONFIGURACION_Y_PERMISOS.md): qué partes del sistema ya están configuradas, para las tarjetas de /admin/configuracion.
-- Solo devuelve «sí / no» (nunca un valor ni un secreto) y solo al equipo.
create function public.estado_configuracion() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare i integraciones; t configuracion_tienda; l datos_legales;
begin
  if not es_staff() then raise exception 'Solo el equipo ve la configuración'; end if;
  select * into i from integraciones;
  select * into t from configuracion_tienda;
  select * into l from datos_legales;
  return jsonb_build_object(
    'legales', l.razon_social is not null and l.cuit is not null and l.domicilio_legal is not null,
    'identidad', t.logo_url is not null,
    'impresion', coalesce((select comprobante_configurado from configuracion_impresion limit 1), false),
    'whatsapp', i.wa_access_token is not null and i.wa_phone_number_id is not null and i.wa_app_secret is not null,
    'ia', i.gemini_api_key is not null,
    'mercadopago', i.mp_access_token is not null,
    'instagram', i.ig_token is not null,
    'correo', i.smtp_host is not null,
    'dominio', exists (select 1 from dominios where principal),
    'arca', i.arca_cert_homologacion is not null or i.arca_cert_produccion is not null,
    'envios', exists (select 1 from zonas_envio),
    'contabilidad', (select inicio from configuracion_contable limit 1) is not null,
    'modulos_apagados', (select count(*) from modulos where not activo),
    'pin', exists (select 1 from pines_autorizacion where usuario_id = auth.uid())
  );
end $$;
revoke execute on function public.estado_configuracion() from public, anon;
grant execute on function public.estado_configuracion() to authenticated;
