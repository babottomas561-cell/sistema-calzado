-- BORRAR LA DEMO: deja la base lista para arrancar en serio.
-- Correr así (producción):  npx supabase db query --linked -f supabase/demo/borrar.sql
--
-- Borra TODO el catálogo y la operación (productos, stock, ventas, compras, pedidos), los clientes
-- y proveedores "(demo)", y las tablas maestras que queden sin usar. NO toca: usuarios y su rol,
-- fichas de clientes con cuenta en la tienda, medios de pago ni depósitos. Los números de
-- comprobante vuelven a empezar de 1.
--
-- Es la única excepción a "el stock se toca solo por las funciones": acá se borra todo, movimientos
-- incluidos, así que el stock sigue siendo igual a la suma de sus movimientos (cero y cero).
begin;

-- Operación (de lo que depende a lo que es dependido)
delete from presupuesto_items; delete from presupuestos;
delete from pedido_estados; delete from pedido_items;
update ventas set pedido_id = null where pedido_id is not null;
delete from pedidos;
delete from movimientos_stock;
delete from pagos; delete from venta_items; delete from ventas;
delete from compra_items; delete from compras;
delete from stock;

-- Promociones de la demo (las ventas que las usaban ya se borraron)
delete from promocion_alcances where promocion_id in (select id from promociones where nombre like '%(demo)');
delete from promociones where nombre like '%(demo)';

-- Historial de ajustes masivos de precios (apunta a los artículos)
delete from ajuste_precio_items; delete from ajustes_precios;

-- Catálogo
delete from producto_imagenes; delete from producto_proveedores;
delete from variantes; delete from productos;

-- Contactos de la demo (las fichas de gente con cuenta en la tienda se quedan)
delete from clientes where usuario_id is null and nombre like '%(demo)';
delete from proveedores where nombre like '%(demo)';

-- Maestros que quedaron sin usar
delete from subcategorias s where not exists (select 1 from productos p where p.subcategoria_id = s.id);
delete from categorias c where not exists (select 1 from productos p where p.categoria_id = c.id)
  and not exists (select 1 from subcategorias s where s.categoria_id = c.id);
delete from marcas m where not exists (select 1 from productos p where p.marca_id = m.id);
delete from colores c where not exists (select 1 from variantes v where v.color_id = c.id);
-- (los talles estándar de ropa y el «Único» se conservan: vienen con el sistema)
delete from talles t where t.tipo in ('Adulto', 'Niños', 'Bebé') and not exists (select 1 from variantes v where v.talle_id = t.id);

-- Numeración de comprobantes desde cero
update numeradores set ultimo = 0;

select (select count(*) from productos) as productos, (select count(*) from ventas) as ventas,
       (select count(*) from clientes) as clientes_que_quedan, (select count(*) from perfiles where rol = 'staff') as usuarios_staff;
commit;
