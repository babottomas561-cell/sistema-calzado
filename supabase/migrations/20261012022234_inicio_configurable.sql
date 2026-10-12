-- Portada de la tienda configurable desde el panel (/admin/tienda).
-- La landing (/) se arma con SECCIONES: cada una es de un tipo (portada, cinta que corre, accesos,
-- promociones, vidriera de productos, banner con foto, pasos, el local), tiene su orden, se prende o se apaga y guarda
-- sus textos, su botón y su foto. Lo particular de cada tipo va en `contenido` (jsonb), que la app
-- valida al guardar (lib/inicio.ts). Las fotos van al bucket público "tienda".

-- ── Permiso nuevo: la tienda online ───────────────────────────────────
insert into public.permisos (orden, grupo, codigo, nombre, descripcion) values
  (92, 'Configuración', 'tienda.editar', 'Tienda online', 'Portada de la tienda (secciones, textos y fotos), aviso, redes y datos del local.');

-- Los datos de la tienda pasan a editarse con este permiso (antes, con "Tablas")
drop policy "tablas" on public.configuracion_tienda;
create policy "tienda" on public.configuracion_tienda for update to authenticated
  using (tiene_permiso('tienda.editar')) with check (tiene_permiso('tienda.editar'));

-- ── Datos nuevos de la tienda ─────────────────────────────────────────
alter table public.configuracion_tienda
  add column aviso         text check (length(aviso) <= 120),   -- barra de arriba: "Envío gratis en Tucumán"
  add column aviso_enlace  text,                                -- a dónde lleva el aviso (opcional)
  add column instagram     text check (instagram ~ '^[A-Za-z0-9._]{1,30}$');  -- usuario, sin @

-- ── Secciones de la portada ───────────────────────────────────────────
create table public.inicio_secciones (
  id              bigint generated always as identity primary key,
  tipo            text not null check (tipo in ('portada', 'cinta', 'accesos', 'promociones', 'productos', 'banner', 'pasos', 'local')),
  orden           int not null default 0,
  visible         boolean not null default true,
  titulo          text,
  bajada          text,
  boton_texto     text,
  boton_enlace    text check (boton_enlace ~ '^(/|https?://|#)'),   -- interno (/tienda…), externo o ancla
  imagen_url      text,
  imagen_ruta     text,          -- ruta en el bucket "tienda" (para borrarla al cambiarla); null si es un link
  contenido       jsonb not null default '{}' check (jsonb_typeof(contenido) = 'object'),
  actualizado_en  timestamptz not null default now()
);
create index inicio_secciones_orden_idx on public.inicio_secciones (orden);

alter table public.inicio_secciones enable row level security;
-- El público ve las secciones prendidas; quien edita la tienda ve todas (anon no puede llamar a
-- tiene_permiso(), por eso va en una política aparte)
create policy "público ve secciones" on public.inicio_secciones for select to anon using (visible);
create policy "ve secciones" on public.inicio_secciones for select to authenticated
  using (visible or tiene_permiso('tienda.editar'));
create policy "edita secciones" on public.inicio_secciones for all to authenticated
  using (tiene_permiso('tienda.editar')) with check (tiene_permiso('tienda.editar'));

create function public._tocar_seccion() returns trigger language plpgsql as $$
begin new.actualizado_en := now(); return new; end $$;
create trigger inicio_secciones_tocar before update on public.inicio_secciones
  for each row execute function public._tocar_seccion();

-- La portada de hoy, pasada a secciones (los textos que ya se habían cargado se conservan)
insert into public.inicio_secciones (tipo, orden, titulo, bajada, boton_texto, boton_enlace, contenido)
select 'portada', 10, titulo_inicio, bajada_inicio, 'Entrar a la tienda', '/tienda', '{"estilo": "columnas"}'
  from public.configuracion_tienda;
