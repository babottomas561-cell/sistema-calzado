-- Devoluciones con saldo a favor (paso 4 de docs/DEVOLUCIONES.md).
--
-- Decidido por el dueño:
--   · toda devolución deja SALDO A FAVOR (nunca efectivo); el saldo vence (dias_saldo, 180 por defecto);
--   · plazo para devolver: dias_cambio (30 por defecto); fuera de plazo, solo con un permiso de excepción;
--   · lo devuelto vale lo que se PAGÓ de verdad: la promoción se recalcula por grupo con las promociones de
--     esa venta (aunque ya hayan terminado), se descuenta su parte del descuento manual y del descuento del
--     medio de pago; el recargo de las cuotas NO se devuelve;
--   · lo que vuelve fallado entra directo al depósito de fallados (bandeja, origen «cliente»).
-- La cuenta es ACUMULATIVA: lo devuelto en total = lo pagado − lo que vale lo que se queda. Cada devolución
-- es la diferencia con las anteriores, así la suma nunca pasa lo cobrado y no se acumulan redondeos.

-- ── Configuración y permiso ───────────────────────────────────────────
alter table public.configuracion_tienda
  add column dias_cambio int not null default 30 check (dias_cambio between 1 and 365),
  add column dias_saldo int not null default 180 check (dias_saldo between 7 and 730);

insert into public.permisos (orden, grupo, codigo, nombre, descripcion) values
  (15, 'Ventas', 'devoluciones.fuera_de_plazo', 'Devoluciones fuera de plazo',
   'Aceptar una devolución pasado el plazo de cambios (el resto del equipo que vende puede hacerlas dentro del plazo).');
update public.roles set permisos = permisos || '{devoluciones.fuera_de_plazo}'
 where nombre = 'Encargado' and not ('devoluciones.fuera_de_plazo' = any (permisos));

alter table public.movimientos_stock drop constraint movimientos_stock_tipo_check;
alter table public.movimientos_stock add constraint movimientos_stock_tipo_check
  check (tipo in ('venta', 'compra', 'ajuste', 'anulacion', 'transferencia', 'devolucion_proveedor', 'baja', 'devolucion'));

