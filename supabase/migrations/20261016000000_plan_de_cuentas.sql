-- Plan de cuentas, fase A: el plan (modelo editable e importable) y qué cuenta usa cada cosa. Todavía no hay asientos (fase B).
-- Diseño completo: docs/PLAN_DE_CUENTAS.md.
--
--   · `cuentas`: códigos NUMÉRICOS DE LARGO FIJO, como en Infomanager (1101001 = Caja). El formato (cuántos niveles y cuántos dígitos tiene
--     cada uno) es configurable: `configuracion_contable.mascara`, de fábrica {1,1,2,3} → 1 · 1 · 01 · 001. El padre y el tipo los deduce la base del
--     código (1101001 → 1101000 → 1100000 → 1000000); solo las imputables (hojas) reciben movimientos. `clave` identifica las cuentas que usa el sistema (caja, mercaderías, IVA…): se pueden renombrar o recodificar sin romper nada.
--   · Asignaciones: cada artículo, rubro, línea, medio de pago, proveedor, concepto de compra y categoría de gasto puede tener su cuenta.
--     Se busca de lo particular a lo general (artículo → rubro → línea → la general). Lo que cae en la general lo muestra «Qué falta asignar».

insert into public.permisos (orden, grupo, codigo, nombre, descripcion) values
  (63, 'Informes', 'contabilidad.ver', 'Ver la contabilidad', 'Plan de cuentas, libro diario, mayor y balance'),
  (64, 'Informes', 'contabilidad.configurar', 'Configurar la contabilidad', 'Editar el plan de cuentas, las asignaciones, la apertura y el cierre');
update public.roles set permisos = permisos || '{contabilidad.ver}' where nombre = 'Encargado' and not ('contabilidad.ver' = any (permisos));

-- ── Configuración contable (una fila) ───────────────────────────────────
create table public.configuracion_contable (
  unica            boolean primary key default true check (unica),
  mascara          int[] not null default '{1,1,2,3}'
                   check (array_length(mascara, 1) between 2 and 8 and 0 < all (mascara) and 12 >= all (mascara)),   -- dígitos de cada nivel
  inicio           date,                                   -- desde cuándo se registran asientos (fase B, con el asiento de apertura)
  cierre_mes       int not null default 12 check (cierre_mes between 1 and 12),
  cierre_dia       int not null default 31 check (cierre_dia between 1 and 31),
  actualizado_en   timestamptz not null default now(),
  actualizado_por  uuid references auth.users (id) on delete set null
);
create index configuracion_contable_actualizado_por_idx on public.configuracion_contable (actualizado_por);
insert into public.configuracion_contable (unica) values (true);
alter table public.configuracion_contable enable row level security;
create policy "ve la configuracion contable" on public.configuracion_contable for select to authenticated using (tiene_permiso('contabilidad.ver') or tiene_permiso('contabilidad.configurar'));

-- ── El plan ──────────────────────────────────────────────────────────────
create table public.cuentas (
  id         bigint generated always as identity primary key,
  codigo     text not null check (codigo ~ '^[0-9]+$'),
  nombre     text not null check (char_length(trim(nombre)) between 2 and 80),
  tipo       text not null check (tipo in ('activo', 'pasivo', 'patrimonio', 'ingreso', 'costo', 'gasto')),
  padre_id   bigint references public.cuentas (id) on delete restrict,   -- una cuenta con subcuentas no se borra
  imputable  boolean not null default true,                              -- recibe movimientos (las hojas); las otras agrupan
  activa     boolean not null default true,
  clave      text unique,                                                 -- las que usa el sistema: caja, mercaderias, iva_credito…
  creado_en  timestamptz not null default now()
);
create unique index cuentas_codigo_key on public.cuentas (codigo);
create index cuentas_padre_id_idx on public.cuentas (padre_id);

-- Nivel de un código según la máscara (el último tramo que no es todo ceros) y el código de su padre (ese tramo en ceros)
create function public._cuenta_nivel(p_codigo text) returns int
language plpgsql stable set search_path = public as $$
declare m int[] := (select mascara from configuracion_contable); v_pos int := 1; v_nivel int := 0; i int;
begin
  for i in 1..array_length(m, 1) loop
    if substr(p_codigo, v_pos, m[i]) ~ '[1-9]' then v_nivel := i; end if;
    v_pos := v_pos + m[i];
  end loop;
  return v_nivel;
