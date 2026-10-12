-- Fallados: el depósito que no vende, mover a fallados, el candado y las tres salidas de la bandeja.
begin;
create extension if not exists pgtap with schema extensions;
create schema prueba;
grant usage on schema prueba to anon, authenticated;
create function prueba.variante(p_modelo text, p_talle text, p_color text) returns bigint language sql stable security definer set search_path = public as $$
  select v.id from variantes v join productos p on p.id = v.producto_id join talles t on t.id = v.talle_id join colores c on c.id = v.color_id
   where p.nombre = p_modelo and t.nombre = p_talle and c.nombre = p_color $$;
-- Stock de una variante en un depósito ('Local' o 'Fallados')
create function prueba.en(p_variante bigint, p_deposito text) returns int language sql stable security definer set search_path = public as $$
  select coalesce((select s.cantidad from stock s join depositos d on d.id = s.deposito_id where s.variante_id = p_variante and d.nombre = p_deposito), 0) $$;
create function prueba.medio(p_codigo text) returns bigint language sql stable security definer set search_path = public as $$ select id from medios_pago where codigo = p_codigo $$;
create function prueba.como_equipo() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) $$;
create function prueba.rol_equipo(p_rol text) returns void language sql security definer set search_path = public as $$
  update perfiles set rol_id = (select id from roles where nombre = p_rol) where id = '11111111-1111-1111-1111-111111111111' $$;
create function prueba.cierra_stock() returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from stock s where s.cantidad <> coalesce((select sum(m.cantidad) from movimientos_stock m
                     where m.variante_id = s.variante_id and m.deposito_id = s.deposito_id), 0)) $$;
create function prueba.fallado(p_id bigint) returns table (estado text, cantidad int, proveedor text) language sql stable security definer set search_path = public as $$
  select f.estado, f.cantidad, pr.nombre from fallados f left join proveedores pr on pr.id = f.proveedor_id where f.id = p_id $$;
grant execute on all functions in schema prueba to anon, authenticated;
create table prueba.ids (nombre text primary key, id bigint);
grant all on prueba.ids to anon, authenticated;
select plan(24);

select is((select vendible from depositos where nombre = 'Fallados'), false, 'existe el depósito Fallados y no vende');
select is((select nombre from depositos where id = deposito_principal()), 'Local', 'el principal sigue siendo el Local');

set local role authenticated;
select prueba.como_equipo();
insert into prueba.ids values ('u40', prueba.variante('Zapatilla Urbana Classic', '40', 'Negro')),
                              ('rp38', prueba.variante('Zapatilla Running Pro', '38', 'Negro'));

-- ── Mover a fallados ──
select throws_ok(format($$ select mover_a_fallados(%s, 1, ' ') $$, (select id from prueba.ids where nombre = 'u40')), 'Contá qué tiene (el motivo es obligatorio)');
select throws_ok(format($$ select mover_a_fallados(%s, 9, 'Suela despegada') $$, (select id from prueba.ids where nombre = 'u40')), 'Hay 3 disponibles (lo reservado en pedidos no se puede mover)');
insert into prueba.ids select 'f1', mover_a_fallados((select id from prueba.ids where nombre = 'u40'), 2, 'Suela despegada');
select is(prueba.en((select id from prueba.ids where nombre = 'u40'), 'Local'), 1, 'sale del Local');
select is(prueba.en((select id from prueba.ids where nombre = 'u40'), 'Fallados'), 2, 'y entra a Fallados');
select is((select disponible from v_catalogo where variante_id = (select id from prueba.ids where nombre = 'u40')), 1, 'la tienda ya no lo ofrece');
select is((select count(*)::int from v_stock where variante_id = (select id from prueba.ids where nombre = 'u40')), 1, 'v_stock sigue con una fila por variante (solo lo que vende)');
select results_eq(format($$ select estado, cantidad, origen, costo_unitario from fallados where id = %s $$, (select id from prueba.ids where nombre = 'f1')),
  $$ values ('pendiente'::text, 2, 'local'::text, 41000.00::numeric(12,2)) $$, 'queda en la bandeja con su costo de ese momento');
select ok(prueba.cierra_stock(), 'el stock sigue siendo la suma de sus movimientos');

