-- Roles y permisos del equipo (Administrador, Encargado, Cajero, Depósito… editables) y registro
-- de quién hizo cada operación.
--
-- Modelo: una lista FIJA de permisos (la define el sistema, tabla permisos) y ROLES editables que
-- agrupan permisos. Cada persona del equipo tiene un rol (perfiles.rol_id). Todo se controla en la
-- base con tiene_permiso('…'): esconder un botón no es seguridad.
--
-- Además cierra tres agujeros que con un solo rol no importaban y con cajeros sí:
--   1. cualquiera del equipo podía cambiar roles en perfiles (hacerse administrador);
--   2. stock y movimientos_stock aceptaban escritura directa del equipo, y _mover_stock se podía
--      llamar desde afuera (sumar stock sin factura);
--   3. registrar_venta aceptaba el precio que mandaba el navegador (un "descuento escondido").
-- Desde acá, la operación (ventas, compras, stock, pedidos) se escribe SOLO por funciones
-- security definer que verifican el permiso; las tablas no tienen políticas de escritura.

-- ── Permisos ──────────────────────────────────────────────────────────
create table public.permisos (
  id           bigint generated always as identity primary key,
  codigo       text not null unique,          -- lo que se consulta: tiene_permiso('ventas.registrar')
  grupo        text not null,
  nombre       text not null,
  descripcion  text,
  orden        int not null default 0
);

insert into public.permisos (orden, grupo, codigo, nombre, descripcion) values
  (10, 'Ventas',        'ventas.registrar',      'Vender en mostrador',              'Usar el punto de venta. El descuento manual tiene el tope del rol.'),
  (11, 'Ventas',        'ventas.ver_todas',      'Ver las ventas de todos',          'Sin este permiso, cada uno ve solo las ventas que hizo.'),
  (12, 'Ventas',        'ventas.cambiar_precio', 'Cambiar el precio al vender',      'Sin este permiso se cobra el precio de lista: las rebajas van por el descuento, con su tope.'),
  (13, 'Ventas',        'pedidos.gestionar',     'Atender pedidos web',              'Confirmar, preparar, entregar o cancelar pedidos.'),
  (20, 'Clientes',      'clientes.ver',          'Ver clientes',                     'Fichas, historial de compras y seguimientos.'),
  (21, 'Clientes',      'clientes.editar',       'Crear y editar clientes',          'Altas, datos, etiquetas, notas y seguimientos.'),
  (30, 'Stock',         'stock.ver',             'Ver stock',                        'Stock por talle y color, y sus movimientos.'),
  (31, 'Stock',         'stock.ajustar',         'Ajustar stock',                    'Correcciones por inventario, rotura o pérdida (quedan con su motivo).'),
  (40, 'Compras',       'compras.registrar',     'Cargar compras',                   'Facturas de compra (suman stock) y su historial.'),
  (41, 'Compras',       'proveedores.gestionar', 'Proveedores',                      'Alta de proveedores y sus precios por artículo.'),
  (50, 'Catálogo',      'productos.editar',      'Crear y editar productos',         'Datos, talles, colores, fotos y publicación en la tienda. Necesita también "Ver costos".'),
  (51, 'Catálogo',      'precios.editar',        'Cambiar precios de venta',         'Sin este permiso se puede dar de alta un producto, pero no ponerle ni cambiarle el precio.'),
  (52, 'Catálogo',      'costos.ver',            'Ver costos y márgenes',            'Precios de compra, ganancia y valor del stock a costo.'),
  (60, 'Informes',      'informes.ventas',       'Informes de ventas',               'Ventas por período, por artículo, por vendedor, etc.'),
  (61, 'Informes',      'informes.stock',        'Informe de stock valorizado',      'Muestra valores a costo solo si además tiene "Ver costos".'),
  (90, 'Configuración', 'tablas.editar',         'Tablas',                           'Rubros, marcas, colores, talles, medios de pago y depósitos.'),
  (91, 'Configuración', 'equipo.administrar',    'Equipo y permisos',                'Sumar o quitar personas del equipo, crear roles y elegir sus permisos.');

-- ── Roles ─────────────────────────────────────────────────────────────
create table public.roles (
  id                 bigint generated always as identity primary key,
  nombre             text not null,
  descripcion        text,
  -- El Administrador tiene TODOS los permisos, incluidos los que se agreguen en el futuro
  todos              boolean not null default false,
  permisos           text[] not null default '{}',
  -- Tope del descuento manual al vender, en % del total (null = sin tope)
  descuento_max_pct  numeric(5,2) check (descuento_max_pct between 0 and 100),
  activo             boolean not null default true,
  creado_en          timestamptz not null default now()
);
create unique index roles_nombre_unico on public.roles (lower(nombre));
-- Un solo rol "todos" (el Administrador)
create unique index roles_un_administrador on public.roles (todos) where todos;

