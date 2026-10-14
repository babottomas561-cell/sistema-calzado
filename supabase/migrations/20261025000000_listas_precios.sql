-- Listas de precios: el precio de lista se ajusta con un % y un redondeo, distinto para el mostrador y para la tienda. APAGADO de fábrica.
--   · `productos.precio_venta` sigue siendo el precio base; la lista del mostrador y la de la tienda lo ajustan (por ejemplo, tienda +10 %, mostrador sin cambios);
--   · el precio lo decide la base: precio_de() (caja, presupuestos, cambios) usa la lista del mostrador; crear_pedido() cotiza con la de la tienda, y v_catalogo la muestra;
--   · apagado, nada cambia. Agrega, no rompe: el código de la versión anterior sigue andando.

create table public.listas_precios (
  id         bigint generated always as identity primary key,
  nombre     text not null check (length(trim(nombre)) between 1 and 40),
  ajuste_pct numeric(6,2) not null default 0 check (ajuste_pct between -90 and 500),   -- + sube, − baja
  redondeo   int not null default 0 check (redondeo in (0, 10, 50, 100, 500, 1000)),     -- 0 = sin redondear; si no, al múltiplo más cercano
  activa     boolean not null default true,
  creado_en  timestamptz not null default now()
);
create unique index listas_precios_nombre_key on public.listas_precios (lower(nombre));
alter table public.listas_precios enable row level security;
create policy "el equipo ve las listas de precios" on public.listas_precios for select to authenticated using (es_staff());

alter table public.configuracion_tienda
  add column listas_precios_activas boolean not null default false,
  add column lista_mostrador_id bigint references public.listas_precios (id) on delete restrict,
  add column lista_tienda_id    bigint references public.listas_precios (id) on delete restrict;
create index configuracion_tienda_lista_mostrador_idx on public.configuracion_tienda (lista_mostrador_id);
create index configuracion_tienda_lista_tienda_idx on public.configuracion_tienda (lista_tienda_id);

-- La cuenta (la misma en la base y en lib/listas.ts)
create function public._aplicar_lista(p_precio numeric, p_pct numeric, p_redondeo int) returns numeric
language sql immutable as $$
  select case when p_precio is null then null
    when coalesce(p_redondeo, 0) > 0 then greatest(round(p_precio * (1 + p_pct / 100) / p_redondeo) * p_redondeo, 0)
    else greatest(round(p_precio * (1 + p_pct / 100), 2), 0) end $$;

-- El precio de un canal ('mostrador' o 'tienda'): sin listas encendidas o sin lista elegida para ese canal, es el precio base
create function public._precio_con_lista(p_precio numeric, p_canal text) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare c configuracion_tienda; l listas_precios;
begin
  select * into c from configuracion_tienda;
  if not c.listas_precios_activas then return p_precio; end if;
  select * into l from listas_precios where id = case when p_canal = 'tienda' then c.lista_tienda_id else c.lista_mostrador_id end and activa;
  if not found then return p_precio; end if;
  return _aplicar_lista(p_precio, l.ajuste_pct, l.redondeo);
end $$;

-- El precio de una variante: el del mostrador, salvo que la operación haya dicho que es de la tienda (crear_pedido)
create or replace function public.precio_de(p_variante bigint) returns numeric
language sql stable set search_path = public as $$
  select _precio_con_lista(coalesce(v.precio_venta, p.precio_venta), coalesce(nullif(current_setting('app.canal_precio', true), ''), 'mostrador'))
    from variantes v join productos p on p.id = v.producto_id where v.id = p_variante;
$$;

-- La tienda muestra el precio de su lista
create or replace view public.v_catalogo as
SELECT v.id AS variante_id, p.id AS producto_id, p.nombre, m.nombre AS marca, c.nombre AS categoria, p.genero, p.escala, p.descripcion, p.imagen_url,
    t.nombre AS talle, t.orden AS talle_orden, co.nombre AS color, co.hex AS color_hex,
    _precio_con_lista(COALESCE(v.precio_venta, p.precio_venta), 'tienda')::numeric(12,2) AS precio,
    GREATEST(COALESCE(sum(s.cantidad - s.reservado), 0::bigint), 0::bigint)::integer AS disponible,
    p.temporada, p.material, c.linea, p.creado_en
   FROM variantes v
     JOIN productos p ON p.id = v.producto_id
     JOIN talles t ON t.id = v.talle_id
     JOIN colores co ON co.id = v.color_id
     LEFT JOIN marcas m ON m.id = p.marca_id
     LEFT JOIN categorias c ON c.id = p.categoria_id
     LEFT JOIN stock s ON s.variante_id = v.id AND (s.deposito_id IN ( SELECT depositos.id FROM depositos WHERE depositos.vendible))
  WHERE p.publicado_web AND p.activo
  GROUP BY v.id, p.id, m.nombre, c.nombre, c.linea, t.nombre, t.orden, co.nombre, co.hex;

