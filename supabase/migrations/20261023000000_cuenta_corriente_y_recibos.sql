-- Cuenta corriente de clientes y recibos de cobro (Fase C del plan de cuentas).
--
-- Permite que los clientes compren a crédito («anotámelo en cuenta») como medio de pago en el local,
-- activable como parámetro desde la configuración.
-- Cada venta a cuenta corriente suma deuda (debe); cada recibo de cobro baja la deuda (haber).
-- Se integra con la contabilidad automática (asiento de cobro con contrapartida en Deudores por ventas).

-- ── 1. Parámetro en la configuración ──────────────────────────────────────
alter table public.configuracion_tienda
  add column if not exists cuenta_corriente_clientes boolean not null default false;

-- ── 2. Medio de pago «Cuenta corriente» ──────────────────────────────────
alter table public.medios_pago
  add column if not exists es_cuenta_corriente boolean not null default false;

-- Si no existe el medio, se crea; si ya existe, se marca como cuenta corriente
insert into public.medios_pago (codigo, nombre, tipo, ajuste_pct, cuotas, en_mostrador, en_tienda, siempre_factura, activo, es_saldo, es_cuenta_corriente, orden)
values ('CTA_CTE', 'Cuenta corriente', 'Cuenta corriente', 0, 1, true, false, false, true, false, true, 80)
on conflict (codigo) do update set es_cuenta_corriente = true, en_mostrador = true;

-- Asignar la cuenta contable de deudores si existe el plan de cuentas
do $$
declare v_cta bigint;
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'cuentas') then
    select id into v_cta from public.cuentas where clave = 'deudores_ventas' and activa limit 1;
    if v_cta is not null then
      update public.medios_pago set cuenta_id = v_cta where es_cuenta_corriente;
    end if;
  end if;
end $$;

-- ── 3. Numerador de Recibos ───────────────────────────────────────────────
insert into public.numeradores (tipo) values ('REC') on conflict do nothing;

-- ── 4. Recibos de cobro ───────────────────────────────────────────────────
create table if not exists public.recibos (
  id             bigint generated always as identity primary key,
  punto_venta    int not null default 1,
  numero         int,
  comprobante    text generated always as (lpad(punto_venta::text, 4, '0') || '-' || lpad(numero::text, 8, '0')) stored,
  fecha          timestamptz not null default now(),
  cliente_id     bigint not null references public.clientes (id) on delete restrict,
  total          numeric(12,2) not null check (total > 0),
  notas          text,
  anulado_en     timestamptz,
  anulado_motivo text,
  usuario_id     uuid default auth.uid() references public.perfiles (id) on delete set null,
  creado_en      timestamptz not null default now(),
  unique (punto_venta, numero)
);
create index if not exists recibos_cliente_id_idx on public.recibos (cliente_id);
create index if not exists recibos_fecha_idx on public.recibos (fecha);

drop trigger if exists numero on public.recibos;
create trigger numero before insert on public.recibos for each row execute function public._numerar('REC');

alter table public.recibos enable row level security;
drop policy if exists "ve recibos" on public.recibos;
create policy "ve recibos" on public.recibos for select to authenticated
  using (tiene_permiso('ventas.ver_todas') or tiene_permiso('ventas.registrar') or tiene_permiso('clientes.ver'));

-- Desglose de medios con los que se pagó el recibo (efectivo, transferencia, débito...)
create table if not exists public.recibo_pagos (
  id             bigint generated always as identity primary key,
  recibo_id      bigint not null references public.recibos (id) on delete cascade,
  medio_pago_id  bigint not null references public.medios_pago (id) on delete restrict,
  monto          numeric(12,2) not null check (monto > 0),
  referencia     text
);
create index if not exists recibo_pagos_recibo_id_idx on public.recibo_pagos (recibo_id);
create index if not exists recibo_pagos_medio_pago_id_idx on public.recibo_pagos (medio_pago_id);

alter table public.recibo_pagos enable row level security;
drop policy if exists "ve pagos de recibo" on public.recibo_pagos;
create policy "ve pagos de recibo" on public.recibo_pagos for select to authenticated
  using (tiene_permiso('ventas.ver_todas') or tiene_permiso('ventas.registrar') or tiene_permiso('clientes.ver'));