insert into public.roles (nombre, descripcion, todos, permisos, descuento_max_pct) values
  ('Administrador', 'Todo, incluido el equipo y los permisos.', true, '{}', null),
  ('Encargado', 'Maneja el local: vende, compra, stock, precios e informes. No toca el equipo ni las tablas.', false,
   '{ventas.registrar,ventas.ver_todas,ventas.cambiar_precio,pedidos.gestionar,clientes.ver,clientes.editar,stock.ver,stock.ajustar,compras.registrar,proveedores.gestionar,productos.editar,precios.editar,costos.ver,informes.ventas,informes.stock}', null),
  ('Cajero', 'Vende y atiende: ve stock y precios de venta, pero no costos ni ganancias.', false,
   '{ventas.registrar,pedidos.gestionar,clientes.ver,clientes.editar,stock.ver}', 10),
  ('Depósito', 'Compras y stock: carga facturas, ajusta stock y da de alta productos. No vende.', false,
   '{stock.ver,stock.ajustar,compras.registrar,proveedores.gestionar,productos.editar,costos.ver,informes.stock}', null);

-- Los permisos de un rol tienen que existir; el Administrador no se puede desactivar ni perder "todos"
create or replace function public._validar_rol() returns trigger
language plpgsql set search_path = public as $$
declare v_malo text;
begin
  if tg_op = 'UPDATE' and old.todos then
    new.todos := true; new.activo := true;
  elsif auth.uid() is not null then
    new.todos := false;   -- "todos" no se le da a otro rol desde la app
  end if;
  select p into v_malo from unnest(new.permisos) p where not exists (select 1 from permisos where codigo = p) limit 1;
  if v_malo is not null then raise exception 'El permiso "%" no existe', v_malo; end if;
  new.permisos := array(select distinct p from unnest(new.permisos) p order by p);
  if coalesce(trim(new.nombre), '') = '' then raise exception 'El rol necesita un nombre'; end if;
  return new;
end $$;
create trigger validar_rol before insert or update on public.roles for each row execute function public._validar_rol();

create or replace function public._no_borrar_administrador() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.todos then raise exception 'El rol Administrador no se puede borrar'; end if;
  return old;
end $$;
create trigger no_borrar_administrador before delete on public.roles for each row execute function public._no_borrar_administrador();

-- ── Perfiles: el rol de cada persona del equipo ───────────────────────
alter table public.perfiles add column rol_id bigint references public.roles (id) on delete restrict;
create index perfiles_rol_id_idx on public.perfiles (rol_id);
-- Quien ya era del equipo pasa a ser Administrador (hasta hoy había un solo rol y hacía todo)
update public.perfiles set rol_id = (select id from roles where todos) where rol = 'staff';
-- Del equipo ⇔ tiene rol
alter table public.perfiles add constraint perfiles_staff_con_rol check ((rol = 'staff') = (rol_id is not null));

-- ── Funciones de permisos ─────────────────────────────────────────────
-- Del equipo = staff con un rol activo
create or replace function public.es_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles pe join roles r on r.id = pe.rol_id
                  where pe.id = auth.uid() and pe.rol = 'staff' and r.activo);
$$;

create or replace function public.tiene_permiso(p_permiso text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles pe join roles r on r.id = pe.rol_id
                  where pe.id = auth.uid() and pe.rol = 'staff' and r.activo and (r.todos or p_permiso = any (r.permisos)));
$$;

-- Para la app: qué puede hacer el usuario logueado (arma el menú) y su tope de descuento
create or replace function public.mi_equipo() returns table (rol text, permisos text[], descuento_max_pct numeric)
language sql stable security definer set search_path = public as $$
  select r.nombre, case when r.todos then (select array_agg(codigo order by orden) from permisos) else r.permisos end, r.descuento_max_pct
    from perfiles pe join roles r on r.id = pe.rol_id
   where pe.id = auth.uid() and pe.rol = 'staff' and r.activo;
$$;

-- ── Quién hizo cada cosa ──────────────────────────────────────────────
-- compras, movimientos_stock, interacciones y pedido_estados ya guardaban usuario_id (default auth.uid())
-- pero sin referencia; ventas no lo guardaba. Ahora todas lo tienen, referenciando a perfiles (no a
-- auth.users) para poder mostrar el nombre con un join de la API, con su índice.
-- set null: si se borra el usuario, la operación queda (sin autor).
do $$
declare t text;
begin
  foreach t in array array['ventas','compras','movimientos_stock','interacciones','pedido_estados'] loop
    execute format('alter table public.%I add column if not exists usuario_id uuid default auth.uid()', t);
    execute format('update public.%I set usuario_id = null where usuario_id is not null and usuario_id not in (select id from public.perfiles)', t);
    execute format('alter table public.%I add constraint %I foreign key (usuario_id) references public.perfiles (id) on delete set null', t, t || '_usuario_id_fkey');
    execute format('create index %I on public.%I (usuario_id)', t || '_usuario_id_idx', t);
  end loop;
end $$;

-- ── Políticas: de "el equipo hace todo" a "cada uno lo que su rol permite" ──
do $$
declare t text;
begin
  foreach t in array array['marcas','categorias','subcategorias','talles','colores','productos','variantes','numeradores','depositos','stock',
                           'interacciones','proveedores','ventas','venta_items','pagos','compras','compra_items','movimientos_stock',
                           'producto_proveedores','medios_pago','perfiles','clientes','pedidos','pedido_items','pedido_estados','producto_imagenes'] loop
    execute format('drop policy if exists "equipo" on public.%I', t);
  end loop;
end $$;

