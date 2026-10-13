-- Comprobantes: impresión (ticket 58/80 mm y A4), link privado para verlos en el celular y envío manual por mail.
--
-- Un solo armado para los tres: la base arma el comprobante como un JSON ordenado (`_comprobante_json`) para una venta, un presupuesto o una
-- devolución, SIN costos ni notas internas. Lo usan: la pantalla de impresión del panel, la página pública del cliente (`/comprobante/<token>`) y el mail.
--   · Link privado: cada comprobante tiene un token largo y al azar (`enlaces_comprobante`, sin políticas: solo lo tocan las funciones).
--     Quien tiene el link lo ve sin ingresar; se puede invalidar y crear otro (`renovar_enlace_comprobante`).
--   · Mail: sale desde la base por la API de Resend (la misma clave del SMTP del local, regla 16) y queda registrado en `comprobante_envios`.
--   · WhatsApp: se abre con el link desde el panel (wa.me, sin costo); acá solo queda el registro de que se compartió.
--   · Es un comprobante interno, sin validez fiscal (no es una factura de ARCA): la leyenda es configurable.

-- ── Configuración de impresión de los comprobantes ───────────────────
alter table public.configuracion_impresion
  add column comprobante_formato        text not null default 'ticket80' check (comprobante_formato in ('ticket80', 'ticket58', 'a4')),
  add column comprobante_logo           boolean not null default true,
  add column comprobante_datos_legales  boolean not null default true,      -- razón social, CUIT y domicilio arriba
  add column comprobante_qr             boolean not null default true,      -- QR con el link al comprobante digital
  add column comprobante_codigo_barras  boolean not null default true,      -- Code 128 del número: se escanea en cambios y devoluciones
  add column comprobante_pie            text check (char_length(comprobante_pie) <= 200) default '¡Gracias por tu compra!',
  add column comprobante_leyenda        text not null default 'Comprobante interno, sin validez fiscal.' check (char_length(comprobante_leyenda) <= 200),
  add column comprobante_copias         int not null default 1 check (comprobante_copias between 1 and 5),
  -- Al registrar una venta: 'automatica' imprime sola · 'opcional' ofrece imprimir o mandar · 'manual' no ofrece nada (se imprime o manda desde la venta)
  add column modo_impresion             text not null default 'opcional' check (modo_impresion in ('automatica', 'opcional', 'manual')),
  add column comprobante_letra          text not null default 'normal' check (comprobante_letra in ('chica', 'normal', 'grande')),
  add column comprobante_encabezado     text check (char_length(comprobante_encabezado) <= 160),   -- una línea propia arriba (Instagram, horario…)
  add column comprobante_mostrar_cliente  boolean not null default true,
  add column comprobante_mostrar_vendedor boolean not null default true,
  add column comprobante_mostrar_marca    boolean not null default true,
  add column comprobante_configurado    boolean not null default false;     -- alguien eligió y guardó el papel: hasta entonces la caja avisa y no imprime

-- ── Links privados y registro de envíos ──────────────────────────────
create table public.enlaces_comprobante (
  id           bigint generated always as identity primary key,
  token        text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  tipo         text not null check (tipo in ('venta', 'presupuesto', 'devolucion')),
  documento_id bigint not null,
  creado_en    timestamptz not null default now(),
  creado_por   uuid references auth.users (id) on delete set null,
  revocado     boolean not null default false,
  vistas       int not null default 0,                 -- cuántas veces lo abrió quien lo recibió
  ultima_vista timestamptz,
  unique (tipo, documento_id)
);
create index enlaces_comprobante_creado_por_idx on public.enlaces_comprobante (creado_por);
alter table public.enlaces_comprobante enable row level security;
revoke all on public.enlaces_comprobante from anon, authenticated;        -- el token es el secreto: solo las funciones lo leen
create policy "nadie lee los links" on public.enlaces_comprobante for select to authenticated using (false);

create table public.comprobante_envios (
  id           bigint generated always as identity primary key,
  tipo         text not null check (tipo in ('venta', 'presupuesto', 'devolucion')),
  documento_id bigint not null,
  canal        text not null check (canal in ('mail', 'whatsapp', 'enlace')),
  destino      text,
  estado       text not null check (estado in ('enviado', 'error', 'abierto')),   -- «abierto»: se abrió WhatsApp o se copió el link (no se sabe si lo mandó)
  detalle      text,
  enviado_por  uuid default auth.uid() references auth.users (id) on delete set null,
  creado_en    timestamptz not null default now()
);
create index comprobante_envios_documento_idx on public.comprobante_envios (tipo, documento_id, creado_en desc);
create index comprobante_envios_enviado_por_idx on public.comprobante_envios (enviado_por);
alter table public.comprobante_envios enable row level security;
create policy "equipo ve los envios" on public.comprobante_envios for select to authenticated using (es_staff());

