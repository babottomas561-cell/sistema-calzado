-- Curvas de compra: la distribución de talles con la que se compra (por ejemplo «1 del 38, 2 del 39, 2 del 40, 2 del 41, 1 del 42»), por escala de talles.
-- Vale para cualquier artículo de esa escala: al cargar una compra se aplica «curva ×N» a los colores del modelo y se completan las cantidades de cada talle.
-- (Distinto del bulto, que es una combinación concreta de artículos.) No lleva costos. Agrega, no rompe.

create table public.curvas (
  id           bigint generated always as identity primary key,
  nombre       text not null check (length(trim(nombre)) between 1 and 60),
  escala       text not null,                                   -- una de las escalas de talles (talles.tipo)
  proveedor_id bigint references public.proveedores (id) on delete set null,
  notas        text,
  creado_en    timestamptz not null default now()
);
create unique index curvas_nombre_key on public.curvas (lower(nombre));
create index curvas_proveedor_id_idx on public.curvas (proveedor_id);

create table public.curva_items (
  id        bigint generated always as identity primary key,
  curva_id  bigint not null references public.curvas (id) on delete cascade,
  talle_id  bigint not null references public.talles (id) on delete restrict,
  cantidad  int not null check (cantidad > 0),
  unique (curva_id, talle_id)
);
create index curva_items_talle_id_idx on public.curva_items (talle_id);

alter table public.curvas enable row level security;
alter table public.curva_items enable row level security;
create policy "quien compra ve las curvas" on public.curvas for select to authenticated using (tiene_permiso('compras.registrar'));
create policy "quien compra ve lo que lleva cada curva" on public.curva_items for select to authenticated using (tiene_permiso('compras.registrar'));

-- p_items: [{talle_id, cantidad}]. Sin p_id crea la curva; con p_id la reemplaza entera.
create function public.guardar_curva(p_nombre text, p_escala text, p_items jsonb, p_id bigint default null, p_proveedor bigint default null, p_notas text default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint; it record;
begin
  if not tiene_permiso('compras.registrar') then raise exception 'No tenés permiso para armar curvas'; end if;
  if length(trim(coalesce(p_nombre, ''))) = 0 then raise exception 'Ponele un nombre a la curva (por ejemplo «Calzado 38 al 42»)'; end if;
  if not exists (select 1 from talles where tipo = p_escala) then raise exception 'Elegí la escala de talles de la curva'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'La curva no tiene talles'; end if;
  if p_proveedor is not null and not exists (select 1 from proveedores where id = p_proveedor) then raise exception 'El proveedor no existe'; end if;
  if p_id is null then
    insert into curvas (nombre, escala, proveedor_id, notas) values (trim(p_nombre), p_escala, p_proveedor, nullif(trim(coalesce(p_notas, '')), '')) returning id into v_id;
  else
    update curvas set nombre = trim(p_nombre), escala = p_escala, proveedor_id = p_proveedor, notas = nullif(trim(coalesce(p_notas, '')), '') where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Esa curva no existe'; end if;
    delete from curva_items where curva_id = v_id;
  end if;
  for it in select (i ->> 'talle_id')::bigint as talle_id, sum((i ->> 'cantidad')::int) as cantidad from jsonb_array_elements(p_items) i group by 1 loop
    if it.cantidad <= 0 then raise exception 'La cantidad de cada talle tiene que ser mayor a cero'; end if;
    if not exists (select 1 from talles where id = it.talle_id and tipo = p_escala) then raise exception 'Hay un talle que no es de la escala %', p_escala; end if;
    insert into curva_items (curva_id, talle_id, cantidad) values (v_id, it.talle_id, it.cantidad);
  end loop;
  return v_id;
exception when unique_violation then raise exception 'Ya hay una curva con ese nombre';
end $$;

create function public.quitar_curva(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tiene_permiso('compras.registrar') then raise exception 'No tenés permiso para armar curvas'; end if;
  delete from curvas where id = p_id;
end $$;

revoke execute on function public.guardar_curva(text, text, jsonb, bigint, bigint, text), public.quitar_curva(bigint) from public, anon;
grant execute on function public.guardar_curva(text, text, jsonb, bigint, bigint, text), public.quitar_curva(bigint) to authenticated;