end $$;
create function public._cuenta_padre(p_codigo text) returns text
language plpgsql stable set search_path = public as $$
declare m int[] := (select mascara from configuracion_contable); n int := _cuenta_nivel(p_codigo); v_inicio int := 1; i int;
begin
  if n <= 1 then return null; end if;
  for i in 1..n - 1 loop v_inicio := v_inicio + m[i]; end loop;
  return overlay(p_codigo placing repeat('0', m[n]) from v_inicio for m[n]);
end $$;
-- Lo que identifica a una cuenta y a todas las que cuelgan de ella: los dígitos hasta su nivel (1101000 → 1101)
create function public._cuenta_prefijo(p_codigo text) returns text
language plpgsql stable set search_path = public as $$
declare m int[] := (select mascara from configuracion_contable); n int := _cuenta_nivel(p_codigo); v_largo int := 0; i int;
begin
  for i in 1..n loop v_largo := v_largo + m[i]; end loop;
  return left(p_codigo, v_largo);
end $$;

create function public._cuenta_valida() returns trigger
language plpgsql set search_path = public as $$
declare v_padre cuentas; v_largo int := (select sum(x) from unnest((select mascara from configuracion_contable)) x); v_codigo_padre text;
begin
  new.nombre := trim(new.nombre);
  new.codigo := trim(new.codigo);
  if length(new.codigo) <> v_largo then raise exception 'El código tiene que tener % números (el formato de este plan)', v_largo; end if;
  if _cuenta_nivel(new.codigo) = 0 then raise exception 'El código no puede ser todo ceros'; end if;
  v_codigo_padre := _cuenta_padre(new.codigo);
  if v_codigo_padre is null then
    new.padre_id := null;
  else
    select * into v_padre from cuentas where codigo = v_codigo_padre;
    if not found then raise exception 'Falta la cuenta % (la que agrupa a %)', v_codigo_padre, new.codigo; end if;
    if v_padre.imputable then raise exception 'La cuenta % % recibe movimientos: para ponerle subcuentas, marcala primero como agrupadora', v_padre.codigo, v_padre.nombre; end if;
    new.padre_id := v_padre.id;
    new.tipo := v_padre.tipo;
  end if;
  if tg_op = 'UPDATE' and new.imputable and not old.imputable and exists (select 1 from cuentas where padre_id = new.id) then
    raise exception 'La cuenta % tiene subcuentas: no puede recibir movimientos', new.codigo;
  end if;
  if tg_op = 'UPDATE' and new.codigo <> old.codigo and exists (select 1 from cuentas where padre_id = new.id) then
    raise exception 'La cuenta % tiene subcuentas: no se le puede cambiar el código', old.codigo;
  end if;
  return new;
end $$;
create trigger cuenta_valida before insert or update on public.cuentas for each row execute function public._cuenta_valida();

alter table public.cuentas enable row level security;
create policy "ve el plan de cuentas" on public.cuentas for select to authenticated using (tiene_permiso('contabilidad.ver') or tiene_permiso('contabilidad.configurar'));

