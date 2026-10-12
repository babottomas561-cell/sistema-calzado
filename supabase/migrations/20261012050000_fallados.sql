-- Fallados (paso 3 de docs/DEVOLUCIONES.md).
-- Lo que está roto o vino mal no se vende por error: va a un depósito «Fallados» que NO vende, y queda
-- en una bandeja hasta que se resuelve: se arregló (vuelve a la venta), se le devuelve al proveedor
-- (crédito con él, a su costo) o se da de baja (pérdida a su costo).

-- ── Depósitos que venden y que no ─────────────────────────────────────
alter table public.depositos add column vendible boolean not null default true;
insert into public.depositos (nombre, vendible) values ('Fallados', false) on conflict (nombre) do update set vendible = false;

-- El depósito de siempre (ventas, pedidos, compras, ajustes): el primero activo que vende
create or replace function public.deposito_principal() returns bigint language sql stable set search_path = public as $$
  select id from depositos where activo and vendible order by id limit 1;
$$;
-- A dónde va lo fallado
create function public.deposito_fallados() returns bigint language sql stable set search_path = public as $$
  select id from depositos where activo and not vendible order by id limit 1;
$$;

-- Tipos de movimiento nuevos: pasar entre depósitos, devolver al proveedor y dar de baja
alter table public.movimientos_stock drop constraint movimientos_stock_tipo_check;
alter table public.movimientos_stock add constraint movimientos_stock_tipo_check
  check (tipo in ('venta', 'compra', 'ajuste', 'anulacion', 'transferencia', 'devolucion_proveedor', 'baja'));

-- Candado: en un depósito que no vende no se vende, ni se compra, ni se ajusta, ni se reserva.
-- Va en la base (no en cada función) para que ningún camino, ni los que vengan, lo saltee.
create function public._deposito_que_no_vende() returns trigger language plpgsql set search_path = public as $$
begin
  if TG_TABLE_NAME = 'movimientos_stock' then
    if new.tipo in ('venta', 'compra', 'ajuste', 'anulacion') and not (select vendible from depositos where id = new.deposito_id) then
      raise exception 'En «%» no se vende, no se compra ni se ajusta: lo fallado se maneja desde la bandeja de fallados',
        (select nombre from depositos where id = new.deposito_id);
    end if;
  elsif new.reservado > 0 and not (select vendible from depositos where id = new.deposito_id) then
    raise exception 'No se puede reservar stock de un depósito que no vende';
  end if;
  return new;
end $$;
create trigger movimientos_deposito_que_no_vende before insert on public.movimientos_stock
  for each row execute function public._deposito_que_no_vende();
create trigger stock_deposito_que_no_vende before insert or update of reservado on public.stock
  for each row execute function public._deposito_que_no_vende();

-- ── La tienda, el stock y la reposición miran solo los depósitos que venden ──
create or replace view public.v_catalogo as
select v.id as variante_id, p.id as producto_id, p.nombre, m.nombre as marca, c.nombre as categoria,
       p.genero, p.escala, p.descripcion, p.imagen_url, t.nombre as talle, t.orden as talle_orden, co.nombre as color, co.hex as color_hex,
       coalesce(v.precio_venta, p.precio_venta) as precio,
       greatest(coalesce(sum(s.cantidad - s.reservado), 0), 0)::int as disponible,
       p.temporada, p.material, c.linea, p.creado_en
from variantes v
join productos p on p.id = v.producto_id
join talles t on t.id = v.talle_id
join colores co on co.id = v.color_id
left join marcas m on m.id = p.marca_id
left join categorias c on c.id = p.categoria_id
left join stock s on s.variante_id = v.id and s.deposito_id in (select id from depositos where vendible)
where p.publicado_web and p.activo
group by v.id, p.id, m.nombre, c.nombre, c.linea, t.nombre, t.orden, co.nombre, co.hex;

create or replace view public.v_stock with (security_invoker = false) as
select v.id as variante_id, p.id as producto_id, p.codigo, p.nombre, m.nombre as marca, c.nombre as categoria,
       t.nombre as talle, t.orden as talle_orden, co.nombre as color, co.hex as color_hex,
       v.sku, d.id as deposito_id, d.nombre as deposito,
       coalesce(s.cantidad, 0) as stock, coalesce(s.reservado, 0) as reservado,
       coalesce(s.cantidad, 0) - coalesce(s.reservado, 0) as disponible, v.stock_minimo,
       case when tiene_permiso('costos.ver') then p.precio_compra end as precio_compra,
       coalesce(v.precio_venta, p.precio_venta) as precio_venta,
       case when tiene_permiso('costos.ver') then coalesce(s.cantidad, 0) * p.precio_compra end as valor_costo,
       coalesce(s.cantidad, 0) - coalesce(s.reservado, 0) <= v.stock_minimo as stock_bajo,
       p.escala, p.genero, p.temporada, c.linea
