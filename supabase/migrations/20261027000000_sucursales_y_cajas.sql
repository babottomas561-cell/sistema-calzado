-- Sucursales y cajas del sistema, vinculadas con las de Mercado Pago. Siempre hay una sucursal y una caja «principal»; quien tiene un solo local no ve nada distinto.
--   · cada sucursal es de un depósito y puede estar vinculada con UNA sucursal de Mercado Pago;
--   · cada caja es de una sucursal y puede estar vinculada con UNA caja de Mercado Pago (la del QR) y con UN posnet;
--   · cada dispositivo (tablet, celular) se asigna a una caja: cobra con el QR y el posnet de esa caja.
-- Agrega, no rompe: lo que ya estaba cargado en `integraciones.mp_qr_*` pasa a la caja principal.

create table public.sucursales (
  id             bigint generated always as identity primary key,
  nombre         text not null check (length(trim(nombre)) between 1 and 60),
  activa         boolean not null default true,
  por_defecto    boolean not null default false,
  deposito_id    bigint references public.depositos (id) on delete restrict,
  mp_sucursal_id text,                                  -- la sucursal de Mercado Pago
  creado_en      timestamptz not null default now()
);
create unique index sucursales_nombre_key on public.sucursales (lower(nombre));
create unique index sucursales_una_por_defecto on public.sucursales (por_defecto) where por_defecto;
create unique index sucursales_mp_key on public.sucursales (mp_sucursal_id) where mp_sucursal_id is not null;
create index sucursales_deposito_id_idx on public.sucursales (deposito_id);

create table public.cajas (
  id               bigint generated always as identity primary key,
  sucursal_id      bigint not null references public.sucursales (id) on delete restrict,
  nombre           text not null check (length(trim(nombre)) between 1 and 60),
  activa           boolean not null default true,
  por_defecto      boolean not null default false,
  mp_caja_id       text,                                 -- la caja de Mercado Pago
  mp_externo       text,                                 -- su identificador (external_pos_id): lo que pide la orden de QR
  mp_qr_imagen     text,
  mp_qr_plantilla  text,
  terminal_id      bigint references public.point_terminales (id) on delete set null,   -- su posnet
  creado_en        timestamptz not null default now()
);
create unique index cajas_nombre_key on public.cajas (sucursal_id, lower(nombre));
create unique index cajas_una_por_defecto on public.cajas (por_defecto) where por_defecto;
create unique index cajas_mp_externo_key on public.cajas (mp_externo) where mp_externo is not null;
create index cajas_sucursal_id_idx on public.cajas (sucursal_id);
create index cajas_terminal_id_idx on public.cajas (terminal_id);

alter table public.sucursales enable row level security;
alter table public.cajas enable row level security;
create policy "el equipo ve las sucursales" on public.sucursales for select to authenticated using (es_staff());
create policy "el equipo ve las cajas" on public.cajas for select to authenticated using (es_staff());

alter table public.dispositivos add column caja_id bigint references public.cajas (id) on delete set null;
create index dispositivos_caja_id_idx on public.dispositivos (caja_id);
alter table public.point_cobros add column caja_id bigint references public.cajas (id) on delete set null;
create index point_cobros_caja_id_idx on public.point_cobros (caja_id);

insert into public.modulos (clave, nombre, fijo, depende, activo) values ('sucursales', 'Sucursales y cajas', false, '{}', false);

-- La sucursal y la caja principales (con lo que ya hubiera cargado)
insert into public.sucursales (nombre, por_defecto, deposito_id, mp_sucursal_id)
  select 'Principal', true, deposito_principal(), (select mp_qr_sucursal from public.integraciones);
insert into public.cajas (sucursal_id, nombre, por_defecto, mp_caja_id, mp_externo, mp_qr_imagen, mp_qr_plantilla, terminal_id)
  select (select id from public.sucursales where por_defecto), 'Caja 1', true, i.mp_qr_caja, i.mp_qr_externo, i.mp_qr_imagen, i.mp_qr_plantilla,
         (select id from public.point_terminales where por_defecto and activa)
  from public.integraciones i;

