-- Mercado Pago (Checkout Pro): el cliente paga su pedido web online.
--
-- Igual que WhatsApp: las claves se cargan en Integraciones y quedan en `integraciones` (nadie las lee). Todo lo que
-- habla con Mercado Pago lo hace LA BASE (extensión http): el token nunca pasa por la app ni por el navegador.
--   · El cobro (preferencia) lo arma la base con el total del pedido que ELLA calculó; solo lo puede pedir el dueño
--     del pedido (o el equipo).
--   · El aviso de Mercado Pago (webhook) se verifica con su firma y, además, la base le pregunta a Mercado Pago el estado
--     real del pago (un aviso no alcanza como confirmación). Aprobado: el pedido queda pagado y confirmado, y la
--     comisión que cobró Mercado Pago se anota sola en Gastos → Comisiones y bancos.
--   · Cancelar un pedido pagado le devuelve la plata (si la devolución falla, la cancelación no se hace). El cliente no
--     lo puede cancelar solo (tiene que escribir al local) y un pedido pagado no se vence solo.
--   · Configurable por el dueño: no usar Mercado Pago, ofrecerlo como opción u obligar a pagar online; cuotas máximas.

create extension if not exists http with schema extensions;

-- ── Configuración ──────────────────────────────────────────────────────
alter table public.integraciones
  add column mp_access_token   text,
  add column mp_webhook_secret text,
  add column mp_cuenta         jsonb,      -- lo que devolvió la última prueba (usuario, país) o el error
  add column sitio_url         text check (sitio_url is null or sitio_url ~ '^https?://[^/\s]+$');

alter table public.configuracion_tienda
  add column mp_modo text not null default 'no' check (mp_modo in ('no', 'opcional', 'obligatorio')),
  add column mp_cuotas_max int not null default 1 check (mp_cuotas_max between 1 and 12);

-- ── Los pagos online ───────────────────────────────────────────────────
create table public.pagos_online (
  id             bigint generated always as identity primary key,
  pedido_id      bigint not null references public.pedidos (id) on delete restrict,
  proveedor      text not null default 'mercadopago' check (proveedor in ('mercadopago')),
  pago_externo   text not null,                       -- el id del pago en Mercado Pago
  estado         text not null,                       -- approved, pending, in_process, rejected, refunded, cancelled…
  detalle_estado text,
  monto          numeric(12,2) not null,
  comision       numeric(12,2) not null default 0,
  neto           numeric(12,2),
  cuotas         int,
  medio          text,                                -- visa, master, account_money…
  comision_registrada boolean not null default false,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (proveedor, pago_externo)
);
create index pagos_online_pedido_id_idx on public.pagos_online (pedido_id);
alter table public.pagos_online enable row level security;
create policy "equipo ve pagos online" on public.pagos_online for select to authenticated using (tiene_permiso('pedidos.gestionar'));
create policy "cliente ve los pagos de sus pedidos" on public.pagos_online for select to authenticated
  using (pedido_id in (select p.id from pedidos p join clientes c on c.id = p.cliente_id where c.usuario_id = auth.uid()));

alter table public.pedidos add column pagado_online boolean not null default false;   -- lo mantiene la base

-- ── Hablar con Mercado Pago (interna) ──────────────────────────────────
create function public._mp_pedir(p_metodo text, p_ruta text, p_cuerpo jsonb default null, p_idempotencia text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_token text := (select mp_access_token from integraciones); r extensions.http_response; v_cab extensions.http_header[];
begin
  if v_token is null then raise exception 'Mercado Pago no está configurado (cargá el Access Token en Integraciones)'; end if;
  v_cab := array[extensions.http_header('Authorization', 'Bearer ' || v_token)];
  if p_idempotencia is not null then v_cab := v_cab || extensions.http_header('X-Idempotency-Key', p_idempotencia); end if;
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '15000');
  r := extensions.http((p_metodo, 'https://api.mercadopago.com' || p_ruta, v_cab, 'application/json',
                        case when p_cuerpo is null then null else p_cuerpo::text end)::extensions.http_request);
  return jsonb_build_object('status', r.status, 'cuerpo', case when r.content ~ '^\s*[\[{]' then r.content::jsonb else to_jsonb(r.content) end);
end $$;
revoke execute on function public._mp_pedir(text, text, jsonb, text) from public, anon, authenticated;

