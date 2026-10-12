-- La IA, con sus números a la vista: precio de cada modelo, cuánto saldría lo que se usa y cuánto queda del plan gratis.
--   · ia_modelos: los modelos de Gemini con su precio oficial (ai.google.dev/gemini-api/docs/pricing, página del
--     2026-10-09), editables por si Google los cambia. El modelo del bot se elige de esta lista.
--   · Plan gratis o pago (configuracion_tienda.ia_plan): con el gratis no hay gasto, pero se muestra cuánto costaría.
--     Con el pago, cada respuesta suma su costo a Gastos → Inteligencia artificial.
--   · El límite gratis es de consultas por día y Google NO lo publica: se ve en AI Studio (por proyecto) y se carga acá.
--     El día de Google se reinicia a la medianoche del Pacífico (04:00 o 05:00 en Argentina).

create table public.ia_modelos (
  id                   text primary key check (id ~ '^[a-z0-9][a-z0-9.\-]{2,60}$'),
  nombre               text not null,
  precio_entrada       numeric(10,4) not null check (precio_entrada >= 0),   -- US$ por millón de tokens
  precio_salida        numeric(10,4) not null check (precio_salida >= 0),
  tiene_gratis         boolean not null default true,
  limite_diario_gratis int check (limite_diario_gratis > 0),               -- consultas por día (de AI Studio)
  nota                 text,
  verificado           date not null default current_date,
  orden                int not null default 0
);
alter table public.ia_modelos enable row level security;
create policy "ve modelos de ia" on public.ia_modelos for select to authenticated using (tiene_permiso('tienda.editar') or tiene_permiso('gastos.gestionar'));
create policy "edita modelos de ia" on public.ia_modelos for update to authenticated using (tiene_permiso('tienda.editar')) with check (tiene_permiso('tienda.editar'));

insert into public.ia_modelos (id, nombre, precio_entrada, precio_salida, tiene_gratis, nota, verificado, orden) values
  ('gemini-2.5-flash',      'Gemini 2.5 Flash',      0.30, 2.50, true,  'Rápido y barato: el recomendado para el bot', '2026-10-09', 1),
  ('gemini-2.5-flash-lite', 'Gemini 2.5 Flash-Lite', 0.10, 0.40, true,  'El más barato', '2026-10-09', 2),
  ('gemini-3.1-flash-lite', 'Gemini 3.1 Flash-Lite', 0.25, 1.50, true,  null, '2026-10-09', 3),
  ('gemini-3.5-flash-lite', 'Gemini 3.5 Flash-Lite', 0.30, 2.50, true,  null, '2026-10-09', 4),
  ('gemini-3-flash-preview','Gemini 3 Flash (preview)', 0.50, 3.00, true, 'Versión de prueba de Google: puede cambiar o retirarse', '2026-10-09', 5),
  ('gemini-3.6-flash',      'Gemini 3.6 Flash',      0.75, 3.75, true,  'Desde el 1/1/2027 sube a US$ 1,50 / 7,50', '2026-10-09', 6),
  ('gemini-3.8-flash',      'Gemini 3.8 Flash',      0.75, 3.75, true,  'Desde el 1/1/2027 sube a US$ 1,50 / 7,50', '2026-10-09', 7),
  ('gemini-2.5-pro',        'Gemini 2.5 Pro',        1.25, 10.00, true, 'El más inteligente y caro (precio hasta 200 mil tokens por consulta)', '2026-10-09', 8);

-- El modelo elegido tiene que estar en la lista (si no estaba, vuelve al recomendado)
update public.configuracion_tienda set ia_modelo = 'gemini-2.5-flash' where ia_modelo not in (select id from ia_modelos);
alter table public.configuracion_tienda drop constraint configuracion_tienda_ia_modelo_check;
alter table public.configuracion_tienda add constraint configuracion_tienda_ia_modelo_fkey
  foreign key (ia_modelo) references public.ia_modelos (id) on delete restrict;
create index configuracion_tienda_ia_modelo_idx on public.configuracion_tienda (ia_modelo);
alter table public.configuracion_tienda add column ia_plan text not null default 'gratis' check (ia_plan in ('gratis', 'pago'));

-- Los precios ahora salen del modelo (ya no de Gastos)
alter table public.configuracion_gastos drop column ia_precio_entrada, drop column ia_precio_salida;

