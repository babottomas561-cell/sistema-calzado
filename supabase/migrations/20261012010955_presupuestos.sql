-- Presupuestos: una cotización con vencimiento que se convierte en venta.
--
-- Los tres documentos del local (ninguno tiene validez fiscal):
--   · PRESUPUESTO  lo que se ofrece y a qué precio. No toca el stock. Congela precios y promociones
--                  hasta su vencimiento, igual que un pedido web.
--   · COMPROBANTE  la venta (ventas): lo que se entregó y se cobró. Descuenta stock.
--   · RECIBO       la constancia de cada cobro (viene después, con los pagos de saldo).
--
-- Se arma con el mismo motor que la caja (_renglones_cotizados): el mismo 2×1 da lo mismo en el
-- presupuesto y en la venta. Al convertirlo se respeta lo presupuestado (precio, promoción, descuento
-- y % del medio de pago); si ya venció, hay que hacer uno nuevo con los precios de hoy.
-- Se escribe solo por las funciones de abajo (la tabla no tiene políticas de escritura).

insert into public.numeradores (tipo) values ('PRE');

create table public.presupuestos (
  id                    bigint generated always as identity primary key,
  punto_venta           int not null default 1,
  numero                int,                        -- lo asigna el numerador
  comprobante           text generated always as (lpad(punto_venta::text, 4, '0') || '-' || lpad(numero::text, 8, '0')) stored,
  fecha                 timestamptz not null default now(),
  valido_hasta          date not null,              -- último día en que se respeta (hora argentina)
  estado                text not null default 'vigente' check (estado in ('vigente', 'convertido', 'anulado')),
  cliente_id            bigint references public.clientes (id) on delete restrict,
  canal                 text not null default 'Local' check (canal in ('Local', 'Web', 'WhatsApp', 'Instagram')),
  medio_pago_id         bigint references public.medios_pago (id) on delete restrict,
  ajuste_pct            numeric(5,2) not null default 0,       -- el % del medio al presupuestar (queda fijo)
  subtotal              numeric(12,2) not null check (subtotal >= 0),
  descuento_promociones numeric(12,2) not null default 0 check (descuento_promociones >= 0),
  descuento             numeric(12,2) not null default 0 check (descuento >= 0),   -- descuento manual del vendedor
  ajuste_medio_pago     numeric(12,2) not null default 0,
  total                 numeric(12,2) not null check (total >= 0),
  notas                 text,
  venta_id              bigint unique references public.ventas (id) on delete restrict,   -- si se convirtió
  usuario_id            uuid default auth.uid() references public.perfiles (id) on delete set null,
  check (total = subtotal - descuento_promociones - descuento + ajuste_medio_pago),
  check ((estado = 'convertido') = (venta_id is not null))
);
create index presupuestos_cliente_id_idx on public.presupuestos (cliente_id);
create index presupuestos_medio_pago_id_idx on public.presupuestos (medio_pago_id);
create index presupuestos_usuario_id_idx on public.presupuestos (usuario_id);
create index presupuestos_fecha_idx on public.presupuestos (fecha);
create trigger numero before insert on public.presupuestos for each row execute function public._numerar('PRE');

create table public.presupuesto_items (
  id               bigint generated always as identity primary key,
  presupuesto_id   bigint not null references public.presupuestos (id) on delete cascade,
  variante_id      bigint not null references public.variantes (id) on delete restrict,
  cantidad         integer not null check (cantidad > 0),
  precio_unitario  numeric(12,2) not null check (precio_unitario >= 0),     -- de lista
  descuento_promo  numeric(12,2) not null default 0 check (descuento_promo >= 0),
  promocion_id     bigint references public.promociones (id) on delete restrict
);
create index presupuesto_items_presupuesto_id_idx on public.presupuesto_items (presupuesto_id);
create index presupuesto_items_variante_id_idx on public.presupuesto_items (variante_id);
create index presupuesto_items_promocion_id_idx on public.presupuesto_items (promocion_id);

-- Lo ve quien puede ver esa venta (el que lo hizo, o quien ve todas). No hay políticas de escritura.
alter table public.presupuestos enable row level security;
alter table public.presupuesto_items enable row level security;
create policy "ve presupuestos" on public.presupuestos for select to authenticated using (puede_ver_venta(usuario_id));
create policy "ve renglones" on public.presupuesto_items for select to authenticated
  using (presupuesto_id in (select id from public.presupuestos));