-- La caja ve el precio de su lista (columna nueva al final: lo anterior no cambia)
create or replace view public.v_stock as
SELECT v.id AS variante_id,
    p.id AS producto_id,
    p.codigo,
    p.nombre,
    m.nombre AS marca,
    c.nombre AS categoria,
    t.nombre AS talle,
    t.orden AS talle_orden,
    co.nombre AS color,
    co.hex AS color_hex,
    v.sku,
    d.id AS deposito_id,
    d.nombre AS deposito,
    COALESCE(s.cantidad, 0) AS stock,
    COALESCE(s.reservado, 0) AS reservado,
    COALESCE(s.cantidad, 0) - COALESCE(s.reservado, 0) AS disponible,
    v.stock_minimo,
        CASE
            WHEN tiene_permiso('costos.ver_precio_compra'::text) THEN p.precio_compra
            ELSE NULL::numeric
        END AS precio_compra,
    COALESCE(v.precio_venta, p.precio_venta) AS precio_venta,
        CASE
            WHEN tiene_permiso('costos.ver_valor_stock'::text) THEN COALESCE(s.cantidad, 0)::numeric * p.precio_compra
            ELSE NULL::numeric
        END AS valor_costo,
    (COALESCE(s.cantidad, 0) - COALESCE(s.reservado, 0)) <= v.stock_minimo AS stock_bajo,
    p.escala,
    p.genero,
    p.temporada,
    c.linea,
    v.codigo_barras,
    p.imagen_url,
    _precio_con_lista(COALESCE(v.precio_venta, p.precio_venta), 'mostrador') AS precio_lista
   FROM variantes v
     JOIN productos p ON p.id = v.producto_id
     JOIN talles t ON t.id = v.talle_id
     JOIN colores co ON co.id = v.color_id
     CROSS JOIN depositos d
     LEFT JOIN stock s ON s.variante_id = v.id AND s.deposito_id = d.id
     LEFT JOIN marcas m ON m.id = p.marca_id
     LEFT JOIN categorias c ON c.id = p.categoria_id
  WHERE d.vendible AND (tiene_permiso('stock.ver'::text) OR tiene_permiso('ventas.registrar'::text));

