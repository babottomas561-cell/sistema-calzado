-- Contabilidad, fase B1: el motor de asientos (libro diario), el asiento de apertura y los asientos automáticos de ventas, anulaciones, compras y gastos.
-- Diseño: docs/PLAN_DE_CUENTAS.md. Devoluciones, cambios, ajustes, fallados y créditos de proveedores llegan en la B2; recibos y órdenes de pago, en la fase C.
--
--   · Un asiento es una lista de renglones (cuenta, debe, haber) que TIENE que cuadrar: si no cuadra, la operación entera se deshace.
--   · Los asientos y sus renglones NO se editan ni se borran: una anulación genera el contra-asiento.
--   · Se arman con triggers diferidos (al final de la transacción, cuando la venta ya tiene sus renglones y pagos): así valen para toda venta, la haga
--     quien la haga (mostrador, entrega de un pedido, cambio) sin tocar esas funciones. Si la contabilidad no empezó (`configuracion_contable.inicio`
--     vacío), no se genera nada.
--   · Hasta que ARCA esté activa (fase 2) todo es «interno»: el IVA no se discrimina todavía.

-- ── Asientos ─────────────────────────────────────────────────────────────
create table public.asientos (
  id            bigint generated always as identity primary key,
  numero        int not null unique,                                       -- correlativo, sin saltos
  fecha         date not null,
  concepto      text not null,
  origen        text not null check (origen in ('apertura', 'manual', 'venta', 'anulacion_venta', 'compra', 'gasto', 'devolucion', 'ajuste_stock', 'fallado', 'credito_proveedor', 'recibo', 'orden_pago')),
  documento_id  bigint,                                                    -- la venta, compra, gasto… de la que sale
  circuito      text not null default 'interno' check (circuito in ('fiscal', 'interno')),
  anula_a       bigint references public.asientos (id) on delete restrict, -- en un contra-asiento, el que revierte
  creado_por    uuid references auth.users (id) on delete set null default auth.uid(),
  creado_en     timestamptz not null default now()
);
create unique index asientos_origen_documento_key on public.asientos (origen, documento_id) where documento_id is not null and anula_a is null;
create index asientos_fecha_idx on public.asientos (fecha, numero);
create index asientos_anula_a_idx on public.asientos (anula_a);
create index asientos_creado_por_idx on public.asientos (creado_por);

create table public.asiento_lineas (
  id          bigint generated always as identity primary key,
  asiento_id  bigint not null references public.asientos (id) on delete restrict,
  cuenta_id   bigint not null references public.cuentas (id) on delete restrict,
  debe        numeric(14,2) not null default 0 check (debe >= 0),
  haber       numeric(14,2) not null default 0 check (haber >= 0),
  detalle     text,
  check ((debe > 0) <> (haber > 0))                                        -- un renglón es del debe o del haber, y no está en cero
);
create index asiento_lineas_asiento_idx on public.asiento_lineas (asiento_id);
create index asiento_lineas_cuenta_idx on public.asiento_lineas (cuenta_id);

-- No se editan ni se borran
create function public._asientos_inmutables() returns trigger
language plpgsql set search_path = public as $$
begin raise exception 'Los asientos no se editan ni se borran: para corregir uno, se hace el asiento contrario'; end $$;
create trigger asientos_inmutables before update or delete on public.asientos for each row execute function public._asientos_inmutables();
create trigger asiento_lineas_inmutables before update or delete on public.asiento_lineas for each row execute function public._asientos_inmutables();
create trigger asientos_sin_truncar before truncate on public.asientos for each statement execute function public._asientos_inmutables();
create trigger asiento_lineas_sin_truncar before truncate on public.asiento_lineas for each statement execute function public._asientos_inmutables();

alter table public.asientos enable row level security;
alter table public.asiento_lineas enable row level security;
create policy "ve los asientos" on public.asientos for select to authenticated using (tiene_permiso('contabilidad.ver') or tiene_permiso('contabilidad.configurar'));
create policy "ve los renglones" on public.asiento_lineas for select to authenticated using (tiene_permiso('contabilidad.ver') or tiene_permiso('contabilidad.configurar'));