-- La caja que corresponde (null = la principal)
create function public._caja_efectiva(p_caja bigint) returns public.cajas
language plpgsql stable security definer set search_path = public as $$
declare c cajas;
begin
  select * into c from cajas where id = coalesce(p_caja, (select id from cajas where por_defecto)) and activa;
  if not found then raise exception 'Esa caja no existe o está apagada'; end if;
  return c;
end $$;
revoke execute on function public._caja_efectiva(bigint) from public, anon, authenticated;

-- ── Administrar sucursales y cajas (equipo.administrar) ──
create function public.guardar_sucursal(p_nombre text, p_id bigint default null, p_deposito bigint default null, p_activa boolean default true) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if not tiene_permiso('equipo.administrar') then raise exception 'Solo el administrador cambia las sucursales'; end if;
  if length(trim(coalesce(p_nombre, ''))) = 0 then raise exception 'Ponele un nombre a la sucursal'; end if;
  if p_id is null then
    insert into sucursales (nombre, deposito_id) values (trim(p_nombre), p_deposito) returning id into v_id;
  else
    if not coalesce(p_activa, true) and (select por_defecto from sucursales where id = p_id) then raise exception 'La sucursal principal no se apaga'; end if;
    update sucursales set nombre = trim(p_nombre), deposito_id = p_deposito, activa = coalesce(p_activa, true) where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Esa sucursal no existe'; end if;
  end if;
  return v_id;
exception when unique_violation then raise exception 'Ya hay una sucursal con ese nombre';
end $$;

create function public.guardar_caja(p_sucursal bigint, p_nombre text, p_id bigint default null, p_terminal bigint default null, p_activa boolean default true) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if not tiene_permiso('equipo.administrar') then raise exception 'Solo el administrador cambia las cajas'; end if;
  if length(trim(coalesce(p_nombre, ''))) = 0 then raise exception 'Ponele un nombre a la caja'; end if;
  if p_id is null then
    insert into cajas (sucursal_id, nombre, terminal_id) values (p_sucursal, trim(p_nombre), p_terminal) returning id into v_id;
  else
    if not coalesce(p_activa, true) and (select por_defecto from cajas where id = p_id) then raise exception 'La caja principal no se apaga'; end if;
    update cajas set sucursal_id = p_sucursal, nombre = trim(p_nombre), terminal_id = p_terminal, activa = coalesce(p_activa, true) where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Esa caja no existe'; end if;
  end if;
  return v_id;
exception when unique_violation then raise exception 'Ya hay una caja con ese nombre en esa sucursal';
end $$;