-- Cada uso guarda cuántas consultas hizo (una respuesta con búsqueda en la base son 2) y cuánto costaría pagando
alter table public.ia_usos
  add column consultas int not null default 1 check (consultas between 0 and 10),
  add column costo_estimado_usd numeric(12,6) not null default 0,
  add column plan text not null default 'gratis';

drop function public.ia_registrar_uso(text, text, int, int);
create function public.ia_registrar_uso(p_payload text, p_firma text, p_tokens_entrada int, p_tokens_salida int, p_consultas int default 1)
returns boolean language plpgsql security definer set search_path = public as $$
declare t configuracion_tienda; m ia_modelos; v_estimado numeric;
begin
  if not _wa_firma_valida(p_payload, p_firma) then return false; end if;
  if p_tokens_entrada not between 0 and 1000000 or p_tokens_salida not between 0 and 1000000 or p_consultas not between 0 and 10 then return false; end if;
  select * into t from configuracion_tienda;
  select * into m from ia_modelos where id = t.ia_modelo;
  v_estimado := (p_tokens_entrada * m.precio_entrada + p_tokens_salida * m.precio_salida) / 1000000.0;
  insert into ia_usos (modelo, tokens_entrada, tokens_salida, consultas, costo_estimado_usd, plan, costo_usd)
  values (t.ia_modelo, p_tokens_entrada, p_tokens_salida, p_consultas, v_estimado, t.ia_plan, case when t.ia_plan = 'pago' then v_estimado else 0 end);
  if t.ia_plan = 'pago' and v_estimado > 0 then
    perform _sumar_gasto_automatico('ia:' || to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM'),
      'Inteligencia artificial', 'Gemini (bot de WhatsApp) ' || to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'MM/YYYY'),
      round(v_estimado, 2), 'USD');
  end if;
  return true;
end $$;
revoke execute on function public.ia_registrar_uso(text, text, int, int, int) from public;
grant execute on function public.ia_registrar_uso(text, text, int, int, int) to anon, authenticated;

-- ── La lista de modelos se actualiza sola (una vez por día) ────────────
-- Google publica qué modelos existen (models.list), no sus precios. Cada mañana la base le pregunta (con la clave,
-- desde la base) y al procesar la respuesta: marca los que ya no están, suma los nuevos de Gemini que sirven para
-- chatear (sin precio: el panel avisa que hay que confirmarlo) y queda la fecha de la revisión.
alter table public.ia_modelos
  alter column precio_entrada drop not null,
  alter column precio_salida drop not null,
  add column disponible boolean not null default true,
  add column nuevo boolean not null default false;
alter table public.integraciones add column ia_modelos_req bigint, add column ia_modelos_revisado timestamptz, add column ia_modelos_error text;

create function public._ia_pedir_modelos() returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare v_clave text := (select gemini_api_key from integraciones); v_req bigint;
begin
  if v_clave is null then return null; end if;
  select net.http_get(url := 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000',
                      headers := jsonb_build_object('x-goog-api-key', v_clave), timeout_milliseconds := 20000) into v_req;
  update integraciones set ia_modelos_req = v_req where unica;
  return v_req;
end $$;

create function public._ia_procesar_modelos() returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare v_req bigint := (select ia_modelos_req from integraciones); r record; v_ids text[];
begin
  if v_req is null then return false; end if;
  select status_code, content into r from net._http_response where id = v_req;
  if r.status_code is null then return false; end if;                      -- todavía no contestó
  update integraciones set ia_modelos_req = null where unica;
  if r.status_code not between 200 and 299 then
    update integraciones set ia_modelos_error = coalesce(r.content::jsonb -> 'error' ->> 'message', 'Google contestó ' || r.status_code) where unica;
    return false;
  end if;
  -- Los modelos de Gemini que sirven para chatear (generateContent), sin los de imagen, audio, embeddings, etc.
  select array_agg(replace(mm ->> 'name', 'models/', '')) into v_ids
    from jsonb_array_elements(coalesce(r.content::jsonb -> 'models', '[]')) mm
   where mm ->> 'name' ~ '^models/gemini-[0-9]'
     and (mm -> 'supportedGenerationMethods') ? 'generateContent'
     and mm ->> 'name' !~ '(image|tts|audio|live|embedding|vision|thinking-exp|computer-use|native)';
  if v_ids is null then return false; end if;
  update ia_modelos set disponible = id = any (v_ids);
  insert into ia_modelos (id, nombre, tiene_gratis, nuevo, nota, verificado, orden)
  select x, initcap(replace(replace(x, '-', ' '), 'gemini', 'Gemini')), true, true,
         'Nuevo en Google: confirmá su precio en ai.google.dev/gemini-api/docs/pricing', current_date, 50
    from unnest(v_ids) x where x ~ '^[a-z0-9][a-z0-9.\-]{2,60}$'
  on conflict (id) do nothing;
  update integraciones set ia_modelos_revisado = now(), ia_modelos_error = null where unica;
  return true;
