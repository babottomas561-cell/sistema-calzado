-- Promociones (2×1, 3×2, 2do al X %, X % off, precio especial) y el MOTOR DE PRECIOS que las aplica.
-- Diseño completo en docs/PROMOCIONES.md.
--
-- Un solo cálculo para todo: cotizar() (lo que muestra el carrito y arma el mensaje de WhatsApp),
-- crear_pedido(), la entrega de un pedido y registrar_venta() usan la misma regla interna _cotizar().
-- Así un 2×1 da exactamente lo mismo en la tienda, en el pedido y en la caja.
--
-- Reglas (fijas, para que siempre dé lo mismo):
--   · un par tiene una sola promoción (no se apilan); gana la de mayor prioridad;
--   · nxm (lleva N, paga M): pares de más caro a más barato en grupos de N; en cada grupo completo
--     los N−M más baratos salen gratis. segunda_unidad: de a 2, el más barato con el % off;
--   · mezcla = true: el grupo puede armarse con modelos distintos del alcance; false: por modelo;
--   · orden: lista → promoción → descuento manual → % del medio de pago. Si la promo no "acumula" con
--     el medio de pago, el % del medio no se aplica sobre esos renglones.
-- Se guarda por renglón (venta_items / pedido_items): precio de LISTA + descuento_promo + promocion_id,
-- así los informes muestran cuánto se resignó en cada promoción.

-- ── Permiso ───────────────────────────────────────────────────────────
insert into public.permisos (orden, grupo, codigo, nombre, descripcion) values
  (53, 'Catálogo', 'promociones.gestionar', 'Promociones', 'Crear, cambiar y terminar promociones (2×1, 2do al 50 %, % por marca…).');
update public.roles set permisos = permisos || '{promociones.gestionar}' where nombre = 'Encargado';

-- ── Datos de la tienda (una sola fila): el WhatsApp que recibe los pedidos ──
create table public.configuracion_tienda (
  id                bigint generated always as identity primary key,
  nombre            text not null default 'Mi Calzado',
  -- Número para los pedidos, solo dígitos con código de país y área: 5493815551234
  whatsapp          text check (whatsapp ~ '^[0-9]{10,15}$'),
  direccion_retiro  text,                     -- se muestra al elegir "retiro en el local"
  horario           text,
  unica             boolean not null default true unique check (unica)   -- una sola fila
);
insert into public.configuracion_tienda default values;
alter table public.configuracion_tienda enable row level security;
-- Es información pública (la ve la tienda); la cambia quien tiene "Tablas"
create policy "todos ven" on public.configuracion_tienda for select to anon, authenticated using (true);
create policy "tablas" on public.configuracion_tienda for update to authenticated
  using (tiene_permiso('tablas.editar')) with check (tiene_permiso('tablas.editar'));

-- ── Promociones ───────────────────────────────────────────────────────
create table public.promociones (
  id                  bigint generated always as identity primary key,
  nombre              text not null,          -- "2do par al 50 % en Nike"
  tipo                text not null check (tipo in ('nxm', 'segunda_unidad', 'porcentaje', 'precio_fijo')),
  lleva               int,                    -- nxm: lleva 2…
  paga                int,                    -- …paga 1 (2×1)
  descuento_pct       numeric(5,2),           -- segunda_unidad (50 = el 2do al 50 %) y porcentaje
  precio_fijo         numeric(12,2),          -- precio_fijo
  desde               timestamptz,            -- vigencia (vacío = desde ya / sin fin)
  hasta               timestamptz,
  activa              boolean not null default true,
  en_tienda           boolean not null default true,
  en_mostrador        boolean not null default true,
  acumula_medio_pago  boolean not null default true,   -- ¿el % del efectivo se suma encima?
  mezcla              boolean not null default true,   -- ¿el 2×1 vale combinando modelos distintos?
  prioridad           int not null default 0,
  creado_en           timestamptz not null default now(),
  usuario_id          uuid default auth.uid() references public.perfiles (id) on delete set null,
  check (tipo <> 'nxm' or (lleva >= 2 and paga >= 1 and paga < lleva)),
  check (tipo not in ('segunda_unidad', 'porcentaje') or (descuento_pct > 0 and descuento_pct <= 100)),
  check (tipo <> 'precio_fijo' or precio_fijo >= 0),
  check (hasta is null or desde is null or hasta > desde)
);
create index promociones_usuario_id_idx on public.promociones (usuario_id);