-- ── El plan modelo (local de ropa) ──────────────────────────────────────
insert into public.cuentas (codigo, nombre, tipo, imputable, clave) values
  ('1000000', 'Activo', 'activo', false, null),
  ('1100000', 'Activo corriente', 'activo', false, null),
  ('1101000', 'Disponibilidades', 'activo', false, null),
  ('1101001', 'Caja (efectivo)', 'activo', true, 'caja'),
  ('1101002', 'Bancos', 'activo', true, 'bancos'),
  ('1101003', 'Mercado Pago', 'activo', true, 'mercado_pago'),
  ('1102000', 'Créditos', 'activo', false, null),
  ('1102001', 'Tarjetas a cobrar', 'activo', true, 'tarjetas_cobrar'),
  ('1102002', 'Deudores por ventas', 'activo', true, 'deudores_ventas'),
  ('1102003', 'Crédito con proveedores', 'activo', true, 'credito_proveedores'),
  ('1103000', 'Bienes de cambio', 'activo', false, null),
  ('1103001', 'Mercaderías', 'activo', true, 'mercaderias'),
  ('1104000', 'Créditos fiscales', 'activo', false, null),
  ('1104001', 'IVA crédito fiscal', 'activo', true, 'iva_credito'),
  ('1104002', 'Percepciones sufridas', 'activo', true, 'percepciones'),
  ('1200000', 'Activo no corriente', 'activo', false, null),
  ('1201000', 'Bienes de uso', 'activo', false, null),
  ('1201001', 'Muebles y equipos', 'activo', true, 'bienes_uso'),
  ('2000000', 'Pasivo', 'pasivo', false, null),
  ('2100000', 'Pasivo corriente', 'pasivo', false, null),
  ('2101000', 'Deudas comerciales', 'pasivo', false, null),
  ('2101001', 'Proveedores', 'pasivo', true, 'proveedores'),
  ('2102000', 'Deudas fiscales', 'pasivo', false, null),
  ('2102001', 'IVA débito fiscal', 'pasivo', true, 'iva_debito'),
  ('2102002', 'Impuestos a pagar', 'pasivo', true, 'impuestos_pagar'),
  ('2103000', 'Deudas sociales', 'pasivo', false, null),
  ('2103001', 'Sueldos y cargas a pagar', 'pasivo', true, 'sueldos_pagar'),
  ('2104000', 'Otras deudas', 'pasivo', false, null),
  ('2104001', 'Saldos a favor de clientes', 'pasivo', true, 'saldos_clientes'),
  ('2104002', 'Cobros anticipados de pedidos web', 'pasivo', true, 'cobros_anticipados'),
  ('3000000', 'Patrimonio neto', 'patrimonio', false, null),
  ('3100000', 'Patrimonio', 'patrimonio', false, null),
  ('3101000', 'Capital y resultados', 'patrimonio', false, null),
  ('3101001', 'Capital', 'patrimonio', true, 'capital'),
  ('3101002', 'Resultados acumulados', 'patrimonio', true, 'resultados_acumulados'),
  ('3101003', 'Resultado del ejercicio', 'patrimonio', true, 'resultado_ejercicio'),
  ('4000000', 'Ingresos', 'ingreso', false, null),
  ('4100000', 'Ventas', 'ingreso', false, null),
  ('4101000', 'Ventas de mercadería', 'ingreso', false, null),
  ('4101001', 'Ventas de ropa', 'ingreso', true, 'ventas_ropa'),
  ('4101002', 'Ventas de calzado', 'ingreso', true, 'ventas_calzado'),
  ('4101003', 'Ventas de accesorios', 'ingreso', true, 'ventas_accesorios'),
  ('4101009', 'Otras ventas', 'ingreso', true, 'ventas_generales'),
  ('4102000', 'Otros ingresos por ventas', 'ingreso', false, null),
  ('4102001', 'Envíos cobrados', 'ingreso', true, 'envios_cobrados'),
  ('4102002', 'Descuentos y redondeos otorgados', 'ingreso', true, 'descuentos_otorgados'),
  ('5000000', 'Costos', 'costo', false, null),
  ('5100000', 'Costo de ventas', 'costo', false, null),
  ('5101000', 'Costo de mercadería vendida', 'costo', false, null),
  ('5101001', 'Costo de ropa vendida', 'costo', true, 'costo_ropa'),
  ('5101002', 'Costo de calzado vendido', 'costo', true, 'costo_calzado'),
  ('5101003', 'Costo de accesorios vendidos', 'costo', true, 'costo_accesorios'),
  ('5101009', 'Otros costos de venta', 'costo', true, 'costo_general'),
  ('5102000', 'Pérdidas de mercadería', 'costo', false, null),
  ('5102001', 'Mercadería fallada dada de baja', 'costo', true, 'fallados_baja'),
  ('5102002', 'Diferencias de inventario', 'costo', true, 'diferencias_inventario'),
  ('6000000', 'Gastos', 'gasto', false, null),
  ('6100000', 'Gastos de comercialización y administración', 'gasto', false, null),
  ('6101000', 'Gastos del local', 'gasto', false, null),
  ('6101001', 'Alquiler y servicios', 'gasto', true, 'gasto_alquiler'),
  ('6101002', 'Sueldos y cargas', 'gasto', true, 'gasto_sueldos'),
  ('6101003', 'Publicidad', 'gasto', true, 'gasto_publicidad'),
  ('6101004', 'Comisiones y bancos', 'gasto', true, 'gasto_comisiones'),
  ('6101005', 'Impuestos y tasas', 'gasto', true, 'gasto_impuestos'),
  ('6101006', 'Envíos', 'gasto', true, 'gasto_envios'),
  ('6101007', 'Insumos (bolsas, etiquetas)', 'gasto', true, 'gasto_insumos'),
  ('6101008', 'Servicios digitales', 'gasto', true, 'gasto_digitales'),
  ('6101009', 'Otros gastos', 'gasto', true, 'gasto_general');

