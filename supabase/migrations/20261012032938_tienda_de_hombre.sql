-- El local es (más que nada) de ropa masculina: los accesos de la portada pasan de
-- «Mujer · Hombre · Calzado» a rubros. Solo si siguen siendo los de fábrica (si el dueño ya los
-- cambió en Tienda online, no se tocan).
update public.inicio_secciones
   set contenido = jsonb_build_object('tarjetas', jsonb_build_array(
         jsonb_build_object('titulo', 'Remeras',    'bajada', 'Básicas, lisas y estampadas',      'filtro', jsonb_build_object('categoria', 'Remera')),
         jsonb_build_object('titulo', 'Camisas',    'bajada', 'Para todos los días y para salir', 'filtro', jsonb_build_object('categoria', 'Camisa')),
         jsonb_build_object('titulo', 'Pantalones', 'bajada', 'Chinos, de lino y deportivos',     'filtro', jsonb_build_object('categoria', 'Pantalón')),
         jsonb_build_object('titulo', 'Calzado',    'bajada', 'Zapatillas y urbanas',             'filtro', jsonb_build_object('linea', 'Calzado'))))
 where tipo = 'accesos'
   and (select array_agg(t->>'titulo' order by o) from jsonb_array_elements(contenido->'tarjetas') with ordinality x(t, o))
       = array['Mujer', 'Hombre', 'Calzado'];