-- ── El motor de promociones, en dos partes reutilizables ──────────────
-- Las unidades (una fila por par) en la tabla temporal _unidades
create or replace function public._crear_unidades(p_items jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if to_regclass('pg_temp._unidades') is not null then drop table _unidades; end if;
  create temp table _unidades on commit drop as
  select row_number() over () as n, x.variante_id, v.producto_id, x.precio, null::bigint as promocion_id, 0::numeric as descuento
    from (select (i->>'variante_id')::bigint as variante_id, (i->>'precio_unitario')::numeric as precio,
                 generate_series(1, greatest((i->>'cantidad')::int, 0)) as k
            from jsonb_array_elements(p_items) i) x
    join variantes v on v.id = x.variante_id;
end $$;

-- Aplica ESAS promociones (por prioridad) a las unidades de _unidades: el mismo cálculo para vender y para devolver
create or replace function public._aplicar_promociones(p_promos bigint[]) returns void
language plpgsql security definer set search_path = public as $$
declare pr promociones; v_lleva int; v_bonif int;
begin
  for pr in select * from promociones where id = any (p_promos) order by prioridad desc, id loop
    if pr.tipo = 'porcentaje' then
      update _unidades u set promocion_id = pr.id, descuento = round(u.precio * pr.descuento_pct / 100, 2)
       where u.promocion_id is null and _en_promocion(pr.id, u.producto_id);
    elsif pr.tipo = 'precio_fijo' then
      update _unidades u set promocion_id = pr.id, descuento = u.precio - pr.precio_fijo
       where u.promocion_id is null and u.precio > pr.precio_fijo and _en_promocion(pr.id, u.producto_id);
    else
      -- Grupos de N pares (de más caro a más barato); en cada grupo completo, los más baratos llevan el beneficio
      v_lleva := case when pr.tipo = 'nxm' then pr.lleva else 2 end;
      v_bonif := case when pr.tipo = 'nxm' then pr.lleva - pr.paga else 1 end;
      with eleg as (
        select u.n, u.precio, case when pr.mezcla then 0 else u.producto_id end as parte,
               row_number() over (partition by case when pr.mezcla then 0 else u.producto_id end order by u.precio desc, u.n) as rn
          from _unidades u where u.promocion_id is null and _en_promocion(pr.id, u.producto_id)
      ), grupos as (
        select n, precio, parte, (rn - 1) / v_lleva as g from eleg
      ), completos as (
        select parte, g from grupos group by parte, g having count(*) = v_lleva
      ), marcados as (
        select gr.n, row_number() over (partition by gr.parte, gr.g order by gr.precio, gr.n desc) as barato
          from grupos gr join completos c on c.parte = gr.parte and c.g = gr.g
      )
      update _unidades u set promocion_id = pr.id,
             descuento = case when m.barato <= v_bonif
                              then case when pr.tipo = 'nxm' then u.precio else round(u.precio * pr.descuento_pct / 100, 2) end
                              else 0 end
        from marcados m where m.n = u.n;
    end if;
  end loop;
end $$;

-- El motor de siempre (carrito, caja, pedidos, presupuestos): las promociones vigentes en ese canal
create or replace function public._cotizar(p_items jsonb, p_canal text)
returns table (variante_id bigint, producto_id bigint, cantidad int, precio_unitario numeric,
               descuento_promo numeric, promocion_id bigint, acumula boolean)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  perform _crear_unidades(p_items);
  perform _aplicar_promociones(array(select id from _promociones_vigentes(p_canal)));
  return query
  select u.variante_id, u.producto_id, count(*)::int, u.precio, sum(u.descuento), u.promocion_id,
         coalesce(bool_and(p.acumula_medio_pago), true)
    from _unidades u left join promociones p on p.id = u.promocion_id
   group by u.variante_id, u.producto_id, u.precio, u.promocion_id
   order by min(u.n);
end $$;

-- Cuánto vale (con esas promociones) un conjunto de unidades
create function public._pagado_con_promos(p_items jsonb, p_promos bigint[]) returns numeric
language plpgsql security definer set search_path = public as $$
begin
  perform _crear_unidades(p_items);
  perform _aplicar_promociones(p_promos);
  return (select coalesce(sum(precio - descuento), 0) from _unidades);
end $$;
revoke execute on function public._crear_unidades(jsonb), public._aplicar_promociones(bigint[]),
                         public._pagado_con_promos(jsonb, bigint[]) from public, anon, authenticated;

-- ── Devoluciones ──────────────────────────────────────────────────────
insert into public.numeradores (tipo) values ('DEV') on conflict do nothing;

create table public.devoluciones (
  id              bigint generated always as identity primary key,
  punto_venta     int not null default 1,
  numero          int,
  comprobante     text generated always as (lpad(punto_venta::text, 4, '0') || '-' || lpad(numero::text, 8, '0')) stored,
  fecha           timestamptz not null default now(),
  venta_id        bigint not null references public.ventas (id) on delete restrict,
  cliente_id      bigint not null references public.clientes (id) on delete restrict,   -- dueño del saldo a favor
  motivo          text not null check (motivo in ('talle', 'no_gusto', 'fallado', 'otro')),
  comentario      text,
  bruto           numeric(12,2) not null check (bruto >= 0),   -- lo devuelto antes del descuento manual y del medio de pago
  total           numeric(12,2) not null check (total >= 0),   -- el saldo a favor que deja
  fuera_de_plazo  boolean not null default false,
  usuario_id      uuid default auth.uid() references public.perfiles (id) on delete set null,
  unique (punto_venta, numero)
);
create index devoluciones_venta_id_idx on public.devoluciones (venta_id);
create index devoluciones_cliente_id_idx on public.devoluciones (cliente_id);
create index devoluciones_usuario_id_idx on public.devoluciones (usuario_id);
create trigger numero before insert on public.devoluciones for each row execute function public._numerar('DEV');

create table public.devolucion_items (
  id             bigint generated always as identity primary key,
  devolucion_id  bigint not null references public.devoluciones (id) on delete cascade,
  venta_item_id  bigint not null references public.venta_items (id) on delete restrict,
  cantidad       int not null check (cantidad > 0),
  estado         text not null default 'bueno' check (estado in ('bueno', 'fallado')),
  monto          numeric(12,2) not null check (monto >= 0)   -- su parte del saldo (para los informes por talle, modelo…)
);
create index devolucion_items_devolucion_id_idx on public.devolucion_items (devolucion_id);
create index devolucion_items_venta_item_id_idx on public.devolucion_items (venta_item_id);

-- ── Saldo a favor: los movimientos de la cuenta de cada cliente ────────
-- Un crédito (+, con vencimiento) por devolución; los usos, vencimientos y reintegros apuntan al crédito
-- que tocan (credito_id), así se sabe cuánto queda de cada uno y se usa primero el que vence antes.
create table public.saldos_cliente (
  id             bigint generated always as identity primary key,
  fecha          timestamptz not null default now(),
  cliente_id     bigint not null references public.clientes (id) on delete restrict,
  tipo           text not null check (tipo in ('devolucion', 'uso', 'reintegro', 'vencimiento')),
  monto          numeric(12,2) not null check (monto <> 0),
  vence          date,
  credito_id     bigint references public.saldos_cliente (id) on delete restrict,
  devolucion_id  bigint references public.devoluciones (id) on delete restrict,
  venta_id       bigint references public.ventas (id) on delete restrict,
  usuario_id     uuid default auth.uid() references public.perfiles (id) on delete set null,
  check ((tipo = 'devolucion') = (credito_id is null)),
  check (tipo <> 'devolucion' or (monto > 0 and vence is not null and devolucion_id is not null)),
  check (tipo not in ('uso', 'vencimiento') or monto < 0),
  check (tipo <> 'reintegro' or monto > 0)
);
create index saldos_cliente_cliente_id_idx on public.saldos_cliente (cliente_id);
create index saldos_cliente_credito_id_idx on public.saldos_cliente (credito_id);
create index saldos_cliente_devolucion_id_idx on public.saldos_cliente (devolucion_id);
create index saldos_cliente_venta_id_idx on public.saldos_cliente (venta_id);
create index saldos_cliente_usuario_id_idx on public.saldos_cliente (usuario_id);

-- Lo que queda de cada crédito
create view public.v_creditos with (security_invoker = false) as
select c.id, c.cliente_id, c.fecha, c.monto, c.vence, c.devolucion_id, d.comprobante as devolucion,
       c.monto + coalesce((select sum(m.monto) from saldos_cliente m where m.credito_id = c.id), 0) as restante
from saldos_cliente c
left join devoluciones d on d.id = c.devolucion_id
where c.tipo = 'devolucion'
  and (c.cliente_id = mi_cliente_id() or tiene_permiso('ventas.registrar') or tiene_permiso('clientes.ver'));
revoke select on public.v_creditos from anon;
grant select on public.v_creditos to authenticated;

-- Saldo disponible por cliente (lo no vencido) y cuándo vence lo próximo
create view public.v_saldo_clientes with (security_invoker = false) as
select cliente_id, sum(restante) as disponible, min(vence) as proximo_vencimiento
-- (la fecha de hoy va escrita acá: _hoy_ar() es interna y una vista la ejecuta con los permisos de quien consulta)
from v_creditos where restante > 0 and vence >= (now() at time zone 'America/Argentina/Buenos_Aires')::date
group by cliente_id;
revoke select on public.v_saldo_clientes from anon;
grant select on public.v_saldo_clientes to authenticated;

-- Para las funciones internas (consumir, vencer): sin el filtro de permisos de las vistas, que depende
-- de quién está conectado (el vencimiento diario corre sin usuario; un pedido lo puede cobrar alguien
-- que no ve clientes).
create function public._creditos() returns table (id bigint, cliente_id bigint, vence date, restante numeric)
language sql stable security definer set search_path = public as $$
  select c.id, c.cliente_id, c.vence, c.monto + coalesce((select sum(m.monto) from saldos_cliente m where m.credito_id = c.id), 0)
    from saldos_cliente c where c.tipo = 'devolucion'
$$;
create function public.saldo_disponible(p_cliente bigint) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(restante), 0) from _creditos() where cliente_id = p_cliente and vence >= _hoy_ar() and restante > 0
$$;
revoke execute on function public._creditos(), public.saldo_disponible(bigint) from public, anon, authenticated;

