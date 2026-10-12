-- Crédito con proveedores.
-- Lo fallado que se le devuelve a un proveedor queda como CRÉDITO a su costo. Al cargar la próxima factura de
-- ese proveedor se descuenta: la factura queda con su total, el crédito aplicado y lo que queda a pagar.
-- El costo de la mercadería nueva NO cambia (el crédito recupera lo fallado, no abarata lo que llega). Si el
-- proveedor repone la prenda en vez de dar crédito, es lo mismo: se carga la factura y se descuenta el crédito.
-- También se puede ajustar a mano, con nota («no lo reconoció», «lo devolvió en efectivo»).

-- ── La cuenta de cada proveedor ───────────────────────────────────────
create table public.creditos_proveedor (
  id            bigint generated always as identity primary key,
  fecha         timestamptz not null default now(),
  proveedor_id  bigint not null references public.proveedores (id) on delete restrict,
  tipo          text not null check (tipo in ('devolucion', 'descuento', 'ajuste')),
  monto         numeric(12,2) not null check (monto <> 0),         -- + crédito a favor del local · − se usó
  fallado_id    bigint unique references public.fallados (id) on delete restrict,   -- de qué devolución al proveedor
  compra_id     bigint references public.compras (id) on delete restrict,           -- en qué factura se descontó
  nota          text,
  usuario_id    uuid default auth.uid() references public.perfiles (id) on delete set null,
  check (tipo <> 'devolucion' or (monto > 0 and fallado_id is not null)),
  check (tipo <> 'descuento' or (monto < 0 and compra_id is not null)),
  check (tipo <> 'ajuste' or length(trim(coalesce(nota, ''))) > 0)
);
create index creditos_proveedor_proveedor_id_idx on public.creditos_proveedor (proveedor_id);
create index creditos_proveedor_compra_id_idx on public.creditos_proveedor (compra_id);
create index creditos_proveedor_usuario_id_idx on public.creditos_proveedor (usuario_id);

alter table public.creditos_proveedor enable row level security;
-- Son costos: los ve quien carga compras o quien ve costos. Se escribe solo por las funciones de abajo.
create policy "ve creditos de proveedores" on public.creditos_proveedor for select to authenticated
  using (tiene_permiso('compras.registrar') or tiene_permiso('costos.ver'));

-- Lo devuelto antes de esta migración también es crédito
insert into public.creditos_proveedor (fecha, proveedor_id, tipo, monto, fallado_id, usuario_id, nota)
select resuelto_en, proveedor_id, 'devolucion', cantidad * costo_unitario, id, resuelto_por, nota
  from public.fallados where estado = 'proveedor' and cantidad * costo_unitario > 0;

-- Saldo por proveedor (lo que todavía se puede descontar)
create view public.v_credito_proveedores with (security_invoker = false) as
select pr.id as proveedor_id, pr.nombre,
       sum(c.monto) as saldo,
       coalesce(sum(c.monto) filter (where c.monto > 0), 0) as a_favor,   -- fallados devueltos y ajustes que suman
       coalesce(-sum(c.monto) filter (where c.monto < 0), 0) as usado,    -- descontado de facturas y ajustes que restan
       max(c.fecha) as ultimo
from creditos_proveedor c join proveedores pr on pr.id = c.proveedor_id
where tiene_permiso('compras.registrar') or tiene_permiso('costos.ver')
group by pr.id, pr.nombre;
revoke select on public.v_credito_proveedores from anon;
grant select on public.v_credito_proveedores to authenticated;

create function public._saldo_proveedor(p_proveedor bigint) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(monto), 0) from creditos_proveedor where proveedor_id = p_proveedor
$$;
revoke execute on function public._saldo_proveedor(bigint) from public, anon, authenticated;

-- ── La factura: total, crédito aplicado y lo que queda a pagar ─────────
alter table public.compras add column credito_aplicado numeric(12,2) not null default 0;
alter table public.compras add constraint compras_credito_hasta_el_total check (credito_aplicado >= 0 and credito_aplicado <= total);