create function public._cuenta(p_clave text) returns bigint language sql stable security definer set search_path = public as $$ select id from cuentas where clave = p_clave $$;

-- ── Asignaciones ────────────────────────────────────────────────────────
-- Por línea (Ropa, Calzado, Accesorios): ventas y costo
create table public.cuentas_por_linea (
  linea            text primary key check (linea in ('Calzado', 'Ropa', 'Accesorios')),
  cuenta_venta_id  bigint not null references public.cuentas (id) on delete restrict,
  cuenta_costo_id  bigint not null references public.cuentas (id) on delete restrict
);
create index cuentas_por_linea_venta_idx on public.cuentas_por_linea (cuenta_venta_id);
create index cuentas_por_linea_costo_idx on public.cuentas_por_linea (cuenta_costo_id);
insert into public.cuentas_por_linea values
  ('Ropa', _cuenta('ventas_ropa'), _cuenta('costo_ropa')),
  ('Calzado', _cuenta('ventas_calzado'), _cuenta('costo_calzado')),
  ('Accesorios', _cuenta('ventas_accesorios'), _cuenta('costo_accesorios'));
alter table public.cuentas_por_linea enable row level security;
create policy "ve las cuentas por linea" on public.cuentas_por_linea for select to authenticated using (tiene_permiso('contabilidad.ver') or tiene_permiso('contabilidad.configurar'));

-- Por rubro y por artículo (opcionales: si están vacías, la del grupo de arriba)
alter table public.categorias add column cuenta_venta_id bigint references public.cuentas (id) on delete restrict,
                              add column cuenta_costo_id bigint references public.cuentas (id) on delete restrict;
create index categorias_cuenta_venta_idx on public.categorias (cuenta_venta_id);
create index categorias_cuenta_costo_idx on public.categorias (cuenta_costo_id);
alter table public.productos add column cuenta_venta_id bigint references public.cuentas (id) on delete restrict,
                             add column cuenta_costo_id bigint references public.cuentas (id) on delete restrict;
create index productos_cuenta_venta_idx on public.productos (cuenta_venta_id);
create index productos_cuenta_costo_idx on public.productos (cuenta_costo_id);

-- Medios de pago: a qué cuenta entra la plata (de fábrica, según el tipo)
alter table public.medios_pago add column cuenta_id bigint references public.cuentas (id) on delete restrict;
create index medios_pago_cuenta_idx on public.medios_pago (cuenta_id);
update public.medios_pago set cuenta_id = case
  when es_saldo then _cuenta('saldos_clientes')
  when tipo = 'Efectivo' then _cuenta('caja')
  when tipo = 'Transferencia' then _cuenta('bancos')
  when tipo in ('Débito', 'Crédito') then _cuenta('tarjetas_cobrar')
  when tipo = 'Billetera' then _cuenta('mercado_pago') end;

-- Un medio de pago nuevo nace con la cuenta que corresponde a su tipo (después se puede cambiar en Contabilidad → Asignaciones)
create function public._medio_pago_cuenta() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.cuenta_id is null then
    new.cuenta_id := case when new.es_saldo then _cuenta('saldos_clientes') when new.tipo = 'Efectivo' then _cuenta('caja')
      when new.tipo = 'Transferencia' then _cuenta('bancos') when new.tipo in ('Débito', 'Crédito') then _cuenta('tarjetas_cobrar')
      when new.tipo = 'Billetera' then _cuenta('mercado_pago') end;
  end if;
  return new;
end $$;
create trigger medio_pago_cuenta before insert on public.medios_pago for each row execute function public._medio_pago_cuenta();