-- ── 5. Movimientos de Cuenta Corriente ───────────────────────────────────
create table if not exists public.cuentas_corrientes_cliente (
  id             bigint generated always as identity primary key,
  fecha          timestamptz not null default now(),
  cliente_id     bigint not null references public.clientes (id) on delete restrict,
  tipo           text not null check (tipo in ('venta', 'recibo', 'ajuste', 'anulacion')),
  venta_id       bigint references public.ventas (id) on delete restrict,
  recibo_id      bigint references public.recibos (id) on delete restrict,
  debe           numeric(12,2) not null default 0 check (debe >= 0),
  haber          numeric(12,2) not null default 0 check (haber >= 0),
  detalle        text,
  usuario_id     uuid default auth.uid() references public.perfiles (id) on delete set null,
  check ((debe > 0 and haber = 0) or (haber > 0 and debe = 0))
);
create index if not exists cc_cliente_id_fecha_idx on public.cuentas_corrientes_cliente (cliente_id, fecha);
create index if not exists cc_venta_id_idx on public.cuentas_corrientes_cliente (venta_id);
create index if not exists cc_recibo_id_idx on public.cuentas_corrientes_cliente (recibo_id);

alter table public.cuentas_corrientes_cliente enable row level security;
drop policy if exists "ve cuenta corriente cliente" on public.cuentas_corrientes_cliente;
create policy "ve cuenta corriente cliente" on public.cuentas_corrientes_cliente for select to authenticated
  using (tiene_permiso('ventas.ver_todas') or tiene_permiso('ventas.registrar') or tiene_permiso('clientes.ver'));

-- Vista de saldos deudores de cuenta corriente por cliente
create or replace view public.v_cuenta_corriente_saldos with (security_invoker = false) as
select
  c.id as cliente_id,
  c.nombre,
  coalesce(sum(cc.debe), 0) as total_debe,
  coalesce(sum(cc.haber), 0) as total_haber,
  coalesce(sum(cc.debe) - sum(cc.haber), 0) as saldo_deudor
from public.clientes c
left join public.cuentas_corrientes_cliente cc on cc.cliente_id = c.id
group by c.id, c.nombre;

revoke select on public.v_cuenta_corriente_saldos from anon;
grant select on public.v_cuenta_corriente_saldos to authenticated;

-- ── 6. Actualización de _registrar_venta para cuenta corriente ────────────
create or replace function public._registrar_venta(
  p_items jsonb, p_pagos jsonb, p_cliente bigint, p_descuento numeric,
  p_canal text, p_deposito bigint, p_notas text
) returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint; it jsonb; v_sub numeric; v_promos numeric; v_acum numeric; v_factor numeric; v_resto numeric;
        v_base numeric; v_pct numeric; v_aj numeric; v_red numeric; v_ajustes numeric := 0; v_pagos jsonb := '[]'; v_medio medios_pago;
        v_dep bigint := coalesce(p_deposito, deposito_principal()); v_disp int;
        v_activa_cc boolean := (select cuenta_corriente_clientes from configuracion_tienda limit 1);