-- El medio de pago «Saldo a favor» (sin descuento ni recargo: el descuento ya se restó al devolver)
alter table public.medios_pago add column es_saldo boolean not null default false,
  add constraint medios_pago_saldo_sin_ajuste check (not es_saldo or ajuste_pct = 0);
create unique index medios_pago_un_saldo on public.medios_pago (es_saldo) where es_saldo;
insert into public.medios_pago (codigo, nombre, tipo, ajuste_pct, cuotas, en_mostrador, en_tienda, activo, orden, es_saldo)
values ('SAF', 'Saldo a favor', 'Otro', 0, 1, true, false, true, 90, true);

-- Pagar con saldo a favor: se consume solo, primero lo que vence antes. Va en la base (trigger) para
-- que cualquier venta (mostrador, pedido entregado, presupuesto convertido) lo respete.
create function public._usar_saldo() returns trigger language plpgsql security definer set search_path = public as $$
declare v_cliente bigint; v_resto numeric := new.monto; c record; v_toma numeric;
begin
  if not (select es_saldo from medios_pago where id = new.medio_pago_id) then return new; end if;
  select cliente_id into v_cliente from ventas where id = new.venta_id;
  if v_cliente is null then raise exception 'Para pagar con saldo a favor, elegí el cliente'; end if;
  if new.monto > saldo_disponible(v_cliente) + 0.005 then
    raise exception 'El cliente tiene $% de saldo a favor', to_char(saldo_disponible(v_cliente), 'FM999G999G990D00');
  end if;
  for c in select id, restante from _creditos() where cliente_id = v_cliente and restante > 0 and vence >= _hoy_ar()
           order by vence, id loop
    exit when v_resto <= 0;
    v_toma := least(c.restante, v_resto);
    insert into saldos_cliente (cliente_id, tipo, monto, credito_id, venta_id) values (v_cliente, 'uso', -v_toma, c.id, new.venta_id);
    v_resto := v_resto - v_toma;
  end loop;
  return new;
