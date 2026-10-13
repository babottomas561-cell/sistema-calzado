-- PIN de encargado: autoriza un descuento sobre el tope una sola vez, vence, se bloquea con intentos fallidos y queda en la bitácora.
begin;
create extension if not exists pgtap with schema extensions;
create schema prueba;
grant usage on schema prueba to anon, authenticated;
create function prueba.variante(p_talle text, p_color text) returns bigint language sql stable security definer set search_path = public as $$
  select v.id from variantes v join productos p on p.id = v.producto_id join talles t on t.id = v.talle_id join colores c on c.id = v.color_id
   where p.nombre = 'Zapatilla Urbana Classic' and t.nombre = p_talle and c.nombre = p_color $$;
create function prueba.medio(p_codigo text) returns bigint language sql stable security definer set search_path = public as $$ select id from medios_pago where codigo = p_codigo $$;
create function prueba.como_admin() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) $$;
create function prueba.como_vendedor() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true) $$;
-- Vence la autorización vigente (corre como la base)
create function prueba.vencer() returns void language sql security definer set search_path = public as $$ update autorizaciones set vence_en = now() - interval '1 minute' where ok and usada_en is null $$;
grant execute on all functions in schema prueba to anon, authenticated;
select plan(14);
set local role authenticated;

select prueba.como_admin();
select lives_ok($$ select cambiar_mi_pin('4821') $$, 'el Administrador (autoriza por ser «todos») pone su PIN');
select is(tengo_pin(), true, 'y la base sabe que lo tiene');
select throws_ok($$ select cambiar_mi_pin('12') $$, 'El PIN son de 4 a 8 números', 'el PIN son números, de 4 a 8');
select is((select count(*)::int from pines_autorizacion), 0, 'nadie puede leer los PIN, ni el Administrador');

select prueba.como_vendedor();
select throws_ok($$ select cambiar_mi_pin('1111') $$, 'No tenés permiso para autorizar excepciones', 'el Vendedor no tiene PIN de autorización');
select throws_like($$ select registrar_venta(jsonb_build_array(jsonb_build_object('variante_id', prueba.variante('40', 'Negro'), 'cantidad', 1)),
  jsonb_build_array(jsonb_build_object('medio_pago_id', prueba.medio('EFE'))), null, 20000) $$, 'Tu descuento máximo es del 10 %%', 'sin autorización no pasa el tope');
select is(autorizar_descuento('0000', 20000)->>'ok', 'false', 'un PIN equivocado no autoriza');
select is(autorizar_descuento('4821', 20000)->>'ok', 'true', 'el PIN del encargado sí');
select lives_ok($$ select registrar_venta(jsonb_build_array(jsonb_build_object('variante_id', prueba.variante('40', 'Negro'), 'cantidad', 1)),
  jsonb_build_array(jsonb_build_object('medio_pago_id', prueba.medio('EFE'))), null, 20000) $$, 'y entonces la venta pasa');
select throws_like($$ select registrar_venta(jsonb_build_array(jsonb_build_object('variante_id', prueba.variante('40', 'Negro'), 'cantidad', 1)),
  jsonb_build_array(jsonb_build_object('medio_pago_id', prueba.medio('EFE'))), null, 20000) $$, 'Tu descuento máximo es del 10 %%', 'la autorización sirve una sola vez');

-- Vencimiento
select autorizar_descuento('4821', 20000);
select prueba.vencer();
select throws_like($$ select registrar_venta(jsonb_build_array(jsonb_build_object('variante_id', prueba.variante('41', 'Negro'), 'cantidad', 1)),
  jsonb_build_array(jsonb_build_object('medio_pago_id', prueba.medio('EFE'))), null, 20000) $$, 'Tu descuento máximo es del 10 %%', 'vencida (10 minutos), no sirve');

-- Un monto mayor al autorizado no pasa
select autorizar_descuento('4821', 15000);
select throws_like($$ select registrar_venta(jsonb_build_array(jsonb_build_object('variante_id', prueba.variante('41', 'Negro'), 'cantidad', 1)),
  jsonb_build_array(jsonb_build_object('medio_pago_id', prueba.medio('EFE'))), null, 20000) $$, 'Tu descuento máximo es del 10 %%', 'no alcanza para un descuento mayor al autorizado');

-- Intentos: 5 fallidos bloquean
select autorizar_descuento('1', 5000); select autorizar_descuento('2', 5000); select autorizar_descuento('3', 5000); select autorizar_descuento('4', 5000);
select is(autorizar_descuento('4821', 5000)->>'error', 'Demasiados intentos: esperá unos minutos', 'tras varios PIN mal puestos se bloquea (aunque el último sea el bueno)');

select prueba.como_admin();
select is((select count(*)::int from bitacora where entidad = 'autorización' and detalle like '%autorizó con su PIN un descuento%'), 1, 'la autorización usada queda en la bitácora');
select * from finish();
rollback;
