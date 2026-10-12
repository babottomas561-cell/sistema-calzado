-- La IA (Gemini) desde Integraciones: elegir el modelo, probar la clave y registrar lo que gasta.
--   · El modelo se elige en la pantalla (si Google retira uno, se cambia sin tocar código).
--   · «Probar Gemini» manda una consulta corta desde la base (la clave no sale nunca) y muestra qué contestó Google.
--   · Cada respuesta del bot registra los tokens que usó (ia_usos) y, con un precio por millón de tokens cargado,
--     se suma sola a Gastos → Inteligencia artificial (una por mes). Con el plan gratis el precio es 0 y solo se cuenta.

alter table public.configuracion_tienda
  add column ia_modelo text not null default 'gemini-2.5-flash'
    check (ia_modelo ~ '^[a-z0-9][a-z0-9.\-]{2,60}$');

-- Precios de Gemini en US$ por millón de tokens (entrada = lo que se le manda; salida = lo que contesta)
alter table public.configuracion_gastos
  add column ia_precio_entrada numeric(10,4) not null default 0 check (ia_precio_entrada >= 0),
  add column ia_precio_salida  numeric(10,4) not null default 0 check (ia_precio_salida >= 0);

alter table public.integraciones add column ia_ultima_prueba bigint;   -- el pedido HTTP de la última prueba

-- ── Uso de la IA ───────────────────────────────────────────────────────
create table public.ia_usos (
  id               bigint generated always as identity primary key,
  fecha            timestamptz not null default now(),
  modelo           text not null,
  tokens_entrada   int not null check (tokens_entrada >= 0),
  tokens_salida    int not null check (tokens_salida >= 0),
  costo_usd        numeric(12,6) not null default 0
);
create index ia_usos_fecha_idx on public.ia_usos (fecha);
alter table public.ia_usos enable row level security;
create policy "ve uso de la ia" on public.ia_usos for select to authenticated using (tiene_permiso('gastos.gestionar') or tiene_permiso('tienda.editar'));

-- La llama el webhook después de que el bot contesta: solo con un aviso de Meta firmado (nadie más puede inflar el gasto)
create function public.ia_registrar_uso(p_payload text, p_firma text, p_tokens_entrada int, p_tokens_salida int) returns boolean
language plpgsql security definer set search_path = public as $$
declare c configuracion_gastos; v_costo numeric; v_modelo text := (select ia_modelo from configuracion_tienda);
begin
  if not _wa_firma_valida(p_payload, p_firma) then return false; end if;
  if p_tokens_entrada not between 0 and 1000000 or p_tokens_salida not between 0 and 1000000 then return false; end if;
  select * into c from configuracion_gastos;
  v_costo := (p_tokens_entrada * c.ia_precio_entrada + p_tokens_salida * c.ia_precio_salida) / 1000000.0;
  insert into ia_usos (modelo, tokens_entrada, tokens_salida, costo_usd) values (v_modelo, p_tokens_entrada, p_tokens_salida, v_costo);
  if v_costo > 0 then
    perform _sumar_gasto_automatico('ia:' || to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM'),
      'Inteligencia artificial', 'Gemini (bot de WhatsApp) ' || to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'MM/YYYY'),
      round(v_costo, 2), 'USD');
  end if;
  return true;
end $$;
revoke execute on function public.ia_registrar_uso(text, text, int, int) from public;
grant execute on function public.ia_registrar_uso(text, text, int, int) to anon, authenticated;

-- ── Probar la clave de Gemini (desde la base: la clave no sale) ────────
create function public.ia_probar() returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare v_clave text := (select gemini_api_key from integraciones); v_modelo text := (select ia_modelo from configuracion_tienda); v_req bigint;
begin
  if not tiene_permiso('tienda.editar') then raise exception 'No tenés permiso para configurar las conexiones'; end if;
  if v_clave is null then raise exception 'Primero cargá la clave de Gemini'; end if;
  select net.http_post(
    url := 'https://generativelanguage.googleapis.com/v1beta/models/' || v_modelo || ':generateContent',
    headers := jsonb_build_object('x-goog-api-key', v_clave, 'Content-Type', 'application/json'),
    body := jsonb_build_object('contents', jsonb_build_array(jsonb_build_object('role', 'user',
              'parts', jsonb_build_array(jsonb_build_object('text', 'Respondé solo: ok'))))),
    timeout_milliseconds := 20000
  ) into v_req;
  update integraciones set ia_ultima_prueba = v_req where unica;
  return v_req;
