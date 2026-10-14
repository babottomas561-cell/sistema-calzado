-- Mercado Pago Point: cobrar con el posnet desde la caja. Se usa la API «Orders» de Mercado Pago (la que reemplaza a la vieja API de Point).
--   · Es OTRA aplicación de Mercado Pago (tipo «Pagos presenciales», producto Point), con su propio Access Token y su propia clave secreta de webhook: no se mezcla con la
--     de Checkout Pro de la tienda online (`mp_access_token`). Quedan en `integraciones` (nadie las lee, regla 16) y todo lo que habla con Mercado Pago lo hace LA BASE.
--   · El posnet se vincula una vez desde la app de Mercado Pago (escaneando su QR, con su sucursal y su caja) y acá se pasa a «modo PDV» (integrado por API).
--   · Desde la caja: `point_cobrar` le manda el monto al posnet; el cliente pasa la tarjeta; Mercado Pago avisa (webhook) y la base le CONSULTA el estado real a Mercado
--     Pago (un aviso no alcanza). Aprobado, la venta se registra con la referencia de esa orden.
--   · Regla del dueño (`configuracion_tienda.tarjetas_modo`): «libre» (la tarjeta se anota a mano, por si usa otro posnet) o «vinculado» (solo se cobra con tarjeta si pasó por
--     el posnet vinculado: lo hace cumplir la base al cierre de la venta).

-- ── Configuración ───────────────────────────────────────────────────────
alter table public.integraciones
  add column mp_point_token   text,
  add column mp_point_secreto text,
  add column mp_point_cuenta  jsonb;           -- lo que devolvió la última prueba (usuario) o el error
alter table public.configuracion_tienda add column tarjetas_modo text not null default 'libre' check (tarjetas_modo in ('libre', 'vinculado'));

-- ── Terminales y cobros ─────────────────────────────────────────────────
create table public.point_terminales (
  id          bigint generated always as identity primary key,
  terminal_id text not null unique check (char_length(terminal_id) between 5 and 120),   -- «NEWLAND_N950__N950NCB801293324»
  nombre      text not null check (char_length(nombre) between 1 and 60),
  store_id    text,
  pos_id      text,
  modo        text,                                  -- PDV (integrada por API), STANDALONE o UNDEFINED
  activa      boolean not null default true,
  por_defecto boolean not null default false,
  visto_en    timestamptz not null default now()
);
create unique index point_terminales_defecto_key on public.point_terminales (por_defecto) where por_defecto;
alter table public.point_terminales enable row level security;
create policy "el equipo ve los posnets" on public.point_terminales for select to authenticated using (es_staff());

create table public.point_cobros (
  id            bigint generated always as identity primary key,
  creado_en     timestamptz not null default now(),
  usuario_id    uuid default auth.uid() references auth.users (id) on delete set null,
  terminal_id   text not null,
  monto         numeric(12,2) not null check (monto > 0),
  referencia    text not null unique,                -- la nuestra (external_reference): c<id>
  orden_id      text unique,                         -- la de Mercado Pago
  estado        text not null default 'creado' check (estado in ('creado', 'en_terminal', 'aprobado', 'rechazado', 'cancelado', 'vencido', 'error', 'reembolsado')),
  detalle       text,
  pago_id       text,
  medio         text,                                -- visa, master…
  cuotas        int,
  venta_id      bigint references public.ventas (id) on delete set null,   -- la venta que usó este cobro (una sola)
  consultado_en timestamptz,
  actualizado_en timestamptz not null default now()
);
create index point_cobros_usuario_id_idx on public.point_cobros (usuario_id);
create index point_cobros_venta_id_idx on public.point_cobros (venta_id);
create index point_cobros_estado_idx on public.point_cobros (estado) where estado in ('creado', 'en_terminal');
alter table public.point_cobros enable row level security;
create policy "ve sus cobros con el posnet" on public.point_cobros for select to authenticated
  using (es_staff() and (usuario_id = auth.uid() or tiene_permiso('ventas.ver_todas')));

