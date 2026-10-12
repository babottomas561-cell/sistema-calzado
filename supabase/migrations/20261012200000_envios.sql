-- Envíos: zonas de Tucumán con su precio (las carga el dueño) y el costo real de cada envío (lo que cobró Uber).
--   · zonas_envio: «Centro», «Yerba Buena»… con su precio (o sin precio = «a coordinar»). La tienda las ofrece y el
--     pedido guarda la zona y su costo (pedidos.costo_envio), que pone la base. El envío va APARTE de la venta de los
--     productos (no toca sus totales, las promociones ni las devoluciones): el cliente paga total + envío.
--   · envios: uno por pedido con envío. El equipo anota con qué lo mandó (Uber, cadete…), lo que costó y el seguimiento.
--     Lo que costó se suma solo a Gastos → Envíos; el Resultado muestra envíos cobrados contra lo que costaron.
--   · Uber Direct / Andreani automáticos: cuando el local tenga acceso, se completan acá (proveedor + seguimiento).

create table public.zonas_envio (
  id           bigint generated always as identity primary key,
  nombre       text not null check (length(trim(nombre)) > 0),
  descripcion  text,                         -- «Barrio Norte, Sur, Centro hasta Av. Sarmiento»
  precio       numeric(12,2) check (precio >= 0),   -- null = a coordinar
  activo       boolean not null default true,
  orden        int not null default 0
);
create unique index zonas_envio_nombre_key on public.zonas_envio (lower(nombre));
alter table public.zonas_envio enable row level security;
create policy "todos ven las zonas activas" on public.zonas_envio for select to anon, authenticated using (activo or tiene_permiso('tienda.editar'));
create policy "edita zonas de envio" on public.zonas_envio for all to authenticated
  using (tiene_permiso('tienda.editar')) with check (tiene_permiso('tienda.editar'));

alter table public.pedidos
  add column zona_envio_id bigint references public.zonas_envio (id) on delete restrict,
  add column costo_envio numeric(12,2) not null default 0 check (costo_envio >= 0);
create index pedidos_zona_envio_id_idx on public.pedidos (zona_envio_id);

insert into public.gasto_categorias (nombre, orden) values ('Envíos', 11);

create table public.envios (
  id            bigint generated always as identity primary key,
  pedido_id     bigint not null unique references public.pedidos (id) on delete cascade,   -- es parte del pedido
  proveedor     text check (proveedor in ('uber', 'cadete', 'andreani', 'correo', 'otro')),
  costo_real    numeric(12,2) check (costo_real >= 0),
  seguimiento   text,                       -- link o código de seguimiento
  notas         text,
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid references public.perfiles (id) on delete set null
);
create index envios_actualizado_por_idx on public.envios (actualizado_por);
alter table public.envios enable row level security;
create policy "equipo ve envios" on public.envios for select to authenticated using (tiene_permiso('pedidos.gestionar'));
create policy "cliente ve el envio de sus pedidos" on public.envios for select to authenticated
  using (pedido_id in (select id from pedidos where cliente_id = mi_cliente_id()));

-- Arreglo: el cliente no veía los pagos de sus pedidos (la política leía clientes, que el cliente no puede leer)
drop policy "cliente ve los pagos de sus pedidos" on public.pagos_online;
create policy "cliente ve los pagos de sus pedidos" on public.pagos_online for select to authenticated
  using (pedido_id in (select id from pedidos where cliente_id = mi_cliente_id()));

-- Cada pedido con envío nace con su fila de envío (pendiente de mandar)
create function public._crear_envio() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.entrega = 'envio' then insert into envios (pedido_id) values (new.id) on conflict (pedido_id) do nothing; end if;
  return new;
end $$;
revoke execute on function public._crear_envio() from public, anon, authenticated;
create trigger pedidos_crear_envio after insert on public.pedidos for each row execute function public._crear_envio();
insert into public.envios (pedido_id) select id from public.pedidos where entrega = 'envio' on conflict do nothing;

-- El equipo anota cómo salió el envío; lo que costó va a Gastos → Envíos (se corrige si se vuelve a anotar)
create function public.registrar_envio(p_pedido bigint, p_proveedor text, p_costo_real numeric default null,
                                       p_seguimiento text default null, p_notas text default null)