-- Proveedores: su cuenta de deuda (vacía = Proveedores)
alter table public.proveedores add column cuenta_id bigint references public.cuentas (id) on delete restrict;
create index proveedores_cuenta_idx on public.proveedores (cuenta_id);

-- Categorías de gasto
alter table public.gasto_categorias add column cuenta_id bigint references public.cuentas (id) on delete restrict;
create index gasto_categorias_cuenta_idx on public.gasto_categorias (cuenta_id);
update public.gasto_categorias set cuenta_id = case lower(nombre)
  when 'alquiler y servicios' then _cuenta('gasto_alquiler') when 'sueldos' then _cuenta('gasto_sueldos')
  when 'publicidad' then _cuenta('gasto_publicidad') when 'comisiones y bancos' then _cuenta('gasto_comisiones')
  when 'impuestos' then _cuenta('gasto_impuestos') when 'envíos' then _cuenta('gasto_envios') when 'insumos' then _cuenta('gasto_insumos')
  when 'servicios digitales' then _cuenta('gasto_digitales') when 'whatsapp (meta)' then _cuenta('gasto_digitales')
  when 'inteligencia artificial' then _cuenta('gasto_digitales') when 'otros' then _cuenta('gasto_general') end;

-- Conceptos de compra (lo que se compra además de mercadería)
create table public.conceptos_compra (
  id             bigint generated always as identity primary key,
  nombre         text not null check (char_length(trim(nombre)) between 2 and 60),
  cuenta_id      bigint not null references public.cuentas (id) on delete restrict,
  es_mercaderia  boolean not null default false,   -- la que suma stock (una sola)
  activo         boolean not null default true,
  orden          int not null default 0
);
create unique index conceptos_compra_nombre_key on public.conceptos_compra (lower(nombre));
create unique index conceptos_compra_mercaderia_key on public.conceptos_compra (es_mercaderia) where es_mercaderia;
create index conceptos_compra_cuenta_idx on public.conceptos_compra (cuenta_id);
insert into public.conceptos_compra (orden, nombre, cuenta_id, es_mercaderia) values
  (10, 'Mercadería', _cuenta('mercaderias'), true),
  (20, 'Insumos (bolsas, etiquetas)', _cuenta('gasto_insumos'), false),
  (30, 'Servicios', _cuenta('gasto_alquiler'), false),
  (40, 'Muebles y equipos', _cuenta('bienes_uso'), false),
  (90, 'Otros', _cuenta('gasto_general'), false);
alter table public.conceptos_compra enable row level security;
create policy "ve los conceptos de compra" on public.conceptos_compra for select to authenticated using (es_staff());

-- ── Qué cuenta usa cada cosa (lo que van a usar los asientos de la fase B) ──
create function public.cuenta_venta_de(p_producto bigint) returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(p.cuenta_venta_id, c.cuenta_venta_id, l.cuenta_venta_id, _cuenta('ventas_generales'))
    from productos p left join categorias c on c.id = p.categoria_id left join cuentas_por_linea l on l.linea = c.linea where p.id = p_producto
$$;
create function public.cuenta_costo_de(p_producto bigint) returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(p.cuenta_costo_id, c.cuenta_costo_id, l.cuenta_costo_id, _cuenta('costo_general'))
    from productos p left join categorias c on c.id = p.categoria_id left join cuentas_por_linea l on l.linea = c.linea where p.id = p_producto
$$;

-- Lo que cae en una cuenta general (o no tiene cuenta): para que el contador lo revise
create view public.v_cuentas_sin_asignar with (security_invoker = false) as
select * from (
select 'medio'::text as que, m.id::text as id, m.nombre, 'Sin cuenta: el cobro no tiene a dónde ir'::text as detalle
  from medios_pago m where m.activo and m.cuenta_id is null
union all
select 'gasto', g.id::text, g.nombre, 'Va a «Otros gastos»' from gasto_categorias g where g.cuenta_id is null
union all
select 'rubro', c.id::text, c.nombre, 'Su línea no tiene cuentas: va a «Otras ventas»'
  from categorias c left join cuentas_por_linea l on l.linea = c.linea where c.cuenta_venta_id is null and l.linea is null
union all
select 'concepto', k.id::text, k.nombre, 'Su cuenta está desactivada' from conceptos_compra k join cuentas q on q.id = k.cuenta_id where k.activo and not q.activa
) x where tiene_permiso('contabilidad.ver') or tiene_permiso('contabilidad.configurar');

