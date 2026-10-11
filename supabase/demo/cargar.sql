-- DATOS DEMO: catálogo de zapatillas y ojotas Nike/Adidas con precios de lista reales de las
-- tiendas oficiales argentinas (octubre 2026), fotos oficiales (links a sus CDNs, no se copian),
-- stock cargado por facturas de compra y algunas ventas de las últimas semanas para los informes.
--
-- Es para mostrar y probar. Se borra con supabase/demo/borrar.sql antes de arrancar en serio.
-- Correr así (producción):  npx supabase db query --linked -f supabase/demo/cargar.sql
--
-- Respeta las reglas del sistema: el stock entra por registrar_compra y sale por registrar_venta
-- (quedan los movimientos), los códigos los genera la base y nada se escribe con un id a mano.
begin;

-- Las funciones de stock exigen ser del equipo: se actúa como el primer usuario staff
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from perfiles where rol = 'staff' order by id limit 1), 'role', 'authenticated')::text, true);
do $$ begin
  if not es_staff() then raise exception 'No hay ningún usuario staff: marcá uno antes de cargar la demo'; end if;
  if exists (select 1 from productos) then raise exception 'Ya hay productos cargados: la demo se carga sobre una base vacía (corré borrar.sql)'; end if;
end $$;

-- ── Tablas maestras ──
insert into categorias (nombre) values ('Zapatilla'), ('Ojota') on conflict do nothing;
insert into subcategorias (categoria_id, nombre)
select c.id, s.nombre from (values ('Zapatilla', 'Urbana'), ('Zapatilla', 'Running'), ('Zapatilla', 'Plataforma'), ('Ojota', 'Slide')) s(rubro, nombre)
join categorias c on c.nombre = s.rubro on conflict do nothing;
insert into marcas (nombre) values ('Nike'), ('Adidas') on conflict do nothing;
insert into colores (nombre, hex) values ('Blanco', '#f5f5f5'), ('Negro', '#111111') on conflict do nothing;
insert into talles (nombre, orden) select t::text, t from generate_series(35, 45) t on conflict do nothing;
insert into proveedores (nombre) values ('Nike Argentina (demo)'), ('Adidas Argentina (demo)');

-- ── Modelos ──
create temp table demo_modelos (
  n int, nombre text, marca text, rubro text, subrubro text, genero text, precio numeric, colores text[],
  talle_desde int, talle_hasta int, descripcion text, fotos text[]
) on commit drop;

insert into demo_modelos values
(1, 'Nike Dunk Low Retro', 'Nike', 'Zapatilla', 'Urbana', 'Hombre', 259999, '{Blanco}', 39, 45,
 'La clásica de básquet de los 80 convertida en ícono urbano. Capellada de cuero, suela de goma con tracción y perfil bajo.',
 array['https://nikearprod.vtexassets.com/arquivos/ids/1335208-800-800/HF5441-100-A-1_PREM.jpg', 'https://nikearprod.vtexassets.com/arquivos/ids/1338542-800-800/HF5441-100-B-2_PREM.jpg',
       'https://nikearprod.vtexassets.com/arquivos/ids/1343579-800-800/HF5441-100-C-3_PREM.jpg', 'https://nikearprod.vtexassets.com/arquivos/ids/1347147-800-800/HF5441-100-D-4_PREM.jpg',
       'https://nikearprod.vtexassets.com/arquivos/ids/1350535-800-800/HF5441-100-E-5_PREM.jpg']),
(2, 'Nike Dunk Low', 'Nike', 'Zapatilla', 'Urbana', 'Mujer', 259999, '{Blanco}', 35, 40,
 'La Dunk de siempre en horma de mujer: cuero, puntera perforada para que respire y una suela que acompaña todo el día.',
 array['https://nikearprod.vtexassets.com/arquivos/ids/378645-800-800/DD1503_101_A_PREM.jpg', 'https://nikearprod.vtexassets.com/arquivos/ids/381142-800-800/DD1503_101_B_PREM.jpg',
       'https://nikearprod.vtexassets.com/arquivos/ids/383601-800-800/DD1503_101_C_PREM.jpg', 'https://nikearprod.vtexassets.com/arquivos/ids/386063-800-800/DD1503_101_D_PREM.jpg',
       'https://nikearprod.vtexassets.com/arquivos/ids/388482-800-800/DD1503_101_E_PREM.jpg']),
