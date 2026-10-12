-- DATOS DEMO DE ROPA: 68 prendas reales de dos tiendas online argentinas, con su precio de lista y su foto de catálogo:
--   · Dexter (dexter.com.ar): ropa deportiva y accesorios de Adidas, Nike, Puma, Topper, Under Armour, Fila, Lotto y Loop Up.
--   · Zara Argentina (zara.com/ar): ropa urbana y «de salir» (camisas, jeans, pantalones, sweaters, camperas, polleras).
-- Los precios son los publicados en octubre de 2026 y el stock es inventado. Las fotos son LINKS a las tiendas (no se copian los
-- archivos): sirven para mostrar y probar, y si la tienda las cambia o las quita, el sistema muestra un ícono en su lugar.
-- Los nombres y las marcas pertenecen a sus dueños; no es un catálogo propio ni se vende nada de eso.
--
-- Se carga ENCIMA de lo que ya haya (no exige base vacía), así convive con la demo de calzado.
-- Correr así (producción):  npx supabase db query --linked -f supabase/demo/ropa.sql
-- Se limpia con supabase/demo/borrar.sql (borra TODO el catálogo y la operación, calzado incluido).
--
-- Respeta las reglas del sistema: el stock entra por registrar_compra y sale por registrar_venta
-- (quedan los movimientos), los códigos los genera la base y nada se escribe con un id a mano.
begin;

select set_config('request.jwt.claims',
  json_build_object('sub', (select id from perfiles where rol = 'staff' order by id limit 1), 'role', 'authenticated')::text, true);
do $$ begin
  if not es_staff() then raise exception 'No hay ningún usuario staff: marcá uno antes de cargar la demo'; end if;
  if exists (select 1 from productos where nombre = 'Remera Entrenamiento Puma Tad Essentials Logo Hombre') then raise exception 'La demo de ropa ya está cargada'; end if;
end $$;

-- ── Tablas maestras ──
insert into categorias (nombre, linea) values
  ('Buzo', 'Ropa'),
  ('Calza', 'Ropa'),
  ('Camisa', 'Ropa'),
  ('Campera', 'Ropa'),
  ('Gorra', 'Accesorios'),
  ('Jean', 'Ropa'),
  ('Medias', 'Accesorios'),
  ('Pantalón', 'Ropa'),
  ('Pollera', 'Ropa'),
  ('Remera', 'Ropa'),
  ('Short', 'Ropa'),
  ('Sweater', 'Ropa')
on conflict do nothing;
insert into marcas (nombre) values ('Adidas'), ('Fila'), ('Loop Up'), ('Lotto'), ('Nike'), ('Puma'), ('Topper'), ('Under Armour'), ('Zara') on conflict do nothing;
insert into colores (nombre, hex) values
  ('Blanco', '#f5f5f5'), ('Negro', '#111111'), ('Gris', '#8c8c91'), ('Azul marino', '#1e2d5f'), ('Azul', '#2859c8'), ('Celeste', '#7dbeeb'), ('Bordó', '#6e1928'), ('Verde oliva', '#5a6432'), ('Beige', '#cdbe9b'), ('Amarillo', '#f5c81e'), ('Rosa', '#eb82aa'), ('Marrón', '#6e462d'), ('Violeta', '#7846c8'), ('Surtido', '#d1d5db')
on conflict do nothing;
insert into proveedores (nombre) select m || ' (demo)' from unnest(array['Adidas', 'Fila', 'Loop Up', 'Lotto', 'Nike', 'Puma', 'Topper', 'Under Armour', 'Zara']) m
 where not exists (select 1 from proveedores p where p.nombre = m || ' (demo)');

-- ── Prendas ──
create temp table demo_ropa (
  n int, nombre text, marca text, rubro text, subrubro text, genero text, precio numeric, color text,
  escala text, talles text[], temporada text, material text, descripcion text, foto text
) on commit drop;

