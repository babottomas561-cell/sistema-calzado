-- Cobro en el mostrador: redondeo del efectivo y fotos en el catálogo de la caja.
--
-- Redondeo: cuando el cliente paga en efectivo, el cajero puede bajar lo que cobra a un número redondo ($86.437 → $86.400).
--   · Solo hacia abajo (a favor del cliente) y solo con medios de tipo «Efectivo».
--   · Tiene tope para que no sea un descuento encubierto: hasta el 5 % de lo que se cobra con ese medio y nunca más de $1.000.
--   · Queda dentro del ajuste del pago (así monto = base + ajuste sigue siendo lo que entró a caja y el total de la venta cuadra igual que
--     siempre) y además anotado aparte en `pagos.redondeo`, para mostrarlo como «Redondeo» en el comprobante y en la venta.
--   · Una devolución devuelve lo pagado de verdad: el redondeo ya está descontado.

alter table public.pagos add column redondeo numeric(12,2) not null default 0 check (redondeo >= 0);

create or replace function public._registrar_venta(
  p_items jsonb, p_pagos jsonb, p_cliente bigint, p_descuento numeric,
  p_canal text, p_deposito bigint, p_notas text
) returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint; it jsonb; v_sub numeric; v_promos numeric; v_acum numeric; v_factor numeric; v_resto numeric;
        v_base numeric; v_pct numeric; v_aj numeric; v_red numeric; v_ajustes numeric := 0; v_pagos jsonb := '[]'; v_medio medios_pago;
        v_dep bigint := coalesce(p_deposito, deposito_principal()); v_disp int;
begin
  if jsonb_array_length(p_items) = 0 then raise exception 'La venta no tiene productos'; end if;
  select coalesce(sum((i->>'cantidad')::int * (i->>'precio_unitario')::numeric), 0),
         coalesce(sum(coalesce((i->>'descuento_promo')::numeric, 0)), 0),
         coalesce(sum(case when coalesce((i->>'acumula')::boolean, true)
                           then (i->>'cantidad')::int * (i->>'precio_unitario')::numeric - coalesce((i->>'descuento_promo')::numeric, 0) else 0 end), 0)
    into v_sub, v_promos, v_acum from jsonb_array_elements(p_items) i;
  if coalesce(p_descuento, 0) < 0 then raise exception 'El descuento no puede ser negativo'; end if;
  if p_descuento > v_sub - v_promos then raise exception 'El descuento es mayor que el total'; end if;
  v_factor := case when v_sub - v_promos > 0 then v_acum / (v_sub - v_promos) else 1 end;

  v_resto := v_sub - v_promos - p_descuento;
  for it in select * from jsonb_array_elements(p_pagos) loop
    select * into v_medio from medios_pago where id = (it->>'medio_pago_id')::bigint and activo;
    if not found then raise exception 'Medio de pago inexistente o desactivado'; end if;
    v_base := coalesce((it->>'base')::numeric, v_resto);
    if v_base <= 0 then continue; end if;
    if v_base > v_resto + 0.01 then raise exception 'Los pagos superan el total'; end if;
    v_pct := coalesce((it->>'ajuste_pct')::numeric, v_medio.ajuste_pct);
    if v_pct not between -100 and 100 then raise exception 'Ajuste de medio de pago inválido'; end if;
    v_aj := round(v_base * v_pct / 100 * v_factor, 2);
    -- Redondeo del efectivo: hacia abajo, con tope
    v_red := round(coalesce((it->>'redondeo')::numeric, 0), 2);
    if v_red < 0 then raise exception 'El redondeo no puede ser negativo'; end if;
    if v_red > 0 then
      if v_medio.tipo is distinct from 'Efectivo' then raise exception 'Solo se puede redondear lo que se paga en efectivo'; end if;
      if v_red > least(1000, round((v_base + v_aj) * 0.05, 2)) then
        raise exception 'El redondeo es demasiado grande: hasta el 5 %% de lo que se cobra en efectivo y nunca más de $ 1.000';
      end if;
    end if;
    v_pagos := v_pagos || jsonb_build_object('medio_pago_id', v_medio.id, 'base', v_base, 'ajuste_pct', v_pct,
                                             'ajuste', v_aj - v_red, 'redondeo', v_red, 'cuotas', v_medio.cuotas, 'referencia', it->>'referencia');
    v_ajustes := v_ajustes + v_aj - v_red;
    v_resto := v_resto - v_base;
  end loop;

  insert into ventas (cliente_id, deposito_id, canal, subtotal, descuento, descuento_promociones, ajuste_medio_pago, total, notas)
  values (p_cliente, v_dep, p_canal, v_sub, p_descuento, v_promos, v_ajustes, v_sub - p_descuento - v_promos + v_ajustes, p_notas)
  returning id into v_id;

  for it in select * from jsonb_array_elements(p_items) loop
    if (it->>'cantidad')::int <= 0 then raise exception 'Cantidad inválida'; end if;
    select cantidad - reservado into v_disp from stock
     where variante_id = (it->>'variante_id')::bigint and deposito_id = v_dep for update;
    if coalesce(v_disp, 0) < (it->>'cantidad')::int then
      raise exception 'Stock insuficiente: hay % disponibles y se quieren vender %', coalesce(v_disp, 0), it->>'cantidad';
    end if;
    insert into venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario, descuento_promo, promocion_id)
    select v_id, v.id, (it->>'cantidad')::int, (it->>'precio_unitario')::numeric, p.precio_compra,
           coalesce((it->>'descuento_promo')::numeric, 0), (it->>'promocion_id')::bigint
      from variantes v join productos p on p.id = v.producto_id where v.id = (it->>'variante_id')::bigint;
    perform _mover_stock((it->>'variante_id')::bigint, v_dep, -(it->>'cantidad')::int, 'venta', v_id);
  end loop;

  insert into pagos (venta_id, medio_pago_id, base, ajuste_pct, ajuste, redondeo, cuotas, referencia)
  select v_id, (x->>'medio_pago_id')::bigint, (x->>'base')::numeric, (x->>'ajuste_pct')::numeric,
         (x->>'ajuste')::numeric, (x->>'redondeo')::numeric, (x->>'cuotas')::int, x->>'referencia'
    from jsonb_array_elements(v_pagos) x;
  return v_id;
