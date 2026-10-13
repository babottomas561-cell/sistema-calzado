-- ARCA, fase 2: facturar. Factura B o C de una venta (según la categoría del local), con CAE, numeración segura, cola de reintentos,
-- nota de crédito al anular una venta facturada y los datos fiscales en el comprobante (letra, CAE, QR de ARCA). Diseño: docs/ARCA.md (secciones 5 a 10).
--
--   · La base decide todo: letra, receptor, importes por alícuota y número. La pantalla solo pide «facturá esta venta».
--   · Numeración: se toma SIEMPRE el último autorizado que dice ARCA (FECompUltimoAutorizado) con un candado por punto de venta y tipo.
--     Si la transacción se cortara después de que ARCA autorizó (sin guardar la respuesta), el próximo intento ve ese número en ARCA, lo consulta
--     (FECompConsultar) y, si es de esta factura (mismo total, documento y fecha), lo toma: nunca dos CAE para la misma venta.
--   · _factura_enviar NUNCA lanza errores: lo que pasa queda en la factura (estado, último error, próximo intento). pg_cron reintenta cada minuto.
--   · El acceso a ARCA (WSAA) se pide en un bloque propio antes del envío: si después algo falla, el acceso ya quedó guardado (ARCA no da otro
--     mientras haya uno vigente).
--   · Factura A (clientes responsables inscriptos), notas de crédito por devoluciones y cambios, CC1/CC2 en compras y la pantalla Facturas: fases 3 y 4.

-- ── Permisos ────────────────────────────────────────────────────────────
-- Quien vende, factura (hijo de «Registrar ventas»); quien ve todas las ventas, ve todas las facturas
insert into public.permisos (orden, grupo, codigo, nombre, descripcion, padre) values
  (16, 'Ventas', 'facturas.emitir', 'Emitir facturas', 'Facturar con ARCA al vender y reintentar una factura que quedó pendiente. Incluido en «Registrar ventas».', 'ventas.registrar'),
  (17, 'Ventas', 'facturas.ver', 'Ver todas las facturas', 'Las facturas y notas de crédito de todas las ventas. Incluido en «Ver todas las ventas».', 'ventas.ver_todas');

-- ── IVA de cada artículo ────────────────────────────────────────────────
-- Vacío = el del rubro; si tampoco, el del local (configuracion_fiscal.alicuota_por_defecto). Se copia al renglón al vender.
alter table public.productos  add column alicuota_iva numeric(4,2) check (alicuota_iva in (0, 2.5, 5, 10.5, 21, 27));
alter table public.categorias add column alicuota_iva numeric(4,2) check (alicuota_iva in (0, 2.5, 5, 10.5, 21, 27));
alter table public.venta_items add column alicuota_iva numeric(4,2) check (alicuota_iva in (0, 2.5, 5, 10.5, 21, 27));

create function public._alicuota_de(p_variante bigint) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(p.alicuota_iva, c.alicuota_iva, (select alicuota_por_defecto from configuracion_fiscal))
    from variantes v join productos p on p.id = v.producto_id left join categorias c on c.id = p.categoria_id where v.id = p_variante
$$;

-- La copia del IVA en el renglón la pone la base, venga la venta de donde venga (caja, pedido, cambio)
create function public._venta_item_alicuota() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.alicuota_iva := coalesce(new.alicuota_iva, _alicuota_de(new.variante_id));
  return new;
end $$;
create trigger venta_items_alicuota before insert on public.venta_items for each row execute function public._venta_item_alicuota();
update public.venta_items vi set alicuota_iva = public._alicuota_de(vi.variante_id) where alicuota_iva is null;

