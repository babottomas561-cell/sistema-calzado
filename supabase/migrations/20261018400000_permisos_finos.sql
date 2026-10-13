-- Permisos más finos (etapa 3 de docs/CONFIGURACION_Y_PERMISOS.md).
-- Un permiso grueso pasa a ser el PADRE de otros más finos: quien tiene el padre tiene todos sus hijos (así nadie pierde nada), y un rol nuevo
-- puede tener solo algunos hijos. Las vistas, políticas y funciones pasan a pedir el hijo que corresponde a lo que protegen.
--   costos.ver         → costos.ver_precio_compra · costos.ver_ganancia · costos.ver_valor_stock
--   tablas.editar      → tablas.catalogo · tablas.medios_pago · tablas.depositos
--   equipo.administrar → equipo.personas · equipo.roles · equipo.modulos · equipo.cuentas   (integraciones y fiscal siguen con el padre)
alter table public.permisos add column padre text references public.permisos (codigo) on update cascade;
create index on public.permisos (padre);

insert into public.permisos (orden, grupo, codigo, nombre, descripcion, padre) values
  (53, 'Catálogo', 'costos.ver_precio_compra', 'Ver precios de compra', 'El precio de compra de cada artículo y de cada proveedor, y el crédito con proveedores. Incluido en «Ver costos y márgenes».', 'costos.ver'),
  (54, 'Catálogo', 'costos.ver_ganancia', 'Ver la ganancia', 'El costo y la ganancia de cada venta, los fallados dados de baja y el resultado. Incluido en «Ver costos y márgenes».', 'costos.ver'),
  (55, 'Catálogo', 'costos.ver_valor_stock', 'Ver el valor del stock', 'Cuánto vale el stock a costo. Incluido en «Ver costos y márgenes».', 'costos.ver'),
  (94, 'Configuración', 'tablas.catalogo', 'Rubros, marcas, colores y talles', 'Las tablas del catálogo. Incluido en «Tablas».', 'tablas.editar'),
  (95, 'Configuración', 'tablas.medios_pago', 'Medios de pago', 'Descuentos y recargos por medio de pago. Incluido en «Tablas».', 'tablas.editar'),
  (96, 'Configuración', 'tablas.depositos', 'Depósitos', 'Los depósitos y cuáles venden. Incluido en «Tablas».', 'tablas.editar'),
  (97, 'Configuración', 'equipo.personas', 'Personas del equipo', 'Sumar o quitar personas y cambiarles el rol. Incluido en «Equipo y permisos».', 'equipo.administrar'),
  (98, 'Configuración', 'equipo.roles', 'Roles y permisos', 'Crear roles y elegir sus permisos. Incluido en «Equipo y permisos».', 'equipo.administrar'),
  (99, 'Configuración', 'equipo.modulos', 'Módulos del sistema', 'Encender o apagar partes del sistema. Incluido en «Equipo y permisos».', 'equipo.administrar'),
  (100, 'Configuración', 'equipo.cuentas', 'Cuentas e invitaciones', 'Quién puede registrarse, qué datos pide y las invitaciones. Incluido en «Equipo y permisos».', 'equipo.administrar');

-- tiene_permiso: el permiso, o su padre
create or replace function public.tiene_permiso(p_permiso text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles pe join roles r on r.id = pe.rol_id
                  where pe.id = auth.uid() and pe.rol = 'staff' and r.activo
                    and (r.todos or p_permiso = any (r.permisos)
                         or exists (select 1 from permisos pm where pm.codigo = p_permiso and pm.padre = any (r.permisos))));
$$;
-- mi_equipo: los permisos EFECTIVOS (los del rol más los hijos de cada padre que tenga), para armar el menú y las pantallas
create or replace function public.mi_equipo() returns table (rol text, permisos text[], descuento_max_pct numeric)
language sql stable security definer set search_path = public as $$
  select r.nombre,
         case when r.todos then (select array_agg(codigo order by orden) from permisos)
              else r.permisos || coalesce((select array_agg(pm.codigo) from permisos pm where pm.padre = any (r.permisos) and not pm.codigo = any (r.permisos)), '{}') end,
         r.descuento_max_pct
    from perfiles pe join roles r on r.id = pe.rol_id
   where pe.id = auth.uid() and pe.rol = 'staff' and r.activo;
$$;

