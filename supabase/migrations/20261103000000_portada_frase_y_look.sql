-- Dos secciones nuevas para la portada (las arma el dueño en Tienda online):
--   · «frase»: una frase gigante sobre el color de la marca que se desliza de costado al bajar, con prendas del
--     catálogo flotando entre las palabras (inspirada en las landings de campaña de marcas de moda).
--   · «look»: la foto de un conjunto con puntos sobre cada prenda ({x, y, producto_id}, en % de la foto) que llevan a
--     comprarla, y al lado la lista de esas prendas («comprá el look»).
-- Solo se agrega el tipo: la forma de `contenido` la cuida lib/inicio.ts, como en los demás.
alter table public.inicio_secciones drop constraint inicio_secciones_tipo_check;
alter table public.inicio_secciones add constraint inicio_secciones_tipo_check
  check (tipo in ('portada', 'cinta', 'accesos', 'productos', 'promociones', 'banner', 'editorial', 'instagram', 'pasos', 'local', 'frase', 'look'));
