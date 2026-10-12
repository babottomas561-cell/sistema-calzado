-- Legales de la tienda: datos del comercio, términos y privacidad VERSIONADOS, registro de quién aceptó qué y
-- cuándo, y el botón de arrepentimiento.
--
-- Pensado para la venta online en Argentina (defensa del consumidor, datos personales, arrepentimiento de 10 días).
-- Los textos son un borrador: los edita el dueño y conviene que los revise un abogado antes de publicarlos.
--
-- · `datos_legales` (una fila, pública): razón social, CUIT, domicilio, contacto y Defensa del Consumidor. Se muestran en el pie.
-- · `documentos_legales`: cada publicación es una versión nueva e INMUTABLE (no se edita ni se borra: es la prueba de lo que
--   el cliente aceptó). La vigente es la de mayor versión de cada tipo (`v_documentos_vigentes`).
-- · `aceptaciones_legales`: quién aceptó qué versión, cuándo y dónde (al registrarse o al comprar).
-- · `arrepentimientos`: la baja de una compra online dentro de los 10 días, con constancia (código) y bandeja en el panel.

-- ── Datos del comercio ───────────────────────────────────────────────
create table public.datos_legales (
  unica                  boolean primary key default true check (unica),
  razon_social           text,
  cuit                   text check (cuit is null or cuit ~ '^[0-9]{2}-[0-9]{8}-[0-9]$'),
  condicion_iva          text check (condicion_iva is null or condicion_iva in ('Responsable Inscripto', 'Monotributo', 'IVA Exento')),
  domicilio_legal        text,
  email_contacto         text check (email_contacto is null or email_contacto ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  telefono_contacto      text,
  jurisdiccion           text not null default 'San Miguel de Tucumán',          -- tribunales competentes
  defensa_consumidor_url text not null default 'https://www.argentina.gob.ar/produccion/defensadelconsumidor' check (defensa_consumidor_url ~ '^https://'),
  actualizado_en         timestamptz not null default now(),
  actualizado_por        uuid references auth.users (id) on delete set null
);
create index datos_legales_actualizado_por_idx on public.datos_legales (actualizado_por);
insert into public.datos_legales default values;
alter table public.datos_legales enable row level security;
create policy "todos ven" on public.datos_legales for select to anon, authenticated using (true);
create policy "tienda edita" on public.datos_legales for update to authenticated
  using (tiene_permiso('tienda.editar')) with check (tiene_permiso('tienda.editar'));

-- CUIT sin guiones o con espacios → forma estándar 20-12345678-9; y quién cambió
create function public._legales_normalizar() returns trigger
language plpgsql set search_path = public as $$
declare v_d text;
begin
  new.razon_social := nullif(trim(new.razon_social), '');
  new.domicilio_legal := nullif(trim(new.domicilio_legal), '');
  new.telefono_contacto := nullif(trim(new.telefono_contacto), '');
  new.email_contacto := nullif(lower(trim(new.email_contacto)), '');
  if new.cuit is not null then
    v_d := regexp_replace(new.cuit, '\D', '', 'g');
    if length(v_d) = 11 then new.cuit := substr(v_d, 1, 2) || '-' || substr(v_d, 3, 8) || '-' || substr(v_d, 11, 1);
    elsif v_d = '' then new.cuit := null;
    else raise exception 'El CUIT tiene 11 números (por ejemplo 20-12345678-9)'; end if;
  end if;
  new.actualizado_en := now(); new.actualizado_por := auth.uid();
  return new;
end $$;
create trigger legales_normalizar before update on public.datos_legales for each row execute function public._legales_normalizar();

-- ¿Están los datos que la ley pide mostrar? Sin ellos no se publican los términos.
create function public.legales_completos() returns boolean
language sql stable security definer set search_path = public as $$
  select razon_social is not null and cuit is not null and domicilio_legal is not null and email_contacto is not null from datos_legales
$$;

-- ── Documentos versionados ───────────────────────────────────────────
create table public.documentos_legales (
  id           bigint generated always as identity primary key,
  tipo         text not null check (tipo in ('terminos', 'privacidad')),
  version      int not null check (version > 0),
  contenido    text not null check (char_length(contenido) between 200 and 60000),
  publicado_en timestamptz not null default now(),
  publicado_por uuid references auth.users (id) on delete set null,
  unique (tipo, version)
);
create index documentos_legales_publicado_por_idx on public.documentos_legales (publicado_por);
alter table public.documentos_legales enable row level security;
create policy "todos ven" on public.documentos_legales for select to anon, authenticated using (true);
-- Sin políticas de escritura: se publica solo con publicar_documento(). Y aunque alguien llegue, el trigger lo frena.
create function public._documento_inmutable() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'Las versiones publicadas no se borran'; end if;
  -- lo único que puede cambiar es publicado_por (queda vacío si se borra a esa persona)
  if (new.tipo, new.version, new.contenido, new.publicado_en) is distinct from (old.tipo, old.version, old.contenido, old.publicado_en) then
    raise exception 'Las versiones publicadas no se modifican: publicá una nueva';
  end if;
  return new;
end $$;
create trigger documento_inmutable before update or delete on public.documentos_legales for each row execute function public._documento_inmutable();

create view public.v_documentos_vigentes with (security_invoker = true) as
select distinct on (tipo) id, tipo, version, contenido, publicado_en from public.documentos_legales order by tipo, version desc;
grant select on public.v_documentos_vigentes to anon, authenticated;

create function public.publicar_documento(p_tipo text, p_contenido text) returns int
language plpgsql security definer set search_path = public as $$
declare v_version int;
begin
  if not tiene_permiso('tienda.editar') then raise exception 'No tenés permiso para publicar los términos'; end if;
  if p_tipo not in ('terminos', 'privacidad') then raise exception 'Documento desconocido'; end if;
  if not legales_completos() then raise exception 'Antes completá los datos del comercio (razón social, CUIT, domicilio y email de contacto)'; end if;
  if char_length(trim(coalesce(p_contenido, ''))) < 200 then raise exception 'El texto es demasiado corto para publicarlo'; end if;
  perform pg_advisory_xact_lock(hashtext('documentos_legales'));      -- dos publicaciones a la vez no repiten versión
  select coalesce(max(version), 0) + 1 into v_version from documentos_legales where tipo = p_tipo;
  insert into documentos_legales (tipo, version, contenido, publicado_por) values (p_tipo, v_version, trim(p_contenido), auth.uid());
  return v_version;
end $$;

-- ── Aceptaciones ─────────────────────────────────────────────────────
create table public.aceptaciones_legales (
  id           bigint generated always as identity primary key,
  usuario_id   uuid not null references auth.users (id) on delete cascade,
  documento_id bigint not null references public.documentos_legales (id) on delete restrict,
  origen       text not null check (origen in ('registro', 'compra')),
  pedido_id    bigint references public.pedidos (id) on delete set null,
  aceptado_en  timestamptz not null default now()
);
create index aceptaciones_legales_usuario_idx on public.aceptaciones_legales (usuario_id, documento_id);
create index aceptaciones_legales_documento_idx on public.aceptaciones_legales (documento_id);
create index aceptaciones_legales_pedido_idx on public.aceptaciones_legales (pedido_id);
alter table public.aceptaciones_legales enable row level security;
create policy "ve las suyas" on public.aceptaciones_legales for select to authenticated using (usuario_id = auth.uid());
create policy "equipo ve" on public.aceptaciones_legales for select to authenticated using (tiene_permiso('clientes.ver'));

-- Deja constancia de que aceptó la versión vigente de cada documento publicado
create function public._registrar_aceptacion(p_usuario uuid, p_origen text, p_pedido bigint default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into aceptaciones_legales (usuario_id, documento_id, origen, pedido_id)
  select p_usuario, d.id, p_origen, p_pedido from v_documentos_vigentes d;
end $$;

-- ¿Qué documentos vigentes todavía no aceptó quien está logueado? (para pedirle que tilde al comprar)
create function public.documentos_pendientes() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('tipo', d.tipo, 'version', d.version) order by d.tipo), '[]')
    from v_documentos_vigentes d
   where not exists (select 1 from aceptaciones_legales a where a.usuario_id = auth.uid() and a.documento_id = d.id)
