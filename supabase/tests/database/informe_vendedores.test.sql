-- Informe por vendedor: cuenta ventas y descuentos de cada persona (sin anuladas), las autorizaciones con PIN, y solo lo ve quien tiene informes de ventas.
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
create function prueba.nombre(p_id uuid) returns text language sql stable security definer set search_path = public as $$ select coalesce(nombre, 'Sin registrar') from perfiles where id = p_id $$;
grant execute on all functions in schema prueba to anon, authenticated;
create table prueba.ids (nombre text primary key, id bigint);
grant all on prueba.ids to anon, authenticated;
select plan(9);

select is(has_function_privilege('anon', 'public.informe_vendedores(date,date)', 'execute'), false, 'anónimo no ejecuta el informe');
set local role authenticated;
select prueba.como('11111111-1111-1111-1111-111111111111');
create temp table antes on commit drop as
  select coalesce((select ventas from informe_vendedores(current_date - 1, current_date + 1) where vendedor_id = '11111111-1111-1111-1111-111111111111'), 0) as ventas,
         coalesce((select descuento_manual from informe_vendedores(current_date - 1, current_date + 1) where vendedor_id = '11111111-1111-1111-1111-111111111111'), 0) as descuento,
         coalesce((select anuladas from informe_vendedores(current_date - 1, current_date + 1) where vendedor_id = '11111111-1111-1111-1111-111111111111'), 0) as anuladas;
grant all on antes to authenticated;
-- El administrador vende dos veces: una sin descuento y otra con $ 5.000 de descuento; y una tercera que anula
insert into prueba.ids select 'a', registrar_venta(jsonb_build_array(jsonb_build_object('variante_id', prueba.variante('40', 'Negro'), 'cantidad', 1)),
  jsonb_build_array(jsonb_build_object('medio_pago_id', prueba.medio('EFE'))));
insert into prueba.ids select 'b', registrar_venta(jsonb_build_array(jsonb_build_object('variante_id', prueba.variante('41', 'Negro'), 'cantidad', 2)),
  jsonb_build_array(jsonb_build_object('medio_pago_id', prueba.medio('EFE'))), null, 5000);
insert into prueba.ids select 'c', registrar_venta(jsonb_build_array(jsonb_build_object('variante_id', prueba.variante('42', 'Negro'), 'cantidad', 1)),
  jsonb_build_array(jsonb_build_object('medio_pago_id', prueba.medio('EFE'))), null, 3000);
select anular_venta((select id from prueba.ids where nombre = 'c'), 'error_carga');

select is((select ventas from informe_vendedores(current_date - 1, current_date + 1) where vendedor_id = '11111111-1111-1111-1111-111111111111'), (select ventas + 2 from antes), 'cuenta sus ventas (sin la anulada)');
select is((select descuento_manual from informe_vendedores(current_date - 1, current_date + 1) where vendedor_id = '11111111-1111-1111-1111-111111111111'), (select descuento + 5000 from antes), 'suma el descuento manual de las ventas que cuentan');
select is((select anuladas from informe_vendedores(current_date - 1, current_date + 1) where vendedor_id = '11111111-1111-1111-1111-111111111111'), (select anuladas + 1 from antes), 'cuenta las anuladas aparte');
select is((select descuento_max_pct > 0 from informe_vendedores(current_date - 1, current_date + 1) where vendedor_id = '11111111-1111-1111-1111-111111111111'), true, 'y el mayor descuento en %');
select is((select nombre from informe_vendedores(current_date - 1, current_date + 1) where vendedor_id = '11111111-1111-1111-1111-111111111111'), prueba.nombre('11111111-1111-1111-1111-111111111111'), 'con el nombre de la persona');
reset role;   -- una autorización con PIN ya usada (como la deja registrar_venta)
insert into autorizaciones (para_usuario, autoriza_id, tipo, monto, ok, vence_en, usada_en)
  values ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'descuento', 1000, true, now(), now());
set local role authenticated;
select prueba.como('11111111-1111-1111-1111-111111111111');
select is((select con_pin from informe_vendedores(current_date - 1, current_date + 1) where vendedor_id = '11111111-1111-1111-1111-111111111111') >= 1, true, 'cuenta los descuentos autorizados con PIN');
select throws_ok($$ select * from informe_vendedores(current_date, current_date - 3) $$, 'Período inválido', 'un período al revés se rechaza');
-- La vendedora no lo ve
select prueba.como('33333333-3333-3333-3333-333333333333');
select throws_ok($$ select * from informe_vendedores(current_date - 30, current_date) $$, 'No tenés permiso para ver el informe de vendedores', 'el Vendedor no ve lo que venden los demás');
select * from finish();
rollback;