end $$;
create trigger pagos_usar_saldo after insert on public.pagos for each row execute function public._usar_saldo();

-- Una venta con devoluciones ya no se anula; si se anula una pagada con saldo, el saldo vuelve
create function public._anulacion_y_saldo() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.anulada_en is null and new.anulada_en is not null then
    if exists (select 1 from devoluciones where venta_id = new.id) then
      raise exception 'Esta venta tiene devoluciones: ya no se puede anular';
    end if;
    insert into saldos_cliente (cliente_id, tipo, monto, credito_id, venta_id)
    select u.cliente_id, 'reintegro', -u.monto, u.credito_id, u.venta_id from saldos_cliente u where u.venta_id = new.id and u.tipo = 'uso';
  end if;
  return new;
end $$;
create trigger ventas_anulacion_y_saldo before update of anulada_en on public.ventas for each row execute function public._anulacion_y_saldo();

-- Vence lo que pasó su fecha (lo corre la base sola, todos los días)
create function public.vencer_saldos() returns int language plpgsql security definer set search_path = public as $$
declare c record; n int := 0;
begin
  for c in select id, cliente_id, restante from _creditos() where restante > 0 and vence < _hoy_ar() loop
    insert into saldos_cliente (cliente_id, tipo, monto, credito_id) values (c.cliente_id, 'vencimiento', -c.restante, c.id);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.vencer_saldos() from public, anon, authenticated;
select cron.schedule('vencer-saldos-a-favor', '10 9 * * *', $$select public.vencer_saldos()$$);