-- ── Facturas y notas de crédito ─────────────────────────────────────────
create table public.facturas (
  id                     bigint generated always as identity primary key,
  clase                  text not null default 'factura' check (clase in ('factura', 'nota_credito')),
  ambiente               text not null check (ambiente in ('homologacion', 'produccion')),
  letra                  text not null check (letra in ('A', 'B', 'C')),
  cbte_tipo              int not null check (cbte_tipo in (1, 3, 6, 8, 11, 13)),
  punto_venta            int not null check (punto_venta between 1 and 99999),
  numero                 bigint,                 -- vacío hasta que ARCA lo autoriza
  numero_intentado       bigint,                 -- el último que se mandó (para recuperar un corte)
  comprobante            text generated always as (case when numero is not null then lpad(punto_venta::text, 5, '0') || '-' || lpad(numero::text, 8, '0') end) stored,
  venta_id               bigint not null references public.ventas (id) on delete restrict,
  factura_id             bigint references public.facturas (id) on delete restrict,       -- en una nota de crédito: la factura que corrige
  cliente_id             bigint references public.clientes (id) on delete set null,
  receptor               text not null,          -- como figura en el comprobante («A consumidor final» o el nombre)
  doc_tipo               int not null,           -- 80 CUIT · 96 DNI · 99 sin identificar
  doc_nro                text not null,
  condicion_iva_receptor int not null,           -- 5 = consumidor final
  fecha                  date not null,
  total                  numeric(14,2) not null check (total > 0),
  neto                   numeric(14,2) not null,
  iva                    numeric(14,2) not null default 0,
  detalle_iva            jsonb not null default '[]',   -- [{alicuota, base, iva}]
  estado                 text not null default 'pendiente' check (estado in ('pendiente', 'autorizada', 'rechazada', 'error', 'cancelada')),
  cae                    text,
  cae_vence              date,
  observaciones          text,
  ultimo_error           text,
  intentos               int not null default 0,
  proximo_intento        timestamptz default now(),
  creada_por             uuid references auth.users (id) on delete set null,
  creada_en              timestamptz not null default now(),
  autorizada_en          timestamptz,
  check (neto + iva = total),
  check ((clase = 'nota_credito') = (factura_id is not null)),
  check (estado <> 'autorizada' or (numero is not null and cae is not null))
);
create unique index facturas_numero_key on public.facturas (ambiente, cbte_tipo, punto_venta, numero) where numero is not null;
-- Nunca dos facturas (ni dos notas de crédito) vivas para lo mismo
create unique index facturas_venta_key on public.facturas (venta_id) where clase = 'factura' and estado <> 'cancelada';
create unique index facturas_nc_key on public.facturas (factura_id) where clase = 'nota_credito' and estado <> 'cancelada';
create index facturas_venta_id_idx on public.facturas (venta_id);
create index facturas_factura_id_idx on public.facturas (factura_id);
create index facturas_cliente_id_idx on public.facturas (cliente_id);
create index facturas_creada_por_idx on public.facturas (creada_por);
create index facturas_cola_idx on public.facturas (proximo_intento) where estado in ('pendiente', 'error');
alter table public.facturas enable row level security;
-- La ve quien ve la venta (la consulta a ventas pasa por la seguridad de ventas: la vendedora, solo las suyas)
create policy "la factura la ve quien ve la venta" on public.facturas for select to authenticated
  using (es_staff() and (tiene_permiso('facturas.ver') or exists (select 1 from ventas v where v.id = facturas.venta_id)));

-- ── Ayudas ──────────────────────────────────────────────────────────────
-- Importe con punto decimal y dos decimales, como lo pide ARCA
create function public._arca_num(p numeric) returns text language sql immutable as $$ select trim(to_char(coalesce(p, 0), 'FM999999999990.00')) $$;

-- Todos los mensajes (errores y observaciones) de una respuesta de WSFEv1, en una línea
create function public._arca_mensajes(p_xml text) returns text
language plpgsql immutable set search_path = public as $$
declare v_doc xml; v text;
begin
  begin v_doc := xmlparse(document regexp_replace(coalesce(p_xml, ''), '^\s*<\?xml[^>]*\?>', ''));
  exception when others then return null; end;
  select string_agg(_xml_texto(n::text, 'Code') || ': ' || _xml_texto(n::text, 'Msg'), ' · ')
    into v from unnest(xpath('//*[local-name()="Err" or local-name()="Obs"]', v_doc)) n;
  return v;
end $$;

-- Código de ARCA de cada alícuota
create function public._arca_alicuota_id(p numeric) returns int language sql immutable as $$
  select case p when 0 then 3 when 10.5 then 4 when 21 then 5 when 27 then 6 when 5 then 8 when 2.5 then 9 end
$$;

-- Letra que le toca al local (fase 2: sin Factura A; llega con los datos fiscales del cliente en la fase 3)
create function public._factura_letra() returns text
language sql stable security definer set search_path = public as $$
  select case (select condicion_iva from datos_legales) when 'Responsable Inscripto' then 'B' when 'Monotributo' then 'C' when 'IVA Exento' then 'C' end
$$;