insert into demo_ropa values
(1, 'Remera Entrenamiento Puma Tad Essentials Logo Hombre', 'Puma', 'Remera', 'Deportiva', 'Hombre', 39999, 'Negro', 'Ropa letras', array['S', 'M', 'L', 'XL', 'XXL'], 'Primavera/Verano', null, 'Remera Entrenamiento Puma Tad Essentials Logo Hombre. Producto y precio de ejemplo tomados del catálogo online de Dexter.', 'https://www.dexter.com.ar/dw/image/v2/BDTF_PRD/on/demandware.static/-/Sites-365-dabra-catalog/default/dw52fd50a9/products/PU525920-01/PU525920-01-1.JPG?sw=700&sh=700'),
(2, 'Remera adidas Essentials Small Logo Hombre', 'Adidas', 'Remera', 'Deportiva', 'Hombre', 39999, 'Bordó', 'Ropa letras', array['S', 'M', 'L', 'XL', 'XXL'], 'Primavera/Verano', null, 'Remera adidas Essentials Small Logo Hombre. Producto y precio de ejemplo tomados del catálogo online de Dexter.', 'https://www.dexter.com.ar/dw/image/v2/BDTF_PRD/on/demandware.static/-/Sites-365-dabra-catalog/default/dw774df4c3/products/ADKF2403/ADKF2403-1.JPG?sw=700&sh=700'),
(3, 'Remera Topper Training Hombre', 'Topper', 'Remera', 'Deportiva', 'Hombre', 29999, 'Azul marino', 'Ropa letras', array['S', 'M', 'L', 'XL', 'XXL'], 'Primavera/Verano', null, 'Remera Topper Training Hombre. Producto y precio de ejemplo tomados del catálogo online de Dexter.', 'https://www.dexter.com.ar/dw/image/v2/BDTF_PRD/on/demandware.static/-/Sites-365-dabra-catalog/default/dw176008b7/products/TO168678/TO168678-1.JPG?sw=700&sh=700'),
(4, 'Remera Running Topper Sprint Hombre', 'Topper', 'Remera', 'Deportiva', 'Hombre', 29999, 'Gris', 'Ropa letras', array['S', 'M', 'L', 'XL', 'XXL'], 'Primavera/Verano', null, 'Remera Running Topper Sprint Hombre. Producto y precio de ejemplo tomados del catálogo online de Dexter.', 'https://www.dexter.com.ar/dw/image/v2/BDTF_PRD/on/demandware.static/-/Sites-365-dabra-catalog/default/dw61060073/products/TO168084/TO168084-1.JPG?sw=700&sh=700'),
(5, 'Short adidas Essentials Chelsea 3 Tiras Hombre', 'Adidas', 'Short', 'Deportiva', 'Hombre', 49999, 'Negro', 'Ropa letras', array['S', 'M', 'L', 'XL', 'XXL'], 'Primavera/Verano', null, 'Short adidas Essentials Chelsea 3 Tiras Hombre. Producto y precio de ejemplo tomados del catálogo online de Dexter.', 'https://www.dexter.com.ar/dw/image/v2/BDTF_PRD/on/demandware.static/-/Sites-365-dabra-catalog/default/dwd636137e/products/ADJE6436/ADJE6436-1.JPG?sw=700&sh=700'),
(6, 'Short Entrenamiento Topper Line Hombre', 'Topper', 'Short', 'Deportiva', 'Hombre', 24999, 'Azul', 'Ropa letras', array['S', 'M', 'L', 'XL', 'XXL'], 'Primavera/Verano', null, 'Short Entrenamiento Topper Line Hombre. Producto y precio de ejemplo tomados del catálogo online de Dexter.', 'https://www.dexter.com.ar/dw/image/v2/BDTF_PRD/on/demandware.static/-/Sites-365-dabra-catalog/default/dweb463aef/products/TO168015/TO168015-1.JPG?sw=700&sh=700'),
(7, 'Short Under Armour Vanish', 'Under Armour', 'Short', 'Deportiva', 'Hombre', 58999, 'Negro', 'Ropa letras', array['S', 'M', 'L', 'XL', 'XXL'], 'Primavera/Verano', null, 'Short Under Armour Vanish. Producto y precio de ejemplo tomados del catálogo online de Dexter.', 'https://www.dexter.com.ar/dw/image/v2/BDTF_PRD/on/demandware.static/-/Sites-365-dabra-catalog/default/dw420a7b0f/products/UA1370382-001/UA1370382-001-1.JPG?sw=700&sh=700'),
(8, 'Pantalón Puma Essentials 2 Color Hombre', 'Puma', 'Pantalón', 'Deportiva', 'Hombre', 79999, 'Gris', 'Ropa letras', array['S', 'M', 'L', 'XL', 'XXL'], 'Todo el año', null, 'Pantalón Puma Essentials 2 Color Hombre. Producto y precio de ejemplo tomados del catálogo online de Dexter.', 'https://www.dexter.com.ar/dw/image/v2/BDTF_PRD/on/demandware.static/-/Sites-365-dabra-catalog/default/dwf5aab8c8/products/PU684714-03/PU684714-03-1.JPG?sw=700&sh=700'),
(9, 'Pantalón Entrenamiento adidas Tiro 26 Essentials Hombre', 'Adidas', 'Pantalón', 'Deportiva', 'Hombre', 79999, 'Negro', 'Ropa letras', array['S', 'M', 'L', 'XL', 'XXL'], 'Todo el año', null, 'Pantalón Entrenamiento adidas Tiro 26 Essentials Hombre. Producto y precio de ejemplo tomados del catálogo online de Dexter.', 'https://www.dexter.com.ar/dw/image/v2/BDTF_PRD/on/demandware.static/-/Sites-365-dabra-catalog/default/dwc3e9cc20/products/ADKG0809/ADKG0809-1.JPG?sw=700&sh=700'),
(10, 'Pantalón Topper Pro Fleece Hombre', 'Topper', 'Pantalón', 'Deportiva', 'Hombre', 54999, 'Gris', 'Ropa letras', array['S', 'M', 'L', 'XL', 'XXL'], 'Otoño/Invierno', null, 'Pantalón Topper Pro Fleece Hombre. Producto y precio de ejemplo tomados del catálogo online de Dexter.', 'https://www.dexter.com.ar/dw/image/v2/BDTF_PRD/on/demandware.static/-/Sites-365-dabra-catalog/default/dwd96216e9/products/TO168238/TO168238-1.JPG?sw=700&sh=700'),
(11, 'Buzo Puma Essentials Block Hombre', 'Puma', 'Buzo', 'Deportiva', 'Hombre', 59999, 'Negro', 'Ropa letras', array['S', 'M', 'L', 'XL', 'XXL'], 'Otoño/Invierno', null, 'Buzo Puma Essentials Block Hombre. Producto y precio de ejemplo tomados del catálogo online de Dexter.', 'https://www.dexter.com.ar/dw/image/v2/BDTF_PRD/on/demandware.static/-/Sites-365-dabra-catalog/default/dw9ef6b602/products/PU691699-01/PU691699-01-1.JPG?sw=700&sh=700'),
(12, 'Buzo Fila Comfort Letter III Hombre', 'Fila', 'Buzo', 'Deportiva', 'Hombre', 64999, 'Azul marino', 'Ropa letras', array['S', 'M', 'L', 'XL', 'XXL'], 'Otoño/Invierno', null, 'Buzo Fila Comfort Letter III Hombre. Producto y precio de ejemplo tomados del catálogo online de Dexter.', 'https://www.dexter.com.ar/dw/image/v2/BDTF_PRD/on/demandware.static/-/Sites-365-dabra-catalog/default/dw0484b1ca/products/FIF11L01729-1873/FIF11L01729-1873-1.JPG?sw=700&sh=700'),
(13, 'Buzo adidas Essentials Big Logo Hombre', 'Adidas', 'Buzo', 'Deportiva', 'Hombre', 89999, 'Gris', 'Ropa letras', array['S', 'M', 'L', 'XL', 'XXL'], 'Otoño/Invierno', null, 'Buzo adidas Essentials Big Logo Hombre. Producto y precio de ejemplo tomados del catálogo online de Dexter.', 'https://www.dexter.com.ar/dw/image/v2/BDTF_PRD/on/demandware.static/-/Sites-365-dabra-catalog/default/dw5e723e36/products/ADJE8949/ADJE8949-1.JPG?sw=700&sh=700'),
(14, 'Campera Entrenamiento Topper Joy Hombre', 'Topper', 'Campera', 'Deportiva', 'Hombre', 59999, 'Gris', 'Ropa letras', array['S', 'M', 'L', 'XL', 'XXL'], 'Otoño/Invierno', null, 'Campera Entrenamiento Topper Joy Hombre. Producto y precio de ejemplo tomados del catálogo online de Dexter.', 'https://www.dexter.com.ar/dw/image/v2/BDTF_PRD/on/demandware.static/-/Sites-365-dabra-catalog/default/dwad181f38/products/TO168224/TO168224-1.JPG?sw=700&sh=700'),
(15, 'Campera Running Nike Dri-FIT Stride Hombre', 'Nike', 'Campera', 'Deportiva', 'Hombre', 149999, 'Celeste', 'Ropa letras', array['S', 'M', 'L', 'XL', 'XXL'], 'Otoño/Invierno', null, 'Campera Running Nike Dri-FIT Stride Hombre. Producto y precio de ejemplo tomados del catálogo online de Dexter.', 'https://www.dexter.com.ar/dw/image/v2/BDTF_PRD/on/demandware.static/-/Sites-365-dabra-catalog/default/dwcfeeac5d/products/NIHV4548-474/NIHV4548-474-1.JPG?sw=700&sh=700'),
(16, 'Campera adidas Essentials Climawarm 3 Tiras Hombre', 'Adidas', 'Campera', 'Deportiva', 'Hombre', 124999, 'Verde oliva', 'Ropa letras', array['S', 'M', 'L', 'XL', 'XXL'], 'Otoño/Invierno', null, 'Campera adidas Essentials Climawarm 3 Tiras Hombre. Producto y precio de ejemplo tomados del catálogo online de Dexter.', 'https://www.dexter.com.ar/dw/image/v2/BDTF_PRD/on/demandware.static/-/Sites-365-dabra-catalog/default/dw6b34487e/products/ADKE0248/ADKE0248-1.JPG?sw=700&sh=700'),
(17, 'Remera adidas Essentials Logo Grande Mujer', 'Adidas', 'Remera', 'Deportiva', 'Mujer', 49999, 'Negro', 'Ropa letras', array['XS', 'S', 'M', 'L', 'XL'], 'Primavera/Verano', null, 'Remera adidas Essentials Logo Grande Mujer. Producto y precio de ejemplo tomados del catálogo online de Dexter.', 'https://www.dexter.com.ar/dw/image/v2/BDTF_PRD/on/demandware.static/-/Sites-365-dabra-catalog/default/dwa0f3b0d2/products/ADJC5724/ADJC5724-1.JPG?sw=700&sh=700'),
(18, 'Remera Running Topper Rng Sprint Mujer', 'Topper', 'Remera', 'Deportiva', 'Mujer', 29999, 'Gris', 'Ropa letras', array['XS', 'S', 'M', 'L', 'XL'], 'Primavera/Verano', null, 'Remera Running Topper Rng Sprint Mujer. Producto y precio de ejemplo tomados del catálogo online de Dexter.', 'https://www.dexter.com.ar/dw/image/v2/BDTF_PRD/on/demandware.static/-/Sites-365-dabra-catalog/default/dw7b5c88f5/products/TO168070/TO168070-1.JPG?sw=700&sh=700'),
(19, 'Remera Nike Club Mujer', 'Nike', 'Remera', 'Deportiva', 'Mujer', 59999, 'Negro', 'Ropa letras', array['XS', 'S', 'M', 'L', 'XL'], 'Primavera/Verano', null, 'Remera Nike Club Mujer. Producto y precio de ejemplo tomados del catálogo online de Dexter.', 'https://www.dexter.com.ar/dw/image/v2/BDTF_PRD/on/demandware.static/-/Sites-365-dabra-catalog/default/dwd4a3ebea/products/NIDX7902-010/NIDX7902-010-1.JPG?sw=700&sh=700'),
(20, 'Calza Loop Up Breath Motion Mujer Lift Up Ciclista', 'Loop Up', 'Calza', 'Deportiva', 'Mujer', 39999, 'Negro', 'Ropa letras', array['XS', 'S', 'M', 'L', 'XL'], 'Todo el año', null, 'Calza Loop Up Breath Motion Mujer Lift Up Ciclista. Producto y precio de ejemplo tomados del catálogo online de Dexter.', 'https://www.dexter.com.ar/dw/image/v2/BDTF_PRD/on/demandware.static/-/Sites-365-dabra-catalog/default/dwca05c6da/products/LUI002416WN01/LUI002416WN01-1.JPG?sw=700&sh=700'),
(21, 'Calza Larga Loop Up Aura Blend Mujer Lift Up con bolsillos', 'Loop Up', 'Calza', 'Deportiva', 'Mujer', 34999, 'Celeste', 'Ropa letras', array['XS', 'S', 'M', 'L', 'XL'], 'Todo el año', null, 'Calza Larga Loop Up Aura Blend Mujer Lift Up con bolsillos. Producto y precio de ejemplo tomados del catálogo online de Dexter.', 'https://www.dexter.com.ar/dw/image/v2/BDTF_PRD/on/demandware.static/-/Sites-365-dabra-catalog/default/dwceed3bbf/products/LUI042428WA12/LUI042428WA12-1.JPG?sw=700&sh=700'),
(22, 'Calza Entrenamiento Topper Core Mujer', 'Topper', 'Calza', 'Deportiva', 'Mujer', 39999, 'Negro', 'Ropa letras', array['XS', 'S', 'M', 'L', 'XL'], 'Todo el año', null, 'Calza Entrenamiento Topper Core Mujer. Producto y precio de ejemplo tomados del catálogo online de Dexter.', 'https://www.dexter.com.ar/dw/image/v2/BDTF_PRD/on/demandware.static/-/Sites-365-dabra-catalog/default/dw8c125baa/products/TO168471/TO168471-1.JPG?sw=700&sh=700'),
(23, 'Short Entrenamiento Puma Strong Knit 3 Mujer', 'Puma', 'Short', 'Deportiva', 'Mujer', 43999, 'Negro', 'Ropa letras', array['XS', 'S', 'M', 'L', 'XL'], 'Primavera/Verano', null, 'Short Entrenamiento Puma Strong Knit 3 Mujer. Producto y precio de ejemplo tomados del catálogo online de Dexter.', 'https://www.dexter.com.ar/dw/image/v2/BDTF_PRD/on/demandware.static/-/Sites-365-dabra-catalog/default/dwe85c42af/products/PU526798-01/PU526798-01-1.JPG?sw=700&sh=700'),
(24, 'Short adidas Essentials Small Logo Mujer', 'Adidas', 'Short', 'Deportiva', 'Mujer', 44999, 'Beige', 'Ropa letras', array['XS', 'S', 'M', 'L', 'XL'], 'Primavera/Verano', null, 'Short adidas Essentials Small Logo Mujer. Producto y precio de ejemplo tomados del catálogo online de Dexter.', 'https://www.dexter.com.ar/dw/image/v2/BDTF_PRD/on/demandware.static/-/Sites-365-dabra-catalog/default/dwfd465c89/products/ADJC5699/ADJC5699-1.JPG?sw=700&sh=700'),
(25, 'Buzo Running Topper 1/2 Zip Sprint Mujer', 'Topper', 'Buzo', 'Deportiva', 'Mujer', 69999, 'Gris', 'Ropa letras', array['XS', 'S', 'M', 'L', 'XL'], 'Otoño/Invierno', null, 'Buzo Running Topper 1/2 Zip Sprint Mujer. Producto y precio de ejemplo tomados del catálogo online de Dexter.', 'https://www.dexter.com.ar/dw/image/v2/BDTF_PRD/on/demandware.static/-/Sites-365-dabra-catalog/default/dw809ec6bf/products/TO168068/TO168068-1.JPG?sw=700&sh=700'),
(26, 'Buzo adidas Essentials Big Logo Mujer', 'Adidas', 'Buzo', 'Deportiva', 'Mujer', 99999, 'Violeta', 'Ropa letras', array['XS', 'S', 'M', 'L', 'XL'], 'Otoño/Invierno', null, 'Buzo adidas Essentials Big Logo Mujer. Producto y precio de ejemplo tomados del catálogo online de Dexter.', 'https://www.dexter.com.ar/dw/image/v2/BDTF_PRD/on/demandware.static/-/Sites-365-dabra-catalog/default/dwb042e28d/products/ADKF8346/ADKF8346-1.JPG?sw=700&sh=700'),
(27, 'Buzo Entrenamiento Under Armour Rival Terry Mujer', 'Under Armour', 'Buzo', 'Deportiva', 'Mujer', 54999, 'Negro', 'Ropa letras', array['XS', 'S', 'M', 'L', 'XL'], 'Otoño/Invierno', null, 'Buzo Entrenamiento Under Armour Rival Terry Mujer. Producto y precio de ejemplo tomados del catálogo online de Dexter.', 'https://www.dexter.com.ar/dw/image/v2/BDTF_PRD/on/demandware.static/-/Sites-365-dabra-catalog/default/dwa0e148e0/products/UA1389063-001/UA1389063-001-1.JPG?sw=700&sh=700'),
(28, 'Campera Puma Run Ultraweave de Mujer', 'Puma', 'Campera', 'Deportiva', 'Mujer', 99999, 'Negro', 'Ropa letras', array['XS', 'S', 'M', 'L', 'XL'], 'Otoño/Invierno', null, 'Campera Puma Run Ultraweave de Mujer. Producto y precio de ejemplo tomados del catálogo online de Dexter.', 'https://www.dexter.com.ar/dw/image/v2/BDTF_PRD/on/demandware.static/-/Sites-365-dabra-catalog/default/dw51378a09/products/PU526650-01/PU526650-01-1.JPG?sw=700&sh=700'),
(29, 'Campera Loop Up Rompevientos Aura Blend Mujer', 'Loop Up', 'Campera', 'Deportiva', 'Mujer', 69999, 'Blanco', 'Ropa letras', array['XS', 'S', 'M', 'L', 'XL'], 'Otoño/Invierno', null, 'Campera Loop Up Rompevientos Aura Blend Mujer. Producto y precio de ejemplo tomados del catálogo online de Dexter.', 'https://www.dexter.com.ar/dw/image/v2/BDTF_PRD/on/demandware.static/-/Sites-365-dabra-catalog/default/dw8d5c3905/products/LUI042421WM10/LUI042421WM10-1.JPG?sw=700&sh=700'),
(30, 'Campera Nike Sportswear Classic Wovens Mujer', 'Nike', 'Campera', 'Deportiva', 'Mujer', 149999, 'Azul', 'Ropa letras', array['XS', 'S', 'M', 'L', 'XL'], 'Otoño/Invierno', null, 'Campera Nike Sportswear Classic Wovens Mujer. Producto y precio de ejemplo tomados del catálogo online de Dexter.', 'https://www.dexter.com.ar/dw/image/v2/BDTF_PRD/on/demandware.static/-/Sites-365-dabra-catalog/default/dw8d12b076/products/NIFV6298-461/NIFV6298-461-1.JPG?sw=700&sh=700'),
(31, 'Pantalón adidas Dayready Wide Mujer', 'Adidas', 'Pantalón', 'Deportiva', 'Mujer', 74999, 'Bordó', 'Ropa letras', array['XS', 'S', 'M', 'L', 'XL'], 'Todo el año', null, 'Pantalón adidas Dayready Wide Mujer. Producto y precio de ejemplo tomados del catálogo online de Dexter.', 'https://www.dexter.com.ar/dw/image/v2/BDTF_PRD/on/demandware.static/-/Sites-365-dabra-catalog/default/dw9c17fba1/products/ADKV1159/ADKV1159-1.JPG?sw=700&sh=700'),
(32, 'Pantalón Nike Sportswear Club Fleece Mujer', 'Nike', 'Pantalón', 'Deportiva', 'Mujer', 54999, 'Violeta', 'Ropa letras', array['XS', 'S', 'M', 'L', 'XL'], 'Otoño/Invierno', null, 'Pantalón Nike Sportswear Club Fleece Mujer. Producto y precio de ejemplo tomados del catálogo online de Dexter.', 'https://www.dexter.com.ar/dw/image/v2/BDTF_PRD/on/demandware.static/-/Sites-365-dabra-catalog/default/dw924fdf52/products/NIFN3634-511/NIFN3634-511-1.JPG?sw=700&sh=700'),
(33, 'Pollera Pádel Lotto SP 200 Mujer', 'Lotto', 'Pollera', 'Deportiva', 'Mujer', 29999, 'Rosa', 'Ropa letras', array['XS', 'S', 'M', 'L', 'XL'], 'Primavera/Verano', null, 'Pollera Pádel Lotto SP 200 Mujer. Producto y precio de ejemplo tomados del catálogo online de Dexter.', 'https://www.dexter.com.ar/dw/image/v2/BDTF_PRD/on/demandware.static/-/Sites-365-dabra-catalog/default/dwc290de97/products/LOI0324149WC18/LOI0324149WC18-1.JPG?sw=700&sh=700'),
(34, 'Pollera adidas Tiro Pleated Mujer', 'Adidas', 'Pollera', 'Deportiva', 'Mujer', 44999, 'Rosa', 'Ropa letras', array['XS', 'S', 'M', 'L', 'XL'], 'Primavera/Verano', null, 'Pollera adidas Tiro Pleated Mujer. Producto y precio de ejemplo tomados del catálogo online de Dexter.', 'https://www.dexter.com.ar/dw/image/v2/BDTF_PRD/on/demandware.static/-/Sites-365-dabra-catalog/default/dw2e0996b9/products/ADJG4099/ADJG4099-1.JPG?sw=700&sh=700'),
(35, 'Gorra Puma Class', 'Puma', 'Gorra', 'Deportiva', 'Unisex', 36999, 'Negro', 'Único', array['Único'], 'Primavera/Verano', null, 'Gorra Puma Class. Producto y precio de ejemplo tomados del catálogo online de Dexter.', 'https://www.dexter.com.ar/dw/image/v2/BDTF_PRD/on/demandware.static/-/Sites-365-dabra-catalog/default/dwec4a834f/products/PU026851-01/PU026851-01-1.JPG?sw=700&sh=700'),
(36, 'Gorra adidas New Logo', 'Adidas', 'Gorra', 'Deportiva', 'Unisex', 39999, 'Beige', 'Único', array['Único'], 'Primavera/Verano', null, 'Gorra adidas New Logo. Producto y precio de ejemplo tomados del catálogo online de Dexter.', 'https://www.dexter.com.ar/dw/image/v2/BDTF_PRD/on/demandware.static/-/Sites-365-dabra-catalog/default/dw5800fec9/products/ADKT4752/ADKT4752-1.JPG?sw=700&sh=700'),
(37, 'Pack de Medias Nike Everyday Lightweight x3', 'Nike', 'Medias', 'Deportiva', 'Unisex', 22999, 'Blanco', 'Único', array['Único'], 'Todo el año', null, 'Pack de Medias Nike Everyday Lightweight x3. Producto y precio de ejemplo tomados del catálogo online de Dexter.', 'https://www.dexter.com.ar/dw/image/v2/BDTF_PRD/on/demandware.static/-/Sites-365-dabra-catalog/default/dwc90c29fc/products/NI_SX7678-100/NI_SX7678-100-1.JPG?sw=700&sh=700'),
(38, 'Medias Topper Pack X 3 Soquetes', 'Topper', 'Medias', 'Deportiva', 'Unisex', 11999, 'Surtido', 'Único', array['Único'], 'Todo el año', null, 'Medias Topper Pack X 3 Soquetes. Producto y precio de ejemplo tomados del catálogo online de Dexter.', 'https://www.dexter.com.ar/dw/image/v2/BDTF_PRD/on/demandware.static/-/Sites-365-dabra-catalog/default/dwbb7d41a2/products/TO_160854/TO_160854-1.JPG?sw=700&sh=700'),
(39, 'Camisa Relaxed Fit Lino', 'Zara', 'Camisa', 'De salir', 'Hombre', 149990, 'Beige', 'Ropa letras', array['S', 'M', 'L', 'XL', 'XXL'], 'Primavera/Verano', null, 'Camisa Relaxed Fit Lino, color beige claro. Producto y precio de ejemplo tomados de Zara Argentina.', 'https://static.zara.net/assets/public/8c39/f931/f64948628023/6e8bc1285912/05070142052-000-p/05070142052-000-p.jpg?ts=1762334207368&w=750'),
(40, 'Camisa Regular Fit Estructura Oxford', 'Zara', 'Camisa', 'De salir', 'Hombre', 119990, 'Celeste', 'Ropa letras', array['S', 'M', 'L', 'XL', 'XXL'], 'Todo el año', null, 'Camisa Regular Fit Estructura Oxford, color celeste. Producto y precio de ejemplo tomados de Zara Argentina.', 'https://static.zara.net/assets/public/b4b2/cdcb/0db046d097e9/f0692021cec7/05679402403-p/05679402403-p.jpg?ts=1787122800583&w=750'),
(41, 'Camisa Regular Fit Rayas', 'Zara', 'Camisa', 'De salir', 'Hombre', 119990, 'Blanco', 'Ropa letras', array['S', 'M', 'L', 'XL', 'XXL'], 'Todo el año', null, 'Camisa Regular Fit Rayas, color crudo / beige. Producto y precio de ejemplo tomados de Zara Argentina.', 'https://static.zara.net/assets/public/7e69/960f/6e97409a81bd/87ec5fb495ae/07545274075-p/07545274075-p.jpg?ts=1775661461106&w=750'),
(42, 'Pantalón Lavado Algodón y Lino', 'Zara', 'Pantalón', 'De salir', 'Hombre', 165990, 'Beige', 'Ropa números', array['38', '40', '42', '44', '46', '48', '50'], 'Otoño/Invierno', 'Lino y algodón', 'Pantalón Lavado Algodón y Lino, color gris / natural. Producto y precio de ejemplo tomados de Zara Argentina.', 'https://static.zara.net/assets/public/b551/21af/86cf455cb72b/426e79bcd296/00122304837-p/00122304837-p.jpg?ts=1789053727105&w=750'),
(43, 'Jeans Straight Fit', 'Zara', 'Jean', 'Urbana', 'Hombre', 119990, 'Azul', 'Ropa números', array['38', '40', '42', '44', '46', '48', '50'], 'Todo el año', 'Denim', 'Jeans Straight Fit, color azul. Producto y precio de ejemplo tomados de Zara Argentina.', 'https://static.zara.net/assets/public/cad6/b094/c9d54ae2a607/790a50295590/03991368400-p/03991368400-p.jpg?ts=1789049342128&w=750'),
(44, 'Jeans Regular Fit', 'Zara', 'Jean', 'Urbana', 'Hombre', 119990, 'Negro', 'Ropa números', array['38', '40', '42', '44', '46', '48', '50'], 'Todo el año', 'Denim', 'Jeans Regular Fit, color negro. Producto y precio de ejemplo tomados de Zara Argentina.', 'https://static.zara.net/assets/public/dd39/c3b1/30c54eb2bf5c/60b3b8a075ba/04060350800-p/04060350800-p.jpg?ts=1786021436224&w=750'),
(45, 'Jersey Estructura Mezcla Lana', 'Zara', 'Sweater', 'De salir', 'Hombre', 245990, 'Amarillo', 'Ropa letras', array['S', 'M', 'L', 'XL', 'XXL'], 'Otoño/Invierno', 'Lana', 'Jersey Estructura Mezcla Lana, color amarillo limón. Producto y precio de ejemplo tomados de Zara Argentina.', 'https://static.zara.net/assets/public/adb0/5031/138b4a099ba0/34ab8f500128/05755354320-p/05755354320-p.jpg?ts=1791536634538&w=750'),
(46, 'Jersey Rayas 100 % Lana', 'Zara', 'Sweater', 'De salir', 'Hombre', 205990, 'Surtido', 'Ropa letras', array['S', 'M', 'L', 'XL', 'XXL'], 'Otoño/Invierno', 'Lana', 'Jersey Rayas 100 % Lana, color rayas. Producto y precio de ejemplo tomados de Zara Argentina.', 'https://static.zara.net/assets/public/475d/3366/e23c426ab306/aef235ec8efd/09598337104-p/09598337104-p.jpg?ts=1791536633610&w=750'),
(47, 'Sudadera Cuello Cremallera Básica', 'Zara', 'Buzo', 'Urbana', 'Hombre', 119990, 'Azul', 'Ropa letras', array['S', 'M', 'L', 'XL', 'XXL'], 'Otoño/Invierno', null, 'Sudadera Cuello Cremallera Básica, color azulón. Producto y precio de ejemplo tomados de Zara Argentina.', 'https://static.zara.net/assets/public/44a9/4f1c/b3fd423f9205/9fade66d49b9/04092360420-000-p/04092360420-000-p.jpg?ts=1789640816452&w=750'),
(48, 'Cazadora Denim Regular Fit Cremallera', 'Zara', 'Campera', 'Urbana', 'Hombre', 245990, 'Marrón', 'Ropa letras', array['S', 'M', 'L', 'XL', 'XXL'], 'Otoño/Invierno', 'Denim', 'Cazadora Denim Regular Fit Cremallera, color marrón / topo. Producto y precio de ejemplo tomados de Zara Argentina.', 'https://static.zara.net/assets/public/938a/687b/fb444d7782c4/22663a8a18c3/05585407737-p/05585407737-p.jpg?ts=1773153263643&w=750'),
(49, 'Cazadora Efecto Piel Cuello Combinado', 'Zara', 'Campera', 'De salir', 'Hombre', 369990, 'Marrón', 'Ropa letras', array['S', 'M', 'L', 'XL', 'XXL'], 'Otoño/Invierno', 'Cuero ecológico', 'Cazadora Efecto Piel Cuello Combinado, color marrón oscuro. Producto y precio de ejemplo tomados de Zara Argentina.', 'https://static.zara.net/assets/public/a67d/1bbf/f8fb4309a599/77013e1f2046/03548108716-p/03548108716-p.jpg?ts=1764333073326&w=750'),
(50, 'Camiseta Medium Weight Básica /02', 'Zara', 'Remera', 'Urbana', 'Hombre', 65990, 'Blanco', 'Ropa letras', array['S', 'M', 'L', 'XL', 'XXL'], 'Primavera/Verano', null, 'Camiseta Medium Weight Básica /02, color blanco. Producto y precio de ejemplo tomados de Zara Argentina.', 'https://static.zara.net/assets/public/4237/38e6/e1644da58f18/db962cd9b60c/05584480250-p/05584480250-p.jpg?ts=1790693701110&w=750'),
(51, 'Camiseta Relaxed Fit Estampados Cerámica', 'Zara', 'Remera', 'Urbana', 'Hombre', 79990, 'Blanco', 'Ropa letras', array['S', 'M', 'L', 'XL', 'XXL'], 'Primavera/Verano', null, 'Camiseta Relaxed Fit Estampados Cerámica, color crudo / beige. Producto y precio de ejemplo tomados de Zara Argentina.', 'https://static.zara.net/assets/public/908e/2c88/b1ec481ea8d4/aba3916d0dd2/00962340075-p/00962340075-p.jpg?ts=1788432095180&w=750'),
(52, 'Bermuda Chino Relaxed Fit', 'Zara', 'Short', 'De salir', 'Hombre', 119990, 'Beige', 'Ropa letras', array['S', 'M', 'L', 'XL', 'XXL'], 'Primavera/Verano', null, 'Bermuda Chino Relaxed Fit, color beige. Producto y precio de ejemplo tomados de Zara Argentina.', 'https://static.zara.net/assets/public/d33a/f7da/63d74b1ea391/e671ab3fe016/02342485710-p/02342485710-p.jpg?ts=1791540659564&w=750'),
(53, 'Camisa Satinada Lazadas ZW Collection', 'Zara', 'Camisa', 'De salir', 'Mujer', 119990, 'Blanco', 'Ropa letras', array['XS', 'S', 'M', 'L', 'XL'], 'Todo el año', null, 'Camisa Satinada Lazadas ZW Collection, color blanco roto. Producto y precio de ejemplo tomados de Zara Argentina.', 'https://static.zara.net/assets/public/bbd2/d1e7/b39a450cb9b1/2f3955895d87/04786168250-p/04786168250-p.jpg?ts=1777540762151&w=750'),
(54, 'Camisa Lino 100 % ZW Collection', 'Zara', 'Camisa', 'De salir', 'Mujer', 119990, 'Blanco', 'Ropa letras', array['XS', 'S', 'M', 'L', 'XL'], 'Primavera/Verano', 'Lino', 'Camisa Lino 100 % ZW Collection, color blanco. Producto y precio de ejemplo tomados de Zara Argentina.', 'https://static.zara.net/assets/public/87c6/4e6d/fa6344139b06/b0e0c6b60410/04786030250-p/04786030250-p.jpg?ts=1774267240122&w=750'),
(55, 'Jeans ZW Collection Wide Leg Tiro Alto', 'Zara', 'Jean', 'Urbana', 'Mujer', 119990, 'Azul marino', 'Ropa números', array['36', '38', '40', '42', '44', '46'], 'Todo el año', 'Denim', 'Jeans ZW Collection Wide Leg Tiro Alto, color azul. Producto y precio de ejemplo tomados de Zara Argentina.', 'https://static.zara.net/assets/public/2128/d634/d77746239ad1/f29698c0403e/08307251407-p/08307251407-p.jpg?ts=1757003376718&w=750'),
(56, 'Jeans Z1975 Straight Tiro Medio Rayas', 'Zara', 'Jean', 'Urbana', 'Mujer', 149990, 'Azul', 'Ropa números', array['36', '38', '40', '42', '44', '46'], 'Todo el año', 'Denim', 'Jeans Z1975 Straight Tiro Medio Rayas, color azul medio. Producto y precio de ejemplo tomados de Zara Argentina.', 'https://static.zara.net/assets/public/e21a/0d55/a73e4287ba01/1094690a0e00/07147223427-p/07147223427-p.jpg?ts=1780058768841&w=750'),
(57, 'Pantalón Chino Cinturón Trenzado', 'Zara', 'Pantalón', 'De salir', 'Mujer', 105990, 'Beige', 'Ropa números', array['36', '38', '40', '42', '44', '46'], 'Otoño/Invierno', null, 'Pantalón Chino Cinturón Trenzado, color camel claro. Producto y precio de ejemplo tomados de Zara Argentina.', 'https://static.zara.net/assets/public/4a2d/2a2c/36dd4e12851e/3ec49f32c3cb/02349330743-p/02349330743-p.jpg?ts=1770640443422&w=750'),
(58, 'Pantalón Lino 100 % Aberturas ZW Collection', 'Zara', 'Pantalón', 'De salir', 'Mujer', 149990, 'Blanco', 'Ropa números', array['36', '38', '40', '42', '44', '46'], 'Otoño/Invierno', 'Lino', 'Pantalón Lino 100 % Aberturas ZW Collection, color blanco. Producto y precio de ejemplo tomados de Zara Argentina.', 'https://static.zara.net/assets/public/5d0b/62e7/988c430fb9c3/3a9835a1aa36/01936330250-p/01936330250-p.jpg?ts=1773933782398&w=750'),
(59, 'Falda Midi Recta ZW Collection', 'Zara', 'Pollera', 'De salir', 'Mujer', 149990, 'Blanco', 'Ropa letras', array['XS', 'S', 'M', 'L', 'XL'], 'Primavera/Verano', null, 'Falda Midi Recta ZW Collection, color crudo. Producto y precio de ejemplo tomados de Zara Argentina.', 'https://static.zara.net/assets/public/f472/acc0/e8c34183a3aa/fb5028219d63/09479241712-015-p/09479241712-015-p.jpg?ts=1780653488279&w=750'),
(60, 'Falda Midi Volante ZW Collection', 'Zara', 'Pollera', 'De salir', 'Mujer', 119990, 'Negro', 'Ropa letras', array['XS', 'S', 'M', 'L', 'XL'], 'Primavera/Verano', null, 'Falda Midi Volante ZW Collection, color negro. Producto y precio de ejemplo tomados de Zara Argentina.', 'https://static.zara.net/assets/public/f3ff/f88f/e21a4b66b881/26a465da9f79/02702295800-p/02702295800-p.jpg?ts=1778063262327&w=750'),
(61, 'Jersey Básico Punto Liso', 'Zara', 'Sweater', 'De salir', 'Mujer', 93990, 'Azul', 'Ropa letras', array['XS', 'S', 'M', 'L', 'XL'], 'Otoño/Invierno', null, 'Jersey Básico Punto Liso, color azul tinta. Producto y precio de ejemplo tomados de Zara Argentina.', 'https://static.zara.net/assets/public/382e/7c49/77384e1996ae/5e51c5f6cbb9/08851171430-e1/08851171430-e1.jpg?ts=1779292284744&w=750'),
(62, 'Jersey Punto Cintura Ancha', 'Zara', 'Sweater', 'De salir', 'Mujer', 105990, 'Azul marino', 'Ropa letras', array['XS', 'S', 'M', 'L', 'XL'], 'Otoño/Invierno', null, 'Jersey Punto Cintura Ancha, color azul tinta. Producto y precio de ejemplo tomados de Zara Argentina.', 'https://static.zara.net/assets/public/77b7/e695/47ac47a9baef/6a69b25b3e6e/03920167430-a1/03920167430-a1.jpg?ts=1771247040762&w=750'),
(63, 'Chaqueta Piel 100 % ZW Collection', 'Zara', 'Campera', 'De salir', 'Mujer', 619990, 'Azul', 'Ropa letras', array['XS', 'S', 'M', 'L', 'XL'], 'Otoño/Invierno', 'Cuero', 'Chaqueta Piel 100 % ZW Collection, color azul. Producto y precio de ejemplo tomados de Zara Argentina.', 'https://static.zara.net/assets/public/42ad/6f4b/1a5042f0a7f1/af8868754885/02969244400-p/02969244400-p.jpg?ts=1785747171046&w=750'),
(64, 'Cazadora Efecto Piel', 'Zara', 'Campera', 'De salir', 'Mujer', 245990, 'Negro', 'Ropa letras', array['XS', 'S', 'M', 'L', 'XL'], 'Otoño/Invierno', 'Cuero ecológico', 'Cazadora Efecto Piel, color negro. Producto y precio de ejemplo tomados de Zara Argentina.', 'https://static.zara.net/assets/public/ebb8/2da8/306444f388f2/304d1694d26a/04341742800-000-p/04341742800-000-p.jpg?ts=1767874414292&w=750'),
(65, 'Cazadora Z1975 Denim Cuello Combinado', 'Zara', 'Campera', 'Urbana', 'Mujer', 119990, 'Rosa', 'Ropa letras', array['XS', 'S', 'M', 'L', 'XL'], 'Otoño/Invierno', 'Denim', 'Cazadora Z1975 Denim Cuello Combinado, color rosa. Producto y precio de ejemplo tomados de Zara Argentina.', 'https://static.zara.net/assets/public/b066/7cf2/9f914610ac5f/858dea5f1976/07147231620-p/07147231620-p.jpg?ts=1785942318142&w=750'),
(66, 'Sudadera Básica', 'Zara', 'Buzo', 'Urbana', 'Mujer', 79990, 'Negro', 'Ropa letras', array['XS', 'S', 'M', 'L', 'XL'], 'Otoño/Invierno', null, 'Sudadera Básica, color negro. Producto y precio de ejemplo tomados de Zara Argentina.', 'https://static.zara.net/assets/public/f364/055f/8d384b55b285/f87dccc335db/03880147800-e1/03880147800-e1.jpg?ts=1787319625897&w=750'),
(67, 'Camiseta Algodón', 'Zara', 'Remera', 'Urbana', 'Mujer', 27990, 'Blanco', 'Ropa letras', array['XS', 'S', 'M', 'L', 'XL'], 'Primavera/Verano', 'Algodón', 'Camiseta Algodón, color blanco. Producto y precio de ejemplo tomados de Zara Argentina.', 'https://static.zara.net/assets/public/22c7/6d7f/a9754903825b/505456e5b219/03253320250-p/03253320250-p.jpg?ts=1748966479428&w=750'),
(68, 'Cazadora Corta Acolchada', 'Zara', 'Campera', 'Urbana', 'Mujer', 119990, 'Marrón', 'Ropa letras', array['XS', 'S', 'M', 'L', 'XL'], 'Otoño/Invierno', null, 'Cazadora Corta Acolchada, color marrón. Producto y precio de ejemplo tomados de Zara Argentina.', 'https://static.zara.net/assets/public/1d9b/db19/3a014b5c9244/b70e434006ff/08372066700-p/08372066700-p.jpg?ts=1771415500950&w=750');

