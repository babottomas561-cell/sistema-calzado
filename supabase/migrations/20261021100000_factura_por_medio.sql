-- Medios de pago que van siempre con factura (por ejemplo tarjeta, transferencia o Mercado Pago: quedan registrados en el banco). Lo decide el dueño
-- en Tablas → Medios de pago. La caja lo muestra (pasa a «Con factura» y no deja cambiarlo), pero quien lo hace cumplir es la base: si una venta tiene
-- un pago con uno de esos medios, al guardarse queda creada su factura (pendiente) y la cola la manda a ARCA en el próximo minuto. Vale para cualquier
-- venta: caja, pedido entregado o cambio.

alter table public.medios_pago add column siempre_factura boolean not null default false;

-- Arma la factura de una venta (pendiente, sin mandarla). La usan facturar_venta (con sus permisos) y la factura automática por medio de pago.
create function public._factura_crear(p_venta bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare v ventas; c configuracion_fiscal; cl clientes; v_letra text; v_imp jsonb; v_pv int; v_doc_tipo int := 99; v_doc_nro text := '0'; v_id bigint;
        v_receptor text := 'A consumidor final'; v_dni text;
begin
  select * into c from configuracion_fiscal;
  if not c.activa then raise exception 'La facturación con ARCA no está activa (Integraciones → ARCA)'; end if;
  select * into v from ventas where id = p_venta;
  if not found then raise exception 'Esa venta no existe'; end if;
  if v.anulada_en is not null then raise exception 'La venta está anulada'; end if;
  select id into v_id from facturas where venta_id = p_venta and clase = 'factura' and estado <> 'cancelada';
  if v_id is not null then return v_id; end if;   -- ya tiene: se devuelve la misma (nunca dos)
  v_letra := _factura_letra();
  if v_letra is null then raise exception 'Falta la categoría de IVA del local (Integraciones → ARCA, paso 1)'; end if;
  select numero into v_pv from puntos_venta_fiscales where ambiente = c.ambiente and por_defecto and activo and not bloqueado and baja is null;
  if v_pv is null then raise exception 'Falta elegir el punto de venta de siempre (Integraciones → ARCA)'; end if;
  v_imp := _factura_importes(p_venta, v_letra);
  if v.cliente_id is not null then
    select * into cl from clientes where id = v.cliente_id;
    v_dni := regexp_replace(coalesce(cl.documento, ''), '\D', '', 'g');
    if v_dni ~ '^\d{7,8}$' then v_doc_tipo := 96; v_doc_nro := ltrim(v_dni, '0'); v_receptor := cl.nombre; end if;
  end if;
  if v_doc_tipo = 99 and (v_imp ->> 'total')::numeric >= c.umbral_identificacion then
    raise exception 'Para facturar % o más a consumidor final, ARCA pide el DNI: cargalo en la ficha del cliente de esta venta', '$ ' || replace(to_char(c.umbral_identificacion, 'FM999,999,999'), ',', '.');
  end if;
  insert into facturas (ambiente, letra, cbte_tipo, punto_venta, venta_id, cliente_id, receptor, doc_tipo, doc_nro, condicion_iva_receptor, fecha,
                        total, neto, iva, detalle_iva, creada_por)
  values (c.ambiente, v_letra, case v_letra when 'A' then 1 when 'B' then 6 else 11 end, v_pv, p_venta, v.cliente_id, v_receptor, v_doc_tipo, v_doc_nro, 5,
          (now() at time zone 'America/Argentina/Buenos_Aires')::date,
          (v_imp ->> 'total')::numeric, (v_imp ->> 'neto')::numeric, (v_imp ->> 'iva')::numeric, v_imp -> 'detalle', auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- facturar_venta: ahora usa _factura_crear. Si la venta ya tiene una factura que todavía no salió (por ejemplo, la automática del medio de pago), la manda
-- ya en vez de decir que ya tiene; si ya está autorizada, sí avisa.
create or replace function public.facturar_venta(p_venta bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v ventas; v_id bigint;
begin
  if not tiene_permiso('facturas.emitir') then raise exception 'No tenés permiso para facturar'; end if;
  select * into v from ventas where id = p_venta;
  if not found or not (tiene_permiso('ventas.ver_todas') or v.usuario_id = auth.uid()) then raise exception 'Esa venta no existe'; end if;
  if exists (select 1 from facturas where venta_id = p_venta and clase = 'factura' and estado = 'autorizada') then raise exception 'Esta venta ya tiene factura'; end if;
  v_id := _factura_crear(p_venta);
  perform _factura_enviar(v_id);
  return _factura_resumen(v_id);
end $$;
alter function public.facturar_venta(bigint) set statement_timeout = '55s';

-- Al guardar la venta (al final de la transacción: ya están todos los pagos y renglones): si algún pago es de un medio «siempre con factura»,
-- queda creada su factura. No llama a ARCA acá (la venta no espera): la manda la cola, o la caja enseguida. Si falta algo para facturar
-- (por ejemplo el DNI desde el umbral), la venta se guarda igual y la factura se hace desde la venta.
create function public._factura_por_medio() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not (select activa from configuracion_fiscal) then return null; end if;
  if not exists (select 1 from medios_pago where id = new.medio_pago_id and siempre_factura) then return null; end if;
  begin
    perform _factura_crear(new.venta_id);
  exception when others then null;
  end;
  return null;
end $$;
create constraint trigger pagos_factura_por_medio after insert on public.pagos deferrable initially deferred
  for each row execute function public._factura_por_medio();

-- La caja necesita saber qué medios fuerzan factura (ya lee medios_pago; facturacion_caja no cambia)

revoke execute on function public._factura_crear(bigint), public._factura_por_medio() from public, anon, authenticated;