-- A qué artículos aplica: una fila por marca, rubro, subrubro o artículo (exactamente uno)
create table public.promocion_alcances (
  id               bigint generated always as identity primary key,
  promocion_id     bigint not null references public.promociones (id) on delete cascade,
  marca_id         bigint references public.marcas (id) on delete restrict,
  categoria_id     bigint references public.categorias (id) on delete restrict,
  subcategoria_id  bigint references public.subcategorias (id) on delete restrict,
  producto_id      bigint references public.productos (id) on delete restrict,
  excluir          boolean not null default false,     -- "toda Nike menos la Pegasus"
  check (num_nonnulls(marca_id, categoria_id, subcategoria_id, producto_id) = 1)
);
create index promocion_alcances_promocion_id_idx on public.promocion_alcances (promocion_id);
create index promocion_alcances_marca_id_idx on public.promocion_alcances (marca_id);
create index promocion_alcances_categoria_id_idx on public.promocion_alcances (categoria_id);
create index promocion_alcances_subcategoria_id_idx on public.promocion_alcances (subcategoria_id);
create index promocion_alcances_producto_id_idx on public.promocion_alcances (producto_id);

alter table public.promociones enable row level security;
alter table public.promocion_alcances enable row level security;
create policy "equipo ve" on public.promociones for select to authenticated using (es_staff());
create policy "gestiona promociones" on public.promociones for all to authenticated
  using (tiene_permiso('promociones.gestionar')) with check (tiene_permiso('promociones.gestionar'));
create policy "equipo ve" on public.promocion_alcances for select to authenticated using (es_staff());
create policy "gestiona promociones" on public.promocion_alcances for all to authenticated
  using (tiene_permiso('promociones.gestionar')) with check (tiene_permiso('promociones.gestionar'));

-- Lo que dice la etiqueta: "2×1", "2do al 50 %", "20 % off", "Precio especial"
create or replace function public.etiqueta_promocion(p_tipo text, p_lleva int, p_paga int, p_pct numeric) returns text
language sql immutable set search_path = public as $$
  select case p_tipo
    when 'nxm' then p_lleva || '×' || p_paga
    when 'segunda_unidad' then case when p_pct = 100 then '2do gratis' else '2do al ' || trim_scale(p_pct) || ' %' end
    when 'porcentaje' then trim_scale(p_pct) || ' % off'
    else 'Precio especial' end;
$$;

-- ¿El artículo entra en la promoción? (está en el alcance y no está excluido)
create or replace function public._en_promocion(p_promocion bigint, p_producto bigint) returns boolean
language sql stable security definer set search_path = public as $$
  with p as (select id, marca_id, categoria_id, subcategoria_id from productos where id = p_producto),
  coincide as (
    select a.excluir from promocion_alcances a, p
     where a.promocion_id = p_promocion
       and (a.producto_id = p.id or a.marca_id = p.marca_id or a.categoria_id = p.categoria_id or a.subcategoria_id = p.subcategoria_id))
  select exists (select 1 from coincide where not excluir) and not exists (select 1 from coincide where excluir);
$$;

-- Vigente ahora y en ese canal ('tienda' o 'mostrador')
create or replace function public._promociones_vigentes(p_canal text) returns setof public.promociones
language sql stable security definer set search_path = public as $$
  select * from promociones
   where activa and (desde is null or desde <= now()) and (hasta is null or hasta > now())
     and case when p_canal = 'tienda' then en_tienda else en_mostrador end
   order by prioridad desc, id;
