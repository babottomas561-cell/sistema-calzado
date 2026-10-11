-- Pedidos web: reserva de stock, precios que pone la base, entrega (→ venta) y cancelación.
begin;
-- ── Ayudas de prueba (viven solo dentro de esta transacción) ──
-- security definer: leen todo aunque la prueba esté actuando como un cliente sin permisos
create extension if not exists pgtap with schema extensions;
create schema prueba;
grant usage on schema prueba to anon, authenticated;
-- id de la variante modelo + talle + color
create function prueba.variante(p_modelo text, p_talle text, p_color text) returns bigint language sql stable security definer set search_path = public as $$
  select v.id from variantes v join productos p on p.id = v.producto_id join talles t on t.id = v.talle_id join colores c on c.id = v.color_id
   where p.nombre = p_modelo and t.nombre = p_talle and c.nombre = p_color $$;
create function prueba.stock(p_variante bigint) returns int language sql stable security definer set search_path = public as $$ select cantidad from stock where variante_id = p_variante $$;
create function prueba.reservado(p_variante bigint) returns int language sql stable security definer set search_path = public as $$ select reservado from stock where variante_id = p_variante $$;
create function prueba.medio(p_codigo text) returns bigint language sql stable security definer set search_path = public as $$ select id from medios_pago where codigo = p_codigo $$;
-- Actuar como el equipo o como el cliente de prueba (los usuarios que crea seed.sql)
create function prueba.como_equipo() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) $$;
create function prueba.como_cliente() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true) $$;
grant execute on all functions in schema prueba to anon, authenticated;
-- Para guardar ids entre pasos
create table prueba.ids (nombre text primary key, id bigint);
grant all on prueba.ids to anon, authenticated;
select plan(18);

insert into prueba.ids values ('urbana40n', prueba.variante('Zapatilla Urbana Classic', '40', 'Negro')),
                              ('escolar', (select min(v.id) from variantes v join productos p on p.id = v.producto_id where p.nombre = 'Zapatilla Escolar'));

-- ── Como el cliente de la tienda ──
set local role authenticated;
select prueba.como_cliente();

-- Manda un precio trucho ($1): la base lo ignora y usa el de lista
insert into prueba.ids select 'p1', crear_pedido(
  format('[{"variante_id": %s, "cantidad": 2, "precio_unitario": 1}]', (select id from prueba.ids where nombre = 'urbana40n'))::jsonb,
  'retiro', null, prueba.medio('EFE'));
select is((select precio_unitario from pedido_items where pedido_id = (select id from prueba.ids where nombre = 'p1')), 79000.00::numeric(12,2), 'el precio lo pone la base, no el navegador');
select results_eq($$ select subtotal, ajuste_pct, ajuste_medio_pago, total, estado, canal from pedidos where id = (select id from prueba.ids where nombre = 'p1') $$,
  $$ values (158000.00::numeric(12,2), -10.00::numeric(5,2), -15800.00::numeric(12,2), 142200.00::numeric(12,2), 'pendiente'::text, 'Web'::text) $$, 'total con el % del medio, estado pendiente, canal Web');
select is(prueba.reservado((select id from prueba.ids where nombre = 'urbana40n')), 2, 'reserva los 2 pares');
select is(prueba.stock((select id from prueba.ids where nombre = 'urbana40n')), 3, 'pero todavía no los descuenta');
select is((select disponible from v_catalogo where variante_id = (select id from prueba.ids where nombre = 'urbana40n')), 1, 'la tienda ya muestra 1 disponible');

select throws_ok(format($$ select crear_pedido('[{"variante_id": %s, "cantidad": 1}]', 'retiro', null, %s) $$, (select id from prueba.ids where nombre = 'urbana40n'), prueba.medio('DEB')),
  'Elegí un medio de pago válido');
select throws_ok(format($$ select crear_pedido('[{"variante_id": %s, "cantidad": 1}]', 'envio', ' ', %s) $$, (select id from prueba.ids where nombre = 'urbana40n'), prueba.medio('EFE')),
  'Falta la dirección de envío');
select throws_ok(format($$ select crear_pedido('[{"variante_id": %s, "cantidad": 1}]', 'retiro', null, %s) $$, (select id from prueba.ids where nombre = 'escolar'), prueba.medio('EFE')),
  'Uno de los productos ya no está disponible');
select throws_like(format($$ select crear_pedido('[{"variante_id": %s, "cantidad": 2}]', 'retiro', null, %s) $$, (select id from prueba.ids where nombre = 'urbana40n'), prueba.medio('EFE')),
  'No hay stock suficiente%', 'no reserva más de lo disponible');
select throws_ok(format($$ select cambiar_estado_pedido(%s, 'entregado') $$, (select id from prueba.ids where nombre = 'p1')),
  'Solo el equipo puede cambiar el estado de un pedido');

-- Otro pedido del cliente, para cancelarlo
insert into prueba.ids select 'p2', crear_pedido(format('[{"variante_id": %s, "cantidad": 1}]', (select id from prueba.ids where nombre = 'urbana40n'))::jsonb, 'retiro', null, prueba.medio('MP'));

-- ── Como el equipo ──
select prueba.como_equipo();
-- El dueño sube el descuento del efectivo al 20 % DESPUÉS del pedido: al cliente se le respeta el 10 % prometido
update medios_pago set ajuste_pct = -20 where codigo = 'EFE';
select cambiar_estado_pedido((select id from prueba.ids where nombre = 'p1'), 'confirmado');
insert into prueba.ids select 'venta', cambiar_estado_pedido((select id from prueba.ids where nombre = 'p1'), 'entregado', 'Retiró en el local');

select is((select total from ventas where id = (select id from prueba.ids where nombre = 'venta')), 142200.00::numeric(12,2), 'al entregar se cobra el % prometido, no el nuevo');
select is((select pedido_id from ventas where id = (select id from prueba.ids where nombre = 'venta')), (select id from prueba.ids where nombre = 'p1'), 'la venta queda ligada al pedido');
select is(prueba.stock((select id from prueba.ids where nombre = 'urbana40n')), 1, 'al entregar descuenta el stock');
select is(prueba.reservado((select id from prueba.ids where nombre = 'urbana40n')), 1, 'y libera su reserva (queda la del otro pedido)');
select is((select array_agg(estado order by id) from pedido_estados where pedido_id = (select id from prueba.ids where nombre = 'p1')),
  array['pendiente', 'confirmado', 'entregado'], 'queda el historial de estados');
select throws_ok(format($$ select cambiar_estado_pedido(%s, 'cancelado') $$, (select id from prueba.ids where nombre = 'p1')), 'El pedido ya está entregado');

select cambiar_estado_pedido((select id from prueba.ids where nombre = 'p2'), 'cancelado', 'Se arrepintió');
select is(prueba.reservado((select id from prueba.ids where nombre = 'urbana40n')), 0, 'cancelar libera la reserva');
select is((select count(*)::int from (select s.variante_id from stock s left join movimientos_stock m on m.variante_id = s.variante_id and m.deposito_id = s.deposito_id
  group by s.variante_id, s.cantidad having s.cantidad <> coalesce(sum(m.cantidad), 0)) x), 0, 'stock = suma de movimientos');

select * from finish();
rollback;