-- Tablas maestras: las ve todo el equipo (desplegables); las cambia quien tiene "Tablas"
do $$
declare t text;
begin
  foreach t in array array['marcas','categorias','subcategorias','talles','colores','depositos','medios_pago'] loop
    execute format('create policy "equipo ve" on public.%I for select to authenticated using (es_staff())', t);
    execute format('create policy "tablas" on public.%I for all to authenticated using (tiene_permiso(''tablas.editar'')) with check (tiene_permiso(''tablas.editar''))', t);
  end loop;
end $$;

-- Productos: la tabla tiene el costo → la lee solo quien ve costos (el resto, por v_stock)
create policy "ve costos" on public.productos for select to authenticated using (tiene_permiso('costos.ver'));
create policy "edita productos" on public.productos for all to authenticated
  using (tiene_permiso('productos.editar')) with check (tiene_permiso('productos.editar'));
create policy "equipo ve" on public.variantes for select to authenticated using (es_staff());
create policy "edita productos" on public.variantes for all to authenticated
  using (tiene_permiso('productos.editar')) with check (tiene_permiso('productos.editar'));
create policy "equipo ve" on public.producto_imagenes for select to authenticated using (es_staff());
create policy "edita productos" on public.producto_imagenes for all to authenticated
  using (tiene_permiso('productos.editar')) with check (tiene_permiso('productos.editar'));

-- Precio de venta: ponerlo o cambiarlo necesita "Cambiar precios de venta"
create or replace function public._proteger_precio() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and not tiene_permiso('precios.editar')
     and coalesce(new.precio_venta, 0) is distinct from (case when tg_op = 'INSERT' then 0 else coalesce(old.precio_venta, 0) end) then
    raise exception 'No tenés permiso para cambiar precios de venta';
  end if;
  return new;
end $$;
create trigger proteger_precio before insert or update of precio_venta on public.productos for each row execute function public._proteger_precio();
create trigger proteger_precio before insert or update of precio_venta on public.variantes for each row execute function public._proteger_precio();

-- Proveedores y sus precios (son costos)
create policy "compras ve" on public.proveedores for select to authenticated
  using (tiene_permiso('compras.registrar') or tiene_permiso('proveedores.gestionar') or tiene_permiso('costos.ver'));
create policy "gestiona proveedores" on public.proveedores for all to authenticated
  using (tiene_permiso('proveedores.gestionar')) with check (tiene_permiso('proveedores.gestionar'));
create policy "ve costos" on public.producto_proveedores for select to authenticated using (tiene_permiso('costos.ver'));
create policy "gestiona proveedores" on public.producto_proveedores for all to authenticated
  using (tiene_permiso('proveedores.gestionar') and tiene_permiso('costos.ver'))
  with check (tiene_permiso('proveedores.gestionar') and tiene_permiso('costos.ver'));

-- Stock: solo lectura (se mueve únicamente por las funciones)
create policy "ve stock" on public.stock for select to authenticated using (tiene_permiso('stock.ver'));
create policy "ve stock" on public.movimientos_stock for select to authenticated using (tiene_permiso('stock.ver'));
-- numeradores: se leen (para mostrar el próximo número); los escriben solo las funciones
create policy "equipo ve" on public.numeradores for select to authenticated using (es_staff());

