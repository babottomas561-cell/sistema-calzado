-- Gastos del local y resultado del mes.
-- Hasta acá el sistema llegaba a la ganancia bruta (ventas − costo de la mercadería). Ahora registra los
-- gastos (servicios digitales, WhatsApp de Meta, IA, publicidad, alquiler…) para llegar a la ganancia NETA.
--   · a mano: cualquier gasto, en pesos o en dólares (con la cotización del día, que queda copiada);
--   · fijos por mes: Vercel, Supabase, el dominio, un plan de IA… se generan solos el día que vencen;
--   · automáticos: los va a cargar el sistema (lo que cobra Meta por WhatsApp, el uso de IA) y no se editan a mano.
-- Lo ve y lo carga quien tiene «gastos.gestionar» (son números del negocio, como los costos).

insert into public.permisos (orden, grupo, codigo, nombre, descripcion)
values (62, 'Informes', 'gastos.gestionar', 'Gastos y resultado', 'Cargar y ver los gastos del local (servicios, WhatsApp, IA, publicidad…) y el resultado del mes.');

-- ── Categorías (desplegable) ───────────────────────────────────────────
create table public.gasto_categorias (
  id      bigint generated always as identity primary key,
  nombre  text not null check (length(trim(nombre)) > 0),
  orden   int not null default 0,
  activo  boolean not null default true
);
create unique index gasto_categorias_nombre_key on public.gasto_categorias (lower(nombre));
alter table public.gasto_categorias enable row level security;
create policy "ve categorias de gastos" on public.gasto_categorias for select to authenticated using (tiene_permiso('gastos.gestionar'));
create policy "edita categorias de gastos" on public.gasto_categorias for all to authenticated
  using (tiene_permiso('gastos.gestionar')) with check (tiene_permiso('gastos.gestionar'));

insert into public.gasto_categorias (nombre, orden) values
  ('Servicios digitales', 1),      -- Vercel, Supabase, dominio
  ('WhatsApp (Meta)', 2),
  ('Inteligencia artificial', 3),
  ('Publicidad', 4),
  ('Alquiler y servicios', 5),     -- alquiler, luz, internet
  ('Sueldos', 6),
  ('Comisiones y bancos', 7),
  ('Impuestos', 8),
  ('Insumos', 9),                  -- bolsas, etiquetas
  ('Otros', 10);

-- ── La cotización del dólar que se usa por defecto ─────────────────────
create table public.configuracion_gastos (
  id               boolean primary key default true check (id),   -- una sola fila
  dolar            numeric(12,2) not null default 1 check (dolar > 0),
  dolar_actualizado timestamptz not null default now()
);
insert into public.configuracion_gastos default values;
alter table public.configuracion_gastos enable row level security;
create policy "ve configuracion de gastos" on public.configuracion_gastos for select to authenticated using (tiene_permiso('gastos.gestionar'));
create policy "edita configuracion de gastos" on public.configuracion_gastos for update to authenticated
  using (tiene_permiso('gastos.gestionar')) with check (tiene_permiso('gastos.gestionar'));

-- ── Gastos fijos por mes ───────────────────────────────────────────────
create table public.gastos_fijos (
  id            bigint generated always as identity primary key,
  descripcion   text not null check (length(trim(descripcion)) > 0),
  categoria_id  bigint not null references public.gasto_categorias (id) on delete restrict,
  proveedor_id  bigint references public.proveedores (id) on delete restrict,
  moneda        text not null default 'ARS' check (moneda in ('ARS', 'USD')),
  importe       numeric(12,2) not null check (importe > 0),
  dia           int not null default 1 check (dia between 1 and 28),   -- qué día del mes se carga
  desde         date not null default (now() at time zone 'America/Argentina/Buenos_Aires')::date,
  activo        boolean not null default true
);
create index gastos_fijos_categoria_id_idx on public.gastos_fijos (categoria_id);
create index gastos_fijos_proveedor_id_idx on public.gastos_fijos (proveedor_id);
alter table public.gastos_fijos enable row level security;
create policy "ve gastos fijos" on public.gastos_fijos for select to authenticated using (tiene_permiso('gastos.gestionar'));
create policy "edita gastos fijos" on public.gastos_fijos for all to authenticated
  using (tiene_permiso('gastos.gestionar')) with check (tiene_permiso('gastos.gestionar'));

-- ── Los gastos ─────────────────────────────────────────────────────────
-- monto (en pesos) = importe × cotización. En pesos la cotización es 1; en dólares queda la del día del gasto,
-- así cambiar el dólar no toca los gastos viejos.
create table public.gastos (
  id             bigint generated always as identity primary key,
  fecha          date not null default (now() at time zone 'America/Argentina/Buenos_Aires')::date,
  categoria_id   bigint not null references public.gasto_categorias (id) on delete restrict,
  descripcion    text not null check (length(trim(descripcion)) > 0),
  proveedor_id   bigint references public.proveedores (id) on delete restrict,
  moneda         text not null default 'ARS' check (moneda in ('ARS', 'USD')),
  importe        numeric(12,2) not null check (importe > 0),
  cotizacion     numeric(12,2) not null default 1 check (cotizacion > 0),
  monto          numeric(14,2) generated always as (round(importe * cotizacion, 2)) stored,
  origen         text not null default 'manual' check (origen in ('manual', 'fijo', 'automatico')),
  gasto_fijo_id  bigint references public.gastos_fijos (id) on delete restrict,
  periodo        date,                       -- de los fijos: el mes que cubre (primer día)
  referencia     text,                       -- de los automáticos: de dónde sale («whatsapp:2026-10»…)
  nota           text,
  usuario_id     uuid default auth.uid() references public.perfiles (id) on delete set null,
  creado_en      timestamptz not null default now(),
  check (moneda <> 'ARS' or cotizacion = 1),
  check (origen <> 'fijo' or (gasto_fijo_id is not null and periodo is not null)),
  unique (gasto_fijo_id, periodo),           -- un fijo se carga una vez por mes
  unique (referencia)
);
create index gastos_fecha_idx on public.gastos (fecha);
create index gastos_categoria_id_idx on public.gastos (categoria_id);
create index gastos_proveedor_id_idx on public.gastos (proveedor_id);
create index gastos_usuario_id_idx on public.gastos (usuario_id);
alter table public.gastos enable row level security;
create policy "ve gastos" on public.gastos for select to authenticated using (tiene_permiso('gastos.gestionar'));
-- A mano se cargan, corrigen y borran los manuales y los fijos; los automáticos los escribe solo el sistema
create policy "carga gastos" on public.gastos for insert to authenticated
  with check (tiene_permiso('gastos.gestionar') and origen = 'manual');
