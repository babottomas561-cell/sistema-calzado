-- ============================================================================
-- Migración: Listas de precios (Local y Tienda Web)
-- ============================================================================

-- ── 1. Parámetro en configuracion_tienda (apagado de fábrica) ────────────────
alter table public.configuracion_tienda
  add column if not exists listas_precios_activas boolean not null default false;

-- ── 2. Tabla listas_precios ────────────────────────────────────────────────
create table if not exists public.listas_precios (
  id bigint generated always as identity primary key,
  codigo text not null unique check (codigo ~ '^[A-Z0-9_\-]+$'),
  nombre text not null,
  canal text not null default 'ambos' check (canal in ('mostrador', 'tienda', 'ambos')),
  ajuste_pct numeric(5,2) not null default 0,
  redondeo text not null default 'sin_redondeo' check (redondeo in ('sin_redondeo', '10', '50', '100', '1000', '999')),
  activa boolean not null default true,
  es_default_local boolean not null default false,
  es_default_web boolean not null default false,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

-- Semillas iniciales: Local y Tienda Web
insert into public.listas_precios (codigo, nombre, canal, ajuste_pct, redondeo, activa, es_default_local, es_default_web)
values
  ('LOCAL', 'Local', 'mostrador', 0, 'sin_redondeo', true, true, false),
  ('WEB', 'Tienda Web', 'tienda', 0, 'sin_redondeo', true, false, true)
on conflict (codigo) do nothing;

-- ── 3. Tabla lista_precio_items (precios específicos por producto) ─────────
create table if not exists public.lista_precio_items (
  id bigint generated always as identity primary key,
  lista_id bigint not null references public.listas_precios (id) on delete cascade,
  producto_id bigint not null references public.productos (id) on delete cascade,
  precio numeric(12,2) not null check (precio >= 0),
  unique (lista_id, producto_id)
);

create index if not exists lista_precio_items_lista_idx on public.lista_precio_items (lista_id);
create index if not exists lista_precio_items_producto_idx on public.lista_precio_items (producto_id);

-- ── 4. Relación en ventas y pedidos ───────────────────────────────────────
alter table public.ventas
  add column if not exists lista_precio_id bigint references public.listas_precios (id) on delete restrict;
create index if not exists ventas_lista_precio_id_idx on public.ventas (lista_precio_id);

alter table public.pedidos
  add column if not exists lista_precio_id bigint references public.listas_precios (id) on delete restrict;
create index if not exists pedidos_lista_precio_id_idx on public.pedidos (lista_precio_id);

-- ── 5. Seguridad con RLS ──────────────────────────────────────────────────
alter table public.listas_precios enable row level security;
alter table public.lista_precio_items enable row level security;

drop policy if exists "listas_precios_select" on public.listas_precios;
create policy "listas_precios_select" on public.listas_precios for select
  using (es_staff() or (activa and es_default_web));

drop policy if exists "listas_precios_modificar" on public.listas_precios;
create policy "listas_precios_modificar" on public.listas_precios for all
  using (tiene_permiso('precios.editar'))
  with check (tiene_permiso('precios.editar'));

drop policy if exists "lista_precio_items_select" on public.lista_precio_items;
create policy "lista_precio_items_select" on public.lista_precio_items for select
  using (es_staff() or exists (
    select 1 from public.listas_precios lp where lp.id = lista_precio_items.lista_id and lp.activa and lp.es_default_web
  ));

drop policy if exists "lista_precio_items_modificar" on public.lista_precio_items;
create policy "lista_precio_items_modificar" on public.lista_precio_items for all
  using (tiene_permiso('precios.editar'))
  with check (tiene_permiso('precios.editar'));

grant select on public.listas_precios to anon, authenticated;
grant select on public.lista_precio_items to anon, authenticated;

-- ── 6. Función auxiliar para redondear ────────────────────────────────────
create or replace function public._redondear_precio(p_monto numeric, p_redondeo text)
returns numeric language sql immutable set search_path = public as $$
  select case
    when p_redondeo = '10' then round(p_monto, -1)
    when p_redondeo = '50' then round(p_monto / 50.0) * 50
    when p_redondeo = '100' then round(p_monto, -2)
    when p_redondeo = '1000' then round(p_monto, -3)
    when p_redondeo = '999' then
      case when p_monto < 1000 then round(p_monto, -1)
           else floor(p_monto / 1000.0) * 1000 + 999
      end
    else round(p_monto, 2)
  end;
$$;

-- ── 7. Función precio_de con soporte para listas de precios ───────────────
create or replace function public.precio_de(p_variante bigint, p_lista bigint default null)
returns numeric language plpgsql stable set search_path = public as $$
declare
  v_usa_listas boolean;
  v_lista bigint := p_lista;
  v_prod_id bigint;
  v_base numeric;
  v_precio_item numeric;
  v_ajuste numeric;
  v_redondeo text;
begin
  select coalesce(listas_precios_activas, false) into v_usa_listas from configuracion_tienda limit 1;

  -- Si las listas están apagadas y no se pidió una lista explícita, se usa el precio base tradicional
  if not coalesce(v_usa_listas, false) and v_lista is null then
    select coalesce(v.precio_venta, p.precio_venta) into v_base
      from variantes v join productos p on p.id = v.producto_id
     where v.id = p_variante;
    return v_base;
  end if;

  -- Si están activas y no se especificó lista, tomar la lista default local
  if v_lista is null then
    select id into v_lista from listas_precios where es_default_local and activa limit 1;
    if v_lista is null then
      select coalesce(v.precio_venta, p.precio_venta) into v_base
        from variantes v join productos p on p.id = v.producto_id
       where v.id = p_variante;
      return v_base;
    end if;
  end if;

  select v.producto_id, coalesce(v.precio_venta, p.precio_venta)
    into v_prod_id, v_base
    from variantes v join productos p on p.id = v.producto_id
   where v.id = p_variante;

  if v_base is null then return null; end if;

  -- 1) Buscar si hay un precio fijo asignado en la lista para este producto
  select lpi.precio into v_precio_item
    from lista_precio_items lpi
   where lpi.lista_id = v_lista and lpi.producto_id = v_prod_id;

  if v_precio_item is not null then
    return v_precio_item;
  end if;

  -- 2) Si no, aplicar ajuste porcentual y redondeo de la lista
  select ajuste_pct, redondeo into v_ajuste, v_redondeo
    from listas_precios where id = v_lista;

  if not found then return v_base; end if;

  return _redondear_precio(v_base * (1.0 + coalesce(v_ajuste, 0) / 100.0), coalesce(v_redondeo, 'sin_redondeo'));