-- Subrubros que no existían
insert into subcategorias (categoria_id, nombre)
select distinct c.id, d.subrubro from demo_ropa d join categorias c on c.nombre = d.rubro on conflict do nothing;

-- Productos: costo = precio / 2,1 redondeado a $500 (margen típico de ropa)
insert into productos (nombre, marca_id, categoria_id, subcategoria_id, genero, escala, temporada, material, descripcion, precio_compra, precio_venta, publicado_web)
select d.nombre, m.id, c.id, s.id, d.genero, d.escala, d.temporada, d.material, d.descripcion, round(d.precio / 2.1 / 500) * 500, d.precio, true
from demo_ropa d
join marcas m on m.nombre = d.marca join categorias c on c.nombre = d.rubro
join subcategorias s on s.categoria_id = c.id and s.nombre = d.subrubro
order by d.n;

-- Variantes: cada talle de su escala en el color de la foto
insert into variantes (producto_id, talle_id, color_id)
select p.id, t.id, co.id
from demo_ropa d join productos p on p.nombre = d.nombre
join colores co on co.nombre = d.color
join talles t on t.tipo = d.escala and t.nombre = any(d.talles);

-- Foto (la de la tienda de origen); queda como principal
insert into producto_imagenes (producto_id, url)
select p.id, d.foto from demo_ropa d join productos p on p.nombre = d.nombre;

