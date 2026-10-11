-- Datos de ejemplo — SOLO para la base local de prueba (`npx supabase db reset`).
-- En producción no se corren: Lucas carga sus productos reales.
--
-- Usuarios de prueba (solo existen en la base local):
--   admin@demo.local   / demo1234   → equipo (staff): entra al panel /admin
--   cliente@demo.local / demo1234   → cliente: compra en la tienda y sigue sus pedidos

create extension if not exists pgcrypto;

-- Crea un usuario de Supabase Auth con contraseña (forma estándar para datos locales)
create or replace function pg_temp.crear_usuario(p_id uuid, p_email text, p_nombre text) returns void language sql as $$
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change, email_change_token_new)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email,
          crypt('demo1234', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}',
          jsonb_build_object('nombre', p_nombre), now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), p_id, p_id::text, jsonb_build_object('sub', p_id::text, 'email', p_email), 'email', now(), now(), now());
$$;

select pg_temp.crear_usuario('11111111-1111-1111-1111-111111111111', 'admin@demo.local', 'Lucas (admin)');
select pg_temp.crear_usuario('22222222-2222-2222-2222-222222222222', 'cliente@demo.local', 'Cliente Demo');

-- El trigger los creó como clientes: el admin pasa a ser del equipo y no necesita ficha de cliente
update perfiles set rol = 'staff', rol_id = (select id from roles where todos) where id = '11111111-1111-1111-1111-111111111111';
-- Una cajera para probar los permisos (ve stock y vende, no ve costos)
select pg_temp.crear_usuario('33333333-3333-3333-3333-333333333333', 'cajero@demo.local', 'Caro (cajera)');
update perfiles set rol = 'staff', rol_id = (select id from roles where nombre = 'Cajero') where id = '33333333-3333-3333-3333-333333333333';
delete from clientes where usuario_id = '33333333-3333-3333-3333-333333333333';
delete from clientes where usuario_id = '11111111-1111-1111-1111-111111111111';

-- A partir de acá, todo se registra "como" el admin (así las funciones lo reconocen como equipo)
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);

insert into marcas (nombre) values ('Nike'), ('Adidas'), ('Topper'), ('Febo'), ('Vizzano');
insert into categorias (nombre) values ('Zapatilla'), ('Bota'), ('Sandalia'), ('Ojota');
insert into subcategorias (categoria_id, nombre)
select c.id, x.nombre from (values ('Zapatilla','Running'), ('Zapatilla','Urbana'), ('Zapatilla','Escolar'), ('Bota','Chelsea')) x(cat, nombre)
join categorias c on c.nombre = x.cat;

insert into productos (nombre, marca_id, categoria_id, genero, descripcion, precio_compra, precio_venta, publicado_web)
select x.nombre, m.id, c.id, x.genero, x.descripcion, x.costo, x.venta, x.web
from (values
  ('Zapatilla Running Pro',     'Nike',    'Zapatilla', 'Unisex', 'Amortiguación para correr todos los días.', 52000, 98000, true),
  ('Zapatilla Urbana Classic',  'Adidas',  'Zapatilla', 'Unisex', 'La clásica de cuero, para todo el día.',    41000, 79000, true),
  ('Bota Chelsea',              'Febo',    'Bota',      'Mujer',  'Cuero con elásticos laterales.',            48000, 92000, true),
  ('Sandalia Plataforma',       'Vizzano', 'Sandalia',  'Mujer',  'Plataforma liviana con tira regulable.',    21000, 42000, true),
  ('Ojota Slide',               'Topper',  'Ojota',     'Unisex', 'Suela de goma, secado rápido.',              7000, 15000, true),
  ('Zapatilla Escolar',         'Topper',  'Zapatilla', 'Niños',  'Resistente, con abrojo.',                   16000, 32000, false)
) as x(nombre, marca, categoria, genero, descripcion, costo, venta, web)
join marcas m on m.nombre = x.marca join categorias c on c.nombre = x.categoria;
-- Subrubro de cada modelo
update productos set subcategoria_id = (select id from subcategorias where nombre = 'Running')  where nombre = 'Zapatilla Running Pro';
update productos set subcategoria_id = (select id from subcategorias where nombre = 'Urbana')   where nombre = 'Zapatilla Urbana Classic';
update productos set subcategoria_id = (select id from subcategorias where nombre = 'Escolar')  where nombre = 'Zapatilla Escolar';
-- La escolar es de la escala Niños (solo acepta talles de niños)
update productos set escala = 'Niños' where nombre = 'Zapatilla Escolar';
update productos set subcategoria_id = (select id from subcategorias where nombre = 'Chelsea')  where nombre = 'Bota Chelsea';

insert into colores (nombre, hex) values ('Negro', '#111111'), ('Blanco', '#f5f5f5'), ('Marrón', '#7b4a2a'), ('Azul', '#1d4ed8');