end $$;

-- ── 8. Actualización de v_catalogo para reflejar la lista WEB si está activa ─
create or replace view public.v_catalogo as
select v.id as variante_id, p.id as producto_id, p.nombre, m.nombre as marca, c.nombre as categoria,
       p.genero, p.escala, p.descripcion, p.imagen_url, t.nombre as talle, t.orden as talle_orden, co.nombre as color, co.hex as color_hex,
       case
         when (select coalesce(listas_precios_activas, false) from configuracion_tienda limit 1) then
           coalesce(
             (select lpi.precio from lista_precio_items lpi
                join listas_precios lp on lp.id = lpi.lista_id
               where lp.es_default_web and lp.activa and lpi.producto_id = p.id limit 1),
             _redondear_precio(
               coalesce(v.precio_venta, p.precio_venta) * (1.0 + coalesce((select lp.ajuste_pct from listas_precios lp where lp.es_default_web and lp.activa limit 1), 0) / 100.0),
               coalesce((select lp.redondeo from listas_precios lp where lp.es_default_web and lp.activa limit 1), 'sin_redondeo')
             )
           )
         else coalesce(v.precio_venta, p.precio_venta)
       end as precio,
       greatest(coalesce(sum(s.cantidad - s.reservado), 0), 0)::int as disponible,
       p.temporada, p.material, c.linea, p.creado_en
from variantes v
join productos p on p.id = v.producto_id
join talles t on t.id = v.talle_id
join colores co on co.id = v.color_id
left join marcas m on m.id = p.marca_id
left join categorias c on c.id = p.categoria_id
left join stock s on s.variante_id = v.id and s.deposito_id in (select id from depositos where vendible)
where p.publicado_web and p.activo
group by v.id, p.id, m.nombre, c.nombre, c.linea, t.nombre, t.orden, co.nombre, co.hex;

grant select on public.v_catalogo to anon, authenticated;