from variantes v
join productos p on p.id = v.producto_id
join talles t on t.id = v.talle_id
join colores co on co.id = v.color_id
cross join depositos d
left join stock s on s.variante_id = v.id and s.deposito_id = d.id
left join marcas m on m.id = p.marca_id
left join categorias c on c.id = p.categoria_id
-- Solo los depósitos que venden: lo fallado se ve en v_fallados (así ninguna pantalla duplica filas)
where d.vendible and (tiene_permiso('stock.ver') or tiene_permiso('ventas.registrar'));

create or replace function public.reposicion_sugerida(p_dias_ventas integer default 60, p_dias_cobertura integer default 30)
returns table(producto_id bigint, codigo text, nombre text, marca text, proveedor_id bigint, proveedor text, variante_id bigint,
              talle text, talle_orden numeric, color text, color_hex text, vendidos integer, disponible integer, sugerido integer, costo_unitario numeric)
language plpgsql stable security definer set search_path to 'public' as $function$
#variable_conflict use_column
begin
  if not (tiene_permiso('compras.registrar') or tiene_permiso('stock.ver')) then
    raise exception 'No tenés permiso para ver la reposición';
  end if;
  if p_dias_ventas not between 7 and 365 or p_dias_cobertura not between 7 and 180 then
    raise exception 'Elegí un período de ventas de 7 a 365 días y una cobertura de 7 a 180 días';
  end if;

  return query
  with vendidas as (
    select vi.variante_id, sum(vi.cantidad)::int as pares
      from venta_items vi join ventas ve on ve.id = vi.venta_id
     where ve.fecha >= now() - make_interval(days => p_dias_ventas) and ve.anulada_en is null
     group by vi.variante_id
  ), calculo as (
    select v.id as variante_id, v.producto_id, v.stock_minimo,
           coalesce(vd.pares, 0) as vendidos,
           coalesce(sum(s.cantidad - s.reservado), 0)::int as disponible,
           case when coalesce(vd.pares, 0) = 0 then 0
                else greatest(ceil(vd.pares::numeric / p_dias_ventas * p_dias_cobertura)::int, v.stock_minimo) end as objetivo
      from variantes v
      join productos p on p.id = v.producto_id
      left join vendidas vd on vd.variante_id = v.id
      -- lo fallado no cuenta como stock para vender
      left join stock s on s.variante_id = v.id and s.deposito_id in (select id from depositos where vendible)
     where p.activo
     group by v.id, vd.pares
  )
  select p.id, p.codigo, p.nombre, m.nombre, pv.id, pv.nombre,
         c.variante_id, t.nombre, t.orden, co.nombre, co.hex,
         c.vendidos, c.disponible, greatest(c.objetivo - c.disponible, 0),
         case when tiene_permiso('costos.ver') then coalesce(pp.precio_compra, p.precio_compra) end
    from calculo c
    join productos p on p.id = c.producto_id
    join variantes v on v.id = c.variante_id
    join talles t on t.id = v.talle_id
    join colores co on co.id = v.color_id
    left join marcas m on m.id = p.marca_id
    left join producto_proveedores pp on pp.producto_id = p.id and pp.principal
    left join proveedores pv on pv.id = pp.proveedor_id
   where c.objetivo - c.disponible > 0
   order by pv.nombre nulls last, p.nombre, co.nombre, t.orden;
end $function$;