-- El equipo ve el nombre de las promociones que aparecen en un presupuesto aunque ya hayan terminado
-- (ya pueden ver la tabla promociones: es_staff). Al cliente no se le muestran presupuestos.

-- Hoy en hora argentina
create or replace function public._hoy_ar() returns date language sql stable set search_path = public as $$
  select (now() at time zone 'America/Argentina/Buenos_Aires')::date $$;

-- ── Crear ─────────────────────────────────────────────────────────────
-- p_items: [{variante_id, cantidad, precio_unitario?}] — el precio de lista lo pone la base (salvo "Cambiar
-- el precio"). No reserva ni descuenta stock: el stock se controla al convertirlo en venta.
create or replace function public.crear_presupuesto(
  p_items jsonb, p_cliente bigint default null, p_medio_pago bigint default null, p_descuento numeric default 0,
  p_canal text default 'Local', p_validez_dias int default 7, p_notas text default null
) returns bigint language plpgsql security definer set search_path = public as $$
declare v_items jsonb; v_medio medios_pago; v_tope numeric; v_sub numeric; v_promos numeric; v_acum numeric;
        v_neto numeric; v_factor numeric; v_aj numeric := 0; v_id bigint; it jsonb;
begin
  if not tiene_permiso('ventas.registrar') then raise exception 'No tenés permiso para hacer presupuestos'; end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'El presupuesto no tiene productos'; end if;
  if p_validez_dias not between 1 and 90 then raise exception 'La validez tiene que ser de 1 a 90 días'; end if;
  if coalesce(p_descuento, 0) < 0 then raise exception 'El descuento no puede ser negativo'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    if coalesce((it->>'cantidad')::int, 0) <= 0 then raise exception 'Cantidad inválida'; end if;
    if not exists (select 1 from variantes v join productos p on p.id = v.producto_id
                    where v.id = (it->>'variante_id')::bigint and p.activo) then
      raise exception 'Uno de los productos no está disponible';
    end if;
  end loop;

  select coalesce(jsonb_agg(i || jsonb_build_object('precio_unitario',
           case when tiene_permiso('ventas.cambiar_precio') and i ? 'precio_unitario' then (i->>'precio_unitario')::numeric
                else precio_de((i->>'variante_id')::bigint) end)), '[]') into v_items
    from jsonb_array_elements(p_items) i;
  v_items := _renglones_cotizados(v_items, 'mostrador');

  select coalesce(sum((i->>'cantidad')::int * (i->>'precio_unitario')::numeric), 0),
         coalesce(sum((i->>'descuento_promo')::numeric), 0),
         coalesce(sum(case when (i->>'acumula')::boolean then (i->>'cantidad')::int * (i->>'precio_unitario')::numeric - (i->>'descuento_promo')::numeric else 0 end), 0)
    into v_sub, v_promos, v_acum from jsonb_array_elements(v_items) i;
  v_neto := v_sub - v_promos;
  if p_descuento > v_neto then raise exception 'El descuento es mayor que el total'; end if;

  -- Mismo tope de descuento que en la caja, medido sobre lo que queda después de las promociones
  select r.descuento_max_pct into v_tope from perfiles pe join roles r on r.id = pe.rol_id where pe.id = auth.uid() and not r.todos;
  if v_tope is not null and coalesce(p_descuento, 0) > round(v_neto * v_tope / 100, 2) then
    raise exception 'Tu descuento máximo es del % %%: para más, pedíselo a un encargado', trim(to_char(v_tope, 'FM990D##'));
  end if;

  if p_medio_pago is not null then
    select * into v_medio from medios_pago where id = p_medio_pago and activo and en_mostrador;
    if not found then raise exception 'Elegí un medio de pago válido'; end if;
    -- igual que _registrar_venta: el % se aplica sobre lo que queda y solo en la parte que acumula
    v_factor := case when v_neto > 0 then v_acum / v_neto else 1 end;
    v_aj := round((v_neto - p_descuento) * v_medio.ajuste_pct / 100 * v_factor, 2);
  end if;

  insert into presupuestos (valido_hasta, cliente_id, canal, medio_pago_id, ajuste_pct, subtotal, descuento_promociones,
                            descuento, ajuste_medio_pago, total, notas)
  values (_hoy_ar() + p_validez_dias, p_cliente, p_canal, v_medio.id, coalesce(v_medio.ajuste_pct, 0), v_sub, v_promos,
          coalesce(p_descuento, 0), v_aj, v_neto - coalesce(p_descuento, 0) + v_aj, nullif(trim(p_notas), ''))
  returning id into v_id;

  insert into presupuesto_items (presupuesto_id, variante_id, cantidad, precio_unitario, descuento_promo, promocion_id)
  select v_id, (i->>'variante_id')::bigint, (i->>'cantidad')::int, (i->>'precio_unitario')::numeric,
         (i->>'descuento_promo')::numeric, (i->>'promocion_id')::bigint
    from jsonb_array_elements(v_items) i;
  return v_id;
end $$;

-- ── Convertir en venta ────────────────────────────────────────────────
-- Respeta lo presupuestado (precio, promoción, descuento y % del medio). Si se cobra con otro medio,
-- rige el % de ese medio hoy. Devuelve el id de la venta.
create or replace function public.convertir_presupuesto(p_presupuesto bigint, p_medio_pago bigint default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_pre presupuestos; v_medio bigint; v_venta bigint;
begin
  if not tiene_permiso('ventas.registrar') then raise exception 'No tenés permiso para registrar ventas'; end if;
  select * into v_pre from presupuestos where id = p_presupuesto for update;
  if not found or not puede_ver_venta(v_pre.usuario_id) then raise exception 'El presupuesto no existe'; end if;
  if v_pre.estado = 'convertido' then raise exception 'Este presupuesto ya se convirtió en venta'; end if;
  if v_pre.estado = 'anulado' then raise exception 'Este presupuesto está anulado'; end if;
  if v_pre.valido_hasta < _hoy_ar() then
    raise exception 'Este presupuesto venció el %. Hacé uno nuevo con los precios de hoy.', to_char(v_pre.valido_hasta, 'DD/MM/YYYY');
  end if;
  v_medio := coalesce(p_medio_pago, v_pre.medio_pago_id);
  if v_medio is null then raise exception 'Elegí cómo se cobra'; end if;

  v_venta := _registrar_venta(
    (select jsonb_agg(jsonb_build_object('variante_id', pi.variante_id, 'cantidad', pi.cantidad, 'precio_unitario', pi.precio_unitario,
                                         'descuento_promo', pi.descuento_promo, 'promocion_id', pi.promocion_id,
                                         'acumula', coalesce(pr.acumula_medio_pago, true)))
       from presupuesto_items pi left join promociones pr on pr.id = pi.promocion_id where pi.presupuesto_id = p_presupuesto),
    case when v_medio = v_pre.medio_pago_id
         then jsonb_build_array(jsonb_build_object('medio_pago_id', v_medio, 'ajuste_pct', v_pre.ajuste_pct))
         else jsonb_build_array(jsonb_build_object('medio_pago_id', v_medio)) end,
    v_pre.cliente_id, v_pre.descuento, v_pre.canal, null, 'Presupuesto ' || v_pre.comprobante);
  update presupuestos set estado = 'convertido', venta_id = v_venta where id = p_presupuesto;
  return v_venta;
end $$;

-- ── Anular ────────────────────────────────────────────────────────────
create or replace function public.anular_presupuesto(p_presupuesto bigint) returns void
language plpgsql security definer set search_path = public as $$
declare v_pre presupuestos;
begin
  if not tiene_permiso('ventas.registrar') then raise exception 'No tenés permiso para anular presupuestos'; end if;
  select * into v_pre from presupuestos where id = p_presupuesto for update;
  if not found or not puede_ver_venta(v_pre.usuario_id) then raise exception 'El presupuesto no existe'; end if;
  if v_pre.estado <> 'vigente' then raise exception 'Solo se puede anular un presupuesto vigente'; end if;
  update presupuestos set estado = 'anulado' where id = p_presupuesto;
end $$;

revoke execute on function public.crear_presupuesto, public.convertir_presupuesto, public.anular_presupuesto, public._hoy_ar from public, anon;
grant execute on function public.crear_presupuesto, public.convertir_presupuesto, public.anular_presupuesto to authenticated;
revoke execute on function public._hoy_ar from authenticated;
