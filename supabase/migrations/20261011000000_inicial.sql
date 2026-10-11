-- =====================================================================
-- Sistema de calzado — modelo de datos
--
-- Modelo semántico (estrella):
--   HECHOS       venta_items · compra_items · pedido_items · movimientos_stock · pagos
--   DIMENSIONES  productos (→ marcas, categorías) · variantes (→ talles, colores) · clientes ·
--                depósitos · proveedores · canal · medio de pago · fecha
--
-- Artículo en dos niveles:
--   productos = el MODELO ("Running Pro, Nike"): lo común a todos los talles y colores
--   variantes = el ARTÍCULO VENDIBLE (SKU): modelo + talle + color, con su código y su stock
--
-- Tres partes:
--   1. CATÁLOGO   marcas, categorías, talles, colores, productos y sus VARIANTES
--   2. OPERACIÓN  depósitos y stock por depósito, compras, ventas, pagos, pedidos
--   3. CLIENTES   perfiles de usuario (equipo / cliente), fichas de cliente (CRM)
--                 e interacciones (seguimientos)
--
-- Reglas que no se rompen:
--   • El stock vive en (variante, depósito). Nunca se toca con un UPDATE suelto:
--     siempre por las funciones registrar_venta / registrar_compra / ajustar_stock /
--     crear_pedido / cambiar_estado_pedido, que dejan el movimiento en movimientos_stock.
--   • disponible = cantidad − reservado. Un pedido RESERVA stock; al entregarse se
--     convierte en venta y descuenta; si se cancela, libera la reserva.
--   • El equipo ("staff") ve y toca todo. Un cliente registrado solo ve el catálogo
--     publicado (sin costos) y SUS pedidos. Lo hace cumplir la base (Row Level Security).
-- =====================================================================

-- ── 0. Usuarios y roles ──────────────────────────────────────────────
-- Cada usuario de Supabase Auth tiene un perfil. Los que se registran en la tienda
-- son "cliente"; los del equipo se marcan "staff" a mano (ver README).
create table public.perfiles (
  id      uuid primary key references auth.users (id) on delete cascade,
  rol     text not null default 'cliente' check (rol in ('cliente','staff')),
  nombre  text
);

-- ¿El usuario actual es del equipo? (security definer: lo puede consultar cualquiera
-- sin necesitar permiso sobre perfiles; stable: se evalúa una vez por consulta)
create or replace function public.es_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles where id = auth.uid() and rol = 'staff');
$$;

-- ── Codificación (como en un ERP) ────────────────────────────────────
-- Cada maestro tiene, además del id interno, un CÓDIGO legible y editable:
--   rubro ZAP · subrubro ZAP-RUN · marca NIK · color NEG · artículo ZAP-0001 ·
--   SKU ZAP-0001-42-NEG · cliente 1001 · comprobante 0001-00000123
-- Si al dar de alta no se indica, se genera solo.
--
-- Claves (convención de todo el modelo):
--   • Clave primaria: "id" (bigint autonumérico). Nunca se muestra ni se escribe a mano.
--     Excepciones: perfiles.id = id del usuario de Auth; stock y numeradores tienen clave compuesta.
--   • Clave foránea: "<tabla en singular>_id" (producto_id, talle_id, cliente_id…), siempre con índice.
--   • El "codigo" es lo que ve y busca la gente: único, en mayúsculas, editable.
--   • Al borrar: lo que tiene historia (artículos, talles, colores, clientes, comprobantes) NO se
--     puede borrar (restrict): se desactiva. Solo se borra en cascada lo que es parte de otra fila
--     (los renglones de una venta, el stock de una variante sin movimientos, las notas de un cliente).