-- ── 9. Actualización de cotizar con soporte de lista de precios ─────────────
create or replace function public.cotizar(
  p_items jsonb,
  p_medio_pago bigint default null,
  p_canal text default 'tienda',
  p_lista bigint default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_items jsonb;
  v_pct numeric := 0;
  v_res jsonb;
  v_sub numeric;
  v_promo numeric;
  v_acum numeric;
  v_aj numeric;
  v_lista_id bigint := p_lista;
  v_usa_listas boolean;
begin
  if p_canal not in ('tienda', 'mostrador') then raise exception 'Canal inválido'; end if;
  if p_canal = 'mostrador' and not tiene_permiso('ventas.registrar') then raise exception 'No tenés permiso para vender'; end if;

  select coalesce(listas_precios_activas, false) into v_usa_listas from configuracion_tienda limit 1;

  if v_usa_listas and v_lista_id is null then
    if p_canal = 'tienda' then
      select id into v_lista_id from listas_precios where es_default_web and activa limit 1;
    else
      select id into v_lista_id from listas_precios where es_default_local and activa limit 1;
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('variante_id', v.id, 'cantidad', (i->>'cantidad')::int,
           'precio_unitario', case when p_canal = 'mostrador' and tiene_permiso('ventas.cambiar_precio') and i ? 'precio_unitario'
                                   then (i->>'precio_unitario')::numeric
                                   else precio_de(v.id, v_lista_id) end)), '[]')
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
    'sugerencias', coalesce((
      select jsonb_agg(jsonb_build_object('promocion', pr.nombre, 'etiqueta', etiqueta_promocion(pr.tipo, pr.lleva, pr.paga, pr.descuento_pct),
                                          'faltan', s.lleva - s.sueltos % s.lleva))
        from (select p.id, case when p.tipo = 'nxm' then p.lleva else 2 end as lleva,
                     (select count(*) from _unidades u where u.promocion_id is null and _en_promocion(p.id, u.producto_id))::int as sueltos
                from _promociones_vigentes(p_canal) p where p.tipo in ('nxm', 'segunda_unidad')) s
        join promociones pr on pr.id = s.id
       where s.sueltos % s.lleva > 0), '[]'));
end $$;

-- ── 10. Actualización de crear_pedido para usar lista WEB ──────────────────
create or replace function public.crear_pedido(
  p_items jsonb, p_entrega text default 'retiro', p_direccion text default null,
  p_medio_pago bigint default null, p_notas text default null,
  p_cliente bigint default null, p_canal text default 'Web',
  p_zona bigint default null
) returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_cliente bigint;
  v_id bigint;
  it jsonb;
  v_dep bigint := deposito_principal();
  v_disp int;
  v_medio medios_pago;
  v_items jsonb;
  v_renglones jsonb;
  v_sub numeric;
  v_promos numeric;
  v_acum numeric;
  v_factor numeric;
  v_costo_envio numeric := 0;
  v_lista_web bigint := null;
  v_usa_listas boolean;
begin
  if auth.uid() is null then raise exception 'Tenés que ingresar para hacer un pedido'; end if;
  if es_staff() and p_cliente is not null then v_cliente := p_cliente;
  else
    select id into v_cliente from clientes where usuario_id = auth.uid();
    if v_cliente is null then raise exception 'Tu usuario no tiene ficha de cliente'; end if;
  end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'El pedido está vacío'; end if;
  if p_entrega = 'envio' and coalesce(trim(p_direccion), '') = '' then raise exception 'Falta la dirección de envío'; end if;
  select * into v_medio from medios_pago where id = p_medio_pago and activo and (en_tienda or es_staff());
  if not found then raise exception 'Elegí un medio de pago válido'; end if;

  select coalesce(listas_precios_activas, false) into v_usa_listas from configuracion_tienda limit 1;
  if v_usa_listas then
    select id into v_lista_web from listas_precios where es_default_web and activa limit 1;
  end if;

  -- Precios de la lista web (o base si están apagadas)
  select coalesce(jsonb_agg(jsonb_build_object('variante_id', (i->>'variante_id')::bigint,
                                               'cantidad', (i->>'cantidad')::int,
                                               'precio_unitario', precio_de((i->>'variante_id')::bigint, v_lista_web))), '[]')
    into v_items
    from jsonb_array_elements(p_items) i
    join variantes v on v.id = (i->>'variante_id')::bigint
    join productos p on p.id = v.producto_id
   where (i->>'cantidad')::int > 0 and p.activo and (p.publicado_web or es_staff());

  if jsonb_array_length(v_items) <> jsonb_array_length(p_items) then
    raise exception 'Uno de los productos ya no está disponible';
  end if;

  -- Promociones vigentes en la tienda
  v_renglones := _renglones_cotizados(v_items, 'tienda');

  select coalesce(sum((r->>'cantidad')::int * (r->>'precio_unitario')::numeric), 0),
         coalesce(sum((r->>'descuento_promo')::numeric), 0),
         coalesce(sum(case when (r->>'acumula')::boolean
                           then (r->>'cantidad')::int * (r->>'precio_unitario')::numeric - (r->>'descuento_promo')::numeric else 0 end), 0)
    into v_sub, v_promos, v_acum from jsonb_array_elements(v_renglones) r;
  v_factor := case when v_sub - v_promos > 0 then v_acum / (v_sub - v_promos) else 1 end;

  if p_entrega = 'envio' and p_zona is not null then
    select precio into v_costo_envio from zonas_envio where id = p_zona and activa;
    if not found then raise exception 'Zona de envío inválida'; end if;
  end if;

  insert into pedidos (cliente_id, canal, entrega, direccion_envio, medio_pago_id, ajuste_pct, deposito_id, notas,
                       zona_envio_id, costo_envio, lista_precio_id)
  values (v_cliente, case when es_staff() then p_canal else 'Web' end, p_entrega, p_direccion,
          v_medio.id, v_medio.ajuste_pct, v_dep, p_notas, p_zona, v_costo_envio, v_lista_web)
  returning id into v_id;

  for it in select * from jsonb_array_elements(v_renglones) loop
    select cantidad - reservado into v_disp from stock
     where variante_id = (it->>'variante_id')::bigint and deposito_id = v_dep for update;
    if coalesce(v_disp, 0) < (it->>'cantidad')::int then
      raise exception 'No hay stock suficiente de uno de los productos (quedan %)', coalesce(v_disp, 0);
    end if;
    update stock set reservado = reservado + (it->>'cantidad')::int
     where variante_id = (it->>'variante_id')::bigint and deposito_id = v_dep;

    insert into pedido_items (pedido_id, variante_id, cantidad, precio_unitario, descuento_promo, promocion_id)
    values (v_id, (it->>'variante_id')::bigint, (it->>'cantidad')::int, (it->>'precio_unitario')::numeric,
            (it->>'descuento_promo')::numeric, (it->>'promocion_id')::bigint);
  end loop;

  update pedidos set
    subtotal = v_sub,
    descuento_promociones = v_promos,
    ajuste_medio_pago = round(v_acum * v_medio.ajuste_pct / 100, 2),
    total = v_sub - v_promos + round(v_acum * v_medio.ajuste_pct / 100, 2) + v_costo_envio
  where id = v_id;

  insert into pedido_estados (pedido_id, estado, comentario) values (v_id, 'pendiente', 'Pedido recibido');
  return v_id;