(3, 'Nike Air Force 1 ''07', 'Nike', 'Zapatilla', 'Urbana', 'Hombre', 259999, '{Blanco}', 39, 45,
 'El clásico total blanco. Cuero, cámara de aire en el talón y la suela gruesa que la hizo famosa.',
 array['https://nikearprod.vtexassets.com/arquivos/ids/155411-800-800/CW2288_111_A_PREM-hei-3144-wid-3144-fmt.jpg', 'https://nikearprod.vtexassets.com/arquivos/ids/159437-800-800/CW2288_111_B_PREM-hei-3144-wid-3144-fmt.jpg',
       'https://nikearprod.vtexassets.com/arquivos/ids/163454-800-800/CW2288_111_C_PREM-hei-3144-wid-3144-fmt.jpg', 'https://nikearprod.vtexassets.com/arquivos/ids/167396-800-800/CW2288_111_D_PREM-hei-3144-wid-3144-fmt.jpg']),
(4, 'Nike Pegasus 42', 'Nike', 'Zapatilla', 'Running', 'Hombre', 309999, '{Negro}', 39, 45,
 'Para correr todos los días: espuma reactiva, buena amortiguación y una capellada liviana que ventila.',
 array['https://nikearprod.vtexassets.com/arquivos/ids/1839648-800-800/IB1873-001_A_PREM.jpg', 'https://nikearprod.vtexassets.com/arquivos/ids/1840899-800-800/IB1873-001_B_PREM.jpg',
       'https://nikearprod.vtexassets.com/arquivos/ids/1842150-800-800/IB1873-001_C_PREM.jpg', 'https://nikearprod.vtexassets.com/arquivos/ids/1843401-800-800/IB1873-001_D_PREM.jpg']),
(5, 'Nike Pegasus 42 Mujer', 'Nike', 'Zapatilla', 'Running', 'Mujer', 309999, '{Blanco}', 35, 40,
 'La Pegasus en horma de mujer: amortiguación reactiva para entrenar o salir a correr todos los días.',
 array['https://nikearprod.vtexassets.com/arquivos/ids/1920943-800-800']),
(6, 'Adidas Samba OG', 'Adidas', 'Zapatilla', 'Urbana', 'Unisex', 199999, '{Blanco,Negro}', 36, 44,
 'La Samba original: capellada de cuero, puntera de gamuza en T y suela de goma color caramelo.',
 array['https://assets.adidas.com/images/w_800,h_800,f_auto,q_auto,fl_lossy,c_fill,g_auto/3bbecbdf584e40398446a8bf0117cf62_9366/ZAPATILLAS_SAMBA_OG_Blanco_B75806_01_00_standard.jpg',
       'https://assets.adidas.com/images/w_800,h_800,f_auto,q_auto,fl_lossy,c_fill,g_auto/97cd0902ae2e402b895aa8bf0117f98f_9366/ZAPATILLAS_SAMBA_OG_Blanco_B75806_03_standard.jpg',
       'https://assets.adidas.com/images/w_800,h_800,f_auto,q_auto,fl_lossy,c_fill,g_auto/4c70105150234ac4b948a8bf01187e0c_9366/ZAPATILLAS_SAMBA_OG_Negro_B75807_01_standard.jpg',
       'https://assets.adidas.com/images/w_800,h_800,f_auto,q_auto,fl_lossy,c_fill,g_auto/a3ffa88f92a74c6d9979a8bf0118b9d0_9366/ZAPATILLAS_SAMBA_OG_Negro_B75807_03_standard.jpg']),