-- ¿El aviso viene de Mercado Pago? Firma «ts=…,v1=…» = HMAC-SHA256 de «id:<data.id>;request-id:<x-request-id>;ts:<ts>;»
create function public._mp_firma_valida(p_data_id text, p_request_id text, p_firma text) returns boolean
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_secreto text := (select mp_webhook_secret from integraciones); v_ts text; v_v1 text; v_manifiesto text;
begin
  if v_secreto is null then return null; end if;                         -- sin secreto cargado: no se puede verificar
  v_ts := substring(coalesce(p_firma, '') from 'ts=([0-9]+)');
  v_v1 := substring(coalesce(p_firma, '') from 'v1=([0-9a-f]{64})');
  if v_ts is null or v_v1 is null then return false; end if;
  v_manifiesto := 'id:' || lower(coalesce(p_data_id, '')) || ';' || case when coalesce(p_request_id, '') <> '' then 'request-id:' || p_request_id || ';' else '' end || 'ts:' || v_ts || ';';
  return encode(hmac(convert_to(v_manifiesto, 'UTF8'), convert_to(v_secreto, 'UTF8'), 'sha256'), 'hex') = v_v1;
end $$;
revoke execute on function public._mp_firma_valida(text, text, text) from public, anon, authenticated;

-- ── Para el panel (Integraciones) ──────────────────────────────────────
create function public.guardar_mercadopago(p_access_token text default null, p_webhook_secret text default null,
                                           p_sitio_url text default null, p_quitar text[] default '{}')
returns void language plpgsql security definer set search_path = public as $$
begin
  if not tiene_permiso('tienda.editar') then raise exception 'No tenés permiso para configurar las conexiones'; end if;
  if nullif(trim(p_access_token), '') is not null and trim(p_access_token) !~ '^(APP_USR|TEST)-[A-Za-z0-9-]{20,}$' then
    raise exception 'El Access Token de Mercado Pago empieza con APP_USR- (o TEST-): copialo entero desde Tus integraciones → Credenciales';
  end if;
  update integraciones set
    mp_access_token   = case when 'mp_token' = any (p_quitar) then null else coalesce(nullif(trim(p_access_token), ''), mp_access_token) end,
    mp_webhook_secret = case when 'mp_secreto' = any (p_quitar) then null else coalesce(nullif(trim(p_webhook_secret), ''), mp_webhook_secret) end,
    sitio_url         = coalesce(nullif(trim(p_sitio_url), ''), sitio_url),
    mp_cuenta = case when nullif(trim(p_access_token), '') is not null or 'mp_token' = any (p_quitar) then null else mp_cuenta end,
    actualizado_en = now(), actualizado_por = auth.uid()
   where unica;
end $$;

-- Probar: le pregunta a Mercado Pago de quién es la cuenta (así se ve que es la del local y no una personal)
create function public.mp_probar() returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; v jsonb;
begin
  if not tiene_permiso('tienda.editar') then raise exception 'No tenés permiso para configurar las conexiones'; end if;
  r := _mp_pedir('GET', '/users/me');
  v := case when (r ->> 'status')::int = 200 then jsonb_build_object('ok', true, 'fecha', now(),
              'usuario', r -> 'cuerpo' ->> 'nickname', 'nombre', trim(coalesce(r -> 'cuerpo' ->> 'first_name', '') || ' ' || coalesce(r -> 'cuerpo' ->> 'last_name', '')),
              'pais', r -> 'cuerpo' ->> 'site_id', 'email', r -> 'cuerpo' ->> 'email',
              'prueba', (select mp_access_token like 'TEST-%' from integraciones) or coalesce((r -> 'cuerpo' -> 'tags') ? 'test_user', false))
            else jsonb_build_object('ok', false, 'fecha', now(), 'error',
              case when (r ->> 'status')::int in (401, 403) then 'Mercado Pago no reconoce el Access Token: copialo entero desde Credenciales de producción (empieza con APP_USR-)'
                   else coalesce(r -> 'cuerpo' ->> 'message', 'Mercado Pago contestó ' || (r ->> 'status')) end) end;
  update integraciones set mp_cuenta = v where unica;
  return v;
end $$;

create function public.estado_mercadopago() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare i integraciones;
begin
  if not tiene_permiso('tienda.editar') then raise exception 'No tenés permiso para ver las conexiones'; end if;
  select * into i from integraciones;
  return jsonb_build_object(
    'token', case when i.mp_access_token is not null then '…' || right(i.mp_access_token, 4) end,
    'secreto', case when i.mp_webhook_secret is not null then '…' || right(i.mp_webhook_secret, 4) end,
    'cuenta', i.mp_cuenta, 'sitio_url', i.sitio_url,
    'pagos_mes', (select jsonb_build_object('aprobados', count(*) filter (where estado = 'approved'),
                    'cobrado', coalesce(sum(monto) filter (where estado = 'approved'), 0),
                    'comision', coalesce(sum(comision) filter (where estado = 'approved'), 0))
                    from pagos_online where creado_en >= date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires') at time zone 'America/Argentina/Buenos_Aires'));
end $$;

revoke execute on function public.guardar_mercadopago(text, text, text, text[]), public.mp_probar(), public.estado_mercadopago() from public, anon;
grant execute on function public.guardar_mercadopago(text, text, text, text[]), public.mp_probar(), public.estado_mercadopago() to authenticated;

-- ── Pagar un pedido ────────────────────────────────────────────────────
-- Devuelve el link de pago de Mercado Pago. El total y el detalle salen del pedido (no del navegador).
create function public.mp_pagar_pedido(p_pedido bigint) returns text
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
              'quantity', 1, 'currency_id', 'ARS', 'unit_price', p.total)),
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
revoke execute on function public.mp_pagar_pedido(bigint) from public, anon;
grant execute on function public.mp_pagar_pedido(bigint) to authenticated;