end $$;

-- ── 11. Actualización de _registrar_venta y registrar_venta ────────────────
create or replace function public._registrar_venta(
  p_items jsonb, p_pagos jsonb, p_cliente bigint, p_descuento numeric,
  p_canal text, p_deposito bigint, p_notas text, p_lista_precio bigint default null
) returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
  it jsonb;
  v_sub numeric;
  v_promos numeric;
  v_acum numeric;
  v_factor numeric;
  v_resto numeric;
  v_base numeric;
  v_pct numeric;
  v_aj numeric;
  v_red numeric;
  v_ajustes numeric := 0;
  v_pagos jsonb := '[]';
  v_medio medios_pago;
  v_dep bigint := coalesce(p_deposito, deposito_principal());
  v_disp int;
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

    v_red := round(coalesce((it->>'redondeo')::numeric, 0), 2);
    if v_red < 0 then raise exception 'El redondeo no puede ser negativo'; end if;
    if v_red > 0 then
      if v_medio.tipo is distinct from 'Efectivo' then raise exception 'Solo se puede redondear lo que se paga en efectivo'; end if;
      if v_red > least(1000, round((v_base + v_aj) * 0.05, 2)) then
        raise exception 'El redondeo es demasiado grande: hasta el 5 %% de lo que se cobra en efectivo y nunca más de $ 1.000';
      end if;
    end if;

    v_ajustes := v_ajustes + v_aj - v_red;
    v_pagos := v_pagos || jsonb_build_object(
      'medio_pago_id', v_medio.id, 'base', v_base, 'ajuste_pct', v_pct,
      'ajuste', v_aj, 'redondeo', v_red, 'cuotas', coalesce((it->>'cuotas')::int, v_medio.cuotas),
      'referencia', it->>'referencia'
    );
    v_resto := v_resto - v_base;
  end loop;

  if v_resto > 0.01 then raise exception 'Falta cubrir $ %', trim(to_char(v_resto, 'FM999G999G990D00')); end if;

  for it in select * from jsonb_array_elements(p_items) loop
    select cantidad - reservado into v_disp from stock
     where variante_id = (it->>'variante_id')::bigint and deposito_id = v_dep for update;
    if coalesce(v_disp, 0) < (it->>'cantidad')::int then
      raise exception 'No hay stock suficiente de uno de los productos (quedan %)', coalesce(v_disp, 0);
    end if;
  end loop;

  insert into ventas (cliente_id, subtotal, descuento, descuento_promociones, ajuste_medio_pago,
                      total, canal, deposito_id, notas, lista_precio_id)
  values (p_cliente, v_sub, p_descuento, v_promos, v_ajustes,
          v_sub - p_descuento - v_promos + v_ajustes, p_canal, v_dep, p_notas, p_lista_precio)
  returning id into v_id;

  for it in select * from jsonb_array_elements(p_items) loop
    insert into venta_items (venta_id, variante_id, cantidad, precio_unitario, descuento_promo, promocion_id)
    values (v_id, (it->>'variante_id')::bigint, (it->>'cantidad')::int, (it->>'precio_unitario')::numeric,
            coalesce((it->>'descuento_promo')::numeric, 0), (it->>'promocion_id')::bigint);
    perform _mover_stock((it->>'variante_id')::bigint, v_dep, -(it->>'cantidad')::int, 'venta', v_id);
  end loop;

  insert into pagos (venta_id, medio_pago_id, base, ajuste_pct, ajuste, redondeo, cuotas, referencia)
  select v_id, (x->>'medio_pago_id')::bigint, (x->>'base')::numeric, (x->>'ajuste_pct')::numeric,
         (x->>'ajuste')::numeric, (x->>'redondeo')::numeric, (x->>'cuotas')::int, x->>'referencia'
    from jsonb_array_elements(v_pagos) x;

  for it in select * from jsonb_array_elements(v_pagos) loop
    select * into v_medio from medios_pago where id = (it->>'medio_pago_id')::bigint;
    if v_medio.es_cuenta_corriente then
      insert into cuentas_corrientes_cliente (cliente_id, tipo, venta_id, debe, haber, detalle)
      values (p_cliente, 'venta', v_id, (it->>'base')::numeric, 0, 'Venta ' || (select comprobante from ventas where id = v_id));
    end if;
  end loop;

  return v_id;