begin
  if jsonb_array_length(p_items) = 0 then raise exception 'La venta no tiene productos'; end if;
  select coalesce(sum((i->>'cantidad')::int * (i->>'precio_unitario')::numeric), 0),
         coalesce(sum(coalesce((i->>'descuento_promo')::numeric, 0)), 0),
         coalesce(sum(case when coalesce((i->>'acumula')::boolean, true)
                           then (i->>'cantidad')::int * (i->>'precio_unitario')::numeric - coalesce((i->>'descuento_promo')::numeric, 0) else 0 end), 0)
    into v_sub, v_promos, v_acum from jsonb_array_elements(p_items) i;
  if coalesce(p_descuento, 0) < 0 then raise exception 'El descuento no puede ser negativo'; end if;
  if p_descuento > v_sub - v_promos then raise exception 'El descuento es mayor que el total'; end if;
  v_factor := case when v_sub - v_promos > 0 then v_acum / (v_sub - v_promos) else 1 end;

  v_resto := v_sub - v_promos - p_descuento;
  for it in select * from jsonb_array_elements(p_pagos) loop
    select * into v_medio from medios_pago where id = (it->>'medio_pago_id')::bigint and activo;
    if not found then raise exception 'Medio de pago inexistente o desactivado'; end if;

    -- Validación de cuenta corriente
    if v_medio.es_cuenta_corriente then
      if not coalesce(v_activa_cc, false) then
        raise exception 'La cuenta corriente de clientes no está habilitada en la configuración';
      end if;
      if p_cliente is null then
        raise exception 'Para vender en cuenta corriente es obligatorio seleccionar un cliente';
      end if;
    end if;

    v_base := coalesce((it->>'base')::numeric, v_resto);
    if v_base <= 0 then continue; end if;
    if v_base > v_resto + 0.01 then raise exception 'Los pagos superan el total'; end if;
    v_pct := coalesce((it->>'ajuste_pct')::numeric, v_medio.ajuste_pct);
    if v_pct not between -100 and 100 then raise exception 'Ajuste de medio de pago inválido'; end if;
    v_aj := round(v_base * v_pct / 100 * v_factor, 2);

    -- Redondeo del efectivo
    v_red := round(coalesce((it->>'redondeo')::numeric, 0), 2);
    if v_red < 0 then raise exception 'El redondeo no puede ser negativo'; end if;
    if v_red > 0 then
      if v_medio.tipo is distinct from 'Efectivo' then raise exception 'Solo se puede redondear lo que se paga en efectivo'; end if;
      if v_red > least(1000, round((v_base + v_aj) * 0.05, 2)) then
        raise exception 'El redondeo es demasiado grande: hasta el 5 %% de lo que se cobra en efectivo y nunca más de $ 1.000';
      end if;
    end if;

    v_pagos := v_pagos || jsonb_build_object('medio_pago_id', v_medio.id, 'base', v_base, 'ajuste_pct', v_pct,
                                             'ajuste', v_aj - v_red, 'redondeo', v_red, 'cuotas', v_medio.cuotas, 'referencia', it->>'referencia');
    v_ajustes := v_ajustes + v_aj - v_red;
    v_resto := v_resto - v_base;
  end loop;

  insert into ventas (cliente_id, deposito_id, canal, subtotal, descuento, descuento_promociones, ajuste_medio_pago, total, notas)
  values (p_cliente, v_dep, p_canal, v_sub, p_descuento, v_promos, v_ajustes, v_sub - p_descuento - v_promos + v_ajustes, p_notas)
  returning id into v_id;

  for it in select * from jsonb_array_elements(p_items) loop
    if (it->>'cantidad')::int <= 0 then raise exception 'Cantidad inválida'; end if;
    select cantidad - reservado into v_disp from stock
     where variante_id = (it->>'variante_id')::bigint and deposito_id = v_dep for update;
    if coalesce(v_disp, 0) < (it->>'cantidad')::int then
      raise exception 'Stock insuficiente: hay % disponibles y se quieren vender %', coalesce(v_disp, 0), it->>'cantidad';
    end if;
    insert into venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario, descuento_promo, promocion_id)
    select v_id, v.id, (it->>'cantidad')::int, (it->>'precio_unitario')::numeric, p.precio_compra,
           coalesce((it->>'descuento_promo')::numeric, 0), (it->>'promocion_id')::bigint
      from variantes v join productos p on p.id = v.producto_id where v.id = (it->>'variante_id')::bigint;
    perform _mover_stock((it->>'variante_id')::bigint, v_dep, -(it->>'cantidad')::int, 'venta', v_id);
  end loop;

  insert into pagos (venta_id, medio_pago_id, base, ajuste_pct, ajuste, redondeo, cuotas, referencia)
  select v_id, (x->>'medio_pago_id')::bigint, (x->>'base')::numeric, (x->>'ajuste_pct')::numeric,
         (x->>'ajuste')::numeric, (x->>'redondeo')::numeric, (x->>'cuotas')::int, x->>'referencia'
    from jsonb_array_elements(v_pagos) x;

  -- Movimiento en cuenta corriente si se cobró con ese medio
  for it in select * from jsonb_array_elements(v_pagos) loop
    select * into v_medio from medios_pago where id = (it->>'medio_pago_id')::bigint;
    if v_medio.es_cuenta_corriente then
      insert into cuentas_corrientes_cliente (cliente_id, tipo, venta_id, debe, haber, detalle)
      values (p_cliente, 'venta', v_id, (it->>'base')::numeric, 0, 'Venta ' || (select comprobante from ventas where id = v_id));
    end if;
  end loop;

  return v_id;
end $$;

