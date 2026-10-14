-- Preferencias de cobro: qué medios de Mercado Pago ofrece la caja (posnet, QR en pantalla, QR del mostrador) según el dispositivo, la persona o el rol.
-- Gana lo más específico: dispositivo > persona > rol > general (todo habilitado). Es comodidad de la pantalla, no seguridad: lo que protege el dinero sigue
-- siendo el permiso de cobrar y la regla de tarjetas, que controla la base.

create table public.dispositivos (
  id        bigint generated always as identity primary key,
  clave     uuid not null unique default gen_random_uuid(),   -- la guarda el navegador de ese aparato
  nombre    text not null check (length(trim(nombre)) between 1 and 60),
  activo    boolean not null default true,
  creado_en timestamptz not null default now()
);
alter table public.dispositivos enable row level security;
create policy "el administrador ve los dispositivos" on public.dispositivos for select to authenticated using (tiene_permiso('equipo.administrar'));

create table public.preferencias_cobro (
  id         bigint generated always as identity primary key,
  ambito     text not null check (ambito in ('rol', 'usuario', 'dispositivo')),
  referencia text not null,                                  -- id del rol, de la persona (uuid) o del dispositivo
  medio      text not null check (medio in ('posnet', 'qr', 'qr_fijo')),
  habilitado boolean not null,
  unique (ambito, referencia, medio)
);
alter table public.preferencias_cobro enable row level security;
create policy "el administrador ve las preferencias" on public.preferencias_cobro for select to authenticated using (tiene_permiso('equipo.administrar'));

-- Registra el aparato desde el que se está usando el panel; devuelve su clave (el navegador la guarda)
create function public.registrar_dispositivo(p_nombre text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_clave uuid;
begin
  if not tiene_permiso('equipo.administrar') then raise exception 'Solo el administrador registra dispositivos'; end if;
  if length(trim(coalesce(p_nombre, ''))) = 0 then raise exception 'Ponele un nombre al dispositivo (por ejemplo «Caja del mostrador»)'; end if;
  insert into dispositivos (nombre) values (trim(p_nombre)) returning clave into v_clave;
  return v_clave;
end $$;

create function public.quitar_dispositivo(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tiene_permiso('equipo.administrar') then raise exception 'Solo el administrador quita dispositivos'; end if;
  delete from preferencias_cobro where ambito = 'dispositivo' and referencia = p_id::text;
  delete from dispositivos where id = p_id;
end $$;

-- p_habilitado null = volver a heredar (se borra la preferencia)
create function public.guardar_preferencia_cobro(p_ambito text, p_referencia text, p_medio text, p_habilitado boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tiene_permiso('equipo.administrar') then raise exception 'Solo el administrador cambia las preferencias de cobro'; end if;
  if p_habilitado is null then
    delete from preferencias_cobro where ambito = p_ambito and referencia = p_referencia and medio = p_medio;
  else
    insert into preferencias_cobro (ambito, referencia, medio, habilitado) values (p_ambito, p_referencia, p_medio, p_habilitado)
    on conflict (ambito, referencia, medio) do update set habilitado = excluded.habilitado;
  end if;
end $$;

-- Lo que le corresponde a quien está usando la caja, desde el aparato que tenga (p_dispositivo = su clave, o null)
create function public.cobro_medios(p_dispositivo uuid default null) returns jsonb
language sql stable security definer set search_path = public as $$
  with yo as (
    select auth.uid() as uid, (select rol_id from perfiles where id = auth.uid()) as rol,
           (select id from dispositivos where clave = p_dispositivo and activo) as disp
  ), medios(medio) as (values ('posnet'), ('qr'), ('qr_fijo'))
  select case when not es_staff() then null else coalesce(jsonb_object_agg(m.medio, coalesce(
      (select habilitado from preferencias_cobro p, yo where p.medio = m.medio and p.ambito = 'dispositivo' and p.referencia = yo.disp::text),
      (select habilitado from preferencias_cobro p, yo where p.medio = m.medio and p.ambito = 'usuario' and p.referencia = yo.uid::text),
      (select habilitado from preferencias_cobro p, yo where p.medio = m.medio and p.ambito = 'rol' and p.referencia = yo.rol::text),
      true)), '{}'::jsonb) end
  from medios m
$$;

revoke execute on function public.registrar_dispositivo(text), public.quitar_dispositivo(bigint), public.guardar_preferencia_cobro(text, text, text, boolean), public.cobro_medios(uuid) from public, anon;
grant execute on function public.registrar_dispositivo(text), public.quitar_dispositivo(bigint), public.guardar_preferencia_cobro(text, text, text, boolean), public.cobro_medios(uuid) to authenticated;
