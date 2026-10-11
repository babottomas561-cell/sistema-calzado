-- Seguridad: RLS en todas las tablas, qué ve el público, qué ve y toca un cliente, y el alta de cuentas.
begin;
-- ── Ayudas de prueba (viven solo dentro de esta transacción) ──
-- security definer: leen todo aunque la prueba esté actuando como un cliente sin permisos
create extension if not exists pgtap with schema extensions;
create schema prueba;
grant usage on schema prueba to anon, authenticated;
-- id de la variante modelo + talle + color
create function prueba.variante(p_modelo text, p_talle text, p_color text) returns bigint language sql stable security definer set search_path = public as $$
  select v.id from variantes v join productos p on p.id = v.producto_id join talles t on t.id = v.talle_id join colores c on c.id = v.color_id
   where p.nombre = p_modelo and t.nombre = p_talle and c.nombre = p_color $$;
create function prueba.stock(p_variante bigint) returns int language sql stable security definer set search_path = public as $$ select cantidad from stock where variante_id = p_variante $$;
create function prueba.reservado(p_variante bigint) returns int language sql stable security definer set search_path = public as $$ select reservado from stock where variante_id = p_variante $$;
create function prueba.medio(p_codigo text) returns bigint language sql stable security definer set search_path = public as $$ select id from medios_pago where codigo = p_codigo $$;
-- Actuar como el equipo o como el cliente de prueba (los usuarios que crea seed.sql)
create function prueba.como_equipo() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) $$;
create function prueba.como_cliente() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true) $$;
grant execute on all functions in schema prueba to anon, authenticated;
-- Para guardar ids entre pasos
create table prueba.ids (nombre text primary key, id bigint);
grant all on prueba.ids to anon, authenticated;
select plan(28);

-- ── Estructura ──
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity), 0, 'todas las tablas tienen RLS activado');
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not exists (select 1 from pg_policy p where p.polrelid = c.oid)), 0, 'todas las tablas tienen al menos una política');
-- Regla 4: cada FK con su índice (que empiece por la columna de la FK)
select is((select string_agg(conrelid::regclass || '.' || a.attname, ', ') from pg_constraint k
  join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
  where k.contype = 'f' and k.connamespace = 'public'::regnamespace
    and not exists (select 1 from pg_index i where i.indrelid = k.conrelid and i.indkey[0] = k.conkey[1])), null, 'cada FK tiene índice');
select hasnt_column('public', 'v_catalogo', 'precio_compra', 'el catálogo público no expone costos');

-- Datos para las pruebas: una nota interna en la ficha del cliente de prueba y un pedido de otro cliente
update clientes set notas = 'Nota interna del equipo', etiquetas = '{vip}' where usuario_id = '22222222-2222-2222-2222-222222222222';
select prueba.como_equipo();
insert into prueba.ids select 'pedido_ajeno', crear_pedido(
  format('[{"variante_id": %s, "cantidad": 1}]', prueba.variante('Zapatilla Urbana Classic', '40', 'Negro'))::jsonb,
  'retiro', null, prueba.medio('EFE'), null, (select id from clientes where nombre = 'Juan Pérez'));

-- ── Público (sin cuenta) ──
set local role anon;
select is((select count(*)::int from productos), 0, 'anon: no lee productos (tienen costos)');
select ok((select count(*) from v_catalogo) > 0, 'anon: lee el catálogo');
select is((select count(*)::int from medios_pago), (select count(*)::int from medios_pago where en_tienda), 'anon: solo ve los medios de la tienda');
select is((select count(*)::int from clientes), 0, 'anon: no ve clientes');
select throws_like($$ select crear_pedido('[{"variante_id": 1, "cantidad": 1}]') $$, '%permission denied%', 'anon: no puede hacer pedidos');

-- ── Cliente registrado ──
set local role authenticated;
select prueba.como_cliente();
select is((select count(*)::int from clientes), 0, 'cliente: no lee la tabla de clientes (ni la suya)');
select is((select count(*)::int from v_mi_ficha), 1, 'cliente: ve su ficha por v_mi_ficha');
select hasnt_column('public', 'v_mi_ficha', 'notas', 'v_mi_ficha no expone notas internas');
select hasnt_column('public', 'v_mi_ficha', 'etiquetas', 'ni etiquetas');
select is((select count(*)::int from pedidos where id = (select id from prueba.ids where nombre = 'pedido_ajeno')), 0, 'cliente: no ve pedidos de otros');
select ok((select count(*) from pedidos) > 0, 'cliente: ve sus pedidos');
select is((select count(*)::int from ventas), 0, 'cliente: no ve ventas');
select is((select count(*)::int from compras), 0, 'cliente: no ve compras');
select is((select count(*)::int from producto_proveedores), 0, 'cliente: no ve precios de proveedores');
select is((select count(*)::int from interacciones), 0, 'cliente: no ve el CRM');
select throws_ok($$ select registrar_venta('[{"variante_id": 1, "cantidad": 1, "precio_unitario": 1}]') $$, 'No tenés permiso para registrar ventas');
select throws_like($$ insert into productos (nombre, categoria_id) values ('x', 1) $$, '%row-level security%', 'cliente: no crea productos');
-- No puede hacerse staff
update perfiles set rol = 'staff' where id = auth.uid();
select is((select rol from perfiles where id = auth.uid()), 'cliente', 'cliente: no puede cambiarse el rol');
-- Su ficha: edita sus datos de contacto, pero NO lo interno del CRM
select actualizar_mi_ficha('Cliente Demo', null, '381 555-0000');
select is((select telefono from v_mi_ficha), '381 555-0000', 'cliente: edita su teléfono con actualizar_mi_ficha');
update clientes set etiquetas = '{}', notas = null, codigo = 1 where usuario_id = auth.uid();
reset role;
select is((select notas from clientes where usuario_id = '22222222-2222-2222-2222-222222222222'), 'Nota interna del equipo', 'cliente: no puede borrar las notas internas');
select is((select etiquetas from clientes where usuario_id = '22222222-2222-2222-2222-222222222222'), '{vip}'::text[], 'las etiquetas siguen intactas');

-- ── Alta de cuentas ──
-- Una ficha del CRM cargada en el local con email (María) NO se le entrega a quien se registre con ese
-- email hasta que lo confirme: si no, cualquiera vería sus compras registrándose con su dirección.
select set_config('request.jwt.claims', '', true);   -- proceso interno (como el alta de Supabase Auth)
update clientes set email = 'maria@ejemplo.com' where nombre = 'María González';
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, raw_user_meta_data)
values ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-4444-444444444444', 'authenticated', 'authenticated', 'maria@ejemplo.com', '', '{"nombre":"María"}');
select is((select usuario_id from clientes where nombre = 'María González'), null, 'registrarse con un email ajeno sin confirmarlo no da acceso a esa ficha');
select is((select rol from perfiles where id = '44444444-4444-4444-4444-444444444444'), 'cliente', 'pero ya tiene su perfil de cliente');
update auth.users set email_confirmed_at = now() where id = '44444444-4444-4444-4444-444444444444';
select is((select usuario_id from clientes where nombre = 'María González'), '44444444-4444-4444-4444-444444444444'::uuid, 'al confirmar el email se vincula con su ficha del local');

select * from finish();
rollback;
