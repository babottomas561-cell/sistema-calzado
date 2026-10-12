-- Instagram: las últimas publicaciones del local en la portada de la tienda, conectadas desde el panel.
--
-- Usa «Instagram API with Instagram Login» de Meta: sirve para cuentas PROFESIONALES (Business o Creador), no hace falta una
-- página de Facebook y, como cada local usa su propia app de Meta para su propia cuenta, alcanza con el acceso estándar
-- (sin revisión de Meta). Se pega UN token generado en el panel de la app de Meta; dura 60 días y la base lo renueva sola.
--
--   · El token va en `integraciones` (nadie lo lee, como las demás claves): `guardar_instagram()` lo verifica contra Meta
--     (la cuenta tiene que ser profesional) y `estado_instagram()` solo dice si está y cuándo vence.
--   · Lo que se muestra NO se pide a Meta en cada visita: la base copia las últimas publicaciones a `instagram_posts` cada 3 horas
--     (pg_cron) y la tienda lee esa tabla. Los links de las fotos de Instagram vencen a los pocos días: por eso se refrescan seguido.
--   · El dueño puede ocultar una publicación (no aparece en la tienda aunque siga en Instagram).
--   · Una sección nueva de la portada, «instagram», muestra las fotos con el botón «Seguinos».

alter table public.integraciones
  add column ig_token            text,
  add column ig_usuario_id       text,          -- el user_id de la cuenta profesional
  add column ig_usuario          text,          -- @usuario
  add column ig_tipo_cuenta      text,          -- BUSINESS o MEDIA_CREATOR
  add column ig_token_vence      timestamptz,
  add column ig_renovado_en      timestamptz,
  add column ig_conectado_en     timestamptz,
  add column ig_sincronizado_en  timestamptz,
  add column ig_error            text;          -- lo último que falló (token vencido, límite de Meta…)

create table public.instagram_posts (
  id             bigint generated always as identity primary key,
  ig_id          text not null unique,
  tipo           text not null check (tipo in ('IMAGE', 'VIDEO', 'CAROUSEL_ALBUM')),
  imagen_url     text not null check (imagen_url ~ '^https://'),
  permalink      text not null check (permalink ~ '^https://'),
  descripcion    text,
  publicado_en   timestamptz not null,
  visible        boolean not null default true,       -- el dueño lo puede ocultar de la tienda
  actualizado_en timestamptz not null default now()
);
create index instagram_posts_publicado_idx on public.instagram_posts (publicado_en desc);
alter table public.instagram_posts enable row level security;
-- Son publicaciones públicas de Instagram: la tienda lee las visibles; el equipo ve todas
create policy "todos ven las visibles" on public.instagram_posts for select to anon, authenticated using (visible);
create policy "tienda ve todas" on public.instagram_posts for select to authenticated using (tiene_permiso('tienda.editar'));

-- La portada admite la sección «instagram»
alter table public.inicio_secciones drop constraint inicio_secciones_tipo_check;
alter table public.inicio_secciones add constraint inicio_secciones_tipo_check
  check (tipo in ('portada', 'cinta', 'accesos', 'productos', 'promociones', 'banner', 'editorial', 'instagram', 'pasos', 'local'));

