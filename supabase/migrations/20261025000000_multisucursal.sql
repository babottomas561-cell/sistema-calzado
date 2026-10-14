-- ============================================================================
-- Migración: Soporte Multisucursal y Gestión de Depósitos
-- ============================================================================

-- ── 1. Parámetro en configuracion_tienda (apagado de fábrica) ────────────────
alter table public.configuracion_tienda
  add column if not exists multisucursal_activa boolean not null default false;

-- ── 2. Tabla sucursales ────────────────────────────────────────────────────
create table if not exists public.sucursales (
  id bigint generated always as identity primary key,
  codigo text not null unique check (codigo ~ '^[A-Z0-9_\-]+$'),
  nombre text not null,
  direccion text,
  telefono text,
  deposito_id bigint references public.depositos (id) on delete set null,
  es_casa_central boolean not null default false,
  activa boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

-- Semilla: Casa Central
insert into public.sucursales (codigo, nombre, es_casa_central, deposito_id)
values (
  'CASA_CENTRAL',
  'Casa Central',
  true,
  (select id from public.depositos where activo order by id limit 1)
)
on conflict (codigo) do nothing;

-- ── 3. Tabla puntos_venta (cajas/puntos de venta por sucursal) ─────────────
create table if not exists public.puntos_venta (
  id bigint generated always as identity primary key,
  sucursal_id bigint not null references public.sucursales (id) on delete cascade,
  numero int not null check (numero between 1 and 9999),
  nombre text not null,
  tipo text not null default 'mostrador' check (tipo in ('mostrador', 'web', 'fiscal')),
  activo boolean not null default true,
  unique (sucursal_id, numero)
);

create index if not exists puntos_venta_sucursal_idx on public.puntos_venta (sucursal_id);

-- Semilla: Punto de Venta 1 en Casa Central
insert into public.puntos_venta (sucursal_id, numero, nombre, tipo)
select id, 1, 'Caja 1', 'mostrador'
from public.sucursales
where codigo = 'CASA_CENTRAL'
on conflict (sucursal_id, numero) do nothing;

-- ── 4. Relación en perfiles, depositos y ventas ────────────────────────────
alter table public.perfiles
  add column if not exists sucursal_id bigint references public.sucursales (id) on delete set null,
  add column if not exists punto_venta_id bigint references public.puntos_venta (id) on delete set null;
create index if not exists perfiles_sucursal_id_idx on public.perfiles (sucursal_id);

alter table public.depositos
  add column if not exists sucursal_id bigint references public.sucursales (id) on delete set null;
create index if not exists depositos_sucursal_id_idx on public.depositos (sucursal_id);

-- Asociar el depósito inicial a Casa Central
update public.depositos
   set sucursal_id = (select id from public.sucursales where es_casa_central limit 1)
 where sucursal_id is null;

alter table public.ventas
  add column if not exists sucursal_id bigint references public.sucursales (id) on delete restrict;
create index if not exists ventas_sucursal_id_idx on public.ventas (sucursal_id);

-- ── 5. Seguridad con RLS ──────────────────────────────────────────────────
alter table public.sucursales enable row level security;
alter table public.puntos_venta enable row level security;

drop policy if exists "sucursales_select" on public.sucursales;
create policy "sucursales_select" on public.sucursales for select
  using (es_staff() or activa);

drop policy if exists "sucursales_modificar" on public.sucursales;
create policy "sucursales_modificar" on public.sucursales for all
  using (tiene_permiso('tablas.editar') or tiene_permiso('equipo.administrar'))
  with check (tiene_permiso('tablas.editar') or tiene_permiso('equipo.administrar'));

drop policy if exists "puntos_venta_select" on public.puntos_venta;
create policy "puntos_venta_select" on public.puntos_venta for select
  using (es_staff() or activo);

drop policy if exists "puntos_venta_modificar" on public.puntos_venta;
create policy "puntos_venta_modificar" on public.puntos_venta for all
  using (tiene_permiso('tablas.editar') or tiene_permiso('equipo.administrar'))
  with check (tiene_permiso('tablas.editar') or tiene_permiso('equipo.administrar'));

grant select on public.sucursales to anon, authenticated;
grant select on public.puntos_venta to anon, authenticated;

-- ── 6. Función para transferir stock entre depósitos ───────────────────────
create or replace function public.transferir_stock(
  p_variante bigint,
  p_origen bigint,
  p_destino bigint,
  p_cantidad int,
  p_motivo text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_disp int;
  v_dep_origen text;
  v_dep_destino text;
begin
  if not (tiene_permiso('stock.ajustar') or tiene_permiso('stock.ver')) then
    raise exception 'No tenés permiso para transferir stock';
  end if;
  if p_origen = p_destino then
    raise exception 'El depósito de origen y de destino no pueden ser el mismo';
  end if;
  if p_cantidad <= 0 then
    raise exception 'La cantidad a transferir debe ser mayor a cero';
  end if;

  select nombre into v_dep_origen from public.depositos where id = p_origen;
  select nombre into v_dep_destino from public.depositos where id = p_destino;

  select cantidad - reservado into v_disp
    from public.stock
   where variante_id = p_variante and deposito_id = p_origen for update;

  if coalesce(v_disp, 0) < p_cantidad then
    raise exception 'No hay stock disponible suficiente en % (quedan %)', v_dep_origen, coalesce(v_disp, 0);
  end if;

  -- Descuenta de origen
  perform _mover_stock(
    p_variante,
    p_origen,
    -p_cantidad,
    'transferencia_salida',
    null,
    null,
    coalesce(nullif(trim(p_motivo), ''), 'Transferencia hacia ' || v_dep_destino)
  );

  -- Suma en destino
  perform _mover_stock(
    p_variante,
    p_destino,
    p_cantidad,
    'transferencia_entrada',
    null,
    null,
    coalesce(nullif(trim(p_motivo), ''), 'Transferencia desde ' || v_dep_origen)
  );
end $$;

-- ── 7. Función para alternar el parámetro multisucursal_activa ─────────────
create or replace function public.alternar_multisucursal(p_activa boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (tiene_permiso('tablas.editar') or tiene_permiso('equipo.administrar')) then
    raise exception 'No tenés permiso para cambiar la configuración de sucursales';
  end if;
  update public.configuracion_tienda set multisucursal_activa = p_activa where unica = true;
end $$;

-- ── 8. Registrar venta asociando sucursal y depósito ────────────────────────
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
  v_dep bigint;
  v_sucursal_id bigint;
  v_disp int;
  v_activa_cc boolean := (select cuenta_corriente_clientes from configuracion_tienda limit 1);
begin
  if jsonb_array_length(p_items) = 0 then raise exception 'La venta no tiene productos'; end if;

  -- Resolver depósito y sucursal según usuario o depósito elegido
  select pe.sucursal_id, s.deposito_id
    into v_sucursal_id, v_dep
    from perfiles pe
    left join sucursales s on s.id = pe.sucursal_id
   where pe.id = auth.uid();

  if p_deposito is not null then
    v_dep := p_deposito;
    select sucursal_id into v_sucursal_id from depositos where id = v_dep;
  elsif v_dep is null then
    v_dep := deposito_principal();
    select sucursal_id into v_sucursal_id from depositos where id = v_dep;
  end if;

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
                      total, canal, deposito_id, notas, lista_precio_id, sucursal_id)
  values (p_cliente, v_sub, p_descuento, v_promos, v_ajustes,
          v_sub - p_descuento - v_promos + v_ajustes, p_canal, v_dep, p_notas, p_lista_precio, v_sucursal_id)
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

-- ── 9. Actualizar RPC equipo con sucursal y punto de venta ───────────────────
drop function if exists public.equipo();
create or replace function public.equipo() returns table (
  usuario_id uuid,
  nombre text,
  email text,
  rol_id bigint,
  rol text,
  desde timestamptz,
  sucursal_id bigint,
  sucursal text,
  punto_venta_id bigint,
  punto_venta text
)
language sql stable security definer set search_path = public as $$
  select pe.id,
         pe.nombre,
         u.email::text,
         r.id,
         r.nombre,
         u.created_at,
         pe.sucursal_id,
         s.nombre as sucursal,
         pe.punto_venta_id,
         pv.nombre as punto_venta
    from perfiles pe
    join auth.users u on u.id = pe.id
    join roles r on r.id = pe.rol_id
    left join sucursales s on s.id = pe.sucursal_id
    left join puntos_venta pv on pv.id = pe.punto_venta_id
   where pe.rol = 'staff' and tiene_permiso('equipo.administrar')
   order by r.todos desc, pe.nombre;
$$;

-- ── 10. Asignación de sucursal y caja a miembros del equipo ──────────────────
create or replace function public.asignar_sucursal_usuario(
  p_usuario_id uuid,
  p_sucursal_id bigint default null,
  p_punto_venta_id bigint default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not (tiene_permiso('equipo.administrar') or es_staff()) then
    raise exception 'No tenés permiso para asignar sucursales';
  end if;

  if p_punto_venta_id is not null and p_sucursal_id is not null then
    if not exists (select 1 from public.puntos_venta where id = p_punto_venta_id and sucursal_id = p_sucursal_id) then
      raise exception 'El punto de venta no pertenece a la sucursal indicada';
    end if;
  end if;

  update public.perfiles
     set sucursal_id = p_sucursal_id,
         punto_venta_id = p_punto_venta_id
   where id = p_usuario_id;
end $$;
