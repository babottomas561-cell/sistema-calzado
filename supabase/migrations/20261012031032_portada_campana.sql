-- Portada de campaña (afinada con referencias de marcas de moda):
--   · sección nueva "editorial": foto grande de un lado y texto de colección del otro (50/50);
--   · varios avisos que rotan en la barra de arriba (cuotas, envío, retiro…) en vez de uno solo;
--   · la portada y el banner pueden llevar VIDEO (mp4/webm) además de foto.

alter table public.inicio_secciones drop constraint inicio_secciones_tipo_check;
alter table public.inicio_secciones add constraint inicio_secciones_tipo_check
  check (tipo in ('portada', 'cinta', 'accesos', 'productos', 'promociones', 'banner', 'editorial', 'pasos', 'local'));

-- Avisos: hasta 5, de hasta 120 letras cada uno. El que había pasa a ser el primero.
alter table public.configuracion_tienda add column avisos text[] not null default '{}'
  check (cardinality(avisos) <= 5 and array_position(avisos, null) is null);
create function public._avisos_cortos(p text[]) returns boolean language sql immutable as $$
  select coalesce(bool_and(length(a) between 1 and 120), true) from unnest(p) a $$;
alter table public.configuracion_tienda add constraint configuracion_tienda_avisos_cortos check (_avisos_cortos(avisos));
update public.configuracion_tienda set avisos = array[aviso] where aviso is not null and aviso <> '';
alter table public.configuracion_tienda drop column aviso;

-- Videos para la portada y los banners (el navegador no los achica: tope 50 MB)
update storage.buckets
   set file_size_limit = 52428800,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']
 where id = 'tienda';
