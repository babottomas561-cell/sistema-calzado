-- Envíos: la zona y su precio los pone la base, el envío va aparte de los productos, Mercado Pago cobra los dos,
-- el costo real (Uber) se anota una vez como gasto y el Resultado ve lo cobrado por envíos.
begin;
create extension if not exists pgtap with schema extensions;
create schema prueba;
grant usage on schema prueba to anon, authenticated;
create table prueba.llamadas (id serial, ruta text, cuerpo jsonb);
grant all on prueba.llamadas, prueba.llamadas_id_seq to anon, authenticated;
create or replace function public._mp_pedir(p_metodo text, p_ruta text, p_cuerpo jsonb default null, p_idempotencia text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  insert into prueba.llamadas (ruta, cuerpo) values (p_ruta, p_cuerpo);
  return jsonb_build_object('status', 201, 'cuerpo', '{"init_point":"https://mp/pagar"}'::jsonb);
end $$;
create function prueba.como_admin() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) $$;
create function prueba.como_cliente() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true) $$;
create function prueba.variante(p_talle text) returns bigint language sql stable security definer set search_path = public as $$
  select v.id from variantes v join productos p on p.id = v.producto_id join talles t on t.id = v.talle_id join colores c on c.id = v.color_id
   where p.nombre = 'Zapatilla Urbana Classic' and t.nombre = p_talle and c.nombre = 'Negro' $$;
create function prueba.zona(p_nombre text) returns bigint language sql stable security definer set search_path = public as $$ select id from zonas_envio where nombre = p_nombre $$;
create function prueba.medio(p_codigo text) returns bigint language sql stable security definer set search_path = public as $$ select id from medios_pago where codigo = p_codigo $$;
create function prueba.mp() returns void language sql security definer set search_path = public as $$
  update integraciones set mp_access_token = 'APP_USR-prueba', sitio_url = 'https://tienda.test' where unica;
  update configuracion_tienda set mp_modo = 'opcional' where unica $$;
create function prueba.pedido(p_id bigint) returns table (total numeric, envio numeric, tiene_envio boolean) language sql stable security definer set search_path = public as $$
  select p.total, p.costo_envio, exists (select 1 from envios e where e.pedido_id = p.id) from pedidos p where p.id = p_id $$;
create function prueba.gasto_envio(p_pedido bigint) returns table (n int, importe numeric) language sql stable security definer set search_path = public as $$
  select count(*)::int, max(importe) from gastos where referencia = 'envio:' || p_pedido $$;
grant execute on all functions in schema prueba to anon, authenticated;
create table prueba.ids (nombre text primary key, id bigint);
grant all on prueba.ids to anon, authenticated;
select plan(12);

set local role authenticated;
select prueba.como_admin();
insert into zonas_envio (nombre, precio, orden) values ('Centro', 2500, 1), ('Yerba Buena', 4000, 2);
insert into zonas_envio (nombre, precio, orden, activo) values ('Tafí Viejo', 6000, 3, false);
select prueba.mp();

-- ── El cliente elige la zona; el precio lo pone la base ──
select prueba.como_cliente();
select is((select count(*)::int from zonas_envio), 2, 'el cliente ve solo las zonas activas');
select throws_ok($$ select crear_pedido(jsonb_build_array(jsonb_build_object('variante_id', prueba.variante('41'), 'cantidad', 1)), 'envio', 'Laprida 100', prueba.medio('MP')) $$,
  'Elegí la zona de envío');
select throws_ok(format($$ select crear_pedido(jsonb_build_array(jsonb_build_object('variante_id', prueba.variante('41'), 'cantidad', 1)), 'envio', 'Laprida 100', %s, null, null, 'Web', %s) $$,
  prueba.medio('MP'), prueba.zona('Tafí Viejo')), 'Elegí una zona de envío válida');
insert into prueba.ids select 'p', crear_pedido(jsonb_build_array(jsonb_build_object('variante_id', prueba.variante('41'), 'cantidad', 1)),
  'envio', 'Laprida 100', prueba.medio('MP'), null, null, 'Web', (select id from zonas_envio where nombre = 'Yerba Buena'));
select results_eq(format($$ select * from prueba.pedido(%s) $$, (select id from prueba.ids where nombre = 'p')),
  $$ values (79000.00::numeric(12,2), 4000.00::numeric(12,2), true) $$, 'el envío va aparte de los productos ($79.000 + $4.000) y nace su fila');
select lives_ok($$ select crear_pedido(jsonb_build_array(jsonb_build_object('variante_id', prueba.variante('42'), 'cantidad', 1)), 'retiro', null, prueba.medio('EFE')) $$,
  'retirando en el local no se pide zona');

-- ── Mercado Pago cobra los dos ──
select mp_pagar_pedido((select id from prueba.ids where nombre = 'p'));
select results_eq($$ select jsonb_array_length(cuerpo -> 'items'), (cuerpo -> 'items' -> 1 ->> 'unit_price')::numeric from prueba.llamadas where ruta = '/checkout/preferences' $$,
  $$ values (2, 4000::numeric) $$, 'el cobro de Mercado Pago lleva los productos y el envío');

-- ── El costo real (lo que cobró Uber), como gasto ──
select prueba.como_admin();
select registrar_envio((select id from prueba.ids where nombre = 'p'), 'uber', 3800, 'https://uber.com/seguimiento/abc');
select registrar_envio((select id from prueba.ids where nombre = 'p'), 'uber', 4200, 'https://uber.com/seguimiento/abc');
select results_eq(format($$ select * from prueba.gasto_envio(%s) $$, (select id from prueba.ids where nombre = 'p')),
  $$ values (1, 4200.00::numeric(12,2)) $$, 'el costo queda como un solo gasto, corregido');
select is((select seguimiento from envios where pedido_id = (select id from prueba.ids where nombre = 'p')), 'https://uber.com/seguimiento/abc', 'con su seguimiento');
select prueba.como_cliente();
select is((select proveedor from envios where pedido_id = (select id from prueba.ids where nombre = 'p')), 'uber', 'el cliente ve cómo va su envío');
select is((select count(*)::int from pagos_online where pedido_id = (select id from prueba.ids where nombre = 'p')), 0, 'y puede leer los pagos de su pedido (sin error)');
select throws_ok(format($$ select registrar_envio(%s, 'uber', 1) $$, (select id from prueba.ids where nombre = 'p')), 'No tenés permiso para atender pedidos');

-- ── El Resultado ve lo cobrado por envíos ──
select prueba.como_admin();
select cambiar_estado_pedido((select id from prueba.ids where nombre = 'p'), 'entregado');
select is((select sum(cobrado) from v_envios_cobrados), 4000.00::numeric, 'al entregarse, el envío cobrado cuenta en el Resultado');

select * from finish();
rollback;