$$;

-- ── El motor ──────────────────────────────────────────────────────────
-- p_items: [{"variante_id": 1, "cantidad": 2, "precio_unitario": 85000}] (precios YA resueltos).
-- Devuelve un renglón por variante y promoción (3 pares iguales en un 2×1 → 2 con promo y 1 sin).
-- Deja la tabla temporal _unidades (un par por fila) para que cotizar() calcule "te falta 1 para el 2×1".
create or replace function public._cotizar(p_items jsonb, p_canal text)
returns table (variante_id bigint, producto_id bigint, cantidad int, precio_unitario numeric,
               descuento_promo numeric, promocion_id bigint, acumula boolean)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare pr promociones; v_lleva int; v_bonif int;
begin
  if to_regclass('pg_temp._unidades') is not null then drop table _unidades; end if;
  create temp table _unidades on commit drop as
  select row_number() over () as n, x.variante_id, v.producto_id, x.precio, null::bigint as promocion_id, 0::numeric as descuento
    from (select (i->>'variante_id')::bigint as variante_id, (i->>'precio_unitario')::numeric as precio,
                 generate_series(1, greatest((i->>'cantidad')::int, 0)) as k
            from jsonb_array_elements(p_items) i) x
    join variantes v on v.id = x.variante_id;

  for pr in select * from _promociones_vigentes(p_canal) loop
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

  return query
  select u.variante_id, u.producto_id, count(*)::int, u.precio, sum(u.descuento), u.promocion_id,
         coalesce(bool_and(p.acumula_medio_pago), true)
    from _unidades u left join promociones p on p.id = u.promocion_id
   group by u.variante_id, u.producto_id, u.precio, u.promocion_id
   order by min(u.n);
end $$;

-- Cotizar para mostrar (carrito de la tienda, punto de venta, mensaje de WhatsApp).
-- p_canal 'tienda': precios de lista de lo publicado (lo puede llamar cualquiera, aun sin cuenta).
-- p_canal 'mostrador': solo el equipo que vende; respeta el precio cargado si puede cambiar precios.
create or replace function public.cotizar(p_items jsonb, p_medio_pago bigint default null, p_canal text default 'tienda')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_items jsonb; v_pct numeric := 0; v_res jsonb; v_sub numeric; v_promo numeric; v_acum numeric; v_aj numeric;
begin
  if p_canal not in ('tienda', 'mostrador') then raise exception 'Canal inválido'; end if;
  if p_canal = 'mostrador' and not tiene_permiso('ventas.registrar') then raise exception 'No tenés permiso para vender'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('variante_id', v.id, 'cantidad', (i->>'cantidad')::int,
           'precio_unitario', case when p_canal = 'mostrador' and tiene_permiso('ventas.cambiar_precio') and i ? 'precio_unitario'
                                   then (i->>'precio_unitario')::numeric else precio_de(v.id) end)), '[]')
    into v_items
    from jsonb_array_elements(p_items) i
    join variantes v on v.id = (i->>'variante_id')::bigint
    join productos p on p.id = v.producto_id
   where (i->>'cantidad')::int > 0 and p.activo and (p_canal = 'mostrador' or p.publicado_web);

  select ajuste_pct into v_pct from medios_pago
   where id = p_medio_pago and activo and case when p_canal = 'tienda' then en_tienda else en_mostrador end;

  with r as (select * from _cotizar(v_items, p_canal))
  select coalesce(sum(r.cantidad * r.precio_unitario), 0), coalesce(sum(r.descuento_promo), 0),
         coalesce(sum(case when r.acumula then r.cantidad * r.precio_unitario - r.descuento_promo else 0 end), 0),
         coalesce(jsonb_agg(jsonb_build_object(
           'variante_id', r.variante_id, 'producto_id', r.producto_id, 'cantidad', r.cantidad, 'precio_unitario', r.precio_unitario,
           'descuento_promo', r.descuento_promo, 'promocion_id', r.promocion_id, 'promocion', pr.nombre,
           'etiqueta', case when pr.id is not null then etiqueta_promocion(pr.tipo, pr.lleva, pr.paga, pr.descuento_pct) end,
           'acumula', r.acumula, 'total', r.cantidad * r.precio_unitario - r.descuento_promo)), '[]')
    into v_sub, v_promo, v_acum, v_res
    from r left join promociones pr on pr.id = r.promocion_id;

  v_aj := round(v_acum * coalesce(v_pct, 0) / 100, 2);
  return jsonb_build_object(
    'renglones', v_res, 'subtotal', v_sub, 'descuento_promociones', v_promo,
    'ajuste_pct', coalesce(v_pct, 0), 'ajuste_medio_pago', v_aj, 'total', v_sub - v_promo + v_aj,
    -- "Te falta 1 par para el 2×1": pares del alcance que quedaron sin grupo completo
    'sugerencias', coalesce((
      select jsonb_agg(jsonb_build_object('promocion', pr.nombre, 'etiqueta', etiqueta_promocion(pr.tipo, pr.lleva, pr.paga, pr.descuento_pct),
                                          'faltan', s.lleva - s.sueltos % s.lleva))
        from (select p.id, case when p.tipo = 'nxm' then p.lleva else 2 end as lleva,
                     (select count(*) from _unidades u where u.promocion_id is null and _en_promocion(p.id, u.producto_id))::int as sueltos
                from _promociones_vigentes(p_canal) p where p.tipo in ('nxm', 'segunda_unidad')) s
        join promociones pr on pr.id = s.id
       where s.sueltos % s.lleva > 0), '[]'));