-- ── La cuenta de una devolución ───────────────────────────────────────
-- p_items: [{"venta_item_id": 1, "cantidad": 1}]. Devuelve bruto y total (saldo) de ESTA devolución.
create function public._calcular_devolucion(p_venta bigint, p_items jsonb)
returns table (bruto numeric, total numeric) language plpgsql security definer set search_path = public as $$
declare v ventas; v_orig numeric; v_queda numeric; v_bruto_acum numeric; v_factor numeric; v_total_acum numeric; v_mal text;
begin
  select * into v from ventas where id = p_venta;
  if not found then raise exception 'La venta no existe'; end if;
  if v.anulada_en is not null then raise exception 'La venta está anulada'; end if;
  if jsonb_array_length(coalesce(p_items, '[]')) = 0 then raise exception 'Elegí qué se devuelve'; end if;

  -- Lo pedido ahora, por renglón, contra lo vendido menos lo ya devuelto
  create temp table if not exists _dev_pedido (venta_item_id bigint, cantidad int) on commit drop;
  truncate _dev_pedido;
  insert into _dev_pedido select (i->>'venta_item_id')::bigint, sum((i->>'cantidad')::int)
    from jsonb_array_elements(p_items) i group by 1;
  if exists (select 1 from _dev_pedido where cantidad is null or cantidad <= 0) then raise exception 'Las cantidades tienen que ser mayores que cero'; end if;
  if exists (select 1 from _dev_pedido d left join venta_items vi on vi.id = d.venta_item_id where vi.venta_id is distinct from p_venta) then
    raise exception 'Hay un producto que no es de esta venta';
  end if;
  select string_agg(p.nombre || ' talle ' || t.nombre, ', ') into v_mal
    from _dev_pedido d join venta_items vi on vi.id = d.venta_item_id
    join variantes va on va.id = vi.variante_id join productos p on p.id = va.producto_id join talles t on t.id = va.talle_id
   where d.cantidad > vi.cantidad - coalesce((select sum(di.cantidad) from devolucion_items di where di.venta_item_id = vi.id), 0);
  if v_mal is not null then raise exception 'Se quiere devolver más de lo que queda por devolver: %', v_mal; end if;

  -- Lo pagado (sin descuento manual ni medio de pago) y lo que vale lo que se queda, con las promos de esa venta
  select coalesce(sum(cantidad * precio_unitario - descuento_promo), 0) into v_orig from venta_items where venta_id = p_venta;
  v_queda := _pagado_con_promos(
    (select coalesce(jsonb_agg(jsonb_build_object('variante_id', vi.variante_id, 'precio_unitario', vi.precio_unitario,
             'cantidad', vi.cantidad - coalesce((select sum(di.cantidad) from devolucion_items di where di.venta_item_id = vi.id), 0)
                         - coalesce((select d.cantidad from _dev_pedido d where d.venta_item_id = vi.id), 0))), '[]')
       from venta_items vi where vi.venta_id = p_venta),
    array(select distinct promocion_id from venta_items where venta_id = p_venta and promocion_id is not null));
  v_bruto_acum := greatest(v_orig - v_queda, 0);

  -- Descuento manual y descuentos del medio de pago, en proporción. El recargo de las cuotas no se devuelve.
  v_factor := case when v.subtotal - v.descuento_promociones > 0
                   then (v.subtotal - v.descuento_promociones - v.descuento
                         + coalesce((select sum(least(pg.ajuste, 0)) from pagos pg where pg.venta_id = p_venta), 0))
                        / (v.subtotal - v.descuento_promociones)
                   else 0 end;
  v_total_acum := round(v_bruto_acum * v_factor, 2);

  return query
  select greatest(v_bruto_acum - coalesce(sum(d.bruto), 0), 0), greatest(v_total_acum - coalesce(sum(d.total), 0), 0)
    from devoluciones d where d.venta_id = p_venta;
end $$;
revoke execute on function public._calcular_devolucion(bigint, jsonb) from public, anon, authenticated;

