-- Instagram: se conecta con un token (cuenta profesional), copia las últimas publicaciones a una tabla que lee la tienda,
-- deja ocultar alguna y renueva el token solo. Meta se simula reemplazando _pedir_http.
begin;
create extension if not exists pgtap with schema extensions;
create schema prueba;
grant usage on schema prueba to anon, authenticated;
create table prueba.respuestas (id serial, metodo text, url text, status int, cuerpo jsonb);
create table prueba.llamadas (id serial, metodo text, url text);
grant all on prueba.respuestas, prueba.llamadas, prueba.respuestas_id_seq, prueba.llamadas_id_seq to anon, authenticated;
create or replace function public._pedir_http(p_metodo text, p_url text, p_cabeceras jsonb default '{}', p_tipo text default null, p_cuerpo text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r prueba.respuestas;
begin
  insert into prueba.llamadas (metodo, url) values (p_metodo, p_url);
  select * into r from prueba.respuestas where metodo = p_metodo and p_url like url order by id desc limit 1;
  return jsonb_build_object('status', coalesce(r.status, 404), 'cuerpo', coalesce(r.cuerpo, '{}'), 'cabeceras', '{}'::jsonb);
end $$;
create function prueba.responder(p_url text, p_status int, p_cuerpo jsonb) returns void language sql security definer set search_path = public as $$
  insert into prueba.respuestas (metodo, url, status, cuerpo) values ('GET', p_url, p_status, p_cuerpo) $$;
create function prueba.como_admin() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) $$;
create function prueba.como_vendedora() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true) $$;
create function prueba.visibles() returns bigint language sql security definer set search_path = public as $$ select count(*) from instagram_posts where visible $$;
grant execute on all functions in schema prueba to anon, authenticated;
select plan(22);

-- Un token con la forma de los de Meta
select set_config('prueba.token', 'IGAAtokenDePrueba' || repeat('x', 60), false);

-- ── Permisos y forma del token ──
set local role authenticated;
select prueba.como_vendedora();
select throws_ok($$ select guardar_instagram(current_setting('prueba.token')) $$, 'No tenés permiso para configurar la tienda', 'quien no edita la tienda no conecta Instagram');
select throws_ok($$ select estado_instagram() $$, 'No tenés permiso para configurar la tienda', 'ni mira su estado');
select prueba.como_admin();
select throws_like($$ select guardar_instagram('corto') $$, 'Ese no parece un token de Instagram%', 'un texto que no es un token se rechaza antes de llamar a Meta');

-- ── Cuenta personal: no sirve ──
select prueba.responder('https://graph.instagram.com/v25.0/me?fields=user_id%', 200, '{"user_id":"111","username":"personal.ana","account_type":"PERSONAL"}');
select throws_like($$ select guardar_instagram(current_setting('prueba.token')) $$, 'La cuenta @personal.ana no es profesional%', 'la cuenta tiene que ser profesional');

-- ── Token vencido ──
select prueba.responder('https://graph.instagram.com/v25.0/me?fields=user_id%', 400, '{"error":{"message":"Invalid OAuth access token","type":"OAuthException","code":190}}');
select throws_like($$ select guardar_instagram(current_setting('prueba.token')) $$, 'El token no es válido o venció%', 'un token vencido se explica en castellano');

-- ── Cuenta profesional ──
select prueba.responder('https://graph.instagram.com/v25.0/me?fields=user_id%', 200, '{"user_id":"17841400000","username":"milocal.tuc","account_type":"BUSINESS","media_count":40}');
select prueba.responder('https://graph.instagram.com/v25.0/me/media?%', 200, $j$
  {"data":[
    {"id":"m1","media_type":"IMAGE","media_url":"https://scontent.cdninstagram.com/m1.jpg","permalink":"https://www.instagram.com/p/AAA/","caption":"Camisa de lino","timestamp":"2026-10-10T15:00:00+0000"},
    {"id":"m2","media_type":"VIDEO","media_url":"https://video.cdninstagram.com/m2.mp4","thumbnail_url":"https://scontent.cdninstagram.com/m2-mini.jpg","permalink":"https://www.instagram.com/reel/BBB/","timestamp":"2026-10-09T15:00:00+0000"},
    {"id":"m3","media_type":"CAROUSEL_ALBUM","media_url":"https://scontent.cdninstagram.com/m3.jpg","permalink":"https://www.instagram.com/p/CCC/","timestamp":"2026-10-08T15:00:00+0000"},
    {"id":"m4","media_type":"IMAGE","permalink":"https://www.instagram.com/p/DDD/","timestamp":"2026-10-07T15:00:00+0000"}
  ]}$j$::jsonb);