(7, 'Adidas Samba OG Mujer', 'Adidas', 'Zapatilla', 'Urbana', 'Mujer', 219999, '{Blanco}', 35, 40,
 'La Samba en horma de mujer, con los detalles de siempre: cuero, gamuza y suela de goma.',
 array['https://assets.adidas.com/images/w_800,h_800,f_auto,q_auto,fl_lossy,c_fill,g_auto/c4c40e00c39d444fa8e365f82b5a6291_9366/Zapatillas_Samba_OG_Blanco_KZ8197_01_00_standard.jpg',
       'https://assets.adidas.com/images/w_800,h_800,f_auto,q_auto,fl_lossy,c_fill,g_auto/303de8fe33c64ac8bbf0a185c1bc4ff1_9366/Zapatillas_Samba_OG_Blanco_KZ8197_02_standard.jpg',
       'https://assets.adidas.com/images/w_800,h_800,f_auto,q_auto,fl_lossy,c_fill,g_auto/d10858d1f17e44508e19a39be503a7f6_9366/Zapatillas_Samba_OG_Blanco_KZ8197_03_standard.jpg',
       'https://assets.adidas.com/images/w_800,h_800,f_auto,q_auto,fl_lossy,c_fill,g_auto/d9dc04e2873444d6a8b5d09208d18130_9366/Zapatillas_Samba_OG_Blanco_KZ8197_04_standard.jpg']),
(8, 'Adidas Gazelle Indoor', 'Adidas', 'Zapatilla', 'Urbana', 'Hombre', 189999, '{Negro}', 39, 45,
 'La Gazelle de entrenamiento indoor de los 70: gamuza suave, las 3 tiras en contraste y suela de goma translúcida.',
 array['https://assets.adidas.com/images/w_800,h_800,f_auto,q_auto,fl_lossy,c_fill,g_auto/73f2b1c3e16f423fa300baed88e28b87_9366/Zapatillas_Gazelle_Indoor_Negro_JI2060_01_standard.jpg',
       'https://assets.adidas.com/images/w_800,h_800,f_auto,q_auto,fl_lossy,c_fill,g_auto/d01902e9c6d144b793f357af25c98987_9366/Zapatillas_Gazelle_Indoor_Negro_JI2060_02_standard.jpg',
       'https://assets.adidas.com/images/w_800,h_800,f_auto,q_auto,fl_lossy,c_fill,g_auto/afe430ede4a14b998314de0d6e2e92be_9366/Zapatillas_Gazelle_Indoor_Negro_JI2060_03_standard.jpg',
       'https://assets.adidas.com/images/w_800,h_800,f_auto,q_auto,fl_lossy,c_fill,g_auto/e749e5539954434d9e28b014df940531_9366/Zapatillas_Gazelle_Indoor_Negro_JI2060_04_standard.jpg']),
(9, 'Adidas Gazelle Bold', 'Adidas', 'Zapatilla', 'Plataforma', 'Mujer', 199999, '{Negro}', 35, 40,
 'La Gazelle con plataforma triple: gamuza, 3 tiras y unos centímetros extra de altura.',
 array['https://assets.adidas.com/images/w_800,h_800,f_auto,q_auto,fl_lossy,c_fill,g_auto/55b640477c7c44dcbce23556aebe6d8e_9366/Zapatillas_Gazelle_Bold_Negro_IE0876_01_standard.jpg',
       'https://assets.adidas.com/images/w_800,h_800,f_auto,q_auto,fl_lossy,c_fill,g_auto/4df5967b213f419e83c2f3228dad333d_9366/Zapatillas_Gazelle_Bold_Negro_IE0876_03_standard.jpg',
       'https://assets.adidas.com/images/w_800,h_800,f_auto,q_auto,fl_lossy,c_fill,g_auto/416f3be7075f43de99474eb2e2d9a71e_9366/Zapatillas_Gazelle_Bold_Negro_IE0876_04_standard.jpg',
       'https://assets.adidas.com/images/w_800,h_800,f_auto,q_auto,fl_lossy,c_fill,g_auto/1d55daf1bd1840a9bc5da8785393c7c5_9366/Zapatillas_Gazelle_Bold_Negro_IE0876_05_standard.jpg']),
