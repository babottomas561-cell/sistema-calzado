-- Permisos finos: un padre da todos sus hijos (nadie pierde nada) y un rol con solo un hijo ve solo eso.
begin;
create extension if not exists pgtap with schema extensions;
create schema prueba;
grant usage on schema prueba to anon, authenticated;
create function prueba.como_vendedor() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true) $$;
-- Le da a la vendedora de prueba un rol con solo estos permisos (corre como la base)
create function prueba.rol_con(p_permisos text[]) returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from roles where nombre = 'Prueba fina') then update roles set permisos = p_permisos where nombre = 'Prueba fina';
  else insert into roles (nombre, permisos) values ('Prueba fina', p_permisos); end if;
  update perfiles set rol_id = (select id from roles where nombre = 'Prueba fina') where id = '33333333-3333-3333-3333-333333333333';
end $$;
grant execute on all functions in schema prueba to anon, authenticated;
select plan(16);
set local role authenticated;

-- Solo la ganancia
select prueba.rol_con(array['costos.ver_ganancia', 'stock.ver', 'ventas.registrar']);
select prueba.como_vendedor();
select is(tiene_permiso('costos.ver_ganancia'), true, 'tiene el permiso fino que se le dio');
select is(tiene_permiso('costos.ver_precio_compra'), false, 'y no los otros hijos');
select is(tiene_permiso('costos.ver'), false, 'tener un hijo no da el padre');
select is((select count(*) filter (where precio_compra is not null)::int from v_stock), 0, 'v_stock sin precio de compra');
select is((select count(*) filter (where valor_costo is not null)::int from v_stock), 0, 'ni valor del stock');
select is((select count(*) filter (where costo_unitario is not null)::int from v_venta_items), 0, 'la venta sin costos para quien no vio ninguno aún');
select is((select count(*)::int from productos), 0, 'no lee productos (tienen precio de compra)');

-- El padre da todos los hijos
select prueba.rol_con(array['costos.ver', 'stock.ver']);
select is(tiene_permiso('costos.ver_precio_compra') and tiene_permiso('costos.ver_ganancia') and tiene_permiso('costos.ver_valor_stock'), true, 'con «Ver costos» tiene los tres');
select is((select count(*) filter (where precio_compra is not null) > 0 from v_stock), true, 've el precio de compra');
select is((select 'costos.ver_ganancia' = any (permisos) from mi_equipo()), true, 'mi_equipo devuelve los hijos del padre que tiene');

-- Solo el valor del stock
select prueba.rol_con(array['costos.ver_valor_stock', 'stock.ver']);
select is((select count(*) filter (where precio_compra is not null)::int from v_stock), 0, 'solo el valor: sin precio de compra');
select is((select count(*) filter (where valor_costo is not null) > 0 from v_stock), true, 'pero sí el valor del stock');

-- Tablas: solo catálogo
select prueba.rol_con(array['tablas.catalogo', 'stock.ver']);
select lives_ok($$ insert into marcas (nombre) values ('Marca de prueba fina') $$, 'con tablas.catalogo carga marcas');
select throws_ok($$ insert into medios_pago (nombre, codigo, tipo) values ('Medio de prueba', 'MPF', 'Efectivo') $$, null, 'pero no medios de pago');

-- Equipo: solo módulos
select prueba.rol_con(array['equipo.modulos', 'stock.ver']);
select lives_ok($$ select configurar_modulos('{}') $$, 'con equipo.modulos configura módulos');
select throws_like($$ select asignar_rol('11111111-1111-1111-1111-111111111111', 1) $$, '%permiso%', 'pero no cambia roles de personas');
select * from finish();
rollback;