-- Código corto a partir del nombre: "Zapatilla" → ZAP; si ya existe, ZA2, ZA3…
create or replace function public._codigo_corto(p_nombre text, p_tabla text, p_largo int default 3, p_prefijo text default '')
returns text language plpgsql set search_path = public as $$
declare v_base text; v_cod text; v_n int := 1; v_existe boolean;
begin
  v_base := upper(left(regexp_replace(translate(coalesce(p_nombre, ''), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'), '[^A-Za-z0-9]', '', 'g'), p_largo));
  if v_base = '' then v_base := 'X'; end if;
  v_cod := p_prefijo || v_base;
  loop
    execute format('select exists (select 1 from %I where codigo = $1)', p_tabla) into v_existe using v_cod;
    exit when not v_existe;
    v_n := v_n + 1;
    v_cod := p_prefijo || left(v_base, p_largo - length(v_n::text)) || v_n;
  end loop;
  return v_cod;
end $$;

-- Trigger genérico: completa "codigo" desde "nombre" si vino vacío
create or replace function public._completar_codigo() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(trim(new.codigo), '') = '' then new.codigo := _codigo_corto(new.nombre, TG_TABLE_NAME); end if;
  new.codigo := upper(trim(new.codigo));
  return new;
end $$;

-- Numerador de comprobantes por tipo y punto de venta (como el talonario de un ERP).
-- El "for update" hace que dos ventas simultáneas nunca reciban el mismo número.
create table public.numeradores (
  tipo         text not null,               -- VEN (ventas), PED (pedidos), COM (compras)
  punto_venta  int  not null default 1,
  ultimo       int  not null default 0,
  primary key (tipo, punto_venta)
);
insert into public.numeradores (tipo) values ('VEN'), ('PED'), ('COM');

create or replace function public._numerar() returns trigger
language plpgsql set search_path = public as $$
declare v_tipo text := TG_ARGV[0];
begin
  insert into numeradores (tipo, punto_venta) values (v_tipo, new.punto_venta) on conflict do nothing;
  update numeradores set ultimo = ultimo + 1 where tipo = v_tipo and punto_venta = new.punto_venta
  returning ultimo into new.numero;
  return new;
end $$;

-- ── 1. Catálogo ──────────────────────────────────────────────────────
create table public.marcas (
  id      bigint generated always as identity primary key,
  codigo  text not null unique check (codigo = upper(codigo)),   -- NIK
  nombre  text not null unique
);

-- Rubros y subrubros
create table public.categorias (
  id      bigint generated always as identity primary key,
  codigo  text not null unique check (codigo = upper(codigo)),   -- ZAP
  nombre  text not null unique                -- Zapatilla, Bota, Sandalia…
);

create table public.subcategorias (
  id            bigint generated always as identity primary key,
  categoria_id  bigint not null references public.categorias (id) on delete restrict,
  codigo        text not null unique check (codigo = upper(codigo)),  -- ZAP-RUN
  nombre        text not null,                -- Running, Urbana, Básquet…
  unique (categoria_id, nombre)
);

create or replace function public._codigo_subcategoria() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(trim(new.codigo), '') = '' then
    new.codigo := _codigo_corto(new.nombre, 'subcategorias', 3,
                                (select codigo from categorias where id = new.categoria_id) || '-');
  end if;
  new.codigo := upper(trim(new.codigo));
  return new;
end $$;

-- Talles: tabla propia para que ordenen bien (38 < 38.5 < 39; S < M < L) y no haya "42" y "42 " distintos
create table public.talles (
  id      bigint generated always as identity primary key,
  nombre  text not null unique,                -- "38", "38.5", "M"
  orden   numeric not null,                    -- para ordenar: 38, 38.5…; letras: S=1001, M=1002…
  tipo    text not null default 'Adulto' check (tipo in ('Adulto','Niños'))
);

-- Colores: tabla propia ("Negro" es uno solo) con su muestra para la tienda
create table public.colores (
  id      bigint generated always as identity primary key,
  codigo  text not null unique check (codigo = upper(codigo)),   -- NEG
  nombre  text not null unique,
  hex     text check (hex ~ '^#[0-9a-fA-F]{6}$')   -- "#000000"
);

-- Sin duplicados "disfrazados": "Nike" y "nike", o "xl" y "XL", son el mismo (si no, el desplegable
-- mostraría dos y el stock se partiría en dos SKUs). El `unique` de la columna no alcanza: distingue mayúsculas.
create unique index marcas_nombre_sin_mayus        on public.marcas (lower(nombre));
create unique index categorias_nombre_sin_mayus    on public.categorias (lower(nombre));
create unique index subcategorias_nombre_sin_mayus on public.subcategorias (categoria_id, lower(nombre));
create unique index talles_nombre_sin_mayus        on public.talles (upper(nombre));
create unique index colores_nombre_sin_mayus       on public.colores (lower(nombre));

create sequence public.seq_articulo;

create table public.productos (
  id             bigint generated always as identity primary key,
  codigo         text not null unique check (codigo = upper(codigo)),  -- código de artículo: ZAP-0001
  nombre         text not null,               -- "Zapatilla Running Pro"
  marca_id       bigint references public.marcas (id) on delete restrict,
  categoria_id   bigint references public.categorias (id) on delete restrict,
  subcategoria_id bigint references public.subcategorias (id) on delete restrict,
  genero         text check (genero in ('Hombre','Mujer','Unisex','Niños')),
  descripcion    text,
  imagen_url     text,                        -- foto principal (URL)
  -- Precio de compra de referencia (sin importar a quién): el último costo pagado. Lo actualiza cada compra
  -- y es el que se usa para el margen. El precio de CADA proveedor está en producto_proveedores.
  precio_compra  numeric(12,2) not null default 0 check (precio_compra >= 0),
  precio_venta   numeric(12,2) not null default 0 check (precio_venta >= 0),
  publicado_web  boolean not null default false,  -- se muestra en la tienda
  activo         boolean not null default true,   -- false = discontinuado
  creado_en      timestamptz not null default now()
);

-- Código de artículo: rubro + número correlativo (ZAP-0001), si no se indicó uno.
-- Además valida que el subrubro pertenezca al rubro del producto.
create or replace function public._codigo_producto() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.subcategoria_id is not null and not exists (
       select 1 from subcategorias where id = new.subcategoria_id and categoria_id is not distinct from new.categoria_id) then
    raise exception 'El subrubro elegido no pertenece al rubro del producto';
  end if;
  if coalesce(trim(new.codigo), '') = '' then
    new.codigo := coalesce((select codigo from categorias where id = new.categoria_id), 'ART')
                  || '-' || lpad(nextval('seq_articulo')::text, 4, '0');
  end if;
  new.codigo := upper(trim(new.codigo));
  return new;
end $$;

-- El artículo vendible: un modelo en un talle y un color
create table public.variantes (
  id            bigint generated always as identity primary key,
  producto_id   bigint not null references public.productos (id) on delete restrict,
  talle_id      bigint not null references public.talles (id) on delete restrict,
  color_id      bigint not null references public.colores (id) on delete restrict,
  sku           text unique,                  -- código propio o de barras
  precio_venta  numeric(12,2) check (precio_venta >= 0),  -- si es null, vale el del producto
  stock_minimo  integer not null default 1 check (stock_minimo >= 0),
  unique (producto_id, talle_id, color_id)
);
create index on public.variantes (producto_id);

-- SKU legible: artículo-talle-color (ZAP-0001-42-NEG), si no se cargó un código de barras
create or replace function public._sku_variante() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(trim(new.sku), '') = '' then
    new.sku := (select codigo from productos where id = new.producto_id)
               || '-' || (select replace(nombre, ' ', '') from talles where id = new.talle_id)
               || '-' || (select codigo from colores where id = new.color_id);
  end if;
  return new;
end $$;

-- Busca un talle o color por nombre y lo crea si no existe (lo usa la app al dar de alta variantes)
create or replace function public.buscar_talle(p_nombre text) returns bigint
language plpgsql set search_path = public as $$
declare v_id bigint; v_n text := upper(replace(trim(p_nombre), ',', '.'));   -- "xl" → XL, "38,5" → 38.5
begin
  select id into v_id from talles where upper(nombre) = v_n;
  if v_id is null then
    insert into talles (nombre, orden, tipo)
    values (v_n,
            -- numérico: su valor; letras: después de los números, en orden de talle de ropa
            coalesce(case when v_n ~ '^[0-9]+([.,][0-9]+)?$' then replace(v_n, ',', '.')::numeric end,
                     1000 + coalesce(array_position(array['XS','S','M','L','XL','XXL'], upper(v_n)), 50)),
            case when v_n ~ '^[0-9]+([.,][0-9]+)?$' and replace(v_n, ',', '.')::numeric < 35 then 'Niños' else 'Adulto' end)
    returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function public.buscar_color(p_nombre text) returns bigint
language plpgsql set search_path = public as $$
declare v_id bigint; v_n text := initcap(trim(p_nombre));
begin
  select id into v_id from colores where lower(nombre) = lower(v_n);
  if v_id is null then insert into colores (nombre) values (v_n) returning id into v_id; end if;
  return v_id;
end $$;

-- ── 2. Operación ─────────────────────────────────────────────────────
-- Locales y depósitos. Arranca con uno solo; abrir otro local es agregar una fila.
create table public.depositos (
  id      bigint generated always as identity primary key,
  nombre  text not null unique,
  activo  boolean not null default true
);
insert into public.depositos (nombre) values ('Local');

create table public.stock (
  variante_id  bigint not null references public.variantes (id) on delete cascade,
  deposito_id  bigint not null references public.depositos (id) on delete restrict,
  cantidad     integer not null default 0 check (cantidad >= 0),
  reservado    integer not null default 0 check (reservado >= 0),   -- comprometido en pedidos
  primary key (variante_id, deposito_id),
  check (reservado <= cantidad)
);

-- ── 3. Clientes (CRM) ────────────────────────────────────────────────
create sequence public.seq_cliente start 1001;
create sequence public.seq_proveedor start 1001;

create table public.clientes (
  id              bigint generated always as identity primary key,
  codigo          int not null unique default nextval('public.seq_cliente'),  -- como el cod_cliente de un ERP
  usuario_id      uuid unique references auth.users (id) on delete set null,  -- si se registró en la tienda
  nombre          text not null,
  documento       text,                       -- DNI o CUIT
  telefono        text,
  email           text,
  direccion       text,
  localidad       text,
  fecha_nacimiento date,
  origen          text check (origen in ('Local','Instagram','WhatsApp','Web','Referido','Otro')),
  etiquetas       text[] not null default '{}',  -- "mayorista", "running", "vip"…
  acepta_promos   boolean not null default true,
  notas           text,
  creado_en       timestamptz not null default now()
);

-- Seguimientos: cada contacto con el cliente, y la próxima acción pendiente
create table public.interacciones (
  id              bigint generated always as identity primary key,
  cliente_id      bigint not null references public.clientes (id) on delete cascade,
  fecha           timestamptz not null default now(),
  tipo            text not null check (tipo in ('Consulta','Seguimiento','Reclamo','Promoción','Nota')),
  canal           text check (canal in ('Local','WhatsApp','Instagram','Teléfono','Email','Web')),
  detalle         text not null,
  proxima_accion  text,                       -- "Avisarle cuando entre el 42"
  proxima_fecha   date,
  hecha           boolean not null default false,
  usuario_id      uuid default auth.uid()
);
create index on public.interacciones (cliente_id, fecha);
create index on public.interacciones (proxima_fecha) where not hecha;

create table public.proveedores (
  id         bigint generated always as identity primary key,
  codigo     int not null unique default nextval('public.seq_proveedor'),
  nombre     text not null,
  documento  text,
  telefono   text,
  email      text,
  notas      text,
  creado_en  timestamptz not null default now()
);

-- Qué proveedores venden cada artículo y a cuánto (un artículo puede tener varios).
-- Es la "lista de precios de compra": al cargar una factura de ese proveedor, se propone su precio.
create table public.producto_proveedores (
  id                bigint generated always as identity primary key,
  producto_id       bigint not null references public.productos (id) on delete cascade,
  proveedor_id      bigint not null references public.proveedores (id) on delete cascade,
  codigo_proveedor  text,                     -- cómo figura en la factura del proveedor ("RUNPRO-NG")
  precio_lista      numeric(12,2) not null check (precio_lista >= 0),
  bonificacion_pct  numeric(5,2) not null default 0 check (bonificacion_pct >= 0 and bonificacion_pct < 100),
  precio_compra     numeric(12,2) generated always as (round(precio_lista * (1 - bonificacion_pct / 100), 2)) stored,
  principal         boolean not null default false,   -- el proveedor habitual de ese artículo
  actualizado_en    timestamptz not null default now(),
  unique (producto_id, proveedor_id)
);
-- Un solo proveedor principal por artículo
create unique index producto_proveedores_un_principal on public.producto_proveedores (producto_id) where principal;

-- Medios de pago, cada uno con su descuento o recargo ("10 % off en efectivo", "3 cuotas +15 %").
-- El % se COPIA en cada pago: si mañana cambia, las ventas viejas no se recalculan.
create table public.medios_pago (
  id            bigint generated always as identity primary key,
  codigo        text not null unique check (codigo = upper(codigo)),   -- EFE, TRA, CR3
  nombre        text not null,
  tipo          text not null check (tipo in ('Efectivo','Transferencia','Débito','Crédito','Billetera','Otro')),  -- para la caja y los reportes
  ajuste_pct    numeric(5,2) not null default 0 check (ajuste_pct between -100 and 100),  -- −10 = 10 % de descuento · +15 = 15 % de recargo
  cuotas        int not null default 1 check (cuotas >= 1),
  en_mostrador  boolean not null default true,    -- se ofrece al vender en el local
  en_tienda     boolean not null default false,   -- se ofrece en la tienda online
  activo        boolean not null default true,
  orden         int not null default 0
);
create unique index medios_pago_nombre_sin_mayus on public.medios_pago (lower(nombre));
-- Los de siempre, sin descuentos: cada negocio pone los suyos en Tablas
insert into public.medios_pago (codigo, nombre, tipo, en_mostrador, en_tienda, orden) values
  ('EFE', 'Efectivo',      'Efectivo',      true,  true,  1),
  ('TRA', 'Transferencia', 'Transferencia', true,  true,  2),
  ('DEB', 'Débito',        'Débito',        true,  false, 3),
  ('CRE', 'Crédito',       'Crédito',       true,  false, 4),
  ('MP',  'Mercado Pago',  'Billetera',     true,  true,  5);

-- ── 4. Pedidos (tienda online, WhatsApp, Instagram…) ─────────────────
create table public.pedidos (
  id            bigint generated always as identity primary key,
  punto_venta   int not null default 1,
  numero        int,                          -- lo asigna el numerador
  comprobante   text generated always as (lpad(punto_venta::text, 4, '0') || '-' || lpad(numero::text, 8, '0')) stored,
  fecha         timestamptz not null default now(),
  cliente_id    bigint not null references public.clientes (id) on delete restrict,
  canal         text not null default 'Web' check (canal in ('Web','WhatsApp','Instagram','Local')),
  estado        text not null default 'pendiente'
                check (estado in ('pendiente','confirmado','preparado','enviado','listo_retiro','entregado','cancelado')),
  entrega       text not null default 'retiro' check (entrega in ('retiro','envio')),
  direccion_envio text,
  medio_pago_id bigint not null references public.medios_pago (id) on delete restrict,
  ajuste_pct    numeric(5,2) not null default 0,        -- el % del medio de pago al hacer el pedido (queda fijo)
  deposito_id   bigint not null references public.depositos (id) on delete restrict,
  subtotal      numeric(12,2) not null default 0 check (subtotal >= 0),   -- suma de los artículos
  ajuste_medio_pago numeric(12,2) not null default 0,  -- descuento (−) o recargo (+) por el medio de pago
  total         numeric(12,2) not null default 0 check (total >= 0),
  notas         text,
  check (total = subtotal + ajuste_medio_pago)
);
create index on public.pedidos (cliente_id);
create index on public.pedidos (estado);

create table public.pedido_items (
  id               bigint generated always as identity primary key,
  pedido_id        bigint not null references public.pedidos (id) on delete cascade,
  variante_id      bigint not null references public.variantes (id) on delete restrict,
  cantidad         integer not null check (cantidad > 0),
  precio_unitario  numeric(12,2) not null check (precio_unitario >= 0)
);
create index on public.pedido_items (pedido_id);

-- Historial de estados: es lo que el cliente ve como "seguimiento" de su pedido
create table public.pedido_estados (
  id          bigint generated always as identity primary key,
  pedido_id   bigint not null references public.pedidos (id) on delete cascade,
  estado      text not null,
  fecha       timestamptz not null default now(),
  comentario  text,                           -- "Sale hoy por Andreani, n.º …"
  usuario_id  uuid default auth.uid()
);
create index on public.pedido_estados (pedido_id);

-- ── 5. Ventas, pagos y compras ───────────────────────────────────────
create table public.ventas (
  id           bigint generated always as identity primary key,
  punto_venta  int not null default 1,
  numero       int,                           -- lo asigna el numerador
  comprobante  text generated always as (lpad(punto_venta::text, 4, '0') || '-' || lpad(numero::text, 8, '0')) stored,
  fecha        timestamptz not null default now(),
  cliente_id   bigint references public.clientes (id) on delete restrict,
  pedido_id    bigint unique references public.pedidos (id) on delete restrict,  -- si viene de un pedido
  deposito_id  bigint not null references public.depositos (id) on delete restrict,
  canal        text not null default 'Local' check (canal in ('Local','Web','WhatsApp','Instagram')),
  subtotal     numeric(12,2) not null check (subtotal >= 0),       -- suma de los artículos
  descuento    numeric(12,2) not null default 0 check (descuento >= 0),  -- descuento manual del vendedor
  ajuste_medio_pago numeric(12,2) not null default 0,             -- suma de descuentos/recargos de los pagos
  total        numeric(12,2) not null check (total >= 0),          -- lo que paga el cliente
  notas        text,
  vendedor_id  uuid default auth.uid(),
  check (descuento <= subtotal),
  check (total = subtotal - descuento + ajuste_medio_pago)
);
create index on public.ventas (fecha);
create index on public.ventas (cliente_id);

create table public.venta_items (
  id               bigint generated always as identity primary key,
  venta_id         bigint not null references public.ventas (id) on delete cascade,
  variante_id      bigint not null references public.variantes (id) on delete restrict,
  cantidad         integer not null check (cantidad > 0),
  precio_unitario  numeric(12,2) not null check (precio_unitario >= 0),
  costo_unitario   numeric(12,2) not null default 0   -- el costo de ese momento, para el margen
);
create index on public.venta_items (venta_id);
create index on public.venta_items (variante_id);

-- Una venta puede pagarse con varios medios. Cada pago cubre una parte del precio ("base")
-- y su medio le aplica el descuento o recargo:  monto cobrado = base + ajuste.
--   Ej.: venta de $100.000 → $60.000 en efectivo (−10 %) + $40.000 en 3 cuotas (+15 %)
--        pagos: base 60.000, ajuste −6.000, monto 54.000 · base 40.000, ajuste +6.000, monto 46.000
create table public.pagos (
  id             bigint generated always as identity primary key,
  fecha          timestamptz not null default now(),
  venta_id       bigint not null references public.ventas (id) on delete cascade,
  medio_pago_id  bigint not null references public.medios_pago (id) on delete restrict,
  base           numeric(12,2) not null check (base > 0),
  ajuste_pct     numeric(5,2) not null default 0,     -- copia del % del medio en ese momento
  ajuste         numeric(12,2) not null default 0,    -- en pesos (negativo = descuento)
  monto          numeric(12,2) generated always as (base + ajuste) stored,   -- lo que entró a caja
  cuotas         int not null default 1,
  referencia     text,                                -- n.º de operación, cupón…
  check (base + ajuste >= 0)
);
create index on public.pagos (venta_id);

create table public.compras (
  id            bigint generated always as identity primary key,
  punto_venta   int not null default 1,
  numero        int,                          -- número interno de ingreso
  comprobante   text generated always as (lpad(punto_venta::text, 4, '0') || '-' || lpad(numero::text, 8, '0')) stored,
  comprobante_proveedor text,                 -- n.º de factura o remito del proveedor
  fecha_comprobante date,                     -- fecha que dice la factura (puede ser anterior a la carga)
  fecha         timestamptz not null default now(),
  proveedor_id  bigint references public.proveedores (id) on delete restrict,
  deposito_id   bigint not null references public.depositos (id) on delete restrict,
  total         numeric(12,2) not null check (total >= 0),
  notas         text,
  usuario_id    uuid default auth.uid()
);

create table public.compra_items (
  id              bigint generated always as identity primary key,
  compra_id       bigint not null references public.compras (id) on delete cascade,
  variante_id     bigint not null references public.variantes (id) on delete restrict,
  cantidad        integer not null check (cantidad > 0),
  costo_unitario  numeric(12,2) not null check (costo_unitario >= 0)
);
create index on public.compra_items (compra_id);

-- Todo lo que mueve el stock (entradas +, salidas −)
create table public.movimientos_stock (
  id           bigint generated always as identity primary key,
  fecha        timestamptz not null default now(),
  variante_id  bigint not null references public.variantes (id) on delete restrict,
  deposito_id  bigint not null references public.depositos (id) on delete restrict,
  tipo         text not null check (tipo in ('venta','compra','ajuste')),
  cantidad     integer not null check (cantidad <> 0),
  venta_id     bigint references public.ventas (id) on delete restrict,
  compra_id    bigint references public.compras (id) on delete restrict,
  motivo       text,
  usuario_id   uuid default auth.uid()
);
create index on public.movimientos_stock (variante_id, fecha);

-- ── Índices de claves foráneas ───────────────────────────────────────
-- Postgres no los crea solo: sin ellos, filtrar y unir por estas columnas se vuelve lento al crecer.
create index on public.productos (marca_id);
create index on public.productos (categoria_id);
create index on public.productos (subcategoria_id);
create index on public.variantes (talle_id);
create index on public.variantes (color_id);
create index on public.stock (deposito_id);
create index on public.pedidos (deposito_id);
create index on public.pedido_items (variante_id);
create index on public.ventas (deposito_id);
create index on public.pagos (medio_pago_id);
create index on public.pedidos (medio_pago_id);
create index on public.producto_proveedores (proveedor_id);
create index on public.compras (proveedor_id);
create index on public.compras (deposito_id);
create index on public.compra_items (variante_id);
create index on public.movimientos_stock (deposito_id);
create index on public.movimientos_stock (venta_id);
create index on public.movimientos_stock (compra_id);

-- ── Triggers de codificación y numeración ────────────────────────────
create trigger codigo before insert or update of codigo on public.marcas     for each row execute function public._completar_codigo();
create trigger codigo before insert or update of codigo on public.categorias for each row execute function public._completar_codigo();
create trigger codigo before insert or update of codigo on public.colores    for each row execute function public._completar_codigo();
create trigger codigo before insert or update of codigo on public.medios_pago for each row execute function public._completar_codigo();
create trigger codigo before insert or update of codigo on public.subcategorias for each row execute function public._codigo_subcategoria();
create trigger codigo before insert or update of codigo, categoria_id, subcategoria_id on public.productos for each row execute function public._codigo_producto();
create trigger sku    before insert on public.variantes for each row execute function public._sku_variante();
create trigger numero before insert on public.ventas   for each row execute function public._numerar('VEN');
create trigger numero before insert on public.pedidos  for each row execute function public._numerar('PED');
create trigger numero before insert on public.compras  for each row execute function public._numerar('COM');
-- Marcar un proveedor como principal desmarca al anterior (así nunca hay dos)
create or replace function public._un_solo_principal() returns trigger
language plpgsql set search_path = public as $$
begin
  update producto_proveedores set principal = false
   where producto_id = new.producto_id and principal and id <> new.id;
  return new;
end $$;
create trigger principal before insert or update of principal on public.producto_proveedores
  for each row when (new.principal) execute function public._un_solo_principal();
alter table public.ventas  add unique (punto_venta, numero);
alter table public.pedidos add unique (punto_venta, numero);
alter table public.compras add unique (punto_venta, numero);

-- ── Funciones internas ───────────────────────────────────────────────
create or replace function public.deposito_principal() returns bigint
language sql stable set search_path = public as $$
  select id from depositos where activo order by id limit 1;
$$;

-- Precio de una variante: el propio si tiene, si no el del producto
create or replace function public.precio_de(p_variante bigint) returns numeric
language sql stable set search_path = public as $$
  select coalesce(v.precio_venta, p.precio_venta) from variantes v join productos p on p.id = v.producto_id where v.id = p_variante;
$$;

-- Suma (o resta) stock y deja el movimiento. Base de todas las demás.
create or replace function public._mover_stock(
  p_variante bigint, p_deposito bigint, p_cantidad int, p_tipo text,
  p_venta bigint default null, p_compra bigint default null, p_motivo text default null
) returns void language plpgsql set search_path = public as $$
begin
  -- La llaman las funciones de venta, compra y ajuste (que corren con los permisos del usuario)
  if not es_staff() then raise exception 'Solo el equipo puede mover stock'; end if;
  insert into stock (variante_id, deposito_id, cantidad) values (p_variante, p_deposito, 0)
  on conflict do nothing;
  update stock set cantidad = cantidad + p_cantidad
   where variante_id = p_variante and deposito_id = p_deposito;
  insert into movimientos_stock (variante_id, deposito_id, tipo, cantidad, venta_id, compra_id, motivo)
  values (p_variante, p_deposito, p_tipo, p_cantidad, p_venta, p_compra, p_motivo);
exception when check_violation then
  raise exception 'Stock insuficiente para esa operación';
end $$;

-- ── Funciones de la operación (las llama el equipo) ──────────────────
-- p_items: [{"variante_id": 1, "cantidad": 2, "precio_unitario": 85000}, …]
-- p_pagos: [{"medio_pago_id": 1, "base": 60000}, {"medio_pago_id": 4}, …]
--   "base" = qué parte del precio cubre ese medio; si no viene, cubre lo que falta.
--   "ajuste_pct" (opcional) fija el % en vez de tomar el del medio (lo usa un pedido para respetar
--   el precio prometido). Vacío = venta sin cobrar todavía (queda saldo).
create or replace function public.registrar_venta(
  p_items jsonb, p_pagos jsonb default '[]', p_cliente bigint default null,
  p_descuento numeric default 0, p_canal text default 'Local',
  p_deposito bigint default null, p_notas text default null
) returns bigint language plpgsql security invoker set search_path = public as $$
declare v_id bigint; it jsonb; v_sub numeric; v_resto numeric; v_base numeric; v_pct numeric; v_aj numeric;
        v_ajustes numeric := 0; v_pagos jsonb := '[]'; v_medio medios_pago;
        v_dep bigint := coalesce(p_deposito, deposito_principal()); v_disp int;
begin
  if not es_staff() then raise exception 'Solo el equipo puede registrar ventas'; end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'La venta no tiene productos'; end if;
  select coalesce(sum((i->>'cantidad')::int * (i->>'precio_unitario')::numeric), 0) into v_sub from jsonb_array_elements(p_items) i;
  if coalesce(p_descuento, 0) < 0 then raise exception 'El descuento no puede ser negativo'; end if;
  if p_descuento > v_sub then raise exception 'El descuento es mayor que el total'; end if;

  -- Primero se calculan los pagos: cada uno cubre una parte y su medio le suma o resta un %
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
    -- "for update": dos ventas simultáneas no pueden vender el mismo último par
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

-- p_items: [{"variante_id": 1, "cantidad": 6, "costo_unitario": 40000}, …]
-- Con p_actualizar_costo: actualiza el precio de compra del artículo y, si hay proveedor, SU precio
-- en producto_proveedores (lo crea si es la primera vez que le compra ese artículo).
create or replace function public.registrar_compra(
  p_items jsonb, p_proveedor bigint default null, p_notas text default null,
  p_actualizar_costo boolean default true, p_deposito bigint default null,
  p_comprobante_proveedor text default null, p_fecha_comprobante date default null
) returns bigint language plpgsql security invoker set search_path = public as $$
declare v_id bigint; it jsonb; v_total numeric; v_dep bigint := coalesce(p_deposito, deposito_principal());
        v_prod bigint; v_costo numeric;
begin
  if not es_staff() then raise exception 'Solo el equipo puede registrar compras'; end if;
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
        -- Se respeta la bonificación que tenga cargada ese proveedor: se recalcula su precio de lista
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

-- Corrige el stock a lo contado (inventario, rotura, pérdida…)
create or replace function public.ajustar_stock(p_variante bigint, p_stock_nuevo int, p_motivo text, p_deposito bigint default null)
returns void language plpgsql security invoker set search_path = public as $$
declare v_dep bigint := coalesce(p_deposito, deposito_principal()); v_actual int; v_res int;
begin
  if not es_staff() then raise exception 'Solo el equipo puede ajustar stock'; end if;
  if p_stock_nuevo < 0 then raise exception 'El stock no puede ser negativo'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Indicá el motivo del ajuste'; end if;
  select cantidad, reservado into v_actual, v_res from stock where variante_id = p_variante and deposito_id = v_dep for update;
  if p_stock_nuevo < coalesce(v_res, 0) then raise exception 'Hay % pares reservados en pedidos: el stock no puede quedar por debajo', v_res; end if;
  if coalesce(v_actual, 0) = p_stock_nuevo then return; end if;
  perform _mover_stock(p_variante, v_dep, p_stock_nuevo - coalesce(v_actual, 0), 'ajuste', null, null, p_motivo);
end $$;

-- ── Pedidos ──────────────────────────────────────────────────────────
-- Lo llama un cliente desde la tienda (o el equipo, indicando p_cliente).
-- Valida disponibilidad, usa los precios vigentes (no los que mande el navegador) y RESERVA stock.
-- security definer: el cliente no tiene permiso directo sobre stock ni pedidos; la función sí.
create or replace function public.crear_pedido(
  p_items jsonb, p_entrega text default 'retiro', p_direccion text default null,
  p_medio_pago bigint default null, p_notas text default null,
  p_cliente bigint default null, p_canal text default 'Web'
) returns bigint language plpgsql security definer set search_path = public as $$
declare v_cliente bigint; v_id bigint; it jsonb; v_dep bigint := deposito_principal(); v_disp int; v_precio numeric;
        v_sub numeric := 0; v_aj numeric; v_medio medios_pago;
begin
  if auth.uid() is null then raise exception 'Tenés que ingresar para hacer un pedido'; end if;
  if es_staff() and p_cliente is not null then v_cliente := p_cliente;
  else
    select id into v_cliente from clientes where usuario_id = auth.uid();
    if v_cliente is null then raise exception 'Tu usuario no tiene ficha de cliente'; end if;
  end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'El pedido está vacío'; end if;
  if p_entrega = 'envio' and coalesce(trim(p_direccion), '') = '' then raise exception 'Falta la dirección de envío'; end if;
  -- El cliente solo puede elegir los medios habilitados para la tienda
  select * into v_medio from medios_pago where id = p_medio_pago and activo and (en_tienda or es_staff());
  if not found then raise exception 'Elegí un medio de pago válido'; end if;

  insert into pedidos (cliente_id, canal, entrega, direccion_envio, medio_pago_id, ajuste_pct, deposito_id, notas)
  values (v_cliente, case when es_staff() then p_canal else 'Web' end, p_entrega, p_direccion,
          v_medio.id, v_medio.ajuste_pct, v_dep, p_notas)
  returning id into v_id;

  for it in select * from jsonb_array_elements(p_items) loop
    if (it->>'cantidad')::int <= 0 then raise exception 'Cantidad inválida'; end if;
    -- solo productos publicados y activos
    select precio_de(v.id) into v_precio from variantes v join productos p on p.id = v.producto_id
     where v.id = (it->>'variante_id')::bigint and p.activo and (p.publicado_web or es_staff());
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

-- El equipo avanza el pedido. "entregado" lo convierte en venta; "cancelado" libera la reserva.
-- p_pagos (solo al entregar): como en registrar_venta. Vacío = se cobra todo con el medio que eligió
-- el cliente y con el % que tenía al hacer el pedido (se respeta el precio prometido).
create or replace function public.cambiar_estado_pedido(
  p_pedido bigint, p_estado text, p_comentario text default null, p_pagos jsonb default '[]'
) returns bigint language plpgsql security invoker set search_path = public as $$
declare v_ped pedidos; it record; v_venta bigint;
begin
  if not es_staff() then raise exception 'Solo el equipo puede cambiar el estado de un pedido'; end if;
  select * into v_ped from pedidos where id = p_pedido for update;
  if not found then raise exception 'El pedido no existe'; end if;
  if v_ped.estado in ('entregado','cancelado') then raise exception 'El pedido ya está %', v_ped.estado; end if;

  if p_estado = 'cancelado' then
    for it in select * from pedido_items where pedido_id = p_pedido loop
      update stock set reservado = reservado - it.cantidad where variante_id = it.variante_id and deposito_id = v_ped.deposito_id;
    end loop;
  elsif p_estado = 'entregado' then
    -- libera la reserva y registra la venta (que descuenta el stock)
    for it in select * from pedido_items where pedido_id = p_pedido loop
      update stock set reservado = reservado - it.cantidad where variante_id = it.variante_id and deposito_id = v_ped.deposito_id;
    end loop;
    v_venta := registrar_venta(
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

-- ── Alta automática al registrarse en la tienda ──────────────────────
-- Crea el perfil (rol cliente) y su ficha en el CRM, o la vincula si ya existía con ese email.
create or replace function public._nuevo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_nombre text := coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1));
begin
  insert into perfiles (id, rol, nombre) values (new.id, 'cliente', v_nombre) on conflict (id) do nothing;
  update clientes set usuario_id = new.id where usuario_id is null and lower(email) = lower(new.email);
  if not found then
    insert into clientes (usuario_id, nombre, email, telefono, origen)
    values (new.id, v_nombre, new.email, new.raw_user_meta_data->>'telefono', 'Web');
  end if;
  return new;
end $$;
create trigger al_registrarse after insert on auth.users for each row execute function public._nuevo_usuario();

-- ── Vistas ───────────────────────────────────────────────────────────
-- Stock interno (solo equipo: la vista hereda los permisos de quien consulta)
create or replace view public.v_stock with (security_invoker = true) as
select v.id as variante_id, p.id as producto_id, p.codigo, p.nombre, m.nombre as marca, c.nombre as categoria,
       t.nombre as talle, t.orden as talle_orden, co.nombre as color, co.hex as color_hex,
       v.sku, d.id as deposito_id, d.nombre as deposito,
       coalesce(s.cantidad, 0) as stock, coalesce(s.reservado, 0) as reservado,
       coalesce(s.cantidad, 0) - coalesce(s.reservado, 0) as disponible, v.stock_minimo,
       p.precio_compra, coalesce(v.precio_venta, p.precio_venta) as precio_venta,
       coalesce(s.cantidad, 0) * p.precio_compra as valor_costo,
       coalesce(s.cantidad, 0) - coalesce(s.reservado, 0) <= v.stock_minimo as stock_bajo
from variantes v
join productos p on p.id = v.producto_id
join talles t on t.id = v.talle_id
join colores co on co.id = v.color_id
cross join depositos d
left join stock s on s.variante_id = v.id and s.deposito_id = d.id
left join marcas m on m.id = p.marca_id
left join categorias c on c.id = p.categoria_id
where p.activo and d.activo;

create or replace view public.v_venta_items with (security_invoker = true) as
select vi.*, ve.fecha, ve.canal, ve.cliente_id, p.id as producto_id, p.nombre, m.nombre as marca,
       t.nombre as talle, co.nombre as color,
       vi.cantidad * vi.precio_unitario as subtotal,
       vi.cantidad * (vi.precio_unitario - vi.costo_unitario) as margen
from venta_items vi
join ventas ve on ve.id = vi.venta_id
join variantes v on v.id = vi.variante_id
join productos p on p.id = v.producto_id
join talles t on t.id = v.talle_id
join colores co on co.id = v.color_id
left join marcas m on m.id = p.marca_id;

-- Tabla "plana" para análisis (Power BI, Excel, reportes): cada artículo vendido con todas sus dimensiones.
-- Es la tabla de hechos del modelo estrella ya unida a sus dimensiones.
create or replace view public.v_hechos_ventas with (security_invoker = true) as
select vi.id, ve.id as venta_id, ve.comprobante, ve.fecha, (ve.fecha at time zone 'America/Argentina/Buenos_Aires')::date as dia,
       extract(year from ve.fecha at time zone 'America/Argentina/Buenos_Aires')::int as anio,
       extract(month from ve.fecha at time zone 'America/Argentina/Buenos_Aires')::int as mes,
       extract(isodow from ve.fecha at time zone 'America/Argentina/Buenos_Aires')::int as dia_semana,
       ve.canal, d.nombre as deposito, cl.codigo as cliente_codigo, cl.nombre as cliente, cl.origen as cliente_origen,
       p.codigo as articulo, p.nombre as modelo, m.nombre as marca, ca.codigo as rubro_codigo, ca.nombre as rubro,
       sc.nombre as subrubro, p.genero,
       t.nombre as talle, t.orden as talle_orden, co.nombre as color, v.sku,
       vi.cantidad, vi.precio_unitario, vi.costo_unitario,
       vi.cantidad * vi.precio_unitario as importe,
       vi.cantidad * vi.costo_unitario as costo,
       vi.cantidad * (vi.precio_unitario - vi.costo_unitario) as margen,
       -- Lo mismo, después del descuento manual y del ajuste por medio de pago (prorrateados por importe)
       round(vi.cantidad * vi.precio_unitario * ve.total / nullif(ve.subtotal, 0), 2) as importe_neto,
       round(vi.cantidad * vi.precio_unitario * ve.total / nullif(ve.subtotal, 0) - vi.cantidad * vi.costo_unitario, 2) as margen_neto,
       ve.pedido_id is not null as vino_de_pedido
from venta_items vi
join ventas ve on ve.id = vi.venta_id
join depositos d on d.id = ve.deposito_id
left join clientes cl on cl.id = ve.cliente_id
join variantes v on v.id = vi.variante_id
join productos p on p.id = v.producto_id
left join marcas m on m.id = p.marca_id
left join categorias ca on ca.id = p.categoria_id
left join subcategorias sc on sc.id = p.subcategoria_id
join talles t on t.id = v.talle_id
join colores co on co.id = v.color_id;

-- Catálogo PÚBLICO de la tienda: solo productos publicados, SIN costos y con disponibilidad.
-- No usa security_invoker a propósito: corre con los permisos del dueño y expone solo estas columnas.
create or replace view public.v_catalogo as
select v.id as variante_id, p.id as producto_id, p.nombre, m.nombre as marca, c.nombre as categoria,
       p.genero, p.descripcion, p.imagen_url, t.nombre as talle, t.orden as talle_orden, co.nombre as color, co.hex as color_hex,
       coalesce(v.precio_venta, p.precio_venta) as precio,
       greatest(coalesce(sum(s.cantidad - s.reservado), 0), 0)::int as disponible
from variantes v
join productos p on p.id = v.producto_id
join talles t on t.id = v.talle_id
join colores co on co.id = v.color_id
left join marcas m on m.id = p.marca_id
left join categorias c on c.id = p.categoria_id
left join stock s on s.variante_id = v.id
where p.publicado_web and p.activo
group by v.id, p.id, m.nombre, c.nombre, t.nombre, t.orden, co.nombre, co.hex;

-- ── Seguridad (Row Level Security) ───────────────────────────────────
-- Tablas solo del equipo
do $$
declare t text;
begin
  foreach t in array array['marcas','categorias','subcategorias','talles','colores','productos','variantes','numeradores','depositos','stock','interacciones','proveedores',
                           'ventas','venta_items','pagos','compras','compra_items','movimientos_stock',
                           'producto_proveedores','medios_pago'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "equipo" on public.%I for all to authenticated using (es_staff()) with check (es_staff())', t);
  end loop;
end $$;

-- Tablas compartidas: el equipo ve todo; el cliente, solo lo suyo
alter table public.perfiles enable row level security;
create policy "equipo" on public.perfiles for all to authenticated using (es_staff()) with check (es_staff());
create policy "el propio perfil" on public.perfiles for select to authenticated using (id = auth.uid());

alter table public.clientes enable row level security;
create policy "equipo" on public.clientes for all to authenticated using (es_staff()) with check (es_staff());
create policy "su ficha" on public.clientes for select to authenticated using (usuario_id = auth.uid());
create policy "editar su ficha" on public.clientes for update to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

alter table public.pedidos enable row level security;
create policy "equipo" on public.pedidos for all to authenticated using (es_staff()) with check (es_staff());
create policy "sus pedidos" on public.pedidos for select to authenticated
  using (cliente_id in (select id from clientes where usuario_id = auth.uid()));

alter table public.pedido_items enable row level security;
create policy "equipo" on public.pedido_items for all to authenticated using (es_staff()) with check (es_staff());
create policy "items de sus pedidos" on public.pedido_items for select to authenticated
  using (pedido_id in (select p.id from pedidos p join clientes c on c.id = p.cliente_id where c.usuario_id = auth.uid()));

alter table public.pedido_estados enable row level security;
create policy "equipo" on public.pedido_estados for all to authenticated using (es_staff()) with check (es_staff());
create policy "seguimiento de sus pedidos" on public.pedido_estados for select to authenticated
  using (pedido_id in (select p.id from pedidos p join clientes c on c.id = p.cliente_id where c.usuario_id = auth.uid()));

-- Un cliente puede editar sus datos, pero no los campos internos del CRM ni su vínculo de usuario
create or replace function public._proteger_ficha_cliente() returns trigger
language plpgsql set search_path = public as $$
begin
  -- auth.uid() nulo = proceso interno (alta automática al registrarse, panel de Supabase): se permite
  if auth.uid() is not null and not es_staff() then
    new.usuario_id := old.usuario_id;  new.email := old.email;   new.origen := old.origen;
    new.etiquetas := old.etiquetas;    new.notas := old.notas;   new.creado_en := old.creado_en;
  end if;
  return new;
end $$;
create trigger proteger_ficha before update on public.clientes for each row execute function public._proteger_ficha_cliente();

-- Funciones: nadie anónimo ejecuta nada; las internas, nadie desde afuera
revoke execute on all functions in schema public from public, anon;
grant execute on function public.registrar_venta, public.registrar_compra, public.ajustar_stock,
  public.crear_pedido, public.cambiar_estado_pedido, public.es_staff, public.precio_de,
  public.deposito_principal, public.buscar_talle, public.buscar_color to authenticated;
grant execute on function public._mover_stock to authenticated;  -- verifica es_staff() por dentro

-- La tienda muestra los medios de pago habilitados (y sus descuentos) a cualquiera
create policy "medios de la tienda" on public.medios_pago for select to anon, authenticated using (activo and en_tienda);

-- El catálogo público lo puede ver cualquiera, incluso sin cuenta
grant select on public.v_catalogo to anon, authenticated;