create function public.dispositivo_asignar_caja(p_dispositivo bigint, p_caja bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tiene_permiso('equipo.administrar') then raise exception 'Solo el administrador asigna cajas a los dispositivos'; end if;
  update dispositivos set caja_id = p_caja where id = p_dispositivo;
  if not found then raise exception 'Ese dispositivo no existe'; end if;
end $$;

-- ── Vincular con Mercado Pago (tienda.editar) ──
create function public.sucursal_vincular_mp(p_sucursal bigint, p_mp text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tiene_permiso('tienda.editar') then raise exception 'No tenés permiso para configurar las conexiones'; end if;
  update sucursales set mp_sucursal_id = nullif(trim(coalesce(p_mp, '')), '') where id = p_sucursal;
  if not found then raise exception 'Esa sucursal no existe'; end if;
exception when unique_violation then raise exception 'Esa sucursal de Mercado Pago ya está vinculada con otra sucursal del sistema';
end $$;

create function public.sucursal_crear_en_mp(p_sucursal bigint, p_calle text, p_numero text, p_ciudad text, p_provincia text) returns jsonb
language plpgsql security definer set search_path = public set statement_timeout = '40s' as $$
declare s sucursales; r jsonb; v_user text; v_id text; v_ext text;
begin
  if not tiene_permiso('tienda.editar') then raise exception 'No tenés permiso para configurar las conexiones'; end if;
  select * into s from sucursales where id = p_sucursal;
  if not found then raise exception 'Esa sucursal no existe'; end if;
  if s.mp_sucursal_id is not null then return jsonb_build_object('ok', true, 'ya', true); end if;
  if coalesce(trim(p_calle), '') = '' or coalesce(trim(p_numero), '') = '' or coalesce(trim(p_ciudad), '') = '' or coalesce(trim(p_provincia), '') = '' then
    raise exception 'Completá calle, número, ciudad y provincia del local';
  end if;
  r := _mp_point_pedir('GET', '/users/me');
  if (r ->> 'status')::int in (401, 403) then return jsonb_build_object('ok', false, 'error', 'Mercado Pago no reconoce el Access Token'); end if;
  v_user := r -> 'cuerpo' ->> 'id';
  if v_user is null then return jsonb_build_object('ok', false, 'error', 'No se pudo leer la cuenta de Mercado Pago'); end if;
  v_ext := 'SUC' || s.id;
  r := _mp_point_pedir('POST', '/users/' || v_user || '/stores', jsonb_build_object('name', left(s.nombre, 60), 'external_id', v_ext,
         'location', jsonb_build_object('street_name', trim(p_calle), 'street_number', trim(p_numero), 'city_name', trim(p_ciudad), 'state_name', trim(p_provincia),
           'latitude', -34.6037, 'longitude', -58.3816, 'reference', 'Local')));
  v_id := r -> 'cuerpo' ->> 'id';
  if v_id is null and coalesce(r -> 'cuerpo' ->> 'message', '') ilike '%already assigned%' then
    r := _mp_point_pedir('GET', '/users/' || v_user || '/stores/search?external_id=' || v_ext);
    v_id := coalesce(r -> 'cuerpo' -> 'results' -> 0 ->> 'id', r -> 'cuerpo' ->> 'id');
    r := jsonb_build_object('status', 200);
  end if;
  if (r ->> 'status')::int not between 200 and 299 or v_id is null then
    return jsonb_build_object('ok', false, 'error', 'Mercado Pago no creó la sucursal (' || (r ->> 'status') || '): ' || left(coalesce(r -> 'cuerpo' ->> 'message', '') || ' ' || coalesce((r -> 'cuerpo' -> 'errors')::text, (r -> 'cuerpo' -> 'cause')::text, ''), 400));
  end if;
  update sucursales set mp_sucursal_id = v_id where id = p_sucursal;
  return jsonb_build_object('ok', true);
end $$;

-- Usar una caja de Mercado Pago que ya existe (necesita su identificador)
create function public.caja_vincular_mp(p_caja bigint, p_mp_caja text, p_mp_externo text) returns jsonb
language plpgsql security definer set search_path = public set statement_timeout = '30s' as $$
declare r jsonb; v_pos jsonb := '{}';
begin
  if not tiene_permiso('tienda.editar') then raise exception 'No tenés permiso para configurar las conexiones'; end if;
  if coalesce(trim(p_mp_externo), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Esa caja no tiene identificador en Mercado Pago, así que no se puede usar para cobrar. Creá una caja nueva desde acá.');
  end if;
  r := _mp_point_pedir('GET', '/pos/' || trim(p_mp_caja));
  if (r ->> 'status')::int between 200 and 299 then v_pos := r -> 'cuerpo'; end if;
  update cajas set mp_caja_id = trim(p_mp_caja), mp_externo = trim(p_mp_externo),
         mp_qr_imagen = coalesce(v_pos -> 'qr_response' ->> 'image', v_pos -> 'qr' ->> 'image'), mp_qr_plantilla = coalesce(v_pos -> 'qr_response' ->> 'template_document', v_pos -> 'qr' ->> 'template_document')
   where id = p_caja;
  if not found then raise exception 'Esa caja no existe'; end if;
  return jsonb_build_object('ok', true);
exception when unique_violation then return jsonb_build_object('ok', false, 'error', 'Esa caja de Mercado Pago ya está vinculada con otra caja del sistema');
end $$;

-- Crear la caja en Mercado Pago (la sucursal tiene que estar vinculada)
create function public.caja_crear_en_mp(p_caja bigint) returns jsonb
language plpgsql security definer set search_path = public set statement_timeout = '40s' as $$
declare c cajas; s sucursales; r jsonb; v_pos jsonb; v_ext text;
begin
  if not tiene_permiso('tienda.editar') then raise exception 'No tenés permiso para configurar las conexiones'; end if;
  select * into c from cajas where id = p_caja;
  if not found then raise exception 'Esa caja no existe'; end if;
  select * into s from sucursales where id = c.sucursal_id;
  if s.mp_sucursal_id is null then return jsonb_build_object('ok', false, 'error', 'Primero vinculá o creá la sucursal en Mercado Pago'); end if;
  if c.mp_externo is not null then return jsonb_build_object('ok', true, 'ya', true); end if;
  v_ext := 'CAJA' || c.id;
  r := _mp_point_pedir('POST', '/v2/pos', jsonb_build_object('name', left(c.nombre, 60), 'external_id', v_ext, 'store_id', s.mp_sucursal_id,
         'config', jsonb_build_object('qr', jsonb_build_object('operating_mode', 'pdv'))), 'caja-' || c.id || '-' || v_ext);
  v_pos := r -> 'cuerpo';
  if v_pos ->> 'id' is null and coalesce(v_pos ->> 'message', '') ilike '%already%' then
    r := _mp_point_pedir('GET', '/pos?external_id=' || v_ext);
    v_pos := coalesce(r -> 'cuerpo' -> 'results' -> 0, r -> 'cuerpo');
    r := jsonb_build_object('status', 200);
  end if;
  if (r ->> 'status')::int not between 200 and 299 or v_pos ->> 'id' is null then
    return jsonb_build_object('ok', false, 'error', 'Mercado Pago no creó la caja (' || (r ->> 'status') || '): ' || left(coalesce(v_pos ->> 'message', '') || ' ' || coalesce((v_pos -> 'errors')::text, (v_pos -> 'cause')::text, ''), 400));
  end if;
  update cajas set mp_caja_id = v_pos ->> 'id', mp_externo = coalesce(v_pos ->> 'external_id', v_ext),
         mp_qr_imagen = coalesce(v_pos -> 'qr_response' ->> 'image', v_pos -> 'qr' ->> 'image'), mp_qr_plantilla = coalesce(v_pos -> 'qr_response' ->> 'template_document', v_pos -> 'qr' ->> 'template_document')
   where id = p_caja;
  return jsonb_build_object('ok', true);
end $$;

create function public.caja_desvincular_mp(p_caja bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tiene_permiso('tienda.editar') then raise exception 'No tenés permiso para configurar las conexiones'; end if;
  update cajas set mp_caja_id = null, mp_externo = null, mp_qr_imagen = null, mp_qr_plantilla = null where id = p_caja;
end $$;

-- Todo junto, para la pantalla de sucursales y cajas
create function public.sucursales_estado() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not (tiene_permiso('equipo.administrar') or tiene_permiso('tienda.editar')) then null else jsonb_build_object(
    'sucursales', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'nombre', s.nombre, 'activa', s.activa, 'por_defecto', s.por_defecto, 'deposito_id', s.deposito_id,
        'deposito', (select nombre from depositos where id = s.deposito_id), 'mp_sucursal_id', s.mp_sucursal_id,
        'cajas', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.nombre, 'activa', c.activa, 'por_defecto', c.por_defecto, 'mp_caja_id', c.mp_caja_id, 'mp_externo', c.mp_externo,
            'terminal_id', c.terminal_id, 'qr_imagen', c.mp_qr_imagen, 'qr_plantilla', c.mp_qr_plantilla,
            'dispositivos', coalesce((select jsonb_agg(d.nombre order by d.nombre) from dispositivos d where d.caja_id = c.id and d.activo), '[]'::jsonb)) order by c.por_defecto desc, c.nombre)
          from cajas c where c.sucursal_id = s.id), '[]'::jsonb)) order by s.por_defecto desc, s.nombre) from sucursales s), '[]'::jsonb),
    'depositos', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre) order by nombre) from depositos where vendible), '[]'::jsonb),
    'terminales', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nombre', coalesce(nombre, terminal_id)) order by id) from point_terminales where activa), '[]'::jsonb),
    'dispositivos', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre, 'caja_id', caja_id) order by nombre) from dispositivos where activo), '[]'::jsonb)) end
