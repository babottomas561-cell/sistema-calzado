-- Fotos de los productos: varias por modelo, ordenadas, y UNA principal (la de las tarjetas,
-- el carrito y cualquier vista previa). Se suben desde el panel (cámara o galería del celular)
-- a Supabase Storage, bucket "productos".
--
-- productos.imagen_url sigue existiendo y la mantiene la base: siempre es la url de la foto
-- principal. Así v_catalogo y todo lo que ya mostraba "la foto" no cambia.

create table public.producto_imagenes (
  id           bigint generated always as identity primary key,
  -- La foto es parte del producto: si se borra el producto, se van sus fotos
  producto_id  bigint not null references public.productos (id) on delete cascade,
  url          text not null,               -- dirección pública de la imagen
  ruta         text,                        -- ruta dentro del bucket "productos" (null si es un link externo)
  orden        int not null default 0,
  principal    boolean not null default false,
  creado_en    timestamptz not null default now()
);
create index producto_imagenes_producto_id_idx on public.producto_imagenes (producto_id, orden);
-- Una sola principal por producto
create unique index producto_imagenes_una_principal on public.producto_imagenes (producto_id) where principal;

-- Antes de guardar: la primera foto de un producto nace principal, va al final del orden,
-- y marcar una como principal desmarca a la anterior.
create or replace function public._imagen_antes() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from producto_imagenes where producto_id = new.producto_id and principal) then
      new.principal := true;
    end if;
    if new.orden = 0 then
      select coalesce(max(orden), 0) + 1 into new.orden from producto_imagenes where producto_id = new.producto_id;
    end if;
  end if;
  if new.principal then
    update producto_imagenes set principal = false
     where producto_id = new.producto_id and principal and id is distinct from new.id;
  end if;
  return new;
end $$;

create trigger imagen_antes before insert or update of principal on public.producto_imagenes
  for each row execute function public._imagen_antes();

-- Después de cualquier cambio: si se borró la principal, pasa a serlo la primera que queda;
-- y productos.imagen_url queda igual a la principal (o null si no hay fotos).
create or replace function public._imagen_despues() returns trigger
language plpgsql set search_path = public as $$
declare v_producto bigint := coalesce(new.producto_id, old.producto_id);
begin
  if tg_op = 'DELETE' and old.principal then
    update producto_imagenes set principal = true
     where id = (select id from producto_imagenes where producto_id = v_producto order by orden, id limit 1);
  end if;
  update productos set imagen_url = (select url from producto_imagenes where producto_id = v_producto and principal)
   where id = v_producto;
  return null;
end $$;

create trigger imagen_despues after insert or update or delete on public.producto_imagenes
  for each row execute function public._imagen_despues();

-- Las fotos que ya estaban cargadas como link pasan a la galería (quedan como principal)
insert into public.producto_imagenes (producto_id, url, orden, principal)
select id, imagen_url, 1, true from public.productos where imagen_url is not null;

-- Seguridad: el equipo hace todo; la tienda lee las fotos de lo publicado por la vista de abajo
alter table public.producto_imagenes enable row level security;
create policy "equipo" on public.producto_imagenes for all to authenticated using (es_staff()) with check (es_staff());

-- Galería PÚBLICA: como v_catalogo, corre con los permisos del dueño y solo muestra
-- fotos de productos publicados y activos.
create or replace view public.v_imagenes_tienda as
select i.id, i.producto_id, i.url, i.orden, i.principal
from producto_imagenes i
join productos p on p.id = i.producto_id
where p.publicado_web and p.activo;

grant select on public.v_imagenes_tienda to anon, authenticated;

-- ── Storage ───────────────────────────────────────────────────────────
-- Bucket público: cualquiera puede VER una foto con su dirección (la tienda las muestra),
-- pero listar, subir, cambiar o borrar es solo del equipo.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('productos', 'productos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "equipo ve fotos de productos" on storage.objects
  for select to authenticated using (bucket_id = 'productos' and public.es_staff());
create policy "equipo sube fotos de productos" on storage.objects
  for insert to authenticated with check (bucket_id = 'productos' and public.es_staff());
create policy "equipo cambia fotos de productos" on storage.objects
  for update to authenticated using (bucket_id = 'productos' and public.es_staff())
  with check (bucket_id = 'productos' and public.es_staff());
create policy "equipo borra fotos de productos" on storage.objects
  for delete to authenticated using (bucket_id = 'productos' and public.es_staff());
