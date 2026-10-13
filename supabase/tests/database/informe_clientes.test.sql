-- El informe de clientes agrega actividad sin ampliar los permisos de ningún rol: cuenta lo cobrado por cliente, sin anuladas ni ventas sin cliente.
begin;
create extension if not exists pgtap with schema extensions;
create schema prueba;
grant usage on schema prueba to anon, authenticated;
create function prueba.como(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_id, 'role', 'authenticated')::text, true) $$;
create function prueba.variante(p_talle text, p_color text) returns bigint language sql stable security definer set search_path = public as $$
  select v.id from variantes v join productos p on p.id = v.producto_id join talles t on t.id = v.talle_id join colores c on c.id = v.color_id
   where p.nombre = 'Zapatilla Urbana Classic' and t.nombre = p_talle and c.nombre = p_color $$;
create function prueba.medio(p_codigo text) returns bigint language sql stable security definer set search_path = public as $$ select id from medios_pago where codigo = p_codigo $$;
create function prueba.cliente(p_nombre text) returns bigint language sql stable security definer set search_path = public as $$ select id from clientes where nombre = p_nombre $$;
-- Le da a la vendedora de prueba un rol con solo estos permisos (corre como la base)
create function prueba.rol_con(p_permisos text[]) returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from roles where nombre = 'Prueba informe') then update roles set permisos = p_permisos where nombre = 'Prueba informe';
  else insert into roles (nombre, permisos) values ('Prueba informe', p_permisos); end if;
  update perfiles set rol_id = (select id from roles where nombre = 'Prueba informe') where id = '33333333-3333-3333-3333-333333333333';
end $$;
grant execute on all functions in schema prueba to anon, authenticated;
create table prueba.ids (nombre text primary key, id bigint);
grant all on prueba.ids to anon, authenticated;

select plan(10);
select is(has_function_privilege('anon', 'public.informe_clientes(date,date)', 'execute'), false, 'anónimo no ejecuta el informe');
select is((select 'informes.ventas' = any (permisos) from roles where nombre = 'Vendedor'), false, 'el Vendedor no gana informes de ventas');
set local role authenticated;
select prueba.como('11111111-1111-1111-1111-111111111111');

create temp table antes on commit drop as
  select coalesce((select compras_periodo from informe_clientes(current_date - 1, current_date + 1) where nombre = 'María González'), 0) as compras,
         coalesce((select unidades_periodo from informe_clientes(current_date - 1, current_date + 1) where nombre = 'María González'), 0) as unidades,
         (select count(*) from informe_clientes(current_date - 1, current_date + 1)) as filas;
grant all on antes to authenticated;
-- Dos ventas a María (una se anula), una sin cliente
insert into prueba.ids select 'v1', registrar_venta(jsonb_build_array(jsonb_build_object('variante_id', prueba.variante('40', 'Negro'), 'cantidad', 2)),
  jsonb_build_array(jsonb_build_object('medio_pago_id', prueba.medio('EFE'))), prueba.cliente('María González'));
insert into prueba.ids select 'v2', registrar_venta(jsonb_build_array(jsonb_build_object('variante_id', prueba.variante('41', 'Negro'), 'cantidad', 1)),
  jsonb_build_array(jsonb_build_object('medio_pago_id', prueba.medio('EFE'))), prueba.cliente('María González'));
insert into prueba.ids select 'v3', registrar_venta(jsonb_build_array(jsonb_build_object('variante_id', prueba.variante('42', 'Negro'), 'cantidad', 1)),
  jsonb_build_array(jsonb_build_object('medio_pago_id', prueba.medio('EFE'))));
select anular_venta((select id from prueba.ids where nombre = 'v2'), 'error_carga');

select is((select compras_periodo from informe_clientes(current_date - 1, current_date + 1) where nombre = 'María González'), (select compras + 1 from antes), 'cuenta las compras del cliente (la anulada no)');
select is((select unidades_periodo from informe_clientes(current_date - 1, current_date + 1) where nombre = 'María González'), (select unidades + 2 from antes), 'y sus unidades');
select is((select count(*) from informe_clientes(current_date - 1, current_date + 1)), (select filas from antes), 'la venta sin cliente no suma filas ni clientes');
select is((select vendido_periodo from informe_clientes(current_date - 1, current_date + 1) where nombre = 'María González') >= (select total from ventas where id = (select id from prueba.ids where nombre = 'v1')), true, 'lo cobrado incluye el total de la venta');
select is((select compras_periodo from informe_clientes(current_date - 400, current_date - 390) where nombre = 'María González'), 0::bigint, 'fuera del período no tiene compras');
select is((select compras_total > 0 from informe_clientes(current_date - 400, current_date - 390) where nombre = 'María González'), true, 'pero sigue en el historial (sirve para «volver a contactar»)');
select throws_ok($$ select * from informe_clientes(current_date, current_date - 5) $$, 'Período inválido', 'un período al revés se rechaza');

-- Hacen falta los dos permisos
select prueba.rol_con(array['informes.ventas', 'stock.ver']);
select prueba.como('33333333-3333-3333-3333-333333333333');
select throws_ok($$ select * from informe_clientes(current_date - 30, current_date) $$, 'No tenés permiso para ver el informe de clientes', 'con solo «informes de ventas» no alcanza');
select * from finish();
rollback;