-- ── Hablar con Mercado Pago con el token de Point (interna) ─────────────
create function public._mp_point_pedir(p_metodo text, p_ruta text, p_cuerpo jsonb default null, p_idempotencia text default null, p_cabeceras jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_token text := (select coalesce(mp_point_token, mp_access_token) from integraciones); r extensions.http_response; v_cab extensions.http_header[]; k text; v text;
begin
  if v_token is null then raise exception 'El posnet de Mercado Pago no está configurado (cargá el Access Token de Point en Integraciones → Mercado Pago)'; end if;
  v_cab := array[extensions.http_header('Authorization', 'Bearer ' || v_token)];
  if p_idempotencia is not null then v_cab := v_cab || extensions.http_header('X-Idempotency-Key', p_idempotencia); end if;
  for k, v in select * from jsonb_each_text(coalesce(p_cabeceras, '{}')) loop v_cab := v_cab || extensions.http_header(k, v); end loop;
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '20000');
  r := extensions.http((p_metodo, 'https://api.mercadopago.com' || p_ruta, v_cab, 'application/json', case when p_cuerpo is null then null else p_cuerpo::text end)::extensions.http_request);
  return jsonb_build_object('status', r.status, 'cuerpo', case when r.content ~ '^\s*[\[{]' then r.content::jsonb else to_jsonb(r.content) end);
end $$;

-- ¿El aviso viene de Mercado Pago? Misma firma que el de Checkout, con la clave secreta de la aplicación de Point
create function public._mp_point_firma_valida(p_data_id text, p_request_id text, p_firma text) returns boolean
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_secreto text := (select coalesce(mp_point_secreto, mp_webhook_secret) from integraciones); v_ts text; v_v1 text; v_manifiesto text;
begin
  if v_secreto is null then return null; end if;
  v_ts := substring(coalesce(p_firma, '') from 'ts=([0-9]+)');
  v_v1 := substring(coalesce(p_firma, '') from 'v1=([0-9a-f]{64})');
  if v_ts is null or v_v1 is null then return false; end if;
  v_manifiesto := 'id:' || lower(coalesce(p_data_id, '')) || ';' || case when coalesce(p_request_id, '') <> '' then 'request-id:' || p_request_id || ';' else '' end || 'ts:' || v_ts || ';';
  return encode(hmac(convert_to(v_manifiesto, 'UTF8'), convert_to(v_secreto, 'UTF8'), 'sha256'), 'hex') = v_v1;
end $$;

-- ── Para el panel (Integraciones → Mercado Pago → Posnet) ───────────────
create function public.guardar_mp_point(p_access_token text default null, p_webhook_secret text default null, p_quitar text[] default '{}') returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tiene_permiso('tienda.editar') then raise exception 'No tenés permiso para configurar las conexiones'; end if;
  if nullif(trim(p_access_token), '') is not null and trim(p_access_token) !~ '^(APP_USR|TEST)-[A-Za-z0-9-]{20,}$' then
    raise exception 'El Access Token de Mercado Pago empieza con APP_USR- (o TEST-): copialo entero desde Tus integraciones → Credenciales';
  end if;
  update integraciones set
    mp_point_token   = case when 'point_token' = any (p_quitar) then null else coalesce(nullif(trim(p_access_token), ''), mp_point_token) end,
    mp_point_secreto = case when 'point_secreto' = any (p_quitar) then null else coalesce(nullif(trim(p_webhook_secret), ''), mp_point_secreto) end,
    mp_point_cuenta  = case when nullif(trim(p_access_token), '') is not null or 'point_token' = any (p_quitar) then null else mp_point_cuenta end,
    actualizado_en = now(), actualizado_por = auth.uid()
   where unica;
  if 'point_token' = any (p_quitar) then
    update configuracion_tienda set tarjetas_modo = 'libre';
    update point_terminales set por_defecto = false;
  end if;
end $$;

create function public.mp_point_probar() returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; v jsonb;
begin
  if not tiene_permiso('tienda.editar') then raise exception 'No tenés permiso para configurar las conexiones'; end if;
  r := _mp_point_pedir('GET', '/users/me');
  v := case when (r ->> 'status')::int = 200 then jsonb_build_object('ok', true, 'fecha', now(), 'usuario', r -> 'cuerpo' ->> 'nickname',
              'nombre', trim(coalesce(r -> 'cuerpo' ->> 'first_name', '') || ' ' || coalesce(r -> 'cuerpo' ->> 'last_name', '')), 'id', r -> 'cuerpo' ->> 'id', 'pais', r -> 'cuerpo' ->> 'site_id')
            else jsonb_build_object('ok', false, 'fecha', now(), 'error', case when (r ->> 'status')::int in (401, 403)
              then 'Mercado Pago no reconoce el Access Token: copialo entero desde Credenciales de producción de la aplicación de Point (empieza con APP_USR-)'
              else coalesce(r -> 'cuerpo' ->> 'message', 'Mercado Pago contestó ' || (r ->> 'status')) end) end;
  update integraciones set mp_point_cuenta = v where unica;
  return v;
