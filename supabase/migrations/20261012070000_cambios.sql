-- Cambios en una sola operación (paso 5 de docs/DEVOLUCIONES.md).
-- Un cambio = una devolución + una venta nueva, juntas (si algo falla, no queda nada a medias):
--   · lo que trae vale lo que pagó (la cuenta de la devolución) y queda como saldo a favor;
--   · lo que se lleva del MISMO artículo (otro talle o color) vale lo mismo que lo que trae, aunque el precio
--     haya subido: diferencia cero (decidido por el dueño);
--   · lo demás va al precio y con las promociones de hoy;
--   · la venta nueva se paga primero con ese saldo; si cuesta más, la diferencia con el medio que elija
--     (con su descuento o recargo); si cuesta menos, la diferencia queda como saldo a favor.

-- La venta nueva que salió de un cambio
alter table public.devoluciones add column venta_cambio_id bigint unique references public.ventas (id) on delete restrict;

-- ── Repartir el saldo de una devolución entre sus renglones ───────────
-- En proporción al precio de lista; el último se lleva lo que falta. Lo usan la devolución y el cambio,
-- así los dos reparten igual.
create function public._repartir_devolucion(p_items jsonb, p_total numeric)
returns table (venta_item_id bigint, cantidad int, estado text, monto numeric, variante_id bigint, producto_id bigint, costo_unitario numeric)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare v_lista numeric; n int; k int := 0; v_asig numeric := 0; it record; v_m numeric;
begin
  select sum((i->>'cantidad')::int * vi.precio_unitario), count(*) into v_lista, n
    from jsonb_array_elements(p_items) i join venta_items vi on vi.id = (i->>'venta_item_id')::bigint;
  for it in select (i->>'venta_item_id')::bigint as vid, (i->>'cantidad')::int as cant, coalesce(i->>'estado', 'bueno') as est,
                   vi.variante_id as var, va.producto_id as prod, vi.precio_unitario as precio, vi.costo_unitario as costo
              from jsonb_array_elements(p_items) with ordinality x(i, o)
              join venta_items vi on vi.id = (i->>'venta_item_id')::bigint
              join variantes va on va.id = vi.variante_id
             order by o loop
    k := k + 1;
    v_m := case when k = n then p_total - v_asig else round(p_total * it.cant * it.precio / nullif(v_lista, 0), 2) end;
    v_asig := v_asig + coalesce(v_m, 0);
    venta_item_id := it.vid; cantidad := it.cant; estado := it.est; monto := greatest(coalesce(v_m, 0), 0);
    variante_id := it.var; producto_id := it.prod; costo_unitario := it.costo;
    return next;
  end loop;
end $$;
revoke execute on function public._repartir_devolucion(jsonb, numeric) from public, anon, authenticated;