create policy "corrige gastos" on public.gastos for update to authenticated
  using (tiene_permiso('gastos.gestionar') and origen <> 'automatico')
  with check (tiene_permiso('gastos.gestionar') and origen <> 'automatico');
create policy "borra gastos" on public.gastos for delete to authenticated
  using (tiene_permiso('gastos.gestionar') and origen <> 'automatico');

-- Un gasto en dólares sin cotización toma la del sistema
create function public._cotizar_gasto() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.moneda = 'USD' and (tg_op = 'INSERT' and new.cotizacion = 1 or new.cotizacion is null) then
    new.cotizacion := (select dolar from configuracion_gastos);
  elsif new.moneda = 'ARS' then
    new.cotizacion := 1;
  end if;
  return new;
end $$;
revoke execute on function public._cotizar_gasto() from public, anon, authenticated;
create trigger gastos_cotizar before insert or update of moneda, cotizacion on public.gastos
  for each row execute function public._cotizar_gasto();

-- ── Generar los fijos del mes ──────────────────────────────────────────
-- Carga los fijos activos cuyo día ya llegó y que todavía no se cargaron este mes (y los meses atrasados desde
-- «desde», por si el sistema no corrió). La corre pg_cron cada mañana y la pantalla de Gastos al abrirse.
create function public._generar_gastos_fijos() returns int
language plpgsql security definer set search_path = public as $$
declare v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date; v_n int;
begin
  insert into gastos (fecha, categoria_id, descripcion, proveedor_id, moneda, importe, cotizacion, origen, gasto_fijo_id, periodo)
  select (m.mes + (f.dia - 1))::date, f.categoria_id, f.descripcion, f.proveedor_id, f.moneda, f.importe,
         case when f.moneda = 'USD' then (select dolar from configuracion_gastos) else 1 end, 'fijo', f.id, m.mes
    from gastos_fijos f
    cross join lateral (select g::date as mes from generate_series(date_trunc('month', f.desde), date_trunc('month', v_hoy), interval '1 month') g) m
   where f.activo
     and (m.mes + (f.dia - 1))::date between f.desde and v_hoy
  on conflict (gasto_fijo_id, periodo) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public._generar_gastos_fijos() from public, anon, authenticated;

create function public.generar_gastos_fijos() returns int
language plpgsql security definer set search_path = public as $$
begin
  if not tiene_permiso('gastos.gestionar') then raise exception 'No tenés permiso para ver los gastos'; end if;
  return _generar_gastos_fijos();
end $$;
revoke execute on function public.generar_gastos_fijos() from public, anon;
grant execute on function public.generar_gastos_fijos() to authenticated;

select cron.schedule('generar-gastos-fijos', '20 9 * * *', $$select public._generar_gastos_fijos()$$);

-- ── Gasto automático (para el sistema: WhatsApp, IA…) ──────────────────
-- Suma a un gasto acumulado por referencia (p. ej. uno por mes y servicio): cada mensaje cobrado de Meta suma
-- su parte al gasto «WhatsApp octubre». Interna: la llaman otras funciones de la base, nunca la app.
create function public._sumar_gasto_automatico(p_referencia text, p_categoria text, p_descripcion text,
                                               p_importe numeric, p_moneda text default 'USD', p_fecha date default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_cat bigint := (select id from gasto_categorias where lower(nombre) = lower(p_categoria));
begin
  if coalesce(p_importe, 0) <= 0 then return null; end if;
  if v_cat is null then raise exception 'No existe la categoría de gastos «%»', p_categoria; end if;
  insert into gastos (fecha, categoria_id, descripcion, moneda, importe, cotizacion, origen, referencia)
  values (coalesce(p_fecha, (now() at time zone 'America/Argentina/Buenos_Aires')::date), v_cat, p_descripcion, p_moneda, p_importe,
          case when p_moneda = 'USD' then (select dolar from configuracion_gastos) else 1 end, 'automatico', p_referencia)
  on conflict (referencia) do update set importe = gastos.importe + excluded.importe
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public._sumar_gasto_automatico(text, text, text, numeric, text, date) from public, anon, authenticated;

-- ── Pérdidas: lo fallado que se dio de baja, a su costo ────────────────
-- Para el resultado del mes (la tabla fallados tiene costos: esta vista solo con costos.ver + gastos)
create view public.v_perdidas_fallados with (security_invoker = false) as
select (f.resuelto_en at time zone 'America/Argentina/Buenos_Aires')::date as dia, f.cantidad, f.cantidad * f.costo_unitario as costo
  from fallados f
 where f.estado = 'baja' and tiene_permiso('costos.ver') and tiene_permiso('gastos.gestionar');
revoke select on public.v_perdidas_fallados from anon;
grant select on public.v_perdidas_fallados to authenticated;