insert into public.inicio_secciones (tipo, orden, titulo, boton_texto, boton_enlace, contenido) values
  ('cinta', 15, null, null, null, jsonb_build_object('frases', jsonb_build_array('Reservá online', 'Retirá sin cargo en el local', 'Pagá como prefieras'), 'marcas', true)),
  ('accesos', 20, 'Elegí por dónde empezar', 'Ver todo', '/tienda', jsonb_build_object('tarjetas', jsonb_build_array(
    jsonb_build_object('titulo', 'Mujer',   'bajada', 'Lo nuevo de la temporada', 'filtro', jsonb_build_object('genero', 'Mujer')),
    jsonb_build_object('titulo', 'Hombre',  'bajada', 'Básicos y deportivo',      'filtro', jsonb_build_object('genero', 'Hombre')),
    jsonb_build_object('titulo', 'Calzado', 'bajada', 'Zapatillas, botas y más',  'filtro', jsonb_build_object('linea', 'Calzado'))))),
  ('productos', 30, 'Lo más elegido', 'Ver toda la tienda', '/tienda', '{"criterio": "mas_vendidos", "cantidad": 8}'),
  ('promociones', 40, 'Ahora en la tienda', 'Ver las prendas', '/tienda', '{}'),
  ('pasos', 50, 'Comprar es así de simple', null, null, jsonb_build_object('pasos', jsonb_build_array(
    jsonb_build_object('titulo', 'Elegí',           'texto', 'Mirá la tienda, filtrá por talle y color y sumá lo que te guste al carrito.'),
    jsonb_build_object('titulo', 'Reservá',         'texto', 'Confirmás el pedido y te lo guardamos. Lo mandás por WhatsApp para coordinar.'),
    jsonb_build_object('titulo', 'Retirá o recibí', 'texto', 'Pasás por el local sin costo o te lo enviamos a tu domicilio.')))),
  ('local', 60, 'Pasá a probártelo', 'Entrar a la tienda', '/tienda', '{}');
update public.inicio_secciones set bajada = 'Te esperamos en el local. Si preferís, escribinos y te asesoramos por WhatsApp.' where tipo = 'local';
update public.inicio_secciones set bajada = null where tipo = 'portada' and bajada = '';

-- Los textos de la portada viven ahora en su sección
alter table public.configuracion_tienda drop column titulo_inicio, drop column bajada_inicio;

-- ── Catálogo: línea del rubro y fecha de alta (filtro "Calzado" y vidriera "Lo nuevo") ──
create or replace view public.v_catalogo as
select v.id as variante_id, p.id as producto_id, p.nombre, m.nombre as marca, c.nombre as categoria,
       p.genero, p.escala, p.descripcion, p.imagen_url, t.nombre as talle, t.orden as talle_orden, co.nombre as color, co.hex as color_hex,
       coalesce(v.precio_venta, p.precio_venta) as precio,
       greatest(coalesce(sum(s.cantidad - s.reservado), 0), 0)::int as disponible,
       p.temporada, p.material, c.linea, p.creado_en
from variantes v
join productos p on p.id = v.producto_id
join talles t on t.id = v.talle_id
join colores co on co.id = v.color_id
left join marcas m on m.id = p.marca_id
left join categorias c on c.id = p.categoria_id
left join stock s on s.variante_id = v.id
where p.publicado_web and p.activo
group by v.id, p.id, m.nombre, c.nombre, c.linea, t.nombre, t.orden, co.nombre, co.hex;

-- ── Lo más vendido, para la vidriera ──────────────────────────────────
-- Devuelve solo el ORDEN de los artículos publicados (no cuántos se vendieron ni a qué precio):
-- el público no puede leer ventas, por eso es security definer. Los que no se vendieron van al
-- final, los más nuevos primero.
create function public.mas_vendidos_tienda(p_dias int default 90)
returns table (producto_id bigint) language sql stable security definer set search_path = public as $$
  select p.id
    from productos p
    left join variantes v on v.producto_id = p.id
    left join venta_items vi on vi.variante_id = v.id
    left join ventas ve on ve.id = vi.venta_id and ve.fecha >= now() - make_interval(days => greatest(p_dias, 1))
   where p.publicado_web and p.activo
   group by p.id
   order by coalesce(sum(vi.cantidad) filter (where ve.id is not null), 0) desc, p.creado_en desc, p.id desc
   limit 60
$$;
grant execute on function public.mas_vendidos_tienda(int) to anon, authenticated;

-- ── Fotos de la portada (Storage) ─────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tienda', 'tienda', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "tienda ve fotos" on storage.objects
  for select to authenticated using (bucket_id = 'tienda' and public.tiene_permiso('tienda.editar'));
create policy "tienda sube fotos" on storage.objects
  for insert to authenticated with check (bucket_id = 'tienda' and public.tiene_permiso('tienda.editar'));
create policy "tienda cambia fotos" on storage.objects
  for update to authenticated using (bucket_id = 'tienda' and public.tiene_permiso('tienda.editar'))
  with check (bucket_id = 'tienda' and public.tiene_permiso('tienda.editar'));
create policy "tienda borra fotos" on storage.objects
  for delete to authenticated using (bucket_id = 'tienda' and public.tiene_permiso('tienda.editar'));