-- La devolución, ahora con el reparto compartido (mismo comportamiento que antes)
create or replace function public.registrar_devolucion(p_venta bigint, p_items jsonb, p_motivo text, p_comentario text default null, p_cliente bigint default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare v ventas; r record; v_id bigint; v_cliente bigint; v_fuera boolean; it record; v_dep_fall bigint := deposito_fallados(); v_comp text;
begin
  if not tiene_permiso('ventas.registrar') then raise exception 'No tenés permiso para hacer devoluciones'; end if;
  select * into v from ventas where id = p_venta for update;
  if not found then raise exception 'La venta no existe'; end if;
  if p_motivo is null or p_motivo not in ('talle', 'no_gusto', 'fallado', 'otro') then raise exception 'Elegí el motivo de la devolución'; end if;
  if p_motivo = 'otro' and coalesce(trim(p_comentario), '') = '' then raise exception 'Contá qué pasó (el motivo es «otro»)'; end if;
  if exists (select 1 from jsonb_array_elements(p_items) i where coalesce(i->>'estado', 'bueno') not in ('bueno', 'fallado')) then
    raise exception 'Cada producto vuelve en buen estado o fallado';
  end if;

  v_fuera := (v.fecha at time zone 'America/Argentina/Buenos_Aires')::date + (select dias_cambio from configuracion_tienda) < _hoy_ar();
  if v_fuera and not tiene_permiso('devoluciones.fuera_de_plazo') then
    raise exception 'Pasó el plazo de cambios (% días desde la compra): solo la puede aceptar el encargado', (select dias_cambio from configuracion_tienda);
  end if;
  v_cliente := coalesce(v.cliente_id, p_cliente);
  if v_cliente is null then raise exception 'La devolución deja saldo a favor: elegí o cargá el cliente'; end if;

  select * into r from _calcular_devolucion(p_venta, p_items);
  insert into devoluciones (venta_id, cliente_id, motivo, comentario, bruto, total, fuera_de_plazo)
  values (p_venta, v_cliente, p_motivo, nullif(trim(p_comentario), ''), r.bruto, r.total, v_fuera)
  returning id, comprobante into v_id, v_comp;

  for it in select * from _repartir_devolucion(p_items, r.total) loop
    insert into devolucion_items (devolucion_id, venta_item_id, cantidad, estado, monto)
    values (v_id, it.venta_item_id, it.cantidad, it.estado, it.monto);
    if it.estado = 'bueno' then
      perform _mover_stock(it.variante_id, v.deposito_id, it.cantidad, 'devolucion', p_venta, null, 'Devolución ' || v_comp);
    else
      if v_dep_fall is null then raise exception 'No hay un depósito de fallados'; end if;
      perform _mover_stock(it.variante_id, v_dep_fall, it.cantidad, 'devolucion', p_venta, null, 'Devolución ' || v_comp || ' (fallado)');
      insert into fallados (variante_id, cantidad, origen, venta_id, deposito_origen_id, motivo, costo_unitario)
      values (it.variante_id, it.cantidad, 'cliente', p_venta, v.deposito_id,
              coalesce(nullif(trim(p_comentario), ''), 'Lo devolvió un cliente fallado'), coalesce(it.costo_unitario, 0));
    end if;
  end loop;

  if r.total > 0 then
    insert into saldos_cliente (cliente_id, tipo, monto, vence, devolucion_id)
    values (v_cliente, 'devolucion', r.total, _hoy_ar() + (select dias_saldo from configuracion_tienda), v_id);
  end if;
  return v_id;
end $$;

-- ── Armar lo que se lleva ─────────────────────────────────────────────
-- p_devueltos: [{producto_id, cantidad, monto}] (lo que trae, ya valuado)
-- p_lleva:     [{variante_id, cantidad}]
-- Devuelve los renglones de la venta nueva: lo del mismo artículo, al valor de lo que trae (sin promo);
-- lo demás, con el precio y las promociones de hoy (el mismo motor de la caja).
create function public._armar_cambio(p_devueltos jsonb, p_lleva jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare it record; v_pozo jsonb := '{}'; k text; v_q int; v_m numeric; v_par int; v_valor numeric; v_unit numeric;
        v_mismo jsonb := '[]'; v_hoy jsonb := '[]';
begin
  if jsonb_array_length(coalesce(p_lleva, '[]')) = 0 then raise exception 'Elegí qué se lleva (si no se lleva nada, es una devolución)'; end if;
  for it in select (d->>'producto_id')::bigint as prod, sum((d->>'cantidad')::int) as c, sum((d->>'monto')::numeric) as m
              from jsonb_array_elements(p_devueltos) d group by 1 loop
    v_pozo := v_pozo || jsonb_build_object(it.prod::text, jsonb_build_object('c', it.c, 'm', it.m));
  end loop;

  for it in select (l->>'variante_id')::bigint as variante_id, (l->>'cantidad')::int as cantidad, v.producto_id
              from jsonb_array_elements(p_lleva) l join variantes v on v.id = (l->>'variante_id')::bigint loop
    if it.cantidad is null or it.cantidad <= 0 then raise exception 'Las cantidades tienen que ser mayores que cero'; end if;
    k := it.producto_id::text; v_par := 0;
    if v_pozo ? k and (v_pozo->k->>'c')::int > 0 then
      v_q := (v_pozo->k->>'c')::int; v_m := (v_pozo->k->>'m')::numeric;
      v_par := least(it.cantidad, v_q);
      -- Lo que valen esas unidades (si se lleva todo lo que trajo de ese artículo, exactamente lo acreditado)
      v_valor := case when v_par = v_q then v_m else round(v_m * v_par / v_q, 2) end;
      v_unit := ceil(v_valor / v_par * 100) / 100;   -- precio por unidad; los centavos de más van como descuento
      v_mismo := v_mismo || jsonb_build_object('variante_id', it.variante_id, 'cantidad', v_par, 'precio_unitario', v_unit,
                                               'descuento_promo', v_unit * v_par - v_valor, 'promocion_id', null, 'acumula', true, 'mismo_articulo', true);
      v_pozo := jsonb_set(v_pozo, array[k], jsonb_build_object('c', v_q - v_par, 'm', v_m - v_valor));
    end if;
    if it.cantidad > v_par then
      v_hoy := v_hoy || jsonb_build_object('variante_id', it.variante_id, 'cantidad', it.cantidad - v_par, 'precio_unitario', precio_de(it.variante_id));
    end if;
  end loop;

  return v_mismo || (select coalesce(jsonb_agg(r || jsonb_build_object('mismo_articulo', false)), '[]')
                       from jsonb_array_elements(case when jsonb_array_length(v_hoy) > 0 then _renglones_cotizados(v_hoy, 'mostrador') else '[]' end) r);
end $$;
revoke execute on function public._armar_cambio(jsonb, jsonb) from public, anon, authenticated;

-- ── Para mostrar antes de confirmar ───────────────────────────────────
create function public.cotizar_cambio(p_venta bigint, p_devuelve jsonb, p_lleva jsonb, p_medio bigint default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record; v ventas; v_items jsonb; v_total numeric; v_acum numeric; v_usa numeric; v_dif numeric; v_pct numeric := 0; v_aj numeric; v_limite date;
begin
  if not tiene_permiso('ventas.registrar') then raise exception 'No tenés permiso para hacer cambios'; end if;
  select * into r from _calcular_devolucion(p_venta, p_devuelve);
  v_items := _armar_cambio((select coalesce(jsonb_agg(jsonb_build_object('producto_id', d.producto_id, 'cantidad', d.cantidad, 'monto', d.monto)), '[]')
                              from _repartir_devolucion(p_devuelve, r.total) d), p_lleva);
  select coalesce(sum((i->>'cantidad')::int * (i->>'precio_unitario')::numeric - (i->>'descuento_promo')::numeric), 0),
         coalesce(sum(case when coalesce((i->>'acumula')::boolean, true)
                           then (i->>'cantidad')::int * (i->>'precio_unitario')::numeric - (i->>'descuento_promo')::numeric else 0 end), 0)
    into v_total, v_acum from jsonb_array_elements(v_items) i;
  v_usa := least(r.total, v_total);
  v_dif := v_total - v_usa;
  select ajuste_pct into v_pct from medios_pago where id = p_medio and activo and en_mostrador and not es_saldo;
  v_aj := round(v_dif * coalesce(v_pct, 0) / 100 * case when v_total > 0 then v_acum / v_total else 1 end, 2);
  select * into v from ventas where id = p_venta;
  v_limite := (v.fecha at time zone 'America/Argentina/Buenos_Aires')::date + (select dias_cambio from configuracion_tienda);
  return jsonb_build_object('credito', r.total, 'lleva', v_items, 'total_nuevo', v_total, 'usa_saldo', v_usa,
                            'diferencia', v_dif, 'ajuste_medio', v_aj, 'a_pagar', v_dif + v_aj, 'queda_saldo', r.total - v_usa,
                            'limite', v_limite, 'fuera_de_plazo', v_limite < _hoy_ar(), 'vence_saldo', _hoy_ar() + (select dias_saldo from configuracion_tienda));
end $$;

-- ── El cambio ─────────────────────────────────────────────────────────
-- p_pagos: cómo paga la diferencia (si la hay), como en la caja: el último, sin "base", cubre lo que falte.
create function public.registrar_cambio(p_venta bigint, p_devuelve jsonb, p_lleva jsonb, p_pagos jsonb default '[]',
                                        p_motivo text default 'talle', p_comentario text default null, p_cliente bigint default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_dev bigint; d devoluciones; v ventas; v_items jsonb; v_total numeric; v_usa numeric; v_pagos jsonb; v_venta bigint;
begin
  -- 1) La devolución (permiso, plazo, cliente, stock que vuelve y saldo a favor)
  v_dev := registrar_devolucion(p_venta, p_devuelve, p_motivo, p_comentario, p_cliente);
  select * into d from devoluciones where id = v_dev;
  select * into v from ventas where id = p_venta;

  -- 2) Lo que se lleva, valuado
  v_items := _armar_cambio((select coalesce(jsonb_agg(jsonb_build_object('producto_id', va.producto_id, 'cantidad', di.cantidad, 'monto', di.monto)), '[]')
                              from devolucion_items di join venta_items vi on vi.id = di.venta_item_id join variantes va on va.id = vi.variante_id
                             where di.devolucion_id = v_dev), p_lleva);
  select coalesce(sum((i->>'cantidad')::int * (i->>'precio_unitario')::numeric - (i->>'descuento_promo')::numeric), 0)
    into v_total from jsonb_array_elements(v_items) i;

  -- 3) Se paga primero con el saldo de lo que trajo; la diferencia, con lo que eligió
  v_usa := least(d.total, v_total);
  if v_total - v_usa > 0.005 and jsonb_array_length(coalesce(p_pagos, '[]')) = 0 then
    raise exception 'Falta cobrar la diferencia de $%: elegí cómo la paga', to_char(v_total - v_usa, 'FM999G999G990');
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p_pagos, '[]')) p join medios_pago m on m.id = (p->>'medio_pago_id')::bigint where m.es_saldo) then
    raise exception 'La diferencia se paga con otro medio (el saldo del cambio ya se usa solo)';
  end if;
  v_pagos := case when v_usa > 0 then jsonb_build_array(jsonb_build_object('medio_pago_id', (select id from medios_pago where es_saldo), 'base', v_usa)) else '[]' end
             || coalesce(p_pagos, '[]');

  v_venta := _registrar_venta(v_items, v_pagos, d.cliente_id, 0, 'Local', null,
                              'Cambio: devolución ' || d.comprobante || ' de la venta ' || v.comprobante);
  update devoluciones set venta_cambio_id = v_venta where id = v_dev;
  return jsonb_build_object('devolucion_id', v_dev, 'venta_id', v_venta);
end $$;

revoke execute on function public.cotizar_cambio(bigint, jsonb, jsonb, bigint), public.registrar_cambio(bigint, jsonb, jsonb, jsonb, text, text, bigint) from public, anon;
grant execute on function public.cotizar_cambio(bigint, jsonb, jsonb, bigint), public.registrar_cambio(bigint, jsonb, jsonb, jsonb, text, text, bigint) to authenticated;