-- ── Stock: una factura de compra por marca, por curva (más unidades en los talles del medio) ──
select registrar_compra(
  (select jsonb_agg(jsonb_build_object('variante_id', v.id,
      'cantidad', case when d.escala = 'Único' then 6
                       when abs(array_position(d.talles, t.nombre) - (array_length(d.talles, 1) + 1) / 2.0) <= 1 then 4
                       when array_position(d.talles, t.nombre) in (1, array_length(d.talles, 1)) then 1 else 2 end,
      'costo_unitario', p.precio_compra))
     from demo_ropa d join productos p on p.nombre = d.nombre join variantes v on v.producto_id = p.id join talles t on t.id = v.talle_id
    where d.marca = marca.nombre),
  (select id from proveedores where nombre = marca.nombre || ' (demo)'),
  'Factura demo', true, null, 'DEMO-ROPA-' || upper(marca.nombre), current_date - 35)
from (select distinct marca as nombre from demo_ropa) marca;

-- ── Una promoción de ejemplo (el 2do al 50 % en remeras) ──
insert into promociones (nombre, tipo, descuento_pct, prioridad) values ('Remeras: 2do al 50 % (demo)', 'segunda_unidad', 50, 5);
insert into promocion_alcances (promocion_id, categoria_id)
select (select max(id) from promociones), id from categorias where nombre = 'Remera';

