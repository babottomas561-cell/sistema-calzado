-- Cancelar un cobro (y reembolsar) fallaba con «http_request.content is NULL»: la extensión http exige un cuerpo en los POST/PUT/PATCH, aunque sea vacío,
-- y esos pedidos a Mercado Pago no llevan. Mismo pedido, con cuerpo vacío.

create function public._http_cuerpo(p_metodo text, p_cuerpo jsonb) returns text
language sql immutable as $$
  select case when p_cuerpo is not null then p_cuerpo::text when upper(p_metodo) in ('POST', 'PUT', 'PATCH') then '' end $$;
revoke execute on function public._http_cuerpo(text, jsonb) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public._mp_point_pedir(p_metodo text, p_ruta text, p_cuerpo jsonb DEFAULT NULL::jsonb, p_idempotencia text DEFAULT NULL::text, p_cabeceras jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_token text := (select coalesce(mp_point_token, mp_access_token) from integraciones); r extensions.http_response; v_cab extensions.http_header[]; k text; v text;
begin
  if v_token is null then raise exception 'El posnet de Mercado Pago no está configurado (cargá el Access Token de Point en Integraciones → Mercado Pago)'; end if;
  v_cab := array[extensions.http_header('Authorization', 'Bearer ' || v_token)];
  if p_idempotencia is not null then v_cab := v_cab || extensions.http_header('X-Idempotency-Key', p_idempotencia); end if;
  for k, v in select * from jsonb_each_text(coalesce(p_cabeceras, '{}')) loop v_cab := v_cab || extensions.http_header(k, v); end loop;
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '20000');
  r := extensions.http((p_metodo, 'https://api.mercadopago.com' || p_ruta, v_cab, 'application/json', _http_cuerpo(p_metodo, p_cuerpo))::extensions.http_request);
  return jsonb_build_object('status', r.status, 'cuerpo', case when r.content ~ '^\s*[\[{]' then r.content::jsonb else to_jsonb(r.content) end);
end $function$;