end $$;

-- Busca los posnets de la cuenta y los guarda (los que ya estaban conservan su nombre)
create function public.mp_point_buscar_terminales() returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; t jsonb; v_n int := 0;
begin
  if not tiene_permiso('tienda.editar') then raise exception 'No tenés permiso para configurar las conexiones'; end if;
  r := _mp_point_pedir('GET', '/terminals/v1/list?limit=50&offset=0');
  if (r ->> 'status')::int in (401, 403) then return jsonb_build_object('ok', false, 'error', 'Mercado Pago no reconoce el Access Token de Point'); end if;
  if (r ->> 'status')::int <> 200 then return jsonb_build_object('ok', false, 'error', coalesce(r -> 'cuerpo' ->> 'message', 'Mercado Pago contestó ' || (r ->> 'status'))); end if;
  for t in select * from jsonb_array_elements(coalesce(r -> 'cuerpo' -> 'data' -> 'terminals', r -> 'cuerpo' -> 'terminals', '[]')) loop
    insert into point_terminales (terminal_id, nombre, store_id, pos_id, modo)
    values (t ->> 'id', 'Posnet ' || right(t ->> 'id', 6), t ->> 'store_id', t ->> 'pos_id', t ->> 'operating_mode')
    on conflict (terminal_id) do update set store_id = excluded.store_id, pos_id = excluded.pos_id, modo = excluded.modo, visto_en = now();
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'cantidad', v_n);
end $$;