end $$;

-- Etiquetas de promoción para el catálogo público (sin costos)
create or replace view public.v_promos_tienda as
select p.id as producto_id, pr.id as promocion_id, pr.nombre,
       etiqueta_promocion(pr.tipo, pr.lleva, pr.paga, pr.descuento_pct) as etiqueta, pr.mezcla, pr.hasta
from productos p
cross join lateral _promociones_vigentes('tienda') pr
where p.publicado_web and p.activo and _en_promocion(pr.id, p.id);
grant select on public.v_promos_tienda to anon, authenticated;

-- ── Renglones y totales con promoción ─────────────────────────────────
alter table public.pedido_items add column descuento_promo numeric(12,2) not null default 0 check (descuento_promo >= 0),
  add column promocion_id bigint references public.promociones (id) on delete restrict;
create index pedido_items_promocion_id_idx on public.pedido_items (promocion_id);
alter table public.pedidos add column descuento_promociones numeric(12,2) not null default 0 check (descuento_promociones >= 0);
alter table public.pedidos drop constraint pedidos_check;
alter table public.pedidos add constraint pedidos_total_cuadra check (total = subtotal - descuento_promociones + ajuste_medio_pago);

alter table public.venta_items add column descuento_promo numeric(12,2) not null default 0 check (descuento_promo >= 0),
  add column promocion_id bigint references public.promociones (id) on delete restrict;
create index venta_items_promocion_id_idx on public.venta_items (promocion_id);
alter table public.ventas add column descuento_promociones numeric(12,2) not null default 0 check (descuento_promociones >= 0);
alter table public.ventas drop constraint ventas_check1;
alter table public.ventas add constraint ventas_total_cuadra check (total = subtotal - descuento - descuento_promociones + ajuste_medio_pago);

-- ── La venta en sí: ahora con promociones por renglón ─────────────────
-- p_items: [{variante_id, cantidad, precio_unitario, descuento_promo?, promocion_id?, acumula?}]
-- El % del medio de pago se aplica sobre la parte "acumulable" (factor), igual que en cotizar().
create or replace function public._registrar_venta(
  p_items jsonb, p_pagos jsonb, p_cliente bigint, p_descuento numeric,
  p_canal text, p_deposito bigint, p_notas text
) returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint; it jsonb; v_sub numeric; v_promos numeric; v_acum numeric; v_factor numeric; v_resto numeric;
        v_base numeric; v_pct numeric; v_aj numeric; v_ajustes numeric := 0; v_pagos jsonb := '[]'; v_medio medios_pago;
        v_dep bigint := coalesce(p_deposito, deposito_principal()); v_disp int;
