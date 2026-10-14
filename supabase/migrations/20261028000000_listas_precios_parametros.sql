-- Listas de precios: los parámetros opcionales llevan valor por defecto (la pantalla omite los vacíos y PostgREST resuelve la función por los nombres que llegan).
-- Cambia el orden de los parámetros de guardar_lista_precios; nadie la usaba todavía (las listas no tenían pantalla).

drop function public.guardar_lista_precios(bigint, text, numeric, integer, boolean);
drop function public.configurar_listas_precios(boolean, bigint, bigint);

CREATE FUNCTION public.guardar_lista_precios(p_nombre text, p_ajuste_pct numeric DEFAULT 0, p_redondeo integer DEFAULT 0, p_id bigint DEFAULT NULL, p_activa boolean DEFAULT true)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id bigint;
begin
  if not tiene_permiso('precios.editar') then raise exception 'No tenés permiso para cambiar precios de venta'; end if;
  if length(trim(coalesce(p_nombre, ''))) = 0 then raise exception 'Ponele un nombre a la lista'; end if;
  if p_id is null then
    insert into listas_precios (nombre, ajuste_pct, redondeo, activa) values (trim(p_nombre), coalesce(p_ajuste_pct, 0), coalesce(p_redondeo, 0), coalesce(p_activa, true)) returning id into v_id;
  else
    update listas_precios set nombre = trim(p_nombre), ajuste_pct = coalesce(p_ajuste_pct, 0), redondeo = coalesce(p_redondeo, 0), activa = coalesce(p_activa, true) where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Esa lista no existe'; end if;
  end if;
  return v_id;
exception when unique_violation then raise exception 'Ya hay una lista con ese nombre';
end $function$;

CREATE FUNCTION public.configurar_listas_precios(p_activas boolean DEFAULT false, p_mostrador bigint DEFAULT NULL, p_tienda bigint DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not tiene_permiso('precios.editar') then raise exception 'No tenés permiso para cambiar precios de venta'; end if;
  if p_mostrador is not null and not exists (select 1 from listas_precios where id = p_mostrador and activa) then raise exception 'La lista del mostrador no existe o está apagada'; end if;
  if p_tienda is not null and not exists (select 1 from listas_precios where id = p_tienda and activa) then raise exception 'La lista de la tienda no existe o está apagada'; end if;
  update configuracion_tienda set listas_precios_activas = coalesce(p_activas, false), lista_mostrador_id = p_mostrador, lista_tienda_id = p_tienda where unica;
end $function$;

revoke execute on function public.guardar_lista_precios(text, numeric, integer, bigint, boolean), public.configurar_listas_precios(boolean, bigint, bigint) from public, anon;
grant execute on function public.guardar_lista_precios(text, numeric, integer, bigint, boolean), public.configurar_listas_precios(boolean, bigint, bigint) to authenticated;
