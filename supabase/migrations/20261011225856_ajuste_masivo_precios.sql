-- Ajuste masivo de precios: subir o bajar de una vez el precio de venta o el de compra de muchos
-- artículos (por proveedor, marca, rubro o elegidos a mano), con vista previa, historial y deshacer.
--
-- Precio de VENTA: productos.precio_venta. Modos: +%, +$, precio fijo, o "costo + X %" (margen).
-- Precio de COMPRA:
--   · de un proveedor → su precio de lista en producto_proveedores (respeta su bonificación); si es el
--     proveedor principal del artículo, también el precio de compra de referencia (productos.precio_compra);
--   · sin proveedor → directamente productos.precio_compra.
-- Todo pasa por ajustar_precios() (security definer + permiso), que deja el antes y el después.

create table public.ajustes_precios (
  id            bigint generated always as identity primary key,
  fecha         timestamptz not null default now(),
  usuario_id    uuid default auth.uid() references public.perfiles (id) on delete set null,
  que           text not null check (que in ('venta','compra')),
  proveedor_id  bigint references public.proveedores (id) on delete restrict,
  modo          text not null check (modo in ('porcentaje','monto','fijo','margen')),
  valor         numeric(12,2) not null,
  redondeo      text not null default 'ninguno' check (redondeo in ('ninguno','10','100','1000','999')),
  descripcion   text,                         -- a qué se aplicó, para el historial ("Marca Nike")
  cantidad      int not null default 0,
  deshecho_en   timestamptz,
  deshecho_por  uuid references public.perfiles (id) on delete set null
);
create index ajustes_precios_usuario_id_idx on public.ajustes_precios (usuario_id);
create index ajustes_precios_proveedor_id_idx on public.ajustes_precios (proveedor_id);
create index ajustes_precios_deshecho_por_idx on public.ajustes_precios (deshecho_por);
create index ajustes_precios_fecha_idx on public.ajustes_precios (fecha desc);

-- Un renglón por artículo tocado: es parte del ajuste (cascade); el artículo tiene historia (restrict)
create table public.ajuste_precio_items (
  id               bigint generated always as identity primary key,
  ajuste_id        bigint not null references public.ajustes_precios (id) on delete cascade,
  producto_id      bigint not null references public.productos (id) on delete restrict,
  precio_anterior  numeric(12,2) not null,
  precio_nuevo     numeric(12,2) not null
);
create index ajuste_precio_items_ajuste_id_idx on public.ajuste_precio_items (ajuste_id);
create index ajuste_precio_items_producto_id_idx on public.ajuste_precio_items (producto_id);

-- Seguridad: el historial de compra tiene costos; el de venta lo ve quien cambia precios. Solo lectura.
alter table public.ajustes_precios enable row level security;
alter table public.ajuste_precio_items enable row level security;
create policy "ve ajustes" on public.ajustes_precios for select to authenticated
  using (tiene_permiso('costos.ver') or (que = 'venta' and tiene_permiso('precios.editar')));
create policy "ve ajustes" on public.ajuste_precio_items for select to authenticated
  using (ajuste_id in (select id from ajustes_precios));

-- El cálculo de un precio nuevo (lo usan la vista previa y el ajuste: siempre da lo mismo)
create or replace function public.precio_ajustado(p_actual numeric, p_costo numeric, p_modo text, p_valor numeric, p_redondeo text)
returns numeric language plpgsql immutable set search_path = public as $$
declare v numeric;
begin
  v := case p_modo
         when 'porcentaje' then p_actual * (1 + p_valor / 100)
         when 'monto'      then p_actual + p_valor
         when 'fijo'       then p_valor
         when 'margen'     then p_costo * (1 + p_valor / 100)
       end;
  v := greatest(coalesce(v, 0), 0);
  -- Se redondea siempre para arriba (nunca queda por debajo de lo calculado)
  return case p_redondeo
           when '10'   then ceil(v / 10) * 10
           when '100'  then ceil(v / 100) * 100
           when '1000' then ceil(v / 1000) * 1000
           when '999'  then greatest(ceil((v + 1) / 1000) * 1000 - 1, 0)   -- 259.999
           else round(v, 2)
         end;
end $$;