begin
  if jsonb_array_length(p_items) = 0 then raise exception 'La venta no tiene productos'; end if;
  select coalesce(sum((i->>'cantidad')::int * (i->>'precio_unitario')::numeric), 0),
         coalesce(sum(coalesce((i->>'descuento_promo')::numeric, 0)), 0),
         coalesce(sum(case when coalesce((i->>'acumula')::boolean, true)
                           then (i->>'cantidad')::int * (i->>'precio_unitario')::numeric - coalesce((i->>'descuento_promo')::numeric, 0) else 0 end), 0)
    into v_sub, v_promos, v_acum from jsonb_array_elements(p_items) i;
  if coalesce(p_descuento, 0) < 0 then raise exception 'El descuento no puede ser negativo'; end if;
  if p_descuento > v_sub - v_promos then raise exception 'El descuento es mayor que el total'; end if;
  -- Qué parte del neto admite el % del medio de pago (1 si no hay promos que no acumulan)
  v_factor := case when v_sub - v_promos > 0 then v_acum / (v_sub - v_promos) else 1 end;

  v_resto := v_sub - v_promos - p_descuento;
  for it in select * from jsonb_array_elements(p_pagos) loop
    select * into v_medio from medios_pago where id = (it->>'medio_pago_id')::bigint and activo;
    if not found then raise exception 'Medio de pago inexistente o desactivado'; end if;
    v_base := coalesce((it->>'base')::numeric, v_resto);
    if v_base <= 0 then continue; end if;
    if v_base > v_resto + 0.01 then raise exception 'Los pagos superan el total'; end if;
    v_pct := coalesce((it->>'ajuste_pct')::numeric, v_medio.ajuste_pct);
    if v_pct not between -100 and 100 then raise exception 'Ajuste de medio de pago inválido'; end if;
    v_aj := round(v_base * v_pct / 100 * v_factor, 2);
    v_pagos := v_pagos || jsonb_build_object('medio_pago_id', v_medio.id, 'base', v_base, 'ajuste_pct', v_pct,
                                             'ajuste', v_aj, 'cuotas', v_medio.cuotas, 'referencia', it->>'referencia');
    v_ajustes := v_ajustes + v_aj;
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

  insert into pagos (venta_id, medio_pago_id, base, ajuste_pct, ajuste, cuotas, referencia)
  select v_id, (x->>'medio_pago_id')::bigint, (x->>'base')::numeric, (x->>'ajuste_pct')::numeric,
         (x->>'ajuste')::numeric, (x->>'cuotas')::int, x->>'referencia'
    from jsonb_array_elements(v_pagos) x;
  return v_id;
end $$;

-- Pasa los renglones de _cotizar() al formato de _registrar_venta / pedido_items
create or replace function public._renglones_cotizados(p_items jsonb, p_canal text) returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('variante_id', r.variante_id, 'cantidad', r.cantidad, 'precio_unitario', r.precio_unitario,
                                               'descuento_promo', r.descuento_promo, 'promocion_id', r.promocion_id, 'acumula', r.acumula)), '[]')
    from _cotizar(p_items, p_canal) r;
$$;

