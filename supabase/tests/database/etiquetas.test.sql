-- Plantillas de etiquetas y configuración de impresión: medidas comunes cargadas, permisos, y que la grilla entre en la hoja.
begin;
create extension if not exists pgtap with schema extensions;
create schema prueba;
grant usage on schema prueba to anon, authenticated;
create function prueba.como_admin() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) $$;
create function prueba.como_vendedora() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true) $$;
grant execute on all functions in schema prueba to anon, authenticated;
select plan(15);

-- ── Lo que viene de fábrica ──
select is((select count(*) from plantillas_etiqueta), 8::bigint, 'vienen 8 plantillas con las medidas más comunes');
select is((select count(*) from plantillas_etiqueta where tipo = 'hoja'), 3::bigint, 'tres son de hoja A4 y las demás de rollo');
select ok((select bool_and(margen_superior_mm >= 5 and margen_izquierdo_mm >= 4) from plantillas_etiqueta where tipo = 'hoja'), 'las hojas dejan margen: las impresoras comunes no imprimen pegado al borde');
select is((select nombre from plantillas_etiqueta where id = (select etiqueta_plantilla_id from configuracion_impresion)), 'Rollo 50 × 30 mm', 'la 50 × 30 es la que se propone al imprimir');

-- ── El equipo las ve; solo quien edita Tablas las cambia ──
set local role authenticated;
select prueba.como_vendedora();
select is((select count(*) from plantillas_etiqueta), 8::bigint, 'el vendedor las puede leer (para imprimir)');
select throws_like($$ insert into plantillas_etiqueta (nombre, tipo, ancho_mm, alto_mm) values ('Mía', 'rollo', 50, 30) $$, 'new row violates row-level security%', 'pero no crearlas');
update configuracion_impresion set etiqueta_plantilla_id = (select id from plantillas_etiqueta where orden = 20);
select is((select nombre from plantillas_etiqueta where id = (select etiqueta_plantilla_id from configuracion_impresion)), 'Rollo 50 × 30 mm', 'ni cambiar la que se usa');

select prueba.como_admin();
insert into plantillas_etiqueta (nombre, tipo, ancho_mm, alto_mm, filas, margen_superior_mm) values ('Rollo 70 × 50 mm', 'rollo', 70, 50, 3, 9);
select is((select filas from plantillas_etiqueta where nombre = 'Rollo 70 × 50 mm'), 1, 'un rollo siempre tiene una fila');
select is((select margen_superior_mm from plantillas_etiqueta where nombre = 'Rollo 70 × 50 mm'), 0.0, 'y sin margen de arriba');
select throws_like($$ insert into plantillas_etiqueta (nombre, tipo, ancho_mm, alto_mm) values ('rollo 70 × 50 MM', 'rollo', 70, 50) $$, 'duplicate key%', 'el nombre no se repite (sin mirar mayúsculas)');
select throws_like($$ insert into plantillas_etiqueta (nombre, tipo, ancho_mm, alto_mm) values ('Hoja sin página', 'hoja', 50, 30) $$,
  'new row for relation "plantillas_etiqueta" violates check constraint%', 'una hoja tiene que decir si es A4 o Carta');
select throws_like($$ insert into plantillas_etiqueta (nombre, tipo, pagina, ancho_mm, alto_mm, columnas, filas) values ('Hoja que no entra', 'hoja', 'A4', 80, 40, 3, 8) $$,
  'Las etiquetas no entran en la hoja%', 'si la grilla no entra en la hoja, avisa');
select throws_like($$ insert into plantillas_etiqueta (nombre, tipo, ancho_mm, alto_mm, columnas) values ('Rollo enorme', 'rollo', 100, 40, 3) $$,
  'El rollo es demasiado ancho%', 'ni un rollo de más de 200 mm');

-- ── Elegir la plantilla y borrarla ──
update configuracion_impresion set etiqueta_plantilla_id = (select id from plantillas_etiqueta where nombre = 'Rollo 70 × 50 mm');
select is((select nombre from plantillas_etiqueta where id = (select etiqueta_plantilla_id from configuracion_impresion)), 'Rollo 70 × 50 mm', 'el administrador elige la que se usa');
delete from plantillas_etiqueta where nombre = 'Rollo 70 × 50 mm';
select is((select etiqueta_plantilla_id from configuracion_impresion), null, 'si se borra la que se usaba, queda sin elegir (la pantalla propone otra)');

select * from finish();
rollback;
