-- Bitácora: registra los cambios de configuración y permisos, nunca guarda una clave, no se edita ni se borra y solo la ve quien tiene permiso.
begin;
create extension if not exists pgtap with schema extensions;
create schema prueba;
grant usage on schema prueba to anon, authenticated;
create function prueba.como_admin() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) $$;
create function prueba.como_vendedor() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true) $$;
create function prueba.variante(p_talle text, p_color text) returns bigint language sql stable security definer set search_path = public as $$
  select v.id from variantes v join productos p on p.id = v.producto_id join talles t on t.id = v.talle_id join colores c on c.id = v.color_id
   where p.nombre = 'Zapatilla Urbana Classic' and t.nombre = p_talle and c.nombre = p_color $$;
create function prueba.medio(p_codigo text) returns bigint language sql stable security definer set search_path = public as $$ select id from medios_pago where codigo = p_codigo $$;
grant execute on all functions in schema prueba to anon, authenticated;
create table prueba.ids (nombre text primary key, id bigint);
grant all on prueba.ids to anon, authenticated;
select plan(14);
set local role authenticated;
select prueba.como_admin();

-- Un rol: cambio de tope de descuento
update roles set descuento_max_pct = 12 where nombre = 'Vendedor';
select is((select count(*)::int from bitacora where entidad = 'rol' and accion = 'cambiar' and detalle like '%Vendedor%descuento_max_pct%'), 1, 'registra el cambio de un rol');
select is((select despues->>'descuento_max_pct' from bitacora where entidad = 'rol' order by id desc limit 1), '12.00', 'con el valor nuevo');
select is((select usuario_nombre from bitacora where entidad = 'rol' order by id desc limit 1) <> '', true, 'y quién lo hizo');

-- Un módulo
select configurar_modulos(array['etiquetas']);
select is((select count(*)::int from bitacora where entidad = 'módulo' and detalle like '%Etiquetas%' and despues = '{"activo": false}'), 1, 'registra que se apagó un módulo (sin el ruido de cambiado_en)');
select configurar_modulos('{}');

-- Una integración: solo qué cambió, nunca el valor
reset role;   -- esa tabla la escribe solo guardar_integraciones() (security definer): acá, como la base
update integraciones set gemini_api_key = 'clave-super-secreta-123', smtp_clave = 'otra-clave';
set local role authenticated;
select prueba.como_admin();
select is((select count(*)::int from bitacora where entidad = 'integración' and (despues::text like '%secreta%' or antes::text like '%secreta%' or despues::text like '%otra-clave%')), 0, 'nunca guarda una clave');
select is((select count(*)::int from bitacora where entidad = 'integración' and detalle like '%gemini_api_key%'), 1, 'pero sí que cambió ese campo');

-- Una venta anulada
insert into prueba.ids select 'v1', registrar_venta(jsonb_build_array(jsonb_build_object('variante_id', prueba.variante('40', 'Negro'), 'cantidad', 1)),
  jsonb_build_array(jsonb_build_object('medio_pago_id', prueba.medio('EFE'))));
select anular_venta((select id from prueba.ids where nombre = 'v1'), 'error_carga');
select is((select count(*)::int from bitacora where accion = 'anular' and entidad_id = (select id::text from prueba.ids where nombre = 'v1')), 1, 'registra una anulación');

-- La base no deja tocarla
with cambio as (update bitacora set detalle = 'otra cosa' returning 1) select is((select count(*)::int from cambio), 0, 'ni el Administrador la edita (no hay política)');
reset role;   -- ni siquiera la base: lo frena el trigger
select throws_ok($$ update bitacora set detalle = 'otra cosa' $$, 'La bitácora no se edita ni se borra', 'el trigger frena editar');
select throws_ok($$ delete from bitacora $$, 'La bitácora no se edita ni se borra', 'y borrar');
set local role authenticated;
select prueba.como_admin();
select throws_ok($$ truncate bitacora $$, null, 'no se vacía');
select throws_ok($$ insert into bitacora (usuario_nombre, modulo, accion, entidad, detalle) values ('yo', 'x', 'crear', 'y', 'z') $$, null, 'nadie escribe a mano: solo las funciones');

-- Quién la ve
select is((select count(*) > 0 from bitacora), true, 'el Administrador la ve');
select prueba.como_vendedor();
select is((select count(*)::int from bitacora), 0, 'el Vendedor no');
select * from finish();
rollback;