$$;

-- Al confirmar una compra
create function public.aceptar_documentos_compra(p_pedido bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Tenés que ingresar con tu cuenta'; end if;
  if not exists (select 1 from pedidos p join clientes c on c.id = p.cliente_id where p.id = p_pedido and c.usuario_id = auth.uid()) then
    raise exception 'Ese pedido no es tuyo';
  end if;
  insert into aceptaciones_legales (usuario_id, documento_id, origen, pedido_id)
  select auth.uid(), d.id, 'compra', p_pedido from v_documentos_vigentes d
   where not exists (select 1 from aceptaciones_legales a where a.usuario_id = auth.uid() and a.documento_id = d.id);
end $$;

-- Al registrarse con la casilla tildada: queda registrado (versión vigente de cada documento)
create or replace function public._nuevo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'); v_nombre text := coalesce(nullif(m ->> 'nombre', ''), split_part(new.email, '@', 1)); v_inv invitaciones_cuenta;
begin
  insert into perfiles (id, rol, nombre, terminos_aceptados_en)
  values (new.id, 'cliente', v_nombre, case when m ->> 'terminos' = 'true' then now() end) on conflict (id) do nothing;
  if m ->> 'terminos' = 'true' then perform _registrar_aceptacion(new.id, 'registro'); end if;
  select * into v_inv from invitaciones_cuenta
   where token = m ->> 'invitacion' and lower(email) = lower(new.email) and usada_en is null and vence_en > now();
  if found then
    update invitaciones_cuenta set usada_en = now(), usada_por = new.id where id = v_inv.id;
    if v_inv.rol_id is not null and exists (select 1 from roles where id = v_inv.rol_id and activo) then
      update perfiles set rol = 'staff', rol_id = v_inv.rol_id where id = new.id;
    end if;
  end if;
  if new.email_confirmed_at is not null then perform _vincular_cliente(new); end if;
  return new;
end $$;

-- Exigir términos en el registro ya no necesita una dirección si hay términos publicados acá
create or replace function public._cuentas_normalizar() returns trigger
language plpgsql set search_path = public as $$
declare v_re text := '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$';
begin
  new.dominios_permitidos := coalesce((select array_agg(distinct d order by d) from (select regexp_replace(lower(trim(x)), '^@', '') d from unnest(new.dominios_permitidos) x) q where d <> ''), '{}');
  new.dominios_bloqueados := coalesce((select array_agg(distinct d order by d) from (select regexp_replace(lower(trim(x)), '^@', '') d from unnest(new.dominios_bloqueados) x) q where d <> ''), '{}');
  if exists (select 1 from unnest(new.dominios_permitidos || new.dominios_bloqueados) d where d !~ v_re) then
    raise exception 'Hay un dominio de email mal escrito: tiene que ser algo como gmail.com';
  end if;
  if new.dominios_permitidos && new.dominios_bloqueados then raise exception 'Un mismo dominio no puede estar permitido y bloqueado a la vez'; end if;
  new.terminos_url := nullif(trim(new.terminos_url), '');
  new.texto_registro := nullif(trim(new.texto_registro), '');
  new.texto_confirmado := nullif(trim(new.texto_confirmado), '');
  if new.exigir_terminos and new.terminos_url is null and not exists (select 1 from documentos_legales where tipo = 'terminos') then
    raise exception 'Para exigir los términos, publicalos primero en Tienda online → Legales';
  end if;
  new.actualizado_en := now(); new.actualizado_por := auth.uid();
  return new;
end $$;

-- ── Botón de arrepentimiento ─────────────────────────────────────────
create sequence public.seq_arrepentimiento;
create table public.arrepentimientos (
  id           bigint generated always as identity primary key,
  codigo       text not null unique default ('ARR-' || lpad(nextval('public.seq_arrepentimiento')::text, 6, '0')),
  nombre       text not null check (char_length(nombre) between 2 and 120),
  email        text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  telefono     text,
  comprobante  text,                                                   -- el n.º de pedido que escribió el cliente
  pedido_id    bigint references public.pedidos (id) on delete set null,   -- solo si coincide con un pedido SUYO (mismo email)
  detalle      text check (char_length(detalle) <= 1000),
  estado       text not null default 'recibido' check (estado in ('recibido', 'resuelto', 'rechazado')),
  resolucion   text,
  creado_en    timestamptz not null default now(),
  resuelto_en  timestamptz,
  resuelto_por uuid references auth.users (id) on delete set null
);
create index arrepentimientos_pedido_idx on public.arrepentimientos (pedido_id);
create index arrepentimientos_resuelto_por_idx on public.arrepentimientos (resuelto_por);
create index arrepentimientos_estado_idx on public.arrepentimientos (estado, creado_en desc);
alter table public.arrepentimientos enable row level security;
create policy "equipo ve" on public.arrepentimientos for select to authenticated using (tiene_permiso('pedidos.gestionar'));

-- Lo puede usar cualquiera (no hace falta cuenta): deja constancia y devuelve el código
create function public.registrar_arrepentimiento(p_nombre text, p_email text, p_telefono text default null,
                                                 p_comprobante text default null, p_detalle text default null) returns text
language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(coalesce(p_email, ''))); v_comp text := nullif(trim(coalesce(p_comprobante, '')), ''); v_pedido bigint; v_codigo text;
begin
  if char_length(trim(coalesce(p_nombre, ''))) < 2 then raise exception 'Escribí tu nombre y apellido'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Ese email no parece válido'; end if;
  if (select count(*) from arrepentimientos where email = v_email and creado_en > now() - interval '1 day') >= 5 then
    raise exception 'Ya recibimos varias solicitudes tuyas hoy: escribinos al contacto del local';
  end if;
  -- Se vincula al pedido solo si es de esa persona (el mismo email): así no se puede husmear pedidos ajenos
  if v_comp is not null then
    select p.id into v_pedido from pedidos p join clientes c on c.id = p.cliente_id
     where upper(p.comprobante) = upper(v_comp) and lower(c.email) = v_email limit 1;
  end if;
  insert into arrepentimientos (nombre, email, telefono, comprobante, pedido_id, detalle)
  values (trim(p_nombre), v_email, nullif(trim(p_telefono), ''), v_comp, v_pedido, nullif(trim(p_detalle), '')) returning codigo into v_codigo;
  return v_codigo;
