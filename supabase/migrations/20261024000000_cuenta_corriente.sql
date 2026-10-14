-- Cuenta corriente: un cliente habilitado puede comprar «a cuenta» y pagar después. Módulo APAGADO de fábrica (Equipo → Módulos).
--   · el medio de pago «Cuenta corriente» solo existe para la caja cuando el módulo está encendido;
--   · la base frena una venta a cuenta sin cliente, a un cliente no habilitado o que pasaría su tope;
--   · el libro `cc_movimientos` es la fuente del saldo (+ lo que debe, − lo que pagó); nunca se edita ni se borra;
--   · cobrar una deuda, ajustarla y habilitar clientes son permisos aparte; con contabilidad iniciada, cada cobro hace su asiento.
-- Agrega, no rompe: nada del sistema anterior cambia con el módulo apagado.

-- La clave del módulo es la ruta del menú (/admin/<clave>): se admite el guion
alter table public.modulos drop constraint modulos_clave_check, add constraint modulos_clave_check check (clave ~ '^[a-z_-]{2,40}$');
insert into public.modulos (clave, nombre, fijo, depende, activo) values ('cuenta-corriente', 'Cuenta corriente', false, '{clientes}', false);

insert into public.permisos (orden, grupo, codigo, nombre, descripcion) values
  (40, 'Clientes', 'cc.ver', 'Ver cuentas corrientes', 'Ver lo que debe cada cliente y su historial de la cuenta corriente.'),
  (41, 'Clientes', 'cc.cobrar', 'Cobrar cuenta corriente', 'Registrar lo que un cliente paga de su deuda y hacer ajustes (con nota).'),
  (42, 'Clientes', 'cc.habilitar', 'Habilitar cuenta corriente', 'Elegir qué clientes pueden comprar a cuenta y hasta cuánto.');
update public.roles set permisos = permisos || '{cc.ver,cc.cobrar,cc.habilitar}' where nombre = 'Encargado' and not todos;

alter table public.clientes
  add column cc_habilitada boolean not null default false,
  add column cc_tope numeric(12,2) not null default 0 check (cc_tope >= 0);

alter table public.medios_pago add column es_cuenta_corriente boolean not null default false;
create unique index medios_pago_una_cc on public.medios_pago (es_cuenta_corriente) where es_cuenta_corriente;
insert into public.medios_pago (codigo, nombre, tipo, ajuste_pct, cuotas, en_mostrador, en_tienda, activo, orden, es_cuenta_corriente, cuenta_id)
values ('CC', 'Cuenta corriente', 'Otro', 0, 1, true, false, false, 91, true, (select id from public.cuentas where clave = 'deudores_ventas'));
-- El medio acompaña al módulo: encendido se ofrece en la caja, apagado desaparece
create function public._cc_medio_sigue_al_modulo() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.clave = 'cuenta-corriente' and new.activo is distinct from old.activo then update medios_pago set activo = new.activo where es_cuenta_corriente; end if;
  return null;
end $$;
create trigger cc_medio_sigue_al_modulo after update of activo on public.modulos for each row execute function public._cc_medio_sigue_al_modulo();

create table public.cc_movimientos (
  id            bigint generated always as identity primary key,
  creado_en     timestamptz not null default now(),
  cliente_id    bigint not null references public.clientes (id) on delete restrict,
  tipo          text not null check (tipo in ('venta', 'cobro', 'anulacion', 'ajuste')),
  monto         numeric(12,2) not null check (monto <> 0),     -- + el cliente debe más; − pagó o se le descontó
  venta_id      bigint references public.ventas (id) on delete restrict,
  medio_pago_id bigint references public.medios_pago (id) on delete restrict,   -- con qué pagó (cobros)
  referencia    text,
  nota          text,
  usuario_id    uuid default auth.uid() references auth.users (id) on delete set null
);
create index cc_movimientos_cliente_id_idx on public.cc_movimientos (cliente_id);
create index cc_movimientos_venta_id_idx on public.cc_movimientos (venta_id);
create index cc_movimientos_medio_pago_id_idx on public.cc_movimientos (medio_pago_id);
create index cc_movimientos_usuario_id_idx on public.cc_movimientos (usuario_id);
alter table public.cc_movimientos enable row level security;
create policy "ve la cuenta corriente" on public.cc_movimientos for select to authenticated using (tiene_permiso('cc.ver'));
-- Solo se escribe por las funciones de abajo; el libro no se edita ni se borra
create function public._cc_inmutable() returns trigger language plpgsql as $$
begin raise exception 'Los movimientos de la cuenta corriente no se editan ni se borran: se corrigen con un ajuste'; end $$;
create trigger cc_inmutable before update or delete on public.cc_movimientos for each row execute function public._cc_inmutable();