-- Venta de mostrador: permiso, precio de lista (sin "Cambiar el precio"), promociones y tope de descuento
create or replace function public.registrar_venta(
  p_items jsonb, p_pagos jsonb default '[]', p_cliente bigint default null,
  p_descuento numeric default 0, p_canal text default 'Local',
  p_deposito bigint default null, p_notas text default null
) returns bigint language plpgsql security definer set search_path = public as $$
declare v_items jsonb; v_neto numeric; v_tope numeric;
begin
  if not tiene_permiso('ventas.registrar') then raise exception 'No tenés permiso para registrar ventas'; end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'La venta no tiene productos'; end if;
  if exists (select 1 from jsonb_array_elements(p_items) i where coalesce((i->>'cantidad')::int, 0) <= 0) then raise exception 'Cantidad inválida'; end if;
  -- Sin "Cambiar el precio al vender" se cobra el de lista; con el permiso, el cargado (si no vino, el de lista)
  select coalesce(jsonb_agg(i || jsonb_build_object('precio_unitario',
           case when tiene_permiso('ventas.cambiar_precio') and i ? 'precio_unitario' then (i->>'precio_unitario')::numeric
                else precio_de((i->>'variante_id')::bigint) end)), '[]') into v_items
    from jsonb_array_elements(p_items) i;
  -- Promociones vigentes en el mostrador (la cajera no las elige ni las saca: las aplica la base)
  v_items := _renglones_cotizados(v_items, 'mostrador');
  -- Tope del descuento manual según el rol, sobre lo que queda después de las promociones
  select r.descuento_max_pct into v_tope from perfiles pe join roles r on r.id = pe.rol_id where pe.id = auth.uid() and not r.todos;
  select coalesce(sum((i->>'cantidad')::int * (i->>'precio_unitario')::numeric - (i->>'descuento_promo')::numeric), 0) into v_neto
    from jsonb_array_elements(v_items) i;
  if v_tope is not null and coalesce(p_descuento, 0) > round(v_neto * v_tope / 100, 2) then
    raise exception 'Tu descuento máximo es del % %%: para más, pedíselo a un encargado', trim(to_char(v_tope, 'FM990D##'));
  end if;
  return _registrar_venta(v_items, p_pagos, p_cliente, coalesce(p_descuento, 0), p_canal, p_deposito, p_notas);
end $$;

-- Pedido web (o cargado por el equipo): precios y promociones los pone la base, y reserva stock
create or replace function public.crear_pedido(
  p_items jsonb, p_entrega text default 'retiro', p_direccion text default null,
  p_medio_pago bigint default null, p_notas text default null,
  p_cliente bigint default null, p_canal text default 'Web'
) returns bigint language plpgsql security definer set search_path = public as $$
declare v_cliente bigint; v_id bigint; it jsonb; v_dep bigint := deposito_principal(); v_disp int;
        v_medio medios_pago; v_equipo boolean := tiene_permiso('pedidos.gestionar'); v_items jsonb; v_renglones jsonb;
        v_sub numeric; v_promos numeric; v_acum numeric;
