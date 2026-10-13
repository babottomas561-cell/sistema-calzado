-- Quién factura y quién puede vender sin factura, por rol (Equipo → Roles):
--   · sin «Emitir facturas»: la caja no muestra nada de factura; la venta sale con comprobante interno (salvo un medio «siempre con factura»).
--   · con «Emitir facturas» y sin «Vender sin factura»: todo lo que vende sale con factura; la caja no ofrece «Sin factura».
--   · con los dos: elige en cada venta.
-- Antes «Emitir facturas» venía incluido en «Registrar ventas» (no se podía sacar): pasa a ser independiente. Para no cambiar nada de golpe, los roles
-- que venden quedan con los dos tildados (como hasta ahora). La base lo hace cumplir: una venta de alguien que no puede vender sin factura deja creada
-- su factura al guardarse.

update public.permisos set padre = null, descripcion = 'Facturar con ARCA al vender y reintentar una factura que quedó pendiente. Sin este permiso, la caja no muestra nada de factura.'
 where codigo = 'facturas.emitir';
insert into public.permisos (orden, grupo, codigo, nombre, descripcion) values
  (16, 'Ventas', 'ventas.sin_factura', 'Vender sin factura', 'Elegir «Sin factura» (comprobante interno) en la caja cuando la facturación con ARCA está activa. Sin este permiso, todo lo que vende sale con factura.');
update public.roles set permisos = permisos || '{facturas.emitir,ventas.sin_factura}'
 where not todos and 'ventas.registrar' = any (permisos) and not ('facturas.emitir' = any (permisos));

-- La base: si quien registra la venta factura pero no puede vender sin factura, la venta deja creada su factura (al cierre: con renglones y pagos)
create function public._factura_por_permiso() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not (select activa from configuracion_fiscal) then return null; end if;
  if not (tiene_permiso('facturas.emitir') and not tiene_permiso('ventas.sin_factura')) then return null; end if;
  begin
    perform _factura_crear(new.id);
  exception when others then null;   -- si falta algo (por ejemplo el DNI desde el umbral), la venta se guarda y se factura desde la venta
  end;
  return null;
end $$;
create constraint trigger ventas_factura_por_permiso after insert on public.ventas deferrable initially deferred
  for each row execute function public._factura_por_permiso();

-- La caja: también si puede vender sin factura
create or replace function public.facturacion_caja() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not es_staff() then null else jsonb_build_object('activa', c.activa, 'modo', c.modo, 'serie_por_defecto', c.serie_por_defecto,
    'letra', _factura_letra(), 'ambiente', c.ambiente, 'puede', tiene_permiso('facturas.emitir'), 'sin_factura', tiene_permiso('ventas.sin_factura'),
    'umbral', c.umbral_identificacion) end
  from configuracion_fiscal c
$$;

revoke execute on function public._factura_por_permiso() from public, anon, authenticated;
