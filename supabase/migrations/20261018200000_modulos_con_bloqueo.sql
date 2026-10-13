-- Módulos del sistema (etapa 1 de docs/CONFIGURACION_Y_PERMISOS.md).
-- El catálogo vive en la base (nombre, si es fijo, de qué depende) junto con el estado de cada uno en ESTA instalación.
-- Apagar un módulo: lo saca del menú, el proxy corta sus pantallas y la base frena las altas de lo suyo (triggers). Los datos no se tocan.
-- Se apaga solo si no deja nada a medias: sin dependientes encendidos y sin datos vigentes (p. ej. presupuestos vigentes).
create table public.modulos (
  clave        text primary key check (clave ~ '^[a-z_]{2,40}$'),
  nombre       text not null,
  fijo         boolean not null default false,        -- la base del sistema: no se apaga
  depende      text[] not null default '{}',          -- módulos que tienen que estar encendidos para que este funcione
  activo       boolean not null default true,
  cambiado_por uuid references auth.users (id) on delete set null,
  cambiado_en  timestamptz
);
create index on public.modulos (cambiado_por);
alter table public.modulos enable row level security;
create policy "el equipo ve los módulos" on public.modulos for select to authenticated using (es_staff());

insert into public.modulos (clave, nombre, fijo, depende) values
  ('ventas', 'Ventas', true, '{}'), ('devoluciones', 'Cambios y devoluciones', false, '{}'), ('presupuestos', 'Presupuestos', false, '{}'),
  ('pedidos', 'Pedidos', false, '{tienda}'), ('arrepentimientos', 'Arrepentimientos', false, '{pedidos}'), ('compras', 'Compras', false, '{proveedores}'),
  ('productos', 'Productos', true, '{}'), ('stock', 'Stock', true, '{}'), ('etiquetas', 'Etiquetas', false, '{}'), ('precios', 'Precios', false, '{}'),
  ('promociones', 'Promociones', false, '{}'), ('fallados', 'Fallados', false, '{}'), ('reposicion', 'Reposición', false, '{compras}'),
  ('informes', 'Informes', false, '{}'), ('gastos', 'Gastos', false, '{}'), ('contabilidad', 'Contabilidad', false, '{}'),
  ('clientes', 'Clientes', true, '{}'), ('seguimientos', 'Seguimientos', false, '{}'), ('proveedores', 'Proveedores', false, '{}'),
  ('tienda', 'Tienda online', false, '{}'), ('integraciones', 'Integraciones', false, '{}'), ('tablas', 'Tablas', true, '{}'),
  ('impresion', 'Impresión', false, '{}'), ('equipo', 'Equipo', true, '{}');

-- Lo que se apagó con la versión anterior (la tabla guardaba la ruta del menú) pasa al catálogo nuevo
update public.modulos m set activo = false from public.modulos_desactivados d where d.clave = '/admin/' || m.clave and not m.fijo;
drop table public.modulos_desactivados;
-- Compatibilidad: el código de la versión anterior sigue leyendo «modulos_desactivados» con la ruta (solo lo ve el equipo)
create view public.modulos_desactivados as select '/admin/' || clave as clave from public.modulos where not activo and es_staff();
grant select on public.modulos_desactivados to authenticated;

-- ¿Está encendido? (una clave que no existe cuenta como encendida: una sección de una versión posterior no se bloquea sola)
create function public._modulo_activo(p_clave text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from modulos where clave = p_clave and not activo) $$;

-- Frena un alta si el módulo está apagado (se pone en las tablas propias de cada módulo)
create function public._trigger_modulo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not _modulo_activo(tg_argv[0]) then
    raise exception 'La parte «%» no está activa en este sistema', (select nombre from modulos where clave = tg_argv[0]);
  end if;
  return new;
