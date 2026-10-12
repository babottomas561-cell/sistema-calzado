-- Impresión de etiquetas: plantillas configurables y la configuración de impresión del local.
--
-- Cada local tiene su propia impresora: una térmica de rollo (Zebra, TSC, Xprinter…) o una común con hojas de etiquetas
-- autoadhesivas. Por eso el tamaño y lo que lleva cada etiqueta NO está escrito en el código: son plantillas que el dueño elige y
-- ajusta en /admin/impresion. Vienen cargadas las medidas más comunes.
--   · «rollo»: una etiqueta por página del tamaño de la etiqueta (o varias en fila, si el rollo trae 2 o 3 una al lado de otra).
--   · «hoja»: una hoja A4 o Carta con una grilla de columnas × filas, con sus márgenes y separaciones.
-- La plantilla en uso se guarda en configuracion_impresion (una sola fila; después se le suman los comprobantes).

create table public.plantillas_etiqueta (
  id                  bigint generated always as identity primary key,
  nombre              text not null check (char_length(trim(nombre)) between 2 and 60),
  tipo                text not null check (tipo in ('rollo', 'hoja')),
  pagina              text check (pagina in ('A4', 'Carta')),                    -- solo las hojas
  ancho_mm            numeric(5,1) not null check (ancho_mm between 15 and 200),   -- de CADA etiqueta
  alto_mm             numeric(5,1) not null check (alto_mm between 10 and 200),
  columnas            int not null default 1 check (columnas between 1 and 8),     -- etiquetas una al lado de otra
  filas               int not null default 1 check (filas between 1 and 30),       -- solo las hojas
  margen_superior_mm  numeric(4,1) not null default 0 check (margen_superior_mm between 0 and 50),
  margen_izquierdo_mm numeric(4,1) not null default 0 check (margen_izquierdo_mm between 0 and 50),
  separacion_h_mm     numeric(4,1) not null default 0 check (separacion_h_mm between 0 and 30),
  separacion_v_mm     numeric(4,1) not null default 0 check (separacion_v_mm between 0 and 30),
  mostrar_tienda      boolean not null default false,
  mostrar_nombre      boolean not null default true,
  mostrar_marca       boolean not null default false,
  mostrar_talle_color boolean not null default true,
  mostrar_precio      boolean not null default true,
  mostrar_codigo      boolean not null default true,                               -- el número debajo de las barras
  tamano_texto        numeric(3,1) not null default 7 check (tamano_texto between 4 and 20),
  tamano_precio       numeric(3,1) not null default 11 check (tamano_precio between 5 and 40),
  tipo_codigo         text not null default 'auto' check (tipo_codigo in ('auto', 'code128')),   -- auto: EAN-13/8/UPC si el código lo es; code128: siempre Code 128
  alto_codigo_mm      numeric(4,1) not null default 9 check (alto_codigo_mm between 4 and 40),
  activa              boolean not null default true,
  orden               int not null default 0,
  creado_en           timestamptz not null default now(),
  check ((tipo = 'hoja') = (pagina is not null))
);
create unique index plantillas_etiqueta_nombre_key on public.plantillas_etiqueta (lower(nombre));

-- Que la grilla entre en la hoja (o el rollo en un ancho razonable): si no, las etiquetas salen cortadas
create function public._plantilla_etiqueta_valida() returns trigger
language plpgsql set search_path = public as $$
declare v_ancho_pagina numeric; v_alto_pagina numeric; v_ancho numeric; v_alto numeric;
begin
  new.nombre := trim(new.nombre);
  if new.tipo = 'rollo' then new.filas := 1; new.margen_superior_mm := 0; new.separacion_v_mm := 0; end if;
  v_ancho := new.margen_izquierdo_mm + new.columnas * new.ancho_mm + (new.columnas - 1) * new.separacion_h_mm;
  if new.tipo = 'hoja' then
    v_ancho_pagina := case new.pagina when 'A4' then 210 else 215.9 end;
    v_alto_pagina := case new.pagina when 'A4' then 297 else 279.4 end;
    v_alto := new.margen_superior_mm + new.filas * new.alto_mm + (new.filas - 1) * new.separacion_v_mm;
    if v_ancho > v_ancho_pagina + 0.5 or v_alto > v_alto_pagina + 0.5 then
      raise exception 'Las etiquetas no entran en la hoja (% × % mm, y la hoja % mide % × % mm): revisá el tamaño, las columnas, las filas y los márgenes',
        round(v_ancho, 1), round(v_alto, 1), new.pagina, v_ancho_pagina, v_alto_pagina;
    end if;
  elsif v_ancho > 200 then
    raise exception 'El rollo es demasiado ancho (% mm): revisá el tamaño y las columnas', round(v_ancho, 1);
  end if;
  return new;