returns void language plpgsql security definer set search_path = public as $$
declare p pedidos;
begin
  if not tiene_permiso('pedidos.gestionar') then raise exception 'No tenés permiso para atender pedidos'; end if;
  select * into p from pedidos where id = p_pedido;
  if not found or p.entrega <> 'envio' then raise exception 'Ese pedido no es con envío'; end if;
  if p_costo_real is not null and p_costo_real < 0 then raise exception 'El costo del envío no puede ser negativo'; end if;
  update envios set proveedor = p_proveedor, costo_real = p_costo_real, seguimiento = nullif(trim(p_seguimiento), ''),
                    notas = nullif(trim(p_notas), ''), actualizado_en = now(), actualizado_por = auth.uid()
   where pedido_id = p_pedido;
  if coalesce(p_costo_real, 0) > 0 then
    insert into gastos (categoria_id, descripcion, moneda, importe, origen, referencia, proveedor_id)
    values ((select id from gasto_categorias where nombre = 'Envíos'),
            'Envío ' || coalesce(initcap(p_proveedor), '') || ' — pedido ' || p.comprobante, 'ARS', p_costo_real, 'automatico', 'envio:' || p_pedido, null)
    on conflict (referencia) do update set importe = excluded.importe, descripcion = excluded.descripcion;
  else
    delete from gastos where referencia = 'envio:' || p_pedido;
  end if;
end $$;
revoke execute on function public.registrar_envio(bigint, text, numeric, text, text) from public, anon;
grant execute on function public.registrar_envio(bigint, text, numeric, text, text) to authenticated;

-- Envíos cobrados en un período (para el Resultado): lo que pagaron los clientes por el envío de pedidos entregados
create view public.v_envios_cobrados with (security_invoker = false) as
select (e.fecha at time zone 'America/Argentina/Buenos_Aires')::date as dia, p.costo_envio as cobrado
  from pedidos p join lateral (select max(fecha) as fecha from pedido_estados where pedido_id = p.id and estado = 'entregado') e on true
 where p.estado = 'entregado' and p.costo_envio > 0 and tiene_permiso('gastos.gestionar');
revoke select on public.v_envios_cobrados from anon;
grant select on public.v_envios_cobrados to authenticated;