-- ── El motor ─────────────────────────────────────────────────────────────
-- p_lineas: [{cuenta: id, debe, haber, detalle}]. Junta los renglones de la misma cuenta y lado, controla que cuadre y que las cuentas sirvan.
-- Devuelve el id del asiento, o null si la contabilidad todavía no empezó (o la fecha es anterior al inicio).
create function public._asentar(p_origen text, p_documento bigint, p_fecha date, p_concepto text, p_lineas jsonb, p_anula_a bigint default null, p_circuito text default 'interno') returns bigint
language plpgsql security definer set search_path = public as $$
declare v_inicio date := (select inicio from configuracion_contable); v_id bigint; v_debe numeric; v_haber numeric; r record;
begin
  if v_inicio is null or p_fecha < v_inicio then return null; end if;
  if exists (select 1 from jsonb_array_elements(p_lineas) l where coalesce((l ->> 'debe')::numeric, 0) < 0 or coalesce((l ->> 'haber')::numeric, 0) < 0
              or (coalesce((l ->> 'debe')::numeric, 0) > 0 and coalesce((l ->> 'haber')::numeric, 0) > 0)) then
    raise exception 'Cada renglón del asiento va al debe o al haber, con un importe positivo';
  end if;
  select coalesce(sum((l ->> 'debe')::numeric), 0), coalesce(sum((l ->> 'haber')::numeric), 0) into v_debe, v_haber from jsonb_array_elements(p_lineas) l;
  if round(v_debe, 2) <> round(v_haber, 2) then
    raise exception 'El asiento de % no cuadra: debe % y haber %', p_concepto, round(v_debe, 2), round(v_haber, 2);
  end if;
  if round(v_debe, 2) = 0 then return null; end if;   -- nada para asentar (una venta de $ 0, por ejemplo)
  for r in select c.id, c.codigo, c.imputable, c.activa from (select distinct (l ->> 'cuenta')::bigint as id from jsonb_array_elements(p_lineas) l) x join cuentas c on c.id = x.id
            where not c.imputable or not c.activa loop
    raise exception 'La cuenta % no recibe movimientos o está desactivada: revisá las asignaciones en Contabilidad', r.codigo;
  end loop;
  perform pg_advisory_xact_lock(7001);   -- un asiento a la vez: el número no tiene saltos
  insert into asientos (numero, fecha, concepto, origen, documento_id, circuito, anula_a)
  values (coalesce((select max(numero) from asientos), 0) + 1, p_fecha, p_concepto, p_origen, p_documento, p_circuito, p_anula_a) returning id into v_id;
  insert into asiento_lineas (asiento_id, cuenta_id, debe, haber, detalle)
  select v_id, t.cuenta, sum(t.debe), sum(t.haber), min(t.detalle)
    from (select (l ->> 'cuenta')::bigint as cuenta, coalesce((l ->> 'debe')::numeric, 0) as debe, coalesce((l ->> 'haber')::numeric, 0) as haber, l ->> 'detalle' as detalle
            from jsonb_array_elements(p_lineas) l where coalesce((l ->> 'debe')::numeric, 0) + coalesce((l ->> 'haber')::numeric, 0) > 0) t
   group by t.cuenta, (t.debe > 0);
  return v_id;
end $$;

-- El asiento contrario de otro (anulación)
create function public._contra_asiento(p_asiento bigint, p_origen text, p_fecha date, p_concepto text) returns bigint
language plpgsql security definer set search_path = public as $$
declare a asientos;
begin
  select * into a from asientos where id = p_asiento;
  if not found then return null; end if;
  return _asentar(p_origen, a.documento_id, p_fecha, p_concepto,
    (select jsonb_agg(jsonb_build_object('cuenta', cuenta_id, 'debe', haber, 'haber', debe, 'detalle', detalle)) from asiento_lineas where asiento_id = p_asiento),
    p_asiento, a.circuito);
end $$;

-- Una cuenta del sistema por su clave (falla si la borraron: no puede pasar, pero que avise)
create function public._cta(p_clave text) returns bigint
language plpgsql stable security definer set search_path = public as $$
declare v bigint := (select id from cuentas where clave = p_clave);
begin if v is null then raise exception 'Falta la cuenta del sistema «%»', p_clave; end if; return v; end $$;

create function public._fecha_ar(p timestamptz) returns date language sql immutable as $$ select (p at time zone 'America/Argentina/Buenos_Aires')::date $$;