select is((select guardar_instagram(current_setting('prueba.token')) ->> 'usuario'), 'milocal.tuc', 'se conecta con una cuenta Business');
select is((select instagram from configuracion_tienda), 'milocal.tuc', 'si el local no tenía Instagram cargado, queda el de la cuenta conectada');
select is((select count(*) from instagram_posts), 3::bigint, 'copia las publicaciones (la que no trae imagen se saltea)');
select is((select imagen_url from instagram_posts where ig_id = 'm2'), 'https://scontent.cdninstagram.com/m2-mini.jpg', 'un video se muestra con su miniatura');
select is(estado_instagram() ->> 'conectado', 'true', 'el estado dice que está conectado');
select ok(estado_instagram()::text not like '%' || current_setting('prueba.token') || '%', 'y nunca devuelve el token');
select throws_like($$ select ig_token from integraciones $$, 'permission denied%', 'el token no se puede leer por la API');

-- ── Ocultar ──
select instagram_mostrar((select id from instagram_posts where ig_id = 'm1'), false);
reset role; set local role anon;
select is(prueba.visibles(), 2::bigint, 'una publicación oculta no la ve el público');
select is((select count(*) from instagram_posts), 2::bigint, 'la tienda (anon) solo lee las visibles');
reset role; set local role authenticated; select prueba.como_admin();
select is(instagram_sincronizar(), 3, 'actualizar ahora vuelve a copiar');
select is((select visible from instagram_posts where ig_id = 'm1'), false, 'y no pisa lo que el dueño ocultó');

-- ── Lo que se borra de Instagram deja de verse ──
select prueba.responder('https://graph.instagram.com/v25.0/me/media?%', 200, '{"data":[{"id":"m1","media_type":"IMAGE","media_url":"https://scontent.cdninstagram.com/m1.jpg","permalink":"https://www.instagram.com/p/AAA/","timestamp":"2026-10-10T15:00:00+0000"}]}'::jsonb);
select instagram_sincronizar();
select is((select count(*) from instagram_posts), 1::bigint, 'si ya no está entre las últimas, se saca');

-- ── Renovar el token ──
reset role;
update integraciones set ig_conectado_en = now() - interval '3 days', ig_token_vence = now() + interval '10 days';
select prueba.responder('https://graph.instagram.com/refresh_access_token?%', 200, '{"access_token":"IGAAtokenRenovado0000000000000000000000000000000000000000","token_type":"bearer","expires_in":5184000}');
select _instagram_renovar();
select ok((select ig_token_vence from integraciones) > now() + interval '55 days', 'el token se renueva solo cuando le quedan menos de 30 días');
select ok((select ig_token from integraciones) like 'IGAAtokenRenovado%', 'y queda el token nuevo');

-- ── Sección de la portada ──
select lives_ok($$ insert into inicio_secciones (tipo, orden, titulo, contenido) values ('instagram', 999, 'Seguinos', '{"cantidad":6}') $$, 'la portada admite la sección de Instagram');

-- ── Desconectar ──
set local role authenticated; select prueba.como_admin();
select instagram_desconectar();
select is(estado_instagram() ->> 'conectado', 'false', 'se desconecta');
select is((select count(*) from instagram_posts), 0::bigint, 'y se sacan las publicaciones copiadas');

select * from finish();
rollback;
