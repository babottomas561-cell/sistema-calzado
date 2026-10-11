-- Seguridad de las fichas de clientes (lo encontraron las pruebas de supabase/tests):
--
-- 1. Un cliente podía LEER los campos internos del CRM de su ficha (notas, etiquetas, origen)
--    pidiéndole a la API su fila completa. Ahora no lee la tabla: ve sus datos por la vista
--    v_mi_ficha (solo datos de contacto) y los cambia con actualizar_mi_ficha().
-- 2. Al registrarse, la cuenta se vinculaba a una ficha del CRM con el mismo email ANTES de
--    confirmarlo: cualquiera que se registrara con el email de un cliente del local se quedaba
--    con su ficha (y su historial). Ahora se vincula recién al confirmar el email.
-- 3. El trigger que protege la ficha ahora también protege el código de cliente.

-- ── 1. Lectura y edición de la propia ficha ──────────────────────────
-- La ficha del usuario logueado. security definer para que las políticas de pedidos no
-- dependan de que el cliente pueda leer la tabla clientes.
create or replace function public.mi_cliente_id() returns bigint
language sql stable security definer set search_path = public as $$
  select id from clientes where usuario_id = auth.uid();
$$;

drop policy "su ficha" on public.clientes;
drop policy "editar su ficha" on public.clientes;

drop policy "sus pedidos" on public.pedidos;
create policy "sus pedidos" on public.pedidos for select to authenticated using (cliente_id = mi_cliente_id());
drop policy "items de sus pedidos" on public.pedido_items;
create policy "items de sus pedidos" on public.pedido_items for select to authenticated
  using (pedido_id in (select id from pedidos where cliente_id = mi_cliente_id()));
drop policy "seguimiento de sus pedidos" on public.pedido_estados;
create policy "seguimiento de sus pedidos" on public.pedido_estados for select to authenticated
  using (pedido_id in (select id from pedidos where cliente_id = mi_cliente_id()));

-- Lo que el cliente ve de sí mismo: datos de contacto, nada interno. Corre con los permisos del
-- dueño (como v_catalogo) y filtra por el usuario logueado.
create or replace view public.v_mi_ficha as
select id, codigo, nombre, documento, telefono, email, direccion, localidad, fecha_nacimiento, acepta_promos
from clientes where usuario_id = auth.uid();
grant select on public.v_mi_ficha to authenticated;

create or replace function public.actualizar_mi_ficha(
  p_nombre text, p_documento text default null, p_telefono text default null, p_direccion text default null,
  p_localidad text default null, p_fecha_nacimiento date default null, p_acepta_promos boolean default true
) returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Tenés que ingresar'; end if;
  if coalesce(trim(p_nombre), '') = '' then raise exception 'Falta el nombre'; end if;
  update clientes set nombre = trim(p_nombre), documento = nullif(trim(p_documento), ''), telefono = nullif(trim(p_telefono), ''),
         direccion = nullif(trim(p_direccion), ''), localidad = nullif(trim(p_localidad), ''),
         fecha_nacimiento = p_fecha_nacimiento, acepta_promos = coalesce(p_acepta_promos, true)
   where usuario_id = auth.uid();
  if not found then raise exception 'Tu usuario no tiene ficha de cliente'; end if;
end $$;

revoke execute on function public.mi_cliente_id, public.actualizar_mi_ficha from public, anon;
grant execute on function public.mi_cliente_id, public.actualizar_mi_ficha to authenticated;

-- ── 2. Alta de cuentas: vincular la ficha recién con el email confirmado ──
-- Vincula el usuario a una ficha del CRM sin cuenta con su email (cargada en el local) o le crea una.
create or replace function public._vincular_cliente(p_usuario auth.users) returns void
language plpgsql security definer set search_path = public as $$
declare v_nombre text := coalesce(p_usuario.raw_user_meta_data->>'nombre', split_part(p_usuario.email, '@', 1));
begin
  if exists (select 1 from clientes where usuario_id = p_usuario.id) then return; end if;
  update clientes set usuario_id = p_usuario.id
   where id = (select id from clientes where usuario_id is null and lower(email) = lower(p_usuario.email) order by id limit 1);
  if not found then
    insert into clientes (usuario_id, nombre, email, telefono, origen)
    values (p_usuario.id, v_nombre, p_usuario.email, p_usuario.raw_user_meta_data->>'telefono', 'Web');
  end if;
end $$;

-- Al crearse el usuario: siempre su perfil; la ficha solo si el email ya viene confirmado
-- (confirmación desactivada, o usuarios creados por el equipo).
create or replace function public._nuevo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_nombre text := coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1));
begin
  insert into perfiles (id, rol, nombre) values (new.id, 'cliente', v_nombre) on conflict (id) do nothing;
  if new.email_confirmed_at is not null then perform _vincular_cliente(new); end if;
  return new;
end $$;

-- Al confirmar el email: ahí sí se vincula o se crea la ficha
create or replace function public._email_confirmado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform _vincular_cliente(new);
  return new;
end $$;
create trigger al_confirmar_email after update of email_confirmed_at on auth.users
  for each row when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public._email_confirmado();

revoke execute on function public._vincular_cliente, public._nuevo_usuario, public._email_confirmado from public, anon, authenticated;

-- ── 3. El código de cliente tampoco lo cambia el cliente ──
create or replace function public._proteger_ficha_cliente() returns trigger
language plpgsql set search_path = public as $$
begin
  -- auth.uid() nulo = proceso interno (alta automática al registrarse, panel de Supabase): se permite
  if auth.uid() is not null and not es_staff() then
    new.usuario_id := old.usuario_id;  new.email := old.email;   new.origen := old.origen;
    new.etiquetas := old.etiquetas;    new.notas := old.notas;   new.creado_en := old.creado_en;
    new.codigo := old.codigo;
  end if;
  return new;
end $$;
