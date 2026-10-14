-- Parametrización: lo que usa el local, sí o no (los módulos). Lo que se enciende acá aparece en Configuración con su «cómo».
--   · las integraciones (WhatsApp, Mercado Pago, Instagram, Inteligencia artificial, Envíos, Dominio, Correo, ARCA) y las listas de precios pasan a ser interruptores;
--   · lo que ya se usa en este local queda encendido; lo demás, apagado (un local nuevo arranca con lo mínimo);
--   · la clave de un módulo es su ruta (/admin/<clave>): se admite «/» para las pantallas de adentro (integraciones/whatsapp);
--   · apagar una integración la oculta (y corta su pantalla); lo ya conectado sigue funcionando hasta desconectarlo.
-- Agrega, no rompe.

alter table public.modulos drop constraint modulos_clave_check, add constraint modulos_clave_check check (clave ~ '^[a-z_/-]{2,40}$');

insert into public.modulos (clave, nombre, fijo, depende, activo)
select v.clave, v.nombre, false, v.depende, v.activo from (
  select 'integraciones/whatsapp' clave, 'WhatsApp' nombre, '{integraciones}'::text[] depende, coalesce((select wa_access_token is not null from public.integraciones), false) activo
  union all select 'integraciones/ia', 'Inteligencia artificial', '{integraciones}', coalesce((select gemini_api_key is not null from public.integraciones), false)
  union all select 'integraciones/mercadopago', 'Mercado Pago', '{integraciones}', coalesce((select mp_access_token is not null or mp_point_token is not null from public.integraciones), false)
  union all select 'integraciones/instagram', 'Instagram', '{integraciones}', coalesce((select ig_token is not null from public.integraciones), false)
  union all select 'integraciones/envios', 'Envíos', '{integraciones}', exists (select 1 from public.zonas_envio)
  union all select 'integraciones/dominio', 'Dominio propio', '{integraciones}', exists (select 1 from public.dominios)
  union all select 'integraciones/correo', 'Correo', '{integraciones}', coalesce((select smtp_host is not null from public.integraciones), false)
  union all select 'integraciones/arca', 'ARCA (factura electrónica)', '{integraciones}',
    coalesce((select arca_csr is not null or arca_cert_homologacion is not null or arca_cert_produccion is not null from public.integraciones), false) or coalesce((select activa from public.configuracion_fiscal), false)
  union all select 'precios/listas', 'Listas de precios', '{precios}', coalesce((select listas_precios_activas from public.configuracion_tienda), false)
) v;

CREATE OR REPLACE FUNCTION public._precio_con_lista(p_precio numeric, p_canal text)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c configuracion_tienda; l listas_precios;
begin
  select * into c from configuracion_tienda;
  if not _modulo_activo('precios/listas') then return p_precio; end if;   -- «Listas de precios» se enciende en Parametrización
  select * into l from listas_precios where id = case when p_canal = 'tienda' then c.lista_tienda_id else c.lista_mostrador_id end and activa;
  if not found then return p_precio; end if;
  return _aplicar_lista(p_precio, l.ajuste_pct, l.redondeo);
end $function$;

-- El interruptor de las listas es el módulo: configurar_listas_precios solo guarda qué lista usa cada canal (p_activas se ignora, queda por compatibilidad)
create or replace function public.configurar_listas_precios(p_activas boolean default false, p_mostrador bigint default null, p_tienda bigint default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tiene_permiso('precios.editar') then raise exception 'No tenés permiso para cambiar precios de venta'; end if;
  if p_mostrador is not null and not exists (select 1 from listas_precios where id = p_mostrador and activa) then raise exception 'La lista del mostrador no existe o está apagada'; end if;
  if p_tienda is not null and not exists (select 1 from listas_precios where id = p_tienda and activa) then raise exception 'La lista de la tienda no existe o está apagada'; end if;
  update configuracion_tienda set lista_mostrador_id = p_mostrador, lista_tienda_id = p_tienda where unica;
end $$;
