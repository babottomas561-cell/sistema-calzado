-- Cobro con QR: elegir una sucursal y una caja que ya existen en la cuenta de Mercado Pago (en vez de crear siempre una nueva).
-- Agrega funciones; no cambia nada de lo anterior.

-- Las sucursales de la cuenta con sus cajas. Devuelve {ok, sucursales:[{id, nombre, externo, direccion, cajas:[{id, nombre, externo}]}]} o {ok:false, error}.
create function public.qr_sucursales() returns jsonb
language plpgsql security definer set search_path = public set statement_timeout = '50s' as $$
declare r jsonb; v_user text; s jsonb; v_lista jsonb := '[]'; v_cajas jsonb; v_n int := 0;
begin
  if not tiene_permiso('tienda.editar') then raise exception 'No tenés permiso para configurar las conexiones'; end if;
  r := _mp_point_pedir('GET', '/users/me');
  if (r ->> 'status')::int in (401, 403) then return jsonb_build_object('ok', false, 'error', 'Mercado Pago no reconoce el Access Token'); end if;
  v_user := r -> 'cuerpo' ->> 'id';
  if v_user is null then return jsonb_build_object('ok', false, 'error', 'No se pudo leer la cuenta de Mercado Pago'); end if;
  r := _mp_point_pedir('GET', '/users/' || v_user || '/stores/search?limit=30');
  if (r ->> 'status')::int not between 200 and 299 then
    return jsonb_build_object('ok', false, 'error', 'Mercado Pago no mostró las sucursales (' || (r ->> 'status') || '): ' || left(coalesce(r -> 'cuerpo' ->> 'message', ''), 200));
  end if;
  for s in select x from jsonb_array_elements(coalesce(r -> 'cuerpo' -> 'results', '[]'::jsonb)) x loop
    exit when v_n >= 10;   -- alcanza para un local; cada sucursal es una consulta más
    v_n := v_n + 1;
    v_cajas := '[]';
    declare rp jsonb := _mp_point_pedir('GET', '/pos?store_id=' || (s ->> 'id'));
    begin
      if (rp ->> 'status')::int between 200 and 299 then
        select coalesce(jsonb_agg(jsonb_build_object('id', c ->> 'id', 'nombre', coalesce(c ->> 'name', c ->> 'external_id'), 'externo', c ->> 'external_id')), '[]') into v_cajas
          from jsonb_array_elements(coalesce(rp -> 'cuerpo' -> 'results', '[]'::jsonb)) c;
      end if;
    end;
    v_lista := v_lista || jsonb_build_array(jsonb_build_object('id', s ->> 'id', 'nombre', coalesce(s ->> 'name', s ->> 'external_id'), 'externo', s ->> 'external_id',
      'direccion', coalesce(s -> 'location' ->> 'address_line', concat_ws(' ', s -> 'location' ->> 'street_name', s -> 'location' ->> 'street_number')), 'cajas', v_cajas));
  end loop;
  return jsonb_build_object('ok', true, 'sucursales', v_lista);
end $$;

-- Usar una sucursal que ya existe: con una de sus cajas (p_caja) o, si no se elige ninguna, creando una caja nueva ahí.
create function public.qr_usar_sucursal(p_sucursal text, p_caja text default null, p_caja_externo text default null) returns jsonb
language plpgsql security definer set search_path = public set statement_timeout = '40s' as $$
declare r jsonb; v_caja jsonb; v_externo text;
begin
  if not tiene_permiso('tienda.editar') then raise exception 'No tenés permiso para configurar las conexiones'; end if;
  if coalesce(trim(p_sucursal), '') = '' then raise exception 'Elegí una sucursal'; end if;
  if coalesce(trim(p_caja), '') <> '' then
    if coalesce(trim(p_caja_externo), '') = '' then
      return jsonb_build_object('ok', false, 'error', 'Esa caja no tiene identificador en Mercado Pago, así que no se puede usar para cobrar. Elegí «Crear una caja nueva en esta sucursal».');
    end if;
    r := _mp_point_pedir('GET', '/pos/' || trim(p_caja));
    v_caja := case when (r ->> 'status')::int between 200 and 299 then r -> 'cuerpo' else '{}'::jsonb end;
    v_externo := trim(p_caja_externo);
    update integraciones set mp_qr_sucursal = trim(p_sucursal), mp_qr_caja = trim(p_caja), mp_qr_externo = v_externo, mp_qr_imagen = null, mp_qr_plantilla = null;
    perform _qr_guardar_fijo(coalesce(v_caja, '{}'::jsonb) || jsonb_build_object('qr_response', coalesce(v_caja -> 'qr_response', v_caja -> 'qr', '{}'::jsonb)));
    return jsonb_build_object('ok', true);
  end if;
  -- Una caja nueva en esa sucursal
  r := _mp_point_pedir('POST', '/v2/pos', jsonb_build_object('name', 'Caja del mostrador', 'external_id', 'CAJA1', 'store_id', trim(p_sucursal)::bigint,
         'config', jsonb_build_object('qr', jsonb_build_object('operating_mode', 'pdv'))), 'caja-' || gen_random_uuid());
  v_caja := r -> 'cuerpo';
  if v_caja ->> 'id' is null and coalesce(v_caja ->> 'message', '') ilike '%already%' then
    r := _mp_point_pedir('GET', '/pos?external_id=CAJA1');
    v_caja := coalesce(r -> 'cuerpo' -> 'results' -> 0, r -> 'cuerpo');
    r := jsonb_build_object('status', 200);
  end if;
  if (r ->> 'status')::int not between 200 and 299 or v_caja ->> 'id' is null then
    return jsonb_build_object('ok', false, 'error', 'Mercado Pago no creó la caja (' || (r ->> 'status') || '): ' || left(coalesce(v_caja ->> 'message', '') || ' ' || coalesce((v_caja -> 'errors')::text, (v_caja -> 'cause')::text, ''), 400));
  end if;
  update integraciones set mp_qr_sucursal = trim(p_sucursal), mp_qr_caja = v_caja ->> 'id', mp_qr_externo = coalesce(v_caja ->> 'external_id', 'CAJA1'), mp_qr_imagen = null, mp_qr_plantilla = null;
  perform _qr_guardar_fijo(v_caja);
  return jsonb_build_object('ok', true);
end $$;

-- Qué sucursal y qué caja se están usando (para mostrarlo)
create or replace function public.estado_qr() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not tiene_permiso('tienda.editar') then null
    else jsonb_build_object('listo', mp_qr_externo is not null, 'sucursal', mp_qr_sucursal is not null, 'sucursal_id', mp_qr_sucursal, 'caja_id', mp_qr_caja, 'caja_externa', mp_qr_externo) end
  from integraciones
$$;

-- Dejar de usar la actual (para elegir otra)
create function public.qr_desvincular() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tiene_permiso('tienda.editar') then raise exception 'No tenés permiso para configurar las conexiones'; end if;
  update integraciones set mp_qr_sucursal = null, mp_qr_caja = null, mp_qr_externo = null, mp_qr_imagen = null, mp_qr_plantilla = null;
end $$;

revoke execute on function public.qr_sucursales(), public.qr_usar_sucursal(text, text, text), public.qr_desvincular() from public, anon;
grant execute on function public.qr_sucursales(), public.qr_usar_sucursal(text, text, text), public.qr_desvincular() to authenticated;
