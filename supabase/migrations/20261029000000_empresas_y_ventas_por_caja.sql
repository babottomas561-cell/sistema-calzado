-- Etapa 1 de los datos fiscales por sucursal: cada venta sabe de qué caja y sucursal salió, y cada sucursal pertenece a una razón social (la principal o una adicional) con sus datos, que van en el comprobante.
--   · la razón social PRINCIPAL sigue siendo `datos_legales` (sin duplicar); las ADICIONALES viven en `empresas`; `sucursales.empresa_id` null = la principal;
--   · una sucursal tiene además su domicilio y teléfono (lo que se imprime de ese local);
--   · ventas.caja_id / sucursal_id: las anota un disparador (`registrar_venta(…, p_caja)` le avisa de qué caja sale; sin dato, la caja principal);
--   · facturar por ARCA desde una razón social adicional todavía NO es posible (falta su certificado: etapa 2): `_factura_crear` lo dice con claridad.
-- Agrega, no rompe: lo anterior sigue igual para quien tiene una sola razón social.

create table public.empresas (
  id                 bigint generated always as identity primary key,
  razon_social       text not null check (length(trim(razon_social)) between 1 and 120),
  cuit               text not null,
  condicion_iva      text not null check (condicion_iva in ('Responsable Inscripto', 'Monotributo', 'IVA Exento')),
  ingresos_brutos    text,
  inicio_actividades date,
  domicilio_fiscal   text not null check (length(trim(domicilio_fiscal)) > 0),
  activa             boolean not null default true,
  creado_en          timestamptz not null default now()
);
create unique index empresas_cuit_key on public.empresas (cuit);
alter table public.empresas enable row level security;
create policy "el equipo ve las razones sociales" on public.empresas for select to authenticated using (es_staff());

alter table public.sucursales add column empresa_id bigint references public.empresas (id) on delete restrict, add column domicilio text, add column telefono text;
create index sucursales_empresa_id_idx on public.sucursales (empresa_id);

alter table public.ventas add column caja_id bigint references public.cajas (id) on delete restrict, add column sucursal_id bigint references public.sucursales (id) on delete restrict;
create index ventas_caja_id_idx on public.ventas (caja_id);
create index ventas_sucursal_id_idx on public.ventas (sucursal_id);

-- Las ventas anteriores son de la caja y la sucursal principales
update public.ventas set caja_id = (select id from public.cajas where por_defecto), sucursal_id = (select id from public.sucursales where por_defecto) where caja_id is null;

create function public._venta_caja() returns trigger language plpgsql security definer set search_path = public as $$
declare v_id bigint := nullif(current_setting('app.caja_id', true), '')::bigint; c cajas;
begin
  if new.caja_id is null then
    select * into c from cajas where id = coalesce(v_id, (select id from cajas where por_defecto)) and activa;
    if not found then raise exception 'Esa caja no existe o está apagada'; end if;
    new.caja_id := c.id; new.sucursal_id := c.sucursal_id;
  elsif new.sucursal_id is null then
    new.sucursal_id := (select sucursal_id from cajas where id = new.caja_id);
  end if;
  return new;
end $$;
create trigger ventas_caja before insert on public.ventas for each row execute function public._venta_caja();
revoke execute on function public._venta_caja() from public, anon, authenticated;