-- Descontar crédito de una factura de ese proveedor (al cargarla o después)
create function public.aplicar_credito_proveedor(p_compra bigint, p_monto numeric) returns numeric
language plpgsql security definer set search_path = public as $$
declare c compras; v_saldo numeric;
begin
  if not tiene_permiso('compras.registrar') then raise exception 'No tenés permiso para cargar compras'; end if;
  select * into c from compras where id = p_compra for update;
  if not found then raise exception 'La compra no existe'; end if;
  if c.proveedor_id is null then raise exception 'La compra no tiene proveedor: no hay crédito que descontar'; end if;
  if coalesce(p_monto, 0) <= 0 then raise exception 'El monto a descontar tiene que ser mayor que cero'; end if;
  perform 1 from proveedores where id = c.proveedor_id for update;   -- dos facturas a la vez no usan el mismo crédito
  v_saldo := _saldo_proveedor(c.proveedor_id);
  if p_monto > v_saldo + 0.005 then raise exception 'El crédito con este proveedor es de $%', to_char(v_saldo, 'FM999G999G990D00'); end if;
  if c.credito_aplicado + p_monto > c.total + 0.005 then
    raise exception 'A esta factura le quedan $% por pagar: no se puede descontar más', to_char(c.total - c.credito_aplicado, 'FM999G999G990D00');
  end if;
  insert into creditos_proveedor (proveedor_id, tipo, monto, compra_id) values (c.proveedor_id, 'descuento', -p_monto, p_compra);
  update compras set credito_aplicado = credito_aplicado + p_monto where id = p_compra;
  return p_monto;
end $$;

-- Ajuste a mano (con nota): + si el proveedor da crédito por otra cosa; − si no lo reconoció o lo pagó de otra forma
create function public.ajustar_credito_proveedor(p_proveedor bigint, p_monto numeric, p_nota text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (tiene_permiso('proveedores.gestionar') and tiene_permiso('costos.ver')) then raise exception 'No tenés permiso para ajustar el crédito con proveedores'; end if;
  if coalesce(p_monto, 0) = 0 then raise exception 'El ajuste no puede ser cero'; end if;
  if coalesce(trim(p_nota), '') = '' then raise exception 'Contá por qué se ajusta (la nota es obligatoria)'; end if;
  perform 1 from proveedores where id = p_proveedor for update;
  if not found then raise exception 'El proveedor no existe'; end if;
  if _saldo_proveedor(p_proveedor) + p_monto < -0.005 then
    raise exception 'El crédito con este proveedor es de $%: no puede quedar negativo', to_char(_saldo_proveedor(p_proveedor), 'FM999G999G990D00');
  end if;
  insert into creditos_proveedor (proveedor_id, tipo, monto, nota) values (p_proveedor, 'ajuste', p_monto, trim(p_nota));
end $$;

revoke execute on function public.aplicar_credito_proveedor(bigint, numeric), public.ajustar_credito_proveedor(bigint, numeric, text) from public, anon;
grant execute on function public.aplicar_credito_proveedor(bigint, numeric), public.ajustar_credito_proveedor(bigint, numeric, text) to authenticated;

-- ── Devolver al proveedor ahora suma el crédito ───────────────────────
create or replace function public.resolver_fallado(p_fallado bigint, p_salida text, p_cantidad int default null,
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
  -- Devuelto al proveedor: queda como crédito a su costo, para descontar de su próxima factura
  if p_salida = 'proveedor' and v_cant * f.costo_unitario > 0 then
    insert into creditos_proveedor (proveedor_id, tipo, monto, fallado_id, nota)
    values (v_prov, 'devolucion', v_cant * f.costo_unitario, v_id, nullif(trim(p_nota), ''));
  end if;
  return v_id;
end $$;
