-- Dominio propio: se agrega (con www que redirige), se muestran los registros a cargar, solo se puede usar como
-- principal cuando está listo, y entonces actualiza Supabase y la dirección que usa Mercado Pago. Solo el Administrador.
-- Vercel y Supabase se simulan reemplazando _pedir_http.
begin;
create extension if not exists pgtap with schema extensions;
create schema prueba;
grant usage on schema prueba to anon, authenticated;
create table prueba.respuestas (id serial, metodo text, url text, status int, cuerpo jsonb);
create table prueba.llamadas (id serial, metodo text, url text, cuerpo text);
grant all on prueba.respuestas, prueba.llamadas, prueba.respuestas_id_seq, prueba.llamadas_id_seq to anon, authenticated;
create or replace function public._pedir_http(p_metodo text, p_url text, p_cabeceras jsonb default '{}', p_tipo text default null, p_cuerpo text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r prueba.respuestas;
begin
  insert into prueba.llamadas (metodo, url, cuerpo) values (p_metodo, p_url, p_cuerpo);
  select * into r from prueba.respuestas where metodo = p_metodo and p_url like url order by id desc limit 1;
  return jsonb_build_object('status', coalesce(r.status, 404), 'cuerpo', coalesce(r.cuerpo, '{}'), 'cabeceras', '{}'::jsonb);
end $$;
create function prueba.responder(p_metodo text, p_url text, p_status int, p_cuerpo jsonb) returns void language sql security definer set search_path = public as $$
  insert into prueba.respuestas (metodo, url, status, cuerpo) values (p_metodo, p_url, p_status, p_cuerpo) $$;
create function prueba.como_admin() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) $$;
create function prueba.como_vendedora() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true) $$;
create function prueba.sitio() returns text language sql stable security definer set search_path = public as $$ select sitio_url from integraciones $$;
create function prueba.base() returns void language sql security definer set search_path = public as $$
  update integraciones set sitio_url = 'https://sistema-calzado.vercel.app' where unica $$;
grant execute on all functions in schema prueba to anon, authenticated;
select plan(12);

select prueba.base();
set local role authenticated;
select prueba.como_admin();
select throws_like($$ select dominio_agregar('mitienda.com.ar') $$, 'Falta la conexión con el hosting%', 'sin la conexión técnica, avisa qué falta');
select guardar_conexion_hosting('vercel-token-1234', 'sistema-calzado', 'team_abc', 'sbp_token_supabase', 'abcdefghijklmnopqrst');

-- ── Agregar: Vercel lo acepta pero falta verificar y apuntar ──
select prueba.responder('POST', 'https://api.vercel.com/v10/projects/sistema-calzado/domains%', 200, '{"name":"x","verified":false}');
select prueba.responder('GET', 'https://api.vercel.com/v9/projects/sistema-calzado/domains/%', 200,
  '{"verified":false,"verification":[{"type":"TXT","domain":"_vercel.mitienda.com.ar","value":"vc-domain-verify=abc","reason":"pending"}]}');
select prueba.responder('POST', 'https://api.vercel.com/v9/projects/sistema-calzado/domains/%/verify%', 400, '{"verified":false}');
select prueba.responder('GET', 'https://api.vercel.com/v6/domains/%/config%', 200, '{"misconfigured":true,"recommendedIPv4":[{"rank":1,"value":["76.76.21.21"]}],"recommendedCNAME":[{"rank":1,"value":"cname.vercel-dns.com."}]}');
select throws_ok($$ select dominio_agregar('vercel.app') $$, 'Escribí el dominio como «mitienda.com.ar» (sin https ni barras)');
select dominio_agregar('https://www.MiTienda.com.ar/');
select results_eq($$ select nombre, verificado, configurado from dominios order by id $$,
  $$ values ('mitienda.com.ar'::text, false, false), ('www.mitienda.com.ar'::text, false, false) $$, 'agrega el dominio (limpio) y www');
select ok((select cuerpo from prueba.llamadas where metodo = 'POST' and url like '%/v10/projects/%' and cuerpo like '%www.%') like '%"redirect": "mitienda.com.ar"%', 'www redirige al principal');
select ok((select url from prueba.llamadas where url like '%/v10/projects/%' limit 1) like '%teamId=team_abc%', 'en el equipo del local');
select results_eq($$ select r ->> 'tipo', r ->> 'valor' from dominios d, jsonb_array_elements(d.registros) r where d.nombre = 'mitienda.com.ar' order by 1 desc $$,
  $$ values ('TXT', 'vc-domain-verify=abc'), ('A', '76.76.21.21') $$, 'muestra qué cargar: el TXT de verificación y el A');
select throws_like($$ select dominio_principal((select id from dominios where nombre = 'mitienda.com.ar')) $$, 'Todavía no está listo%', 'sin estar listo, no se usa');

-- ── Listo: verificado y apuntando ──
select prueba.responder('GET', 'https://api.vercel.com/v9/projects/sistema-calzado/domains/%', 200, '{"verified":true}');
select prueba.responder('GET', 'https://api.vercel.com/v6/domains/%/config%', 200, '{"misconfigured":false,"recommendedIPv4":[],"recommendedCNAME":[]}');
select prueba.responder('PATCH', 'https://api.supabase.com/v1/projects/abcdefghijklmnopqrst/config/auth', 200, '{}');
select is(dominio_principal((select id from dominios where nombre = 'mitienda.com.ar')), 'https://mitienda.com.ar', 'se usa como principal');
select is(prueba.sitio(), 'https://mitienda.com.ar', 'Mercado Pago y los avisos pasan a la dirección nueva');
select ok((select cuerpo from prueba.llamadas where metodo = 'PATCH' order by id desc limit 1) like '%"site_url": "https://mitienda.com.ar"%https://sistema-calzado.vercel.app/**%',
  'Supabase: la dirección nueva, y la vieja sigue permitida');
select throws_like($$ select dominio_quitar((select id from dominios where nombre = 'mitienda.com.ar')) $$, 'Es el dominio principal%');

select prueba.como_vendedora();
select throws_ok($$ select estado_dominio() $$, 'Solo el administrador configura el dominio');

select * from finish();
rollback;
