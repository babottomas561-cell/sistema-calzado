-- El local vende calzado Y ropa. Lo que cambia en la lógica de la base:
--   · Más escalas de talles: «Ropa letras» (XS…XXXL), «Ropa números» (36…52, jeans y pantalones) y
--     «Único» (accesorios, medias, gorras). Cada artículo sigue aceptando solo talles de su escala.
--   · Cada rubro pertenece a una LÍNEA (Calzado, Ropa, Accesorios): es lo que separa los totales
--     de calzado y de ropa en los informes.
--   · Datos propios de la ropa en el artículo: temporada y material (opcionales).
--   · Las vistas de stock, de ventas (informes) y de la tienda exponen escala, línea y temporada, así los
--     informes agrupan por talle SIN mezclar el «38» de calzado con el «38» de jeans.
--   · Los textos de la tienda (título, bajada) se configuran en Tablas → Tienda, no van escritos a mano.

-- ── Escalas ──────────────────────────────────────────────────────────
alter table public.talles drop constraint talles_tipo_check;
alter table public.talles add constraint talles_tipo_check
  check (tipo in ('Adulto', 'Niños', 'Bebé', 'Ropa letras', 'Ropa números', 'Único'));
alter table public.productos drop constraint productos_escala_check;
alter table public.productos add constraint productos_escala_check
  check (escala in ('Adulto', 'Niños', 'Bebé', 'Ropa letras', 'Ropa números', 'Único'));

-- Talles de ropa de uso común (se agregan más en Tablas); el orden es el de góndola
insert into public.talles (nombre, orden, tipo) values
  ('XS', 1001, 'Ropa letras'), ('S', 1002, 'Ropa letras'), ('M', 1003, 'Ropa letras'), ('L', 1004, 'Ropa letras'),
  ('XL', 1005, 'Ropa letras'), ('XXL', 1006, 'Ropa letras'), ('XXXL', 1007, 'Ropa letras'),
  ('36', 36, 'Ropa números'), ('38', 38, 'Ropa números'), ('40', 40, 'Ropa números'), ('42', 42, 'Ropa números'),
  ('44', 44, 'Ropa números'), ('46', 46, 'Ropa números'), ('48', 48, 'Ropa números'), ('50', 50, 'Ropa números'),
  ('52', 52, 'Ropa números'),
  ('Único', 2000, 'Único')
on conflict do nothing;

-- Orden de las escalas para listar y agrupar (calzado primero, después ropa)
create or replace function public.orden_escala(p_escala text) returns int
language sql immutable set search_path = public as $$
  select coalesce(array_position(array['Adulto', 'Niños', 'Bebé', 'Ropa letras', 'Ropa números', 'Único'], p_escala), 99) $$;
grant execute on function public.orden_escala to anon, authenticated;

-- buscar_talle: acepta las escalas nuevas. Sin escala: número menor a 35 = Niños, mayor = Adulto, letras = Ropa letras.
create or replace function public.buscar_talle(p_nombre text, p_escala text default null) returns bigint
language plpgsql set search_path = public as $$
declare v_id bigint; v_n text := upper(replace(trim(p_nombre), ',', '.'));
        v_num numeric := case when v_n ~ '^[0-9]+([.][0-9]+)?$' then v_n::numeric end;
        v_escala text := coalesce(p_escala, case when v_num is null then 'Ropa letras' when v_num < 35 then 'Niños' else 'Adulto' end);
begin
  if v_escala not in ('Adulto', 'Niños', 'Bebé', 'Ropa letras', 'Ropa números', 'Único') then raise exception 'Escala de talles inválida'; end if;
  select id into v_id from talles where upper(nombre) = v_n and tipo = v_escala;
  if v_id is null then
    insert into talles (nombre, orden, tipo)
    values (v_n, case when v_num is not null then v_num
                      when v_escala = 'Único' then 2000
                      else 1000 + coalesce(array_position(array['XS','S','M','L','XL','XXL','XXXL'], v_n), 50) end, v_escala)
    returning id into v_id;
  end if;
  return v_id;
end $$;

-- ── Línea del rubro ──────────────────────────────────────────────────
alter table public.categorias add column linea text not null default 'Calzado' check (linea in ('Calzado', 'Ropa', 'Accesorios'));

-- ── Ficha de ropa ────────────────────────────────────────────────────
alter table public.productos
  add column temporada text check (temporada in ('Primavera/Verano', 'Otoño/Invierno', 'Todo el año')),
  add column material text;

-- ── Vistas: se agregan columnas al final (create or replace), lo que ya se usa no cambia ──
-- Catálogo público: temporada y material
create or replace view public.v_catalogo as
select v.id as variante_id, p.id as producto_id, p.nombre, m.nombre as marca, c.nombre as categoria,
       p.genero, p.escala, p.descripcion, p.imagen_url, t.nombre as talle, t.orden as talle_orden, co.nombre as color, co.hex as color_hex,
       coalesce(v.precio_venta, p.precio_venta) as precio,
       greatest(coalesce(sum(s.cantidad - s.reservado), 0), 0)::int as disponible,
       p.temporada, p.material