end $$;
create trigger plantilla_etiqueta_valida before insert or update on public.plantillas_etiqueta
  for each row execute function public._plantilla_etiqueta_valida();

alter table public.plantillas_etiqueta enable row level security;
create policy "equipo ve las plantillas" on public.plantillas_etiqueta for select to authenticated using (es_staff());
create policy "edita las plantillas" on public.plantillas_etiqueta for all to authenticated
  using (tiene_permiso('tablas.editar')) with check (tiene_permiso('tablas.editar'));

-- ── La configuración de impresión (una sola fila) ──────────────────────
create table public.configuracion_impresion (
  unica                 boolean primary key default true check (unica),
  etiqueta_plantilla_id bigint references public.plantillas_etiqueta (id) on delete set null,   -- la que se propone al imprimir
  actualizado_en        timestamptz not null default now(),
  actualizado_por       uuid references auth.users (id) on delete set null
);
create index configuracion_impresion_plantilla_idx on public.configuracion_impresion (etiqueta_plantilla_id);
create index configuracion_impresion_actualizado_por_idx on public.configuracion_impresion (actualizado_por);
alter table public.configuracion_impresion enable row level security;
create policy "equipo ve la impresion" on public.configuracion_impresion for select to authenticated using (es_staff());
create policy "edita la impresion" on public.configuracion_impresion for update to authenticated
  using (tiene_permiso('tablas.editar')) with check (tiene_permiso('tablas.editar'));

create function public._impresion_quien() returns trigger
language plpgsql set search_path = public as $$
begin new.actualizado_en := now(); new.actualizado_por := auth.uid(); return new; end $$;
create trigger impresion_quien before update on public.configuracion_impresion for each row execute function public._impresion_quien();
revoke execute on function public._plantilla_etiqueta_valida(), public._impresion_quien() from public, anon, authenticated;

-- ── Medidas comunes ────────────────────────────────────────────────────
-- Las hojas A4 tienen los márgenes de los formatos estándar de etiquetas autoadhesivas (63,5 × 38,1; 63,5 × 33,9; 38,1 × 21,2): las impresoras
-- comunes no imprimen en los primeros milímetros del papel, así que la primera fila no puede estar pegada al borde.
insert into public.plantillas_etiqueta (orden, nombre, tipo, pagina, ancho_mm, alto_mm, columnas, filas, margen_superior_mm, margen_izquierdo_mm, separacion_h_mm, separacion_v_mm,
  mostrar_tienda, mostrar_nombre, mostrar_marca, mostrar_talle_color, mostrar_precio, mostrar_codigo, tamano_texto, tamano_precio, alto_codigo_mm) values
  (10, 'Rollo 50 × 30 mm',            'rollo', null,    50,   30,   1, 1,  0,    0,   0,   0, false, true, false, true, true, true, 7,   12, 9),
  (20, 'Rollo 60 × 40 mm',            'rollo', null,    60,   40,   1, 1,  0,    0,   0,   0, true,  true, true,  true, true, true, 8,   14, 12),
  (30, 'Rollo 40 × 25 mm',            'rollo', null,    40,   25,   1, 1,  0,    0,   0,   0, false, true, false, true, true, true, 6,   10, 7),
  (40, 'Rollo 100 × 50 mm (cartel)',  'rollo', null,    100,  50,   1, 1,  0,    0,   0,   0, true,  true, true,  true, true, true, 10,  22, 14),
  (50, 'Rollo 2 en fila · 40 × 25 mm','rollo', null,    40,   25,   2, 1,  0,    0,   2,   0, false, true, false, true, true, true, 6,   10, 7),
  (60, 'Hoja A4 · 21 etiquetas (3 × 7)',  'hoja', 'A4', 63.5, 38.1, 3, 7,  15.1, 7.2, 2.5, 0, true,  true, true,  true, true, true, 8,   14, 11),
  (70, 'Hoja A4 · 24 etiquetas (3 × 8)',  'hoja', 'A4', 63.5, 33.9, 3, 8,  12.9, 7.2, 2.5, 0, false, true, true,  true, true, true, 7.5, 13, 10),
  (80, 'Hoja A4 · 65 etiquetas (5 × 13)', 'hoja', 'A4', 38.1, 21.2, 5, 13, 10.7, 4.7, 2.5, 0, false, true, false, true, true, true, 5,   8,  6);

insert into public.configuracion_impresion (unica, etiqueta_plantilla_id) values (true, (select id from public.plantillas_etiqueta where orden = 10));