end $$;
revoke execute on function public._ia_pedir_modelos(), public._ia_procesar_modelos() from public, anon, authenticated;

-- Para el panel: procesar lo pendiente al abrir la pantalla, y pedir una revisión ya
create function public.ia_revisar_modelos(p_pedir boolean default false) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tiene_permiso('tienda.editar') then raise exception 'No tenés permiso para configurar las conexiones'; end if;
  perform _ia_procesar_modelos();
  if p_pedir then
    if (select gemini_api_key is null from integraciones) then raise exception 'Primero cargá la clave de Gemini'; end if;
    perform _ia_pedir_modelos();
  end if;
end $$;
revoke execute on function public.ia_revisar_modelos(boolean) from public, anon;
grant execute on function public.ia_revisar_modelos(boolean) to authenticated;

select cron.schedule('ia-pedir-modelos', '0 11 * * *', $$select public._ia_pedir_modelos()$$);       -- 08:00 en Argentina
select cron.schedule('ia-procesar-modelos', '5 11 * * *', $$select public._ia_procesar_modelos()$$);

-- Qué está cargado y cómo viene el uso: hoy (día de Google) contra el límite gratis, y el mes
create or replace function public.estado_integraciones() returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare i integraciones; t configuracion_tienda; m ia_modelos; fin text := '…'; r record;
        v_mes timestamptz := date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires') at time zone 'America/Argentina/Buenos_Aires';
        v_dia_google timestamptz := date_trunc('day', now() at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles';
begin
  if not tiene_permiso('tienda.editar') then raise exception 'No tenés permiso para ver las conexiones'; end if;
  select * into i from integraciones;
  select * into t from configuracion_tienda;
  select * into m from ia_modelos where id = t.ia_modelo;
  select status_code, created, coalesce((content::jsonb -> 'error' ->> 'message'), error_msg) as error into r
    from net._http_response where id = i.ia_ultima_prueba;
  return jsonb_build_object(
    'phone_number_id', i.wa_phone_number_id, 'waba_id', i.wa_waba_id,
    'token', case when i.wa_access_token is not null then fin || right(i.wa_access_token, 4) end,
    'secreto', case when i.wa_app_secret is not null then fin || right(i.wa_app_secret, 4) end,
    'gemini', case when i.gemini_api_key is not null then fin || right(i.gemini_api_key, 4) end,
    'verify_token', i.wa_verify_token,
    'meta_lista', i.wa_access_token is not null and i.wa_phone_number_id is not null and i.wa_app_secret is not null,
    'actualizado_en', i.actualizado_en,
    'ia_modelos_revisado', i.ia_modelos_revisado, 'ia_modelos_error', i.ia_modelos_error,
    'ia_prueba', case when i.ia_ultima_prueba is null then null
                      when r.status_code is null and r.error is null then jsonb_build_object('estado', 'probando')
                      when r.status_code between 200 and 299 then jsonb_build_object('estado', 'ok', 'fecha', r.created)
                      else jsonb_build_object('estado', 'error', 'fecha', r.created, 'error', r.error) end,
    'ia_hoy', (select jsonb_build_object('consultas', coalesce(sum(consultas), 0), 'limite', m.limite_diario_gratis,
                 'reinicia', (v_dia_google + interval '1 day'))
                 from ia_usos where fecha >= v_dia_google and modelo = t.ia_modelo),
    'ia_mes', (select jsonb_build_object('respuestas', count(*), 'consultas', coalesce(sum(consultas), 0),
                 'tokens_entrada', coalesce(sum(tokens_entrada), 0), 'tokens_salida', coalesce(sum(tokens_salida), 0),
                 'costo_usd', coalesce(sum(costo_usd), 0), 'estimado_usd', coalesce(sum(costo_estimado_usd), 0))
                 from ia_usos where fecha >= v_mes));
end $$;

