-- Curvas: se recuerda cuánto se usa cada una, para proponer primero la que más se usa (por escala y proveedor). Agrega, no rompe.
alter table public.curvas add column usos int not null default 0, add column ultimo_uso timestamptz;

create function public.usar_curva(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tiene_permiso('compras.registrar') then raise exception 'No tenés permiso para armar curvas'; end if;
  update curvas set usos = usos + 1, ultimo_uso = now() where id = p_id;
end $$;
revoke execute on function public.usar_curva(bigint) from public, anon;
grant execute on function public.usar_curva(bigint) to authenticated;