-- ── La bandeja de fallados ────────────────────────────────────────────
-- Una fila por tanda (N unidades de una variante). Al resolver una parte, la fila se parte en dos.
create table public.fallados (
  id                  bigint generated always as identity primary key,
  fecha               timestamptz not null default now(),
  variante_id         bigint not null references public.variantes (id) on delete restrict,
  cantidad            int not null check (cantidad > 0),
  origen              text not null check (origen in ('local', 'cliente')),   -- encontrado en el local / lo devolvió un cliente
  venta_id            bigint references public.ventas (id) on delete restrict, -- si vino de una devolución
  deposito_origen_id  bigint not null references public.depositos (id) on delete restrict,  -- a dónde vuelve si se arregla
  motivo              text not null check (length(trim(motivo)) > 0),
  costo_unitario      numeric(12,2) not null default 0 check (costo_unitario >= 0),   -- el de ese momento: crédito o pérdida
  estado              text not null default 'pendiente' check (estado in ('pendiente', 'arreglado', 'proveedor', 'baja')),
  proveedor_id        bigint references public.proveedores (id) on delete restrict,   -- a quién se le devolvió
  nota                text,                                                           -- de la resolución
  resuelto_en         timestamptz,
  resuelto_por        uuid references public.perfiles (id) on delete set null,
  usuario_id          uuid default auth.uid() references public.perfiles (id) on delete set null,
  check ((estado = 'pendiente') = (resuelto_en is null)),
  check (estado <> 'proveedor' or proveedor_id is not null)
);
create index fallados_variante_id_idx on public.fallados (variante_id);
create index fallados_venta_id_idx on public.fallados (venta_id);
create index fallados_deposito_origen_id_idx on public.fallados (deposito_origen_id);
create index fallados_proveedor_id_idx on public.fallados (proveedor_id);
create index fallados_resuelto_por_idx on public.fallados (resuelto_por);
create index fallados_usuario_id_idx on public.fallados (usuario_id);
create index fallados_pendientes_idx on public.fallados (estado) where estado = 'pendiente';

alter table public.fallados enable row level security;
-- Tiene costos: la tabla, solo con "Ver costos". El resto del equipo lee v_fallados (costo vacío).
-- Se escribe solo por las funciones de abajo.
create policy "ve fallados con costos" on public.fallados for select to authenticated using (tiene_permiso('costos.ver'));

create view public.v_fallados with (security_invoker = false) as
select f.id, f.fecha, f.variante_id, p.id as producto_id, p.codigo, p.nombre, m.nombre as marca, p.imagen_url,
       t.nombre as talle, t.orden as talle_orden, co.nombre as color, co.hex as color_hex, v.sku,
       f.cantidad, f.origen, f.venta_id, ve.comprobante as venta_comprobante, f.motivo, f.estado, f.nota,
       f.proveedor_id, pr.nombre as proveedor,
       pp.proveedor_id as proveedor_principal_id, prp.nombre as proveedor_principal,
       f.resuelto_en, coalesce(pe.nombre, 'Sin registrar') as resuelto_por, coalesce(pc.nombre, 'Sin registrar') as cargado_por,
       case when tiene_permiso('costos.ver') then f.costo_unitario end as costo_unitario,
       case when tiene_permiso('costos.ver') then f.cantidad * f.costo_unitario end as valor_costo
from fallados f
join variantes v on v.id = f.variante_id
join productos p on p.id = v.producto_id
join talles t on t.id = v.talle_id
join colores co on co.id = v.color_id
left join marcas m on m.id = p.marca_id
left join ventas ve on ve.id = f.venta_id
left join proveedores pr on pr.id = f.proveedor_id
left join producto_proveedores pp on pp.producto_id = p.id and pp.principal
left join proveedores prp on prp.id = pp.proveedor_id
left join perfiles pe on pe.id = f.resuelto_por
left join perfiles pc on pc.id = f.usuario_id
where tiene_permiso('stock.ver');
revoke select on public.v_fallados from anon;
grant select on public.v_fallados to authenticated;