-- ── Reescritura controlada: cada objeto pide el permiso fino que corresponde ──
create function pg_temp.en_funcion(p_nombre text, p_viejo text, p_nuevo text) returns void language plpgsql as $$
declare v_def text; v_oid oid;
begin
  select oid into v_oid from pg_proc where proname = p_nombre and pronamespace = 'public'::regnamespace;
  if v_oid is null then raise exception 'No existe la función %', p_nombre; end if;
  v_def := pg_get_functiondef(v_oid);
  if position('''' || p_viejo || '''' in v_def) = 0 then raise exception 'La función % no usa %', p_nombre, p_viejo; end if;
  execute replace(v_def, '''' || p_viejo || '''', '''' || p_nuevo || '''');
end $$;
create function pg_temp.en_politica(p_tabla text, p_politica text, p_viejo text, p_nuevo text) returns void language plpgsql as $$
declare r record; v_q text; v_c text;
begin
  select * into r from pg_policies where schemaname = 'public' and tablename = p_tabla and policyname = p_politica;
  if r.policyname is null then raise exception 'No existe la política % de %', p_politica, p_tabla; end if;
  v_q := replace(r.qual, '''' || p_viejo || '''', '''' || p_nuevo || '''');
  v_c := replace(r.with_check, '''' || p_viejo || '''', '''' || p_nuevo || '''');
  if v_q is not distinct from r.qual and v_c is not distinct from r.with_check then raise exception 'La política % de % no usa %', p_politica, p_tabla, p_viejo; end if;
  execute format('alter policy %I on public.%I %s %s', p_politica, p_tabla,
                 case when v_q is not null then 'using (' || v_q || ')' else '' end, case when v_c is not null then 'with check (' || v_c || ')' else '' end);
end $$;
create function pg_temp.en_vista(p_vista text, p_desde text, p_hasta text) returns void language plpgsql as $$
declare v_def text;
begin
  v_def := pg_get_viewdef(('public.' || p_vista)::regclass);
  if position(p_desde in v_def) = 0 then raise exception 'La vista % no tiene %', p_vista, p_desde; end if;
  execute format('create or replace view public.%I as %s', p_vista, rtrim(replace(v_def, p_desde, p_hasta), '; '||chr(10)));
end $$;

-- Costos
select pg_temp.en_vista('v_stock', 'tiene_permiso(''costos.ver''::text) THEN p.precio_compra', 'tiene_permiso(''costos.ver_precio_compra''::text) THEN p.precio_compra');
select pg_temp.en_vista('v_stock', 'tiene_permiso(''costos.ver''::text)', 'tiene_permiso(''costos.ver_valor_stock''::text)');
select pg_temp.en_vista('v_hechos_ventas', 'tiene_permiso(''costos.ver''::text)', 'tiene_permiso(''costos.ver_ganancia''::text)');
select pg_temp.en_vista('v_venta_items', 'tiene_permiso(''costos.ver''::text)', 'tiene_permiso(''costos.ver_ganancia''::text)');
select pg_temp.en_vista('v_fallados', 'tiene_permiso(''costos.ver''::text)', 'tiene_permiso(''costos.ver_ganancia''::text)');
select pg_temp.en_vista('v_perdidas_fallados', 'tiene_permiso(''costos.ver''::text)', 'tiene_permiso(''costos.ver_ganancia''::text)');
select pg_temp.en_vista('v_credito_proveedores', 'tiene_permiso(''costos.ver''::text)', 'tiene_permiso(''costos.ver_precio_compra''::text)');
select pg_temp.en_politica('productos', 've costos', 'costos.ver', 'costos.ver_precio_compra');
select pg_temp.en_politica('proveedores', 'compras ve', 'costos.ver', 'costos.ver_precio_compra');
select pg_temp.en_politica('producto_proveedores', 've costos', 'costos.ver', 'costos.ver_precio_compra');
select pg_temp.en_politica('producto_proveedores', 'gestiona proveedores', 'costos.ver', 'costos.ver_precio_compra');
select pg_temp.en_politica('venta_items', 've costos', 'costos.ver', 'costos.ver_ganancia');
select pg_temp.en_politica('ajustes_precios', 've ajustes', 'costos.ver', 'costos.ver_precio_compra');
select pg_temp.en_politica('fallados', 've fallados con costos', 'costos.ver', 'costos.ver_ganancia');
select pg_temp.en_politica('creditos_proveedor', 've creditos de proveedores', 'costos.ver', 'costos.ver_precio_compra');
select pg_temp.en_funcion('ajustar_precios', 'costos.ver', 'costos.ver_precio_compra');
select pg_temp.en_funcion('deshacer_ajuste_precios', 'costos.ver', 'costos.ver_precio_compra');
select pg_temp.en_funcion('reposicion_sugerida', 'costos.ver', 'costos.ver_precio_compra');
select pg_temp.en_funcion('ajustar_credito_proveedor', 'costos.ver', 'costos.ver_precio_compra');
-- Tablas
select pg_temp.en_politica(t, 'tablas', 'tablas.editar', 'tablas.catalogo') from unnest(array['marcas', 'categorias', 'subcategorias', 'talles', 'colores']) t;
select pg_temp.en_politica('depositos', 'tablas', 'tablas.editar', 'tablas.depositos');
select pg_temp.en_politica('medios_pago', 'tablas', 'tablas.editar', 'tablas.medios_pago');
-- Equipo
select pg_temp.en_funcion(f, 'equipo.administrar', 'equipo.personas') from unnest(array['asignar_rol', 'quitar_del_equipo', 'equipo']) f;
select pg_temp.en_funcion('configurar_modulos', 'equipo.administrar', 'equipo.modulos');
select pg_temp.en_funcion(f, 'equipo.administrar', 'equipo.cuentas') from unnest(array['crear_invitacion', 'anular_invitacion', 'cuentas_aplicar']) f;
select pg_temp.en_politica('roles', 'administra', 'equipo.administrar', 'equipo.roles');
select pg_temp.en_politica('configuracion_cuentas', 'administrador edita', 'equipo.administrar', 'equipo.cuentas');
select pg_temp.en_politica('invitaciones_cuenta', 'administrador ve invitaciones', 'equipo.administrar', 'equipo.cuentas');
