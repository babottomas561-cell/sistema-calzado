-- La consulta del bot solo devuelve un pedido si coinciden comprobante y teléfono.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

update clientes
set telefono = '381 555-3003'
where usuario_id = '22222222-2222-2222-2222-222222222222';

set local role anon;
select is(
  (select count(*)::int from consultar_pedido_whatsapp('0001-00000001', '5493815553003')),
  1,
  'el bot encuentra el pedido con su comprobante y teléfono'
);
select is(
  (select count(*)::int from consultar_pedido_whatsapp('0001-00000001', '3815559999')),
  0,
  'no entrega el pedido con otro teléfono'
);
select is(
  (select count(*)::int from consultar_pedido_whatsapp('1', '5493815553003')),
  0,
  'no permite enumerar pedidos por id'
);
select is(
  (select count(*)::int from pedidos),
  0,
  'anon sigue sin leer la tabla de pedidos'
);

select * from finish();
rollback;
