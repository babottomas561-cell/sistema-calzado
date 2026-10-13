-- Formato de impresión de cada comprobante: factura, nota de crédito, comprobante interno, presupuesto y devolución pueden salir distinto
-- (otro papel, otras copias, qué lleva, otros textos). Lo que no se configura para un comprobante sale como el general.
-- Prioridad: lo del comprobante > lo de la persona (Impresión → Por persona) > lo general.
-- También: la devolución de una venta facturada se imprime como su nota de crédito (letra, CAE, QR de ARCA y la factura que corrige).

create function public._por_tipo_valido(p jsonb) returns boolean language sql immutable as $$
  select jsonb_typeof(p) = 'object'
     and (select bool_and(k in ('factura', 'nota_credito', 'interno', 'presupuesto', 'devolucion') and jsonb_typeof(p -> k) = 'object') from jsonb_object_keys(p) k) is not false
$$;
alter table public.configuracion_impresion add column por_tipo jsonb not null default '{}' check (public._por_tipo_valido(por_tipo));

-- La nota de crédito de una devolución, para dibujarla
create function public._nota_credito_fiscal(p_devolucion bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare n facturas; f facturas; l datos_legales; v_qr jsonb;
begin
  select * into n from facturas where devolucion_id = p_devolucion and estado <> 'cancelada' order by id desc limit 1;
  if not found then return null; end if;
  select * into f from facturas where id = n.factura_id;
  select * into l from datos_legales;
  if n.estado = 'autorizada' then
    v_qr := jsonb_build_object('ver', 1, 'fecha', to_char(n.fecha, 'YYYY-MM-DD'), 'cuit', regexp_replace(coalesce(l.cuit, ''), '\D', '', 'g')::bigint, 'ptoVta', n.punto_venta,
      'tipoCmp', n.cbte_tipo, 'nroCmp', n.numero, 'importe', n.total, 'moneda', 'PES', 'ctz', 1, 'tipoDocRec', n.doc_tipo,
      'nroDocRec', nullif(regexp_replace(n.doc_nro, '\D', '', 'g'), '')::bigint, 'tipoCodAut', 'E', 'codAut', n.cae::bigint);
  end if;
  return jsonb_build_object(
    'clase', 'nota_credito', 'estado', n.estado, 'letra', n.letra, 'codigo', lpad(n.cbte_tipo::text, 3, '0'), 'comprobante', n.comprobante, 'fecha', n.fecha,
    'cae', n.cae, 'cae_vence', n.cae_vence, 'receptor', n.receptor, 'doc_tipo', n.doc_tipo, 'doc_nro', n.doc_nro,
    'condicion_receptor', case n.condicion_iva_receptor when 1 then 'IVA Responsable Inscripto' when 4 then 'IVA Sujeto Exento' when 6 then 'Responsable Monotributo'
      when 15 then 'IVA No Alcanzado' else 'Consumidor final' end,
    'domicilio_receptor', (select concat_ws(', ', nullif(domicilio_fiscal, ''), nullif(localidad_fiscal, ''), nullif(provincia, '')) from clientes where id = n.cliente_id),
    'neto', n.neto, 'iva', n.iva, 'detalle_iva', n.detalle_iva, 'total', n.total,
    'iva_contenido_en_c', (select iva_contenido_en_c from configuracion_fiscal), 'pruebas', n.ambiente = 'homologacion',
    'qr', case when v_qr is not null then 'https://www.afip.gob.ar/fe/qr/?p=' || translate(encode(convert_to(v_qr::text, 'UTF8'), 'base64'), E'\n', '') end,
    'asociada', case when f.comprobante is not null then 'Factura ' || f.letra || ' ' || f.comprobante end,
    'emisor', jsonb_build_object('razon_social', l.razon_social, 'cuit', l.cuit, 'condicion_iva', l.condicion_iva, 'ingresos_brutos', l.ingresos_brutos,
      'inicio_actividades', l.inicio_actividades, 'domicilio', l.domicilio_legal),
    'nota_credito', null);
end $$;

-- El comprobante con el formato que le toca (según qué es) y sus datos fiscales
create or replace function public._comprobante_json(p_tipo text, p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t configuracion_tienda; l datos_legales; c configuracion_impresion; u impresion_por_usuario; v_doc jsonb; v_fiscal jsonb; v_clave text; o jsonb;
begin
  v_doc := case p_tipo when 'venta' then _comprobante_venta(p_id) when 'presupuesto' then _comprobante_presupuesto(p_id) when 'devolucion' then _comprobante_devolucion(p_id) end;
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

revoke execute on function public._nota_credito_fiscal(bigint) from public, anon, authenticated;