-- ── Venta ────────────────────────────────────────────────────────────────
-- Debe: lo cobrado en cada medio (con su descuento o recargo y el redondeo), lo que queda a cuenta, los descuentos y el costo de lo vendido.
-- Haber: las ventas (por la cuenta de cada artículo), el recargo del medio y las mercaderías que salen.
create function public._asiento_venta(p_venta bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare v ventas; l jsonb := '[]'; r record; v_cobrado numeric; v_saldo numeric; v_costo numeric;
begin
  select * into v from ventas where id = p_venta;
  if not found or v.anulada_en is not null then return null; end if;
  -- Ventas (neto de promociones) y costo, por artículo
  for r in select cuenta_venta_de(p.id) as cv, cuenta_costo_de(p.id) as cc, vi.cantidad * vi.precio_unitario - vi.descuento_promo as neto, vi.cantidad * coalesce(vi.costo_unitario, 0) as costo
             from venta_items vi join variantes va on va.id = vi.variante_id join productos p on p.id = va.producto_id where vi.venta_id = p_venta loop
    l := l || jsonb_build_object('cuenta', r.cv, 'haber', r.neto, 'debe', 0, 'detalle', 'Ventas');
    if r.costo > 0 then
      l := l || jsonb_build_object('cuenta', r.cc, 'debe', r.costo, 'haber', 0, 'detalle', 'Costo de lo vendido')
             || jsonb_build_object('cuenta', _cta('mercaderias'), 'haber', r.costo, 'debe', 0, 'detalle', 'Mercadería vendida');
    end if;
  end loop;
  -- Cobros
  for r in select coalesce(m.cuenta_id, _cta('caja')) as cuenta, pg.monto, m.nombre from pagos pg join medios_pago m on m.id = pg.medio_pago_id where pg.venta_id = p_venta and pg.monto > 0 loop
    l := l || jsonb_build_object('cuenta', r.cuenta, 'debe', r.monto, 'haber', 0, 'detalle', 'Cobro ' || r.nombre);
  end loop;
  select coalesce(sum(base), 0) into v_cobrado from pagos where venta_id = p_venta;
  v_saldo := v.subtotal - v.descuento - v.descuento_promociones - v_cobrado;
  if v_saldo > 0.004 then l := l || jsonb_build_object('cuenta', _cta('deudores_ventas'), 'debe', v_saldo, 'haber', 0, 'detalle', 'A cuenta (sin cobrar)'); end if;
  if v.descuento > 0 then l := l || jsonb_build_object('cuenta', _cta('descuentos_otorgados'), 'debe', v.descuento, 'haber', 0, 'detalle', 'Descuento del vendedor'); end if;
  if v.ajuste_medio_pago < 0 then l := l || jsonb_build_object('cuenta', _cta('descuentos_otorgados'), 'debe', -v.ajuste_medio_pago, 'haber', 0, 'detalle', 'Descuento por medio de pago y redondeo');
  elsif v.ajuste_medio_pago > 0 then l := l || jsonb_build_object('cuenta', _cta('ventas_generales'), 'haber', v.ajuste_medio_pago, 'debe', 0, 'detalle', 'Recargo por medio de pago'); end if;
  return _asentar('venta', p_venta, _fecha_ar(v.fecha), 'Venta ' || v.comprobante, l);
end $$;

create function public._trg_asiento_venta() returns trigger language plpgsql security definer set search_path = public as $$
begin perform _asiento_venta(new.id); return null; end $$;
create constraint trigger asiento_venta after insert on public.ventas deferrable initially deferred for each row execute function public._trg_asiento_venta();

-- Anulación: el contra-asiento de la venta
create function public._trg_asiento_anulacion() returns trigger language plpgsql security definer set search_path = public as $$
declare a bigint := (select id from asientos where origen = 'venta' and documento_id = new.id and anula_a is null);
begin
  if a is not null then perform _contra_asiento(a, 'anulacion_venta', _fecha_ar(new.anulada_en), 'Anulación de la venta ' || new.comprobante); end if;
  return null;
end $$;
create trigger asiento_anulacion after update of anulada_en on public.ventas for each row when (old.anulada_en is null and new.anulada_en is not null) execute function public._trg_asiento_anulacion();

-- ── Compra ───────────────────────────────────────────────────────────────
-- Debe Mercaderías (lo que entró, a costo); haber la deuda con el proveedor (menos el crédito que se aplicó, que se descuenta de su cuenta de crédito).
create function public._trg_asiento_compra() returns trigger language plpgsql security definer set search_path = public as $$
declare c compras; l jsonb := '[]'; v_total numeric; v_prov bigint;
begin
  select * into c from compras where id = new.id;
  select coalesce(sum(cantidad * costo_unitario), 0) into v_total from compra_items where compra_id = c.id;
  if v_total <= 0 then return null; end if;
  v_prov := coalesce((select cuenta_id from proveedores where id = c.proveedor_id), _cta('proveedores'));
  l := l || jsonb_build_object('cuenta', _cta('mercaderias'), 'debe', v_total, 'haber', 0, 'detalle', 'Mercadería ingresada');
  if c.credito_aplicado > 0 then l := l || jsonb_build_object('cuenta', _cta('credito_proveedores'), 'haber', c.credito_aplicado, 'debe', 0, 'detalle', 'Crédito aplicado'); end if;
  if v_total - c.credito_aplicado > 0 then l := l || jsonb_build_object('cuenta', v_prov, 'haber', v_total - c.credito_aplicado, 'debe', 0, 'detalle', 'Deuda con el proveedor'); end if;
  perform _asentar('compra', c.id, _fecha_ar(c.fecha), 'Compra ' || c.comprobante || coalesce(' · ' || c.comprobante_proveedor, ''), l);
  return null;
end $$;
create constraint trigger asiento_compra after insert on public.compras deferrable initially deferred for each row execute function public._trg_asiento_compra();

-- ── Gasto ────────────────────────────────────────────────────────────────
-- Debe la cuenta de su categoría; haber la Caja (hasta que haya órdenes de pago, fase C, se asume pagado en el momento).
create function public._trg_asiento_gasto() returns trigger language plpgsql security definer set search_path = public as $$
declare v_cuenta bigint := coalesce((select cuenta_id from gasto_categorias where id = new.categoria_id), _cta('gasto_general'));
begin
  if new.monto > 0 then
    perform _asentar('gasto', new.id, new.fecha, 'Gasto: ' || new.descripcion,
      jsonb_build_array(jsonb_build_object('cuenta', v_cuenta, 'debe', new.monto, 'haber', 0, 'detalle', new.descripcion),
                        jsonb_build_object('cuenta', _cta('caja'), 'haber', new.monto, 'debe', 0, 'detalle', 'Pago del gasto')));
  end if;
  return null;
end $$;
create trigger asiento_gasto after insert on public.gastos for each row execute function public._trg_asiento_gasto();

-- ── Asientos manuales y la apertura ──────────────────────────────────────
create function public.registrar_asiento_manual(p_fecha date, p_concepto text, p_lineas jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if not tiene_permiso('contabilidad.configurar') then raise exception 'No tenés permiso para registrar asientos'; end if;
  if coalesce(trim(p_concepto), '') = '' then raise exception 'Poné de qué es el asiento'; end if;
  if (select inicio from configuracion_contable) is null then raise exception 'La contabilidad todavía no empezó: iniciala primero'; end if;
  if p_fecha < (select inicio from configuracion_contable) then raise exception 'La fecha es anterior al inicio de la contabilidad'; end if;
  v_id := _asentar('manual', null, p_fecha, trim(p_concepto), p_lineas);
  if v_id is null then raise exception 'El asiento no tiene importes'; end if;
  return v_id;
end $$;

-- Empieza la contabilidad en una fecha, con el asiento de apertura: la mercadería (stock a costo), los saldos a favor de clientes y el crédito con
-- proveedores salen solos; la diferencia va a Capital. El contador completa lo demás (caja, bancos, deudas) con un asiento manual.
create function public.iniciar_contabilidad(p_fecha date) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_merc numeric; v_saldos numeric; v_credito numeric; l jsonb := '[]'; v_dif numeric; v_id bigint;
begin
  if not tiene_permiso('contabilidad.configurar') then raise exception 'No tenés permiso para iniciar la contabilidad'; end if;
  if (select inicio from configuracion_contable) is not null then raise exception 'La contabilidad ya empezó el %', to_char((select inicio from configuracion_contable), 'DD/MM/YYYY'); end if;
  if p_fecha is null or p_fecha > (now() at time zone 'America/Argentina/Buenos_Aires')::date then raise exception 'Elegí una fecha de hoy o anterior'; end if;
  select coalesce(sum(s.cantidad * p.precio_compra), 0) into v_merc from stock s join variantes v on v.id = s.variante_id join productos p on p.id = v.producto_id where s.cantidad > 0;
  select coalesce(sum(restante), 0) into v_saldos from v_creditos;
  select coalesce(sum(saldo), 0) into v_credito from v_credito_proveedores;
  update configuracion_contable set inicio = p_fecha, actualizado_en = now(), actualizado_por = auth.uid() where unica;
  if v_merc > 0 then l := l || jsonb_build_object('cuenta', _cta('mercaderias'), 'debe', v_merc, 'haber', 0, 'detalle', 'Stock valorizado a costo'); end if;
  if v_credito > 0 then l := l || jsonb_build_object('cuenta', _cta('credito_proveedores'), 'debe', v_credito, 'haber', 0, 'detalle', 'Crédito con proveedores'); end if;
  if v_saldos > 0 then l := l || jsonb_build_object('cuenta', _cta('saldos_clientes'), 'haber', v_saldos, 'debe', 0, 'detalle', 'Saldos a favor de clientes'); end if;
  v_dif := v_merc + v_credito - v_saldos;
  if v_dif > 0 then l := l || jsonb_build_object('cuenta', _cta('capital'), 'haber', v_dif, 'debe', 0, 'detalle', 'Capital (diferencia de apertura)');
  elsif v_dif < 0 then l := l || jsonb_build_object('cuenta', _cta('capital'), 'debe', -v_dif, 'haber', 0, 'detalle', 'Capital (diferencia de apertura)'); end if;
  v_id := _asentar('apertura', null, p_fecha, 'Asiento de apertura', l);
  return v_id;
end $$;

-- No se desactiva una cuenta que alguna asignación usa: la próxima venta no tendría a dónde ir
create or replace function public.guardar_cuenta(p_id bigint, p_codigo text, p_nombre text, p_tipo text, p_imputable boolean, p_activa boolean) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint := p_id;
begin
  if not tiene_permiso('contabilidad.configurar') then raise exception 'No tenés permiso para cambiar el plan de cuentas'; end if;
  if p_id is null then
    insert into cuentas (codigo, nombre, tipo, imputable, activa) values (trim(p_codigo), p_nombre, coalesce(p_tipo, 'activo'), p_imputable, p_activa) returning id into v_id;
  else
    if not p_activa then
      if exists (select 1 from cuentas c where c.id = p_id and c.clave is not null) then raise exception 'Esa cuenta la usa el sistema: se puede renombrar, pero no desactivar'; end if;
      if exists (select 1 from cuentas_por_linea where p_id in (cuenta_venta_id, cuenta_costo_id)) or exists (select 1 from categorias where p_id in (cuenta_venta_id, cuenta_costo_id))
         or exists (select 1 from productos where p_id in (cuenta_venta_id, cuenta_costo_id)) or exists (select 1 from medios_pago where cuenta_id = p_id)
         or exists (select 1 from proveedores where cuenta_id = p_id) or exists (select 1 from gasto_categorias where cuenta_id = p_id)
         or exists (select 1 from conceptos_compra where cuenta_id = p_id) then
        raise exception 'Esa cuenta está asignada a algo (artículos, medios de pago, gastos…): reasignalo antes de desactivarla';
      end if;
    end if;
    update cuentas set codigo = trim(p_codigo), nombre = p_nombre, tipo = coalesce(p_tipo, tipo), imputable = p_imputable, activa = p_activa where id = p_id;
  end if;
  return v_id;
end $$;

-- ── Para las pantallas ───────────────────────────────────────────────────
create function public.libro_diario(p_desde date, p_hasta date) returns table (
  asiento_id bigint, numero int, fecha date, concepto text, origen text, circuito text, anula_a bigint, cuenta_codigo text, cuenta_nombre text, debe numeric, haber numeric, detalle text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (tiene_permiso('contabilidad.ver') or tiene_permiso('contabilidad.configurar')) then raise exception 'No tenés permiso para ver la contabilidad'; end if;
  return query select a.id, a.numero, a.fecha, a.concepto, a.origen, a.circuito, a.anula_a, c.codigo, c.nombre, l.debe, l.haber, l.detalle
    from asientos a join asiento_lineas l on l.asiento_id = a.id join cuentas c on c.id = l.cuenta_id
   where a.fecha between p_desde and p_hasta order by a.fecha, a.numero, l.debe desc, c.codigo;
end $$;

-- El mayor de una cuenta (y de sus subcuentas, si agrupa): movimientos con el saldo corrido
create function public.mayor_cuenta(p_cuenta bigint, p_desde date, p_hasta date) returns table (
  fecha date, numero int, concepto text, origen text, debe numeric, haber numeric, saldo numeric)
language plpgsql stable security definer set search_path = public as $$
declare c cuentas; v_prefijo text; v_deudora boolean; v_inicial numeric;
begin
  if not (tiene_permiso('contabilidad.ver') or tiene_permiso('contabilidad.configurar')) then raise exception 'No tenés permiso para ver la contabilidad'; end if;
  select * into c from cuentas where id = p_cuenta;
  if not found then raise exception 'Esa cuenta no existe'; end if;
  v_prefijo := _cuenta_prefijo(c.codigo);
  v_deudora := c.tipo in ('activo', 'costo', 'gasto');
  select coalesce(sum(case when v_deudora then l.debe - l.haber else l.haber - l.debe end), 0) into v_inicial
    from asiento_lineas l join asientos a on a.id = l.asiento_id join cuentas k on k.id = l.cuenta_id where k.codigo like v_prefijo || '%' and a.fecha < p_desde;
  return query
    select p_desde, 0, 'Saldo anterior'::text, ''::text, 0::numeric, 0::numeric, v_inicial
    union all
    select x.fecha, x.numero, x.concepto, x.origen, x.debe, x.haber, v_inicial + sum(case when v_deudora then x.debe - x.haber else x.haber - x.debe end) over (order by x.fecha, x.numero, x.lid)
      from (select a.fecha, a.numero, a.concepto, a.origen, l.debe, l.haber, l.id as lid
              from asiento_lineas l join asientos a on a.id = l.asiento_id join cuentas k on k.id = l.cuenta_id
             where k.codigo like v_prefijo || '%' and a.fecha between p_desde and p_hasta) x;
end $$;

-- Sumas y saldos a una fecha (solo las cuentas que recibieron movimientos)
create function public.sumas_y_saldos(p_hasta date) returns table (codigo text, nombre text, tipo text, debe numeric, haber numeric, saldo_deudor numeric, saldo_acreedor numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (tiene_permiso('contabilidad.ver') or tiene_permiso('contabilidad.configurar')) then raise exception 'No tenés permiso para ver la contabilidad'; end if;
  return query select c.codigo, c.nombre, c.tipo, sum(l.debe), sum(l.haber), greatest(sum(l.debe) - sum(l.haber), 0), greatest(sum(l.haber) - sum(l.debe), 0)
    from asiento_lineas l join asientos a on a.id = l.asiento_id join cuentas c on c.id = l.cuenta_id where a.fecha <= p_hasta group by c.codigo, c.nombre, c.tipo order by c.codigo;
end $$;

revoke execute on function public._asientos_inmutables(), public._asentar(text, bigint, date, text, jsonb, bigint, text), public._contra_asiento(bigint, text, date, text),
  public._cta(text), public._fecha_ar(timestamptz), public._asiento_venta(bigint), public._trg_asiento_venta(), public._trg_asiento_anulacion(), public._trg_asiento_compra(),
  public._trg_asiento_gasto() from public, anon, authenticated;
revoke execute on function public.registrar_asiento_manual(date, text, jsonb), public.iniciar_contabilidad(date), public.libro_diario(date, date),
  public.mayor_cuenta(bigint, date, date), public.sumas_y_saldos(date) from public, anon;
grant execute on function public.registrar_asiento_manual(date, text, jsonb), public.iniciar_contabilidad(date), public.libro_diario(date, date),
  public.mayor_cuenta(bigint, date, date), public.sumas_y_saldos(date) to authenticated;