-- Mover a fallados: sale de un depósito que vende y entra a Fallados, con su tanda en la bandeja
create function public.mover_a_fallados(p_variante bigint, p_cantidad int, p_motivo text, p_deposito bigint default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_dep bigint := coalesce(p_deposito, deposito_principal()); v_fall bigint := deposito_fallados(); v_disp int; v_id bigint;
begin
  if not tiene_permiso('stock.ajustar') then raise exception 'No tenés permiso para mover stock a fallados'; end if;
  if coalesce(p_cantidad, 0) <= 0 then raise exception 'La cantidad tiene que ser mayor que cero'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Contá qué tiene (el motivo es obligatorio)'; end if;
  if v_fall is null then raise exception 'No hay un depósito de fallados'; end if;
  if not (select vendible from depositos where id = v_dep) then raise exception 'Eso ya está en fallados'; end if;
  select cantidad - reservado into v_disp from stock where variante_id = p_variante and deposito_id = v_dep for update;
  if coalesce(v_disp, 0) < p_cantidad then
    raise exception 'Hay % disponibles (lo reservado en pedidos no se puede mover)', coalesce(v_disp, 0);
  end if;
  perform _mover_stock(p_variante, v_dep, -p_cantidad, 'transferencia', null, null, 'A fallados: ' || trim(p_motivo));
  perform _mover_stock(p_variante, v_fall, p_cantidad, 'transferencia', null, null, 'A fallados: ' || trim(p_motivo));
  insert into fallados (variante_id, cantidad, origen, deposito_origen_id, motivo, costo_unitario)
  select p_variante, p_cantidad, 'local', v_dep, trim(p_motivo), coalesce(p.precio_compra, 0)
    from variantes v join productos p on p.id = v.producto_id where v.id = p_variante
  returning id into v_id;
  return v_id;
end $$;

-- Resolver una tanda (toda o una parte): 'arreglado' | 'proveedor' | 'baja'
create function public.resolver_fallado(p_fallado bigint, p_salida text, p_cantidad int default null,
                                        p_proveedor bigint default null, p_nota text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare f fallados; v_cant int; v_fall bigint := deposito_fallados(); v_id bigint; v_prov bigint; v_det text;
begin
  if not tiene_permiso('stock.ajustar') then raise exception 'No tenés permiso para resolver fallados'; end if;
  select * into f from fallados where id = p_fallado for update;
  if not found then raise exception 'No existe ese fallado'; end if;
  if f.estado <> 'pendiente' then raise exception 'Ese fallado ya se resolvió'; end if;
  if p_salida not in ('arreglado', 'proveedor', 'baja') then raise exception 'Elegí qué pasó con el fallado'; end if;
  v_cant := coalesce(p_cantidad, f.cantidad);
  if v_cant <= 0 or v_cant > f.cantidad then raise exception 'La cantidad tiene que ser de 1 a %', f.cantidad; end if;

  if p_salida = 'proveedor' then
    -- Por defecto, el proveedor principal del artículo
    v_prov := coalesce(p_proveedor, (select pp.proveedor_id from producto_proveedores pp join variantes v on v.producto_id = pp.producto_id
                                      where v.id = f.variante_id and pp.principal));
    if v_prov is null then raise exception 'Elegí a qué proveedor se le devuelve'; end if;
  end if;
  v_det := case p_salida when 'arreglado' then 'Fallado arreglado' when 'proveedor' then 'Devuelto al proveedor' else 'Baja de fallado' end
           || coalesce(': ' || nullif(trim(p_nota), ''), '');

  -- Si es una parte, la tanda se parte: queda pendiente el resto y se resuelve una tanda nueva
  if v_cant < f.cantidad then
    update fallados set cantidad = cantidad - v_cant where id = f.id;
    insert into fallados (fecha, variante_id, cantidad, origen, venta_id, deposito_origen_id, motivo, costo_unitario, usuario_id)
    values (f.fecha, f.variante_id, v_cant, f.origen, f.venta_id, f.deposito_origen_id, f.motivo, f.costo_unitario, f.usuario_id)
    returning id into v_id;
  else
    v_id := f.id;
  end if;

  if p_salida = 'arreglado' then
    perform _mover_stock(f.variante_id, v_fall, -v_cant, 'transferencia', null, null, v_det);
    perform _mover_stock(f.variante_id, f.deposito_origen_id, v_cant, 'transferencia', null, null, v_det);
  else
    perform _mover_stock(f.variante_id, v_fall, -v_cant, case p_salida when 'proveedor' then 'devolucion_proveedor' else 'baja' end, null, null, v_det);
  end if;

  update fallados set estado = p_salida, proveedor_id = v_prov, nota = nullif(trim(p_nota), ''),
                      resuelto_en = now(), resuelto_por = auth.uid()
   where id = v_id;
  return v_id;
end $$;

revoke execute on function public.mover_a_fallados(bigint, int, text, bigint) from public, anon;
revoke execute on function public.resolver_fallado(bigint, text, int, bigint, text) from public, anon;
grant execute on function public.mover_a_fallados(bigint, int, text, bigint) to authenticated;
grant execute on function public.resolver_fallado(bigint, text, int, bigint, text) to authenticated;