-- ── Clientes ──
insert into clientes (nombre, telefono, email, origen, localidad, etiquetas)
select x.n, x.t, null, x.o, x.l, x.e::text[] from (values
  ('Valentina Acosta (demo)', '381 555-1301', 'Instagram', 'San Miguel de Tucumán', '{moda}'),
  ('Lucas Benítez (demo)', '381 555-1302', 'Local', 'Yerba Buena', '{deportiva}'),
  ('Camila Ferreyra (demo)', '381 555-1303', 'WhatsApp', 'San Miguel de Tucumán', '{vip}'),
  ('Nicolás Paz (demo)', '381 555-1304', 'Referido', 'Tafí Viejo', '{}')) x(n, t, o, l, e)
where not exists (select 1 from clientes c where c.nombre = x.n);

-- ── Ventas de las últimas 5 semanas (solo ropa; para que Inicio e Informes tengan datos) ──
do $$
declare v_id bigint; v_var record; v_cuando timestamptz; v_medio bigint; v_cliente bigint; v_cant int;
begin
  perform setseed(0.37);   -- siempre la misma demo
  for v_cuando in select now() - make_interval(days => floor(random() * 33)::int, hours => floor(random() * 8)::int) as c
                    from generate_series(1, 45) order by 1 loop
    select v.id, coalesce(v.precio_venta, p.precio_venta) as precio into v_var
      from variantes v join productos p on p.id = v.producto_id join stock s on s.variante_id = v.id
     where s.cantidad - s.reservado > 0 and p.escala in ('Ropa letras', 'Ropa números', 'Único')
     order by random() * (1 + p.precio_venta / 150000.0) limit 1;
    v_cant := case when random() < 0.2 then 2 else 1 end;
    v_medio := (select id from medios_pago where activo and en_mostrador order by random() limit 1);
    v_cliente := case when random() < 0.45 then (select id from clientes where nombre like '%(demo)' order by random() limit 1) end;
    begin
      v_id := registrar_venta(jsonb_build_array(jsonb_build_object('variante_id', v_var.id, 'cantidad', v_cant, 'precio_unitario', v_var.precio)),
                              jsonb_build_array(jsonb_build_object('medio_pago_id', v_medio)), v_cliente, 0,
                              (array['Local', 'Local', 'Local', 'Instagram', 'WhatsApp'])[1 + floor(random() * 5)::int]);
    exception when others then continue;   -- si justo no alcanza el stock, se saltea
    end;
    update ventas set fecha = v_cuando where id = v_id;
    update pagos set fecha = v_cuando where venta_id = v_id;
    update movimientos_stock set fecha = v_cuando where venta_id = v_id;
  end loop;
end $$;

-- Resumen de lo cargado
select (select count(*) from productos where escala in ('Ropa letras', 'Ropa números', 'Único')) as modelos_de_ropa,
       (select count(*) from variantes v join productos p on p.id = v.producto_id where p.escala in ('Ropa letras', 'Ropa números', 'Único')) as variantes,
       (select count(*) from producto_imagenes i join productos p on p.id = i.producto_id where p.escala in ('Ropa letras', 'Ropa números', 'Único')) as fotos,
       (select sum(s.cantidad) from stock s join variantes v on v.id = s.variante_id join productos p on p.id = v.producto_id where p.escala in ('Ropa letras', 'Ropa números', 'Único')) as unidades_en_stock,
       (select count(*) from ventas) as ventas, (select sum(total) from ventas) as vendido;
commit;