begin
  if auth.uid() is null then raise exception 'Tenés que ingresar para hacer un pedido'; end if;
  if v_equipo and p_cliente is not null then v_cliente := p_cliente;
  else
    select id into v_cliente from clientes where usuario_id = auth.uid();
    if v_cliente is null then raise exception 'Tu usuario no tiene ficha de cliente'; end if;
  end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'El pedido está vacío'; end if;
  if p_entrega = 'envio' and coalesce(trim(p_direccion), '') = '' then raise exception 'Falta la dirección de envío'; end if;
  select * into v_medio from medios_pago where id = p_medio_pago and activo and (en_tienda or v_equipo);
  if not found then raise exception 'Elegí un medio de pago válido'; end if;

  -- Precios vigentes (nunca los del navegador) de artículos activos y publicados
  for it in select * from jsonb_array_elements(p_items) loop
    if (it->>'cantidad')::int <= 0 then raise exception 'Cantidad inválida'; end if;
    if not exists (select 1 from variantes v join productos p on p.id = v.producto_id
                    where v.id = (it->>'variante_id')::bigint and p.activo and (p.publicado_web or v_equipo)) then
      raise exception 'Uno de los productos ya no está disponible';
    end if;
  end loop;
  select jsonb_agg(jsonb_build_object('variante_id', (i->>'variante_id')::bigint, 'cantidad', (i->>'cantidad')::int,
                                      'precio_unitario', precio_de((i->>'variante_id')::bigint)))
    into v_items from jsonb_array_elements(p_items) i;
  v_renglones := _renglones_cotizados(v_items, 'tienda');

  insert into pedidos (cliente_id, canal, entrega, direccion_envio, medio_pago_id, ajuste_pct, deposito_id, notas)
  values (v_cliente, case when v_equipo then p_canal else 'Web' end, p_entrega, p_direccion, v_medio.id, v_medio.ajuste_pct, v_dep, p_notas)
  returning id into v_id;

  for it in select * from jsonb_array_elements(v_renglones) loop
    select cantidad - reservado into v_disp from stock where variante_id = (it->>'variante_id')::bigint and deposito_id = v_dep for update;
    if coalesce(v_disp, 0) < (it->>'cantidad')::int then raise exception 'No hay stock suficiente de uno de los productos (quedan %)', coalesce(v_disp, 0); end if;
    update stock set reservado = reservado + (it->>'cantidad')::int where variante_id = (it->>'variante_id')::bigint and deposito_id = v_dep;
    insert into pedido_items (pedido_id, variante_id, cantidad, precio_unitario, descuento_promo, promocion_id)
    values (v_id, (it->>'variante_id')::bigint, (it->>'cantidad')::int, (it->>'precio_unitario')::numeric,
            (it->>'descuento_promo')::numeric, (it->>'promocion_id')::bigint);
  end loop;

  select sum((i->>'cantidad')::int * (i->>'precio_unitario')::numeric), sum((i->>'descuento_promo')::numeric),
         sum(case when (i->>'acumula')::boolean then (i->>'cantidad')::int * (i->>'precio_unitario')::numeric - (i->>'descuento_promo')::numeric else 0 end)
    into v_sub, v_promos, v_acum from jsonb_array_elements(v_renglones) i;
  update pedidos set subtotal = v_sub, descuento_promociones = v_promos,
         ajuste_medio_pago = round(v_acum * v_medio.ajuste_pct / 100, 2),
         total = v_sub - v_promos + round(v_acum * v_medio.ajuste_pct / 100, 2)
   where id = v_id;
  insert into pedido_estados (pedido_id, estado, comentario) values (v_id, 'pendiente', 'Pedido recibido');
  return v_id;
end $$;

-- Entregar un pedido: se respetan el precio, la promoción y el % que se le prometieron al cliente
create or replace function public.cambiar_estado_pedido(
  p_pedido bigint, p_estado text, p_comentario text default null, p_pagos jsonb default '[]'
) returns bigint language plpgsql security definer set search_path = public as $$
declare v_ped pedidos; it record; v_venta bigint;
begin
  if not tiene_permiso('pedidos.gestionar') then raise exception 'Solo el equipo puede cambiar el estado de un pedido'; end if;
  select * into v_ped from pedidos where id = p_pedido for update;
  if not found then raise exception 'El pedido no existe'; end if;
  if v_ped.estado in ('entregado','cancelado') then raise exception 'El pedido ya está %', v_ped.estado; end if;

  if p_estado in ('cancelado', 'entregado') then
    for it in select * from pedido_items where pedido_id = p_pedido loop
      update stock set reservado = reservado - it.cantidad where variante_id = it.variante_id and deposito_id = v_ped.deposito_id;
    end loop;
  end if;
  if p_estado = 'entregado' then
    v_venta := _registrar_venta(
      (select jsonb_agg(jsonb_build_object('variante_id', pi.variante_id, 'cantidad', pi.cantidad, 'precio_unitario', pi.precio_unitario,
                                           'descuento_promo', pi.descuento_promo, 'promocion_id', pi.promocion_id,
                                           'acumula', coalesce(pr.acumula_medio_pago, true)))
         from pedido_items pi left join promociones pr on pr.id = pi.promocion_id where pi.pedido_id = p_pedido),
      case when jsonb_array_length(coalesce(p_pagos, '[]')) = 0
           then jsonb_build_array(jsonb_build_object('medio_pago_id', v_ped.medio_pago_id, 'ajuste_pct', v_ped.ajuste_pct))
           else p_pagos end,
      v_ped.cliente_id, 0, v_ped.canal, v_ped.deposito_id, 'Pedido ' || v_ped.comprobante);
    update ventas set pedido_id = p_pedido where id = v_venta;
  end if;

  update pedidos set estado = p_estado where id = p_pedido;
  insert into pedido_estados (pedido_id, estado, comentario) values (p_pedido, p_estado, p_comentario);
  return v_venta;