end $$;
revoke execute on function public._registrar_venta(jsonb, jsonb, bigint, numeric, text, bigint, text) from public, anon, authenticated;

-- El comprobante muestra el redondeo aparte del descuento por medio de pago
create or replace function public._comprobante_venta(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v ventas; v_cliente text; v_atendio text; v_cobrado numeric; v_red numeric; v_medio numeric; v_totales jsonb;
begin
  select * into v from ventas where id = p_id;
  if not found then return null; end if;
  select nombre into v_cliente from clientes where id = v.cliente_id;
  select nullif(split_part(nombre, ' ', 1), '') into v_atendio from perfiles where id = v.usuario_id;
  select coalesce(sum(base), 0), coalesce(sum(redondeo), 0) into v_cobrado, v_red from pagos where venta_id = v.id;
  v_medio := v.ajuste_medio_pago + v_red;   -- el descuento o recargo del medio, sin el redondeo
  v_totales := jsonb_build_array(jsonb_build_object('rotulo', 'Subtotal', 'monto', v.subtotal));
  if v.descuento_promociones > 0 then v_totales := v_totales || jsonb_build_object('rotulo', 'Promociones', 'monto', -v.descuento_promociones); end if;
  if v.descuento > 0 then v_totales := v_totales || jsonb_build_object('rotulo', 'Descuento', 'monto', -v.descuento); end if;
  if v_medio <> 0 then
    v_totales := v_totales || jsonb_build_object('rotulo', case when v_medio < 0 then 'Descuento por medio de pago' else 'Recargo por medio de pago' end, 'monto', v_medio);
  end if;
  if v_red > 0 then v_totales := v_totales || jsonb_build_object('rotulo', 'Redondeo', 'monto', -v_red); end if;
  v_totales := v_totales || jsonb_build_object('rotulo', 'Total', 'monto', v.total, 'fuerte', true);
  return jsonb_build_object(
    'tipo', 'venta', 'titulo', 'Comprobante de venta', 'numero', v.comprobante, 'fecha', v.fecha, 'anulada', v.anulada_en is not null,
    'cliente', v_cliente, 'atendio', v_atendio,
    'renglones', (select coalesce(jsonb_agg(jsonb_build_object('detalle', p.nombre, 'marca', m.nombre, 'variante', 'Talle ' || t.nombre || ' · ' || co.nombre, 'cantidad', vi.cantidad,
                    'precio', vi.precio_unitario, 'promocion', pr.nombre, 'descuento', vi.descuento_promo, 'subtotal', vi.cantidad * vi.precio_unitario - vi.descuento_promo) order by vi.id), '[]')
                    from venta_items vi join variantes va on va.id = vi.variante_id join productos p on p.id = va.producto_id join talles t on t.id = va.talle_id
                    join colores co on co.id = va.color_id left join marcas m on m.id = p.marca_id left join promociones pr on pr.id = vi.promocion_id where vi.venta_id = v.id),
    'totales', v_totales,
    'pagos', (select coalesce(jsonb_agg(jsonb_build_object('medio', mp.nombre, 'base', pg.base, 'ajuste_pct', pg.ajuste_pct, 'ajuste', pg.ajuste, 'monto', pg.monto, 'cuotas', pg.cuotas,
                    'referencia', pg.referencia) order by pg.id), '[]') from pagos pg join medios_pago mp on mp.id = pg.medio_pago_id where pg.venta_id = v.id),
    'saldo', greatest(v.subtotal - v.descuento - v.descuento_promociones - v_cobrado, 0));
end $$;
revoke execute on function public._comprobante_venta(bigint) from public, anon, authenticated;

-- v_stock trae la foto principal (al final: las pantallas que ya la usan siguen igual). La caja muestra fotos para elegir sin lector.
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
       p.escala, p.genero, p.temporada, c.linea,
       v.codigo_barras, p.imagen_url
from variantes v
join productos p on p.id = v.producto_id
join talles t on t.id = v.talle_id
join colores co on co.id = v.color_id
cross join depositos d
left join stock s on s.variante_id = v.id and s.deposito_id = d.id
left join marcas m on m.id = p.marca_id
left join categorias c on c.id = p.categoria_id
where d.vendible and (tiene_permiso('stock.ver') or tiene_permiso('ventas.registrar'));