create view public.v_cc_saldos with (security_invoker = true) as
  select c.id as cliente_id, c.nombre, c.cc_habilitada, c.cc_tope, coalesce(sum(m.monto), 0) as saldo, max(m.creado_en) as ultimo_movimiento
  from public.clientes c left join public.cc_movimientos m on m.cliente_id = c.id
  where c.cc_habilitada or exists (select 1 from public.cc_movimientos x where x.cliente_id = c.id)
  group by c.id;
grant select on public.v_cc_saldos to authenticated;

create function public._cc_saldo(p_cliente bigint) returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(monto), 0) from cc_movimientos where cliente_id = p_cliente $$;
revoke execute on function public._cc_saldo(bigint) from public, anon, authenticated;

-- Lo que necesita la caja al elegir cliente (cualquiera del equipo; solo con el módulo encendido)
create function public.cc_estado(p_cliente bigint) returns jsonb language sql stable security definer set search_path = public as $$
  select case when not es_staff() or not _modulo_activo('cuenta-corriente') then null
    else jsonb_build_object('habilitada', c.cc_habilitada, 'tope', c.cc_tope, 'saldo', _cc_saldo(c.id), 'disponible', greatest(c.cc_tope - _cc_saldo(c.id), 0)) end
  from clientes c where c.id = p_cliente $$;