-- Ventas: cada uno las suyas; todas, con "Ver todas" o "Informes de ventas". Solo lectura.
create or replace function public.puede_ver_venta(p_usuario uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select tiene_permiso('ventas.ver_todas') or tiene_permiso('informes.ventas')
      or (p_usuario = auth.uid() and tiene_permiso('ventas.registrar'));
$$;
create policy "ve ventas" on public.ventas for select to authenticated using (puede_ver_venta(usuario_id));
create policy "ve pagos" on public.pagos for select to authenticated using (venta_id in (select id from ventas));
-- Los renglones tienen el costo: la tabla, solo con "Ver costos" (el resto lee v_venta_items)
create policy "ve costos" on public.venta_items for select to authenticated
  using (tiene_permiso('costos.ver') and venta_id in (select id from ventas));

-- Compras (solo lectura: se cargan con registrar_compra)
create policy "ve compras" on public.compras for select to authenticated using (tiene_permiso('compras.registrar'));
create policy "ve compras" on public.compra_items for select to authenticated using (tiene_permiso('compras.registrar'));

-- Clientes y CRM (el cajero los necesita para asignar la venta a un cliente)
create policy "ve clientes" on public.clientes for select to authenticated
  using (tiene_permiso('clientes.ver') or tiene_permiso('ventas.registrar'));
create policy "edita clientes" on public.clientes for all to authenticated
  using (tiene_permiso('clientes.editar')) with check (tiene_permiso('clientes.editar'));
create policy "ve clientes" on public.interacciones for select to authenticated using (tiene_permiso('clientes.ver'));
create policy "edita clientes" on public.interacciones for all to authenticated
  using (tiene_permiso('clientes.editar')) with check (tiene_permiso('clientes.editar'));

-- Pedidos (se mueven con cambiar_estado_pedido; acá solo lectura del equipo)
create policy "atiende pedidos" on public.pedidos for select to authenticated using (tiene_permiso('pedidos.gestionar') or tiene_permiso('clientes.ver'));
create policy "atiende pedidos" on public.pedido_items for select to authenticated using (tiene_permiso('pedidos.gestionar') or tiene_permiso('clientes.ver'));
create policy "atiende pedidos" on public.pedido_estados for select to authenticated using (tiene_permiso('pedidos.gestionar') or tiene_permiso('clientes.ver'));

-- Perfiles: cada uno el suyo; el equipo ve los nombres del equipo ("vendió: Lucas");
-- cambiar roles, solo con "Equipo y permisos" (y por las funciones de abajo)
create policy "equipo ve al equipo" on public.perfiles for select to authenticated using (rol = 'staff' and es_staff());

-- Roles y permisos: los ve el equipo; los cambia quien administra el equipo
alter table public.roles enable row level security;
alter table public.permisos enable row level security;
create policy "equipo ve" on public.roles for select to authenticated using (es_staff());
create policy "administra" on public.roles for all to authenticated
  using (tiene_permiso('equipo.administrar')) with check (tiene_permiso('equipo.administrar'));
create policy "equipo ve" on public.permisos for select to authenticated using (es_staff());

-- Fotos en Storage: las sube y borra quien edita productos
drop policy "equipo ve fotos de productos" on storage.objects;
drop policy "equipo sube fotos de productos" on storage.objects;
drop policy "equipo cambia fotos de productos" on storage.objects;
drop policy "equipo borra fotos de productos" on storage.objects;
create policy "equipo ve fotos de productos" on storage.objects
  for select to authenticated using (bucket_id = 'productos' and public.es_staff());
create policy "productos sube fotos" on storage.objects
  for insert to authenticated with check (bucket_id = 'productos' and public.tiene_permiso('productos.editar'));
create policy "productos cambia fotos" on storage.objects
  for update to authenticated using (bucket_id = 'productos' and public.tiene_permiso('productos.editar'))
  with check (bucket_id = 'productos' and public.tiene_permiso('productos.editar'));
create policy "productos borra fotos" on storage.objects
  for delete to authenticated using (bucket_id = 'productos' and public.tiene_permiso('productos.editar'));

-- ── Vistas: corren con los permisos del dueño y esconden lo que el rol no puede ver ──
-- Stock (el punto de venta y la pantalla de Stock): costo y valor a costo vacíos sin "Ver costos"
drop view public.v_stock;
create view public.v_stock with (security_invoker = false) as
select v.id as variante_id, p.id as producto_id, p.codigo, p.nombre, m.nombre as marca, c.nombre as categoria,
       t.nombre as talle, t.orden as talle_orden, co.nombre as color, co.hex as color_hex,
       v.sku, d.id as deposito_id, d.nombre as deposito,
       coalesce(s.cantidad, 0) as stock, coalesce(s.reservado, 0) as reservado,
       coalesce(s.cantidad, 0) - coalesce(s.reservado, 0) as disponible, v.stock_minimo,
       case when tiene_permiso('costos.ver') then p.precio_compra end as precio_compra,
       coalesce(v.precio_venta, p.precio_venta) as precio_venta,
       case when tiene_permiso('costos.ver') then coalesce(s.cantidad, 0) * p.precio_compra end as valor_costo,
       coalesce(s.cantidad, 0) - coalesce(s.reservado, 0) <= v.stock_minimo as stock_bajo
from variantes v
join productos p on p.id = v.producto_id
join talles t on t.id = v.talle_id
join colores co on co.id = v.color_id
cross join depositos d
left join stock s on s.variante_id = v.id and s.deposito_id = d.id
left join marcas m on m.id = p.marca_id
left join categorias c on c.id = p.categoria_id
where tiene_permiso('stock.ver') or tiene_permiso('ventas.registrar');

-- Renglones de venta (detalle de una venta, historial de un cliente): mismas reglas que ventas
drop view public.v_venta_items;
create view public.v_venta_items with (security_invoker = false) as
select vi.id, vi.venta_id, vi.variante_id, vi.cantidad, vi.precio_unitario,
       case when tiene_permiso('costos.ver') then vi.costo_unitario end as costo_unitario,
       ve.fecha, ve.canal, ve.cliente_id, p.id as producto_id, p.nombre, m.nombre as marca,
       t.nombre as talle, co.nombre as color,
       vi.cantidad * vi.precio_unitario as subtotal,
       case when tiene_permiso('costos.ver') then vi.cantidad * (vi.precio_unitario - vi.costo_unitario) end as margen
from venta_items vi
join ventas ve on ve.id = vi.venta_id
join variantes v on v.id = vi.variante_id
join productos p on p.id = v.producto_id
join talles t on t.id = v.talle_id
join colores co on co.id = v.color_id
left join marcas m on m.id = p.marca_id
where es_staff() and puede_ver_venta(ve.usuario_id);

-- Hechos de venta (informes): con "Informes de ventas" o "Ver todas"; costo y ganancia, solo con "Ver costos"
drop view public.v_hechos_ventas;
create view public.v_hechos_ventas with (security_invoker = false) as
select vi.id, ve.id as venta_id, ve.comprobante, ve.fecha, (ve.fecha at time zone 'America/Argentina/Buenos_Aires')::date as dia,
       extract(year from ve.fecha at time zone 'America/Argentina/Buenos_Aires')::int as anio,
       extract(month from ve.fecha at time zone 'America/Argentina/Buenos_Aires')::int as mes,
       extract(isodow from ve.fecha at time zone 'America/Argentina/Buenos_Aires')::int as dia_semana,
       ve.canal, d.nombre as deposito, cl.codigo as cliente_codigo, cl.nombre as cliente, cl.origen as cliente_origen,
       ve.usuario_id as vendedor_id, coalesce(pe.nombre, 'Sin registrar') as vendedor,
       p.codigo as articulo, p.nombre as modelo, m.nombre as marca, ca.codigo as rubro_codigo, ca.nombre as rubro,
       sc.nombre as subrubro, p.genero,
       t.nombre as talle, t.orden as talle_orden, co.nombre as color, v.sku,
       vi.cantidad, vi.precio_unitario,
       case when tiene_permiso('costos.ver') then vi.costo_unitario end as costo_unitario,
       vi.cantidad * vi.precio_unitario as importe,
       case when tiene_permiso('costos.ver') then vi.cantidad * vi.costo_unitario end as costo,
       case when tiene_permiso('costos.ver') then vi.cantidad * (vi.precio_unitario - vi.costo_unitario) end as margen,
       -- Lo mismo, después del descuento manual y del ajuste por medio de pago (prorrateados por importe)
       round(vi.cantidad * vi.precio_unitario * ve.total / nullif(ve.subtotal, 0), 2) as importe_neto,
       case when tiene_permiso('costos.ver') then
         round(vi.cantidad * vi.precio_unitario * ve.total / nullif(ve.subtotal, 0) - vi.cantidad * vi.costo_unitario, 2) end as margen_neto,
       ve.pedido_id is not null as vino_de_pedido
from venta_items vi
join ventas ve on ve.id = vi.venta_id
join depositos d on d.id = ve.deposito_id
left join clientes cl on cl.id = ve.cliente_id
left join perfiles pe on pe.id = ve.usuario_id
join variantes v on v.id = vi.variante_id
join productos p on p.id = v.producto_id
left join marcas m on m.id = p.marca_id
left join categorias ca on ca.id = p.categoria_id
left join subcategorias sc on sc.id = p.subcategoria_id
join talles t on t.id = v.talle_id
join colores co on co.id = v.color_id
where tiene_permiso('informes.ventas') or tiene_permiso('ventas.ver_todas');

grant select on public.v_stock, public.v_venta_items, public.v_hechos_ventas to authenticated;
revoke select on public.v_stock, public.v_venta_items, public.v_hechos_ventas from anon;

-- ── Funciones de la operación: security definer + permiso ─────────────
-- _mover_stock queda interna: ya no se puede llamar desde afuera
create or replace function public._mover_stock(
  p_variante bigint, p_deposito bigint, p_cantidad int, p_tipo text,
  p_venta bigint default null, p_compra bigint default null, p_motivo text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into stock (variante_id, deposito_id, cantidad) values (p_variante, p_deposito, 0)
  on conflict do nothing;
  update stock set cantidad = cantidad + p_cantidad
   where variante_id = p_variante and deposito_id = p_deposito;
  insert into movimientos_stock (variante_id, deposito_id, tipo, cantidad, venta_id, compra_id, motivo)
  values (p_variante, p_deposito, p_tipo, p_cantidad, p_venta, p_compra, p_motivo);
exception when check_violation then
  raise exception 'Stock insuficiente para esa operación';
end $$;

-- La venta en sí (interna): la usan registrar_venta (mostrador) y cambiar_estado_pedido (entregar).
-- Es el mismo cálculo de siempre: pagos con su descuento/recargo, numeración, stock.
create or replace function public._registrar_venta(
  p_items jsonb, p_pagos jsonb, p_cliente bigint, p_descuento numeric,
  p_canal text, p_deposito bigint, p_notas text
) returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint; it jsonb; v_sub numeric; v_resto numeric; v_base numeric; v_pct numeric; v_aj numeric;
        v_ajustes numeric := 0; v_pagos jsonb := '[]'; v_medio medios_pago;
        v_dep bigint := coalesce(p_deposito, deposito_principal()); v_disp int;
begin
  if jsonb_array_length(p_items) = 0 then raise exception 'La venta no tiene productos'; end if;
  select coalesce(sum((i->>'cantidad')::int * (i->>'precio_unitario')::numeric), 0) into v_sub from jsonb_array_elements(p_items) i;
  if coalesce(p_descuento, 0) < 0 then raise exception 'El descuento no puede ser negativo'; end if;
  if p_descuento > v_sub then raise exception 'El descuento es mayor que el total'; end if;

  v_resto := v_sub - p_descuento;
  for it in select * from jsonb_array_elements(p_pagos) loop
    select * into v_medio from medios_pago where id = (it->>'medio_pago_id')::bigint and activo;
    if not found then raise exception 'Medio de pago inexistente o desactivado'; end if;
    v_base := coalesce((it->>'base')::numeric, v_resto);
    if v_base <= 0 then continue; end if;
    if v_base > v_resto + 0.01 then raise exception 'Los pagos superan el total'; end if;
    v_pct := coalesce((it->>'ajuste_pct')::numeric, v_medio.ajuste_pct);
    if v_pct not between -100 and 100 then raise exception 'Ajuste de medio de pago inválido'; end if;
    v_aj := round(v_base * v_pct / 100, 2);
    v_pagos := v_pagos || jsonb_build_object('medio_pago_id', v_medio.id, 'base', v_base, 'ajuste_pct', v_pct,
                                             'ajuste', v_aj, 'cuotas', v_medio.cuotas, 'referencia', it->>'referencia');
    v_ajustes := v_ajustes + v_aj;
    v_resto := v_resto - v_base;
  end loop;

  insert into ventas (cliente_id, deposito_id, canal, subtotal, descuento, ajuste_medio_pago, total, notas)
  values (p_cliente, v_dep, p_canal, v_sub, p_descuento, v_ajustes, v_sub - p_descuento + v_ajustes, p_notas)
  returning id into v_id;

  for it in select * from jsonb_array_elements(p_items) loop
    if (it->>'cantidad')::int <= 0 then raise exception 'Cantidad inválida'; end if;
    select cantidad - reservado into v_disp from stock
     where variante_id = (it->>'variante_id')::bigint and deposito_id = v_dep for update;
    if coalesce(v_disp, 0) < (it->>'cantidad')::int then
      raise exception 'Stock insuficiente: hay % disponibles y se quieren vender %', coalesce(v_disp, 0), it->>'cantidad';
    end if;
    insert into venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario)
    select v_id, v.id, (it->>'cantidad')::int, (it->>'precio_unitario')::numeric, p.precio_compra
      from variantes v join productos p on p.id = v.producto_id where v.id = (it->>'variante_id')::bigint;
    perform _mover_stock((it->>'variante_id')::bigint, v_dep, -(it->>'cantidad')::int, 'venta', v_id);
  end loop;

  insert into pagos (venta_id, medio_pago_id, base, ajuste_pct, ajuste, cuotas, referencia)
  select v_id, (x->>'medio_pago_id')::bigint, (x->>'base')::numeric, (x->>'ajuste_pct')::numeric,
         (x->>'ajuste')::numeric, (x->>'cuotas')::int, x->>'referencia'
    from jsonb_array_elements(v_pagos) x;
  return v_id;
end $$;

-- Venta de mostrador: verifica el permiso, el precio y el tope de descuento del rol
create or replace function public.registrar_venta(
  p_items jsonb, p_pagos jsonb default '[]', p_cliente bigint default null,
  p_descuento numeric default 0, p_canal text default 'Local',
  p_deposito bigint default null, p_notas text default null
) returns bigint language plpgsql security definer set search_path = public as $$
declare v_items jsonb; v_sub numeric; v_tope numeric;
begin
  if not tiene_permiso('ventas.registrar') then raise exception 'No tenés permiso para registrar ventas'; end if;
  -- Sin "Cambiar el precio al vender", se cobra el precio de lista (lo que mande el navegador no cuenta)
  if tiene_permiso('ventas.cambiar_precio') then v_items := p_items;
  else
    select coalesce(jsonb_agg(i || jsonb_build_object('precio_unitario', precio_de((i->>'variante_id')::bigint))), '[]') into v_items
      from jsonb_array_elements(p_items) i;
  end if;
  -- Tope del descuento manual según el rol (null = sin tope)
  select r.descuento_max_pct into v_tope from perfiles pe join roles r on r.id = pe.rol_id where pe.id = auth.uid() and not r.todos;
  select coalesce(sum((i->>'cantidad')::int * (i->>'precio_unitario')::numeric), 0) into v_sub from jsonb_array_elements(v_items) i;
  if v_tope is not null and coalesce(p_descuento, 0) > round(v_sub * v_tope / 100, 2) then
    raise exception 'Tu descuento máximo es del % %%: para más, pedíselo a un encargado', trim(to_char(v_tope, 'FM990D##'));
  end if;
  return _registrar_venta(v_items, p_pagos, p_cliente, coalesce(p_descuento, 0), p_canal, p_deposito, p_notas);
end $$;

create or replace function public.registrar_compra(
  p_items jsonb, p_proveedor bigint default null, p_notas text default null,
  p_actualizar_costo boolean default true, p_deposito bigint default null,
  p_comprobante_proveedor text default null, p_fecha_comprobante date default null
) returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint; it jsonb; v_total numeric; v_dep bigint := coalesce(p_deposito, deposito_principal());
        v_prod bigint; v_costo numeric;
begin
  if not tiene_permiso('compras.registrar') then raise exception 'No tenés permiso para registrar compras'; end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'La compra no tiene productos'; end if;
  if p_proveedor is not null and not exists (select 1 from proveedores where id = p_proveedor) then
    raise exception 'El proveedor no existe';
  end if;
  if p_fecha_comprobante > current_date then raise exception 'La fecha de la factura no puede ser futura'; end if;
  select coalesce(sum((i->>'cantidad')::int * (i->>'costo_unitario')::numeric), 0) into v_total from jsonb_array_elements(p_items) i;
  insert into compras (proveedor_id, deposito_id, total, notas, comprobante_proveedor, fecha_comprobante)
  values (p_proveedor, v_dep, v_total, p_notas, nullif(trim(p_comprobante_proveedor), ''), p_fecha_comprobante)
  returning id into v_id;

  for it in select * from jsonb_array_elements(p_items) loop
    if (it->>'cantidad')::int <= 0 then raise exception 'Cantidad inválida'; end if;
    v_costo := (it->>'costo_unitario')::numeric;
    if v_costo < 0 then raise exception 'El costo no puede ser negativo'; end if;
    insert into compra_items (compra_id, variante_id, cantidad, costo_unitario)
    values (v_id, (it->>'variante_id')::bigint, (it->>'cantidad')::int, v_costo);
    perform _mover_stock((it->>'variante_id')::bigint, v_dep, (it->>'cantidad')::int, 'compra', null, v_id);
    if p_actualizar_costo then
      select producto_id into v_prod from variantes where id = (it->>'variante_id')::bigint;
      update productos set precio_compra = v_costo where id = v_prod;
      if p_proveedor is not null then
        insert into producto_proveedores (producto_id, proveedor_id, precio_lista, principal)
        values (v_prod, p_proveedor, v_costo,
                not exists (select 1 from producto_proveedores where producto_id = v_prod and principal))
        on conflict (producto_id, proveedor_id) do update
          set precio_lista = round(v_costo / (1 - producto_proveedores.bonificacion_pct / 100), 2), actualizado_en = now();
      end if;
    end if;
  end loop;
  return v_id;
end $$;

create or replace function public.ajustar_stock(p_variante bigint, p_stock_nuevo int, p_motivo text, p_deposito bigint default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_dep bigint := coalesce(p_deposito, deposito_principal()); v_actual int; v_res int;
begin
  if not tiene_permiso('stock.ajustar') then raise exception 'No tenés permiso para ajustar stock'; end if;
  if p_stock_nuevo < 0 then raise exception 'El stock no puede ser negativo'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Indicá el motivo del ajuste'; end if;
  select cantidad, reservado into v_actual, v_res from stock where variante_id = p_variante and deposito_id = v_dep for update;
  if p_stock_nuevo < coalesce(v_res, 0) then raise exception 'Hay % pares reservados en pedidos: el stock no puede quedar por debajo', v_res; end if;
  if coalesce(v_actual, 0) = p_stock_nuevo then return; end if;
  perform _mover_stock(p_variante, v_dep, p_stock_nuevo - coalesce(v_actual, 0), 'ajuste', null, null, p_motivo);
end $$;

create or replace function public.cambiar_estado_pedido(
  p_pedido bigint, p_estado text, p_comentario text default null, p_pagos jsonb default '[]'
) returns bigint language plpgsql security definer set search_path = public as $$
declare v_ped pedidos; it record; v_venta bigint;
begin
  if not tiene_permiso('pedidos.gestionar') then raise exception 'Solo el equipo puede cambiar el estado de un pedido'; end if;
  select * into v_ped from pedidos where id = p_pedido for update;
  if not found then raise exception 'El pedido no existe'; end if;
  if v_ped.estado in ('entregado','cancelado') then raise exception 'El pedido ya está %', v_ped.estado; end if;

  if p_estado = 'cancelado' then
    for it in select * from pedido_items where pedido_id = p_pedido loop
      update stock set reservado = reservado - it.cantidad where variante_id = it.variante_id and deposito_id = v_ped.deposito_id;
    end loop;
  elsif p_estado = 'entregado' then
    for it in select * from pedido_items where pedido_id = p_pedido loop
      update stock set reservado = reservado - it.cantidad where variante_id = it.variante_id and deposito_id = v_ped.deposito_id;
    end loop;
    -- Se respeta el precio y el % prometidos al cliente (no pasa por el tope de descuento del rol)
    v_venta := _registrar_venta(
      (select jsonb_agg(jsonb_build_object('variante_id', variante_id, 'cantidad', cantidad, 'precio_unitario', precio_unitario))
         from pedido_items where pedido_id = p_pedido),
      case when jsonb_array_length(coalesce(p_pagos, '[]')) = 0
           then jsonb_build_array(jsonb_build_object('medio_pago_id', v_ped.medio_pago_id, 'ajuste_pct', v_ped.ajuste_pct))
           else p_pagos end,
      v_ped.cliente_id, 0, v_ped.canal, v_ped.deposito_id, 'Pedido ' || v_ped.comprobante);
    update ventas set pedido_id = p_pedido where id = v_venta;
  end if;

  update pedidos set estado = p_estado where id = p_pedido;
  insert into pedido_estados (pedido_id, estado, comentario) values (p_pedido, p_estado, p_comentario);
  return v_venta;
end $$;

-- crear_pedido: un pedido "en nombre de" un cliente lo carga quien atiende pedidos
create or replace function public.crear_pedido(
  p_items jsonb, p_entrega text default 'retiro', p_direccion text default null,
  p_medio_pago bigint default null, p_notas text default null,
  p_cliente bigint default null, p_canal text default 'Web'
) returns bigint language plpgsql security definer set search_path = public as $$
declare v_cliente bigint; v_id bigint; it jsonb; v_dep bigint := deposito_principal(); v_disp int; v_precio numeric;
        v_sub numeric := 0; v_aj numeric; v_medio medios_pago; v_equipo boolean := tiene_permiso('pedidos.gestionar');
begin
  if auth.uid() is null then raise exception 'Tenés que ingresar para hacer un pedido'; end if;
  if v_equipo and p_cliente is not null then v_cliente := p_cliente;
  else
    select id into v_cliente from clientes where usuario_id = auth.uid();
    if v_cliente is null then raise exception 'Tu usuario no tiene ficha de cliente'; end if;
  end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'El pedido está vacío'; end if;
  if p_entrega = 'envio' and coalesce(trim(p_direccion), '') = '' then raise exception 'Falta la dirección de envío'; end if;
  select * into v_medio from medios_pago where id = p_medio_pago and activo and (en_tienda or v_equipo);
  if not found then raise exception 'Elegí un medio de pago válido'; end if;

  insert into pedidos (cliente_id, canal, entrega, direccion_envio, medio_pago_id, ajuste_pct, deposito_id, notas)
  values (v_cliente, case when v_equipo then p_canal else 'Web' end, p_entrega, p_direccion,
          v_medio.id, v_medio.ajuste_pct, v_dep, p_notas)
  returning id into v_id;

  for it in select * from jsonb_array_elements(p_items) loop
    if (it->>'cantidad')::int <= 0 then raise exception 'Cantidad inválida'; end if;
    select precio_de(v.id) into v_precio from variantes v join productos p on p.id = v.producto_id
     where v.id = (it->>'variante_id')::bigint and p.activo and (p.publicado_web or v_equipo);
    if v_precio is null then raise exception 'Uno de los productos ya no está disponible'; end if;
    select cantidad - reservado into v_disp from stock where variante_id = (it->>'variante_id')::bigint and deposito_id = v_dep for update;
    if coalesce(v_disp, 0) < (it->>'cantidad')::int then raise exception 'No hay stock suficiente de uno de los productos (quedan %)', coalesce(v_disp, 0); end if;
    update stock set reservado = reservado + (it->>'cantidad')::int where variante_id = (it->>'variante_id')::bigint and deposito_id = v_dep;
    insert into pedido_items (pedido_id, variante_id, cantidad, precio_unitario) values (v_id, (it->>'variante_id')::bigint, (it->>'cantidad')::int, v_precio);
    v_sub := v_sub + v_precio * (it->>'cantidad')::int;
  end loop;

  v_aj := round(v_sub * v_medio.ajuste_pct / 100, 2);
  update pedidos set subtotal = v_sub, ajuste_medio_pago = v_aj, total = v_sub + v_aj where id = v_id;
  insert into pedido_estados (pedido_id, estado, comentario) values (v_id, 'pendiente', 'Pedido recibido');
  return v_id;
end $$;

-- ── Administrar el equipo ─────────────────────────────────────────────
-- El email está en auth.users (fuera del alcance de la API): estas funciones lo resuelven.
create or replace function public.equipo() returns table (usuario_id uuid, nombre text, email text, rol_id bigint, rol text, desde timestamptz)
language sql stable security definer set search_path = public as $$
  select pe.id, pe.nombre, u.email::text, r.id, r.nombre, u.created_at
    from perfiles pe join auth.users u on u.id = pe.id join roles r on r.id = pe.rol_id
   where pe.rol = 'staff' and tiene_permiso('equipo.administrar')
   order by r.todos desc, pe.nombre;
$$;

-- Que siempre quede al menos un Administrador
create or replace function public._queda_administrador(p_sin uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles pe join roles r on r.id = pe.rol_id where r.todos and pe.rol = 'staff' and pe.id <> p_sin);
$$;

-- Sumar a alguien al equipo (o cambiarle el rol). Tiene que haberse registrado antes en la tienda.
create or replace function public.asignar_rol(p_email text, p_rol bigint) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_usuario uuid; v_es_admin boolean;
begin
  if not tiene_permiso('equipo.administrar') then raise exception 'No tenés permiso para administrar el equipo'; end if;
  select id into v_usuario from auth.users where lower(email) = lower(trim(p_email));
  if v_usuario is null then raise exception 'No hay ninguna cuenta con ese email: primero tiene que registrarse en la tienda'; end if;
  if not exists (select 1 from roles where id = p_rol and activo) then raise exception 'Ese rol no existe o está desactivado'; end if;
  select r.todos into v_es_admin from perfiles pe join roles r on r.id = pe.rol_id where pe.id = v_usuario;
  if coalesce(v_es_admin, false) and not (select todos from roles where id = p_rol) and not _queda_administrador(v_usuario) then
    raise exception 'Tiene que quedar al menos un Administrador';
  end if;
  update perfiles set rol = 'staff', rol_id = p_rol where id = v_usuario;
  return v_usuario;
end $$;

-- Sacar a alguien del equipo: vuelve a ser cliente (su historial queda)
create or replace function public.quitar_del_equipo(p_usuario uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tiene_permiso('equipo.administrar') then raise exception 'No tenés permiso para administrar el equipo'; end if;
  if p_usuario = auth.uid() then raise exception 'No te podés sacar a vos mismo del equipo'; end if;
  if not _queda_administrador(p_usuario) then raise exception 'Tiene que quedar al menos un Administrador'; end if;
  update perfiles set rol = 'cliente', rol_id = null where id = p_usuario and rol = 'staff';
end $$;

-- ── Permisos de ejecución ─────────────────────────────────────────────
revoke execute on function public._registrar_venta, public._mover_stock, public._validar_rol, public._no_borrar_administrador,
  public._proteger_precio, public._queda_administrador from public, anon, authenticated;
revoke execute on function public.tiene_permiso, public.mi_equipo, public.puede_ver_venta, public.equipo,
  public.asignar_rol, public.quitar_del_equipo from public, anon;
grant execute on function public.tiene_permiso, public.mi_equipo, public.puede_ver_venta, public.equipo,
  public.asignar_rol, public.quitar_del_equipo to authenticated;