-- Los importes de la factura de una venta: lo cobrado (ventas.total) más el envío cobrado, repartido entre los renglones según lo que vale cada uno
-- después de su promoción (como v_hechos_ventas) y agrupado por alícuota. En cada grupo: iva = total × a / (100 + a); neto = total − iva.
-- La diferencia de centavos del reparto va al grupo más grande: la suma da justo el total.
create function public._factura_importes(p_venta bigint, p_letra text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v ventas; v_envio numeric := 0; v_total numeric; v_base numeric; v_grupos jsonb := '[]'; v_dif numeric; g record; v_alic_local numeric := (select alicuota_por_defecto from configuracion_fiscal);
        v_neto numeric := 0; v_iva numeric := 0; v_det jsonb := '[]'; v_tot_g numeric; v_iva_g numeric; v_max numeric := -1; v_max_a numeric;
begin
  select * into v from ventas where id = p_venta;
  if v.pedido_id is not null then select coalesce(costo_envio, 0) into v_envio from pedidos where id = v.pedido_id; end if;
  v_total := v.total + greatest(v_envio, 0);
  if v_total <= 0 then raise exception 'Esta venta no tiene importe para facturar'; end if;
  if p_letra = 'C' then
    return jsonb_build_object('total', v_total, 'neto', v_total, 'iva', 0, 'detalle', '[]'::jsonb);
  end if;
  select sum(cantidad * precio_unitario - descuento_promo) into v_base from venta_items where venta_id = p_venta;
  -- Lo de los renglones (proporcional a lo cobrado de la venta) por alícuota, más el envío con la del local
  create temporary table if not exists _fact_grupos (alicuota numeric primary key, total numeric) on commit drop;
  delete from _fact_grupos;
  insert into _fact_grupos
  select coalesce(vi.alicuota_iva, _alicuota_de(vi.variante_id)), round(sum(vi.cantidad * vi.precio_unitario - vi.descuento_promo) * v.total / nullif(v_base, 0), 2)
    from venta_items vi where vi.venta_id = p_venta group by 1;
  if v_envio > 0 then
    insert into _fact_grupos values (v_alic_local, v_envio) on conflict (alicuota) do update set total = _fact_grupos.total + excluded.total;
  end if;
  select v_total - coalesce(sum(total), 0) into v_dif from _fact_grupos;
  update _fact_grupos set total = total + v_dif where alicuota = (select alicuota from _fact_grupos order by total desc, alicuota desc limit 1);
  for g in select alicuota, total from _fact_grupos where total <> 0 order by alicuota loop
    v_iva_g := round(g.total * g.alicuota / (100 + g.alicuota), 2);
    v_neto := v_neto + g.total - v_iva_g; v_iva := v_iva + v_iva_g;
    v_det := v_det || jsonb_build_object('alicuota', g.alicuota, 'base', g.total - v_iva_g, 'iva', v_iva_g);
  end loop;
  return jsonb_build_object('total', v_total, 'neto', v_neto, 'iva', v_iva, 'detalle', v_det);
end $$;

-- El pedido FECAESolicitar de una factura con un número (el orden de los campos es el del esquema de ARCA)
create function public._factura_xml(f public.facturas, p_numero bigint) returns text
language plpgsql stable security definer set search_path = public as $$
declare v_asoc text := ''; o facturas; v_iva text := ''; d jsonb; v_cuit text := (select regexp_replace(cuit, '\D', '', 'g') from datos_legales);
begin
  if f.clase = 'nota_credito' then
    select * into o from facturas where id = f.factura_id;
    v_asoc := '<ar:CbtesAsoc><ar:CbteAsoc><ar:Tipo>' || o.cbte_tipo || '</ar:Tipo><ar:PtoVta>' || o.punto_venta || '</ar:PtoVta><ar:Nro>' || o.numero
      || '</ar:Nro><ar:Cuit>' || v_cuit || '</ar:Cuit><ar:CbteFch>' || to_char(o.fecha, 'YYYYMMDD') || '</ar:CbteFch></ar:CbteAsoc></ar:CbtesAsoc>';
  end if;
  if f.letra <> 'C' and jsonb_array_length(f.detalle_iva) > 0 then
    v_iva := '<ar:Iva>';
    for d in select * from jsonb_array_elements(f.detalle_iva) loop
      v_iva := v_iva || '<ar:AlicIva><ar:Id>' || _arca_alicuota_id((d ->> 'alicuota')::numeric) || '</ar:Id><ar:BaseImp>' || _arca_num((d ->> 'base')::numeric)
        || '</ar:BaseImp><ar:Importe>' || _arca_num((d ->> 'iva')::numeric) || '</ar:Importe></ar:AlicIva>';
    end loop;
    v_iva := v_iva || '</ar:Iva>';
  end if;
  return '<ar:FeCAEReq><ar:FeCabReq><ar:CantReg>1</ar:CantReg><ar:PtoVta>' || f.punto_venta || '</ar:PtoVta><ar:CbteTipo>' || f.cbte_tipo || '</ar:CbteTipo></ar:FeCabReq>'
    || '<ar:FeDetReq><ar:FECAEDetRequest><ar:Concepto>1</ar:Concepto><ar:DocTipo>' || f.doc_tipo || '</ar:DocTipo><ar:DocNro>' || f.doc_nro || '</ar:DocNro>'
    || '<ar:CbteDesde>' || p_numero || '</ar:CbteDesde><ar:CbteHasta>' || p_numero || '</ar:CbteHasta><ar:CbteFch>' || to_char(f.fecha, 'YYYYMMDD') || '</ar:CbteFch>'
    || '<ar:ImpTotal>' || _arca_num(f.total) || '</ar:ImpTotal><ar:ImpTotConc>0.00</ar:ImpTotConc><ar:ImpNeto>' || _arca_num(f.neto) || '</ar:ImpNeto>'
    || '<ar:ImpOpEx>0.00</ar:ImpOpEx><ar:ImpTrib>0.00</ar:ImpTrib><ar:ImpIVA>' || _arca_num(f.iva) || '</ar:ImpIVA>'
    || '<ar:MonId>PES</ar:MonId><ar:MonCotiz>1</ar:MonCotiz><ar:CondicionIVAReceptorId>' || f.condicion_iva_receptor || '</ar:CondicionIVAReceptorId>'
    || v_asoc || v_iva || '</ar:FECAEDetRequest></ar:FeDetReq></ar:FeCAEReq>';
end $$;

-- ¿El comprobante que ARCA tiene con ese número es esta factura? (mismo total, documento y fecha)
create function public._factura_coincide(p_xml text, f public.facturas) returns boolean
language sql immutable set search_path = public as $$
  select _xml_texto(p_xml, 'CodAutorizacion') is not null
     and _xml_texto(p_xml, 'ImpTotal')::numeric = f.total
     and _xml_texto(p_xml, 'DocNro') = f.doc_nro
     and _xml_texto(p_xml, 'CbteFch') = to_char(f.fecha, 'YYYYMMDD')
$$;

-- Espera antes del próximo intento automático: 1, 2, 5, 10, 30 minutos y después cada hora
create function public._factura_espera(p_intentos int) returns interval language sql immutable as $$
  select case when p_intentos <= 1 then interval '1 minute' when p_intentos = 2 then interval '2 minutes' when p_intentos = 3 then interval '5 minutes'
              when p_intentos = 4 then interval '10 minutes' when p_intentos = 5 then interval '30 minutes' else interval '1 hour' end
$$;

-- Toma como propio un comprobante que ARCA ya autorizó (recuperación de un corte)
create function public._factura_adoptar(p_factura bigint, p_numero bigint, p_xml text) returns void
language sql security definer set search_path = public as $$
  update facturas set numero = p_numero, numero_intentado = p_numero, cae = _xml_texto(p_xml, 'CodAutorizacion'),
         cae_vence = to_date(_xml_texto(p_xml, 'FchVto'), 'YYYYMMDD'), estado = 'autorizada', autorizada_en = now(), ultimo_error = null,
         observaciones = 'Recuperada: ARCA ya la había autorizado', proximo_intento = null
   where id = p_factura
$$;

-- ── Mandar una factura a ARCA. Nunca lanza errores: todo queda en la factura. ──
create function public._factura_enviar(p_factura bigint) returns void
language plpgsql security definer set search_path = public as $$
declare f facturas; v_err text; v_xml text; v_ult bigint; v_num bigint; v_res text; v_msgs text; v_madre text;
begin
  select * into f from facturas where id = p_factura for update;
  if not found or f.estado not in ('pendiente', 'error', 'rechazada') then return; end if;
  if f.ambiente <> (select ambiente from configuracion_fiscal) then
    update facturas set estado = 'error', ultimo_error = 'La factura es de otro ambiente (pruebas o producción) que el que está configurado ahora', proximo_intento = null where id = p_factura;
    return;
  end if;
  -- Una nota de crédito espera a que su factura esté autorizada
  if f.clase = 'nota_credito' then
    select estado into v_madre from facturas where id = f.factura_id;
    if v_madre <> 'autorizada' then
      update facturas set proximo_intento = now() + interval '5 minutes', ultimo_error = 'Espera a que se autorice la factura' where id = p_factura;
      return;
    end if;
  end if;
  update facturas set intentos = intentos + 1 where id = p_factura;
  f.intentos := f.intentos + 1;

  -- 1. El acceso, en su propio bloque: si llega, queda guardado aunque después falle el envío
  begin
    perform _arca_acceso();
  exception when others then v_err := sqlerrm;
  end;
  if v_err is not null then
    update facturas set estado = 'error', ultimo_error = v_err, proximo_intento = now() + _factura_espera(f.intentos) where id = p_factura;
    return;
  end if;

  -- 2. Numerar y mandar, de a una por punto de venta y tipo (dos cajas a la vez esperan su turno)
  perform pg_advisory_xact_lock(7101, f.punto_venta * 100 + f.cbte_tipo);
  begin
    v_xml := _arca_wsfe('FECompUltimoAutorizado', '<ar:PtoVta>' || f.punto_venta || '</ar:PtoVta><ar:CbteTipo>' || f.cbte_tipo || '</ar:CbteTipo>');
    v_ult := _xml_texto(v_xml, 'CbteNro')::bigint;
    if v_ult is null then raise exception 'ARCA no dijo cuál es el último número: %', coalesce(_arca_mensajes(v_xml), 'sin detalle'); end if;

    -- ¿Un intento anterior llegó a ARCA y se cortó antes de guardar la respuesta?
    if f.numero_intentado is not null and f.numero_intentado <= v_ult then
      v_xml := _arca_wsfe('FECompConsultar', '<ar:FeCompConsReq><ar:CbteTipo>' || f.cbte_tipo || '</ar:CbteTipo><ar:CbteNro>' || f.numero_intentado
        || '</ar:CbteNro><ar:PtoVta>' || f.punto_venta || '</ar:PtoVta></ar:FeCompConsReq>');
      if _factura_coincide(v_xml, f) then perform _factura_adoptar(p_factura, f.numero_intentado, v_xml); return; end if;
    end if;
    -- ¿El último de ARCA no lo tenemos registrado? Puede ser esta misma factura (el intento se deshizo entero)
    if v_ult > 0 and not exists (select 1 from facturas where ambiente = f.ambiente and cbte_tipo = f.cbte_tipo and punto_venta = f.punto_venta and numero = v_ult) then
      v_xml := _arca_wsfe('FECompConsultar', '<ar:FeCompConsReq><ar:CbteTipo>' || f.cbte_tipo || '</ar:CbteTipo><ar:CbteNro>' || v_ult
        || '</ar:CbteNro><ar:PtoVta>' || f.punto_venta || '</ar:PtoVta></ar:FeCompConsReq>');
      if _factura_coincide(v_xml, f) then perform _factura_adoptar(p_factura, v_ult, v_xml); return; end if;
    end if;

    v_num := v_ult + 1;
    update facturas set numero_intentado = v_num where id = p_factura;
    v_xml := _arca_wsfe('FECAESolicitar', _factura_xml(f, v_num));
    v_res := coalesce(_xml_texto(v_xml, 'Resultado'), 'R');
    v_msgs := _arca_mensajes(v_xml);
    if v_res = 'A' and _xml_texto(v_xml, 'CAE') is not null then
      update facturas set numero = v_num, cae = _xml_texto(v_xml, 'CAE'), cae_vence = to_date(_xml_texto(v_xml, 'CAEFchVto'), 'YYYYMMDD'),
             estado = 'autorizada', autorizada_en = now(), observaciones = v_msgs, ultimo_error = null, proximo_intento = null
       where id = p_factura;
    elsif v_msgs ~ '10016' then
      -- El número no era el próximo (otro sistema emitió en el medio): se reintenta solo, con el nuevo último
      update facturas set estado = 'error', numero_intentado = null, ultimo_error = 'ARCA: ' || v_msgs, proximo_intento = now() + interval '1 minute' where id = p_factura;
    else
      -- ARCA dijo que no: hay que corregir el dato (no se reintenta solo)
      update facturas set estado = 'rechazada', numero_intentado = null, ultimo_error = 'ARCA: ' || coalesce(v_msgs, 'rechazó la factura sin decir por qué'), proximo_intento = null
       where id = p_factura;
    end if;
  exception when others then
    -- Sin respuesta, o respuesta rara: queda en la cola (lo que se haya mandado se recupera en el próximo intento)
    update facturas set estado = 'error', ultimo_error = sqlerrm, proximo_intento = now() + _factura_espera(f.intentos) where id = p_factura;
  end;
end $$;

-- Lo que la pantalla necesita saber de una factura (sin nada interno)
create function public._factura_resumen(p_factura bigint) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', id, 'clase', clase, 'estado', estado, 'letra', letra, 'comprobante', comprobante, 'cae', cae, 'cae_vence', cae_vence,
    'total', total, 'error', ultimo_error, 'proximo_intento', proximo_intento, 'ambiente', ambiente)
  from facturas where id = p_factura
