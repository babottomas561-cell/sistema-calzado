-- Textos de la portada con un tono más de acá. Solo cambia lo que sigue igual que de fábrica: lo que el dueño ya
-- editó desde Tienda online no se toca.
update public.inicio_secciones set titulo = '¿Qué andás buscando?' where tipo = 'accesos' and titulo = 'Elegí por dónde empezar';
update public.inicio_secciones set titulo = 'Lo que más sale' where tipo = 'productos' and titulo = 'Lo más elegido';
update public.inicio_secciones set titulo = 'Aprovechá ahora' where tipo = 'promociones' and titulo = 'Ahora en la tienda';
update public.inicio_secciones set titulo = 'Vení a probártelo' where tipo = 'local' and titulo = 'Pasá a probártelo';
update public.inicio_secciones set bajada = 'Te esperamos en el local. Si no te da el tiempo, escribinos por WhatsApp y te asesoramos.'
  where tipo = 'local' and bajada = 'Te esperamos en el local. Si preferís, escribinos y te asesoramos por WhatsApp.';
update public.inicio_secciones set contenido = jsonb_set(contenido, '{frases}', '["Reservá online", "Pasalo a buscar sin cargo", "Cambios sin vueltas", "Pagá como más te sirva"]')
  where tipo = 'cinta' and contenido -> 'frases' = '["Reservá online", "Retirá sin cargo en el local", "Pagá como prefieras"]';
update public.inicio_secciones set titulo = 'Comprar es *re fácil*', contenido = jsonb_set(contenido, '{pasos}', '[
    {"titulo": "Elegí", "texto": "Mirá la tienda, filtrá por talle y color y mandá al carrito lo que te guste."},
    {"titulo": "Reservá", "texto": "Confirmás y te lo guardamos. Coordinamos por WhatsApp, sin vueltas."},
    {"titulo": "Retirá o recibí", "texto": "Lo pasás a buscar por el local o te lo llevamos a tu casa."}]')
  where tipo = 'pasos' and titulo = 'Comprar es así de simple'
    and contenido -> 'pasos' -> 0 ->> 'texto' = 'Mirá la tienda, filtrá por talle y color y sumá lo que te guste al carrito.';
update public.inicio_secciones set titulo = 'Vestite para el *finde*' where tipo = 'portada' and titulo = 'Elegí lo que más te gusta';
update public.inicio_secciones set bajada = 'Camisas, jeans y zapatillas para el laburo y para salir. Elegí tu talle y pasalo a buscar o te lo llevamos.'
  where tipo = 'portada' and bajada = 'Elegí tu modelo y tu talle. Retirás en el local o te lo enviamos.';
-- Las bajadas de las tarjetas de fábrica (solo las frases exactas)
update public.inicio_secciones set contenido = replace(replace(replace(replace(contenido::text,
    '"Básicas, lisas y estampadas"', '"Lisas, estampadas, las de siempre"'),
    '"Para todos los días y para salir"', '"Para el laburo y para salir"'),
    '"Chinos, de lino y deportivos"', '"Chinos, de lino y para el finde"'),
    '"Zapatillas y urbanas"', '"Zapas para todos los días"')::jsonb
  where tipo = 'accesos';
