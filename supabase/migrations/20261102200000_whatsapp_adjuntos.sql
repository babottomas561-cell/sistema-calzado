-- WhatsApp: si el cliente manda un audio, una foto, un video, un archivo o un sticker, wa_recibir lo devuelve como la
-- opción `m:nosoporta` (antes se ignoraba en silencio) para que el bot le conteste y le ofrezca el menú.
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
    elsif m ->> 'type' in ('audio', 'image', 'video', 'document', 'sticker') then
      -- un audio, una foto, un archivo…: el bot todavía no los lee; se le avisa al cliente y se le ofrece el menú
      v_mensajes := v_mensajes || jsonb_build_object('de', m ->> 'from', 'id', m ->> 'id', 'texto', '', 'opcion', 'm:nosoporta');
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'mensajes', v_mensajes, 'bot_activo', t.wa_bot_activo, 'ia_modelo', t.ia_modelo,
    'gemini_api_key', case when t.wa_bot_activo and jsonb_array_length(v_mensajes) > 0 then (select gemini_api_key from integraciones) end);
end $$;