-- ── Editar (solo «Configurar la contabilidad») ──────────────────────────
create function public.guardar_cuenta(p_id bigint, p_codigo text, p_nombre text, p_tipo text, p_imputable boolean, p_activa boolean) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint := p_id;
begin
  if not tiene_permiso('contabilidad.configurar') then raise exception 'No tenés permiso para cambiar el plan de cuentas'; end if;
  if p_id is null then
    insert into cuentas (codigo, nombre, tipo, imputable, activa) values (trim(p_codigo), p_nombre, coalesce(p_tipo, 'activo'), p_imputable, p_activa) returning id into v_id;
  else
    if not p_activa and exists (select 1 from cuentas c where c.id = p_id and c.clave is not null) then
      raise exception 'Esa cuenta la usa el sistema: se puede renombrar, pero no desactivar';
    end if;
    update cuentas set codigo = trim(p_codigo), nombre = p_nombre, tipo = coalesce(p_tipo, tipo), imputable = p_imputable, activa = p_activa where id = p_id;
  end if;
  return v_id;
end $$;

create function public.borrar_cuenta(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tiene_permiso('contabilidad.configurar') then raise exception 'No tenés permiso para cambiar el plan de cuentas'; end if;
  if exists (select 1 from cuentas where id = p_id and clave is not null) then raise exception 'Esa cuenta la usa el sistema: no se puede borrar'; end if;
  delete from cuentas where id = p_id;
exception when foreign_key_violation then
  raise exception 'La cuenta tiene subcuentas o está asignada a algo: desactivala o reasigná primero';
end $$;

-- Importar un plan (de la planilla del contador): agrega o actualiza por código, de los más cortos a los más largos. No borra nada.
create function public.importar_plan_cuentas(p_filas jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare f jsonb; v_n int := 0; v_tipo text; v_codigo text;
begin
  if not tiene_permiso('contabilidad.configurar') then raise exception 'No tenés permiso para cambiar el plan de cuentas'; end if;
  for f in select x from jsonb_array_elements(p_filas) x order by _cuenta_nivel(regexp_replace(x ->> 'codigo', '\D', '', 'g')), x ->> 'codigo' loop
    v_codigo := regexp_replace(f ->> 'codigo', '\D', '', 'g');
    v_tipo := case lower(left(coalesce(f ->> 'tipo', ''), 3)) when 'act' then 'activo' when 'pas' then 'pasivo' when 'pat' then 'patrimonio'
      when 'ing' then 'ingreso' when 'cos' then 'costo' when 'gas' then 'gasto'
      else case left(v_codigo, 1) when '1' then 'activo' when '2' then 'pasivo' when '3' then 'patrimonio' when '4' then 'ingreso' when '5' then 'costo' else 'gasto' end end;
    -- Agrupa si en la planilla tiene subcuentas; si no, recibe movimientos
    insert into cuentas (codigo, nombre, tipo, imputable)
    values (v_codigo, f ->> 'nombre', v_tipo,
            not exists (select 1 from jsonb_array_elements(p_filas) y
                         where regexp_replace(y ->> 'codigo', '\D', '', 'g') <> v_codigo
                           and regexp_replace(y ->> 'codigo', '\D', '', 'g') like _cuenta_prefijo(v_codigo) || '%'))
    on conflict (codigo) do update set nombre = excluded.nombre;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Cambiar el formato de los códigos: solo si todos los que hay entran en el nuevo (mismo largo y mismos padres)
create function public.cambiar_mascara_cuentas(p_mascara int[]) returns void
language plpgsql security definer set search_path = public as $$
declare v_viejo int[] := (select mascara from configuracion_contable); c cuentas;
begin
  if not tiene_permiso('contabilidad.configurar') then raise exception 'No tenés permiso para cambiar el plan de cuentas'; end if;
  if array_length(p_mascara, 1) not between 2 and 8 or not (0 < all (p_mascara)) then raise exception 'Formato inválido: entre 2 y 8 niveles, cada uno con 1 o más números'; end if;
  update configuracion_contable set mascara = p_mascara, actualizado_en = now(), actualizado_por = auth.uid() where unica;
  for c in select * from cuentas loop
    if length(c.codigo) <> (select sum(x) from unnest(p_mascara) x) or _cuenta_padre(c.codigo) is distinct from (select codigo from cuentas where id = c.padre_id) then
      raise exception 'La cuenta % no entra en ese formato: los códigos que ya hay no se pueden reacomodar solos', c.codigo;
    end if;
  end loop;
end $$;

-- Asignar una cuenta (p_cuenta null = volver a la del grupo). Controla que el tipo de cuenta tenga sentido para lo que se asigna.
create function public.asignar_cuenta(p_que text, p_id text, p_campo text, p_cuenta bigint) returns void
language plpgsql security definer set search_path = public as $$
declare c cuentas; v_tipos text[];
begin
  if not tiene_permiso('contabilidad.configurar') then raise exception 'No tenés permiso para cambiar las cuentas'; end if;
  v_tipos := case
    when p_campo = 'venta' then '{ingreso}' when p_campo = 'costo' then '{costo}'
    when p_que = 'medio' then '{activo,pasivo}' when p_que = 'proveedor' then '{pasivo}' when p_que = 'gasto' then '{gasto,costo}'
    when p_que = 'concepto' then '{activo,gasto,costo}' end;
  if v_tipos is null then raise exception 'Asignación desconocida'; end if;
  if p_cuenta is not null then
    select * into c from cuentas where id = p_cuenta;
    if not found or not c.imputable or not c.activa then raise exception 'Elegí una cuenta activa que reciba movimientos'; end if;
    if not (c.tipo = any (v_tipos)) then raise exception 'La cuenta % es de %: acá va una de %', c.codigo, c.tipo, array_to_string(v_tipos, ' o '); end if;
  end if;
  case p_que
    when 'linea' then
      if p_cuenta is null then raise exception 'Cada línea tiene que tener su cuenta'; end if;
      if p_campo = 'venta' then update cuentas_por_linea set cuenta_venta_id = p_cuenta where linea = p_id;
      else update cuentas_por_linea set cuenta_costo_id = p_cuenta where linea = p_id; end if;
    when 'rubro' then
      if p_campo = 'venta' then update categorias set cuenta_venta_id = p_cuenta where id = p_id::bigint;
      else update categorias set cuenta_costo_id = p_cuenta where id = p_id::bigint; end if;
    when 'producto' then
      if p_campo = 'venta' then update productos set cuenta_venta_id = p_cuenta where id = p_id::bigint;
      else update productos set cuenta_costo_id = p_cuenta where id = p_id::bigint; end if;
    when 'medio' then update medios_pago set cuenta_id = p_cuenta where id = p_id::bigint;
    when 'proveedor' then update proveedores set cuenta_id = p_cuenta where id = p_id::bigint;
    when 'gasto' then update gasto_categorias set cuenta_id = p_cuenta where id = p_id::bigint;
    when 'concepto' then
      if p_cuenta is null then raise exception 'Cada concepto tiene que tener su cuenta'; end if;
      update conceptos_compra set cuenta_id = p_cuenta where id = p_id::bigint;
  end case;
end $$;

revoke execute on function public._cuenta(text), public._cuenta_valida(), public._medio_pago_cuenta(), public._cuenta_nivel(text), public._cuenta_padre(text), public._cuenta_prefijo(text) from public, anon, authenticated;
revoke execute on function public.cuenta_venta_de(bigint), public.cuenta_costo_de(bigint), public.guardar_cuenta(bigint, text, text, text, boolean, boolean),
  public.borrar_cuenta(bigint), public.importar_plan_cuentas(jsonb), public.asignar_cuenta(text, text, text, bigint), public.cambiar_mascara_cuentas(int[]) from public, anon;
grant execute on function public.cuenta_venta_de(bigint), public.cuenta_costo_de(bigint), public.guardar_cuenta(bigint, text, text, text, boolean, boolean),
  public.borrar_cuenta(bigint), public.importar_plan_cuentas(jsonb), public.asignar_cuenta(text, text, text, bigint), public.cambiar_mascara_cuentas(int[]) to authenticated;