-- Habilitar un cliente y fijar su tope
create function public.cc_habilitar(p_cliente bigint, p_habilitada boolean, p_tope numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tiene_permiso('cc.habilitar') then raise exception 'No tenés permiso para habilitar cuentas corrientes'; end if;
  if not _modulo_activo('cuenta-corriente') then raise exception 'La parte «Cuenta corriente» no está activa en este sistema'; end if;
  if coalesce(p_tope, 0) < 0 then raise exception 'El tope no puede ser negativo'; end if;
  if p_habilitada and coalesce(p_tope, 0) <= 0 then raise exception 'Poné hasta cuánto puede deber (el tope tiene que ser mayor a cero)'; end if;
  update clientes set cc_habilitada = p_habilitada, cc_tope = case when p_habilitada then p_tope else cc_tope end where id = p_cliente;
  if not found then raise exception 'Ese cliente no existe'; end if;
end $$;

-- Vender a cuenta: va en la base (trigger) para que valga venga la venta de donde venga
create function public._cc_vender() returns trigger language plpgsql security definer set search_path = public as $$
declare v_cliente bigint; c clientes; v_saldo numeric;
begin
  if not (select es_cuenta_corriente from medios_pago where id = new.medio_pago_id) then return new; end if;
  if not _modulo_activo('cuenta-corriente') then raise exception 'La parte «Cuenta corriente» no está activa en este sistema'; end if;
  select cliente_id into v_cliente from ventas where id = new.venta_id;
  if v_cliente is null then raise exception 'Para vender a cuenta corriente, elegí el cliente'; end if;
  select * into c from clientes where id = v_cliente for update;   -- dos ventas a la vez al mismo cliente no pasan su tope
  if not c.cc_habilitada then raise exception 'El cliente % no tiene la cuenta corriente habilitada', c.nombre; end if;
  v_saldo := _cc_saldo(v_cliente);
  if v_saldo + new.monto > c.cc_tope + 0.005 then
    raise exception 'Con esta venta % debería $ % y su tope es $ %', c.nombre, to_char(v_saldo + new.monto, 'FM999G999G990D00'), to_char(c.cc_tope, 'FM999G999G990D00');
  end if;
  insert into cc_movimientos (cliente_id, tipo, monto, venta_id, nota) values (v_cliente, 'venta', new.monto, new.venta_id, 'Venta a cuenta');
  return new;
end $$;
create trigger pagos_cuenta_corriente after insert on public.pagos for each row execute function public._cc_vender();

-- Si se anula una venta hecha a cuenta, la deuda se descuenta
create function public._cc_anular() returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if old.anulada_en is null and new.anulada_en is not null then
    for r in select cliente_id, sum(monto) as monto from cc_movimientos where venta_id = new.id and tipo = 'venta' group by cliente_id having sum(monto) <> 0 loop
      insert into cc_movimientos (cliente_id, tipo, monto, venta_id, nota) values (r.cliente_id, 'anulacion', -r.monto, new.id, 'Venta anulada');
    end loop;
  end if;
  return null;
end $$;
create trigger cc_anular after update of anulada_en on public.ventas for each row execute function public._cc_anular();

-- Cobrar (parte de) una deuda. Devuelve el id del movimiento (el n.º de recibo).
create function public.cc_cobrar(p_cliente bigint, p_monto numeric, p_medio bigint, p_referencia text default null, p_nota text default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint; m medios_pago; v_saldo numeric; v_cuenta bigint;
begin
  if not tiene_permiso('cc.cobrar') then raise exception 'No tenés permiso para cobrar la cuenta corriente'; end if;
  if not _modulo_activo('cuenta-corriente') then raise exception 'La parte «Cuenta corriente» no está activa en este sistema'; end if;
  if coalesce(p_monto, 0) <= 0 then raise exception 'El monto no es válido'; end if;
  perform 1 from clientes where id = p_cliente for update;
  if not found then raise exception 'Ese cliente no existe'; end if;
  select * into m from medios_pago where id = p_medio and activo and en_mostrador and not es_saldo and not es_cuenta_corriente;
  if not found then raise exception 'Elegí con qué medio paga (efectivo, transferencia, tarjeta…)'; end if;
  v_saldo := _cc_saldo(p_cliente);
  if p_monto > v_saldo + 0.005 then raise exception 'El cliente debe $ %: no se puede cobrar más que eso', to_char(v_saldo, 'FM999G999G990D00'); end if;
  insert into cc_movimientos (cliente_id, tipo, monto, medio_pago_id, referencia, nota) values (p_cliente, 'cobro', -round(p_monto, 2), p_medio, nullif(trim(coalesce(p_referencia, '')), ''), nullif(trim(coalesce(p_nota, '')), ''))
    returning id into v_id;
  -- Contabilidad (si está iniciada): entra el dinero al medio y baja lo que los clientes deben
  v_cuenta := coalesce(m.cuenta_id, _cta('caja'));
  perform _asentar('recibo', v_id, _fecha_ar(now()), 'Cobro de cuenta corriente: ' || (select nombre from clientes where id = p_cliente),
    jsonb_build_array(jsonb_build_object('cuenta', v_cuenta, 'debe', round(p_monto, 2), 'haber', 0, 'detalle', m.nombre),
                      jsonb_build_object('cuenta', _cta('deudores_ventas'), 'haber', round(p_monto, 2), 'debe', 0, 'detalle', 'Cobro de deuda')));
  return v_id;
end $$;

-- Ajuste a mano (error, descuento, deuda anterior al sistema): nota obligatoria, queda en el libro
create function public.cc_ajustar(p_cliente bigint, p_monto numeric, p_nota text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if not tiene_permiso('cc.cobrar') then raise exception 'No tenés permiso para ajustar la cuenta corriente'; end if;
  if not _modulo_activo('cuenta-corriente') then raise exception 'La parte «Cuenta corriente» no está activa en este sistema'; end if;
  if coalesce(p_monto, 0) = 0 then raise exception 'El ajuste no puede ser cero'; end if;
  if length(trim(coalesce(p_nota, ''))) < 3 then raise exception 'Explicá el motivo del ajuste'; end if;
  perform 1 from clientes where id = p_cliente for update;
  if not found then raise exception 'Ese cliente no existe'; end if;
  if _cc_saldo(p_cliente) + p_monto < -0.005 then raise exception 'El ajuste dejaría la cuenta a favor del cliente: usá un saldo a favor'; end if;
  insert into cc_movimientos (cliente_id, tipo, monto, nota) values (p_cliente, 'ajuste', round(p_monto, 2), trim(p_nota)) returning id into v_id;
  return v_id;
end $$;

revoke execute on function public.cc_estado(bigint), public.cc_habilitar(bigint, boolean, numeric), public.cc_cobrar(bigint, numeric, bigint, text, text), public.cc_ajustar(bigint, numeric, text) from public, anon;
grant execute on function public.cc_estado(bigint), public.cc_habilitar(bigint, boolean, numeric), public.cc_cobrar(bigint, numeric, bigint, text, text), public.cc_ajustar(bigint, numeric, text) to authenticated;
revoke execute on function public._cc_medio_sigue_al_modulo(), public._cc_inmutable(), public._cc_vender(), public._cc_anular() from public, anon, authenticated;
