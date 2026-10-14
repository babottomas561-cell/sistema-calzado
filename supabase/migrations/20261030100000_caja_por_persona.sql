-- Cada persona del equipo puede tener una caja asignada. La caja con la que cobra se resuelve así, de lo más específico a lo general:
-- el dispositivo (si está registrado y asignado) → la persona → la caja principal. La venta también cae en la caja de la persona si no se indicó otra.
-- Agrega, no rompe.

alter table public.perfiles add column caja_id bigint references public.cajas (id) on delete set null;
create index perfiles_caja_id_idx on public.perfiles (caja_id);

create function public.persona_asignar_caja(p_usuario uuid, p_caja bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (tiene_permiso('equipo.administrar') or tiene_permiso('equipo.personas')) then raise exception 'No tenés permiso para asignar cajas a las personas'; end if;
  if p_caja is not null and not exists (select 1 from cajas where id = p_caja and activa) then raise exception 'Esa caja no existe o está apagada'; end if;
  update perfiles set caja_id = p_caja where id = p_usuario and rol = 'staff';
  if not found then raise exception 'Esa persona no es del equipo'; end if;
end $$;

-- La caja de cada persona del equipo (para la pantalla de Equipo)
create function public.cajas_de_personas() returns table (usuario_id uuid, caja_id bigint)
language sql stable security definer set search_path = public as $$
  select id, caja_id from perfiles where rol = 'staff' and (tiene_permiso('equipo.administrar') or tiene_permiso('equipo.personas')) $$;

revoke execute on function public.persona_asignar_caja(uuid, bigint), public.cajas_de_personas() from public, anon;
grant execute on function public.persona_asignar_caja(uuid, bigint), public.cajas_de_personas() to authenticated;

CREATE OR REPLACE FUNCTION public._venta_caja()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id bigint := nullif(current_setting('app.caja_id', true), '')::bigint; c cajas;
begin
  if new.caja_id is null then
    select * into c from cajas where id = coalesce(v_id, (select caja_id from perfiles where id = auth.uid()), (select id from cajas where por_defecto)) and activa;
    if not found then raise exception 'Esa caja no existe o está apagada'; end if;
    new.caja_id := c.id; new.sucursal_id := c.sucursal_id;
  elsif new.sucursal_id is null then
    new.sucursal_id := (select sucursal_id from cajas where id = new.caja_id);
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.cobro_medios(p_dispositivo uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with yo as (
    select auth.uid() as uid, (select rol_id from perfiles where id = auth.uid()) as rol,
           (select id from dispositivos where clave = p_dispositivo and activo) as disp,
           coalesce((select caja_id from dispositivos where clave = p_dispositivo and activo), (select caja_id from perfiles where id = auth.uid())) as caja
  ), medios(medio) as (values ('posnet'), ('qr'), ('qr_fijo'))
  select case when not es_staff() then null else coalesce(jsonb_object_agg(m.medio, coalesce(
      (select habilitado from preferencias_cobro p, yo where p.medio = m.medio and p.ambito = 'dispositivo' and p.referencia = yo.disp::text),
      (select habilitado from preferencias_cobro p, yo where p.medio = m.medio and p.ambito = 'usuario' and p.referencia = yo.uid::text),
      (select habilitado from preferencias_cobro p, yo where p.medio = m.medio and p.ambito = 'rol' and p.referencia = yo.rol::text),
      true)), '{}'::jsonb) || jsonb_build_object('caja', point_caja((select caja from yo))) end
  from medios m
$function$;
