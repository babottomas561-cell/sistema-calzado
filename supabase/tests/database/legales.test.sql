-- Legales: datos del comercio, términos versionados e inmutables, registro de aceptaciones y botón de arrepentimiento.
begin;
create extension if not exists pgtap with schema extensions;
create schema prueba;
grant usage on schema prueba to anon, authenticated;
create function prueba.como_admin() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) $$;
create function prueba.como_vendedora() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true) $$;
create function prueba.como_cliente() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true) $$;
create function prueba.como_anon() returns void language sql as $$ select set_config('request.jwt.claims', '', true) $$;
create function prueba.texto(p text) returns text language sql immutable as $$ select p || repeat(' Texto de relleno para llegar al largo mínimo.', 6) $$;
grant execute on all functions in schema prueba to anon, authenticated;
select plan(19);

-- ── Datos del comercio ──
set local role authenticated;
select prueba.como_vendedora();
select is((select count(*) from datos_legales where false), 0::bigint, 'el pie de la tienda puede leer los datos');
select prueba.como_admin();
select throws_like($$ select publicar_documento('terminos', prueba.texto('Términos')) $$, 'Antes completá los datos del comercio%', 'sin datos del comercio no se publican los términos');
update datos_legales set razon_social = 'Mi Local SRL', cuit = '30 71234567 8', domicilio_legal = 'Calle 123, Tucumán', email_contacto = 'Hola@MiLocal.com';
select is((select cuit from datos_legales), '30-71234567-8', 'el CUIT se guarda con guiones');
select is((select email_contacto from datos_legales), 'hola@milocal.com', 'y el email en minúscula');
select throws_like($$ update datos_legales set cuit = '123' $$, 'El CUIT tiene 11 números%', 'un CUIT incompleto se rechaza');
select is(legales_completos(), true, 'con los datos cargados, están completos');

-- ── Versiones ──
select is(publicar_documento('terminos', prueba.texto('Términos v1')), 1, 'primera versión de los términos');
select is(publicar_documento('terminos', prueba.texto('Términos v2')), 2, 'la siguiente es la 2');
select is(publicar_documento('privacidad', prueba.texto('Privacidad')), 1, 'la privacidad lleva su propia numeración');
select is((select version from v_documentos_vigentes where tipo = 'terminos'), 2, 'la vigente es la última');
select throws_like($$ select publicar_documento('terminos', 'corto') $$, 'El texto es demasiado corto%', 'no se publica un texto vacío');
reset role;
select throws_like($$ update documentos_legales set contenido = 'cambiado' where tipo = 'terminos' and version = 1 $$, 'Las versiones publicadas no se modifican%', 'una versión publicada no se edita');
select throws_like($$ delete from documentos_legales where tipo = 'terminos' and version = 1 $$, 'Las versiones publicadas no se borran', 'ni se borra');
set local role authenticated;
select prueba.como_vendedora();
select throws_ok($$ select publicar_documento('terminos', prueba.texto('Intento')) $$, 'No tenés permiso para publicar los términos', 'el vendedor no publica');

-- ── Aceptaciones ──
reset role;
select set_config('request.jwt.claims', '', true);
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, raw_user_meta_data)
values ('00000000-0000-0000-0000-000000000000', '77777777-7777-7777-7777-777777777777', 'authenticated', 'authenticated', 'nuevo@gmail.com', '', '{"nombre":"Nuevo","terminos":"true"}');
select is((select count(*) from aceptaciones_legales where usuario_id = '77777777-7777-7777-7777-777777777777'), 2::bigint, 'al registrarse con la casilla queda aceptada la versión vigente de cada documento');
set local role authenticated;
select prueba.como_cliente();
select is(documentos_pendientes() -> 0 ->> 'tipo', 'privacidad', 'otro cliente tiene pendientes los documentos publicados');

-- ── Arrepentimiento ──
select prueba.como_anon();
reset role; set local role anon;
select matches(registrar_arrepentimiento('Ana Pérez', 'ana@gmail.com', null, 'PED-INEXISTENTE', 'No me gustó'), '^ARR-\d{6}$', 'cualquiera deja su arrepentimiento y recibe un código');
select throws_like($$ select registrar_arrepentimiento('Ana', 'sin-arroba') $$, 'Ese email no parece válido', 'el email tiene que ser válido');
select is((select count(*) from arrepentimientos), 0::bigint, 'el público no puede leer las solicitudes');

select * from finish();
rollback;