-- ── 7. Reversión en anular_venta ──────────────────────────────────────────
create or replace function public.anular_venta(p_venta bigint, p_motivo text, p_comentario text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v ventas; it record; v_ped pedidos; v_cc_monto numeric;
begin
  if not tiene_permiso('ventas.anular') then raise exception 'No tenés permiso para anular ventas'; end if;
  select * into v from ventas where id = p_venta for update;
  if not found then raise exception 'La venta no existe'; end if;
  if v.anulada_en is not null then raise exception 'Esta venta ya está anulada'; end if;
  if (v.fecha at time zone 'America/Argentina/Buenos_Aires')::date <> (now() at time zone 'America/Argentina/Buenos_Aires')::date then
    raise exception 'Solo se puede anular una venta del día. Para una de otro día, hacé una devolución';
  end if;
  if p_motivo is null or p_motivo not in ('error_carga', 'duplicada', 'arrepentido', 'otro') then raise exception 'Elegí el motivo de la anulación'; end if;
  if p_motivo = 'otro' and coalesce(trim(p_comentario), '') = '' then raise exception 'Contá qué pasó (el motivo es «otro»)'; end if;

  -- Vuelve todo el stock al depósito de la venta
  for it in select variante_id, sum(cantidad)::int as cantidad from venta_items where venta_id = p_venta group by variante_id loop
    perform _mover_stock(it.variante_id, v.deposito_id, it.cantidad, 'anulacion', p_venta, null, 'Anulación de la venta ' || v.comprobante);
  end loop;

  update ventas set anulada_en = now(), anulada_por = auth.uid(), motivo_anulacion = p_motivo,
                    comentario_anulacion = nullif(trim(p_comentario), '')
   where id = p_venta;

  -- Reversión de cuenta corriente si se había pagado con cuenta corriente
  for it in select p.base from pagos p join medios_pago m on m.id = p.medio_pago_id where p.venta_id = p_venta and m.es_cuenta_corriente loop
    insert into cuentas_corrientes_cliente (cliente_id, tipo, venta_id, debe, haber, detalle)
    values (v.cliente_id, 'anulacion', p_venta, 0, it.base, 'Anulación de venta ' || v.comprobante);
  end loop;

  -- Si venía de un pedido web
  if v.pedido_id is not null then
    select * into v_ped from pedidos where id = v.pedido_id for update;
    update ventas set pedido_id = null where id = p_venta;
    if p_motivo = 'arrepentido' then
      update pedidos set estado = 'cancelado', motivo_cancelacion = 'arrepentido', cancelado_por = 'local' where id = v_ped.id;
      insert into pedido_estados (pedido_id, estado, comentario) values (v_ped.id, 'cancelado', null);
    else
      for it in select variante_id, sum(cantidad)::int as cantidad from pedido_items where pedido_id = v_ped.id group by variante_id loop
        update stock set reservado = reservado + it.cantidad where variante_id = it.variante_id and deposito_id = v_ped.deposito_id;
      end loop;
    end if;
  end if;
end $$;

-- ── 8. Función para registrar Recibos de Cobro ───────────────────────────
create or replace function public.registrar_recibo(
  p_cliente bigint,
  p_pagos jsonb,
  p_notas text default null
) returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
  v_total numeric := 0;
  it jsonb;
  v_medio medios_pago;
  v_asiento_lineas jsonb := '[]';
  v_cta_deudores bigint;
begin
  if not (tiene_permiso('ventas.registrar') or tiene_permiso('clientes.editar')) then
    raise exception 'No tenés permiso para registrar recibos de cobro';
  end if;
  if not exists (select 1 from clientes where id = p_cliente) then
    raise exception 'Cliente no encontrado';
  end if;
  if jsonb_array_length(p_pagos) = 0 then
    raise exception 'El recibo debe tener al menos un medio de cobro';
  end if;

  -- Validar medios de pago y calcular total
  for it in select * from jsonb_array_elements(p_pagos) loop
    if coalesce((it->>'monto')::numeric, 0) <= 0 then
      raise exception 'Monto de pago inválido';
    end if;
    select * into v_medio from medios_pago where id = (it->>'medio_pago_id')::bigint and activo;
    if not found then
      raise exception 'Medio de pago inexistente o inactivo';
    end if;
    if v_medio.es_cuenta_corriente then
      raise exception 'No podés pagar un recibo de cuenta corriente con cuenta corriente';
    end if;
    v_total := v_total + (it->>'monto')::numeric;
  end loop;

  -- Insertar recibo
  insert into recibos (cliente_id, total, notas)
  values (p_cliente, v_total, nullif(trim(p_notas), ''))
  returning id into v_id;

  -- Insertar pagos del recibo
  for it in select * from jsonb_array_elements(p_pagos) loop
    insert into recibo_pagos (recibo_id, medio_pago_id, monto, referencia)
    values (v_id, (it->>'medio_pago_id')::bigint, (it->>'monto')::numeric, nullif(trim(it->>'referencia'), ''));
  end loop;

  -- Insertar en cuenta corriente (haber = baja la deuda)
  insert into cuentas_corrientes_cliente (cliente_id, tipo, recibo_id, debe, haber, detalle)
  values (p_cliente, 'recibo', v_id, 0, v_total, 'Recibo ' || (select comprobante from recibos where id = v_id));

  -- Asiento contable automático (Fase C)
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'configuracion_contable') then
    if exists (select 1 from configuracion_contable where inicio is not null and inicio <= current_date) then
      v_cta_deudores := _cta('deudores_ventas');
      for it in select * from jsonb_array_elements(p_pagos) loop
        select * into v_medio from medios_pago where id = (it->>'medio_pago_id')::bigint;
        v_asiento_lineas := v_asiento_lineas || jsonb_build_object(
          'cuenta', coalesce(v_medio.cuenta_id, _cta('caja')),
          'debe', (it->>'monto')::numeric,
          'haber', 0,
          'detalle', 'Cobro ' || v_medio.nombre
        );
      end loop;
      v_asiento_lineas := v_asiento_lineas || jsonb_build_object(
        'cuenta', v_cta_deudores,
        'debe', 0,
        'haber', v_total,
        'detalle', 'Cobro cuenta corriente ' || (select nombre from clientes where id = p_cliente)
      );
      perform _asentar('recibo', v_id, current_date, 'Recibo ' || (select comprobante from recibos where id = v_id), v_asiento_lineas);
    end if;
  end if;

  return v_id;
