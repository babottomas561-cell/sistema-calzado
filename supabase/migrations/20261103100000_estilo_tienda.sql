-- Estilo de la tienda (Tienda online → Identidad): cambia la tipografía de los títulos, los bordes y cuánto se mueve la
-- tienda, sin tocar el contenido. clasico = el de siempre; editorial = serif fina y quieta; urbano = condensada en mayúsculas.
alter table public.configuracion_tienda
  add column estilo text not null default 'clasico' check (estilo in ('clasico', 'editorial', 'urbano'));