(10, 'Adidas Campus 00s', 'Adidas', 'Zapatilla', 'Urbana', 'Hombre', 179999, '{Negro}', 39, 45,
 'Inspirada en la Campus de los 80, con proporciones más anchas: gamuza, cordones gruesos y suela de goma.',
 array['https://assets.adidas.com/images/w_800,h_800,f_auto,q_auto,fl_lossy,c_fill,g_auto/eba58cb1e1d942a4b0fa70bca001033c_9366/Zapatillas_Campus_00s_Negro_KH9599_01_00_standard.jpg',
       'https://assets.adidas.com/images/w_800,h_800,f_auto,q_auto,fl_lossy,c_fill,g_auto/7b854f38fdba46fbbc24e625632d59e6_9366/Zapatillas_Campus_00s_Negro_KH9599_03_standard.jpg',
       'https://assets.adidas.com/images/w_800,h_800,f_auto,q_auto,fl_lossy,c_fill,g_auto/596190a435e6494d83343150e45b01f2_9366/Zapatillas_Campus_00s_Negro_KH9599_04_standard.jpg',
       'https://assets.adidas.com/images/w_800,h_800,f_auto,q_auto,fl_lossy,c_fill,g_auto/501f872c53fb44fd9f79bb8c8f5d57cc_9366/Zapatillas_Campus_00s_Negro_KH9599_05_standard.jpg']),
(11, 'Adidas Adilette Aqua', 'Adidas', 'Ojota', 'Slide', 'Unisex', 49999, '{Blanco}', 36, 44,
 'La ojota para la pileta y la ducha: secado rápido, plantilla blanda y las 3 tiras de siempre.',
 array['https://assets.adidas.com/images/w_800,h_800,f_auto,q_auto,fl_lossy,c_fill,g_auto/d7b3f89831c24619920ca9b4016580b7_9366/Ojotas_adilette_Aqua_Blanco_F35539_01_standard.jpg',
       'https://assets.adidas.com/images/w_800,h_800,f_auto,q_auto,fl_lossy,c_fill,g_auto/b14176fe2fed43718a51a9b40165a2c2_9366/Ojotas_adilette_Aqua_Blanco_F35539_03_standard.jpg',
       'https://assets.adidas.com/images/w_800,h_800,f_auto,q_auto,fl_lossy,c_fill,g_auto/6359ec2a52ab4b09b1eaa9b40165c7be_9366/Ojotas_adilette_Aqua_Blanco_F35539_04_standard.jpg']),
(12, 'Adidas Ojotas Campus 00s', 'Adidas', 'Ojota', 'Slide', 'Mujer', 89999, '{Negro}', 35, 40,
 'El look Campus en versión ojota: gamuza, 3 tiras y una suela cómoda para el verano.',
 array['https://assets.adidas.com/images/w_800,h_800,f_auto,q_auto,fl_lossy,c_fill,g_auto/8d2bd3a6504247bf886d7396e3d36d76_9366/Ojotas_Campus_00S_Negro_IH1626_01_00_standard.jpg',
       'https://assets.adidas.com/images/w_800,h_800,f_auto,q_auto,fl_lossy,c_fill,g_auto/3bab9cfa43064ae0a2e32e87fa91e740_9366/Ojotas_Campus_00S_Negro_IH1626_03_standard.jpg',
       'https://assets.adidas.com/images/w_800,h_800,f_auto,q_auto,fl_lossy,c_fill,g_auto/fc8200d621d84cdc8e66d0e79ba7b14f_9366/Ojotas_Campus_00S_Negro_IH1626_04_standard.jpg']);

-- Productos: el costo es el precio de lista dividido 1,9 (margen típico de un revendedor), redondeado a $1.000
insert into productos (nombre, marca_id, categoria_id, subcategoria_id, genero, descripcion, precio_compra, precio_venta, publicado_web)
select d.nombre, m.id, c.id, s.id, d.genero, d.descripcion, round(d.precio / 1.9 / 1000) * 1000, d.precio, true
from demo_modelos d
join marcas m on m.nombre = d.marca join categorias c on c.nombre = d.rubro
join subcategorias s on s.categoria_id = c.id and s.nombre = d.subrubro
order by d.n;

-- Variantes: cada talle de su horma × cada color
insert into variantes (producto_id, talle_id, color_id)
select p.id, t.id, co.id
from demo_modelos d join productos p on p.nombre = d.nombre
cross join unnest(d.colores) col join colores co on co.nombre = col
join talles t on t.orden between d.talle_desde and d.talle_hasta;

-- Galería: la primera foto queda como principal (lo resuelve la base)
insert into producto_imagenes (producto_id, url)
select p.id, f.url from demo_modelos d join productos p on p.nombre = d.nombre
cross join unnest(d.fotos) with ordinality f(url, i) order by p.id, f.i;