-- ── El pedido, con la zona ─────────────────────────────────────────────
drop function public.crear_pedido(jsonb, text, text, bigint, text, bigint, text);
CREATE FUNCTION public.crear_pedido(p_items jsonb, p_entrega text DEFAULT 'retiro'::text, p_direccion text DEFAULT NULL::text, p_medio_pago bigint DEFAULT NULL::bigint, p_notas text DEFAULT NULL::text, p_cliente bigint DEFAULT NULL::bigint, p_canal text DEFAULT 'Web'::text, p_zona bigint DEFAULT NULL::bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_cliente bigint; v_id bigint; it jsonb; v_dep bigint := deposito_principal(); v_disp int;
        v_medio medios_pago; v_equipo boolean := tiene_permiso('pedidos.gestionar'); v_items jsonb; v_renglones jsonb;
        v_sub numeric; v_promos numeric; v_acum numeric; v_zona zonas_envio;
begin
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
end $function$

;
revoke execute on function public.crear_pedido(jsonb, text, text, bigint, text, bigint, text, bigint) from public, anon;
grant execute on function public.crear_pedido(jsonb, text, text, bigint, text, bigint, text, bigint) to authenticated;

-- Mercado Pago cobra productos + envío (dos renglones) y controla que el pago cubra los dos
create or replace function public.mp_pagar_pedido(p_pedido bigint) returns text
language plpgsql security definer set search_path = public as $$
declare p pedidos; t configuracion_tienda; v_url text := (select sitio_url from integraciones); r jsonb; v_link text;
begin
  select * into p from pedidos where id = p_pedido;
  if not found or not (tiene_permiso('pedidos.gestionar')
                       or exists (select 1 from clientes c where c.id = p.cliente_id and c.usuario_id = auth.uid())) then
    raise exception 'No existe ese pedido';
  end if;
  select * into t from configuracion_tienda;
  if t.mp_modo = 'no' then raise exception 'La tienda no cobra con Mercado Pago'; end if;
  if p.pagado_online then raise exception 'Este pedido ya está pagado'; end if;
  if (select codigo from medios_pago where id = p.medio_pago_id) <> 'MP' then raise exception 'Este pedido se paga con otro medio'; end if;
  if p.estado not in ('pendiente', 'confirmado', 'preparado', 'listo_retiro') then raise exception 'Este pedido ya no se puede pagar (está %)', p.estado; end if;
  if v_url is null then raise exception 'Falta la dirección de la tienda: guardá Mercado Pago en Integraciones desde la tienda publicada'; end if;
  r := _mp_pedir('POST', '/checkout/preferences', jsonb_build_object(
    'items', jsonb_build_array(jsonb_build_object('id', p.comprobante, 'title', t.nombre || ' — pedido ' || p.comprobante,
              'quantity', 1, 'currency_id', 'ARS', 'unit_price', p.total))
             || case when p.costo_envio > 0 then jsonb_build_array(jsonb_build_object('id', 'envio', 'title', 'Envío',
              'quantity', 1, 'currency_id', 'ARS', 'unit_price', p.costo_envio)) else '[]'::jsonb end,
    'external_reference', p.id::text,
    'statement_descriptor', left(regexp_replace(upper(t.nombre), '[^A-Z0-9 ]', '', 'g'), 13),
    'notification_url', v_url || '/api/mercadopago',
    'back_urls', jsonb_build_object('success', v_url || '/mi-cuenta/pedidos/' || p.id || '?pago=ok',
                                    'pending', v_url || '/mi-cuenta/pedidos/' || p.id || '?pago=pendiente',
                                    'failure', v_url || '/mi-cuenta/pedidos/' || p.id || '?pago=error'),
    'auto_return', 'approved',
    'payment_methods', jsonb_build_object('installments', t.mp_cuotas_max)));
  if (r ->> 'status')::int not between 200 and 299 then
    raise exception 'Mercado Pago no pudo armar el pago: %', coalesce(r -> 'cuerpo' ->> 'message', r ->> 'status');
  end if;
  v_link := case when (select mp_access_token like 'TEST-%' from integraciones) then r -> 'cuerpo' ->> 'sandbox_init_point' else r -> 'cuerpo' ->> 'init_point' end;
  return coalesce(v_link, r -> 'cuerpo' ->> 'init_point');
end $$;

create or replace function public.mp_notificacion(p_tipo text, p_data_id text, p_request_id text, p_firma text) returns text
language plpgsql security definer set search_path = public as $$
declare v_firma boolean; r jsonb; pg jsonb; v_pedido pedidos; v_comision numeric; v_antes text; v_fila pagos_online;
begin
  if coalesce(p_tipo, '') not in ('payment', 'payment.created', 'payment.updated') or coalesce(p_data_id, '') !~ '^[0-9]{1,20}$' then return 'ignorado'; end if;
  v_firma := _mp_firma_valida(p_data_id, p_request_id, p_firma);
  if v_firma = false then return 'firma_invalida'; end if;
  r := _mp_pedir('GET', '/v1/payments/' || p_data_id);
  if (r ->> 'status')::int <> 200 then return 'no_encontrado'; end if;
  pg := r -> 'cuerpo';
  select * into v_pedido from pedidos where id = (case when pg ->> 'external_reference' ~ '^[0-9]{1,18}$' then (pg ->> 'external_reference')::bigint end) for update;
  if not found then return 'sin_pedido'; end if;
  v_comision := coalesce((select sum((f ->> 'amount')::numeric) from jsonb_array_elements(coalesce(pg -> 'fee_details', '[]')) f), 0);
  select estado into v_antes from pagos_online where proveedor = 'mercadopago' and pago_externo = p_data_id;
  insert into pagos_online (pedido_id, pago_externo, estado, detalle_estado, monto, comision, neto, cuotas, medio)
  values (v_pedido.id, p_data_id, pg ->> 'status', pg ->> 'status_detail', (pg ->> 'transaction_amount')::numeric, v_comision,
          (pg -> 'transaction_details' ->> 'net_received_amount')::numeric, (pg ->> 'installments')::int, pg ->> 'payment_method_id')
  on conflict (proveedor, pago_externo) do update set estado = excluded.estado, detalle_estado = excluded.detalle_estado,
    comision = excluded.comision, neto = excluded.neto, actualizado_en = now()
  returning * into v_fila;

  if v_fila.estado = 'approved' and coalesce(v_antes, '') <> 'approved' then
    if v_fila.monto + 0.01 < v_pedido.total + v_pedido.costo_envio then
      insert into pedido_estados (pedido_id, estado, comentario)
      values (v_pedido.id, v_pedido.estado, format('Mercado Pago aprobó un pago de $%s, menos que el total: revisar', v_fila.monto));
      return 'monto_menor';
    end if;
    update pedidos set pagado_online = true, estado = case when estado = 'pendiente' then 'confirmado' else estado end where id = v_pedido.id;
    insert into pedido_estados (pedido_id, estado, comentario)
    values (v_pedido.id, case when v_pedido.estado = 'pendiente' then 'confirmado' else v_pedido.estado end,
            'Pagado con Mercado Pago' || case when v_fila.cuotas > 1 then format(' en %s cuotas', v_fila.cuotas) else '' end);
    -- La comisión de Mercado Pago, como gasto (una vez por pago)
    if v_fila.comision > 0 and not v_fila.comision_registrada then
      insert into gastos (categoria_id, descripcion, moneda, importe, origen, referencia)
      values ((select id from gasto_categorias where nombre = 'Comisiones y bancos'), 'Comisión Mercado Pago — pedido ' || v_pedido.comprobante,
              'ARS', v_fila.comision, 'automatico', 'mp:' || p_data_id)
      on conflict (referencia) do nothing;
      update pagos_online set comision_registrada = true where id = v_fila.id;
    end if;
  elsif v_fila.estado in ('refunded', 'charged_back', 'cancelled') and v_antes = 'approved' then
    update pedidos set pagado_online = false where id = v_pedido.id;
  end if;
  return v_fila.estado;
end $$;