-- ── El candado: en Fallados no se vende, no se compra ni se ajusta ──
select throws_like(format($$ select registrar_venta(jsonb_build_array(jsonb_build_object('variante_id', %s, 'cantidad', 1, 'precio_unitario', 79000)),
  jsonb_build_array(jsonb_build_object('medio_pago_id', %s)), null, 0, 'Local', (select id from depositos where nombre = 'Fallados')) $$,
  (select id from prueba.ids where nombre = 'u40'), prueba.medio('EFE')), '%no se vende%', 'no se vende desde Fallados');
select throws_like(format($$ select registrar_compra(jsonb_build_array(jsonb_build_object('variante_id', %s, 'cantidad', 1, 'costo_unitario', 1000)),
  null, null, false, (select id from depositos where nombre = 'Fallados')) $$, (select id from prueba.ids where nombre = 'u40')), '%no se compra%', 'no se compra a Fallados');
select throws_like(format($$ select ajustar_stock(%s, 0, 'Conteo', (select id from depositos where nombre = 'Fallados')) $$,
  (select id from prueba.ids where nombre = 'u40')), '%ni se ajusta%', 'no se ajusta Fallados a mano');

-- ── Se arregló: una de las dos vuelve al Local ──
insert into prueba.ids select 'f1b', resolver_fallado((select id from prueba.ids where nombre = 'f1'), 'arreglado', 1, null, 'Se pegó la suela');
select is(prueba.en((select id from prueba.ids where nombre = 'u40'), 'Local'), 2, 'arreglada: vuelve al Local');
select results_eq(format($$ select * from prueba.fallado(%s) union all select * from prueba.fallado(%s) $$,
  (select id from prueba.ids where nombre = 'f1'), (select id from prueba.ids where nombre = 'f1b')),
  $$ values ('pendiente'::text, 1, null::text), ('arreglado'::text, 1, null::text) $$, 'la tanda se parte: 1 sigue pendiente, 1 arreglada');

-- ── Baja: la otra se da de baja ──
select resolver_fallado((select id from prueba.ids where nombre = 'f1'), 'baja', null, null, 'No tiene arreglo');
select is(prueba.en((select id from prueba.ids where nombre = 'u40'), 'Fallados'), 0, 'baja: sale de Fallados');
select is((select tipo from movimientos_stock where variante_id = (select id from prueba.ids where nombre = 'u40') order by id desc limit 1), 'baja', 'con su movimiento de baja');
select throws_ok(format($$ select resolver_fallado(%s, 'baja') $$, (select id from prueba.ids where nombre = 'f1')), 'Ese fallado ya se resolvió');

-- ── Al proveedor: por defecto, el principal del artículo ──
insert into prueba.ids select 'f2', mover_a_fallados((select id from prueba.ids where nombre = 'rp38'), 1, 'Costura abierta');
select resolver_fallado((select id from prueba.ids where nombre = 'f2'), 'proveedor');
select results_eq(format($$ select * from prueba.fallado(%s) $$, (select id from prueba.ids where nombre = 'f2')),
  $$ values ('proveedor'::text, 1, 'Distribuidora Deportiva SRL'::text) $$, 'devuelto al proveedor principal');
select is((select tipo from movimientos_stock where variante_id = (select id from prueba.ids where nombre = 'rp38') order by id desc limit 1), 'devolucion_proveedor', 'con su movimiento de devolución al proveedor');
select ok(prueba.cierra_stock(), 'al final, el stock sigue cerrando');

-- ── Permisos y costos: la vendedora ve la bandeja sin costos y no la toca ──
select prueba.rol_equipo('Vendedor');
select is((select count(*)::int from fallados), 0, 'vendedora: no lee la tabla (tiene costos)');
select is((select count(*) filter (where costo_unitario is null)::int from v_fallados), (select count(*)::int from v_fallados), 'vendedora: ve la bandeja con el costo vacío');
select throws_ok(format($$ select mover_a_fallados(%s, 1, 'Mancha') $$, (select id from prueba.ids where nombre = 'rp38')), 'No tenés permiso para mover stock a fallados');

select * from finish();
rollback;