-- El pedido web se cotiza con la lista de la tienda
CREATE OR REPLACE FUNCTION public.crear_pedido(p_items jsonb, p_entrega text DEFAULT 'retiro'::text, p_direccion text DEFAULT NULL::text, p_medio_pago bigint DEFAULT NULL::bigint, p_notas text DEFAULT NULL::text, p_cliente bigint DEFAULT NULL::bigint, p_canal text DEFAULT 'Web'::text, p_zona bigint DEFAULT NULL::bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_cliente bigint; v_id bigint; it jsonb; v_dep bigint := deposito_principal(); v_disp int;
        v_medio medios_pago; v_equipo boolean := tiene_permiso('pedidos.gestionar'); v_items jsonb; v_renglones jsonb;
        v_sub numeric; v_promos numeric; v_acum numeric; v_zona zonas_envio;
begin
  -- Listas de precios: este pedido se cotiza con la lista de la tienda (precio_de lo lee)
  perform set_config('app.canal_precio', 'tienda', true);
  if auth.uid() is null then raise exception 'Tenés que ingresar para hacer un pedido'; end if;
  if v_equipo and p_cliente is not null then v_cliente := p_cliente;
  else
    select id into v_cliente from clientes where usuario_id = auth.uid();
    if v_cliente is null then raise exception 'Tu usuario no tiene ficha de cliente'; end if;
  end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'El pedido está vacío'; end if;
  if p_entrega = 'envio' and coalesce(trim(p_direccion), '') = '' then raise exception 'Falta la dirección de envío'; end if;
  -- Envío: la zona (y su precio) la elige el cliente de las que cargó el local; el precio lo pone la base
  if p_entrega = 'envio' then
    if p_zona is not null then
      select * into v_zona from zonas_envio where id = p_zona and activo;
      if not found then raise exception 'Elegí una zona de envío válida'; end if;
    elsif exists (select 1 from zonas_envio where activo) then
      raise exception 'Elegí la zona de envío';
    end if;
  end if;
  select * into v_medio from medios_pago where id = p_medio_pago and activo and (en_tienda or v_equipo);
  if not found then raise exception 'Elegí un medio de pago válido'; end if;

  -- Precios vigentes (nunca los del navegador) de artículos activos y publicados
  for it in select * from jsonb_array_elements(p_items) loop
    if (it->>'cantidad')::int <= 0 then raise exception 'Cantidad inválida'; end if;
    if not exists (select 1 from variantes v join productos p on p.id = v.producto_id
                    where v.id = (it->>'variante_id')::bigint and p.activo and (p.publicado_web or v_equipo)) then
      raise exception 'Uno de los productos ya no está disponible';
    end if;
  end loop;
  select jsonb_agg(jsonb_build_object('variante_id', (i->>'variante_id')::bigint, 'cantidad', (i->>'cantidad')::int,
                                      'precio_unitario', precio_de((i->>'variante_id')::bigint)))
    into v_items from jsonb_array_elements(p_items) i;
  v_renglones := _renglones_cotizados(v_items, 'tienda');

  insert into pedidos (cliente_id, canal, entrega, direccion_envio, medio_pago_id, ajuste_pct, deposito_id, notas, zona_envio_id, costo_envio)
  values (v_cliente, case when v_equipo then p_canal else 'Web' end, p_entrega, p_direccion, v_medio.id, v_medio.ajuste_pct, v_dep, p_notas,
          v_zona.id, coalesce(v_zona.precio, 0))
  returning id into v_id;

  for it in select * from jsonb_array_elements(v_renglones) loop
    select cantidad - reservado into v_disp from stock where variante_id = (it->>'variante_id')::bigint and deposito_id = v_dep for update;
    if coalesce(v_disp, 0) < (it->>'cantidad')::int then raise exception 'No hay stock suficiente de uno de los productos (quedan %)', coalesce(v_disp, 0); end if;
    update stock set reservado = reservado + (it->>'cantidad')::int where variante_id = (it->>'variante_id')::bigint and deposito_id = v_dep;
    insert into pedido_items (pedido_id, variante_id, cantidad, precio_unitario, descuento_promo, promocion_id)
    values (v_id, (it->>'variante_id')::bigint, (it->>'cantidad')::int, (it->>'precio_unitario')::numeric,
            (it->>'descuento_promo')::numeric, (it->>'promocion_id')::bigint);
  end loop;

  select sum((i->>'cantidad')::int * (i->>'precio_unitario')::numeric), sum((i->>'descuento_promo')::numeric),
         sum(case when (i->>'acumula')::boolean then (i->>'cantidad')::int * (i->>'precio_unitario')::numeric - (i->>'descuento_promo')::numeric else 0 end)
    into v_sub, v_promos, v_acum from jsonb_array_elements(v_renglones) i;
  update pedidos set subtotal = v_sub, descuento_promociones = v_promos,
         ajuste_medio_pago = round(v_acum * v_medio.ajuste_pct / 100, 2),
         total = v_sub - v_promos + round(v_acum * v_medio.ajuste_pct / 100, 2)
   where id = v_id;
  insert into pedido_estados (pedido_id, estado, comentario) values (v_id, 'pendiente', 'Pedido recibido');
  return v_id;
end $function$;

-- ── Administrar las listas ──
create function public.guardar_lista_precios(p_id bigint, p_nombre text, p_ajuste_pct numeric, p_redondeo int, p_activa boolean default true) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if not tiene_permiso('precios.editar') then raise exception 'No tenés permiso para cambiar precios de venta'; end if;
  if length(trim(coalesce(p_nombre, ''))) = 0 then raise exception 'Ponele un nombre a la lista'; end if;
  if p_id is null then
    insert into listas_precios (nombre, ajuste_pct, redondeo, activa) values (trim(p_nombre), coalesce(p_ajuste_pct, 0), coalesce(p_redondeo, 0), coalesce(p_activa, true)) returning id into v_id;
  else
    update listas_precios set nombre = trim(p_nombre), ajuste_pct = coalesce(p_ajuste_pct, 0), redondeo = coalesce(p_redondeo, 0), activa = coalesce(p_activa, true) where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Esa lista no existe'; end if;
  end if;
  return v_id;
exception when unique_violation then raise exception 'Ya hay una lista con ese nombre';
end $$;

create function public.quitar_lista_precios(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tiene_permiso('precios.editar') then raise exception 'No tenés permiso para cambiar precios de venta'; end if;
  if exists (select 1 from configuracion_tienda where p_id in (lista_mostrador_id, lista_tienda_id)) then
    raise exception 'Esa lista se está usando: elegí otra para el mostrador y la tienda antes de quitarla';
  end if;
  delete from listas_precios where id = p_id;
end $$;

-- Encender o apagar, y qué lista usa cada canal (null = el precio base)
create function public.configurar_listas_precios(p_activas boolean, p_mostrador bigint, p_tienda bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tiene_permiso('precios.editar') then raise exception 'No tenés permiso para cambiar precios de venta'; end if;
  if p_mostrador is not null and not exists (select 1 from listas_precios where id = p_mostrador and activa) then raise exception 'La lista del mostrador no existe o está apagada'; end if;
  if p_tienda is not null and not exists (select 1 from listas_precios where id = p_tienda and activa) then raise exception 'La lista de la tienda no existe o está apagada'; end if;
  update configuracion_tienda set listas_precios_activas = coalesce(p_activas, false), lista_mostrador_id = p_mostrador, lista_tienda_id = p_tienda;
end $$;

revoke execute on function public._aplicar_lista(numeric, numeric, int) from public, anon, authenticated;
-- precio_de() la llama quien consulta (la caja, el catálogo): solo transforma un precio, no lee nada que no se vea ya
grant execute on function public._precio_con_lista(numeric, text) to anon, authenticated;
revoke execute on function public.guardar_lista_precios(bigint, text, numeric, int, boolean), public.quitar_lista_precios(bigint), public.configurar_listas_precios(boolean, bigint, bigint) from public, anon;
grant execute on function public.guardar_lista_precios(bigint, text, numeric, int, boolean), public.quitar_lista_precios(bigint), public.configurar_listas_precios(boolean, bigint, bigint) to authenticated;