-- Pasa un posnet a «modo PDV» (integrado por API) y lo deja como el de siempre
create function public.mp_point_usar_terminal(p_terminal bigint, p_nombre text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t point_terminales; r jsonb;
begin
  if not tiene_permiso('tienda.editar') then raise exception 'No tenés permiso para configurar las conexiones'; end if;
  select * into t from point_terminales where id = p_terminal;
  if not found then raise exception 'Ese posnet no está en la lista: buscalos de nuevo'; end if;
  if t.modo is distinct from 'PDV' then
    r := _mp_point_pedir('PATCH', '/terminals/v1/setup', jsonb_build_object('terminals', jsonb_build_array(jsonb_build_object('id', t.terminal_id, 'operating_mode', 'PDV'))));
    if (r ->> 'status')::int not between 200 and 299 then
      return jsonb_build_object('ok', false, 'error', coalesce(r -> 'cuerpo' ->> 'message', 'Mercado Pago no pudo cambiar el modo del posnet (' || (r ->> 'status') || ')'));
    end if;
  end if;
  update point_terminales set por_defecto = false where por_defecto;
  update point_terminales set modo = 'PDV', activa = true, por_defecto = true, nombre = coalesce(nullif(trim(p_nombre), ''), nombre) where id = p_terminal;
  return jsonb_build_object('ok', true, 'reiniciar', t.modo is distinct from 'PDV');
end $$;

-- La regla de tarjetas. «Vinculado» exige el posnet listo (token, secreto del aviso y un posnet de siempre).
create function public.guardar_tarjetas_modo(p_modo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (tiene_permiso('tablas.medios_pago') or tiene_permiso('tablas.editar')) then raise exception 'No tenés permiso para cambiar los medios de pago'; end if;
  if p_modo not in ('libre', 'vinculado') then raise exception 'Elegí una de las dos opciones'; end if;
  if p_modo = 'vinculado' and not (select coalesce(mp_point_token, mp_access_token) is not null and coalesce(mp_point_secreto, mp_webhook_secret) is not null from integraciones) then
    raise exception 'Primero vinculá el posnet: falta cargar el Access Token y la clave secreta de Mercado Pago Point (Integraciones → Mercado Pago)';
  end if;
  if p_modo = 'vinculado' and not exists (select 1 from point_terminales where por_defecto and activa) then
    raise exception 'Primero elegí el posnet que se usa en la caja (Integraciones → Mercado Pago → Posnet)';
  end if;
  update configuracion_tienda set tarjetas_modo = p_modo;
end $$;

create function public.estado_point() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare i integraciones;
begin
  if not tiene_permiso('tienda.editar') then raise exception 'No tenés permiso para ver las conexiones'; end if;
  select * into i from integraciones;
  return jsonb_build_object(
    'token', case when coalesce(i.mp_point_token, i.mp_access_token) is not null then '…' || right(coalesce(i.mp_point_token, i.mp_access_token), 4) end, 'secreto', case when coalesce(i.mp_point_secreto, i.mp_webhook_secret) is not null then '…' || right(coalesce(i.mp_point_secreto, i.mp_webhook_secret), 4) end, 'compartido', (i.mp_point_token is null and i.mp_access_token is not null),
    'cuenta', i.mp_point_cuenta, 'sitio_url', i.sitio_url, 'tarjetas_modo', (select tarjetas_modo from configuracion_tienda),
    'terminales', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'terminal_id', terminal_id, 'nombre', nombre, 'modo', modo, 'por_defecto', por_defecto, 'store_id', store_id, 'pos_id', pos_id) order by por_defecto desc, id), '[]') from point_terminales where activa),
    'cobros_mes', (select jsonb_build_object('aprobados', count(*) filter (where estado = 'aprobado'), 'cobrado', coalesce(sum(monto) filter (where estado = 'aprobado'), 0))
                     from point_cobros where creado_en >= date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires') at time zone 'America/Argentina/Buenos_Aires'));
end $$;

-- Lo que necesita la caja (cualquiera del equipo; sin secretos)
create function public.point_caja() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not es_staff() then null else jsonb_build_object(
    'disponible', (coalesce(i.mp_point_token, i.mp_access_token) is not null and coalesce(i.mp_point_secreto, i.mp_webhook_secret) is not null and exists (select 1 from point_terminales where por_defecto and activa and modo = 'PDV')),
    'modo', t.tarjetas_modo, 'terminal', (select nombre from point_terminales where por_defecto and activa)) end
  from integraciones i, configuracion_tienda t
$$;

-- ── Cobrar desde la caja ────────────────────────────────────────────────
create function public._point_estado_de(p_orden jsonb) returns text
language sql immutable as $$
  select case p_orden ->> 'status'
    when 'processed' then 'aprobado' when 'canceled' then 'cancelado' when 'failed' then 'rechazado' when 'expired' then 'vencido' when 'refunded' then 'reembolsado'
    when 'action_required' then 'en_terminal' when 'at_terminal' then 'en_terminal' else 'creado' end
$$;

-- Le pregunta a Mercado Pago cómo está una orden y actualiza el cobro
create function public._point_sincronizar(p_cobro bigint) returns void
language plpgsql security definer set search_path = public as $$
declare c point_cobros; r jsonb; o jsonb; pg jsonb; v_estado text;
begin
  select * into c from point_cobros where id = p_cobro for update;
  if not found or c.orden_id is null then return; end if;
  r := _mp_point_pedir('GET', '/v1/orders/' || c.orden_id);
  if (r ->> 'status')::int <> 200 then update point_cobros set consultado_en = now() where id = p_cobro; return; end if;
  o := r -> 'cuerpo'; pg := o -> 'transactions' -> 'payments' -> 0;
  v_estado := _point_estado_de(o);
  if c.estado in ('aprobado', 'reembolsado') and v_estado not in ('reembolsado') then v_estado := c.estado; end if;   -- un cobro aprobado no vuelve atrás por una consulta tardía
  update point_cobros set estado = v_estado, consultado_en = now(), actualizado_en = now(),
         detalle = coalesce(pg ->> 'status_detail', o ->> 'status_detail', detalle), pago_id = coalesce(pg ->> 'id', pago_id),
         medio = coalesce(pg -> 'payment_method' ->> 'id', medio), cuotas = coalesce((pg -> 'payment_method' ->> 'installments')::int, cuotas)
   where id = p_cobro;
end $$;

-- Manda el monto al posnet. Devuelve {ok, id} o {ok:false, error}: nunca lanza (el cobro queda anotado aunque falle, para ver qué pasó).
create function public.point_cobrar(p_monto numeric) returns jsonb
language plpgsql security definer set search_path = public set statement_timeout = '40s' as $$
declare t point_terminales; v_id bigint; v_ref text; r jsonb; v_orden text;
begin
  if not tiene_permiso('ventas.registrar') then raise exception 'No tenés permiso para cobrar'; end if;
  if coalesce(p_monto, 0) <= 0 or p_monto > 99999999 then raise exception 'El monto no es válido'; end if;
  select * into t from point_terminales where por_defecto and activa;
  if not found or (select coalesce(mp_point_token, mp_access_token) is null from integraciones) then return jsonb_build_object('ok', false, 'error', 'El posnet todavía no está vinculado (Integraciones → Mercado Pago → Posnet)'); end if;
  if t.modo is distinct from 'PDV' then return jsonb_build_object('ok', false, 'error', 'El posnet no está en modo punto de venta: elegilo de nuevo en Integraciones → Mercado Pago y reinicialo'); end if;
  insert into point_cobros (terminal_id, monto, referencia) values (t.terminal_id, round(p_monto, 2), 'tmp' || gen_random_uuid()) returning id into v_id;
  v_ref := 'c' || v_id;
  update point_cobros set referencia = v_ref where id = v_id;
  r := _mp_point_pedir('POST', '/v1/orders', jsonb_build_object('type', 'point', 'external_reference', v_ref, 'expiration_time', 'PT10M',
         'transactions', jsonb_build_object('payments', jsonb_build_array(jsonb_build_object('amount', trim(to_char(round(p_monto, 2), 'FM999999990.00'))))),
         'config', jsonb_build_object('point', jsonb_build_object('terminal_id', t.terminal_id, 'print_on_terminal', 'no_ticket'))), 'cobro-' || v_ref || '-' || gen_random_uuid());
  v_orden := r -> 'cuerpo' ->> 'id';
  if (r ->> 'status')::int not between 200 and 299 or v_orden is null then
    update point_cobros set estado = 'error', actualizado_en = now(), detalle = left(coalesce(r -> 'cuerpo' -> 'errors' -> 0 ->> 'message', r -> 'cuerpo' ->> 'message', 'Mercado Pago contestó ' || (r ->> 'status')), 300) where id = v_id;
    return jsonb_build_object('ok', false, 'error', 'Mercado Pago no aceptó el cobro: ' || coalesce((select detalle from point_cobros where id = v_id), ''));
  end if;
  update point_cobros set orden_id = v_orden, estado = 'en_terminal', actualizado_en = now() where id = v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- Cómo va un cobro (la caja lo mira cada dos segundos). Si el aviso de Mercado Pago tarda, la base lo consulta cada 10 segundos.
create function public.point_estado(p_cobro bigint) returns jsonb
language plpgsql security definer set search_path = public set statement_timeout = '30s' as $$
declare c point_cobros;
begin
  if not es_staff() then raise exception 'No tenés acceso'; end if;
  select * into c from point_cobros where id = p_cobro and (usuario_id = auth.uid() or tiene_permiso('ventas.ver_todas'));
  if not found then raise exception 'Ese cobro no existe'; end if;
  if c.estado in ('creado', 'en_terminal') and (c.consultado_en is null or c.consultado_en < now() - interval '10 seconds') and c.creado_en < now() - interval '4 seconds' then
    perform _point_sincronizar(p_cobro);
    select * into c from point_cobros where id = p_cobro;
  end if;
  return jsonb_build_object('estado', c.estado, 'detalle', c.detalle, 'monto', c.monto, 'orden', c.orden_id, 'medio', c.medio, 'cuotas', c.cuotas, 'usado', c.venta_id is not null);
end $$;

create function public.point_cancelar(p_cobro bigint) returns jsonb
language plpgsql security definer set search_path = public set statement_timeout = '30s' as $$
declare c point_cobros; r jsonb;
begin
  if not tiene_permiso('ventas.registrar') then raise exception 'No tenés permiso para cobrar'; end if;
  select * into c from point_cobros where id = p_cobro and (usuario_id = auth.uid() or tiene_permiso('ventas.ver_todas')) for update;
  if not found then raise exception 'Ese cobro no existe'; end if;
  if c.estado not in ('creado', 'en_terminal') then return jsonb_build_object('ok', false, 'error', 'Ese cobro ya no se puede cancelar (está ' || c.estado || ')'); end if;
  r := _mp_point_pedir('POST', '/v1/orders/' || c.orden_id || '/cancel', null, 'cancelar-' || c.referencia || '-' || gen_random_uuid(), jsonb_build_object('x-allow-cancelable-status', 'at_terminal'));
  if (r ->> 'status')::int = 200 then update point_cobros set estado = 'cancelado', actualizado_en = now() where id = p_cobro;
  elsif (r ->> 'status')::int = 202 then null;   -- se pidió cancelar en el posnet: se confirma con el aviso de Mercado Pago
  else return jsonb_build_object('ok', false, 'error', coalesce(r -> 'cuerpo' ->> 'message', 'Mercado Pago no pudo cancelarlo: cancelalo desde el posnet')); end if;
  return jsonb_build_object('ok', true);
end $$;

-- El aviso de Mercado Pago (webhook /api/mercadopago/point): verifica la firma y consulta la orden. Nada de lo que trae el aviso se cree.
create function public.point_notificacion(p_data_id text, p_request_id text, p_firma text) returns text
language plpgsql security definer set search_path = public set statement_timeout = '30s' as $$
declare v_firma boolean := _mp_point_firma_valida(p_data_id, p_request_id, p_firma); c point_cobros;
begin
  if v_firma = false then return 'firma_invalida'; end if;
  if coalesce(p_data_id, '') = '' then return 'sin_id'; end if;
  select * into c from point_cobros where orden_id = p_data_id;
  if not found then return 'orden_desconocida'; end if;
  perform _point_sincronizar(c.id);
  return 'ok';
end $$;

-- ── La regla: «vinculado» = la tarjeta se cobra con el posnet ───────────
-- Al cierre de la venta (los pedidos web no entran: ya se pagaron en Checkout o en el pedido). La referencia del pago tiene que ser la de un cobro aprobado, del mismo
-- importe y todavía sin usar; ese cobro queda atado a la venta.
create function public._pago_tarjeta_vinculada() returns trigger
language plpgsql security definer set search_path = public as $$
declare v ventas; m medios_pago; c point_cobros;
begin
  select * into m from medios_pago where id = new.medio_pago_id;
  if m.tipo not in ('Débito', 'Crédito') then return null; end if;
  select * into v from ventas where id = new.venta_id;
  if v.pedido_id is not null then return null; end if;
  select * into c from point_cobros where orden_id = nullif(trim(coalesce(new.referencia, '')), '') and estado = 'aprobado' and venta_id is null and abs(monto - new.monto) < 0.01 for update;
  if found then update point_cobros set venta_id = new.venta_id where id = c.id; return null; end if;
  if (select tarjetas_modo from configuracion_tienda) = 'vinculado' then
    raise exception 'Con tarjeta se cobra con el posnet de Mercado Pago (Point): mandá el cobro al posnet antes de confirmar la venta';
  end if;
  return null;
end $$;
create constraint trigger pagos_tarjeta_vinculada after insert on public.pagos deferrable initially deferred for each row execute function public._pago_tarjeta_vinculada();

revoke execute on function public._mp_point_pedir(text, text, jsonb, text, jsonb), public._mp_point_firma_valida(text, text, text), public._point_estado_de(jsonb), public._point_sincronizar(bigint),
  public._pago_tarjeta_vinculada() from public, anon, authenticated;
revoke execute on function public.guardar_mp_point(text, text, text[]), public.mp_point_probar(), public.mp_point_buscar_terminales(), public.mp_point_usar_terminal(bigint, text), public.guardar_tarjetas_modo(text),
  public.estado_point(), public.point_caja(), public.point_cobrar(numeric), public.point_estado(bigint), public.point_cancelar(bigint) from public, anon;
grant execute on function public.guardar_mp_point(text, text, text[]), public.mp_point_probar(), public.mp_point_buscar_terminales(), public.mp_point_usar_terminal(bigint, text), public.guardar_tarjetas_modo(text),
  public.estado_point(), public.point_caja(), public.point_cobrar(numeric), public.point_estado(bigint), public.point_cancelar(bigint) to authenticated;
revoke execute on function public.point_notificacion(text, text, text) from public;
grant execute on function public.point_notificacion(text, text, text) to anon, authenticated;
