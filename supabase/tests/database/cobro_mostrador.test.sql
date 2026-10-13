-- Cobro en el mostrador: redondeo del efectivo (hacia abajo, con tope, solo efectivo) y que todo siga cuadrando.
begin;
create extension if not exists pgtap with schema extensions;
create schema prueba;
grant usage on schema prueba to authenticated;
create function prueba.como_admin() returns void language sql as $$ select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) $$;
create function prueba.variante() returns bigint language sql stable security definer set search_path = public as $$
  select variante_id from v_stock where disponible >= 3 and precio_venta > 0 order by disponible desc, variante_id limit 1 $$;
create function prueba.medio(p_codigo text) returns bigint language sql stable security definer set search_path = public as $$ select id from medios_pago where codigo = p_codigo $$;
create function prueba.pago(p_venta bigint) returns pagos language sql stable security definer set search_path = public as $$ select * from pagos where venta_id = p_venta order by id limit 1 $$;
create function prueba.venta(p_venta bigint) returns ventas language sql stable security definer set search_path = public as $$ select * from ventas where id = p_venta $$;
create table prueba.ids (nombre text primary key, id bigint);
grant all on prueba.ids to authenticated;
grant execute on all functions in schema prueba to authenticated;
select plan(11);

set local role authenticated;
select prueba.como_admin();
select ajustar_stock(prueba.variante(), 20, 'Inventario para la prueba');

-- Una unidad en efectivo (−10 %), redondeando $ 37 hacia abajo
insert into prueba.ids select 'v', registrar_venta(jsonb_build_array(jsonb_build_object('variante_id', prueba.variante(), 'cantidad', 1)),
  jsonb_build_array(jsonb_build_object('medio_pago_id', prueba.medio('EFE'), 'redondeo', 37)));
select is((prueba.pago((select id from prueba.ids where nombre = 'v'))).redondeo, 37.00::numeric, 'el redondeo queda anotado en el pago');
select is((prueba.pago((select id from prueba.ids where nombre = 'v'))).monto,
          (prueba.pago((select id from prueba.ids where nombre = 'v'))).base + round((prueba.pago((select id from prueba.ids where nombre = 'v'))).base * -10 / 100.0, 2) - 37,
          'lo que entra a caja es lo del medio menos el redondeo');
select is((prueba.venta((select id from prueba.ids where nombre = 'v'))).total, (prueba.pago((select id from prueba.ids where nombre = 'v'))).monto, 'el total de la venta es lo cobrado');
select ok(comprobante_de('venta', (select id from prueba.ids where nombre = 'v'), false) -> 'totales' @> '[{"rotulo": "Redondeo", "monto": -37}]', 'el comprobante muestra el redondeo aparte');
select ok(comprobante_de('venta', (select id from prueba.ids where nombre = 'v'), false) -> 'totales' @> '[{"rotulo": "Descuento por medio de pago"}]', 'y el descuento del efectivo sin el redondeo');

-- Solo efectivo, solo hacia abajo y con tope
select throws_ok($$ select registrar_venta(jsonb_build_array(jsonb_build_object('variante_id', prueba.variante(), 'cantidad', 1)),
  jsonb_build_array(jsonb_build_object('medio_pago_id', prueba.medio('DEB'), 'redondeo', 10))) $$, 'Solo se puede redondear lo que se paga en efectivo', 'con débito no se redondea');
select throws_ok($$ select registrar_venta(jsonb_build_array(jsonb_build_object('variante_id', prueba.variante(), 'cantidad', 1)),
  jsonb_build_array(jsonb_build_object('medio_pago_id', prueba.medio('EFE'), 'redondeo', -10))) $$, 'El redondeo no puede ser negativo', 'no se redondea para arriba');
select throws_like($$ select registrar_venta(jsonb_build_array(jsonb_build_object('variante_id', prueba.variante(), 'cantidad', 1)),
  jsonb_build_array(jsonb_build_object('medio_pago_id', prueba.medio('EFE'), 'redondeo', 1001))) $$, 'El redondeo es demasiado grande%', 'nunca más de $ 1.000');

-- Pago dividido: la parte en efectivo se redondea, la de tarjeta no
insert into prueba.ids select 'd', registrar_venta(jsonb_build_array(jsonb_build_object('variante_id', prueba.variante(), 'cantidad', 2)),
  jsonb_build_array(jsonb_build_object('medio_pago_id', prueba.medio('DEB'), 'base', 10000), jsonb_build_object('medio_pago_id', prueba.medio('EFE'), 'redondeo', 5)));
select is((select sum(monto) from pagos where venta_id = (select id from prueba.ids where nombre = 'd')), (prueba.venta((select id from prueba.ids where nombre = 'd'))).total, 'pagado en dos medios, cuadra con el total');
select is((select sum(redondeo) from pagos where venta_id = (select id from prueba.ids where nombre = 'd')), 5.00::numeric, 'y solo se redondeó el efectivo');

-- Sin redondeo, todo como antes
insert into prueba.ids select 's', registrar_venta(jsonb_build_array(jsonb_build_object('variante_id', prueba.variante(), 'cantidad', 1)),
  jsonb_build_array(jsonb_build_object('medio_pago_id', prueba.medio('CRE'))));
select is((prueba.pago((select id from prueba.ids where nombre = 's'))).redondeo, 0.00::numeric, 'sin pedirlo, no hay redondeo');

select * from finish();
rollback;