-- ── Formatos para texto ──────────────────────────────────────────────
create function public._dinero(p_monto numeric) returns text
language sql immutable set search_path = public as $$
  select case when coalesce(p_monto, 0) < 0 then '−' else '' end || '$ ' || translate(
    case when abs(coalesce(p_monto, 0)) = trunc(abs(coalesce(p_monto, 0))) then to_char(abs(coalesce(p_monto, 0)), 'FM999,999,999,990')
         else to_char(abs(coalesce(p_monto, 0)), 'FM999,999,999,990.00') end, ',.', '.,')
$$;

create function public._html(p_texto text) returns text
language sql immutable set search_path = public as $$
  select replace(replace(replace(replace(replace(coalesce(p_texto, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;')
$$;

-- ── El comprobante, armado (interno: no verifica permisos; lo hacen las funciones de abajo) ──
create function public._comprobante_venta(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v ventas; v_cliente text; v_atendio text; v_cobrado numeric; v_totales jsonb;
begin
  select * into v from ventas where id = p_id;
  if not found then return null; end if;
  select nombre into v_cliente from clientes where id = v.cliente_id;
  select nullif(split_part(nombre, ' ', 1), '') into v_atendio from perfiles where id = v.usuario_id;
  select coalesce(sum(base), 0) into v_cobrado from pagos where venta_id = v.id;
  v_totales := jsonb_build_array(jsonb_build_object('rotulo', 'Subtotal', 'monto', v.subtotal));
  if v.descuento_promociones > 0 then v_totales := v_totales || jsonb_build_object('rotulo', 'Promociones', 'monto', -v.descuento_promociones); end if;
  if v.descuento > 0 then v_totales := v_totales || jsonb_build_object('rotulo', 'Descuento', 'monto', -v.descuento); end if;
  if v.ajuste_medio_pago <> 0 then
    v_totales := v_totales || jsonb_build_object('rotulo', case when v.ajuste_medio_pago < 0 then 'Descuento por medio de pago' else 'Recargo por medio de pago' end, 'monto', v.ajuste_medio_pago);
  end if;
  v_totales := v_totales || jsonb_build_object('rotulo', 'Total', 'monto', v.total, 'fuerte', true);
  return jsonb_build_object(
    'tipo', 'venta', 'titulo', 'Comprobante de venta', 'numero', v.comprobante, 'fecha', v.fecha, 'anulada', v.anulada_en is not null,
    'cliente', v_cliente, 'atendio', v_atendio,
    'renglones', (select coalesce(jsonb_agg(jsonb_build_object('detalle', p.nombre, 'marca', m.nombre, 'variante', 'Talle ' || t.nombre || ' · ' || co.nombre, 'cantidad', vi.cantidad,
                    'precio', vi.precio_unitario, 'promocion', pr.nombre, 'descuento', vi.descuento_promo, 'subtotal', vi.cantidad * vi.precio_unitario - vi.descuento_promo) order by vi.id), '[]')
                    from venta_items vi join variantes va on va.id = vi.variante_id join productos p on p.id = va.producto_id join talles t on t.id = va.talle_id
                    join colores co on co.id = va.color_id left join marcas m on m.id = p.marca_id left join promociones pr on pr.id = vi.promocion_id where vi.venta_id = v.id),
    'totales', v_totales,
    'pagos', (select coalesce(jsonb_agg(jsonb_build_object('medio', mp.nombre, 'base', pg.base, 'ajuste_pct', pg.ajuste_pct, 'ajuste', pg.ajuste, 'monto', pg.monto, 'cuotas', pg.cuotas,
                    'referencia', pg.referencia) order by pg.id), '[]') from pagos pg join medios_pago mp on mp.id = pg.medio_pago_id where pg.venta_id = v.id),
    'saldo', greatest(v.subtotal - v.descuento - v.descuento_promociones - v_cobrado, 0));
end $$;

create function public._comprobante_presupuesto(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare x presupuestos; v_cliente text; v_atendio text; v_medio text; v_totales jsonb;
begin
  select * into x from presupuestos where id = p_id;
  if not found then return null; end if;
  select nombre into v_cliente from clientes where id = x.cliente_id;
  select nullif(split_part(nombre, ' ', 1), '') into v_atendio from perfiles where id = x.usuario_id;
  select nombre into v_medio from medios_pago where id = x.medio_pago_id;
  v_totales := jsonb_build_array(jsonb_build_object('rotulo', 'Subtotal', 'monto', x.subtotal));
  if x.descuento_promociones > 0 then v_totales := v_totales || jsonb_build_object('rotulo', 'Promociones', 'monto', -x.descuento_promociones); end if;
  if x.descuento > 0 then v_totales := v_totales || jsonb_build_object('rotulo', 'Descuento', 'monto', -x.descuento); end if;
  if x.ajuste_medio_pago <> 0 then
    v_totales := v_totales || jsonb_build_object('rotulo', case when x.ajuste_medio_pago < 0 then 'Descuento' else 'Recargo' end || coalesce(' pagando con ' || v_medio, ' por medio de pago'), 'monto', x.ajuste_medio_pago);
  end if;
  v_totales := v_totales || jsonb_build_object('rotulo', 'Total', 'monto', x.total, 'fuerte', true);
  return jsonb_build_object(
    'tipo', 'presupuesto', 'titulo', 'Presupuesto', 'numero', x.comprobante, 'fecha', x.fecha, 'anulada', x.estado = 'anulado',
    'cliente', v_cliente, 'atendio', v_atendio,
    'renglones', (select coalesce(jsonb_agg(jsonb_build_object('detalle', p.nombre, 'marca', m.nombre, 'variante', 'Talle ' || t.nombre || ' · ' || co.nombre, 'cantidad', pit.cantidad,
                    'precio', pit.precio_unitario, 'promocion', pr.nombre, 'descuento', pit.descuento_promo, 'subtotal', pit.cantidad * pit.precio_unitario - pit.descuento_promo) order by pit.id), '[]')
                    from presupuesto_items pit join variantes va on va.id = pit.variante_id join productos p on p.id = va.producto_id join talles t on t.id = va.talle_id
                    join colores co on co.id = va.color_id left join marcas m on m.id = p.marca_id left join promociones pr on pr.id = pit.promocion_id where pit.presupuesto_id = x.id),
    'totales', v_totales, 'pagos', '[]'::jsonb, 'saldo', 0,
    'leyenda', 'Presupuesto sin validez fiscal. Los precios y las promociones se respetan hasta el ' || to_char(x.valido_hasta, 'DD/MM/YYYY') || '; el stock no queda reservado hasta que se confirme.',
    'pie', case when v_medio is not null then 'Precio con pago en: ' || v_medio end);
end $$;

create function public._comprobante_devolucion(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d devoluciones; v_cliente text; v_atendio text; v_origen text; v_vence date; v_totales jsonb;
begin
  select * into d from devoluciones where id = p_id;
  if not found then return null; end if;
  select nombre into v_cliente from clientes where id = d.cliente_id;
  select nullif(split_part(nombre, ' ', 1), '') into v_atendio from perfiles where id = d.usuario_id;
  select comprobante into v_origen from ventas where id = d.venta_id;
  select vence into v_vence from saldos_cliente where devolucion_id = d.id and tipo = 'devolucion' order by id limit 1;
  v_totales := case when d.bruto <> d.total then jsonb_build_array(jsonb_build_object('rotulo', 'Lo devuelto', 'monto', d.bruto)) else '[]'::jsonb end
    || jsonb_build_object('rotulo', 'Saldo a favor', 'monto', d.total, 'fuerte', true);
  return jsonb_build_object(
    'tipo', 'devolucion', 'titulo', 'Devolución · saldo a favor', 'numero', d.comprobante, 'fecha', d.fecha, 'anulada', false,
    'cliente', v_cliente, 'atendio', v_atendio, 'origen', v_origen,
    'renglones', (select coalesce(jsonb_agg(jsonb_build_object('detalle', p.nombre, 'marca', m.nombre, 'variante', 'Talle ' || t.nombre || ' · ' || co.nombre, 'cantidad', di.cantidad,
                    'precio', null, 'promocion', null, 'descuento', 0, 'subtotal', di.monto) order by di.id), '[]')
                    from devolucion_items di join venta_items vi on vi.id = di.venta_item_id join variantes va on va.id = vi.variante_id join productos p on p.id = va.producto_id
                    join talles t on t.id = va.talle_id join colores co on co.id = va.color_id left join marcas m on m.id = p.marca_id where di.devolucion_id = d.id),
    'totales', v_totales, 'pagos', '[]'::jsonb, 'saldo', 0,
    'leyenda', 'Saldo a favor para tu próxima compra en el local' || coalesce(' hasta el ' || to_char(v_vence, 'DD/MM/YYYY'), '') || '. Comprobante interno, sin validez fiscal.',
    'pie', case when v_origen is not null then 'Por la compra ' || v_origen end);
end $$;

-- El comprobante completo: el documento + quién lo emite + cómo se imprime
create function public._comprobante_json(p_tipo text, p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t configuracion_tienda; l datos_legales; c configuracion_impresion; v_doc jsonb;
begin
  v_doc := case p_tipo when 'venta' then _comprobante_venta(p_id) when 'presupuesto' then _comprobante_presupuesto(p_id) when 'devolucion' then _comprobante_devolucion(p_id) end;
  if v_doc is null then return null; end if;
  select * into t from configuracion_tienda; select * into l from datos_legales; select * into c from configuracion_impresion;
  return v_doc || jsonb_build_object(
    'emisor', jsonb_build_object('nombre', t.nombre, 'logo_url', coalesce(t.logo_url, t.icono_url), 'es_icono', t.logo_url is null and t.icono_url is not null, 'razon_social', l.razon_social, 'cuit', l.cuit, 'condicion_iva', l.condicion_iva,
      'domicilio', l.domicilio_legal, 'telefono', l.telefono_contacto, 'email', l.email_contacto, 'local', t.direccion_retiro),
    'config', jsonb_build_object('formato', c.comprobante_formato, 'logo', c.comprobante_logo, 'datos_legales', c.comprobante_datos_legales, 'qr', c.comprobante_qr,
      'barras', c.comprobante_codigo_barras, 'copias', c.comprobante_copias, 'modo', c.modo_impresion, 'configurado', c.comprobante_configurado,
      'letra', c.comprobante_letra, 'encabezado', c.comprobante_encabezado, 'mostrar_cliente', c.comprobante_mostrar_cliente,
      'mostrar_vendedor', c.comprobante_mostrar_vendedor, 'mostrar_marca', c.comprobante_mostrar_marca),
    -- la leyenda y el pie propios del documento (presupuesto, devolución) pisan los generales
    'leyenda', coalesce(v_doc ->> 'leyenda', c.comprobante_leyenda), 'pie', coalesce(v_doc ->> 'pie', c.comprobante_pie));
end $$;

-- ¿Puede quien está logueado ver ese comprobante? (las mismas reglas que las pantallas de cada uno)
create function public._comprobante_acceso(p_tipo text, p_id bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select case p_tipo
    when 'venta' then exists (select 1 from ventas v where v.id = p_id and puede_ver_venta(v.usuario_id))
    when 'presupuesto' then exists (select 1 from presupuestos x where x.id = p_id and puede_ver_venta(x.usuario_id))
    when 'devolucion' then exists (select 1 from devoluciones d where d.id = p_id) and (tiene_permiso('ventas.registrar') or tiene_permiso('ventas.ver_todas') or tiene_permiso('clientes.ver'))
    else false end
$$;

-- El link: crea el token la primera vez y devuelve la dirección (sin el sitio, si todavía no está cargado en la instalación)
create function public._comprobante_enlace(p_tipo text, p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_token text; v_sitio text := (select sitio_url from integraciones);
begin
  insert into enlaces_comprobante (tipo, documento_id, creado_por) values (p_tipo, p_id, auth.uid())
    on conflict (tipo, documento_id) do nothing;
  select token into v_token from enlaces_comprobante where tipo = p_tipo and documento_id = p_id;
  return jsonb_build_object('token', v_token, 'ruta', '/comprobante/' || v_token, 'url', case when v_sitio is not null then v_sitio || '/comprobante/' || v_token end);
end $$;

-- ── Para el panel (quien ve ese documento) ───────────────────────────
create function public.comprobante_de(p_tipo text, p_id bigint, p_con_enlace boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_doc jsonb;
begin
  if p_tipo not in ('venta', 'presupuesto', 'devolucion') then raise exception 'Ese tipo de comprobante no existe'; end if;
  if not _comprobante_acceso(p_tipo, p_id) then raise exception 'No tenés acceso a ese comprobante'; end if;
  v_doc := _comprobante_json(p_tipo, p_id);
  if p_con_enlace then v_doc := v_doc || jsonb_build_object('enlace', _comprobante_enlace(p_tipo, p_id)); end if;
  return v_doc;
end $$;

-- Invalida el link anterior y crea uno nuevo (por si se mandó a quien no era)
create function public.renovar_enlace_comprobante(p_tipo text, p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not _comprobante_acceso(p_tipo, p_id) then raise exception 'No tenés acceso a ese comprobante'; end if;
  perform _comprobante_enlace(p_tipo, p_id);
  update enlaces_comprobante set token = encode(extensions.gen_random_bytes(18), 'hex'), revocado = false, vistas = 0, ultima_vista = null where tipo = p_tipo and documento_id = p_id;
  return _comprobante_enlace(p_tipo, p_id);
end $$;

-- ── Para quien recibe el link (sin ingresar) ─────────────────────────
create function public.comprobante_publico(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e enlaces_comprobante; v_doc jsonb;
begin
  if coalesce(length(p_token), 0) < 20 then return null; end if;
  select * into e from enlaces_comprobante where token = p_token and not revocado;
  if not found then return null; end if;
  v_doc := _comprobante_json(e.tipo, e.documento_id);
  if v_doc is null then return null; end if;
  update enlaces_comprobante set vistas = vistas + 1, ultima_vista = now() where id = e.id;
  return v_doc || jsonb_build_object('enlace', jsonb_build_object('ruta', '/comprobante/' || e.token));
end $$;

-- ── Registrar que se compartió por WhatsApp o se copió el link ────────
create function public.registrar_envio_comprobante(p_tipo text, p_id bigint, p_canal text, p_destino text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not _comprobante_acceso(p_tipo, p_id) then raise exception 'No tenés acceso a ese comprobante'; end if;
  if p_canal not in ('whatsapp', 'enlace') then raise exception 'Canal inválido'; end if;
  insert into comprobante_envios (tipo, documento_id, canal, destino, estado) values (p_tipo, p_id, p_canal, left(nullif(trim(p_destino), ''), 120), 'abierto');
end $$;

-- ── Mail con el comprobante ──────────────────────────────────────────
create function public._comprobante_mail_html(p_doc jsonb, p_url text) returns text
language plpgsql stable set search_path = public as $$
declare e jsonb := p_doc -> 'emisor'; v_color text := coalesce((select color_marca from configuracion_tienda), '#1d4ed8'); r jsonb; v_filas text := ''; v_totales text := '';
        v_marca text; v_legal text;
begin
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
  v_legal := _html(p_doc ->> 'leyenda') || case when coalesce(e ->> 'razon_social', '') <> '' then '<br>' || _html(e ->> 'razon_social') || coalesce(' · CUIT ' || _html(e ->> 'cuit'), '') || coalesce(' · ' || _html(e ->> 'domicilio'), '') else '' end;
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' || _html(p_doc ->> 'titulo') || '</title></head>'
    || '<body style="margin:0;padding:0;background:#f5f6f8;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Helvetica,Arial,sans-serif;color:#111827;">'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;padding:24px 12px;"><tr><td align="center">'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;">'
    || '<tr><td style="padding:24px 28px 4px 28px;">' || v_marca || '</td></tr>'
    || '<tr><td style="padding:12px 28px 0 28px;"><h1 style="margin:0 0 4px 0;font-size:20px;line-height:1.3;">' || _html(p_doc ->> 'titulo') || ' ' || _html(p_doc ->> 'numero') || '</h1>'
    || '<p style="margin:0;font-size:13px;color:#6b7280;">' || to_char((p_doc ->> 'fecha')::timestamptz at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI') || '</p></td></tr>'
    || '<tr><td style="padding:12px 28px 0 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">' || v_filas || '</table></td></tr>'
    || '<tr><td style="padding:10px 28px 0 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">' || v_totales || '</table></td></tr>'
    || '<tr><td style="padding:20px 28px 0 28px;"><a href="' || _html(p_url) || '" style="display:block;background:' || v_color || ';color:#ffffff;text-decoration:none;text-align:center;font-weight:600;font-size:15px;padding:13px 20px;border-radius:10px;">Ver o guardar el comprobante</a></td></tr>'
    || '<tr><td style="padding:16px 28px 24px 28px;font-size:12px;line-height:1.5;color:#9ca3af;">' || v_legal || '</td></tr>'
    || '</table></td></tr></table></body></html>';
end $$;

-- Devuelve {ok: true} o {ok: false, error}: si Resend rechaza el mail, el fallo queda registrado (lanzar un error deshacería también el registro)
create function public.enviar_comprobante_mail(p_tipo text, p_id bigint, p_email text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(coalesce(p_email, ''))); i integraciones; t configuracion_tienda; l datos_legales; v_doc jsonb; v_url text; v_enlace jsonb; r jsonb; v_cuerpo jsonb; v_msg text;
begin
  if not _comprobante_acceso(p_tipo, p_id) then raise exception 'No tenés acceso a ese comprobante'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Ese email no parece válido'; end if;
  select * into i from integraciones; select * into t from configuracion_tienda; select * into l from datos_legales;
  if i.smtp_host is distinct from 'smtp.resend.com' or i.smtp_clave is null or i.smtp_email is null then
    raise exception 'Para mandar comprobantes por mail hay que conectar Resend (Integraciones → Correo)';
  end if;
  v_doc := _comprobante_json(p_tipo, p_id);
  v_enlace := _comprobante_enlace(p_tipo, p_id);
  -- Sin la dirección del sitio cargada, el link del mail no se puede armar
  v_url := v_enlace ->> 'url';
  if v_url is null then raise exception 'Falta la dirección del sitio en la instalación: no se puede armar el link del comprobante'; end if;
  v_cuerpo := jsonb_build_object('from', '"' || replace(coalesce(i.smtp_nombre, t.nombre), '"', '') || '" <' || i.smtp_email || '>', 'to', jsonb_build_array(v_email),
    'subject', (v_doc ->> 'titulo') || ' ' || (v_doc ->> 'numero') || ' · ' || t.nombre, 'html', _comprobante_mail_html(v_doc, v_url));
  if l.email_contacto is not null then v_cuerpo := v_cuerpo || jsonb_build_object('reply_to', l.email_contacto); end if;
  r := _pedir_http('POST', 'https://api.resend.com/emails', jsonb_build_object('Authorization', 'Bearer ' || i.smtp_clave), 'application/json', v_cuerpo::text);
  if (r ->> 'status')::int not between 200 and 299 then
    v_msg := left(coalesce(r -> 'cuerpo' ->> 'message', 'Resend contestó ' || (r ->> 'status')), 200);
    insert into comprobante_envios (tipo, documento_id, canal, destino, estado, detalle) values (p_tipo, p_id, 'mail', v_email, 'error', v_msg);
    return jsonb_build_object('ok', false, 'error', v_msg);
  end if;
  insert into comprobante_envios (tipo, documento_id, canal, destino, estado) values (p_tipo, p_id, 'mail', v_email, 'enviado');
  return jsonb_build_object('ok', true);
end $$;

-- ¿Se puede mandar por mail desde este local? La usa la pantalla de envío (la ve cualquiera del equipo): no devuelve ningún dato de la
-- conexión, solo si falta algo y qué.
create function public.comprobante_mail_disponible() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare i integraciones;
begin
  if not es_staff() then raise exception 'No tenés acceso'; end if;
  select * into i from integraciones;
  if i.smtp_host is distinct from 'smtp.resend.com' or i.smtp_clave is null or i.smtp_email is null then
    return jsonb_build_object('disponible', false, 'motivo', 'Para mandar por mail hay que conectar Resend (Integraciones → Correo).');
  end if;
  if i.sitio_url is null then
    return jsonb_build_object('disponible', false, 'motivo', 'Falta la dirección del sitio para armar el link: se carga al conectar el dominio propio (Integraciones → Dominio).');
  end if;
  return jsonb_build_object('disponible', true);
end $$;

-- ── Permisos de ejecución ────────────────────────────────────────────
revoke execute on function public._dinero(numeric), public._html(text), public._comprobante_venta(bigint), public._comprobante_presupuesto(bigint), public._comprobante_devolucion(bigint),
  public._comprobante_json(text, bigint), public._comprobante_acceso(text, bigint), public._comprobante_enlace(text, bigint), public._comprobante_mail_html(jsonb, text) from public, anon, authenticated;
revoke execute on function public.comprobante_de(text, bigint, boolean), public.renovar_enlace_comprobante(text, bigint), public.registrar_envio_comprobante(text, bigint, text, text),
  public.enviar_comprobante_mail(text, bigint, text), public.comprobante_mail_disponible() from public, anon;
grant  execute on function public.comprobante_de(text, bigint, boolean), public.renovar_enlace_comprobante(text, bigint), public.registrar_envio_comprobante(text, bigint, text, text),
  public.enviar_comprobante_mail(text, bigint, text), public.comprobante_mail_disponible() to authenticated;
revoke execute on function public.comprobante_publico(text) from public;
grant  execute on function public.comprobante_publico(text) to anon, authenticated;
