-- Dominio propio, configurable desde el panel (Integraciones → Dominio, solo el Administrador).
--
-- El dueño compra el dominio donde quiera (NIC.ar para .com.ar, cualquier registrador para .com), lo escribe en el
-- panel y la base, con la API de Vercel: lo suma al proyecto (el dominio y www, que redirige al principal), le dice
-- qué registros cargar donde lo compró y lo revisa sola cada 10 minutos hasta que queda verificado y con https.
-- «Usar como principal» actualiza las direcciones de Supabase (ingreso y mails) y la que usa Mercado Pago.
--
-- La conexión con Vercel y con Supabase (sus claves de acceso) la carga UNA VEZ quien instaló el sistema, en la misma
-- pantalla; quedan en `integraciones` como las demás (nadie las lee). El dueño no entra a Vercel ni a Supabase.

alter table public.integraciones
  add column vercel_token     text,
  add column vercel_proyecto  text,          -- id o nombre del proyecto en Vercel
  add column vercel_equipo    text,          -- id del equipo (team_…) o su slug
  add column supabase_token   text,          -- token de acceso a la API de administración de Supabase
  add column supabase_ref     text,          -- el «ref» del proyecto (lo que va antes de .supabase.co)
  add column sitio_original   text;          -- la dirección de Vercel (para volver si se quita el dominio)

