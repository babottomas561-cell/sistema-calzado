-- Impresión por persona del equipo: cada uno puede tener su papel, su modo de impresión y sus copias (por ejemplo, el dueño en la compu de la caja
-- con ticket de 80 mm automático y un vendedor desde el celular en modo manual, para mandar por WhatsApp). Lo que queda vacío usa lo de la tienda
-- (configuracion_impresion). Lo edita quien edita Tablas; cada uno ve el suyo.

create table public.impresion_por_usuario (
  usuario_id          uuid primary key references auth.users (id) on delete cascade,   -- parte de la persona: si se borra el usuario, se va
  comprobante_formato text check (comprobante_formato in ('ticket80', 'ticket58', 'a4')),
  modo_impresion      text check (modo_impresion in ('automatica', 'opcional', 'manual')),
  comprobante_copias  int check (comprobante_copias between 1 and 5),
  actualizado_en      timestamptz not null default now()
);
alter table public.impresion_por_usuario enable row level security;
create policy "cada uno ve la suya" on public.impresion_por_usuario for select to authenticated
  using (usuario_id = auth.uid() or tiene_permiso('tablas.editar'));
create policy "edita quien edita tablas" on public.impresion_por_usuario for all to authenticated
  using (tiene_permiso('tablas.editar')) with check (tiene_permiso('tablas.editar'));

-- Lo que vale para quien está usando el sistema: lo suyo y, si no tiene, lo de la tienda
create function public.impresion_de(p_usuario uuid default auth.uid()) returns table (formato text, modo text, copias int)
language sql stable security definer set search_path = public as $$
  select coalesce(u.comprobante_formato, c.comprobante_formato), coalesce(u.modo_impresion, c.modo_impresion), coalesce(u.comprobante_copias, c.comprobante_copias)
    from configuracion_impresion c left join impresion_por_usuario u on u.usuario_id = p_usuario
$$;
revoke execute on function public.impresion_de(uuid) from public, anon;
grant execute on function public.impresion_de(uuid) to authenticated;

-- El comprobante viaja con el papel, el modo y las copias de quien lo abre (el link público usa los de la tienda: no hay nadie ingresado)
create or replace function public._comprobante_json(p_tipo text, p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t configuracion_tienda; l datos_legales; c configuracion_impresion; u impresion_por_usuario; v_doc jsonb;
begin
  v_doc := case p_tipo when 'venta' then _comprobante_venta(p_id) when 'presupuesto' then _comprobante_presupuesto(p_id) when 'devolucion' then _comprobante_devolucion(p_id) end;
  if v_doc is null then return null; end if;
  select * into t from configuracion_tienda; select * into l from datos_legales; select * into c from configuracion_impresion;
  select * into u from impresion_por_usuario where usuario_id = auth.uid();
  return v_doc || jsonb_build_object(
    'emisor', jsonb_build_object('nombre', t.nombre, 'logo_url', coalesce(t.logo_url, t.icono_url), 'es_icono', t.logo_url is null and t.icono_url is not null,
      'razon_social', l.razon_social, 'cuit', l.cuit, 'condicion_iva', l.condicion_iva,
      'domicilio', l.domicilio_legal, 'telefono', l.telefono_contacto, 'email', l.email_contacto, 'local', t.direccion_retiro),
    'config', jsonb_build_object('formato', coalesce(u.comprobante_formato, c.comprobante_formato), 'logo', c.comprobante_logo, 'datos_legales', c.comprobante_datos_legales,
      'qr', c.comprobante_qr, 'barras', c.comprobante_codigo_barras, 'copias', coalesce(u.comprobante_copias, c.comprobante_copias),
      'modo', coalesce(u.modo_impresion, c.modo_impresion), 'configurado', c.comprobante_configurado,
      'letra', c.comprobante_letra, 'encabezado', c.comprobante_encabezado, 'mostrar_cliente', c.comprobante_mostrar_cliente,
      'mostrar_vendedor', c.comprobante_mostrar_vendedor, 'mostrar_marca', c.comprobante_mostrar_marca),
    'leyenda', coalesce(v_doc ->> 'leyenda', c.comprobante_leyenda), 'pie', coalesce(v_doc ->> 'pie', c.comprobante_pie));
end $$;
revoke execute on function public._comprobante_json(text, bigint) from public, anon, authenticated;