end $$;

create function public.resolver_arrepentimiento(p_id bigint, p_estado text, p_resolucion text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tiene_permiso('pedidos.gestionar') then raise exception 'No tenés permiso para atender pedidos'; end if;
  if p_estado not in ('resuelto', 'rechazado') then raise exception 'Estado inválido'; end if;
  if p_estado = 'rechazado' and char_length(trim(coalesce(p_resolucion, ''))) < 5 then raise exception 'Si lo rechazás, explicá el motivo'; end if;
  update arrepentimientos set estado = p_estado, resolucion = nullif(trim(p_resolucion), ''), resuelto_en = now(), resuelto_por = auth.uid() where id = p_id;
end $$;

-- ── Permisos de ejecución ────────────────────────────────────────────
revoke execute on function public._legales_normalizar, public._documento_inmutable, public._registrar_aceptacion, public._nuevo_usuario, public._cuentas_normalizar from public, anon, authenticated;
revoke execute on function public.legales_completos(), public.publicar_documento(text, text), public.documentos_pendientes(),
  public.aceptar_documentos_compra(bigint), public.resolver_arrepentimiento(bigint, text, text) from public, anon;
grant execute on function public.legales_completos(), public.publicar_documento(text, text), public.documentos_pendientes(),
  public.aceptar_documentos_compra(bigint), public.resolver_arrepentimiento(bigint, text, text) to authenticated;
revoke execute on function public.registrar_arrepentimiento(text, text, text, text, text) from public;
grant execute on function public.registrar_arrepentimiento(text, text, text, text, text) to anon, authenticated;
grant execute on function public.legales_completos() to anon;
