-- Primeros pasos: qué falta para dejar el local listo, en orden. Sale de lo que ya está cargado y de lo que se encendió en Parametrización:
-- cada integración encendida y sin configurar es un paso más (así la parametrización lleva a la configuración). Agrega, no rompe.

create function public.primeros_pasos() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb := '[]'; i integraciones; t configuracion_tienda; l datos_legales;
begin
  if not es_staff() then return null; end if;
  select * into i from integraciones; select * into t from configuracion_tienda; select * into l from datos_legales;

  -- clave, título, ruta, permiso con el que se hace, ¿ya está?, ¿es opcional?
  r := r || jsonb_build_array(jsonb_build_object('clave', 'parametrizacion', 'titulo', 'Elegí qué usa tu local', 'detalle', 'Devoluciones, pedidos, página web, Mercado Pago, WhatsApp… Encendé solo lo que usás.', 'ruta', '/admin/parametrizacion', 'permiso', 'equipo.modulos',
    'listo', exists (select 1 from modulos where cambiado_en is not null), 'opcional', false));
  r := r || jsonb_build_array(jsonb_build_object('clave', 'identidad', 'titulo', 'Poné el logo de tu local', 'detalle', 'Sale en la tienda, los comprobantes y los mails.', 'ruta', '/admin/tienda', 'permiso', 'tienda.editar',
    'listo', t.logo_url is not null, 'opcional', false));
  r := r || jsonb_build_array(jsonb_build_object('clave', 'legales', 'titulo', 'Cargá los datos legales', 'detalle', 'Razón social, CUIT y domicilio: van en los comprobantes y al pie de la tienda.', 'ruta', '/admin/tienda/legales', 'permiso', 'tienda.editar',
    'listo', l.razon_social is not null and l.cuit is not null and l.domicilio_legal is not null, 'opcional', false));
  r := r || jsonb_build_array(jsonb_build_object('clave', 'productos', 'titulo', 'Cargá tus productos', 'detalle', 'Con sus talles y colores.', 'ruta', '/admin/productos', 'permiso', 'productos.editar',
    'listo', exists (select 1 from productos where activo), 'opcional', false));
  if _modulo_activo('compras') then
    r := r || jsonb_build_array(jsonb_build_object('clave', 'stock', 'titulo', 'Cargá el stock inicial', 'detalle', 'Con una compra, por curva o por bulto, o con un ajuste de inventario.', 'ruta', '/admin/compras/nueva', 'permiso', 'compras.registrar',
      'listo', exists (select 1 from stock where cantidad > 0), 'opcional', false));
  end if;
  if _modulo_activo('impresion') then
    r := r || jsonb_build_array(jsonb_build_object('clave', 'impresion', 'titulo', 'Elegí cómo se imprimen los comprobantes', 'detalle', 'Papel, ticket o A4, y qué lleva.', 'ruta', '/admin/impresion', 'permiso', 'tablas.editar',
      'listo', coalesce((select comprobante_configurado from configuracion_impresion limit 1), false), 'opcional', false));
  end if;
  r := r || jsonb_build_array(jsonb_build_object('clave', 'equipo', 'titulo', 'Sumá a tu equipo', 'detalle', 'Vendedores y encargados, cada uno con su rol.', 'ruta', '/admin/equipo', 'permiso', 'equipo.personas',
    'listo', (select count(*) from perfiles where rol = 'staff') > 1, 'opcional', true));

  -- Lo que se encendió en Parametrización y falta configurar
  if _modulo_activo('integraciones/mercadopago') and i.mp_access_token is null then
    r := r || jsonb_build_array(jsonb_build_object('clave', 'mercadopago', 'titulo', 'Conectá Mercado Pago', 'detalle', 'Access Token y clave de las notificaciones.', 'ruta', '/admin/integraciones/mercadopago', 'permiso', 'tienda.editar', 'listo', false, 'opcional', false)); end if;
  if _modulo_activo('integraciones/whatsapp') and not (i.wa_access_token is not null and i.wa_phone_number_id is not null and i.wa_app_secret is not null) then
    r := r || jsonb_build_array(jsonb_build_object('clave', 'whatsapp', 'titulo', 'Conectá WhatsApp', 'detalle', 'Las claves de Meta y el número del local.', 'ruta', '/admin/integraciones/whatsapp', 'permiso', 'tienda.editar', 'listo', false, 'opcional', false)); end if;
  if _modulo_activo('integraciones/ia') and i.gemini_api_key is null then
    r := r || jsonb_build_array(jsonb_build_object('clave', 'ia', 'titulo', 'Cargá la clave de Gemini', 'detalle', 'Para que el bot conteste con datos del local.', 'ruta', '/admin/integraciones/ia', 'permiso', 'tienda.editar', 'listo', false, 'opcional', false)); end if;
  if _modulo_activo('integraciones/instagram') and i.ig_token is null then
    r := r || jsonb_build_array(jsonb_build_object('clave', 'instagram', 'titulo', 'Conectá Instagram', 'detalle', 'Necesita una cuenta profesional.', 'ruta', '/admin/integraciones/instagram', 'permiso', 'tienda.editar', 'listo', false, 'opcional', false)); end if;
  if _modulo_activo('integraciones/correo') and i.smtp_host is null then
    r := r || jsonb_build_array(jsonb_build_object('clave', 'correo', 'titulo', 'Conectá el correo', 'detalle', 'Para que los clientes reciban sus mails.', 'ruta', '/admin/integraciones/correo', 'permiso', 'equipo.administrar', 'listo', false, 'opcional', false)); end if;
  if _modulo_activo('integraciones/dominio') and not exists (select 1 from dominios where principal) then
    r := r || jsonb_build_array(jsonb_build_object('clave', 'dominio', 'titulo', 'Conectá tu dominio', 'detalle', 'La tienda en tu propia dirección.', 'ruta', '/admin/integraciones/dominio', 'permiso', 'equipo.administrar', 'listo', false, 'opcional', false)); end if;
  if _modulo_activo('integraciones/arca') and not (i.arca_cert_homologacion is not null or i.arca_cert_produccion is not null) then
    r := r || jsonb_build_array(jsonb_build_object('clave', 'arca', 'titulo', 'Conectá ARCA', 'detalle', 'El certificado de tu CUIT, primero en pruebas.', 'ruta', '/admin/integraciones/arca', 'permiso', 'equipo.administrar', 'listo', false, 'opcional', false)); end if;
  if _modulo_activo('integraciones/envios') and not exists (select 1 from zonas_envio) then
    r := r || jsonb_build_array(jsonb_build_object('clave', 'envios', 'titulo', 'Cargá tus zonas de envío', 'detalle', 'Con su precio.', 'ruta', '/admin/integraciones/envios', 'permiso', 'tienda.editar', 'listo', false, 'opcional', false)); end if;

  return coalesce((select jsonb_agg(x || jsonb_build_object('puede', tiene_permiso(x ->> 'permiso')) order by ord) from jsonb_array_elements(r) with ordinality as e(x, ord)), '[]'::jsonb);
end $$;

revoke execute on function public.primeros_pasos() from public, anon;
grant execute on function public.primeros_pasos() to authenticated;