end $$;
create trigger a_modulo before insert on public.presupuestos for each row execute function public._trigger_modulo('presupuestos');
create trigger a_modulo before insert on public.pedidos for each row execute function public._trigger_modulo('pedidos');
create trigger a_modulo before insert on public.arrepentimientos for each row execute function public._trigger_modulo('arrepentimientos');
create trigger a_modulo before insert on public.fallados for each row execute function public._trigger_modulo('fallados');
create trigger a_modulo before insert on public.promociones for each row execute function public._trigger_modulo('promociones');
create trigger a_modulo before insert on public.ajustes_precios for each row execute function public._trigger_modulo('precios');
create trigger a_modulo before insert on public.devoluciones for each row execute function public._trigger_modulo('devoluciones');
create trigger a_modulo before insert on public.compras for each row execute function public._trigger_modulo('compras');

-- Lo que impide apagar un módulo (null = se puede)
create function public._modulo_pendientes(p_clave text) returns text
language plpgsql stable security definer set search_path = public as $$
declare n int;
begin
  case p_clave
    when 'presupuestos' then select count(*) into n from presupuestos where estado = 'vigente';
      if n > 0 then return format('hay %s presupuestos vigentes: convertilos o anulalos', n); end if;
    when 'pedidos' then select count(*) into n from pedidos where estado not in ('entregado', 'cancelado');
      if n > 0 then return format('hay %s pedidos sin terminar: entregalos o cancelalos', n); end if;
    when 'arrepentimientos' then select count(*) into n from arrepentimientos where estado = 'recibido';
      if n > 0 then return format('hay %s arrepentimientos sin resolver', n); end if;
    when 'fallados' then select count(*) into n from fallados where estado = 'pendiente';
      if n > 0 then return format('hay %s fallados sin resolver', n); end if;
    when 'promociones' then select count(*) into n from promociones where activa and (hasta is null or hasta > now());
      if n > 0 then return format('hay %s promociones vigentes: terminalas primero', n); end if;
    when 'contabilidad' then
      if (select inicio from configuracion_contable) is not null then return 'la contabilidad ya empezó y tiene asientos: no se puede apagar'; end if;
    else null;
  end case;
  return null;
end $$;

-- Guarda qué módulos quedan APAGADOS (el resto, encendidos). La base controla el permiso, los fijos, las dependencias y los datos vigentes.
create or replace function public.configurar_modulos(p_desactivados text[]) returns void
language plpgsql security definer set search_path = public as $$
declare m record; v_pend text; v_dep text;
begin
  if not tiene_permiso('equipo.administrar') then raise exception 'No tenés permiso para configurar los módulos'; end if;
  p_desactivados := coalesce(p_desactivados, '{}');
  for m in select * from modulos order by nombre loop
    if m.clave = any (p_desactivados) then
      if m.fijo then raise exception '«%» es la base del sistema: no se puede apagar', m.nombre; end if;
      if m.activo then
        v_pend := _modulo_pendientes(m.clave);
        if v_pend is not null then raise exception 'No se puede apagar «%»: %', m.nombre, v_pend; end if;
      end if;
    else
      -- encendido: sus dependencias tienen que estar encendidas
      select string_agg(d.nombre, ', ') into v_dep from modulos d where d.clave = any (m.depende) and d.clave = any (p_desactivados);
      if v_dep is not null then raise exception 'Para apagar «%» también hay que apagar «%»', v_dep, m.nombre; end if;
    end if;
  end loop;
  if exists (select 1 from unnest(p_desactivados) c where not exists (select 1 from modulos where clave = c)) then raise exception 'Hay un módulo que no existe'; end if;
  update modulos set activo = not (clave = any (p_desactivados)), cambiado_por = auth.uid(), cambiado_en = now()
   where activo is distinct from not (clave = any (p_desactivados));
end $$;

revoke execute on function public._modulo_activo(text), public._trigger_modulo(), public._modulo_pendientes(text), public.configurar_modulos(text[]) from public, anon;
grant execute on function public.configurar_modulos(text[]) to authenticated;
-- las funciones de operación (security definer) y los triggers las llaman por dentro; el equipo también las consulta desde la pantalla
grant execute on function public._modulo_activo(text), public._modulo_pendientes(text) to authenticated;