-- ── El aviso de Mercado Pago (lo llama el webhook con la clave pública) ──
-- Verifica la firma (si hay secreto cargado) y le pregunta a Mercado Pago el pago: nada de lo que manda el aviso se cree.
create function public.mp_notificacion(p_tipo text, p_data_id text, p_request_id text, p_firma text) returns text
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
    if v_fila.monto + 0.01 < v_pedido.total then
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
revoke execute on function public.mp_notificacion(text, text, text, text) from public;
grant execute on function public.mp_notificacion(text, text, text, text) to anon, authenticated;

-- ── Devolver la plata ──────────────────────────────────────────────────
create function public._mp_reembolsar(p_pedido bigint) returns void
language plpgsql security definer set search_path = public as $$
declare v pagos_online; r jsonb;
begin
  for v in select * from pagos_online where pedido_id = p_pedido and estado = 'approved' loop
    r := _mp_pedir('POST', '/v1/payments/' || v.pago_externo || '/refunds', '{}'::jsonb, 'reembolso-' || v.pago_externo);
    if (r ->> 'status')::int not between 200 and 299 then
      raise exception 'Mercado Pago no pudo devolver el pago %: %. El pedido no se canceló.', v.pago_externo, coalesce(r -> 'cuerpo' ->> 'message', r ->> 'status');
    end if;
    update pagos_online set estado = 'refunded', actualizado_en = now() where id = v.id;
  end loop;
  -- pedidos.pagado_online lo pone en false quien llama (el trigger de cancelación, sobre la fila que está cambiando)
end $$;
revoke execute on function public._mp_reembolsar(bigint) from public, anon, authenticated;

-- Al cancelar un pedido pagado: el local devuelve la plata en el momento; el cliente no puede cancelarlo solo
create function public._pedido_pagado_cancelado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.cancelado_por = 'cliente' then
    raise exception 'Tu pedido ya está pagado: escribinos y lo cancelamos devolviéndote el pago';
  end if;
  perform _mp_reembolsar(new.id);
  new.pagado_online := false;
  insert into pedido_estados (pedido_id, estado, comentario) values (new.id, new.estado, 'Se devolvió el pago de Mercado Pago');
  return new;
end $$;
revoke execute on function public._pedido_pagado_cancelado() from public, anon, authenticated;
create trigger pedidos_pagado_cancelado before update of estado on public.pedidos
  for each row when (new.estado = 'cancelado' and old.estado <> 'cancelado' and old.pagado_online)
  execute function public._pedido_pagado_cancelado();

-- Un pedido pagado no se vence solo (se guarda hasta que lo retiren o el local lo cancele)
create or replace function public.vencer_pedidos_sin_retirar() returns int
language plpgsql security definer set search_path = public as $$
declare v_id bigint; n int := 0; v_dias int := (select dias_retiro from configuracion_tienda);
begin
  for v_id in
    select p.id from pedidos p
     where p.estado = 'listo_retiro' and not p.pagado_online
       and (select max(e.fecha) from pedido_estados e where e.pedido_id = p.id and e.estado = 'listo_retiro')
           < now() - make_interval(days => v_dias)
  loop
    perform _cancelar_pedido(v_id, 'no_retiro', 'vencimiento',
      format('No se retiró en los %s días que se guarda. El stock volvió a estar a la venta.', v_dias));
    n := n + 1;
  end loop;
  return n;
end $$;

-- Para la tienda: cómo se cobra (sin claves)
create function public.tienda_pagos() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('mp_modo', case when (select mp_access_token is null from integraciones) then 'no' else t.mp_modo end,
                            'mp_cuotas_max', t.mp_cuotas_max)
    from configuracion_tienda t
$$;
revoke execute on function public.tienda_pagos() from public;
grant execute on function public.tienda_pagos() to anon, authenticated;

-- Si el dueño eligió «solo online», un pedido de la tienda tiene que ser con Mercado Pago (lo frena la base)
create function public._pedido_medio_permitido() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.canal = 'Web' and (select tienda_pagos() ->> 'mp_modo') = 'obligatorio'
     and (select codigo from medios_pago where id = new.medio_pago_id) <> 'MP' then
    raise exception 'La tienda cobra solo con Mercado Pago: elegí ese medio de pago';
  end if;
  return new;
end $$;
revoke execute on function public._pedido_medio_permitido() from public, anon, authenticated;
create trigger pedidos_medio_permitido before insert on public.pedidos for each row execute function public._pedido_medio_permitido();
