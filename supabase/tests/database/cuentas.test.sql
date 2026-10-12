-- Cuentas y correo: las reglas de registro las hace cumplir la base (aunque el formulario no las vea), las
-- invitaciones son de un solo uso y atadas a un email, y la configuración se le pasa a Supabase Auth (simulado).
begin;
create extension if not exists pgtap with schema extensions;
create schema prueba;
grant usage on schema prueba to anon, authenticated;
create table prueba.llamadas (id serial, metodo text, url text, cuerpo text);
grant all on prueba.llamadas, prueba.llamadas_id_seq to anon, authenticated;
create or replace function public._pedir_http(p_metodo text, p_url text, p_cabeceras jsonb default '{}', p_tipo text default null, p_cuerpo text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  insert into prueba.llamadas (metodo, url, cuerpo) values (p_metodo, p_url, p_cuerpo);
  return jsonb_build_object('status', 200, 'cuerpo', '{}'::jsonb, 'cabeceras', '{}'::jsonb);
end $$;
create function prueba.como_admin() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) $$;
create function prueba.como_vendedora() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true) $$;
create function prueba.config(p_cambios jsonb) returns void language plpgsql security definer set search_path = public as $$
begin
  update configuracion_cuentas set
    registro = coalesce(p_cambios ->> 'registro', registro), telefono = coalesce(p_cambios ->> 'telefono', telefono),
    dominios_bloqueados = coalesce(array(select jsonb_array_elements_text(p_cambios -> 'bloqueados')), dominios_bloqueados),
    dominios_permitidos = coalesce(array(select jsonb_array_elements_text(p_cambios -> 'permitidos')), dominios_permitidos),
    exigir_terminos = coalesce((p_cambios ->> 'terminos')::boolean, exigir_terminos),
    terminos_url = coalesce(p_cambios ->> 'terminos_url', terminos_url),
    clave_exige_numero = coalesce((p_cambios ->> 'numero')::boolean, clave_exige_numero),
    confirmar_email = coalesce((p_cambios ->> 'confirmar')::boolean, confirmar_email);
end $$;
grant execute on all functions in schema prueba to anon, authenticated;
select plan(21);

-- ── Registro abierto (lo de fábrica) ──
select is(validar_registro('ana@gmail.com', '{"nombre":"Ana"}'), null, 'abierto: cualquiera puede registrarse');
select is(validar_registro('ana', '{}'), 'Ese email no parece válido. Revisalo.', 'un email mal escrito se avisa');
select is((select confirmar_email from configuracion_cuentas), true, 'la confirmación de email viene obligatoria de fábrica');

-- ── Datos del formulario ──
select prueba.config('{"telefono":"obligatorio"}');
select is(validar_registro('ana@gmail.com', '{"nombre":"Ana"}'), 'Falta completar el teléfono.', 'teléfono obligatorio: sin teléfono no pasa');
select is(validar_registro('ana@gmail.com', '{"telefono":"123"}'), 'El teléfono no parece válido: escribilo con el código de área.', 'y tiene que parecer un teléfono');
select is(validar_registro('ana@gmail.com', '{"telefono":"381 555-1234"}'), null, 'con teléfono pasa');
select is(validar_registro('ana@gmail.com', '{"telefono":"3815551234","nacimiento":"2999-01-01"}'), 'La fecha de nacimiento no es válida.', 'una fecha futura no vale');

-- ── Dominios ──
select prueba.config('{"telefono":"opcional","bloqueados":["mailinator.com"],"permitidos":[]}');
select is(validar_registro('x@mailinator.com', '{}'), 'No aceptamos emails de mailinator.com. Usá otro.', 'dominio bloqueado');
select prueba.config('{"bloqueados":[],"permitidos":["empresa.com"]}');
select is(validar_registro('x@gmail.com', '{}'), 'Solo se aceptan emails de: empresa.com.', 'lista de dominios permitidos');
select is(validar_registro('x@empresa.com', '{}'), null, 'el permitido pasa');
select prueba.config('{"permitidos":[]}');

-- ── Términos ──
select prueba.config('{"terminos":true,"terminos_url":"https://mitienda.com.ar/terminos"}');
select is(validar_registro('ana@gmail.com', '{}'), 'Tenés que aceptar los términos y condiciones.', 'términos exigidos');
select is(validar_registro('ana@gmail.com', '{"terminos":"true"}'), null, 'aceptados: pasa');
select prueba.config('{"terminos":false}');

-- ── Solo con invitación ──
select prueba.config('{"registro":"invitacion"}');
select is(validar_registro('ana@gmail.com', '{}'), 'Por ahora solo se puede crear una cuenta con una invitación del local.', 'cerrado a clientes nuevos');
select throws_like($$ insert into auth.users (instance_id, id, aud, role, email, encrypted_password) values ('00000000-0000-0000-0000-000000000000', '55555555-5555-5555-5555-555555555555', 'authenticated', 'authenticated', 'ana@gmail.com', '') $$,
  'Por ahora solo se puede crear una cuenta%', 'la base lo frena aunque se salteen el formulario');

set local role authenticated;
select prueba.como_vendedora();
select throws_ok($$ select crear_invitacion('nuevo@gmail.com', null) $$, 'Solo el administrador invita personas', 'el vendedor no invita');
select prueba.como_admin();
create temp table tok as select crear_invitacion('luis@gmail.com', (select id from roles where nombre = 'Vendedor')) as t;
grant select on tok to anon, authenticated;
reset role;
select is(invitacion_info((select t from tok)) ->> 'email', 'luis@gmail.com', 'el link de la invitación muestra a qué email es');
select is(invitacion_info('inventado'), null, 'un token inventado no devuelve nada');
select is(validar_registro('otro@gmail.com', jsonb_build_object('invitacion', (select t from tok))), 'La invitación venció o ya se usó: pedí una nueva.', 'la invitación es de un solo email');

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, raw_user_meta_data)
values ('00000000-0000-0000-0000-000000000000', '66666666-6666-6666-6666-666666666666', 'authenticated', 'authenticated', 'luis@gmail.com', '',
        jsonb_build_object('nombre', 'Luis', 'invitacion', (select t from tok)));
select is((select rol from perfiles where id = '66666666-6666-6666-6666-666666666666'), 'staff', 'con la invitación entra al equipo con el rol elegido');
select is((select usada_en is not null from invitaciones_cuenta where email = 'luis@gmail.com'), true, 'y la invitación queda usada');
select is(validar_registro('luis@gmail.com', jsonb_build_object('invitacion', (select t from tok))), 'La invitación venció o ya se usó: pedí una nueva.', 'no se puede usar dos veces');

select * from finish();
rollback;