end $$;
revoke execute on function public.ia_probar() from public, anon;
grant execute on function public.ia_probar() to authenticated;

-- Qué está cargado: suma el modelo, la última prueba de la IA y el uso del mes
drop function public.estado_integraciones();
create function public.estado_integraciones() returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare i integraciones; fin text := '…'; r record; v_mes timestamptz := date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires') at time zone 'America/Argentina/Buenos_Aires';
begin
  if not tiene_permiso('tienda.editar') then raise exception 'No tenés permiso para ver las conexiones'; end if;
  select * into i from integraciones;
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
    'ia_prueba', case when i.ia_ultima_prueba is null then null
                      when r.status_code is null and r.error is null then jsonb_build_object('estado', 'probando')
                      when r.status_code between 200 and 299 then jsonb_build_object('estado', 'ok', 'fecha', r.created)
                      else jsonb_build_object('estado', 'error', 'fecha', r.created, 'error', r.error) end,
    'ia_mes', (select jsonb_build_object('respuestas', count(*), 'tokens', coalesce(sum(tokens_entrada + tokens_salida), 0), 'costo_usd', coalesce(sum(costo_usd), 0))
                 from ia_usos where fecha >= v_mes));
end $$;
revoke execute on function public.estado_integraciones() from public, anon;
grant execute on function public.estado_integraciones() to authenticated;

-- El webhook también necesita saber qué modelo usar
create or replace function public.wa_recibir(p_payload text, p_firma text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb; s jsonb; m jsonb; v_precio numeric; v_cat text; v_mensajes jsonb := '[]'; c configuracion_gastos; t configuracion_tienda;
begin
  if not _wa_firma_valida(p_payload, p_firma) then return jsonb_build_object('ok', false); end if;
  v := p_payload::jsonb;
  select * into c from configuracion_gastos;
  select * into t from configuracion_tienda;
  for s in select jsonb_array_elements(coalesce(ch -> 'value' -> 'statuses', '[]'))
             from jsonb_array_elements(coalesce(v -> 'entry', '[]')) e, jsonb_array_elements(coalesce(e -> 'changes', '[]')) ch loop
    if (s -> 'pricing' ->> 'billable')::boolean then
      v_cat := coalesce(s -> 'pricing' ->> 'category', 'utility');
      v_precio := case v_cat when 'marketing' then c.wa_precio_marketing when 'authentication' then c.wa_precio_authentication
                             when 'utility' then c.wa_precio_utility else 0 end;
      insert into whatsapp_cobros (message_id, categoria, precio_usd) values (s ->> 'id', v_cat, v_precio)
      on conflict (message_id) do nothing;
      if found and v_precio > 0 then
        perform _sumar_gasto_automatico('whatsapp:' || to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM'),
          'WhatsApp (Meta)', 'WhatsApp de Meta ' || to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'MM/YYYY'), v_precio, 'USD');
      end if;
    end if;
  end loop;
  for m in select jsonb_array_elements(coalesce(ch -> 'value' -> 'messages', '[]'))
             from jsonb_array_elements(coalesce(v -> 'entry', '[]')) e, jsonb_array_elements(coalesce(e -> 'changes', '[]')) ch loop
    continue when coalesce((m ->> 'timestamp')::bigint, 0) < extract(epoch from now())::bigint - 600;
    perform _wa_enviar(m ->> 'from', jsonb_build_object('status', 'read', 'message_id', m ->> 'id'), 'leido');
    if m ->> 'type' = 'text' then
      v_mensajes := v_mensajes || jsonb_build_object('de', m ->> 'from', 'id', m ->> 'id', 'texto', m -> 'text' ->> 'body');
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'mensajes', v_mensajes, 'bot_activo', t.wa_bot_activo, 'ia_modelo', t.ia_modelo,
    'gemini_api_key', case when t.wa_bot_activo and jsonb_array_length(v_mensajes) > 0 then (select gemini_api_key from integraciones) end);
end $$;
