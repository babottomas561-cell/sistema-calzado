-- Bultos: plantillas de compra. Un bulto es una combinación guardada de variantes (artículo + talle + color) con su cantidad: la curva cerrada que vende el proveedor.
-- Al cargar una compra se agrega «un bulto ×N» y se expande a los renglones de siempre: el stock lo sigue tocando solo `registrar_compra`.
--   · un bulto puede mezclar artículos distintos y puede ser de un proveedor (opcional);
--   · no lleva costos (el costo sale del proveedor al comprar).
-- Agrega, no rompe.

create table public.bultos (
  id           bigint generated always as identity primary key,
  nombre       text not null check (length(trim(nombre)) between 1 and 60),
  proveedor_id bigint references public.proveedores (id) on delete set null,
  notas        text,
  creado_en    timestamptz not null default now()
);
create unique index bultos_nombre_key on public.bultos (lower(nombre));
create index bultos_proveedor_id_idx on public.bultos (proveedor_id);

create table public.bulto_items (
  id          bigint generated always as identity primary key,
  bulto_id    bigint not null references public.bultos (id) on delete cascade,
  variante_id bigint not null references public.variantes (id) on delete restrict,
  cantidad    int not null check (cantidad > 0),
  unique (bulto_id, variante_id)
);
create index bulto_items_variante_id_idx on public.bulto_items (variante_id);

alter table public.bultos enable row level security;
alter table public.bulto_items enable row level security;
create policy "quien compra ve los bultos" on public.bultos for select to authenticated using (tiene_permiso('compras.registrar'));
create policy "quien compra ve lo que lleva cada bulto" on public.bulto_items for select to authenticated using (tiene_permiso('compras.registrar'));

-- p_items: [{variante_id, cantidad}]. Sin p_id crea el bulto; con p_id lo reemplaza entero.
create function public.guardar_bulto(p_nombre text, p_items jsonb, p_id bigint default null, p_proveedor bigint default null, p_notas text default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint; it record;
begin
  if not tiene_permiso('compras.registrar') then raise exception 'No tenés permiso para armar bultos'; end if;
  if length(trim(coalesce(p_nombre, ''))) = 0 then raise exception 'Ponele un nombre al bulto (por ejemplo «Caja de 12 jeans»)'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'El bulto no tiene productos'; end if;
  if p_proveedor is not null and not exists (select 1 from proveedores where id = p_proveedor) then raise exception 'El proveedor no existe'; end if;
  if p_id is null then
    insert into bultos (nombre, proveedor_id, notas) values (trim(p_nombre), p_proveedor, nullif(trim(coalesce(p_notas, '')), '')) returning id into v_id;
  else
    update bultos set nombre = trim(p_nombre), proveedor_id = p_proveedor, notas = nullif(trim(coalesce(p_notas, '')), '') where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Ese bulto no existe'; end if;
    delete from bulto_items where bulto_id = v_id;
  end if;
  -- una variante repetida suma su cantidad
  for it in select (i ->> 'variante_id')::bigint as variante_id, sum((i ->> 'cantidad')::int) as cantidad from jsonb_array_elements(p_items) i group by 1 loop
    if it.cantidad <= 0 then raise exception 'La cantidad de cada renglón tiene que ser mayor a cero'; end if;
    if not exists (select 1 from variantes where id = it.variante_id) then raise exception 'Hay un producto que no existe'; end if;
    insert into bulto_items (bulto_id, variante_id, cantidad) values (v_id, it.variante_id, it.cantidad);
  end loop;
  return v_id;
exception when unique_violation then raise exception 'Ya hay un bulto con ese nombre';
end $$;

create function public.quitar_bulto(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tiene_permiso('compras.registrar') then raise exception 'No tenés permiso para armar bultos'; end if;
  delete from bultos where id = p_id;
end $$;

revoke execute on function public.guardar_bulto(text, jsonb, bigint, bigint, text), public.quitar_bulto(bigint) from public, anon;
grant execute on function public.guardar_bulto(text, jsonb, bigint, bigint, text), public.quitar_bulto(bigint) to authenticated;
