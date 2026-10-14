-- WhatsApp con menús: el cliente elige tocando (lista desplegable o botones) en vez de escribir.
-- · wa_recibir devuelve también la opción elegida (`opcion` = id de la fila o del botón).
-- · wa_responder_menu manda un mensaje interactivo (lista o botones), con las mismas garantías que wa_responder:
--   solo con un aviso firmado de Meta y solo a quien escribió en ese aviso.

create or replace function public.wa_recibir(p_payload text, p_firma text)
returns jsonb language plpgsql security definer set search_path = public as $$
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
    elsif m ->> 'type' = 'interactive' and coalesce(m -> 'interactive' -> 'list_reply' ->> 'id', m -> 'interactive' -> 'button_reply' ->> 'id') is not null then
      -- eligió una fila de la lista o un botón: `opcion` es su id, `texto` lo que se leía
      v_mensajes := v_mensajes || jsonb_build_object('de', m ->> 'from', 'id', m ->> 'id',
        'texto', coalesce(m -> 'interactive' -> 'list_reply' ->> 'title', m -> 'interactive' -> 'button_reply' ->> 'title'),
        'opcion', coalesce(m -> 'interactive' -> 'list_reply' ->> 'id', m -> 'interactive' -> 'button_reply' ->> 'id'));
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'mensajes', v_mensajes, 'bot_activo', t.wa_bot_activo, 'ia_modelo', t.ia_modelo,
    'gemini_api_key', case when t.wa_bot_activo and jsonb_array_length(v_mensajes) > 0 then (select gemini_api_key from integraciones) end);
end $$;

create function public.wa_responder_menu(p_payload text, p_firma text, p_para text, p_interactivo jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not _wa_firma_valida(p_payload, p_firma) then return false; end if;
  -- solo listas y botones, con el cuerpo que exige Meta y de tamaño razonable
  if p_interactivo is null or p_interactivo ->> 'type' not in ('list', 'button') then return false; end if;
  if coalesce(trim(p_interactivo -> 'body' ->> 'text'), '') = '' or length(p_interactivo -> 'body' ->> 'text') > 1024 then return false; end if;
  if length(p_interactivo::text) > 12000 then return false; end if;
  if not exists (select 1 from jsonb_array_elements(coalesce(p_payload::jsonb -> 'entry', '[]')) e,
                   jsonb_array_elements(coalesce(e -> 'changes', '[]')) ch,
                   jsonb_array_elements(coalesce(ch -> 'value' -> 'messages', '[]')) m
                  where m ->> 'from' = p_para) then return false; end if;
  return _wa_enviar(p_para, jsonb_build_object('type', 'interactive', 'interactive', p_interactivo), 'respuesta') is not null;
end $$;
revoke execute on function public.wa_responder_menu(text, text, text, jsonb) from public;
grant execute on function public.wa_responder_menu(text, text, text, jsonb) to anon, authenticated;