-- ── Hablar con Instagram (interna) ───────────────────────────────────
-- Un GET a graph.instagram.com con el token. Devuelve {status, cuerpo}; lo que falló lo interpreta quien llama.
create function public._instagram_get(p_ruta text, p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  return _pedir_http('GET', 'https://graph.instagram.com/' || p_ruta || case when position('?' in p_ruta) > 0 then '&' else '?' end
                          || 'access_token=' || p_token);
end $$;

-- El motivo de un error de Meta, en castellano
create function public._instagram_motivo(p_resp jsonb) returns text
language plpgsql immutable set search_path = public as $$
declare v_code int := nullif(p_resp -> 'cuerpo' -> 'error' ->> 'code', '')::int; v_msg text := p_resp -> 'cuerpo' -> 'error' ->> 'message';
begin
  if v_code = 190 or (p_resp ->> 'status')::int = 401 then return 'El token no es válido o venció: generá uno nuevo en Meta (Instagram → Configuración de la API con inicio de sesión de Instagram → Generar token).'; end if;
  if v_code in (4, 17, 32, 613) then return 'Meta pidió esperar un rato por demasiados pedidos: se reintenta solo.'; end if;
  return 'Meta contestó con un error (' || coalesce(p_resp ->> 'status', '?') || '): ' || left(coalesce(v_msg, 'sin detalle'), 160);
end $$;

-- Copia las últimas publicaciones a la tabla que lee la tienda. Sin conexión no hace nada.
create function public._instagram_sincronizar() returns int
language plpgsql security definer set search_path = public as $$
declare i integraciones; r jsonb; v_ids text[]; v_n int := 0;
begin
  select * into i from integraciones;
  if i.ig_token is null then return 0; end if;
  r := _instagram_get('v25.0/me/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp&limit=24', i.ig_token);
  if (r ->> 'status')::int not between 200 and 299 or jsonb_typeof(r -> 'cuerpo' -> 'data') <> 'array' then
    update integraciones set ig_error = _instagram_motivo(r) where unica;
    return 0;
  end if;
  -- Los videos se muestran con su miniatura; lo que no trae imagen se saltea
  with fuente as (
    select x ->> 'id' as ig_id, x ->> 'media_type' as tipo,
           case when x ->> 'media_type' = 'VIDEO' then x ->> 'thumbnail_url' else x ->> 'media_url' end as imagen_url,
           x ->> 'permalink' as permalink, nullif(left(x ->> 'caption', 300), '') as descripcion, (x ->> 'timestamp')::timestamptz as publicado_en
      from jsonb_array_elements(r -> 'cuerpo' -> 'data') x
     where x ->> 'media_type' in ('IMAGE', 'VIDEO', 'CAROUSEL_ALBUM')
  ), validas as (
    select * from fuente where imagen_url ~ '^https://' and permalink ~ '^https://' and publicado_en is not null
  ), nuevas as (
    insert into instagram_posts (ig_id, tipo, imagen_url, permalink, descripcion, publicado_en)
    select ig_id, tipo, imagen_url, permalink, descripcion, publicado_en from validas
    on conflict (ig_id) do update set tipo = excluded.tipo, imagen_url = excluded.imagen_url, permalink = excluded.permalink,
      descripcion = excluded.descripcion, publicado_en = excluded.publicado_en, actualizado_en = now()    -- «visible» no se toca
    returning ig_id
  )
  select array_agg(ig_id), count(*) into v_ids, v_n from nuevas;
  -- Lo que ya no está entre las últimas se saca (si lo borraron de Instagram, deja de verse acá)
  delete from instagram_posts where ig_id <> all (coalesce(v_ids, '{}'));
  update integraciones set ig_sincronizado_en = now(), ig_error = null where unica;
  return v_n;
end $$;

-- Renueva el token (dura 60 días; Meta deja renovarlo desde las 24 horas de creado y antes de que venza)
create function public._instagram_renovar() returns void
language plpgsql security definer set search_path = public as $$
declare i integraciones; r jsonb;
begin
  select * into i from integraciones;
  if i.ig_token is null then return; end if;
  if coalesce(i.ig_renovado_en, i.ig_conectado_en) > now() - interval '1 day' then return; end if;
  if i.ig_token_vence is not null and i.ig_token_vence > now() + interval '30 days' then return; end if;   -- todavía falta mucho
  r := _pedir_http('GET', 'https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=' || i.ig_token);
  if (r ->> 'status')::int between 200 and 299 and r -> 'cuerpo' ->> 'access_token' is not null then
    update integraciones set ig_token = r -> 'cuerpo' ->> 'access_token', ig_renovado_en = now(),
      ig_token_vence = now() + make_interval(secs => coalesce((r -> 'cuerpo' ->> 'expires_in')::int, 5184000)) where unica;
  else
    update integraciones set ig_error = _instagram_motivo(r) where unica;
  end if;
end $$;

-- ── Lo que usa el panel ──────────────────────────────────────────────
-- Conectar: verifica el token contra Meta. Tiene que ser una cuenta profesional (Business o Creador).
create function public.guardar_instagram(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_token text := trim(coalesce(p_token, '')); r jsonb; v_tipo text; v_id text; v_usuario text; v_n int;
begin
  if not tiene_permiso('tienda.editar') then raise exception 'No tenés permiso para configurar la tienda'; end if;
  if v_token !~ '^[A-Za-z0-9_.-]{40,}$' then raise exception 'Ese no parece un token de Instagram: es una cadena larga de letras y números. Copiala completa de Meta.'; end if;
  r := _instagram_get('v25.0/me?fields=user_id,username,account_type,media_count', v_token);
  if (r ->> 'status')::int not between 200 and 299 then raise exception '%', _instagram_motivo(r); end if;
  v_id := coalesce(r -> 'cuerpo' ->> 'user_id', r -> 'cuerpo' ->> 'id');
  v_usuario := r -> 'cuerpo' ->> 'username';
  v_tipo := upper(coalesce(r -> 'cuerpo' ->> 'account_type', ''));
  if v_id is null or v_usuario is null then raise exception 'Meta no devolvió los datos de la cuenta: revisá que el token sea de «Instagram API con inicio de sesión de Instagram».'; end if;
  if v_tipo <> '' and v_tipo not in ('BUSINESS', 'MEDIA_CREATOR', 'CREATOR') then
    raise exception 'La cuenta @% no es profesional (es %). Pasala a cuenta Business o de Creador desde Instagram → Configuración → Tipo de cuenta.', v_usuario, v_tipo;
  end if;
  update integraciones set ig_token = v_token, ig_usuario_id = v_id, ig_usuario = v_usuario, ig_tipo_cuenta = nullif(v_tipo, ''),
    ig_conectado_en = now(), ig_renovado_en = null, ig_token_vence = now() + interval '60 days', ig_error = null,
    actualizado_en = now(), actualizado_por = auth.uid() where unica;
  -- Si el local todavía no cargó su Instagram, queda el de la cuenta conectada
  update configuracion_tienda set instagram = v_usuario where coalesce(trim(instagram), '') = '' and v_usuario ~ '^[A-Za-z0-9._]{1,30}$';
  v_n := _instagram_sincronizar();
  return jsonb_build_object('usuario', v_usuario, 'tipo', nullif(v_tipo, ''), 'publicaciones', v_n);
end $$;

create function public.instagram_desconectar() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tiene_permiso('tienda.editar') then raise exception 'No tenés permiso para configurar la tienda'; end if;
  update integraciones set ig_token = null, ig_usuario_id = null, ig_usuario = null, ig_tipo_cuenta = null, ig_token_vence = null,
    ig_renovado_en = null, ig_conectado_en = null, ig_sincronizado_en = null, ig_error = null, actualizado_en = now(), actualizado_por = auth.uid() where unica;
  delete from instagram_posts;
end $$;

create function public.instagram_sincronizar() returns int
language plpgsql security definer set search_path = public as $$
declare v_n int; v_error text;
begin
  if not tiene_permiso('tienda.editar') then raise exception 'No tenés permiso para configurar la tienda'; end if;
  if not exists (select 1 from integraciones where ig_token is not null) then raise exception 'Instagram no está conectado'; end if;
  v_n := _instagram_sincronizar();
  select ig_error into v_error from integraciones;
  if v_error is not null then raise exception '%', v_error; end if;
  return v_n;
end $$;

create function public.instagram_mostrar(p_id bigint, p_visible boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tiene_permiso('tienda.editar') then raise exception 'No tenés permiso para configurar la tienda'; end if;
  update instagram_posts set visible = p_visible where id = p_id;
end $$;

create function public.estado_instagram() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare i integraciones;
begin
  if not tiene_permiso('tienda.editar') then raise exception 'No tenés permiso para configurar la tienda'; end if;
  select * into i from integraciones;
  return jsonb_build_object(
    'conectado', i.ig_token is not null, 'usuario', i.ig_usuario, 'tipo_cuenta', i.ig_tipo_cuenta,
    'token', case when i.ig_token is not null then '…' || right(i.ig_token, 4) end,
    'vence', i.ig_token_vence, 'dias', case when i.ig_token_vence is not null then ceil(extract(epoch from (i.ig_token_vence - now())) / 86400)::int end,
    'conectado_en', i.ig_conectado_en, 'sincronizado_en', i.ig_sincronizado_en, 'error', i.ig_error,
    'publicaciones', (select count(*) from instagram_posts), 'visibles', (select count(*) from instagram_posts where visible));
end $$;

-- ── Sola, en segundo plano ───────────────────────────────────────────
create function public._instagram_tarea() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _instagram_renovar();
  perform _instagram_sincronizar();
exception when others then
  update integraciones set ig_error = left(sqlerrm, 200) where unica;
end $$;
select cron.schedule('instagram-sincronizar', '0 */3 * * *', $$select public._instagram_tarea()$$);

revoke execute on function public._instagram_get, public._instagram_motivo, public._instagram_sincronizar, public._instagram_renovar, public._instagram_tarea from public, anon, authenticated;
revoke execute on function public.guardar_instagram(text), public.instagram_desconectar(), public.instagram_sincronizar(),
  public.instagram_mostrar(bigint, boolean), public.estado_instagram() from public, anon;
grant  execute on function public.guardar_instagram(text), public.instagram_desconectar(), public.instagram_sincronizar(),
  public.instagram_mostrar(bigint, boolean), public.estado_instagram() to authenticated;
