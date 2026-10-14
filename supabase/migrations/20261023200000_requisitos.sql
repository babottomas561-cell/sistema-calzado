-- Requisitos: qué falta antes de hacer algo (vender, facturar, cobrar online, publicar la tienda, mandar mails).
-- Una sola función dice qué falta, si frena o solo avisa, dónde se arregla y si quien mira tiene permiso para arreglarlo.
-- Las pantallas muestran el cartel; lo que frena de verdad lo siguen controlando las funciones de la base de cada operación.

create function public.requisitos(p_accion text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  r jsonb := '[]'::jsonb; i integraciones; f configuracion_fiscal; l datos_legales; t configuracion_tienda; im configuracion_impresion;
begin
  if not es_staff() then return null; end if;
  select * into i from integraciones; select * into f from configuracion_fiscal; select * into l from datos_legales;
  select * into t from configuracion_tienda; select * into im from configuracion_impresion;

  if p_accion = 'vender' then
    if not exists (select 1 from medios_pago where activo and en_mostrador) then
      r := r || jsonb_build_array(jsonb_build_object('clave', 'sin_medios', 'bloquea', true, 'mensaje', 'No hay medios de pago para el mostrador.', 'ruta', '/admin/tablas', 'permiso', 'tablas.editar'));
    end if;
    if not coalesce(im.comprobante_configurado, false) then
      r := r || jsonb_build_array(jsonb_build_object('clave', 'sin_impresion', 'bloquea', false, 'mensaje', 'Falta configurar cómo se imprimen los comprobantes (no se imprime hasta guardarlo una vez).', 'ruta', '/admin/impresion', 'permiso', 'tablas.editar'));
    end if;
    if t.tarjetas_modo = 'vinculado' and not (coalesce(i.mp_point_token, i.mp_access_token) is not null and coalesce(i.mp_point_secreto, i.mp_webhook_secret) is not null
        and exists (select 1 from point_terminales where por_defecto and activa and modo = 'PDV')) then
      r := r || jsonb_build_array(jsonb_build_object('clave', 'sin_posnet', 'bloquea', false, 'mensaje', 'La regla pide cobrar las tarjetas con el posnet de Mercado Pago y no hay uno disponible: hoy no se puede cobrar con tarjeta.', 'ruta', '/admin/integraciones/mercadopago', 'permiso', 'tienda.editar'));
    end if;

  elsif p_accion = 'facturar' then
    if not coalesce(f.activa, false) then
      r := r || jsonb_build_array(jsonb_build_object('clave', 'arca_apagada', 'bloquea', true, 'mensaje', 'La facturación electrónica (ARCA) no está activada.', 'ruta', '/admin/integraciones/arca', 'permiso', 'equipo.administrar'));
    else
      if coalesce(trim(l.cuit), '') = '' or coalesce(trim(l.razon_social), '') = '' or coalesce(trim(l.condicion_iva), '') = '' then
        r := r || jsonb_build_array(jsonb_build_object('clave', 'datos_fiscales', 'bloquea', true, 'mensaje', 'Faltan los datos fiscales del comercio (CUIT, razón social o condición frente al IVA).', 'ruta', '/admin/tienda/legales', 'permiso', 'tienda.editar'));
      end if;
      if (case f.ambiente when 'produccion' then i.arca_cert_produccion else i.arca_cert_homologacion end) is null then
        r := r || jsonb_build_array(jsonb_build_object('clave', 'sin_certificado', 'bloquea', true, 'mensaje', 'Falta el certificado de ARCA de este ambiente.', 'ruta', '/admin/integraciones/arca', 'permiso', 'equipo.administrar'));
      end if;
      if not exists (select 1 from puntos_venta_fiscales where ambiente = f.ambiente and activo and baja is not true) then
        r := r || jsonb_build_array(jsonb_build_object('clave', 'sin_punto_venta', 'bloquea', true, 'mensaje', 'No hay un punto de venta de ARCA activo.', 'ruta', '/admin/integraciones/arca', 'permiso', 'equipo.administrar'));
      end if;
    end if;

  elsif p_accion = 'cobrar_online' then
    if i.mp_access_token is null then
      r := r || jsonb_build_array(jsonb_build_object('clave', 'mp_sin_token', 'bloquea', true, 'mensaje', 'Falta el Access Token de Mercado Pago.', 'ruta', '/admin/integraciones/mercadopago', 'permiso', 'tienda.editar'));
    end if;
    if i.mp_webhook_secret is null then
      r := r || jsonb_build_array(jsonb_build_object('clave', 'mp_sin_secreto', 'bloquea', true, 'mensaje', 'Falta la clave secreta de las notificaciones: sin ella no se confirman los pagos.', 'ruta', '/admin/integraciones/mercadopago', 'permiso', 'tienda.editar'));
    end if;
    if i.mp_access_token is not null and i.mp_webhook_url is null then
      r := r || jsonb_build_array(jsonb_build_object('clave', 'mp_webhook', 'bloquea', false, 'mensaje', 'Confirmá que cargaste la dirección de avisos en Mercado Pago.', 'ruta', '/admin/integraciones/mercadopago', 'permiso', 'tienda.editar'));
    end if;
    if t.mp_modo = 'no' then
      r := r || jsonb_build_array(jsonb_build_object('clave', 'mp_apagado', 'bloquea', false, 'mensaje', 'La tienda todavía no ofrece Mercado Pago a los clientes.', 'ruta', '/admin/integraciones/mercadopago', 'permiso', 'tienda.editar'));
    end if;

  elsif p_accion = 'enviar_mails' then
    if i.smtp_host is null or i.smtp_clave is null then
      r := r || jsonb_build_array(jsonb_build_object('clave', 'sin_correo', 'bloquea', true, 'mensaje', 'El correo no está conectado: los clientes no reciben mails.', 'ruta', '/admin/integraciones/correo', 'permiso', 'equipo.administrar'));
    end if;

  elsif p_accion = 'publicar_tienda' then
    if coalesce(trim(l.cuit), '') = '' or coalesce(trim(l.razon_social), '') = '' then
      r := r || jsonb_build_array(jsonb_build_object('clave', 'datos_legales', 'bloquea', true, 'mensaje', 'Faltan los datos legales del comercio (se muestran al pie y se piden para publicar términos).', 'ruta', '/admin/tienda/legales', 'permiso', 'tienda.editar'));
    end if;
    if not exists (select 1 from documentos_legales where tipo = 'terminos') or not exists (select 1 from documentos_legales where tipo = 'privacidad') then
      r := r || jsonb_build_array(jsonb_build_object('clave', 'sin_documentos', 'bloquea', false, 'mensaje', 'Faltan publicar los términos o la política de privacidad.', 'ruta', '/admin/tienda/legales', 'permiso', 'tienda.editar'));
    end if;
    if not exists (select 1 from medios_pago where activo and en_tienda) then
      r := r || jsonb_build_array(jsonb_build_object('clave', 'sin_medios_tienda', 'bloquea', true, 'mensaje', 'No hay medios de pago para la tienda.', 'ruta', '/admin/tablas', 'permiso', 'tablas.editar'));
    end if;
    if not exists (select 1 from v_catalogo) then
      r := r || jsonb_build_array(jsonb_build_object('clave', 'sin_catalogo', 'bloquea', true, 'mensaje', 'No hay productos con stock para mostrar en la tienda.', 'ruta', '/admin/productos', 'permiso', 'productos.editar'));
    end if;
    if not exists (select 1 from zonas_envio where activo) then
      r := r || jsonb_build_array(jsonb_build_object('clave', 'sin_zonas', 'bloquea', false, 'mensaje', 'No hay zonas de envío: solo se podrá retirar en el local.', 'ruta', '/admin/integraciones/envios', 'permiso', 'tienda.editar'));
    end if;
  else
    raise exception 'Acción desconocida: %', p_accion;
  end if;

  -- cada ítem dice si quien mira lo puede arreglar
  return coalesce((select jsonb_agg(x || jsonb_build_object('puede', tiene_permiso(x ->> 'permiso')) order by (x ->> 'bloquea')::boolean desc) from jsonb_array_elements(r) x), '[]'::jsonb);
end $$;

revoke execute on function public.requisitos(text) from public, anon;
grant execute on function public.requisitos(text) to authenticated;
