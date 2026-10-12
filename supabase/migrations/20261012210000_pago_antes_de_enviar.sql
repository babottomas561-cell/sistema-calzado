-- Un pedido con envío se paga antes de salir (configurable: configuracion_tienda.envio_requiere_pago, prendida).
--   · Cuenta como pagado: Mercado Pago aprobado (pedidos.pagado_online) o un pago registrado a mano por el equipo
--     (transferencia, efectivo en el local…) en pedido_pagos, que cubra productos + envío.
--   · El pago a mano es una constancia: al entregar, la venta se registra con el medio del pedido como siempre (no se
--     cobra dos veces). Retirar en el local sigue igual: se puede pagar al retirar.
--   · Lo frena la base: pasar a «enviado» sin pago no se puede desde ninguna pantalla.

alter table public.configuracion_tienda add column envio_requiere_pago boolean not null default true;

create table public.pedido_pagos (
  id          bigint generated always as identity primary key,
  pedido_id   bigint not null references public.pedidos (id) on delete cascade,   -- es parte del pedido
  fecha       timestamptz not null default now(),
  monto       numeric(12,2) not null check (monto > 0),
  referencia  text,                       -- n.º de operación de la transferencia, «efectivo en el local»…
  usuario_id  uuid default auth.uid() references public.perfiles (id) on delete set null
);
create index pedido_pagos_pedido_id_idx on public.pedido_pagos (pedido_id);
create index pedido_pagos_usuario_id_idx on public.pedido_pagos (usuario_id);
alter table public.pedido_pagos enable row level security;
create policy "equipo ve pagos de pedidos" on public.pedido_pagos for select to authenticated using (tiene_permiso('pedidos.gestionar'));
create policy "cliente ve los pagos de sus pedidos" on public.pedido_pagos for select to authenticated
  using (pedido_id in (select id from pedidos where cliente_id = mi_cliente_id()));

-- ¿Está pagado? (Mercado Pago, o lo registrado a mano cubre productos + envío)
create function public.pedido_pagado(p_pedido bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select p.pagado_online or coalesce((select sum(monto) from pedido_pagos where pedido_id = p.id), 0) + 0.01 >= p.total + p.costo_envio
    from pedidos p where p.id = p_pedido
$$;
revoke execute on function public.pedido_pagado(bigint) from public, anon;
grant execute on function public.pedido_pagado(bigint) to authenticated;

-- El equipo registra un pago (transferencia, efectivo en el local…)
create function public.registrar_pago_pedido(p_pedido bigint, p_monto numeric, p_referencia text default null) returns void
language plpgsql security definer set search_path = public as $$
declare p pedidos;
begin
  if not tiene_permiso('pedidos.gestionar') then raise exception 'No tenés permiso para atender pedidos'; end if;
  select * into p from pedidos where id = p_pedido;
  if not found then raise exception 'No existe ese pedido'; end if;
  if p.estado in ('entregado', 'cancelado') then raise exception 'El pedido ya está %', p.estado; end if;
  if coalesce(p_monto, 0) <= 0 then raise exception 'Poné el monto que pagó'; end if;
  insert into pedido_pagos (pedido_id, monto, referencia) values (p_pedido, p_monto, nullif(trim(p_referencia), ''));
  insert into pedido_estados (pedido_id, estado, comentario)
  values (p_pedido, p.estado, format('Pago recibido: $%s%s',
          -- $77.550 o $77.550,50 (con punto de miles y coma decimal, sin depender del idioma de la base)
          regexp_replace(translate(to_char(p_monto, 'FM999,999,990.00'), ',.', '.,'), ',00$', ''),
          coalesce(' (' || nullif(trim(p_referencia), '') || ')', '')));
end $$;
revoke execute on function public.registrar_pago_pedido(bigint, numeric, text) from public, anon;
grant execute on function public.registrar_pago_pedido(bigint, numeric, text) to authenticated;

-- La regla: no sale un envío sin pagar (si está prendida)
create function public._enviar_solo_pagado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.entrega = 'envio' and (select envio_requiere_pago from configuracion_tienda) and not pedido_pagado(new.id) then
    raise exception 'El pedido todavía no está pagado: registrá el pago (o que lo pague con Mercado Pago) antes de enviarlo';
  end if;
  return new;
end $$;
revoke execute on function public._enviar_solo_pagado() from public, anon, authenticated;
create trigger pedidos_enviar_solo_pagado before update of estado on public.pedidos
  for each row when (new.estado = 'enviado' and old.estado is distinct from 'enviado')
  execute function public._enviar_solo_pagado();
