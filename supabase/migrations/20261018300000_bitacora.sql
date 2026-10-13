-- Bitácora (etapa 2 de docs/CONFIGURACION_Y_PERMISOS.md): quién cambió qué y cuándo, para siempre y dentro de la base de cada instalación.
-- Solo se agrega: un trigger frena editar y borrar (como los asientos). Se escribe desde triggers sobre las mismas tablas que se cambian:
-- si no se puede registrar, el cambio no se hace. Las claves y tokens NUNCA se guardan: de las integraciones queda solo «qué campos cambiaron».
-- Lo de operación (ventas, stock, compras) ya tiene su propio historial y no se duplica; acá entran los cambios de configuración, permisos,
-- personas, módulos, precios masivos y anulaciones.
-- (usuario_id no es una clave foránea a propósito: el registro tiene que sobrevivir aunque se borre la cuenta; por eso guarda también el nombre.)
create table public.bitacora (
  id             bigint generated always as identity primary key,
  fecha          timestamptz not null default now(),
  usuario_id     uuid,                       -- null = el sistema (tareas automáticas)
  usuario_nombre text not null,              -- copia del nombre/email de ese momento
  modulo         text not null,
  accion         text not null check (accion in ('crear', 'cambiar', 'borrar', 'anular', 'deshacer')),
  entidad        text not null,              -- qué tabla o cosa («roles», «medios_pago»…)
  entidad_id     text,
  detalle        text not null,              -- frase legible: «Cambió el rol Vendedor: permisos, descuento_max_pct»
  antes          jsonb,
  despues        jsonb
);
create index on public.bitacora (fecha desc);
create index on public.bitacora (usuario_id);
create index on public.bitacora (modulo, fecha desc);
alter table public.bitacora enable row level security;
create policy "ve la bitácora" on public.bitacora for select to authenticated using (tiene_permiso('bitacora.ver'));

create function public._bitacora_inmutable() returns trigger language plpgsql as $$
begin raise exception 'La bitácora no se edita ni se borra'; end $$;
create trigger inmutable before update or delete on public.bitacora for each row execute function public._bitacora_inmutable();
create trigger sin_truncate before truncate on public.bitacora for each statement execute function public._bitacora_inmutable();

