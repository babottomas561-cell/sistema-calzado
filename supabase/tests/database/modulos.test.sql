-- Módulos: apagar bloquea de verdad (la base frena las altas), respeta fijos, dependencias y datos vigentes, y queda quién lo hizo.
begin;
create extension if not exists pgtap with schema extensions;
create schema prueba;
grant usage on schema prueba to anon, authenticated;
create function prueba.como_admin() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) $$;
create function prueba.como_cliente() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true) $$;
create function prueba.como_vendedor() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true) $$;
create function prueba.variante(p_talle text, p_color text) returns bigint language sql stable security definer set search_path = public as $$
  select v.id from variantes v join productos p on p.id = v.producto_id join talles t on t.id = v.talle_id join colores c on c.id = v.color_id
   where p.nombre = 'Zapatilla Urbana Classic' and t.nombre = p_talle and c.nombre = p_color $$;
grant execute on all functions in schema prueba to anon, authenticated;
select plan(15);
set local role authenticated;
select prueba.como_admin();

select is((select count(*)::int from modulos where not activo), 0, 'de fábrica está todo encendido');
select throws_like($$ select configurar_modulos(array['ventas']) $$, '%base del sistema%', 'lo fijo no se apaga');
select throws_like($$ select configurar_modulos(array['no_existe']) $$, '%no existe%', 'una clave inventada se rechaza');
select throws_like($$ select configurar_modulos(array['tienda']) $$, 'Para apagar «Tienda online» también hay que apagar «%', 'no deja un dependiente encendido');
select throws_like($$ select configurar_modulos(array['tienda', 'pedidos', 'arrepentimientos']) $$, 'No se puede apagar «Pedidos»: hay % pedidos sin terminar%', 'con pedidos sin terminar no se apaga');
reset role;
update pedidos set estado = 'cancelado', motivo_cancelacion = 'otro', cancelado_por = 'local' where estado not in ('entregado', 'cancelado');
set local role authenticated;
select prueba.como_admin();
select lives_ok($$ select configurar_modulos(array['tienda', 'pedidos', 'arrepentimientos']) $$, 'con sus dependientes y sin pendientes, sí');
select is((select cambiado_por from modulos where clave = 'tienda'), '11111111-1111-1111-1111-111111111111'::uuid, 'queda quién lo apagó');

-- Bloqueo en la base: con pedidos apagados no entra un pedido
select prueba.como_cliente();
select throws_like($$ select crear_pedido(jsonb_build_array(jsonb_build_object('variante_id', prueba.variante('40', 'Negro'), 'cantidad', 1)), p_entrega => 'retiro', p_medio_pago => (select id from medios_pago where codigo = 'EFE')) $$,
  'La parte «Pedidos» no está activa%', 'la base frena un pedido nuevo');
select prueba.como_admin();
select is(_modulo_activo('pedidos'), false, '_modulo_activo lo dice');
select is(_modulo_activo('algo_de_otra_version'), true, 'una clave desconocida cuenta como encendida');

-- Volver a prender
select lives_ok($$ select configurar_modulos('{}') $$, 'se vuelve a encender todo');
select is((select count(*)::int from modulos where not activo), 0, 'y no se perdió nada');

-- Datos vigentes impiden apagar
select lives_ok($$ select configurar_modulos(array['fallados']) $$, 'sin fallados pendientes se apaga');
select lives_ok($$ select configurar_modulos('{}') $$, 'y se vuelve a prender');
select prueba.como_vendedor();
select throws_ok($$ select configurar_modulos('{}') $$, 'No tenés permiso para configurar los módulos', 'el Vendedor no puede');
select * from finish();
rollback;
