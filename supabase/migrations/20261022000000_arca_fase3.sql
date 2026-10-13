-- ARCA, fase 3: datos fiscales de cada cliente, Factura A (o B/C según el cliente) y notas de crédito por devoluciones y cambios.
--   · El cliente tiene su categoría frente al IVA y su documento (DNI, CUIT, CUIL o pasaporte). Las categorías que facturan con CUIT lo exigen con su
--     dígito verificador (lo controla la base, como el resto).
--   · La letra y el receptor los decide _factura_receptor: local Responsable Inscripto → A a inscriptos y monotributistas, B al resto; monotributista o
--     exento → C. La condición del receptor va con su código de ARCA (RG 5616, verificar).
--   · Una devolución de una venta facturada hace su nota de crédito por lo devuelto (repartido por alícuota como la factura). En un cambio, además, la venta
--     nueva sale con factura si la original la tenía. No se llama a ARCA dentro de la operación: lo manda la cola en el próximo minuto.

-- ── Datos fiscales del cliente ──────────────────────────────────────────
alter table public.clientes
  add column condicion_iva   text not null default 'consumidor_final'
    check (condicion_iva in ('consumidor_final', 'responsable_inscripto', 'monotributo', 'exento', 'no_alcanzado')),
  add column tipo_documento  text not null default 'DNI' check (tipo_documento in ('DNI', 'CUIT', 'CUIL', 'pasaporte')),
  add column razon_social    text check (char_length(razon_social) <= 150),
  add column domicilio_fiscal text check (char_length(domicilio_fiscal) <= 200),
  add column localidad_fiscal text check (char_length(localidad_fiscal) <= 100),
  add column provincia       text check (char_length(provincia) <= 60),
  add column email_facturas  text check (email_facturas is null or email_facturas ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');

-- Inscripto, monotributista y exento facturan con CUIT válido. Un CUIT o CUIL, siempre con su dígito verificador.
create function public._cliente_fiscal() returns trigger
language plpgsql security definer set search_path = public as $$
declare d text := regexp_replace(coalesce(new.documento, ''), '\D', '', 'g');
begin
  if new.condicion_iva in ('responsable_inscripto', 'monotributo', 'exento') then
    if new.tipo_documento <> 'CUIT' or not _cuit_valido(d) then
      raise exception 'Para un cliente % hace falta su CUIT (11 números, con el dígito verificador correcto)',
        case new.condicion_iva when 'responsable_inscripto' then 'responsable inscripto' when 'monotributo' then 'monotributista' else 'exento' end;
    end if;
  end if;
  if new.tipo_documento in ('CUIT', 'CUIL') and d <> '' and not _cuit_valido(d) then
    raise exception 'El % no es válido: revisá los 11 números (el último es el dígito verificador)', new.tipo_documento;
  end if;
  return new;
end $$;
create trigger clientes_fiscal before insert or update of condicion_iva, tipo_documento, documento on public.clientes
  for each row execute function public._cliente_fiscal();

-- Los clientes que ya tenían un CUIT válido cargado como documento quedan con tipo CUIT
update public.clientes set tipo_documento = 'CUIT' where public._cuit_valido(documento);

-- ── Letra y receptor ────────────────────────────────────────────────────
-- Devuelve {letra, doc_tipo, doc_nro, condicion (código ARCA), condicion_texto, receptor}
create function public._factura_receptor(p_cliente bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare cl clientes; v_empresa text := (select condicion_iva from datos_legales); v_letra text; d text; v_doc_tipo int := 99; v_doc_nro text := '0';
        v_cond int := 5; v_texto text := 'Consumidor final'; v_nombre text := 'A consumidor final';
begin
  if p_cliente is not null then select * into cl from clientes where id = p_cliente; end if;
  if cl.id is not null then
    d := regexp_replace(coalesce(cl.documento, ''), '\D', '', 'g');
    v_cond := case cl.condicion_iva when 'responsable_inscripto' then 1 when 'exento' then 4 when 'monotributo' then 6 when 'no_alcanzado' then 15 else 5 end;
    v_texto := case cl.condicion_iva when 'responsable_inscripto' then 'IVA Responsable Inscripto' when 'exento' then 'IVA Sujeto Exento'
                 when 'monotributo' then 'Responsable Monotributo' when 'no_alcanzado' then 'IVA No Alcanzado' else 'Consumidor final' end;
    if cl.tipo_documento = 'CUIT' and _cuit_valido(d) then v_doc_tipo := 80; v_doc_nro := d;
    elsif cl.tipo_documento = 'CUIL' and _cuit_valido(d) then v_doc_tipo := 86; v_doc_nro := d;
    elsif cl.tipo_documento = 'DNI' and d ~ '^\d{7,8}$' then v_doc_tipo := 96; v_doc_nro := ltrim(d, '0');
    elsif cl.tipo_documento = 'pasaporte' and coalesce(trim(cl.documento), '') <> '' then v_doc_tipo := 94; v_doc_nro := regexp_replace(cl.documento, '[^0-9A-Za-z]', '', 'g');
    end if;
    if v_doc_tipo <> 99 then v_nombre := coalesce(nullif(trim(cl.razon_social), ''), cl.nombre); end if;
  end if;
  v_letra := case v_empresa
    when 'Responsable Inscripto' then case when cl.condicion_iva in ('responsable_inscripto', 'monotributo') and v_doc_tipo = 80 then 'A' else 'B' end
    when 'Monotributo' then 'C' when 'IVA Exento' then 'C' end;
  return jsonb_build_object('letra', v_letra, 'doc_tipo', v_doc_tipo, 'doc_nro', v_doc_nro, 'condicion', v_cond, 'condicion_texto', v_texto, 'receptor', v_nombre);
end $$;

-- _factura_crear: la letra y el receptor salen del cliente
create or replace function public._factura_crear(p_venta bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare v ventas; c configuracion_fiscal; r jsonb; v_letra text; v_imp jsonb; v_pv int; v_id bigint;
begin
  select * into c from configuracion_fiscal;
  if not c.activa then raise exception 'La facturación con ARCA no está activa (Integraciones → ARCA)'; end if;
  select * into v from ventas where id = p_venta;
  if not found then raise exception 'Esa venta no existe'; end if;
  if v.anulada_en is not null then raise exception 'La venta está anulada'; end if;
  select id into v_id from facturas where venta_id = p_venta and clase = 'factura' and estado <> 'cancelada';
  if v_id is not null then return v_id; end if;
  r := _factura_receptor(v.cliente_id);
  v_letra := r ->> 'letra';
  if v_letra is null then raise exception 'Falta la categoría de IVA del local (Integraciones → ARCA, paso 1)'; end if;
  select numero into v_pv from puntos_venta_fiscales where ambiente = c.ambiente and por_defecto and activo and not bloqueado and baja is null;
  if v_pv is null then raise exception 'Falta elegir el punto de venta de siempre (Integraciones → ARCA)'; end if;
  v_imp := _factura_importes(p_venta, v_letra);
  if (r ->> 'doc_tipo')::int = 99 and (v_imp ->> 'total')::numeric >= c.umbral_identificacion then
    raise exception 'Para facturar % o más a consumidor final, ARCA pide el DNI: cargalo en la ficha del cliente de esta venta', '$ ' || replace(to_char(c.umbral_identificacion, 'FM999,999,999'), ',', '.');
  end if;
  insert into facturas (ambiente, letra, cbte_tipo, punto_venta, venta_id, cliente_id, receptor, doc_tipo, doc_nro, condicion_iva_receptor, fecha,
                        total, neto, iva, detalle_iva, creada_por)
  values (c.ambiente, v_letra, case v_letra when 'A' then 1 when 'B' then 6 else 11 end, v_pv, p_venta, v.cliente_id, r ->> 'receptor',
          (r ->> 'doc_tipo')::int, r ->> 'doc_nro', (r ->> 'condicion')::int, (now() at time zone 'America/Argentina/Buenos_Aires')::date,
          (v_imp ->> 'total')::numeric, (v_imp ->> 'neto')::numeric, (v_imp ->> 'iva')::numeric, v_imp -> 'detalle', auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- La letra que le saldría a un cliente (la caja la muestra antes de cobrar)
create function public.letra_para_cliente(p_cliente bigint default null) returns text
language sql stable security definer set search_path = public as $$
  select case when es_staff() then _factura_receptor(p_cliente) ->> 'letra' end
$$;

-- ── Notas de crédito por devoluciones ───────────────────────────────────
alter table public.facturas add column devolucion_id bigint references public.devoluciones (id) on delete restrict;
create index facturas_devolucion_id_idx on public.facturas (devolucion_id);
drop index public.facturas_nc_key;
-- La anulación: una sola nota de crédito por factura. Las devoluciones: una por devolución (una factura puede tener varias devoluciones parciales).
create unique index facturas_nc_anulacion_key on public.facturas (factura_id) where clase = 'nota_credito' and devolucion_id is null and estado <> 'cancelada';
create unique index facturas_nc_devolucion_key on public.facturas (devolucion_id) where devolucion_id is not null and estado <> 'cancelada';

-- Al cierre de la devolución (ya con su total y, si es un cambio, con su venta nueva):
--   · factura autorizada → nota de crédito por lo devuelto (repartido por alícuota en la misma proporción que la factura)
--   · cambio de una venta con factura → la venta nueva también sale con factura
create function public._factura_al_devolver() returns trigger
language plpgsql security definer set search_path = public as $$
declare d devoluciones; f facturas; v_k numeric; v_det jsonb := '[]'; x jsonb; v_iva numeric := 0; v_neto numeric; v_base numeric; v_iva_g numeric; v_resto numeric;
        v_n int; i int := 0;
begin
  if not (select activa from configuracion_fiscal) then return null; end if;
  select * into d from devoluciones where id = new.id;
  select * into f from facturas where venta_id = d.venta_id and clase = 'factura' and estado = 'autorizada';
  if not found then return null; end if;
  if d.total > 0 then
    v_k := least(d.total / f.total, 1);
    if f.letra = 'C' then
      v_neto := d.total;
    else
      -- Cada alícuota en la proporción de la factura; el último grupo se lleva los centavos para que sume justo
      v_n := jsonb_array_length(f.detalle_iva); v_resto := d.total;
      for x in select * from jsonb_array_elements(f.detalle_iva) loop
        i := i + 1;
        v_base := case when i = v_n then v_resto else round(((x ->> 'base')::numeric + (x ->> 'iva')::numeric) * v_k, 2) end;
        v_resto := v_resto - v_base;
        v_iva_g := round(v_base * (x ->> 'alicuota')::numeric / (100 + (x ->> 'alicuota')::numeric), 2);
        v_iva := v_iva + v_iva_g;
        v_det := v_det || jsonb_build_object('alicuota', (x ->> 'alicuota')::numeric, 'base', v_base - v_iva_g, 'iva', v_iva_g);
      end loop;
      v_neto := d.total - v_iva;
    end if;
    insert into facturas (clase, ambiente, letra, cbte_tipo, punto_venta, venta_id, factura_id, devolucion_id, cliente_id, receptor, doc_tipo, doc_nro,
                          condicion_iva_receptor, fecha, total, neto, iva, detalle_iva, creada_por)
    values ('nota_credito', f.ambiente, f.letra, case f.letra when 'A' then 3 when 'B' then 8 else 13 end, f.punto_venta, f.venta_id, f.id, d.id, f.cliente_id,
            f.receptor, f.doc_tipo, f.doc_nro, f.condicion_iva_receptor, (now() at time zone 'America/Argentina/Buenos_Aires')::date,
            d.total, v_neto, v_iva, v_det, auth.uid())
    on conflict do nothing;
  end if;
  if d.venta_cambio_id is not null then
    begin perform _factura_crear(d.venta_cambio_id);
    exception when others then null;   -- si falta algo, la venta del cambio se factura desde la venta
    end;
  end if;
  return null;
end $$;
create constraint trigger devoluciones_factura after insert on public.devoluciones deferrable initially deferred
  for each row execute function public._factura_al_devolver();

-- El comprobante: la condición del receptor como se informó, y la nota de crédito de la anulación (no las de devoluciones, que van en su comprobante)
create or replace function public._factura_fiscal(p_venta bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare f facturas; n facturas; l datos_legales; c configuracion_fiscal; v_qr jsonb; v_cuit text;
begin
  select * into f from facturas where venta_id = p_venta and clase = 'factura' and estado <> 'cancelada' order by id desc limit 1;
  if not found then return null; end if;
  select * into n from facturas where factura_id = f.id and clase = 'nota_credito' and devolucion_id is null and estado <> 'cancelada' order by id desc limit 1;
  select * into l from datos_legales; select * into c from configuracion_fiscal;
  v_cuit := regexp_replace(coalesce(l.cuit, ''), '\D', '', 'g');
  if f.estado = 'autorizada' then
    v_qr := jsonb_build_object('ver', 1, 'fecha', to_char(f.fecha, 'YYYY-MM-DD'), 'cuit', v_cuit::bigint, 'ptoVta', f.punto_venta, 'tipoCmp', f.cbte_tipo,
      'nroCmp', f.numero, 'importe', f.total, 'moneda', 'PES', 'ctz', 1, 'tipoDocRec', f.doc_tipo, 'nroDocRec', nullif(regexp_replace(f.doc_nro, '\D', '', 'g'), '')::bigint,
      'tipoCodAut', 'E', 'codAut', f.cae::bigint);
  end if;
  return jsonb_build_object(
    'estado', f.estado, 'letra', f.letra, 'codigo', lpad(f.cbte_tipo::text, 3, '0'), 'comprobante', f.comprobante, 'fecha', f.fecha,
    'cae', f.cae, 'cae_vence', f.cae_vence, 'receptor', f.receptor, 'doc_tipo', f.doc_tipo, 'doc_nro', f.doc_nro,
    'condicion_receptor', case f.condicion_iva_receptor when 1 then 'IVA Responsable Inscripto' when 4 then 'IVA Sujeto Exento' when 6 then 'Responsable Monotributo'
      when 15 then 'IVA No Alcanzado' else 'Consumidor final' end,
    'domicilio_receptor', (select concat_ws(', ', nullif(domicilio_fiscal, ''), nullif(localidad_fiscal, ''), nullif(provincia, '')) from clientes where id = f.cliente_id),
    'neto', f.neto, 'iva', f.iva, 'detalle_iva', f.detalle_iva, 'total', f.total,
    'iva_contenido_en_c', c.iva_contenido_en_c, 'pruebas', f.ambiente = 'homologacion',
    'qr', case when v_qr is not null then 'https://www.afip.gob.ar/fe/qr/?p=' || translate(encode(convert_to(v_qr::text, 'UTF8'), 'base64'), E'\n', '') end,
    'emisor', jsonb_build_object('razon_social', l.razon_social, 'cuit', l.cuit, 'condicion_iva', l.condicion_iva, 'ingresos_brutos', l.ingresos_brutos,
      'inicio_actividades', l.inicio_actividades, 'domicilio', l.domicilio_legal),
    'nota_credito', case when n.id is not null then jsonb_build_object('estado', n.estado, 'letra', n.letra, 'codigo', lpad(n.cbte_tipo::text, 3, '0'),
      'comprobante', n.comprobante, 'cae', n.cae, 'cae_vence', n.cae_vence, 'fecha', n.fecha) end);
end $$;

revoke execute on function public._cliente_fiscal(), public._factura_receptor(bigint), public._factura_al_devolver() from public, anon, authenticated;
revoke execute on function public.letra_para_cliente(bigint) from public, anon;
grant  execute on function public.letra_para_cliente(bigint) to authenticated;

-- ── Buscar una venta para un cambio o una devolución: también por el número de su factura (y dice si tiene) ──
-- Desde la caja se escanea el código de barras del ticket (el número interno) o se escribe el de la factura («00003-00000045», o «3-45»).
create or replace function public.ventas_para_cambio(p_buscar text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare q text := trim(coalesce(p_buscar, '')); v_num int; v_dias int := (select dias_cambio from configuracion_tienda); v_pv int; v_nro bigint;
begin
  if not tiene_permiso('ventas.registrar') then raise exception 'No tenés permiso para hacer cambios'; end if;
  if q = '' or (length(q) < 2 and q !~ '^\d+$') then return '[]'; end if;   -- un número de ticket puede ser corto ("3")
  if q ~ '^\d{1,9}$' then v_num := q::int; end if;   -- "123" = la venta n.º 123
  if q ~ '^[ABCabc]?\s*\d{1,5}-\d{1,8}$' then        -- número de factura: punto de venta y número
    v_pv := substring(q from '(\d{1,5})-')::int; v_nro := substring(q from '-(\d{1,8})$')::bigint;
  end if;
  return (
    select coalesce(jsonb_agg(x order by x->>'fecha' desc), '[]') from (
      select jsonb_build_object(
        'id', v.id, 'comprobante', v.comprobante, 'fecha', v.fecha, 'cliente', c.nombre,
        'factura', (select f.letra || ' ' || f.comprobante from facturas f where f.venta_id = v.id and f.clase = 'factura' and f.estado = 'autorizada'),
        'productos', (select string_agg(p.nombre || ' (' || t.nombre || ' · ' || co.nombre || case when vi.cantidad > 1 then ' ×' || vi.cantidad else '' end || ')', ', ' order by vi.id)
                        from venta_items vi join variantes va on va.id = vi.variante_id join productos p on p.id = va.producto_id
                        join talles t on t.id = va.talle_id join colores co on co.id = va.color_id where vi.venta_id = v.id),
        'en_plazo', (v.fecha at time zone 'America/Argentina/Buenos_Aires')::date + v_dias >= _hoy_ar()) as x
        from ventas v left join clientes c on c.id = v.cliente_id
       where v.anulada_en is null
         and (v.comprobante = q or v.numero = v_num or c.codigo::text = q
              or (v_nro is not null and exists (select 1 from facturas f where f.venta_id = v.id and f.clase = 'factura' and f.punto_venta = v_pv and f.numero = v_nro))
              or c.nombre ilike '%' || q || '%' or regexp_replace(coalesce(c.telefono, ''), '\D', '', 'g') like '%' || regexp_replace(q, '\D', '', 'g') || '%' and length(regexp_replace(q, '\D', '', 'g')) >= 6)
       order by v.fecha desc
       limit 20) s);
end $$;
