-- Menú configurable.
--   · Módulos del sistema: cada instalación decide qué partes usa (Presupuestos, Pedidos, Contabilidad…). Lo que se apaga deja de
--     aparecer en el menú de todo el equipo. Se guarda lo APAGADO (una fila por clave): una instalación nueva o una sección nueva
--     de una versión posterior nacen encendidas. La clave es la ruta del menú (p. ej. '/admin/presupuestos').
--   · Menú de cada persona: sus favoritos (arriba del menú) y lo que prefiere no ver. Es de cada persona; no cambia lo que puede hacer.
-- Esto es configuración, no seguridad: lo que cada persona puede hacer lo siguen controlando los permisos y la base.
create table public.modulos_desactivados (
  clave text primary key check (length(clave) between 1 and 80)
);
alter table public.modulos_desactivados enable row level security;
create policy "el equipo ve los módulos" on public.modulos_desactivados for select to authenticated using (es_staff());

create function public.configurar_modulos(p_desactivados text[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tiene_permiso('equipo.administrar') then raise exception 'No tenés permiso para configurar los módulos'; end if;
  if coalesce(array_length(p_desactivados, 1), 0) > 80 then raise exception 'Son demasiados módulos'; end if;
  delete from modulos_desactivados;
  insert into modulos_desactivados (clave)
    select distinct trim(c) from unnest(coalesce(p_desactivados, '{}')) c where length(trim(c)) between 1 and 80;
end $$;

create table public.menu_usuario (
  usuario_id uuid primary key references auth.users (id) on delete cascade,
  favoritos  text[] not null default '{}',
  ocultos    text[] not null default '{}'
);
alter table public.menu_usuario enable row level security;
create policy "su menú" on public.menu_usuario for all to authenticated
  using (usuario_id = auth.uid() and es_staff()) with check (usuario_id = auth.uid() and es_staff());

create function public.guardar_menu_usuario(p_favoritos text[], p_ocultos text[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_staff() then raise exception 'Solo el equipo tiene menú'; end if;
  if coalesce(array_length(p_favoritos, 1), 0) > 40 or coalesce(array_length(p_ocultos, 1), 0) > 80 then raise exception 'Son demasiados ítems'; end if;
  insert into menu_usuario (usuario_id, favoritos, ocultos)
    values (auth.uid(),
            coalesce((select array_agg(distinct x) from unnest(p_favoritos) x where length(x) between 1 and 80), '{}'),
            coalesce((select array_agg(distinct x) from unnest(p_ocultos) x where length(x) between 1 and 80), '{}'))
  on conflict (usuario_id) do update set favoritos = excluded.favoritos, ocultos = excluded.ocultos;
end $$;

revoke execute on function public.configurar_modulos(text[]), public.guardar_menu_usuario(text[], text[]) from public, anon;
grant execute on function public.configurar_modulos(text[]), public.guardar_menu_usuario(text[], text[]) to authenticated;