$$;

-- ── Facturar una venta ──────────────────────────────────────────────────
-- Arma la factura (letra, receptor, importes) y la manda. Si ARCA no contesta, queda en la cola y se reintenta sola.
create function public.facturar_venta(p_venta bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v ventas; c configuracion_fiscal; l datos_legales; cl clientes; v_letra text; v_imp jsonb; v_pv int; v_doc_tipo int := 99; v_doc_nro text := '0'; v_id bigint;
        v_receptor text := 'A consumidor final'; v_dni text;
begin
  if not tiene_permiso('facturas.emitir') then raise exception 'No tenés permiso para facturar'; end if;
  select * into c from configuracion_fiscal; select * into l from datos_legales;
  if not c.activa then raise exception 'La facturación con ARCA no está activa (Integraciones → ARCA)'; end if;
  select * into v from ventas where id = p_venta;
  if not found or not (tiene_permiso('ventas.ver_todas') or v.usuario_id = auth.uid()) then raise exception 'Esa venta no existe'; end if;
  if v.anulada_en is not null then raise exception 'La venta está anulada'; end if;
  if exists (select 1 from facturas where venta_id = p_venta and clase = 'factura' and estado <> 'cancelada') then
    raise exception 'Esta venta ya tiene factura';
  end if;
  v_letra := _factura_letra();
  if v_letra is null then raise exception 'Falta la categoría de IVA del local (Integraciones → ARCA, paso 1)'; end if;
  select numero into v_pv from puntos_venta_fiscales where ambiente = c.ambiente and por_defecto and activo and not bloqueado and baja is null;
  if v_pv is null then raise exception 'Falta elegir el punto de venta de siempre (Integraciones → ARCA)'; end if;
  v_imp := _factura_importes(p_venta, v_letra);

  -- Receptor: consumidor final; con DNI si el cliente lo tiene cargado, y obligatorio desde el umbral de la norma
  if v.cliente_id is not null then
    select * into cl from clientes where id = v.cliente_id;
    v_dni := regexp_replace(coalesce(cl.documento, ''), '\D', '', 'g');
    if v_dni ~ '^\d{7,8}$' then v_doc_tipo := 96; v_doc_nro := ltrim(v_dni, '0'); v_receptor := cl.nombre; end if;
  end if;
  if v_doc_tipo = 99 and (v_imp ->> 'total')::numeric >= c.umbral_identificacion then
    raise exception 'Para facturar % o más a consumidor final, ARCA pide el DNI: cargalo en la ficha del cliente de esta venta', '$ ' || replace(to_char(c.umbral_identificacion, 'FM999,999,999'), ',', '.');
  end if;

  insert into facturas (ambiente, letra, cbte_tipo, punto_venta, venta_id, cliente_id, receptor, doc_tipo, doc_nro, condicion_iva_receptor, fecha,
                        total, neto, iva, detalle_iva, creada_por)
  values (c.ambiente, v_letra, case v_letra when 'A' then 1 when 'B' then 6 else 11 end, v_pv, p_venta, v.cliente_id, v_receptor, v_doc_tipo, v_doc_nro, 5,
          (now() at time zone 'America/Argentina/Buenos_Aires')::date,
          (v_imp ->> 'total')::numeric, (v_imp ->> 'neto')::numeric, (v_imp ->> 'iva')::numeric, v_imp -> 'detalle', auth.uid())
  returning id into v_id;
  perform _factura_enviar(v_id);
  return _factura_resumen(v_id);
end $$;

-- Reintento a mano (una rechazada, después de corregir el dato; o una que quedó en la cola)
create function public.reintentar_factura(p_factura bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare f facturas;
begin
  if not tiene_permiso('facturas.emitir') then raise exception 'No tenés permiso para facturar'; end if;
  select * into f from facturas where id = p_factura;
  if not found or not exists (select 1 from ventas where id = f.venta_id and (tiene_permiso('ventas.ver_todas') or usuario_id = auth.uid())) then raise exception 'Esa factura no existe'; end if;
  if f.estado not in ('pendiente', 'error', 'rechazada') then raise exception 'Esa factura no está para reintentar'; end if;
  perform _factura_enviar(p_factura);
  return _factura_resumen(p_factura);
end $$;

-- Cola: pg_cron cada minuto manda las pendientes y las que quedaron en error (las rechazadas esperan a que alguien corrija el dato)
create function public._facturas_reintentar() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  if not (select activa from configuracion_fiscal) then return 0; end if;
  for r in select id from facturas where estado in ('pendiente', 'error') and proximo_intento <= now() order by clase, id limit 20 loop
    perform _factura_enviar(r.id);
    n := n + 1;
  end loop;
  return n;
end $$;
select cron.schedule('arca-facturas-cola', '* * * * *', $$select public._facturas_reintentar()$$);

-- ── Anular una venta facturada ──────────────────────────────────────────
-- Factura autorizada → nota de crédito por el total (la manda la cola en el próximo minuto). Factura que nunca llegó a ARCA → se cancela.
create function public._factura_al_anular() returns trigger
language plpgsql security definer set search_path = public as $$
declare f facturas;
begin
  select * into f from facturas where venta_id = new.id and clase = 'factura' and estado <> 'cancelada';
  if not found then return new; end if;
  if f.estado = 'autorizada' then
    insert into facturas (clase, ambiente, letra, cbte_tipo, punto_venta, venta_id, factura_id, cliente_id, receptor, doc_tipo, doc_nro, condicion_iva_receptor,
                          fecha, total, neto, iva, detalle_iva, creada_por)
    values ('nota_credito', f.ambiente, f.letra, case f.letra when 'A' then 3 when 'B' then 8 else 13 end, f.punto_venta, f.venta_id, f.id, f.cliente_id, f.receptor,
            f.doc_tipo, f.doc_nro, f.condicion_iva_receptor, (now() at time zone 'America/Argentina/Buenos_Aires')::date, f.total, f.neto, f.iva, f.detalle_iva, auth.uid())
    on conflict do nothing;
  else
    update facturas set estado = 'cancelada', proximo_intento = null, ultimo_error = 'Venta anulada antes de que ARCA autorizara la factura' where id = f.id;
  end if;
  return new;
end $$;
create trigger ventas_factura_al_anular after update of anulada_en on public.ventas
  for each row when (old.anulada_en is null and new.anulada_en is not null) execute function public._factura_al_anular();

-- ── Activar la facturación ──────────────────────────────────────────────
create function public.arca_activar(p_activa boolean, p_modo text default null, p_serie text default null) returns void
language plpgsql security definer set search_path = public as $$
declare c configuracion_fiscal; i integraciones; l datos_legales;
begin
  if not tiene_permiso('equipo.administrar') then raise exception 'Solo el administrador configura la facturación'; end if;
  select * into c from configuracion_fiscal; select * into i from integraciones; select * into l from datos_legales;
  if p_modo is not null and p_modo not in ('todas', 'elegir') then raise exception 'Modo inválido'; end if;
  if p_serie is not null and p_serie not in ('fiscal', 'interna') then raise exception 'Serie inválida'; end if;
  if p_activa then
    if not _cuit_valido(l.cuit) or l.razon_social is null or l.condicion_iva is null then raise exception 'Faltan los datos fiscales (paso 1)'; end if;
    if (case c.ambiente when 'produccion' then i.arca_cert_produccion else i.arca_cert_homologacion end) is null or i.arca_clave_vault_id is null then
      raise exception 'Falta el certificado de este ambiente (pasos 2 y 3)';
    end if;
    if not exists (select 1 from puntos_venta_fiscales where ambiente = c.ambiente and por_defecto and activo and not bloqueado and baja is null) then
      raise exception 'Falta elegir el punto de venta de siempre (paso 4)';
    end if;
  end if;
  update configuracion_fiscal set activa = p_activa, modo = coalesce(p_modo, modo), serie_por_defecto = coalesce(p_serie, serie_por_defecto),
         actualizado_en = now(), actualizado_por = auth.uid() where unica;
end $$;

-- arca_estado: suma lo de la facturación (modo, pendientes, rechazadas)
create or replace function public.arca_estado() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare i integraciones; l datos_legales; c configuracion_fiscal; v_cert_vence timestamptz;
begin
  if not tiene_permiso('equipo.administrar') then raise exception 'Solo el administrador configura la facturación'; end if;
  select * into i from integraciones; select * into l from datos_legales; select * into c from configuracion_fiscal;
  v_cert_vence := case c.ambiente when 'produccion' then i.arca_cert_produccion_vence else i.arca_cert_homologacion_vence end;
  return jsonb_build_object(
    'ambiente', c.ambiente, 'activa', c.activa, 'modo', c.modo, 'serie_por_defecto', c.serie_por_defecto, 'letra', _factura_letra(),
    'datos', jsonb_build_object('cuit', l.cuit, 'cuit_valido', _cuit_valido(l.cuit), 'razon_social', l.razon_social, 'condicion_iva', l.condicion_iva,
      'domicilio', l.domicilio_legal, 'ingresos_brutos', l.ingresos_brutos, 'inicio_actividades', l.inicio_actividades),
    'configuracion', jsonb_build_object('alicuota_por_defecto', c.alicuota_por_defecto, 'umbral_identificacion', c.umbral_identificacion, 'iva_contenido_en_c', c.iva_contenido_en_c),
    'sitio', i.sitio_url is not null,
    'llave', i.arca_clave_vault_id is not null, 'pedido_pendiente', i.arca_clave_nueva_vault_id is not null, 'csr', case when i.arca_clave_nueva_vault_id is not null then i.arca_csr end,
    'certificado', jsonb_build_object('homologacion', i.arca_cert_homologacion_vence, 'produccion', i.arca_cert_produccion_vence),
    'certificado_vence', v_cert_vence,
    'acceso_vigente', i.arca_token is not null and i.arca_token_ambiente = c.ambiente and i.arca_token_vence > now(),
    'acceso_vence', case when i.arca_token_ambiente = c.ambiente then i.arca_token_vence end,
    'ultimo_error', i.arca_ultimo_error, 'probado_en', i.arca_probado_en,
    'facturas', jsonb_build_object(
      'autorizadas', (select count(*) from facturas where ambiente = c.ambiente and estado = 'autorizada'),
      'en_cola', (select count(*) from facturas where ambiente = c.ambiente and estado in ('pendiente', 'error')),
      'rechazadas', (select count(*) from facturas where ambiente = c.ambiente and estado = 'rechazada'),
      'ultima_rechazada', (select ultimo_error from facturas where ambiente = c.ambiente and estado = 'rechazada' order by id desc limit 1)));
end $$;

-- Lo que necesita la caja para ofrecer «Factura» (cualquiera del equipo; sin secretos)
create function public.facturacion_caja() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not es_staff() then null else jsonb_build_object('activa', c.activa, 'modo', c.modo, 'serie_por_defecto', c.serie_por_defecto,
    'letra', _factura_letra(), 'ambiente', c.ambiente, 'puede', tiene_permiso('facturas.emitir'), 'umbral', c.umbral_identificacion) end
  from configuracion_fiscal c
$$;

-- ── El comprobante con los datos fiscales ───────────────────────────────
-- La factura de una venta (y su nota de crédito si la hay) para dibujarla: letra, código, número, CAE y el QR de ARCA.
create function public._factura_fiscal(p_venta bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare f facturas; n facturas; l datos_legales; c configuracion_fiscal; v_qr jsonb; v_cuit text;
begin
  select * into f from facturas where venta_id = p_venta and clase = 'factura' and estado <> 'cancelada' order by id desc limit 1;
  if not found then return null; end if;
  select * into n from facturas where factura_id = f.id and clase = 'nota_credito' and estado <> 'cancelada' order by id desc limit 1;
  select * into l from datos_legales; select * into c from configuracion_fiscal;
  v_cuit := regexp_replace(coalesce(l.cuit, ''), '\D', '', 'g');
  if f.estado = 'autorizada' then
    -- QR de ARCA (RG 4291): https://www.afip.gob.ar/fe/qr/?p= + JSON en base64 (verificar la versión vigente)
    v_qr := jsonb_build_object('ver', 1, 'fecha', to_char(f.fecha, 'YYYY-MM-DD'), 'cuit', v_cuit::bigint, 'ptoVta', f.punto_venta, 'tipoCmp', f.cbte_tipo,
      'nroCmp', f.numero, 'importe', f.total, 'moneda', 'PES', 'ctz', 1, 'tipoDocRec', f.doc_tipo, 'nroDocRec', f.doc_nro::bigint, 'tipoCodAut', 'E', 'codAut', f.cae::bigint);
  end if;
  return jsonb_build_object(
    'estado', f.estado, 'letra', f.letra, 'codigo', lpad(f.cbte_tipo::text, 3, '0'), 'comprobante', f.comprobante, 'fecha', f.fecha,
    'cae', f.cae, 'cae_vence', f.cae_vence, 'receptor', f.receptor, 'doc_tipo', f.doc_tipo, 'doc_nro', f.doc_nro,
    'condicion_receptor', 'Consumidor final', 'neto', f.neto, 'iva', f.iva, 'detalle_iva', f.detalle_iva, 'total', f.total,
    'iva_contenido_en_c', c.iva_contenido_en_c, 'pruebas', f.ambiente = 'homologacion',
    'qr', case when v_qr is not null then 'https://www.afip.gob.ar/fe/qr/?p=' || translate(encode(convert_to(v_qr::text, 'UTF8'), 'base64'), E'\n', '') end,
    'emisor', jsonb_build_object('razon_social', l.razon_social, 'cuit', l.cuit, 'condicion_iva', l.condicion_iva, 'ingresos_brutos', l.ingresos_brutos,
      'inicio_actividades', l.inicio_actividades, 'domicilio', l.domicilio_legal),
    'nota_credito', case when n.id is not null then jsonb_build_object('estado', n.estado, 'letra', n.letra, 'codigo', lpad(n.cbte_tipo::text, 3, '0'),
      'comprobante', n.comprobante, 'cae', n.cae, 'cae_vence', n.cae_vence, 'fecha', n.fecha) end);
end $$;

create or replace function public._comprobante_json(p_tipo text, p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t configuracion_tienda; l datos_legales; c configuracion_impresion; u impresion_por_usuario; v_doc jsonb;
begin
  v_doc := case p_tipo when 'venta' then _comprobante_venta(p_id) when 'presupuesto' then _comprobante_presupuesto(p_id) when 'devolucion' then _comprobante_devolucion(p_id) end;
  if v_doc is null then return null; end if;
  select * into t from configuracion_tienda; select * into l from datos_legales; select * into c from configuracion_impresion;
  select * into u from impresion_por_usuario where usuario_id = auth.uid();
  return v_doc || jsonb_build_object(
    'emisor', jsonb_build_object('nombre', t.nombre, 'logo_url', coalesce(t.logo_url, t.icono_url), 'es_icono', t.logo_url is null and t.icono_url is not null,
      'razon_social', l.razon_social, 'cuit', l.cuit, 'condicion_iva', l.condicion_iva,
      'domicilio', l.domicilio_legal, 'telefono', l.telefono_contacto, 'email', l.email_contacto, 'local', t.direccion_retiro),
    'config', jsonb_build_object('formato', coalesce(u.comprobante_formato, c.comprobante_formato), 'logo', c.comprobante_logo, 'datos_legales', c.comprobante_datos_legales,
      'qr', c.comprobante_qr, 'barras', c.comprobante_codigo_barras, 'copias', coalesce(u.comprobante_copias, c.comprobante_copias),
      'modo', coalesce(u.modo_impresion, c.modo_impresion), 'configurado', c.comprobante_configurado,
      'letra', c.comprobante_letra, 'encabezado', c.comprobante_encabezado, 'mostrar_cliente', c.comprobante_mostrar_cliente,
      'mostrar_vendedor', c.comprobante_mostrar_vendedor, 'mostrar_marca', c.comprobante_mostrar_marca),
    'leyenda', coalesce(v_doc ->> 'leyenda', c.comprobante_leyenda), 'pie', coalesce(v_doc ->> 'pie', c.comprobante_pie),
    'fiscal', case when p_tipo = 'venta' then _factura_fiscal(p_id) end);
end $$;

-- ── Tiempo: ARCA puede tardar más que los 8 segundos de la API ──
alter function public.facturar_venta(bigint) set statement_timeout = '55s';
alter function public.reintentar_factura(bigint) set statement_timeout = '55s';

-- ── Permisos de ejecución ───────────────────────────────────────────────
revoke execute on function public._alicuota_de(bigint), public._venta_item_alicuota(), public._arca_num(numeric), public._arca_mensajes(text), public._arca_alicuota_id(numeric),
  public._factura_letra(), public._factura_importes(bigint, text), public._factura_xml(public.facturas, bigint), public._factura_coincide(text, public.facturas),
  public._factura_espera(int), public._factura_adoptar(bigint, bigint, text), public._factura_enviar(bigint), public._factura_resumen(bigint), public._facturas_reintentar(),
  public._factura_al_anular(), public._factura_fiscal(bigint) from public, anon, authenticated;
revoke execute on function public.facturar_venta(bigint), public.reintentar_factura(bigint), public.arca_activar(boolean, text, text), public.facturacion_caja() from public, anon;
grant  execute on function public.facturar_venta(bigint), public.reintentar_factura(bigint), public.arca_activar(boolean, text, text), public.facturacion_caja() to authenticated;