end $$;

-- ── 9. Función para anular Recibos ────────────────────────────────────────
create or replace function public.anular_recibo(
  p_recibo bigint,
  p_motivo text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  r recibos;
  v_asiento_id bigint;
begin
  if not (tiene_permiso('ventas.registrar') or tiene_permiso('clientes.editar')) then
    raise exception 'No tenés permiso para anular recibos';
  end if;
  select * into r from recibos where id = p_recibo;
  if not found then raise exception 'Recibo no encontrado'; end if;
  if r.anulado_en is not null then raise exception 'El recibo ya estaba anulado'; end if;

  update recibos set anulado_en = now(), anulado_motivo = p_motivo where id = p_recibo;

  -- Movimiento compensatorio en cuenta corriente (debe = vuelve a subir la deuda)
  insert into cuentas_corrientes_cliente (cliente_id, tipo, recibo_id, debe, haber, detalle)
  values (r.cliente_id, 'anulacion', p_recibo, r.total, 0, 'Anulación de recibo ' || r.comprobante);

  -- Contra-asiento si existía asiento contable
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'asientos') then
    select id into v_asiento_id from asientos where origen = 'recibo' and documento_id = p_recibo and anula_a is null;
    if v_asiento_id is not null then
      perform _contra_asiento(v_asiento_id, 'manual', current_date, 'Anulación del recibo ' || r.comprobante);
    end if;
  end if;
end $$;

