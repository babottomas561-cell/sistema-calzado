-- El ícono de la pestaña del navegador (favicon), configurable en Tienda online. Se sube al bucket público «tienda».
-- Sin ícono cargado, la tienda muestra su inicial sobre el color de la marca (no el de Next.js).
alter table public.configuracion_tienda
  add column icono_url  text check (icono_url is null or icono_url ~ '^https://'),
  add column icono_ruta text;   -- ruta en el bucket «tienda» (para borrarlo al cambiarlo)