$$;

-- El motivo de un rechazo de Mercado Pago, en castellano y con su detalle (antes se perdía: «Invalid value for property»)
create function public._mp_error_texto(p_cuerpo jsonb, p_status text) returns text
language plpgsql immutable as $$
declare v_det text := coalesce((select string_agg(d, '; ') from jsonb_array_elements_text(coalesce(p_cuerpo -> 'errors' -> 0 -> 'details', '[]'::jsonb)) d), '');
        v_min text := substring(v_det from 'greater than or equal to ([0-9.]+)');
begin
  if v_min is not null then return 'Mercado Pago no acepta cobros menores a $ ' || replace(to_char(v_min::numeric, 'FM999999990.00'), '.', ','); end if;
  return coalesce(nullif(trim(concat_ws(' · ', p_cuerpo -> 'errors' -> 0 ->> 'message', nullif(v_det, ''))), ''), p_cuerpo ->> 'message', 'Mercado Pago contestó ' || p_status);
end $$;
revoke execute on function public._mp_error_texto(jsonb, text) from public, anon, authenticated;

-- ── Lo que usa la caja: todo por caja ──
drop function public.point_cobrar(numeric);
CREATE OR REPLACE FUNCTION public.point_cobrar(p_monto numeric, p_caja bigint DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '40s'
AS $function$
declare t point_terminales; v_caja cajas; v_id bigint; v_ref text; r jsonb; v_orden text;
begin
  if not tiene_permiso('ventas.registrar') then raise exception 'No tenés permiso para cobrar'; end if;
  if coalesce(p_monto, 0) <= 0 or p_monto > 99999999 then raise exception 'El monto no es válido'; end if;
  v_caja := _caja_efectiva(p_caja);
  -- el posnet de la caja; si no tiene uno asignado, el de siempre
  select * into t from point_terminales where activa and id = coalesce(v_caja.terminal_id, (select id from point_terminales where por_defecto and activa limit 1));
  if not found or (select coalesce(mp_point_token, mp_access_token) is null from integraciones) then return jsonb_build_object('ok', false, 'error', 'El posnet todavía no está vinculado (Integraciones → Mercado Pago → Posnet)'); end if;
  if t.modo is distinct from 'PDV' then return jsonb_build_object('ok', false, 'error', 'El posnet no está en modo punto de venta: elegilo de nuevo en Integraciones → Mercado Pago y reinicialo'); end if;
  insert into point_cobros (terminal_id, monto, referencia, caja_id) values (t.terminal_id, round(p_monto, 2), 'tmp' || gen_random_uuid(), v_caja.id) returning id into v_id;
  v_ref := 'c' || v_id;
  update point_cobros set referencia = v_ref where id = v_id;
  begin
    r := _mp_point_pedir('POST', '/v1/orders', jsonb_build_object('type', 'point', 'external_reference', v_ref, 'expiration_time', 'PT10M',
           'transactions', jsonb_build_object('payments', jsonb_build_array(jsonb_build_object('amount', trim(to_char(round(p_monto, 2), 'FM999999990.00'))))),
           'config', jsonb_build_object('point', jsonb_build_object('terminal_id', t.terminal_id, 'print_on_terminal', 'no_ticket'))), 'cobro-' || v_ref);
  exception when others then
    -- Mercado Pago no contestó: el cobro puede haber llegado igual al posnet o al QR. Queda anotado para revisarlo antes de cobrar de nuevo.
    update point_cobros set estado = 'error', actualizado_en = now(), detalle = 'Mercado Pago no respondió a tiempo' where id = v_id;
    return jsonb_build_object('ok', false, 'error', 'Mercado Pago no respondió a tiempo. Antes de cobrar de nuevo, mirá si el cobro llegó al posnet o al QR.');
  end;
  v_orden := r -> 'cuerpo' ->> 'id';
  if (r ->> 'status')::int not between 200 and 299 or v_orden is null then
    update point_cobros set estado = 'error', actualizado_en = now(), detalle = left(_mp_error_texto(r -> 'cuerpo', r ->> 'status'), 300) where id = v_id;
    return jsonb_build_object('ok', false, 'error', 'Mercado Pago no aceptó el cobro: ' || coalesce((select detalle from point_cobros where id = v_id), ''));
  end if;
  update point_cobros set orden_id = v_orden, estado = 'en_terminal', actualizado_en = now() where id = v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $function$;

drop function public.qr_cobrar(numeric, text);
CREATE OR REPLACE FUNCTION public.qr_cobrar(p_monto numeric, p_modo text DEFAULT 'dynamic'::text, p_caja bigint DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '40s'
AS $function$
declare v_caja cajas; v_id bigint; v_ref text; r jsonb; v_orden text; v_qr text; v_externo text; v_modo text := case when p_modo = 'hybrid' then 'hybrid' else 'dynamic' end;
begin
  if not tiene_permiso('ventas.registrar') then raise exception 'No tenés permiso para cobrar'; end if;
  if coalesce(p_monto, 0) <= 0 or p_monto > 99999999 then raise exception 'El monto no es válido'; end if;
  v_caja := _caja_efectiva(p_caja);
  v_externo := v_caja.mp_externo;
  if v_externo is null then return jsonb_build_object('ok', false, 'error', 'El cobro con QR todavía no está preparado (Integraciones → Mercado Pago → Sucursales y cajas)'); end if;
  insert into point_cobros (via, monto, referencia, caja_id) values ('qr', round(p_monto, 2), 'tmp' || gen_random_uuid(), v_caja.id) returning id into v_id;
  v_ref := 'c' || v_id;
  update point_cobros set referencia = v_ref where id = v_id;
  begin
    r := _mp_point_pedir('POST', '/v1/orders', jsonb_build_object('type', 'qr', 'external_reference', v_ref, 'expiration_time', 'PT10M',
           'total_amount', trim(to_char(round(p_monto, 2), 'FM999999990.00')),
           'transactions', jsonb_build_object('payments', jsonb_build_array(jsonb_build_object('amount', trim(to_char(round(p_monto, 2), 'FM999999990.00'))))),
           'config', jsonb_build_object('qr', jsonb_build_object('external_pos_id', v_externo, 'mode', v_modo))), 'cobro-' || v_ref);
  exception when others then
    -- Mercado Pago no contestó: el cobro puede haber llegado igual al posnet o al QR. Queda anotado para revisarlo antes de cobrar de nuevo.
    update point_cobros set estado = 'error', actualizado_en = now(), detalle = 'Mercado Pago no respondió a tiempo' where id = v_id;
    return jsonb_build_object('ok', false, 'error', 'Mercado Pago no respondió a tiempo. Antes de cobrar de nuevo, mirá si el cobro llegó al posnet o al QR.');
  end;
  v_orden := r -> 'cuerpo' ->> 'id';
  v_qr := r -> 'cuerpo' -> 'type_response' ->> 'qr_data';
  -- en el modo híbrido el cliente escanea el QR del mostrador: no hace falta el texto del QR
  if (r ->> 'status')::int not between 200 and 299 or v_orden is null or (v_modo = 'dynamic' and v_qr is null) then
    update point_cobros set estado = 'error', actualizado_en = now(), detalle = left(_mp_error_texto(r -> 'cuerpo', r ->> 'status'), 300) where id = v_id;
    return jsonb_build_object('ok', false, 'error', 'Mercado Pago no generó el cobro: ' || coalesce((select detalle from point_cobros where id = v_id), ''));
  end if;
  update point_cobros set orden_id = v_orden, qr_data = v_qr, estado = 'en_terminal', actualizado_en = now() where id = v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $function$;

drop function public.qr_fijo();
create function public.qr_fijo(p_caja bigint default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c cajas; r jsonb;
begin
  if not es_staff() then raise exception 'No tenés acceso'; end if;
  select * into c from cajas where id = coalesce(p_caja, (select id from cajas where por_defecto));
  if not found or c.mp_caja_id is null then return jsonb_build_object('listo', false); end if;
  if c.mp_qr_imagen is null and c.mp_qr_plantilla is null then
    r := _mp_point_pedir('GET', '/pos/' || c.mp_caja_id);
    if (r ->> 'status')::int = 200 then
      update cajas set mp_qr_imagen = coalesce(r -> 'cuerpo' -> 'qr_response' ->> 'image', r -> 'cuerpo' -> 'qr' ->> 'image'),
                       mp_qr_plantilla = coalesce(r -> 'cuerpo' -> 'qr_response' ->> 'template_document', r -> 'cuerpo' -> 'qr' ->> 'template_document') where id = c.id;
      select * into c from cajas where id = c.id;
    end if;
  end if;
  return jsonb_build_object('listo', true, 'imagen', c.mp_qr_imagen, 'plantilla', c.mp_qr_plantilla);
end $$;

drop function public.point_caja();
create function public.point_caja(p_caja bigint default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not es_staff() then null else jsonb_build_object(
    'caja_id', c.id, 'caja', c.nombre,
    'disponible', (coalesce(i.mp_point_token, i.mp_access_token) is not null and coalesce(i.mp_point_secreto, i.mp_webhook_secret) is not null
                   and exists (select 1 from point_terminales pt where pt.activa and pt.modo = 'PDV' and pt.id = coalesce(c.terminal_id, (select id from point_terminales where por_defecto and activa limit 1)))),
    'modo', t.tarjetas_modo, 'terminal', (select nombre from point_terminales pt where pt.activa and pt.id = coalesce(c.terminal_id, (select id from point_terminales where por_defecto and activa limit 1))),
    'qr', (coalesce(i.mp_point_token, i.mp_access_token) is not null and coalesce(i.mp_point_secreto, i.mp_webhook_secret) is not null and c.mp_externo is not null)) end
  from integraciones i, configuracion_tienda t, cajas c where c.id = coalesce(p_caja, (select id from cajas where por_defecto))
$$;

-- estado_qr (lo usaba la pantalla anterior): ahora mira la caja principal
create or replace function public.estado_qr() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not tiene_permiso('tienda.editar') then null
    else jsonb_build_object('listo', c.mp_externo is not null, 'sucursal', s.mp_sucursal_id is not null, 'sucursal_id', s.mp_sucursal_id, 'caja_id', c.mp_caja_id, 'caja_externa', c.mp_externo) end
  from cajas c join sucursales s on s.id = c.sucursal_id where c.por_defecto
$$;

-- Las preferencias de cobro dicen además qué caja le toca a este aparato y qué tiene esa caja
create or replace function public.cobro_medios(p_dispositivo uuid default null) returns jsonb
language sql stable security definer set search_path = public as $$
  with yo as (
    select auth.uid() as uid, (select rol_id from perfiles where id = auth.uid()) as rol,
           (select id from dispositivos where clave = p_dispositivo and activo) as disp,
           (select caja_id from dispositivos where clave = p_dispositivo and activo) as caja
  ), medios(medio) as (values ('posnet'), ('qr'), ('qr_fijo'))
  select case when not es_staff() then null else coalesce(jsonb_object_agg(m.medio, coalesce(
      (select habilitado from preferencias_cobro p, yo where p.medio = m.medio and p.ambito = 'dispositivo' and p.referencia = yo.disp::text),
      (select habilitado from preferencias_cobro p, yo where p.medio = m.medio and p.ambito = 'usuario' and p.referencia = yo.uid::text),
      (select habilitado from preferencias_cobro p, yo where p.medio = m.medio and p.ambito = 'rol' and p.referencia = yo.rol::text),
      true)), '{}'::jsonb) || jsonb_build_object('caja', point_caja((select caja from yo))) end
  from medios m
$$;

-- ── Las funciones de la pantalla anterior siguen andando: ahora trabajan sobre la sucursal y la caja principales ──
create or replace function public.qr_preparar(p_calle text, p_numero text, p_ciudad text, p_provincia text) returns jsonb
language plpgsql security definer set search_path = public set statement_timeout = '50s' as $$
declare r jsonb;
begin
  if not tiene_permiso('tienda.editar') then raise exception 'No tenés permiso para configurar las conexiones'; end if;
  r := sucursal_crear_en_mp((select id from sucursales where por_defecto), p_calle, p_numero, p_ciudad, p_provincia);
  if (r ->> 'ok')::boolean is not true then return r; end if;
  return caja_crear_en_mp((select id from cajas where por_defecto));
end $$;

create or replace function public.qr_usar_sucursal(p_sucursal text, p_caja text default null, p_caja_externo text default null) returns jsonb
language plpgsql security definer set search_path = public set statement_timeout = '40s' as $$
begin
  if not tiene_permiso('tienda.editar') then raise exception 'No tenés permiso para configurar las conexiones'; end if;
  if coalesce(trim(p_sucursal), '') = '' then raise exception 'Elegí una sucursal'; end if;
  perform sucursal_vincular_mp((select id from sucursales where por_defecto), p_sucursal);
  if coalesce(trim(p_caja), '') <> '' then return caja_vincular_mp((select id from cajas where por_defecto), p_caja, p_caja_externo); end if;
  return caja_crear_en_mp((select id from cajas where por_defecto));
end $$;

create or replace function public.qr_desvincular() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tiene_permiso('tienda.editar') then raise exception 'No tenés permiso para configurar las conexiones'; end if;
  perform caja_desvincular_mp((select id from cajas where por_defecto));
  update sucursales set mp_sucursal_id = null where por_defecto;
end $$;

revoke execute on function public.guardar_sucursal(text, bigint, bigint, boolean), public.guardar_caja(bigint, text, bigint, bigint, boolean), public.dispositivo_asignar_caja(bigint, bigint),
  public.sucursal_vincular_mp(bigint, text), public.sucursal_crear_en_mp(bigint, text, text, text, text), public.caja_vincular_mp(bigint, text, text), public.caja_crear_en_mp(bigint),
  public.caja_desvincular_mp(bigint), public.sucursales_estado(), public.point_cobrar(numeric, bigint), public.qr_cobrar(numeric, text, bigint), public.qr_fijo(bigint), public.point_caja(bigint) from public, anon;
grant execute on function public.guardar_sucursal(text, bigint, bigint, boolean), public.guardar_caja(bigint, text, bigint, bigint, boolean), public.dispositivo_asignar_caja(bigint, bigint),
  public.sucursal_vincular_mp(bigint, text), public.sucursal_crear_en_mp(bigint, text, text, text, text), public.caja_vincular_mp(bigint, text, text), public.caja_crear_en_mp(bigint),
  public.caja_desvincular_mp(bigint), public.sucursales_estado(), public.point_cobrar(numeric, bigint), public.qr_cobrar(numeric, text, bigint), public.qr_fijo(bigint), public.point_caja(bigint) to authenticated;
