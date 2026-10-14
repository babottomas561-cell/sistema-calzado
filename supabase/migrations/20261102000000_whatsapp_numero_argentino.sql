-- WhatsApp: los celulares argentinos se mandan a Meta como 54 + código de área + número, SIN el 9.
-- Meta guarda así a los destinatarios de prueba (y es el formato que documenta para Argentina): con «549…» el envío
-- falla con el error 131030 («Recipient phone number not in allowed list»), y las respuestas del bot no salían.
-- Meta contesta igual con el wa_id «549…»; la vuelta (webhook) no cambia.
create or replace function public._wa_enviar(p_telefono text, p_mensaje jsonb, p_tipo text, p_pedido bigint default null, p_detalle text default null)
returns bigint language plpgsql security definer set search_path = public, extensions as $$
declare i integraciones; v_req bigint; v_tel text := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
begin
  select * into i from integraciones;
  if i.wa_access_token is null or i.wa_phone_number_id is null then return null; end if;
  -- Argentina: sin el 9 (549 381… → 54 381…); un número de 10 cifras es argentino sin el 54
  if v_tel ~ '^549' and length(v_tel) = 13 then v_tel := '54' || substr(v_tel, 4);
  elsif length(v_tel) = 10 then v_tel := '54' || v_tel; end if;
  if length(v_tel) < 8 then return null; end if;
  select net.http_post(
    url := 'https://graph.facebook.com/v23.0/' || i.wa_phone_number_id || '/messages',
    headers := jsonb_build_object('Authorization', 'Bearer ' || i.wa_access_token, 'Content-Type', 'application/json'),
    body := case when p_tipo = 'leido' then jsonb_build_object('messaging_product', 'whatsapp') || p_mensaje   -- marcar leído no lleva destinatario
                 else jsonb_build_object('messaging_product', 'whatsapp', 'recipient_type', 'individual', 'to', v_tel) || p_mensaje end
  ) into v_req;
  insert into whatsapp_envios (tipo, telefono, pedido_id, detalle, request_id) values (p_tipo, v_tel, p_pedido, p_detalle, v_req);
  return v_req;
end $$;
revoke execute on function public._wa_enviar(text, jsonb, text, bigint, text) from public, anon, authenticated;
