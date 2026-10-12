-- Crédito con proveedores: nace al devolverle un fallado, se descuenta de una factura suya y se ajusta con nota.
begin;
create extension if not exists pgtap with schema extensions;
create schema prueba;
grant usage on schema prueba to anon, authenticated;
create function prueba.variante(p_modelo text, p_talle text, p_color text) returns bigint language sql stable security definer set search_path = public as $$
  select v.id from variantes v join productos p on p.id = v.producto_id join talles t on t.id = v.talle_id join colores c on c.id = v.color_id
   where p.nombre = p_modelo and t.nombre = p_talle and c.nombre = p_color $$;
create function prueba.proveedor(p_nombre text) returns bigint language sql stable security definer set search_path = public as $$ select id from proveedores where nombre = p_nombre $$;
create function prueba.saldo(p_proveedor bigint) returns numeric language sql stable security definer set search_path = public as $$ select _saldo_proveedor(p_proveedor) $$;
create function prueba.como_admin() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) $$;
create function prueba.como_vendedora() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true) $$;
create function prueba.compra(p_proveedor bigint, p_cant int, p_costo numeric) returns bigint language sql as $$
  select registrar_compra(jsonb_build_array(jsonb_build_object('variante_id', prueba.variante('Zapatilla Running Pro', '42', 'Negro'), 'cantidad', p_cant, 'costo_unitario', p_costo)),
                          p_proveedor, null, false) $$;
grant execute on all functions in schema prueba to anon, authenticated;
create table prueba.ids (nombre text primary key, id bigint);
grant all on prueba.ids to anon, authenticated;
select plan(16);

set local role authenticated;
select prueba.como_admin();

-- ── Nace: un par fallado (costo $52.000) se le devuelve al proveedor principal ──
insert into prueba.ids select 'f', mover_a_fallados(prueba.variante('Zapatilla Running Pro', '38', 'Negro'), 1, 'Costura abierta');
select resolver_fallado((select id from prueba.ids where nombre = 'f'), 'proveedor', null, null, 'Reclamo 1234');
select is(prueba.saldo(prueba.proveedor('Distribuidora Deportiva SRL')), 52000.00, 'devolverle un fallado deja $52.000 de crédito (su costo)');
select is((select saldo from v_credito_proveedores where nombre = 'Distribuidora Deportiva SRL'), 52000.00, 'y se ve en el saldo del proveedor');

-- ── Se descuenta de una factura suya ──
insert into prueba.ids select 'c1', prueba.compra(prueba.proveedor('Distribuidora Deportiva SRL'), 2, 50000);
select throws_like(format($$ select aplicar_credito_proveedor(%s, 60000) $$, (select id from prueba.ids where nombre = 'c1')), 'El crédito con este proveedor es de $%', 'no se descuenta más crédito del que hay');
select is(aplicar_credito_proveedor((select id from prueba.ids where nombre = 'c1'), 52000), 52000.00, 'se descuentan los $52.000 de la factura');
select results_eq(format($$ select total, credito_aplicado, total - credito_aplicado from compras where id = %s $$, (select id from prueba.ids where nombre = 'c1')),
  $$ values (100000.00::numeric(12,2), 52000.00::numeric(12,2), 48000.00::numeric) $$, 'la factura queda: total $100.000, crédito $52.000, a pagar $48.000');
select is(prueba.saldo(prueba.proveedor('Distribuidora Deportiva SRL')), 0.00, 'el crédito queda usado');
select is((select costo_unitario from compra_items where compra_id = (select id from prueba.ids where nombre = 'c1')), 50000.00::numeric(12,2), 'el costo de lo que llega no cambia');

-- ── Límites ──
select ajustar_credito_proveedor(prueba.proveedor('Distribuidora Deportiva SRL'), 80000, 'Nota de crédito por otra devolución');
insert into prueba.ids select 'c2', prueba.compra(prueba.proveedor('Distribuidora Deportiva SRL'), 1, 30000);
select throws_like(format($$ select aplicar_credito_proveedor(%s, 40000) $$, (select id from prueba.ids where nombre = 'c2')), 'A esta factura le quedan $%', 'no se descuenta más que el total de la factura');
insert into prueba.ids select 'c3', prueba.compra(prueba.proveedor('Calzados del Norte'), 1, 30000);
select throws_like(format($$ select aplicar_credito_proveedor(%s, 1000) $$, (select id from prueba.ids where nombre = 'c3')), 'El crédito con este proveedor es de $%', 'el crédito de un proveedor no sirve para otro');
insert into prueba.ids select 'c4', prueba.compra(null, 1, 30000);
select throws_ok(format($$ select aplicar_credito_proveedor(%s, 1000) $$, (select id from prueba.ids where nombre = 'c4')), 'La compra no tiene proveedor: no hay crédito que descontar');

-- ── Ajustes a mano ──
select throws_ok(format($$ select ajustar_credito_proveedor(%s, -1000, ' ') $$, prueba.proveedor('Distribuidora Deportiva SRL')), 'Contá por qué se ajusta (la nota es obligatoria)');
select throws_like(format($$ select ajustar_credito_proveedor(%s, -90000, 'No lo reconoció') $$, prueba.proveedor('Distribuidora Deportiva SRL')), '%no puede quedar negativo', 'el crédito no queda negativo');
select ajustar_credito_proveedor(prueba.proveedor('Distribuidora Deportiva SRL'), -20000, 'No reconoció una parte');
select is(prueba.saldo(prueba.proveedor('Distribuidora Deportiva SRL')), 60000.00, 'el ajuste con nota baja el crédito');
select results_eq($$ select a_favor, usado, saldo from v_credito_proveedores where nombre = 'Distribuidora Deportiva SRL' $$,
  $$ values (132000.00, 72000.00, 60000.00) $$, 'a favor (fallado + nota de crédito) − usado (factura + ajuste) = saldo');

-- ── La vendedora no lo ve ni lo usa ──
select prueba.como_vendedora();
select is((select count(*)::int from v_credito_proveedores), 0, 'la vendedora no ve el crédito con proveedores');
select throws_ok(format($$ select aplicar_credito_proveedor(%s, 1000) $$, (select id from prueba.ids where nombre = 'c2')), 'No tenés permiso para cargar compras');

select * from finish();
rollback;