-- ── 10. Comprobante de Recibo para impresión y envío ─────────────────────
create or replace function public._comprobante_recibo(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  r recibos;
  v_cliente text;
  v_atendio text;
  v_totales jsonb;
  v_pagos jsonb;
  v_saldo_actual numeric;
begin
  select * into r from recibos where id = p_id;
  if not found then return null; end if;
  select nombre into v_cliente from clientes where id = r.cliente_id;
  select nullif(split_part(nombre, ' ', 1), '') into v_atendio from perfiles where id = r.usuario_id;

  select coalesce(sum(debe) - sum(haber), 0) into v_saldo_actual
    from cuentas_corrientes_cliente where cliente_id = r.cliente_id and (fecha <= r.fecha or id <= (select coalesce(max(id), 0) from cuentas_corrientes_cliente where recibo_id = r.id));

  v_totales := jsonb_build_array(
    jsonb_build_object('rotulo', 'Monto abonado', 'monto', r.total, 'fuerte', true),
    jsonb_build_object('rotulo', 'Saldo pendiente en cta. cte.', 'monto', v_saldo_actual)
  );

  select coalesce(jsonb_agg(jsonb_build_object(
    'medio', m.nombre,
    'monto', rp.monto,
    'referencia', rp.referencia
  )), '[]'::jsonb)
  into v_pagos
  from recibo_pagos rp
  join medios_pago m on m.id = rp.medio_pago_id
  where rp.recibo_id = r.id;

  return jsonb_build_object(
    'tipo', 'recibo',
    'titulo', 'Recibo de cobro',
    'numero', r.comprobante,
    'fecha', r.fecha,
    'anulada', r.anulado_en is not null,
    'cliente', v_cliente,
    'atendio', v_atendio,
    'renglones', jsonb_build_array(
      jsonb_build_object(
        'detalle', 'Pago de cuenta corriente',
        'marca', null,
        'variante', '',
        'cantidad', 1,
        'precio', r.total,
        'promocion', null,
        'descuento', 0,
        'subtotal', r.total
      )
    ),
    'totales', v_totales,
    'pagos', v_pagos,
    'saldo', v_saldo_actual,
    'leyenda', 'Constancia oficial de cobro en cuenta corriente. Comprobante no válido como factura.',
    'pie', case when r.notas is not null then 'Notas: ' || r.notas end
  );
end $$;

-- Extender _comprobante_json y _comprobante_acceso
create or replace function public._comprobante_json(p_tipo text, p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t configuracion_tienda; l datos_legales; c configuracion_impresion; v_doc jsonb;
begin
  v_doc := case p_tipo
    when 'venta' then _comprobante_venta(p_id)
    when 'presupuesto' then _comprobante_presupuesto(p_id)
    when 'devolucion' then _comprobante_devolucion(p_id)
    when 'recibo' then _comprobante_recibo(p_id)
  end;
  if v_doc is null then return null; end if;
  select * into t from configuracion_tienda; select * into l from datos_legales; select * into c from configuracion_impresion;
  return v_doc || jsonb_build_object(
    'emisor', jsonb_build_object('nombre', t.nombre, 'logo_url', coalesce(t.logo_url, t.icono_url), 'es_icono', t.logo_url is null and t.icono_url is not null, 'razon_social', l.razon_social, 'cuit', l.cuit, 'condicion_iva', l.condicion_iva,
      'domicilio', l.domicilio_legal, 'telefono', l.telefono_contacto, 'email', l.email_contacto, 'local', t.direccion_retiro),
    'config', jsonb_build_object('formato', c.comprobante_formato, 'logo', c.comprobante_logo, 'datos_legales', c.comprobante_datos_legales, 'qr', c.comprobante_qr,
      'barras', c.comprobante_codigo_barras, 'copias', c.comprobante_copias, 'modo', c.modo_impresion, 'configurado', c.comprobante_configurado,
      'letra', c.comprobante_letra, 'encabezado', c.comprobante_encabezado, 'mostrar_cliente', c.comprobante_mostrar_cliente,
      'mostrar_vendedor', c.comprobante_mostrar_vendedor, 'mostrar_marca', c.comprobante_mostrar_marca),
    'leyenda', coalesce(v_doc ->> 'leyenda', c.comprobante_leyenda), 'pie', coalesce(v_doc ->> 'pie', c.comprobante_pie));
end $$;

create or replace function public._comprobante_acceso(p_tipo text, p_id bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select case p_tipo
    when 'venta' then exists (select 1 from ventas v where v.id = p_id and puede_ver_venta(v.usuario_id))
    when 'presupuesto' then exists (select 1 from presupuestos x where x.id = p_id and puede_ver_venta(x.usuario_id))
    when 'devolucion' then exists (select 1 from devoluciones d where d.id = p_id) and (tiene_permiso('ventas.registrar') or tiene_permiso('ventas.ver_todas') or tiene_permiso('clientes.ver'))
    when 'recibo' then exists (select 1 from recibos r where r.id = p_id) and (tiene_permiso('ventas.registrar') or tiene_permiso('ventas.ver_todas') or tiene_permiso('clientes.ver'))
    else false end
$$;

revoke execute on function public.registrar_recibo(bigint, jsonb, text), public.anular_recibo(bigint, text), public._comprobante_recibo(bigint) from public, anon;
grant execute on function public.registrar_recibo(bigint, jsonb, text), public.anular_recibo(bigint, text), public._comprobante_recibo(bigint) to authenticated;