-- Quién emite (y desde qué local): los datos de la razón social y del local de la sucursal que vendió. Vacío = la principal, como siempre.
create function public._emisor_de(p_tipo text, p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_suc bigint; s sucursales; e empresas; r jsonb := '{}';
begin
  v_suc := case p_tipo when 'venta' then (select sucursal_id from ventas where id = p_id)
                       when 'devolucion' then (select v.sucursal_id from devoluciones d join ventas v on v.id = d.venta_id where d.id = p_id) end;
  if v_suc is null then return r; end if;
  select * into s from sucursales where id = v_suc;
  if s.empresa_id is not null then
    select * into e from empresas where id = s.empresa_id;
    r := jsonb_build_object('razon_social', e.razon_social, 'cuit', e.cuit, 'condicion_iva', e.condicion_iva, 'domicilio', e.domicilio_fiscal);
  end if;
  r := r || jsonb_build_object('local', s.domicilio, 'telefono', s.telefono);
  if (select count(*) from sucursales where activa) > 1 then r := r || jsonb_build_object('sucursal', s.nombre); end if;
  return jsonb_strip_nulls(r);
end $$;
revoke execute on function public._emisor_de(text, bigint) from public, anon, authenticated;

-- Administrar las razones sociales adicionales (equipo.administrar)
create function public.guardar_empresa(p_razon_social text, p_cuit text, p_condicion_iva text, p_domicilio text, p_ingresos_brutos text default null, p_inicio_actividades date default null, p_id bigint default null, p_activa boolean default true) returns bigint
language plpgsql security definer set search_path = public as $$
declare c text := regexp_replace(coalesce(p_cuit, ''), '\D', '', 'g'); v_cuit text; v_id bigint;
begin
  if not tiene_permiso('equipo.administrar') then raise exception 'Solo el administrador cambia las razones sociales'; end if;
  if not _cuit_valido(c) then raise exception 'El CUIT no es válido: revisá los 11 números (el último es el dígito verificador)'; end if;
  if coalesce(trim(p_razon_social), '') = '' then raise exception 'Falta la razón social'; end if;
  if p_condicion_iva not in ('Responsable Inscripto', 'Monotributo', 'IVA Exento') then raise exception 'Elegí la categoría frente al IVA'; end if;
  if coalesce(trim(p_domicilio), '') = '' then raise exception 'Falta el domicilio fiscal'; end if;
  v_cuit := substr(c, 1, 2) || '-' || substr(c, 3, 8) || '-' || substr(c, 11, 1);
  if v_cuit = (select cuit from datos_legales) then raise exception 'Ese CUIT es el de la razón social principal (Datos legales)'; end if;
  if p_id is null then
    insert into empresas (razon_social, cuit, condicion_iva, ingresos_brutos, inicio_actividades, domicilio_fiscal) values (trim(p_razon_social), v_cuit, p_condicion_iva, nullif(trim(p_ingresos_brutos), ''), p_inicio_actividades, trim(p_domicilio)) returning id into v_id;
  else
    if not coalesce(p_activa, true) and exists (select 1 from sucursales where empresa_id = p_id and activa) then raise exception 'Hay sucursales que usan esta razón social: pasalas a otra antes de apagarla'; end if;
    update empresas set razon_social = trim(p_razon_social), cuit = v_cuit, condicion_iva = p_condicion_iva, ingresos_brutos = nullif(trim(p_ingresos_brutos), ''), inicio_actividades = p_inicio_actividades,
           domicilio_fiscal = trim(p_domicilio), activa = coalesce(p_activa, true) where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Esa razón social no existe'; end if;
  end if;
  return v_id;
exception when unique_violation then raise exception 'Ya hay una razón social con ese CUIT';
end $$;

-- La sucursal, ahora con su razón social, domicilio y teléfono (cambia la firma: los opcionales llevan valor por defecto)
drop function public.guardar_sucursal(text, bigint, bigint, boolean);
create function public.guardar_sucursal(p_nombre text, p_id bigint default null, p_deposito bigint default null, p_activa boolean default true, p_empresa bigint default null, p_domicilio text default null, p_telefono text default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if not tiene_permiso('equipo.administrar') then raise exception 'Solo el administrador cambia las sucursales'; end if;
  if length(trim(coalesce(p_nombre, ''))) = 0 then raise exception 'Ponele un nombre a la sucursal'; end if;
  if p_empresa is not null and not exists (select 1 from empresas where id = p_empresa and activa) then raise exception 'Esa razón social no existe o está apagada'; end if;
  if p_id is null then
    insert into sucursales (nombre, deposito_id, empresa_id, domicilio, telefono) values (trim(p_nombre), p_deposito, p_empresa, nullif(trim(coalesce(p_domicilio, '')), ''), nullif(trim(coalesce(p_telefono, '')), '')) returning id into v_id;
  else
    if not coalesce(p_activa, true) and (select por_defecto from sucursales where id = p_id) then raise exception 'La sucursal principal no se apaga'; end if;
    if p_empresa is not null and (select por_defecto from sucursales where id = p_id) then raise exception 'La sucursal principal es de la razón social principal'; end if;
    update sucursales set nombre = trim(p_nombre), deposito_id = p_deposito, activa = coalesce(p_activa, true), empresa_id = p_empresa,
           domicilio = nullif(trim(coalesce(p_domicilio, '')), ''), telefono = nullif(trim(coalesce(p_telefono, '')), '') where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Esa sucursal no existe'; end if;
  end if;
  return v_id;
exception when unique_violation then raise exception 'Ya hay una sucursal con ese nombre';
end $$;

-- La venta, con la caja de donde sale
drop function public.registrar_venta(jsonb, jsonb, bigint, numeric, text, bigint, text);
CREATE OR REPLACE FUNCTION public.registrar_venta(p_items jsonb, p_pagos jsonb DEFAULT '[]'::jsonb, p_cliente bigint DEFAULT NULL::bigint, p_descuento numeric DEFAULT 0, p_canal text DEFAULT 'Local'::text, p_deposito bigint DEFAULT NULL::bigint, p_notas text DEFAULT NULL::text, p_caja bigint DEFAULT NULL::bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_items jsonb; v_neto numeric; v_tope numeric;
begin
  -- De qué caja sale la venta (un disparador sobre ventas anota la caja y la sucursal; sin dato, la principal)
  perform set_config('app.caja_id', coalesce(p_caja::text, ''), true);
  if not tiene_permiso('ventas.registrar') then raise exception 'No tenés permiso para registrar ventas'; end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'La venta no tiene productos'; end if;
  if exists (select 1 from jsonb_array_elements(p_items) i where coalesce((i->>'cantidad')::int, 0) <= 0) then raise exception 'Cantidad inválida'; end if;
  -- Sin "Cambiar el precio al vender" se cobra el de lista; con el permiso, el cargado (si no vino, el de lista)
  select coalesce(jsonb_agg(i || jsonb_build_object('precio_unitario',
           case when tiene_permiso('ventas.cambiar_precio') and i ? 'precio_unitario' then (i->>'precio_unitario')::numeric
                else precio_de((i->>'variante_id')::bigint) end)), '[]') into v_items
    from jsonb_array_elements(p_items) i;
  -- Promociones vigentes en el mostrador (la cajera no las elige ni las saca: las aplica la base)
  v_items := _renglones_cotizados(v_items, 'mostrador');
  -- Tope del descuento manual según el rol, sobre lo que queda después de las promociones
  select r.descuento_max_pct into v_tope from perfiles pe join roles r on r.id = pe.rol_id where pe.id = auth.uid() and not r.todos;
  select coalesce(sum((i->>'cantidad')::int * (i->>'precio_unitario')::numeric - (i->>'descuento_promo')::numeric), 0) into v_neto
    from jsonb_array_elements(v_items) i;
  if v_tope is not null and coalesce(p_descuento, 0) > round(v_neto * v_tope / 100, 2) and not public._consumir_autorizacion('descuento', p_descuento) then
    raise exception 'Tu descuento máximo es del % %%: para más, pedíselo a un encargado', trim(to_char(v_tope, 'FM990D##'));
  end if;
  return _registrar_venta(v_items, p_pagos, p_cliente, coalesce(p_descuento, 0), p_canal, p_deposito, p_notas);
end $function$;

CREATE OR REPLACE FUNCTION public._comprobante_json(p_tipo text, p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t configuracion_tienda; l datos_legales; c configuracion_impresion; u impresion_por_usuario; v_doc jsonb; v_fiscal jsonb; v_clave text; o jsonb; v_em jsonb;
begin
  v_doc := case p_tipo when 'venta' then _comprobante_venta(p_id) when 'presupuesto' then _comprobante_presupuesto(p_id) when 'devolucion' then _comprobante_devolucion(p_id) when 'pedido' then _comprobante_pedido(p_id) end;
  if v_doc is null then return null; end if;
  select * into t from configuracion_tienda; select * into l from datos_legales; select * into c from configuracion_impresion;
  v_em := _emisor_de(p_tipo, p_id);   -- la razón social y el local de la sucursal que vendió
  select * into u from impresion_por_usuario where usuario_id = auth.uid();
  v_fiscal := case p_tipo when 'venta' then _factura_fiscal(p_id) || jsonb_build_object('clase', 'factura') when 'devolucion' then _nota_credito_fiscal(p_id) end;
  -- Qué comprobante es, para su formato
  v_clave := case
    when p_tipo = 'venta' and v_fiscal ->> 'estado' = 'autorizada' then 'factura'
    when p_tipo = 'venta' then 'interno'
    when p_tipo = 'devolucion' and v_fiscal ->> 'estado' = 'autorizada' then 'nota_credito'
    else p_tipo end;
  o := coalesce(c.por_tipo -> v_clave, '{}');
  return v_doc || jsonb_build_object(
    'emisor', jsonb_build_object('nombre', t.nombre, 'logo_url', coalesce(t.logo_url, t.icono_url), 'es_icono', t.logo_url is null and t.icono_url is not null,
      'razon_social', coalesce(v_em ->> 'razon_social', l.razon_social), 'cuit', coalesce(v_em ->> 'cuit', l.cuit), 'condicion_iva', coalesce(v_em ->> 'condicion_iva', l.condicion_iva),
      'domicilio', coalesce(v_em ->> 'domicilio', l.domicilio_legal), 'sucursal', v_em ->> 'sucursal', 'telefono', coalesce(v_em ->> 'telefono', l.telefono_contacto), 'email', l.email_contacto, 'local', coalesce(v_em ->> 'local', t.direccion_retiro)),
    'config', jsonb_build_object(
      'clave', v_clave,
      'formato', coalesce(o ->> 'formato', u.comprobante_formato, c.comprobante_formato),
      'logo', coalesce((o ->> 'logo')::boolean, c.comprobante_logo), 'datos_legales', coalesce((o ->> 'datos_legales')::boolean, c.comprobante_datos_legales),
      'qr', coalesce((o ->> 'qr')::boolean, c.comprobante_qr), 'barras', coalesce((o ->> 'barras')::boolean, c.comprobante_codigo_barras),
      'copias', coalesce((o ->> 'copias')::int, u.comprobante_copias, c.comprobante_copias),
      'modo', coalesce(u.modo_impresion, c.modo_impresion), 'configurado', c.comprobante_configurado,
      'letra', coalesce(o ->> 'letra', c.comprobante_letra), 'encabezado', coalesce(o ->> 'encabezado', c.comprobante_encabezado),
      'mostrar_cliente', coalesce((o ->> 'mostrar_cliente')::boolean, c.comprobante_mostrar_cliente),
      'mostrar_vendedor', coalesce((o ->> 'mostrar_vendedor')::boolean, c.comprobante_mostrar_vendedor),
      'mostrar_marca', coalesce((o ->> 'mostrar_marca')::boolean, c.comprobante_mostrar_marca)),
    'leyenda', coalesce(v_doc ->> 'leyenda', o ->> 'leyenda', c.comprobante_leyenda), 'pie', coalesce(o ->> 'pie', v_doc ->> 'pie', c.comprobante_pie),
    'fiscal', v_fiscal);
end $function$;

CREATE OR REPLACE FUNCTION public._factura_crear(p_venta bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v ventas; c configuracion_fiscal; r jsonb; v_letra text; v_imp jsonb; v_pv int; v_id bigint;
begin
  -- Hasta que cada razón social tenga su certificado de ARCA, solo la principal factura por el sistema
  if exists (select 1 from ventas vv join sucursales ss on ss.id = vv.sucursal_id where vv.id = p_venta and ss.empresa_id is not null) then
    raise exception 'La razón social de la sucursal de esta venta todavía no puede facturar por ARCA desde el sistema (falta su certificado). Hacé la factura fuera del sistema o vendé desde una sucursal de la razón social principal.';
  end if;
  select * into c from configuracion_fiscal;
  if not c.activa then raise exception 'La facturación con ARCA no está activa (Integraciones → ARCA)'; end if;
  select * into v from ventas where id = p_venta;
  if not found then raise exception 'Esa venta no existe'; end if;
  if v.anulada_en is not null then raise exception 'La venta está anulada'; end if;
  select id into v_id from facturas where venta_id = p_venta and clase = 'factura' and estado <> 'cancelada';
  if v_id is not null then return v_id; end if;
  r := _factura_receptor(v.cliente_id);
  v_letra := r ->> 'letra';
  if v_letra is null then raise exception 'Falta la categoría de IVA del local (Integraciones → ARCA, paso 1)'; end if;
  select numero into v_pv from puntos_venta_fiscales where ambiente = c.ambiente and por_defecto and activo and not bloqueado and baja is null;
  if v_pv is null then raise exception 'Falta elegir el punto de venta de siempre (Integraciones → ARCA)'; end if;
  v_imp := _factura_importes(p_venta, v_letra);
  if (r ->> 'doc_tipo')::int = 99 and (v_imp ->> 'total')::numeric >= c.umbral_identificacion then
    raise exception 'Para facturar % o más a consumidor final, ARCA pide el DNI: cargalo en la ficha del cliente de esta venta', '$ ' || replace(to_char(c.umbral_identificacion, 'FM999,999,999'), ',', '.');
  end if;
  insert into facturas (ambiente, letra, cbte_tipo, punto_venta, venta_id, cliente_id, receptor, doc_tipo, doc_nro, condicion_iva_receptor, fecha,
                        total, neto, iva, detalle_iva, creada_por)
  values (c.ambiente, v_letra, case v_letra when 'A' then 1 when 'B' then 6 else 11 end, v_pv, p_venta, v.cliente_id, r ->> 'receptor',
          (r ->> 'doc_tipo')::int, r ->> 'doc_nro', (r ->> 'condicion')::int, (now() at time zone 'America/Argentina/Buenos_Aires')::date,
          (v_imp ->> 'total')::numeric, (v_imp ->> 'neto')::numeric, (v_imp ->> 'iva')::numeric, v_imp -> 'detalle', auth.uid())
  returning id into v_id;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.sucursales_estado()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case when not (tiene_permiso('equipo.administrar') or tiene_permiso('tienda.editar')) then null else jsonb_build_object(
    'sucursales', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'nombre', s.nombre, 'activa', s.activa, 'por_defecto', s.por_defecto, 'deposito_id', s.deposito_id,
        'deposito', (select nombre from depositos where id = s.deposito_id), 'mp_sucursal_id', s.mp_sucursal_id, 'empresa_id', s.empresa_id, 'domicilio', s.domicilio, 'telefono', s.telefono,
        'cajas', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.nombre, 'activa', c.activa, 'por_defecto', c.por_defecto, 'mp_caja_id', c.mp_caja_id, 'mp_externo', c.mp_externo,
            'terminal_id', c.terminal_id, 'qr_imagen', c.mp_qr_imagen, 'qr_plantilla', c.mp_qr_plantilla,
            'dispositivos', coalesce((select jsonb_agg(d.nombre order by d.nombre) from dispositivos d where d.caja_id = c.id and d.activo), '[]'::jsonb)) order by c.por_defecto desc, c.nombre)
          from cajas c where c.sucursal_id = s.id), '[]'::jsonb)) order by s.por_defecto desc, s.nombre) from sucursales s), '[]'::jsonb),
    'depositos', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre) order by nombre) from depositos where vendible), '[]'::jsonb),
    'empresas', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'razon_social', e.razon_social, 'cuit', e.cuit, 'condicion_iva', e.condicion_iva, 'ingresos_brutos', e.ingresos_brutos, 'inicio_actividades', e.inicio_actividades, 'domicilio_fiscal', e.domicilio_fiscal, 'activa', e.activa) order by e.razon_social) from empresas e), '[]'::jsonb),
    'principal', (select jsonb_build_object('razon_social', razon_social, 'cuit', cuit) from datos_legales),
    'terminales', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nombre', coalesce(nombre, terminal_id)) order by id) from point_terminales where activa), '[]'::jsonb),
    'dispositivos', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre, 'caja_id', caja_id) order by nombre) from dispositivos where activo), '[]'::jsonb)) end
$function$;

revoke execute on function public.guardar_empresa(text, text, text, text, text, date, bigint, boolean), public.guardar_sucursal(text, bigint, bigint, boolean, bigint, text, text),
  public.registrar_venta(jsonb, jsonb, bigint, numeric, text, bigint, text, bigint) from public, anon;
grant execute on function public.guardar_empresa(text, text, text, text, text, date, bigint, boolean), public.guardar_sucursal(text, bigint, bigint, boolean, bigint, text, text),
  public.registrar_venta(jsonb, jsonb, bigint, numeric, text, bigint, text, bigint) to authenticated;