-- Variantes: talles por género y uno o dos colores (buscar_talle/buscar_color crean el talle o color si no existe)
insert into variantes (producto_id, talle_id, color_id, sku)
select p.id, buscar_talle(t.talle), buscar_color(c.color), null   -- el SKU sale solo: ZAP-0001-42-NEG
from productos p
cross join lateral (select unnest(case p.genero when 'Niños' then array['28','30','32','34']
                                                 when 'Mujer' then array['35','36','37','38','39']
                                                 else array['38','39','40','41','42','43'] end) as talle) t
cross join lateral (select unnest(case when p.categoria_id in (select id from categorias where nombre in ('Ojota','Sandalia'))
                                       then array['Negro'] else array['Negro','Blanco'] end) as color) c;

insert into proveedores (nombre, telefono) values ('Distribuidora Deportiva SRL', '381 555-1001'), ('Calzados del Norte', '381 555-2002');

-- Descuentos y recargos por medio de pago (de ejemplo: cada negocio pone los suyos en Tablas)
update medios_pago set ajuste_pct = -10 where codigo = 'EFE';
update medios_pago set ajuste_pct = -5  where codigo = 'TRA';
insert into medios_pago (codigo, nombre, tipo, ajuste_pct, cuotas, en_tienda, orden)
values ('CR3', 'Crédito 3 cuotas', 'Crédito', 15, 3, false, 6);

insert into clientes (nombre, telefono, origen, etiquetas, fecha_nacimiento) values
  ('María González', '381 555-3003', 'Instagram', '{running}', '1990-10-20'),
  ('Juan Pérez',     '381 555-4004', 'Local',     '{}',        null);

-- Stock inicial: 3 pares de cada variante
select registrar_compra(
  (select jsonb_agg(jsonb_build_object('variante_id', v.id, 'cantidad', 3, 'costo_unitario', p.precio_compra))
     from variantes v join productos p on p.id = v.producto_id),
  (select id from proveedores order by id limit 1), 'Stock inicial de ejemplo', true, null, 'A-0001-00004512', current_date - 7);

-- Otro proveedor también vende algunos modelos, con lista y bonificación (para comparar precios)
insert into producto_proveedores (producto_id, proveedor_id, codigo_proveedor, precio_lista, bonificacion_pct)
select p.id, (select id from proveedores where nombre = 'Calzados del Norte'), x.cod, x.lista, x.bonif
from (values ('Zapatilla Running Pro', 'CN-RP01', 56000, 10), ('Bota Chelsea', 'CN-BCH', 50000, 0)) x(nombre, cod, lista, bonif)
join productos p on p.nombre = x.nombre;

-- Ventas de mostrador (una con pago mixto: parte en efectivo con descuento, el resto con crédito)
select registrar_venta(
  (select jsonb_agg(jsonb_build_object('variante_id', v.id, 'cantidad', 1, 'precio_unitario', p.precio_venta))
     from variantes v join productos p on p.id = v.producto_id
    where p.nombre = 'Zapatilla Running Pro' and v.talle_id in (buscar_talle('41'), buscar_talle('42')) and v.color_id = buscar_color('Negro')),
  jsonb_build_array(jsonb_build_object('medio_pago_id', (select id from medios_pago where codigo = 'EFE'), 'base', 96000),
                    jsonb_build_object('medio_pago_id', (select id from medios_pago where codigo = 'CRE'))),
  (select id from clientes where nombre = 'María González'));
select registrar_venta(
  (select jsonb_agg(jsonb_build_object('variante_id', v.id, 'cantidad', 2, 'precio_unitario', p.precio_venta))
     from variantes v join productos p on p.id = v.producto_id where p.nombre = 'Ojota Slide' and v.talle_id = buscar_talle('40')),
  jsonb_build_array(jsonb_build_object('medio_pago_id', (select id from medios_pago where codigo = 'EFE'))), null, 2000);

-- Un seguimiento pendiente en el CRM
insert into interacciones (cliente_id, tipo, canal, detalle, proxima_accion, proxima_fecha)
select id, 'Consulta', 'WhatsApp', 'Preguntó por la Running Pro en talle 44.', 'Avisarle cuando entre el 44', current_date + 3
from clientes where nombre = 'María González';

-- Un pedido web del cliente de prueba (se crea "como" él) y otro ya confirmado
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', false);
select crear_pedido(
  (select jsonb_agg(jsonb_build_object('variante_id', v.id, 'cantidad', 1))
     from variantes v join productos p on p.id = v.producto_id where p.nombre = 'Bota Chelsea' and v.talle_id = buscar_talle('37') and v.color_id = buscar_color('Negro')),
  'envio', 'Av. Mate de Luna 1234, San Miguel de Tucumán', (select id from medios_pago where codigo = 'TRA'), 'Si puede ser antes del viernes');
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
select cambiar_estado_pedido((select max(id) from pedidos), 'confirmado', 'Transferencia recibida');
