-- Códigos de barras por variante: dígito verificador GS1, formato, unicidad, permisos y los códigos propios (EAN-13 que empieza en 200).
begin;
create extension if not exists pgtap with schema extensions;
create schema prueba;
grant usage on schema prueba to anon, authenticated;
create function prueba.como_admin() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) $$;
create function prueba.como_vendedora() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true) $$;
create function prueba.variante(p_n int) returns bigint language sql stable security definer set search_path = public as $$
  select id from variantes order by id offset p_n - 1 limit 1 $$;
create function prueba.valido(p text) returns boolean language sql stable security definer set search_path = public as $$ select _gs1_valido(p) $$;
grant execute on all functions in schema prueba to anon, authenticated;
select plan(23);

-- La prueba no depende de lo que haya cargado en la base: parte de variantes sin código
update variantes set codigo_barras = null;

-- ── Dígito verificador (códigos de ejemplo de la norma) ──
select is(_gs1_digito('400638133393'), 1, 'el dígito de un EAN-13 conocido');
select ok(_gs1_valido('4006381333931'), 'EAN-13 válido');
select ok(not _gs1_valido('4006381333932'), 'EAN-13 con el dígito cambiado: inválido');
select ok(_gs1_valido('96385074'), 'EAN-8 válido');
select ok(_gs1_valido('036000291452'), 'UPC-A válido');
select ok(not _gs1_valido('ABC12345'), 'lo que no es numérico no tiene dígito verificador');

-- ── Cargar un código: como el equipo que edita productos ──
set local role authenticated;
select prueba.como_admin();
update variantes set codigo_barras = ' 4006381 333931 ' where id = prueba.variante(1);
select is((select codigo_barras from variantes where id = prueba.variante(1)), '4006381333931', 'se guarda sin espacios');
select throws_like($$ update variantes set codigo_barras = '4006381333932' where id = prueba.variante(2) $$, 'El dígito verificador de 4006381333932 no coincide%', 'un EAN con el dígito mal se rechaza');
select throws_like($$ update variantes set codigo_barras = 'ab' where id = prueba.variante(2) $$, 'El código de barras solo lleva%', 'un código demasiado corto se rechaza');
select throws_like($$ update variantes set codigo_barras = 'ab/cd*ef' where id = prueba.variante(2) $$, 'El código de barras solo lleva%', 'los símbolos raros se rechazan');
select throws_like($$ update variantes set codigo_barras = '4006381333931' where id = prueba.variante(2) $$, 'Ese código de barras ya lo tiene la variante%', 'un código no se repite entre variantes');
select throws_like($$ update variantes set codigo_barras = lower((select sku from variantes where id = prueba.variante(3))) where id = prueba.variante(2) $$,
  'Ese código coincide con el código interno%', 'tampoco puede ser el código interno (SKU) de otra variante');
update variantes set codigo_barras = 'LOTE-2026.A1' where id = prueba.variante(2);
select is((select codigo_barras from variantes where id = prueba.variante(2)), 'LOTE-2026.A1', 'un código alfanumérico propio se acepta tal cual');
update variantes set codigo_barras = '' where id = prueba.variante(2);
select is((select codigo_barras from variantes where id = prueba.variante(2)), null, 'vacío lo borra');

-- ── Códigos propios ──
select is(generar_codigos_barras(array[prueba.variante(1), prueba.variante(2), prueba.variante(3)]), 2, 'genera solo para las que no tenían (la 1 ya tiene)');
select is((select codigo_barras from variantes where id = prueba.variante(1)), '4006381333931', 'y no pisa el que ya había');
select matches((select codigo_barras from variantes where id = prueba.variante(2)), '^200[0-9]{10}$', 'el propio es un EAN-13 que empieza en 200');
select ok(prueba.valido((select codigo_barras from variantes where id = prueba.variante(2))), 'con su dígito verificador bien');
select isnt((select codigo_barras from variantes where id = prueba.variante(2)), (select codigo_barras from variantes where id = prueba.variante(3)), 'cada variante recibe uno distinto');
select is(generar_codigos_barras(array[prueba.variante(2)]), 0, 'volver a generar no cambia nada');

-- ── Lo ve el stock ──
select is((select codigo_barras from v_stock where variante_id = prueba.variante(1) limit 1), '4006381333931', 'v_stock trae el código de barras');

-- ── Sin permiso ──
select prueba.como_vendedora();
update variantes set codigo_barras = '9638507' || '4' where id = prueba.variante(3);
select isnt((select codigo_barras from variantes where id = prueba.variante(3)), '96385074', 'el vendedor no cambia códigos (las políticas lo frenan)');
select throws_ok($$ select generar_codigos_barras(array[prueba.variante(3)]) $$, 'No tenés permiso para editar productos', 'ni genera códigos');

select * from finish();
rollback;
