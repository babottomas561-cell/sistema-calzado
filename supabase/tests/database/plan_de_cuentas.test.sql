-- Plan de cuentas (fase A): el árbol se valida solo, el modelo viene cargado, la importación y las asignaciones con su jerarquía.
begin;
create extension if not exists pgtap with schema extensions;
create schema prueba;
grant usage on schema prueba to authenticated;
create function prueba.como_admin() returns void language sql as $$ select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) $$;
create function prueba.como_vendedora() returns void language sql as $$ select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true) $$;
create function prueba.cuenta(p_codigo text) returns cuentas language sql stable security definer set search_path = public as $$ select * from cuentas where codigo = p_codigo $$;
create function prueba.padre(p text) returns text language sql stable security definer set search_path = public as $$ select _cuenta_padre(p) $$;
create function prueba.clave(p_clave text) returns bigint language sql stable security definer set search_path = public as $$ select id from cuentas where clave = p_clave $$;
create function prueba.producto_de_linea(p_linea text) returns bigint language sql stable security definer set search_path = public as $$
  select p.id from productos p join categorias c on c.id = p.categoria_id where c.linea = p_linea order by p.id limit 1 $$;
create function prueba.rubro_de(p_producto bigint) returns bigint language sql stable security definer set search_path = public as $$ select categoria_id from productos where id = p_producto $$;
grant execute on all functions in schema prueba to authenticated;
select plan(23);

set local role authenticated;
select prueba.como_vendedora();
select is((select count(*)::int from cuentas), 0, 'la vendedora no ve el plan de cuentas');
select throws_ok($$ select guardar_cuenta(null, '6101010', 'Mantenimiento', 'gasto', true, true) $$, 'No tenés permiso para cambiar el plan de cuentas', 'ni lo cambia');

select prueba.como_admin();
select ok((select count(*) from cuentas where imputable) >= 35, 'el plan modelo viene cargado');
select lives_ok($$ select guardar_cuenta(null, '6101010', 'Mantenimiento del local', 'activo', true, true) $$, 'se agrega una cuenta');
select is((prueba.cuenta('6101010')).tipo, 'gasto', 'el tipo sale de la cuenta que la agrupa (no del que se mandó)');
select is((prueba.cuenta('6101010')).padre_id, (prueba.cuenta('6101000')).id, 'y queda colgada de su grupo');
select lives_ok($$ select guardar_cuenta(null, '6102000', 'Grupo que recibe', 'gasto', true, true) $$, 'se crea un grupo marcado (por error) como imputable');
select throws_like($$ select guardar_cuenta(null, '6102001', 'Hija', 'gasto', true, true) $$, 'La cuenta 6102000 Grupo que recibe recibe movimientos%', 'una cuenta que recibe movimientos no puede tener subcuentas');
select throws_like($$ select guardar_cuenta(null, '6501001', 'Algo', 'gasto', true, true) $$, 'Falta la cuenta 6501000%', 'no se puede saltear un nivel');
select throws_ok(format($$ select guardar_cuenta(%s, '1101001', 'Caja', 'activo', true, false) $$, prueba.clave('caja')), 'Esa cuenta la usa el sistema: se puede renombrar, pero no desactivar', 'las cuentas del sistema no se desactivan');

-- Importar: agrega y actualiza por código; las que tienen subcuentas en la planilla quedan como agrupadoras
select is(importar_plan_cuentas('[{"codigo":"6200000","nombre":"Gastos financieros"},{"codigo":"6201000","nombre":"Intereses y comisiones"},{"codigo":"6201001","nombre":"Intereses"},{"codigo":"1101001","nombre":"Caja central"}]'::jsonb), 4, 'importa cuatro filas');
select ok(not (prueba.cuenta('6200000')).imputable and (prueba.cuenta('6201001')).imputable, 'la que agrupa queda agrupadora y la hoja recibe movimientos');
select is((prueba.cuenta('1101001')).nombre, 'Caja central', 'una que ya estaba se renombra');

-- Asignaciones: de lo particular a lo general, con el tipo que corresponde
select is(cuenta_venta_de(prueba.producto_de_linea('Calzado')), prueba.clave('ventas_calzado'), 'sin nada propio, un artículo de calzado va a Ventas de calzado');
select asignar_cuenta('rubro', prueba.rubro_de(prueba.producto_de_linea('Calzado'))::text, 'venta', prueba.clave('ventas_generales'));
select is(cuenta_venta_de(prueba.producto_de_linea('Calzado')), prueba.clave('ventas_generales'), 'si su rubro tiene cuenta, gana la del rubro');
select throws_like(format($$ select asignar_cuenta('medio', '1', 'fondos', %s) $$, prueba.clave('ventas_ropa')), 'La cuenta 4101001 es de ingreso%', 'un medio de pago no puede ir a una cuenta de ventas');
select throws_ok(format($$ select asignar_cuenta('gasto', '1', 'gasto', %s) $$, (prueba.cuenta('6100000')).id), 'Elegí una cuenta activa que reciba movimientos', 'no se asigna una cuenta que agrupa');

-- Códigos numéricos de largo fijo
select throws_ok($$ select guardar_cuenta(null, '61010', 'Corta', 'gasto', true, true) $$, 'El código tiene que tener 7 números (el formato de este plan)', 'el código tiene el largo del formato');
select throws_ok($$ select guardar_cuenta(null, '6.1.01', 'Con puntos', 'gasto', true, true) $$, 'El código tiene que tener 7 números (el formato de este plan)', 'y solo números');
select is(prueba.padre('6101010'), '6101000', 'el padre de 6101010 es 6101000');
select is(prueba.padre('6101000'), '6100000', 'el de 6101000 es 6100000');
select throws_like($$ select cambiar_mascara_cuentas('{1,2,2,3}') $$, 'La cuenta % no entra en ese formato%', 'no se cambia el formato si los códigos que hay no entran');
reset role;
insert into medios_pago (codigo, nombre, tipo) values ('PRU', 'Tarjeta de prueba', 'Crédito');
select is((select cuenta_id from medios_pago where codigo = 'PRU'), prueba.clave('tarjetas_cobrar'), 'un medio de pago nuevo nace con la cuenta de su tipo');
select * from finish();
rollback;
