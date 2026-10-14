-- «Esperar el pago»: mientras un cobro por posnet o QR está pendiente, la caja no confirma la venta ni suelta el ticket hasta que Mercado Pago lo apruebe
-- (o se cancele el cobro). Parámetro del local, encendido de fábrica. Es una regla de la pantalla de la caja; lo que la base garantiza sigue siendo que
-- un cobro aprobado sirve una sola vez y por su importe.
alter table public.configuracion_tienda add column cobro_espera_pago boolean not null default true;

create function public.cobro_espera_pago() returns boolean
language sql stable security definer set search_path = public as $$
  select case when es_staff() then cobro_espera_pago end from configuracion_tienda $$;

create function public.guardar_espera_pago(p_activa boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tiene_permiso('tienda.editar') then raise exception 'No tenés permiso para configurar las conexiones'; end if;
  update configuracion_tienda set cobro_espera_pago = coalesce(p_activa, true);
end $$;

revoke execute on function public.cobro_espera_pago(), public.guardar_espera_pago(boolean) from public, anon;
grant execute on function public.cobro_espera_pago(), public.guardar_espera_pago(boolean) to authenticated;