end $$;

-- ── Vistas de ventas con la promoción ─────────────────────────────────
drop view public.v_venta_items;
create view public.v_venta_items with (security_invoker = false) as
select vi.id, vi.venta_id, vi.variante_id, vi.cantidad, vi.precio_unitario, vi.descuento_promo, vi.promocion_id, pr.nombre as promocion,
       case when tiene_permiso('costos.ver') then vi.costo_unitario end as costo_unitario,
       ve.fecha, ve.canal, ve.cliente_id, p.id as producto_id, p.nombre, m.nombre as marca,
       t.nombre as talle, co.nombre as color,
       vi.cantidad * vi.precio_unitario - vi.descuento_promo as subtotal,
       case when tiene_permiso('costos.ver') then vi.cantidad * (vi.precio_unitario - vi.costo_unitario) - vi.descuento_promo end as margen
from venta_items vi
join ventas ve on ve.id = vi.venta_id
join variantes v on v.id = vi.variante_id
join productos p on p.id = v.producto_id
join talles t on t.id = v.talle_id
join colores co on co.id = v.color_id
left join marcas m on m.id = p.marca_id
left join promociones pr on pr.id = vi.promocion_id
where es_staff() and puede_ver_venta(ve.usuario_id);

drop view public.v_hechos_ventas;
create view public.v_hechos_ventas with (security_invoker = false) as
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
       -- Neto: lo del renglón ya sin la promo, y el descuento manual y el % del medio repartidos por importe
       round((vi.cantidad * vi.precio_unitario - vi.descuento_promo) * ve.total / nullif(ve.subtotal - ve.descuento_promociones, 0), 2) as importe_neto,
       case when tiene_permiso('costos.ver') then
         round((vi.cantidad * vi.precio_unitario - vi.descuento_promo) * ve.total / nullif(ve.subtotal - ve.descuento_promociones, 0)
               - vi.cantidad * vi.costo_unitario, 2) end as margen_neto,
       ve.pedido_id is not null as vino_de_pedido
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
where tiene_permiso('informes.ventas') or tiene_permiso('ventas.ver_todas');

grant select on public.v_venta_items, public.v_hechos_ventas to authenticated;
revoke select on public.v_venta_items, public.v_hechos_ventas from anon;

-- ── Permisos de ejecución ─────────────────────────────────────────────
revoke execute on function public._cotizar, public._en_promocion, public._promociones_vigentes, public._renglones_cotizados,
  public._registrar_venta from public, anon, authenticated;
revoke execute on function public.cotizar, public.etiqueta_promocion from public;
grant execute on function public.cotizar, public.etiqueta_promocion to anon, authenticated;
-- La vista pública de etiquetas llama a estas dos (las funciones de una vista se ejecutan con los
-- permisos de quien la consulta): son de solo lectura y no exponen costos
grant execute on function public._en_promocion, public._promociones_vigentes to anon, authenticated;

-- El cliente ve el nombre de las promociones de SUS pedidos (pedido_items ya filtra los suyos)
create policy "promos de sus pedidos" on public.promociones for select to authenticated
  using (id in (select promocion_id from pedido_items where promocion_id is not null));
