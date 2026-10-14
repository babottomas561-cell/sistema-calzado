-- La dirección de avisos (webhook) se carga a mano en el panel de Mercado Pago y no se puede cambiar por API: el sistema recuerda cuál se cargó
-- y avisa cuando la dirección del sitio cambia (por ejemplo, al conectar un dominio propio).
alter table public.integraciones add column mp_webhook_url text;

create function public.mp_webhook_confirmar() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tiene_permiso('tienda.editar') then raise exception 'No tenés permiso para configurar las conexiones'; end if;
  update integraciones set mp_webhook_url = sitio_url where unica and sitio_url is not null;
end $$;

create function public.estado_webhook_mp() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not tiene_permiso('tienda.editar') then null else jsonb_build_object(
    'actual', sitio_url || '/api/mercadopago', 'cargada', case when mp_webhook_url is not null then mp_webhook_url || '/api/mercadopago' end,
    'desactualizada', (mp_webhook_url is not null and sitio_url is not null and mp_webhook_url <> sitio_url)) end
  from integraciones
$$;

revoke execute on function public.mp_webhook_confirmar(), public.estado_webhook_mp() from public, anon;
grant execute on function public.mp_webhook_confirmar(), public.estado_webhook_mp() to authenticated;