create function public.registrar_bitacora(p_modulo text, p_accion text, p_entidad text, p_entidad_id text, p_detalle text, p_antes jsonb default null, p_despues jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_nombre text;
begin
  select coalesce(nullif(pe.nombre, ''), u.email, 'sistema') into v_nombre
    from auth.users u left join perfiles pe on pe.id = u.id where u.id = auth.uid();
  insert into bitacora (usuario_id, usuario_nombre, modulo, accion, entidad, entidad_id, detalle, antes, despues)
  values (auth.uid(), coalesce(v_nombre, 'Sistema'), p_modulo, p_accion, p_entidad, p_entidad_id, p_detalle, p_antes, p_despues);
end $$;

-- Trigger genérico: registra qué campos cambiaron. Argumentos: módulo, entidad, [campos a ignorar (coma)], [«secreto» para no guardar valores]
create function public._bitacora_tabla() returns trigger language plpgsql security definer set search_path = public as $$
declare v_modulo text := tg_argv[0]; v_entidad text := tg_argv[1]; v_ignorar text[] := string_to_array(coalesce(tg_argv[2], ''), ',');
        v_secreto boolean := coalesce(tg_argv[3], '') = 'secreto';
        v_viejo jsonb; v_nuevo jsonb; v_antes jsonb := '{}'; v_despues jsonb := '{}'; k text; v_fila jsonb; v_id text; v_nombre text; v_campos text;
begin
  v_fila := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  v_id := coalesce(v_fila->>'id', v_fila->>'clave', v_fila->>'unica');
  v_nombre := coalesce(v_fila->>'nombre', v_fila->>'dominio', v_id);
  if tg_op = 'UPDATE' then
    v_viejo := to_jsonb(old); v_nuevo := to_jsonb(new);
    for k in select jsonb_object_keys(v_nuevo) loop
      if k = any (v_ignorar) then continue; end if;
      if v_viejo->k is distinct from v_nuevo->k then
        v_antes := v_antes || jsonb_build_object(k, case when v_secreto then to_jsonb('«cambió»'::text) else v_viejo->k end);
        v_despues := v_despues || jsonb_build_object(k, case when v_secreto then to_jsonb('«cambió»'::text) else v_nuevo->k end);
      end if;
    end loop;
    if v_despues = '{}'::jsonb then return new; end if;     -- no cambió nada que importe
    select string_agg(x, ', ') into v_campos from jsonb_object_keys(v_despues) x;
    perform registrar_bitacora(v_modulo, 'cambiar', v_entidad, v_id, format('Cambió %s «%s»: %s', v_entidad, v_nombre, v_campos), v_antes, v_despues);
    return new;
  elsif tg_op = 'INSERT' then
    perform registrar_bitacora(v_modulo, 'crear', v_entidad, v_id, format('Creó %s «%s»', v_entidad, v_nombre), null, case when v_secreto then null else v_fila end);
    return new;
  else
    perform registrar_bitacora(v_modulo, 'borrar', v_entidad, v_id, format('Borró %s «%s»', v_entidad, v_nombre), case when v_secreto then null else v_fila end, null);
    return old;
  end if;
end $$;

create trigger bitacora after insert or update or delete on public.roles for each row execute function public._bitacora_tabla('equipo', 'rol');
create trigger bitacora after insert or update or delete on public.modulos for each row execute function public._bitacora_tabla('equipo', 'módulo', 'cambiado_por,cambiado_en');
create trigger bitacora after insert or update or delete on public.medios_pago for each row execute function public._bitacora_tabla('ventas', 'medio de pago');
create trigger bitacora after insert or update or delete on public.depositos for each row execute function public._bitacora_tabla('stock', 'depósito');
create trigger bitacora after insert or update or delete on public.configuracion_tienda for each row execute function public._bitacora_tabla('tienda', 'configuración de la tienda', 'actualizado_en');
create trigger bitacora after insert or update or delete on public.configuracion_cuentas for each row execute function public._bitacora_tabla('equipo', 'configuración de cuentas');
create trigger bitacora after insert or update or delete on public.configuracion_impresion for each row execute function public._bitacora_tabla('impresion', 'configuración de impresión');
create trigger bitacora after insert or update or delete on public.configuracion_fiscal for each row execute function public._bitacora_tabla('integraciones', 'configuración fiscal');
create trigger bitacora after insert or update or delete on public.configuracion_gastos for each row execute function public._bitacora_tabla('gastos', 'configuración de gastos');
create trigger bitacora after insert or update or delete on public.configuracion_contable for each row execute function public._bitacora_tabla('contabilidad', 'configuración contable');
create trigger bitacora after insert or update or delete on public.datos_legales for each row execute function public._bitacora_tabla('tienda', 'datos legales');
create trigger bitacora after insert or update or delete on public.puntos_venta_fiscales for each row execute function public._bitacora_tabla('integraciones', 'punto de venta fiscal');
create trigger bitacora after insert or update or delete on public.dominios for each row execute function public._bitacora_tabla('integraciones', 'dominio');
-- Integraciones: solo QUÉ campos cambiaron, nunca su valor (regla 16)
create trigger bitacora after insert or update or delete on public.integraciones for each row execute function public._bitacora_tabla('integraciones', 'integración', 'actualizado_en,actualizado_por,ia_ultima_prueba,ia_modelos_revisado,ia_modelos_error,correo_aplicado_en,correo_aplicado_error,ig_token_vence,ig_renovado_en,ig_sincronizado_en,ig_error,arca_token,arca_sign,arca_token_vence,arca_token_ambiente,arca_ultimo_error,arca_probado_en,uber_prueba,andreani_prueba', 'secreto');

-- Personas del equipo: alta, baja y cambio de rol (las cuentas de clientes no se registran acá)
create function public._bitacora_perfil() returns trigger language plpgsql security definer set search_path = public as $$
declare v_f jsonb;
begin
  if tg_op = 'INSERT' then
    if new.rol = 'staff' then perform registrar_bitacora('equipo', 'crear', 'persona', new.id::text, format('Sumó al equipo a «%s»', coalesce(new.nombre, new.id::text)), null, jsonb_build_object('rol_id', new.rol_id)); end if;
  elsif tg_op = 'UPDATE' then
    if (new.rol = 'staff' or old.rol = 'staff') and (new.rol is distinct from old.rol or new.rol_id is distinct from old.rol_id or new.nombre is distinct from old.nombre) then
      perform registrar_bitacora('equipo', 'cambiar', 'persona', new.id::text,
        format('Cambió a «%s»: %s', coalesce(new.nombre, new.id::text), case when new.rol is distinct from old.rol then (case when new.rol = 'staff' then 'entró al equipo' else 'salió del equipo' end) when new.rol_id is distinct from old.rol_id then 'cambió de rol' else 'cambió el nombre' end),
        jsonb_build_object('rol', old.rol, 'rol_id', old.rol_id, 'nombre', old.nombre), jsonb_build_object('rol', new.rol, 'rol_id', new.rol_id, 'nombre', new.nombre));
    end if;
  end if;
  return new;
end $$;
create trigger bitacora after insert or update on public.perfiles for each row execute function public._bitacora_perfil();

-- Precios masivos y su deshacer, y ventas anuladas
create function public._bitacora_precios() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform registrar_bitacora('precios', 'cambiar', 'ajuste de precios', new.id::text, coalesce('Ajuste masivo de precios: ' || new.descripcion, 'Ajuste masivo de precios'), null, jsonb_build_object('modo', new.modo, 'valor', new.valor, 'cantidad', new.cantidad));
  elsif old.deshecho_en is null and new.deshecho_en is not null then
    perform registrar_bitacora('precios', 'deshacer', 'ajuste de precios', new.id::text, 'Deshizo un ajuste masivo de precios', null, null);
  end if;
  return new;
end $$;
create trigger bitacora after insert or update on public.ajustes_precios for each row execute function public._bitacora_precios();

create function public._bitacora_anulacion() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.anulada_en is null and new.anulada_en is not null then
    perform registrar_bitacora('ventas', 'anular', 'venta', new.id::text, format('Anuló la venta %s', new.comprobante), null, jsonb_build_object('total', new.total));
  end if;
  return new;
end $$;
create trigger bitacora after update of anulada_en on public.ventas for each row execute function public._bitacora_anulacion();

-- Permiso para verla (el Administrador lo tiene por ser «todos»)
insert into public.permisos (orden, grupo, codigo, nombre, descripcion) values
  (93, 'Configuración', 'bitacora.ver', 'Ver la bitácora', 'Quién cambió qué y cuándo: permisos, personas, módulos, configuración, precios masivos y anulaciones');

revoke execute on function public.registrar_bitacora(text, text, text, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public._bitacora_tabla(), public._bitacora_perfil(), public._bitacora_precios(), public._bitacora_anulacion(), public._bitacora_inmutable() from public, anon;
