-- SACAR LA ROPA DE MUJER DE LA DEMO: el local es (más que nada) de ropa masculina.
-- Correr así (producción):  npx supabase db query --linked -f supabase/demo/sacar_ropa_de_mujer.sql
--
-- Borra los artículos con género «Mujer» (ropa y calzado) y todo lo que depende de ellos: variantes, fotos,
-- precios de proveedores, su historial de ajustes de precio, stock y sus movimientos, y los documentos de prueba que los usaban (ventas,
-- pedidos y presupuestos de un solo artículo). A las facturas de compra mixtas les saca esos renglones y
-- recalcula el total; las que quedan vacías se borran. Después limpia marcas, rubros, colores y
-- proveedores «(demo)» que quedaron sin usar.
--
-- Como borrar.sql, es una excepción a «el stock se toca solo por las funciones»: se borran el stock y
-- TODOS sus movimientos juntos, así que lo que queda sigue cerrando (stock = suma de movimientos).
-- Si encuentra un documento que mezcla ropa de hombre y de mujer, NO borra nada (hay que mirarlo a mano).
begin;

create temp table _p on commit drop as select id from productos where genero = 'Mujer';
create temp table _v on commit drop as select id from variantes where producto_id in (select id from _p);

do $$
begin
  if exists (select 1 from venta_items a where a.variante_id in (select id from _v)
              and exists (select 1 from venta_items b where b.venta_id = a.venta_id and b.variante_id not in (select id from _v))) then
    raise exception 'Hay ventas que mezclan ropa de mujer con otra: no se borró nada';
  end if;
  if exists (select 1 from pedido_items a where a.variante_id in (select id from _v)
              and exists (select 1 from pedido_items b where b.pedido_id = a.pedido_id and b.variante_id not in (select id from _v))) then
    raise exception 'Hay pedidos que mezclan ropa de mujer con otra: no se borró nada';
  end if;
  if exists (select 1 from presupuesto_items a where a.variante_id in (select id from _v)
              and exists (select 1 from presupuesto_items b where b.presupuesto_id = a.presupuesto_id and b.variante_id not in (select id from _v))) then
    raise exception 'Hay presupuestos que mezclan ropa de mujer con otra: no se borró nada';
  end if;
end $$;

create temp table _ventas on commit drop as select distinct venta_id as id from venta_items where variante_id in (select id from _v);
create temp table _pedidos on commit drop as select distinct pedido_id as id from pedido_items where variante_id in (select id from _v);
create temp table _presupuestos on commit drop as select distinct presupuesto_id as id from presupuesto_items where variante_id in (select id from _v);

-- Documentos de prueba que usaban esos artículos
delete from presupuesto_items where presupuesto_id in (select id from _presupuestos);
delete from presupuestos where id in (select id from _presupuestos);
update ventas set pedido_id = null where id in (select id from _ventas);
delete from pedido_estados where pedido_id in (select id from _pedidos);
delete from pedido_items where pedido_id in (select id from _pedidos);
delete from pedidos where id in (select id from _pedidos);
delete from movimientos_stock where variante_id in (select id from _v);
delete from pagos where venta_id in (select id from _ventas);
delete from venta_items where venta_id in (select id from _ventas);
delete from ventas where id in (select id from _ventas);

-- Facturas de compra: fuera esos renglones; el total vuelve a ser la suma de lo que queda
delete from compra_items where variante_id in (select id from _v);
update compras c set total = x.total
  from (select compra_id, sum(cantidad * costo_unitario) as total from compra_items group by compra_id) x
 where x.compra_id = c.id and c.total <> x.total;
delete from compras c where not exists (select 1 from compra_items ci where ci.compra_id = c.id);

-- Historial de ajustes masivos de precios: fuera esos artículos; un ajuste que queda vacío se borra
delete from ajuste_precio_items where producto_id in (select id from _p);
delete from ajustes_precios a where not exists (select 1 from ajuste_precio_items i where i.ajuste_id = a.id);

-- Catálogo
delete from stock where variante_id in (select id from _v);
delete from promocion_alcances where producto_id in (select id from _p);
delete from producto_imagenes where producto_id in (select id from _p);
delete from producto_proveedores where producto_id in (select id from _p);
delete from variantes where id in (select id from _v);
delete from productos where id in (select id from _p);

-- Maestros y proveedores de la demo que quedaron sin usar
delete from proveedores pr where pr.nombre like '%(demo)'
   and not exists (select 1 from compras c where c.proveedor_id = pr.id)
   and not exists (select 1 from producto_proveedores pp where pp.proveedor_id = pr.id)
   and not exists (select 1 from ajustes_precios a where a.proveedor_id = pr.id);
delete from subcategorias s where not exists (select 1 from productos p where p.subcategoria_id = s.id)
   and not exists (select 1 from promocion_alcances a where a.subcategoria_id = s.id);
delete from categorias c where not exists (select 1 from productos p where p.categoria_id = c.id)
   and not exists (select 1 from subcategorias s where s.categoria_id = c.id)
   and not exists (select 1 from promocion_alcances a where a.categoria_id = c.id);
delete from marcas m where not exists (select 1 from productos p where p.marca_id = m.id)
   and not exists (select 1 from promocion_alcances a where a.marca_id = m.id);
delete from colores c where not exists (select 1 from variantes v where v.color_id = c.id);

-- Controles: si algo no cierra, se deshace todo
do $$
begin
  if exists (select 1 from stock s where s.cantidad <> coalesce((select sum(m.cantidad) from movimientos_stock m
              where m.variante_id = s.variante_id and m.deposito_id = s.deposito_id), 0)) then
    raise exception 'El stock no cierra con sus movimientos: no se borró nada';
  end if;
  if exists (select 1 from stock s where s.reservado <> coalesce((select sum(pi.cantidad) from pedido_items pi join pedidos p on p.id = pi.pedido_id
              where pi.variante_id = s.variante_id and p.deposito_id = s.deposito_id and p.estado not in ('entregado', 'cancelado')), 0)) then
    raise exception 'Lo reservado no coincide con los pedidos abiertos: no se borró nada';
  end if;
  if exists (select 1 from compras c where c.total <> (select sum(ci.cantidad * ci.costo_unitario) from compra_items ci where ci.compra_id = c.id)) then
    raise exception 'Alguna compra quedó con el total mal: no se borró nada';
  end if;
end $$;

select json_build_object(
  'quedan_modelos', (select count(*) from productos),
  'por_genero', (select json_object_agg(coalesce(g, '(sin)'), n) from (select genero g, count(*) n from productos group by 1) x),
  'ventas', (select count(*) from ventas), 'pedidos', (select count(*) from pedidos), 'presupuestos', (select count(*) from presupuestos),
  'compras', (select count(*) from compras), 'marcas', (select string_agg(nombre, ', ' order by nombre) from marcas)) as resultado;
commit;