from variantes v
join productos p on p.id = v.producto_id
join talles t on t.id = v.talle_id
join colores co on co.id = v.color_id
left join marcas m on m.id = p.marca_id
left join categorias c on c.id = p.categoria_id
left join stock s on s.variante_id = v.id
where p.publicado_web and p.activo
group by v.id, p.id, m.nombre, c.nombre, t.nombre, t.orden, co.nombre, co.hex;

-- Stock: escala, género, temporada y línea (para el informe de stock valorizado)
create or replace view public.v_stock with (security_invoker = false) as
select v.id as variante_id, p.id as producto_id, p.codigo, p.nombre, m.nombre as marca, c.nombre as categoria,
       t.nombre as talle, t.orden as talle_orden, co.nombre as color, co.hex as color_hex,
       v.sku, d.id as deposito_id, d.nombre as deposito,
       coalesce(s.cantidad, 0) as stock, coalesce(s.reservado, 0) as reservado,
       coalesce(s.cantidad, 0) - coalesce(s.reservado, 0) as disponible, v.stock_minimo,
       case when tiene_permiso('costos.ver') then p.precio_compra end as precio_compra,
       coalesce(v.precio_venta, p.precio_venta) as precio_venta,
       case when tiene_permiso('costos.ver') then coalesce(s.cantidad, 0) * p.precio_compra end as valor_costo,
       coalesce(s.cantidad, 0) - coalesce(s.reservado, 0) <= v.stock_minimo as stock_bajo,
       p.escala, p.genero, p.temporada, c.linea
from variantes v
join productos p on p.id = v.producto_id
join talles t on t.id = v.talle_id
join colores co on co.id = v.color_id
cross join depositos d
left join stock s on s.variante_id = v.id and s.deposito_id = d.id
left join marcas m on m.id = p.marca_id
left join categorias c on c.id = p.categoria_id
where tiene_permiso('stock.ver') or tiene_permiso('ventas.registrar');

-- Hechos de venta (informes): escala, temporada, material y línea
create or replace view public.v_hechos_ventas with (security_invoker = false) as
select vi.id, ve.id as venta_id, ve.comprobante, ve.fecha, (ve.fecha at time zone 'America/Argentina/Buenos_Aires')::date as dia,
       extract(year from ve.fecha at time zone 'America/Argentina/Buenos_Aires')::int as anio,
       extract(month from ve.fecha at time zone 'America/Argentina/Buenos_Aires')::int as mes,
       extract(isodow from ve.fecha at time zone 'America/Argentina/Buenos_Aires')::int as dia_semana,
       ve.canal, d.nombre as deposito, cl.codigo as cliente_codigo, cl.nombre as cliente, cl.origen as cliente_origen,
       ve.usuario_id as vendedor_id, coalesce(pe.nombre, 'Sin registrar') as vendedor,
       p.codigo as articulo, p.nombre as modelo, m.nombre as marca, ca.codigo as rubro_codigo, ca.nombre as rubro,
       sc.nombre as subrubro, p.genero,
       t.nombre as talle, t.orden as talle_orden, co.nombre as color, v.sku,
       vi.cantidad, vi.precio_unitario, vi.descuento_promo, vi.promocion_id, coalesce(pr.nombre, 'Sin promoción') as promocion,
       case when tiene_permiso('costos.ver') then vi.costo_unitario end as costo_unitario,
       vi.cantidad * vi.precio_unitario as importe,
       case when tiene_permiso('costos.ver') then vi.cantidad * vi.costo_unitario end as costo,
       case when tiene_permiso('costos.ver') then vi.cantidad * (vi.precio_unitario - vi.costo_unitario) - vi.descuento_promo end as margen,
       round((vi.cantidad * vi.precio_unitario - vi.descuento_promo) * ve.total / nullif(ve.subtotal - ve.descuento_promociones, 0), 2) as importe_neto,
       case when tiene_permiso('costos.ver') then
         round((vi.cantidad * vi.precio_unitario - vi.descuento_promo) * ve.total / nullif(ve.subtotal - ve.descuento_promociones, 0)
               - vi.cantidad * vi.costo_unitario, 2) end as margen_neto,
       ve.pedido_id is not null as vino_de_pedido,
       p.escala, p.temporada, p.material, ca.linea
from venta_items vi
join ventas ve on ve.id = vi.venta_id
join depositos d on d.id = ve.deposito_id
left join clientes cl on cl.id = ve.cliente_id
left join perfiles pe on pe.id = ve.usuario_id
left join promociones pr on pr.id = vi.promocion_id
join variantes v on v.id = vi.variante_id
join productos p on p.id = v.producto_id
left join marcas m on m.id = p.marca_id
left join categorias ca on ca.id = p.categoria_id
left join subcategorias sc on sc.id = p.subcategoria_id
join talles t on t.id = v.talle_id
join colores co on co.id = v.color_id
where tiene_permiso('informes.ventas') or tiene_permiso('ventas.ver_todas');

-- ── Textos de la tienda ──────────────────────────────────────────────
alter table public.configuracion_tienda
  add column titulo_inicio text not null default 'Elegí lo que más te gusta',
  add column bajada_inicio text not null default 'Elegí tu modelo y tu talle. Retirás en el local o te lo enviamos.';
update public.configuracion_tienda set nombre = 'Mi Tienda' where nombre = 'Mi Calzado';