create table public.dominios (
  id            bigint generated always as identity primary key,
  nombre        text not null check (nombre ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'),
  principal     boolean not null default false,
  verificado    boolean not null default false,   -- Vercel lo dio por propio del proyecto
  configurado   boolean not null default false,   -- los registros apuntan a Vercel y hay https
  registros     jsonb not null default '[]',      -- lo que hay que cargar donde se compró: [{tipo, nombre, valor}]
  error         text,
  revisado_en   timestamptz,
  creado_en     timestamptz not null default now()
);
create unique index dominios_nombre_key on public.dominios (lower(nombre));
create unique index dominios_un_principal on public.dominios (principal) where principal;
alter table public.dominios enable row level security;
create policy "ve dominios" on public.dominios for select to authenticated using (tiene_permiso('equipo.administrar'));

-- Hablar con Vercel (interna)
create function public._vercel(p_metodo text, p_ruta text, p_cuerpo jsonb default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare i integraciones; v_sep text;
begin
  select * into i from integraciones;
  if i.vercel_token is null or i.vercel_proyecto is null then
    raise exception 'Falta la conexión con el hosting (Vercel): la carga una sola vez quien instaló el sistema, abajo en «Conexión técnica»';
  end if;
  v_sep := case when p_ruta like '%?%' then '&' else '?' end;
  return _pedir_http(p_metodo, 'https://api.vercel.com' || p_ruta ||
           case when i.vercel_equipo is null then '' when i.vercel_equipo like 'team\_%' then v_sep || 'teamId=' || i.vercel_equipo else v_sep || 'slug=' || i.vercel_equipo end,
           jsonb_build_object('Authorization', 'Bearer ' || i.vercel_token),
           case when p_cuerpo is null then null else 'application/json' end, p_cuerpo::text);
end $$;
revoke execute on function public._vercel(text, text, jsonb) from public, anon, authenticated;

-- Revisar un dominio en Vercel: si está verificado, si los registros apuntan bien, y qué falta cargar
create function public._dominio_revisar(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare d dominios; v_proy text := (select vercel_proyecto from integraciones); r jsonb; c jsonb; v_reg jsonb := '[]'; v_verif boolean; v_ok boolean;
        v_es_www boolean;
begin
  select * into d from dominios where id = p_id;
  if not found then return; end if;
  v_es_www := d.nombre like 'www.%';
  -- ¿Vercel lo da por propio? (si no, intenta verificarlo con el TXT que haya cargado)
  r := _vercel('GET', '/v9/projects/' || v_proy || '/domains/' || d.nombre);
  if (r ->> 'status')::int = 404 then
    update dominios set error = 'El dominio ya no está en el proyecto: quitalo y volvé a agregarlo', revisado_en = now() where id = p_id;
    return;
  end if;
  v_verif := coalesce((r -> 'cuerpo' ->> 'verified')::boolean, false);
  if not v_verif then
    r := _vercel('POST', '/v9/projects/' || v_proy || '/domains/' || d.nombre || '/verify');
    v_verif := coalesce((r -> 'cuerpo' ->> 'verified')::boolean, false);
  end if;
  -- Lo que hay que cargar: el TXT de verificación (si hace falta) y el A o el CNAME que recomienda Vercel
  if not v_verif then
    select coalesce(jsonb_agg(jsonb_build_object('tipo', x ->> 'type', 'nombre', x ->> 'domain', 'valor', x ->> 'value')), '[]')
      into v_reg from jsonb_array_elements(coalesce(r -> 'cuerpo' -> 'verification', (_vercel('GET', '/v9/projects/' || v_proy || '/domains/' || d.nombre)) -> 'cuerpo' -> 'verification', '[]')) x;
  end if;
  c := _vercel('GET', '/v6/domains/' || d.nombre || '/config?projectIdOrName=' || v_proy);
  v_ok := (c ->> 'status')::int = 200 and not coalesce((c -> 'cuerpo' ->> 'misconfigured')::boolean, true);
  if not v_ok then
    v_reg := v_reg || case when v_es_www
      then jsonb_build_array(jsonb_build_object('tipo', 'CNAME', 'nombre', 'www',
             'valor', coalesce((select x ->> 'value' from jsonb_array_elements(c -> 'cuerpo' -> 'recommendedCNAME') x order by (x ->> 'rank')::int limit 1), 'cname.vercel-dns.com')))
      else jsonb_build_array(jsonb_build_object('tipo', 'A', 'nombre', '@',
             'valor', coalesce((select x -> 'value' ->> 0 from jsonb_array_elements(c -> 'cuerpo' -> 'recommendedIPv4') x order by (x ->> 'rank')::int limit 1), '76.76.21.21')))
      end;
  end if;
  update dominios set verificado = v_verif, configurado = v_ok and v_verif, registros = v_reg, revisado_en = now(),
                      error = case when (c ->> 'status')::int not between 200 and 299 then 'Vercel contestó ' || (c ->> 'status') end
   where id = p_id;
end $$;
revoke execute on function public._dominio_revisar(bigint) from public, anon, authenticated;

-- Cada 10 minutos, los que todavía no están listos (así el dueño no tiene que hacer nada más que cargar los registros)
create function public._dominios_revisar_pendientes() returns void
language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
  for v in select id from dominios where not configurado and creado_en > now() - interval '30 days' loop
    begin perform _dominio_revisar(v); exception when others then update dominios set error = sqlerrm, revisado_en = now() where id = v; end;
  end loop;
end $$;
revoke execute on function public._dominios_revisar_pendientes() from public, anon, authenticated;
select cron.schedule('revisar-dominios', '*/10 * * * *', $$select public._dominios_revisar_pendientes()$$);

-- ── Para el panel (solo el Administrador) ──────────────────────────────
create function public.dominio_agregar(p_nombre text) returns void
language plpgsql security definer set search_path = public as $$
declare v text; v_proy text; r jsonb; v_id bigint; v_www bigint;
begin
  if not tiene_permiso('equipo.administrar') then raise exception 'Solo el administrador configura el dominio'; end if;
  -- «https://www.MiTienda.com.ar/» → mitienda.com.ar
  v := lower(trim(coalesce(p_nombre, '')));
  v := regexp_replace(regexp_replace(regexp_replace(v, '^https?://', ''), '/.*$', ''), '^www\.', '');
  if v !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' or v ~ '(^|\.)vercel\.app$' then
    raise exception 'Escribí el dominio como «mitienda.com.ar» (sin https ni barras)';
  end if;
  if exists (select 1 from dominios where lower(nombre) = v) then raise exception 'Ese dominio ya está agregado'; end if;
  v_proy := (select vercel_proyecto from integraciones);
  r := _vercel('POST', '/v10/projects/' || v_proy || '/domains', jsonb_build_object('name', v));
  if (r ->> 'status')::int not between 200 and 299 then
    raise exception '%', case (r ->> 'status')::int
      when 409 then 'Ese dominio ya está usado en otro proyecto de Vercel: si es tuyo, hay que liberarlo primero'
      when 400 then coalesce('Vercel no acepta ese dominio: ' || (r -> 'cuerpo' -> 'error' ->> 'message'), 'Vercel no acepta ese dominio')
      when 401 then 'La conexión con el hosting no anda (revisá el token de Vercel en «Conexión técnica»)'
      when 403 then 'La conexión con el hosting no tiene permiso sobre el proyecto (revisá el equipo en «Conexión técnica»)'
      else 'Vercel contestó ' || (r ->> 'status') end;
  end if;
  insert into dominios (nombre) values (v) returning id into v_id;
  -- www.dominio → redirige al principal (301)
  r := _vercel('POST', '/v10/projects/' || v_proy || '/domains', jsonb_build_object('name', 'www.' || v, 'redirect', v, 'redirectStatusCode', 308));
  if (r ->> 'status')::int between 200 and 299 then insert into dominios (nombre) values ('www.' || v) returning id into v_www; end if;
  perform _dominio_revisar(v_id);
  if v_www is not null then perform _dominio_revisar(v_www); end if;
end $$;

create function public.dominio_revisar(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tiene_permiso('equipo.administrar') then raise exception 'Solo el administrador configura el dominio'; end if;
  perform _dominio_revisar(p_id);
end $$;

-- Usar como principal: la tienda, los mails de ingreso y Mercado Pago pasan a esta dirección
create function public.dominio_principal(p_id bigint) returns text
language plpgsql security definer set search_path = public as $$
declare d dominios; i integraciones; v_url text; r jsonb; v_lista text;
begin
  if not tiene_permiso('equipo.administrar') then raise exception 'Solo el administrador configura el dominio'; end if;
  select * into d from dominios where id = p_id;
  if not found or d.nombre like 'www.%' then raise exception 'Elegí el dominio principal (sin www)'; end if;
  perform _dominio_revisar(p_id);
  select * into d from dominios where id = p_id;
  if not d.configurado then raise exception 'Todavía no está listo: cargá los registros que se muestran y esperá a que diga «Listo»'; end if;
  select * into i from integraciones;
  v_url := 'https://' || d.nombre;
  -- Supabase: la dirección del sitio y las permitidas para volver después de ingresar (la vieja sigue andando)
  if i.supabase_token is not null and i.supabase_ref is not null then
    v_lista := array_to_string(array_remove(array[v_url || '/**', 'https://www.' || d.nombre || '/**', coalesce(i.sitio_original, i.sitio_url) || '/**'], null), ',');
    r := _pedir_http('PATCH', 'https://api.supabase.com/v1/projects/' || i.supabase_ref || '/config/auth',
           jsonb_build_object('Authorization', 'Bearer ' || i.supabase_token), 'application/json',
           jsonb_build_object('site_url', v_url, 'uri_allow_list', v_lista)::text);
    if (r ->> 'status')::int not between 200 and 299 then
      raise exception 'Supabase no aceptó el cambio (%): revisá su token en «Conexión técnica». El dominio no se cambió.', r ->> 'status';
    end if;
  end if;
  update integraciones set sitio_original = coalesce(sitio_original, sitio_url), sitio_url = v_url where unica;
  update dominios set principal = false where principal;
  update dominios set principal = true where id = p_id;
  return v_url;
end $$;

create function public.dominio_quitar(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare d dominios; r jsonb; v_proy text := (select vercel_proyecto from integraciones);
begin
  if not tiene_permiso('equipo.administrar') then raise exception 'Solo el administrador configura el dominio'; end if;
  select * into d from dominios where id = p_id;
  if not found then return; end if;
  if d.principal then raise exception 'Es el dominio principal: antes elegí otro como principal (o volvé a la dirección de Vercel)'; end if;
  r := _vercel('DELETE', '/v9/projects/' || v_proy || '/domains/' || d.nombre);
  if (r ->> 'status')::int not between 200 and 299 and (r ->> 'status')::int <> 404 then raise exception 'Vercel no lo pudo quitar (contestó %)', r ->> 'status'; end if;
  delete from dominios where id = p_id;
end $$;

-- Conexión técnica: la carga una vez quien instaló el sistema (vacío = no se toca)
create function public.guardar_conexion_hosting(p_vercel_token text default null, p_vercel_proyecto text default null, p_vercel_equipo text default null,
                                                p_supabase_token text default null, p_supabase_ref text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not tiene_permiso('equipo.administrar') then raise exception 'Solo el administrador configura el dominio'; end if;
  if nullif(trim(p_supabase_ref), '') is not null and trim(p_supabase_ref) !~ '^[a-z0-9]{20}$' then
    raise exception 'El ref de Supabase son 20 letras y números (lo que va antes de .supabase.co)';
  end if;
  update integraciones set
    vercel_token = coalesce(nullif(trim(p_vercel_token), ''), vercel_token),
    vercel_proyecto = coalesce(nullif(trim(p_vercel_proyecto), ''), vercel_proyecto),
    vercel_equipo = coalesce(nullif(trim(p_vercel_equipo), ''), vercel_equipo),
    supabase_token = coalesce(nullif(trim(p_supabase_token), ''), supabase_token),
    supabase_ref = coalesce(nullif(trim(p_supabase_ref), ''), supabase_ref),
    actualizado_en = now(), actualizado_por = auth.uid()
   where unica;
end $$;

create function public.estado_dominio() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare i integraciones;
begin
  if not tiene_permiso('equipo.administrar') then raise exception 'Solo el administrador configura el dominio'; end if;
  select * into i from integraciones;
  return jsonb_build_object(
    'hosting', i.vercel_token is not null and i.vercel_proyecto is not null,
    'vercel_proyecto', i.vercel_proyecto, 'vercel_equipo', i.vercel_equipo,
    'vercel_token', case when i.vercel_token is not null then '…' || right(i.vercel_token, 4) end,
    'supabase', i.supabase_token is not null and i.supabase_ref is not null, 'supabase_ref', i.supabase_ref,
    'supabase_token', case when i.supabase_token is not null then '…' || right(i.supabase_token, 4) end,
    'sitio_url', i.sitio_url, 'sitio_original', i.sitio_original);
end $$;

revoke execute on function public.dominio_agregar(text), public.dominio_revisar(bigint), public.dominio_principal(bigint), public.dominio_quitar(bigint),
  public.guardar_conexion_hosting(text, text, text, text, text), public.estado_dominio() from public, anon;
grant execute on function public.dominio_agregar(text), public.dominio_revisar(bigint), public.dominio_principal(bigint), public.dominio_quitar(bigint),
  public.guardar_conexion_hosting(text, text, text, text, text), public.estado_dominio() to authenticated;