-- Vista previa (p_aplicar = false) o ajuste (p_aplicar = true). Devuelve un renglón por artículo que
-- cambia de precio. p_productos: los artículos elegidos (la pantalla resuelve los filtros).
create or replace function public.ajustar_precios(
  p_que text, p_productos bigint[], p_modo text, p_valor numeric, p_redondeo text default 'ninguno',
  p_proveedor bigint default null, p_descripcion text default null, p_aplicar boolean default false
) returns table (producto_id bigint, codigo text, nombre text, precio_anterior numeric, precio_nuevo numeric)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_ajuste bigint; v_n int;
begin
  if p_que = 'venta' and not tiene_permiso('precios.editar') then raise exception 'No tenés permiso para cambiar precios de venta'; end if;
  if p_que = 'compra' and not (tiene_permiso('costos.ver') and (tiene_permiso('proveedores.gestionar') or tiene_permiso('compras.registrar'))) then
    raise exception 'No tenés permiso para cambiar precios de compra';
  end if;
  if p_que not in ('venta','compra') then raise exception 'Elegí si ajustás el precio de venta o el de compra'; end if;
  if p_modo = 'margen' and p_que <> 'venta' then raise exception '"Costo + %%" es solo para el precio de venta'; end if;
  if p_modo not in ('porcentaje','monto','fijo','margen') then raise exception 'Modo de ajuste inválido'; end if;
  if p_valor is null then raise exception 'Falta el valor del ajuste'; end if;
  if p_modo = 'porcentaje' and p_valor <= -100 then raise exception 'Una baja del 100 %% o más dejaría el precio en cero'; end if;
  if coalesce(array_length(p_productos, 1), 0) = 0 then raise exception 'No hay artículos elegidos'; end if;

  drop table if exists _cambios;
  create temp table _cambios on commit drop as
  select x.producto_id, x.codigo, x.nombre, x.anterior, x.nuevo, x.bonificacion, x.principal
  from (
    select p.id as producto_id, p.codigo, p.nombre,
           case when p_que = 'venta' then p.precio_venta when p_proveedor is not null then pp.precio_lista else p.precio_compra end as anterior,
           precio_ajustado(case when p_que = 'venta' then p.precio_venta when p_proveedor is not null then pp.precio_lista else p.precio_compra end,
                           p.precio_compra, p_modo, p_valor, p_redondeo) as nuevo,
           pp.bonificacion_pct as bonificacion, coalesce(pp.principal, false) as principal
    from productos p
    left join producto_proveedores pp on pp.producto_id = p.id and pp.proveedor_id = p_proveedor
    where p.id = any (p_productos)
      and (p_que = 'venta' or p_proveedor is null or pp.id is not null)   -- con proveedor: solo lo que él vende
  ) x
  where x.nuevo is distinct from x.anterior;

  if p_aplicar then
    select count(*) into v_n from _cambios;
    if v_n = 0 then raise exception 'Ningún precio cambia con ese ajuste'; end if;
    insert into ajustes_precios (que, proveedor_id, modo, valor, redondeo, descripcion, cantidad)
    values (p_que, case when p_que = 'compra' then p_proveedor end, p_modo, p_valor, p_redondeo, p_descripcion, v_n)
    returning id into v_ajuste;
    insert into ajuste_precio_items (ajuste_id, producto_id, precio_anterior, precio_nuevo)
    select v_ajuste, c.producto_id, c.anterior, c.nuevo from _cambios c;

    if p_que = 'venta' then
      update productos p set precio_venta = c.nuevo from _cambios c where p.id = c.producto_id;
    elsif p_proveedor is null then
      update productos p set precio_compra = c.nuevo from _cambios c where p.id = c.producto_id;
    else
      update producto_proveedores pp set precio_lista = c.nuevo, actualizado_en = now()
        from _cambios c where pp.producto_id = c.producto_id and pp.proveedor_id = p_proveedor;
      -- Si es el proveedor principal, su nuevo neto pasa a ser el costo de referencia
      update productos p set precio_compra = round(c.nuevo * (1 - c.bonificacion / 100), 2)
        from _cambios c where p.id = c.producto_id and c.principal;
    end if;
  end if;

  return query select c.producto_id, c.codigo, c.nombre, c.anterior, c.nuevo from _cambios c order by c.nombre;
end $$;

-- Deshacer: vuelve al precio anterior lo que siga con el precio que puso el ajuste (si alguien lo cambió
-- después, eso no se pisa). Devuelve cuántos artículos volvieron.
create or replace function public.deshacer_ajuste_precios(p_ajuste bigint) returns int
language plpgsql security definer set search_path = public as $$
declare a ajustes_precios; v_n int;
begin
  select * into a from ajustes_precios where id = p_ajuste for update;
  if not found then raise exception 'Ese ajuste no existe'; end if;
  if a.que = 'venta' and not tiene_permiso('precios.editar') then raise exception 'No tenés permiso para cambiar precios de venta'; end if;
  if a.que = 'compra' and not (tiene_permiso('costos.ver') and (tiene_permiso('proveedores.gestionar') or tiene_permiso('compras.registrar'))) then
    raise exception 'No tenés permiso para cambiar precios de compra';
  end if;
  if a.deshecho_en is not null then raise exception 'Ese ajuste ya se deshizo'; end if;

  if a.que = 'venta' then
    update productos p set precio_venta = i.precio_anterior from ajuste_precio_items i
     where i.ajuste_id = p_ajuste and p.id = i.producto_id and p.precio_venta = i.precio_nuevo;
  elsif a.proveedor_id is null then
    update productos p set precio_compra = i.precio_anterior from ajuste_precio_items i
     where i.ajuste_id = p_ajuste and p.id = i.producto_id and p.precio_compra = i.precio_nuevo;
  else
    update productos p set precio_compra = round(i.precio_anterior * (1 - pp.bonificacion_pct / 100), 2)
      from ajuste_precio_items i join producto_proveedores pp on pp.producto_id = i.producto_id and pp.proveedor_id = a.proveedor_id
     where i.ajuste_id = p_ajuste and p.id = i.producto_id and pp.principal and pp.precio_lista = i.precio_nuevo;
    update producto_proveedores pp set precio_lista = i.precio_anterior, actualizado_en = now() from ajuste_precio_items i
     where i.ajuste_id = p_ajuste and pp.producto_id = i.producto_id and pp.proveedor_id = a.proveedor_id and pp.precio_lista = i.precio_nuevo;
  end if;
  get diagnostics v_n = row_count;
  update ajustes_precios set deshecho_en = now(), deshecho_por = auth.uid() where id = p_ajuste;
  return v_n;
end $$;

revoke execute on function public.precio_ajustado, public.ajustar_precios, public.deshacer_ajuste_precios from public, anon;
grant execute on function public.precio_ajustado, public.ajustar_precios, public.deshacer_ajuste_precios to authenticated;