end $$;

-- Wrapper con 8 parámetros (p_lista_precio opcional)
create or replace function public.registrar_venta(
  p_items jsonb, p_pagos jsonb default '[]', p_cliente bigint default null,
  p_descuento numeric default 0, p_canal text default 'Local',
  p_deposito bigint default null, p_notas text default null,
  p_lista_precio bigint default null
) returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_items jsonb;
  v_neto numeric;
  v_tope numeric;
  v_lista_id bigint := p_lista_precio;
  v_usa_listas boolean;
begin
  if not tiene_permiso('ventas.registrar') then raise exception 'No tenés permiso para registrar ventas'; end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'La venta no tiene productos'; end if;
  if exists (select 1 from jsonb_array_elements(p_items) i where coalesce((i->>'cantidad')::int, 0) <= 0) then
    raise exception 'Cantidad inválida';
  end if;

  select coalesce(listas_precios_activas, false) into v_usa_listas from configuracion_tienda limit 1;
  if v_usa_listas and v_lista_id is null then
    select id into v_lista_id from listas_precios where es_default_local and activa limit 1;
  end if;

  select coalesce(jsonb_agg(i || jsonb_build_object('precio_unitario',
           case when tiene_permiso('ventas.cambiar_precio') and i ? 'precio_unitario' then (i->>'precio_unitario')::numeric
                else precio_de((i->>'variante_id')::bigint, v_lista_id) end)), '[]') into v_items
    from jsonb_array_elements(p_items) i;

  v_items := _renglones_cotizados(v_items, 'mostrador');

  select r.descuento_max_pct into v_tope from perfiles pe join roles r on r.id = pe.rol_id where pe.id = auth.uid() and not r.todos;
  select coalesce(sum((i->>'cantidad')::int * (i->>'precio_unitario')::numeric - (i->>'descuento_promo')::numeric), 0) into v_neto
    from jsonb_array_elements(v_items) i;
  if v_tope is not null and coalesce(p_descuento, 0) > round(v_neto * v_tope / 100, 2) then
    raise exception 'Tu descuento máximo es del % %%: para más, pedíselo a un encargado', trim(to_char(v_tope, 'FM990D##'));
  end if;

  return _registrar_venta(v_items, p_pagos, p_cliente, coalesce(p_descuento, 0), p_canal, p_deposito, p_notas, v_lista_id);
end $$;

-- ── 12. Función para alternar el parámetro listas_precios_activas ───────────
create or replace function public.alternar_listas_precios(p_activa boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (tiene_permiso('precios.editar') or es_staff()) then
    raise exception 'No tenés permiso para cambiar la configuración de precios';
  end if;
  update public.configuracion_tienda set listas_precios_activas = p_activa where unica = true;
end $$;