-- ── Stock: una factura de compra por marca, por curva (más pares en los talles del medio) ──
select registrar_compra(
  (select jsonb_agg(jsonb_build_object('variante_id', v.id,
      'cantidad', case when t.orden between (d.talle_desde + d.talle_hasta) / 2 - 1 and (d.talle_desde + d.talle_hasta) / 2 + 1 then 4
                       when t.orden in (d.talle_desde, d.talle_hasta) then 1 else 2 end,
      'costo_unitario', p.precio_compra))
     from demo_modelos d join productos p on p.nombre = d.nombre join variantes v on v.producto_id = p.id join talles t on t.id = v.talle_id
    where d.marca = marca.nombre),
  (select id from proveedores where nombre = marca.nombre || ' Argentina (demo)'),
  'Factura demo', true, null, 'DEMO-' || upper(marca.nombre), current_date - 40)
from (values ('Nike'), ('Adidas')) marca(nombre);

-- ── Clientes ──
insert into clientes (nombre, telefono, email, origen, localidad, etiquetas) values
  ('Martina López (demo)', '381 555-1201', null, 'Instagram', 'San Miguel de Tucumán', '{sneakers}'),
  ('Joaquín Díaz (demo)', '381 555-1202', null, 'Local', 'Yerba Buena', '{running}'),
  ('Sofía Romero (demo)', '381 555-1203', null, 'WhatsApp', 'San Miguel de Tucumán', '{}'),
  ('Tomás Herrera (demo)', '381 555-1204', null, 'Referido', 'Tafí Viejo', '{vip}');

-- ── Ventas de las últimas 4 semanas (para que Inicio e Informes tengan datos) ──
-- Se registran con registrar_venta (descuenta stock y deja movimientos) y después se les pone
-- una fecha del pasado (la fecha no toca el stock).
do $$
declare v_id bigint; v_var record; v_cuando timestamptz; v_medio bigint; v_cliente bigint; v_cant int;
begin
  perform setseed(0.42);   -- siempre la misma demo
  -- Primero se sortean los momentos y se registran de la más vieja a la más nueva,
  -- así los números de comprobante quedan en orden con las fechas
  for v_cuando in select now() - make_interval(days => floor(random() * 28)::int, hours => floor(random() * 8)::int) as c
                    from generate_series(1, 34) order by 1 loop
    -- una variante con stock, más probable en los modelos baratos
    select v.id, coalesce(v.precio_venta, p.precio_venta) as precio into v_var
      from variantes v join productos p on p.id = v.producto_id join stock s on s.variante_id = v.id
     where s.cantidad - s.reservado > 0
     order by random() * (1 + p.precio_venta / 200000.0) limit 1;
    v_cant := case when random() < 0.15 then 2 else 1 end;
    v_medio := (select id from medios_pago where activo and en_mostrador order by random() limit 1);
    v_cliente := case when random() < 0.45 then (select id from clientes where nombre like '%(demo)' order by random() limit 1) end;
    begin
      v_id := registrar_venta(jsonb_build_array(jsonb_build_object('variante_id', v_var.id, 'cantidad', v_cant, 'precio_unitario', v_var.precio)),
                              jsonb_build_array(jsonb_build_object('medio_pago_id', v_medio)), v_cliente, 0,
                              (array['Local', 'Local', 'Local', 'Instagram', 'WhatsApp'])[1 + floor(random() * 5)::int]);
    exception when others then continue;   -- si justo no alcanza el stock, se saltea
    end;
    -- La fecha no toca el stock: la venta, sus pagos y sus movimientos pasan a ese momento
    update ventas set fecha = v_cuando where id = v_id;
    update pagos set fecha = v_cuando where venta_id = v_id;
    update movimientos_stock set fecha = v_cuando where venta_id = v_id;
  end loop;
end $$;

-- Resumen de lo cargado
select (select count(*) from productos) as modelos, (select count(*) from variantes) as variantes,
       (select count(*) from producto_imagenes) as fotos, (select sum(cantidad) from stock) as pares_en_stock,
       (select count(*) from ventas) as ventas, (select sum(total) from ventas) as vendido;
commit;