-- Para mostrar antes de confirmar: cuánto saldo deja, si está en plazo y hasta cuándo
create function public.cotizar_devolucion(p_venta bigint, p_items jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record; v ventas; v_limite date;
begin
  if not tiene_permiso('ventas.registrar') then raise exception 'No tenés permiso para hacer devoluciones'; end if;
  select * into r from _calcular_devolucion(p_venta, p_items);
  select * into v from ventas where id = p_venta;
  v_limite := (v.fecha at time zone 'America/Argentina/Buenos_Aires')::date + (select dias_cambio from configuracion_tienda);
  return jsonb_build_object('bruto', r.bruto, 'total', r.total, 'limite', v_limite, 'fuera_de_plazo', v_limite < _hoy_ar(),
                            'vence_saldo', _hoy_ar() + (select dias_saldo from configuracion_tienda));
end $$;

-- p_items: [{"venta_item_id": 1, "cantidad": 1, "estado": "bueno" | "fallado"}]
create function public.registrar_devolucion(p_venta bigint, p_items jsonb, p_motivo text, p_comentario text default null, p_cliente bigint default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare v ventas; r record; v_id bigint; v_cliente bigint; v_fuera boolean; v_lista numeric; v_asignado numeric := 0; v_monto numeric;
        it record; v_dep_fall bigint := deposito_fallados(); v_comp text; n int; k int := 0;
begin
  if not tiene_permiso('ventas.registrar') then raise exception 'No tenés permiso para hacer devoluciones'; end if;
  select * into v from ventas where id = p_venta for update;
  if not found then raise exception 'La venta no existe'; end if;
  if p_motivo is null or p_motivo not in ('talle', 'no_gusto', 'fallado', 'otro') then raise exception 'Elegí el motivo de la devolución'; end if;
  if p_motivo = 'otro' and coalesce(trim(p_comentario), '') = '' then raise exception 'Contá qué pasó (el motivo es «otro»)'; end if;
  if exists (select 1 from jsonb_array_elements(p_items) i where coalesce(i->>'estado', 'bueno') not in ('bueno', 'fallado')) then
    raise exception 'Cada producto vuelve en buen estado o fallado';
  end if;

  v_fuera := (v.fecha at time zone 'America/Argentina/Buenos_Aires')::date + (select dias_cambio from configuracion_tienda) < _hoy_ar();
  if v_fuera and not tiene_permiso('devoluciones.fuera_de_plazo') then
    raise exception 'Pasó el plazo de cambios (% días desde la compra): solo la puede aceptar el encargado', (select dias_cambio from configuracion_tienda);
  end if;
  v_cliente := coalesce(v.cliente_id, p_cliente);
  if v_cliente is null then raise exception 'La devolución deja saldo a favor: elegí o cargá el cliente'; end if;

  select * into r from _calcular_devolucion(p_venta, p_items);
  insert into devoluciones (venta_id, cliente_id, motivo, comentario, bruto, total, fuera_de_plazo)
  values (p_venta, v_cliente, p_motivo, nullif(trim(p_comentario), ''), r.bruto, r.total, v_fuera)
  returning id, comprobante into v_id, v_comp;

  -- Renglones: el saldo se reparte en proporción a su precio de lista (el último se lleva lo que falta)
  select sum((i->>'cantidad')::int * vi.precio_unitario), count(*) into v_lista, n
    from jsonb_array_elements(p_items) i join venta_items vi on vi.id = (i->>'venta_item_id')::bigint;
  for it in select (i->>'venta_item_id')::bigint as venta_item_id, (i->>'cantidad')::int as cantidad, coalesce(i->>'estado', 'bueno') as estado,
                   vi.variante_id, vi.precio_unitario, vi.costo_unitario
              from jsonb_array_elements(p_items) i join venta_items vi on vi.id = (i->>'venta_item_id')::bigint loop
    k := k + 1;
    v_monto := case when k = n then r.total - v_asignado
                    else round(r.total * it.cantidad * it.precio_unitario / nullif(v_lista, 0), 2) end;
    v_asignado := v_asignado + v_monto;
    insert into devolucion_items (devolucion_id, venta_item_id, cantidad, estado, monto)
    values (v_id, it.venta_item_id, it.cantidad, it.estado, greatest(coalesce(v_monto, 0), 0));

    if it.estado = 'bueno' then
      perform _mover_stock(it.variante_id, v.deposito_id, it.cantidad, 'devolucion', p_venta, null, 'Devolución ' || v_comp);
    else
      if v_dep_fall is null then raise exception 'No hay un depósito de fallados'; end if;
      perform _mover_stock(it.variante_id, v_dep_fall, it.cantidad, 'devolucion', p_venta, null, 'Devolución ' || v_comp || ' (fallado)');
      insert into fallados (variante_id, cantidad, origen, venta_id, deposito_origen_id, motivo, costo_unitario)
      values (it.variante_id, it.cantidad, 'cliente', p_venta, v.deposito_id,
              coalesce(nullif(trim(p_comentario), ''), 'Lo devolvió un cliente fallado'), coalesce(it.costo_unitario, 0));
    end if;
  end loop;

  if r.total > 0 then
    insert into saldos_cliente (cliente_id, tipo, monto, vence, devolucion_id)
    values (v_cliente, 'devolucion', r.total, _hoy_ar() + (select dias_saldo from configuracion_tienda), v_id);
  end if;
  return v_id;
end $$;
revoke execute on function public.cotizar_devolucion(bigint, jsonb), public.registrar_devolucion(bigint, jsonb, text, text, bigint) from public, anon;
grant execute on function public.cotizar_devolucion(bigint, jsonb), public.registrar_devolucion(bigint, jsonb, text, text, bigint) to authenticated;

-- ── Seguridad ─────────────────────────────────────────────────────────
-- Se escriben solo por las funciones de arriba. Las ve el equipo que vende o atiende clientes.
alter table public.devoluciones enable row level security;
alter table public.devolucion_items enable row level security;
alter table public.saldos_cliente enable row level security;
create policy "equipo ve devoluciones" on public.devoluciones for select to authenticated
  using (tiene_permiso('ventas.registrar') or tiene_permiso('ventas.ver_todas') or tiene_permiso('clientes.ver'));
create policy "equipo ve renglones de devoluciones" on public.devolucion_items for select to authenticated
  using (tiene_permiso('ventas.registrar') or tiene_permiso('ventas.ver_todas') or tiene_permiso('clientes.ver'));
create policy "equipo ve saldos" on public.saldos_cliente for select to authenticated
  using (tiene_permiso('ventas.registrar') or tiene_permiso('clientes.ver'));

-- ── Informes: la devolución resta el día que se hace ──────────────────
-- Filas negativas (venta_id vacío para que no cuenten como ventas). Lo fallado no recupera su costo.
create or replace view public.v_hechos_ventas with (security_invoker = false) as
select vi.id, ve.id as venta_id, ve.comprobante, ve.fecha, (ve.fecha at time zone 'America/Argentina/Buenos_Aires')::date as dia,
       extract(year from ve.fecha at time zone 'America/Argentina/Buenos_Aires')::int as anio,
       extract(month from ve.fecha at time zone 'America/Argentina/Buenos_Aires')::int as mes,
       extract(isodow from ve.fecha at time zone 'America/Argentina/Buenos_Aires')::int as dia_semana,
       ve.canal, d.nombre as deposito, cl.codigo as cliente_codigo, cl.nombre as cliente, cl.origen as cliente_origen,
       ve.usuario_id as vendedor_id, coalesce(pe.nombre, 'Sin registrar') as vendedor,
       p.codigo as articulo, p.nombre as modelo, m.nombre as marca, ca.codigo as rubro_codigo, ca.nombre as rubro,
       sc.nombre as subrubro, p.genero,
       t.nombre as talle, t.orden as talle_orden, co.nombre as color, v.sku,
       vi.cantidad, vi.precio_unitario, vi.descuento_promo, vi.promocion_id, coalesce(pr.nombre, 'Sin promoción') as promocion,
       case when tiene_permiso('costos.ver') then vi.costo_unitario end as costo_unitario,
       vi.cantidad * vi.precio_unitario as importe,
       case when tiene_permiso('costos.ver') then vi.cantidad * vi.costo_unitario end as costo,
       case when tiene_permiso('costos.ver') then vi.cantidad * (vi.precio_unitario - vi.costo_unitario) - vi.descuento_promo end as margen,
       round((vi.cantidad * vi.precio_unitario - vi.descuento_promo) * ve.total / nullif(ve.subtotal - ve.descuento_promociones, 0), 2) as importe_neto,
       case when tiene_permiso('costos.ver') then
         round((vi.cantidad * vi.precio_unitario - vi.descuento_promo) * ve.total / nullif(ve.subtotal - ve.descuento_promociones, 0)
               - vi.cantidad * vi.costo_unitario, 2) end as margen_neto,
       ve.pedido_id is not null as vino_de_pedido,
       p.escala, p.temporada, p.material, ca.linea,
       false as es_devolucion, null::bigint as devolucion_id
from venta_items vi
join ventas ve on ve.id = vi.venta_id
join depositos d on d.id = ve.deposito_id
left join clientes cl on cl.id = ve.cliente_id
left join perfiles pe on pe.id = ve.usuario_id
left join promociones pr on pr.id = vi.promocion_id
join variantes v on v.id = vi.variante_id
join productos p on p.id = v.producto_id
left join marcas m on m.id = p.marca_id
left join categorias ca on ca.id = p.categoria_id
left join subcategorias sc on sc.id = p.subcategoria_id
join talles t on t.id = v.talle_id
join colores co on co.id = v.color_id
where ve.anulada_en is null and (tiene_permiso('informes.ventas') or tiene_permiso('ventas.ver_todas'))
union all
select -di.id, null, dv.comprobante, dv.fecha, (dv.fecha at time zone 'America/Argentina/Buenos_Aires')::date,
       extract(year from dv.fecha at time zone 'America/Argentina/Buenos_Aires')::int,
       extract(month from dv.fecha at time zone 'America/Argentina/Buenos_Aires')::int,
       extract(isodow from dv.fecha at time zone 'America/Argentina/Buenos_Aires')::int,
       ve.canal, d.nombre, cl.codigo, cl.nombre, cl.origen,
       ve.usuario_id, coalesce(pe.nombre, 'Sin registrar'),
       p.codigo, p.nombre, m.nombre, ca.codigo, ca.nombre, sc.nombre, p.genero,
       t.nombre, t.orden, co.nombre, v.sku,
       -di.cantidad, vi.precio_unitario, 0::numeric(12,2), vi.promocion_id, coalesce(pr.nombre, 'Sin promoción'),
       case when tiene_permiso('costos.ver') then vi.costo_unitario end,
       -di.cantidad * vi.precio_unitario,
       case when tiene_permiso('costos.ver') then -di.cantidad * vi.costo_unitario end,
       case when tiene_permiso('costos.ver') then -di.monto + case when di.estado = 'bueno' then di.cantidad * vi.costo_unitario else 0 end end,
       -di.monto,
       case when tiene_permiso('costos.ver') then -di.monto + case when di.estado = 'bueno' then di.cantidad * vi.costo_unitario else 0 end end,
       ve.pedido_id is not null,
       p.escala, p.temporada, p.material, ca.linea,
       true, dv.id
from devolucion_items di
join devoluciones dv on dv.id = di.devolucion_id
join venta_items vi on vi.id = di.venta_item_id
join ventas ve on ve.id = vi.venta_id
join depositos d on d.id = ve.deposito_id
left join clientes cl on cl.id = dv.cliente_id
left join perfiles pe on pe.id = ve.usuario_id
left join promociones pr on pr.id = vi.promocion_id
join variantes v on v.id = vi.variante_id
join productos p on p.id = v.producto_id
left join marcas m on m.id = p.marca_id
left join categorias ca on ca.id = p.categoria_id
left join subcategorias sc on sc.id = p.subcategoria_id
join talles t on t.id = v.talle_id
join colores co on co.id = v.color_id
where tiene_permiso('informes.ventas') or tiene_permiso('ventas.ver_todas');

-- ── Lo que ve el cliente: su saldo a favor ────────────────────────────
create view public.v_mi_saldo with (security_invoker = false) as
select c.id, c.fecha, c.restante, c.vence, c.devolucion
from v_creditos c
where c.cliente_id = mi_cliente_id() and c.restante > 0 and c.vence >= (now() at time zone 'America/Argentina/Buenos_Aires')::date;
revoke select on public.v_mi_saldo from anon;
grant select on public.v_mi_saldo to authenticated;
