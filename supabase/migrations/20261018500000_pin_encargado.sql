-- PIN de encargado (etapa 3 de docs/CONFIGURACION_Y_PERMISOS.md): un descuento por encima del tope del rol se autoriza en la misma caja con el PIN
-- de alguien que tenga «Autorizar excepciones» (el Encargado). El PIN se guarda con hash (nadie lo lee), la autorización dura 10 minutos, sirve para
-- UN descuento hasta el monto autorizado, se consume en registrar_venta y queda en la bitácora con quién autorizó. 5 PIN mal puestos bloquean 10 minutos.
insert into public.permisos (orden, grupo, codigo, nombre, descripcion) values
  (14, 'Ventas', 'ventas.autorizar', 'Autorizar excepciones con su PIN', 'Autorizar en la caja un descuento por encima del tope de quien vende, con su PIN personal.');
update public.roles set permisos = permisos || '{ventas.autorizar}' where nombre = 'Encargado' and not ('ventas.autorizar' = any (permisos));

create table public.pines_autorizacion (
  usuario_id  uuid primary key references auth.users (id) on delete cascade,
  pin_hash    text not null,
  cambiado_en timestamptz not null default now()
);
alter table public.pines_autorizacion enable row level security;      -- nadie la lee ni la escribe: solo las funciones
create policy "nadie lee los PIN" on public.pines_autorizacion for select to authenticated using (false);

create table public.autorizaciones (
  id           bigint generated always as identity primary key,
  creada_en    timestamptz not null default now(),
  para_usuario uuid not null references auth.users (id) on delete cascade,     -- quien pidió la autorización (el vendedor)
  autoriza_id  uuid references auth.users (id) on delete set null,             -- quien puso su PIN (null si falló)
  tipo         text not null check (tipo in ('descuento')),
  monto        numeric(12,2) not null check (monto >= 0),
  ok           boolean not null,
  vence_en     timestamptz not null,
  usada_en     timestamptz
);
create index on public.autorizaciones (para_usuario, creada_en desc);
create index on public.autorizaciones (autoriza_id);
alter table public.autorizaciones enable row level security;          -- se ve en la bitácora, no acá
create policy "nadie lee las autorizaciones" on public.autorizaciones for select to authenticated using (false);

create function public.tengo_pin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from pines_autorizacion where usuario_id = auth.uid()) $$;

create function public.cambiar_mi_pin(p_pin text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tiene_permiso('ventas.autorizar') then raise exception 'No tenés permiso para autorizar excepciones'; end if;
  if p_pin !~ '^[0-9]{4,8}$' then raise exception 'El PIN son de 4 a 8 números'; end if;
  insert into pines_autorizacion (usuario_id, pin_hash) values (auth.uid(), extensions.crypt(p_pin, extensions.gen_salt('bf')))
  on conflict (usuario_id) do update set pin_hash = excluded.pin_hash, cambiado_en = now();
  perform registrar_bitacora('ventas', 'cambiar', 'PIN de encargado', auth.uid()::text, 'Cambió su PIN de autorización', null, null);
end $$;

-- La pide quien vende: devuelve quién autorizó (si el PIN es de un encargado) o el error
create function public.autorizar_descuento(p_pin text, p_monto numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_fallos int; v_autoriza uuid; v_nombre text;
begin
  if not tiene_permiso('ventas.registrar') then raise exception 'No tenés permiso para vender'; end if;
  if coalesce(p_monto, 0) <= 0 then raise exception 'No hay descuento para autorizar'; end if;
  select count(*) into v_fallos from autorizaciones where para_usuario = auth.uid() and not ok and creada_en > now() - interval '10 minutes';
  if v_fallos >= 5 then return jsonb_build_object('ok', false, 'error', 'Demasiados intentos: esperá unos minutos'); end if;
  select pe.id, coalesce(nullif(pe.nombre, ''), u.email) into v_autoriza, v_nombre
    from pines_autorizacion pi
    join perfiles pe on pe.id = pi.usuario_id and pe.rol = 'staff'
    join roles r on r.id = pe.rol_id and r.activo
    join auth.users u on u.id = pe.id
   where pe.id <> auth.uid() and pi.pin_hash = extensions.crypt(coalesce(p_pin, ''), pi.pin_hash)
     and (r.todos or 'ventas.autorizar' = any (r.permisos))
   limit 1;
  if v_autoriza is null then
    insert into autorizaciones (para_usuario, tipo, monto, ok, vence_en) values (auth.uid(), 'descuento', p_monto, false, now());
    return jsonb_build_object('ok', false, 'error', 'PIN incorrecto', 'restantes', greatest(0, 4 - v_fallos));
  end if;
  insert into autorizaciones (para_usuario, autoriza_id, tipo, monto, ok, vence_en) values (auth.uid(), v_autoriza, 'descuento', p_monto, true, now() + interval '10 minutes');
  return jsonb_build_object('ok', true, 'autoriza', v_nombre, 'monto', p_monto);
end $$;

-- La usa registrar_venta cuando el descuento pasa el tope: ¿hay una autorización vigente para este monto? La consume (una sola vez)
create function public._consumir_autorizacion(p_tipo text, p_monto numeric) returns boolean
language plpgsql security definer set search_path = public as $$
declare a autorizaciones; v_quien text;
begin
  select * into a from autorizaciones where para_usuario = auth.uid() and tipo = p_tipo and ok and usada_en is null and vence_en > now() and monto >= p_monto
   order by id desc limit 1 for update;
  if a.id is null then return false; end if;
  update autorizaciones set usada_en = now() where id = a.id;
  select coalesce(nullif(pe.nombre, ''), u.email) into v_quien from auth.users u left join perfiles pe on pe.id = u.id where u.id = a.autoriza_id;
  perform registrar_bitacora('ventas', 'crear', 'autorización', a.id::text, format('%s autorizó con su PIN un descuento de $ %s', v_quien, translate(to_char(p_monto, 'FM999,999,999,990.00'), ',.', '.,')), null, jsonb_build_object('tipo', p_tipo, 'monto', p_monto));
  return true;
end $$;

-- registrar_venta: pasar el tope exige una autorización vigente (el resto de la función queda igual)
do $$
declare v_oid oid := 'public.registrar_venta(jsonb,jsonb,bigint,numeric,text,bigint,text)'::regprocedure; v_def text; v_nuevo text;
begin
  v_def := pg_get_functiondef(v_oid);
  v_nuevo := replace(v_def, 'coalesce(p_descuento, 0) > round(v_neto * v_tope / 100, 2) then',
                     'coalesce(p_descuento, 0) > round(v_neto * v_tope / 100, 2) and not public._consumir_autorizacion(''descuento'', p_descuento) then');
  if v_nuevo = v_def then raise exception 'No encontré el control del tope en registrar_venta'; end if;
  execute v_nuevo;
end $$;

revoke execute on function public.tengo_pin(), public.cambiar_mi_pin(text), public.autorizar_descuento(text, numeric), public._consumir_autorizacion(text, numeric) from public, anon;
grant execute on function public.tengo_pin(), public.cambiar_mi_pin(text), public.autorizar_descuento(text, numeric) to authenticated;
