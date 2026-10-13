-- ARCA fase 1: datos fiscales, llave en el Vault, certificado, acceso (WSAA) guardado y reusado, puntos de venta y permisos.
-- ARCA y el firmador de la app se simulan reemplazando _pedir_http.
begin;
create extension if not exists pgtap with schema extensions;
create schema prueba;
grant usage on schema prueba to anon, authenticated;
create table prueba.llamadas (id serial, url text, accion text, cuerpo text);
create table prueba.config (unica boolean primary key default true, coincide boolean not null default true, cuit text not null default '20123456786',
  wsaa text not null default 'ok', ptos text not null default 'dos');
insert into prueba.config default values;
grant all on prueba.llamadas, prueba.llamadas_id_seq, prueba.config to anon, authenticated;

create or replace function public._pedir_http(p_metodo text, p_url text, p_cabeceras jsonb default '{}', p_tipo text default null, p_cuerpo text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c prueba.config; v_accion text; v_url text; v_soap text; v_vence text; v_status int; v_xml text;
begin
  select * into c from prueba.config;
  v_accion := p_cuerpo::jsonb ->> 'accion';
  v_url := p_cuerpo::jsonb ->> 'url'; v_soap := coalesce(p_cuerpo::jsonb ->> 'soap_action', '');
  insert into prueba.llamadas (url, accion, cuerpo) values (coalesce(v_url, p_url), coalesce(nullif(v_soap, ''), v_accion), p_cuerpo);
  if p_url not like '%/api/arca/firma' then return jsonb_build_object('status', 404, 'cuerpo', '{}'::jsonb); end if;
  if v_accion = 'generar' then
    return jsonb_build_object('status', 200, 'cuerpo', jsonb_build_object('clave', '-----BEGIN RSA PRIVATE KEY-----LLAVEFALSA' || (select count(*) from prueba.llamadas) || '-----END RSA PRIVATE KEY-----',
      'csr', '-----BEGIN CERTIFICATE REQUEST-----PEDIDO-----END CERTIFICATE REQUEST-----'));
  elsif v_accion = 'leer' then
    return jsonb_build_object('status', 200, 'cuerpo', jsonb_build_object('cuit', c.cuit, 'coincide', c.coincide, 'hasta', now() + interval '2 years', 'emisor', 'Computadores Test', 'ambiente', 'homologacion'));
  elsif v_accion = 'firmar' then
    return jsonb_build_object('status', 200, 'cuerpo', jsonb_build_object('firmado', 'Q01TRklSTUFETw=='));
  end if;
  -- accion = enviar: la pasarela responde 200 con lo que contestó ARCA adentro
  v_status := 200;
  if v_url like '%LoginCms' then
    if c.wsaa = 'ok' then
      v_vence := to_char((now() + interval '12 hours') at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD"T"HH24:MI:SS') || '.000-03:00';
      v_xml := '<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><loginCmsResponse xmlns="http://wsaa.view.sua.dvadac.desein.afip.gov"><loginCmsReturn>'
        || '&lt;?xml version="1.0" encoding="UTF-8" standalone="yes"?&gt;&lt;loginTicketResponse version="1.0"&gt;&lt;header&gt;&lt;uniqueId&gt;1&lt;/uniqueId&gt;&lt;expirationTime&gt;' || v_vence
        || '&lt;/expirationTime&gt;&lt;/header&gt;&lt;credentials&gt;&lt;token&gt;TOKENSECRETO&lt;/token&gt;&lt;sign&gt;SIGNSECRETO&lt;/sign&gt;&lt;/credentials&gt;&lt;/loginTicketResponse&gt;'
        || '</loginCmsReturn></loginCmsResponse></soapenv:Body></soapenv:Envelope>';
    else
      v_status := 500;
      v_xml := '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><soapenv:Fault><faultcode>ns1:coe.alreadyAuthenticated</faultcode><faultstring>El CEE ya posee un TA valido para el acceso al WSN solicitado</faultstring></soapenv:Fault></soapenv:Body></soapenv:Envelope>';
    end if;
  elsif v_soap like '%FEDummy%' then
    v_xml := '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><FEDummyResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FEDummyResult><AppServer>OK</AppServer><DbServer>OK</DbServer><AuthServer>OK</AuthServer></FEDummyResult></FEDummyResponse></soap:Body></soap:Envelope>';
  elsif v_soap like '%FEParamGetPtosVenta%' and c.ptos = 'ninguno' then
    v_xml := '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><FEParamGetPtosVentaResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FEParamGetPtosVentaResult><Errors><Err><Code>602</Code><Msg>Sin Resultados</Msg></Err></Errors></FEParamGetPtosVentaResult></FEParamGetPtosVentaResponse></soap:Body></soap:Envelope>';
  elsif v_soap like '%FEParamGetPtosVenta%' then
    v_xml := '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><FEParamGetPtosVentaResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FEParamGetPtosVentaResult><ResultGet>'
      || '<PtoVenta><Nro>3</Nro><EmisionTipo>CAE - RECE</EmisionTipo><Bloqueado>N</Bloqueado><FchBaja>NULL</FchBaja></PtoVenta>'
      || '<PtoVenta><Nro>5</Nro><EmisionTipo>CAE - RECE</EmisionTipo><Bloqueado>S</Bloqueado><FchBaja>NULL</FchBaja></PtoVenta>'
      || '</ResultGet></FEParamGetPtosVentaResult></FEParamGetPtosVentaResponse></soap:Body></soap:Envelope>';
  else
    v_status := 0; v_xml := '';
  end if;
  return jsonb_build_object('status', 200, 'cuerpo', jsonb_build_object('status', v_status, 'cuerpo', v_xml));
end $$;

create function prueba.como_admin() returns void language sql as $$ select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) $$;
create function prueba.como_vendedora() returns void language sql as $$ select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true) $$;
create function prueba.integ() returns integraciones language sql stable security definer set search_path = public as $$ select * from integraciones $$;
create function prueba.clave_vault(p_id uuid) returns text language sql stable security definer set search_path = public as $$ select decrypted_secret from vault.decrypted_secrets where id = p_id $$;
create function prueba.cuit() returns text language sql stable security definer set search_path = public as $$ select cuit from datos_legales $$;
create function prueba.llamadas_a(p_patron text) returns bigint language sql stable security definer as $$ select count(*) from prueba.llamadas where url like p_patron $$;
create function prueba.wsaa(p_modo text) returns void language sql security definer as $$ update prueba.config set wsaa = p_modo $$;
create function prueba.olvidar_acceso() returns void language sql security definer set search_path = public as $$ update integraciones set arca_token = null, arca_sign = null, arca_token_vence = null $$;
grant execute on all functions in schema prueba to anon, authenticated;
select plan(26);

update integraciones set sitio_url = 'https://tienda.test' where unica;
set local role authenticated;

-- ── Permisos ──
select prueba.como_vendedora();
select throws_ok($$ select arca_estado() $$, 'Solo el administrador configura la facturación', 'la vendedora no ve la configuración de ARCA');
select throws_ok($$ select guardar_datos_fiscales('20-12345678-6', 'X', 'Monotributo', 'Calle 1') $$, 'Solo el administrador configura la facturación', 'ni la cambia');

-- ── Datos fiscales ──
select prueba.como_admin();
select throws_ok($$ select guardar_datos_fiscales('20-12345678-9', 'Mi Local SRL', 'Responsable Inscripto', 'Calle 123') $$,
  'El CUIT no es válido: revisá los 11 números (el último es el dígito verificador)', 'un CUIT con el dígito mal se rechaza');
select throws_ok($$ select guardar_datos_fiscales('20123456786', 'Mi Local SRL', 'Otra', 'Calle 123') $$, 'Elegí la categoría frente al IVA', 'la categoría es de una lista');
select lives_ok($$ select guardar_datos_fiscales('20123456786', 'Mi Local SRL', 'Responsable Inscripto', 'Calle 123', '901-123456-7', '2020-03-01') $$, 'datos fiscales guardados');
select is(prueba.cuit(), '20-12345678-6', 'el CUIT queda con guiones');

-- ── Pedido de certificado y llave en el Vault ──
select matches(arca_generar_pedido_certificado('caja'), '^-----BEGIN CERTIFICATE REQUEST-----', 'devuelve el pedido de certificado para subir a ARCA');
select matches(prueba.clave_vault((prueba.integ()).arca_clave_nueva_vault_id), 'LLAVEFALSA', 'la llave queda en el Vault (como nueva)');
select throws_ok($$ select count(*) from vault.decrypted_secrets $$, '42501', null, 'nadie del panel puede leer el Vault');
select ok((arca_estado())::text !~ 'LLAVEFALSA', 'el estado no muestra la llave');

-- ── Certificado ──
select throws_ok($$ select arca_guardar_certificado('hola') $$, 'Eso no parece un certificado: tiene que empezar con -----BEGIN CERTIFICATE-----', 'lo que no es un certificado se rechaza');
reset role; update prueba.config set cuit = '20999999990'; set local role authenticated; select prueba.como_admin();
select throws_like($$ select arca_guardar_certificado('-----BEGIN CERTIFICATE-----X-----END CERTIFICATE-----') $$, 'El certificado es del CUIT 20999999990%', 'un certificado de otro CUIT se rechaza');
reset role; update prueba.config set cuit = '20123456786', coincide = false; set local role authenticated; select prueba.como_admin();
select throws_like($$ select arca_guardar_certificado('-----BEGIN CERTIFICATE-----X-----END CERTIFICATE-----') $$, 'Primero generá el pedido%', 'si no es de la llave nueva y no hay otra, se rechaza');
reset role; update prueba.config set coincide = true; set local role authenticated; select prueba.como_admin();
select is(arca_guardar_certificado('-----BEGIN CERTIFICATE-----X-----END CERTIFICATE-----') ->> 'cuit', '20123456786', 'el certificado bueno se guarda');
select ok((prueba.integ()).arca_clave_vault_id is not null and (prueba.integ()).arca_clave_nueva_vault_id is null, 'la llave nueva pasó a ser la de uso');

-- ── Probar: ARCA responde, acceso, puntos de venta ──
select ok((arca_probar_servicio() ->> 'ok')::boolean and (arca_probar_acceso() ->> 'ok')::boolean and (arca_probar_puntos_venta() ->> 'ok')::boolean, 'los tres pasos salen bien');
select is((prueba.integ()).arca_token, 'TOKENSECRETO', 'el acceso queda guardado');
select is((select count(*)::int from puntos_venta_fiscales where ambiente = 'homologacion'), 2, 'trae los puntos de venta de ARCA');
select is((select numero from puntos_venta_fiscales where por_defecto), 3, 'el primero habilitado queda como el de siempre (el 5 está bloqueado)');
select arca_probar_acceso(); select arca_probar_puntos_venta();
select is(prueba.llamadas_a('%LoginCms'), 1::bigint, 'el acceso se reusa: no se pide de nuevo mientras vale');
select ok((arca_estado())::text !~ 'TOKENSECRETO' and (arca_estado())::text !~ 'SIGNSECRETO', 'el estado no muestra el acceso');

-- ── Si ARCA ya dio un acceso que el sistema perdió ──
select prueba.olvidar_acceso(); select prueba.wsaa('ya_tiene');
select matches(arca_probar_acceso() ->> 'texto', 'ya dio un acceso que el sistema no tiene guardado', 'se explica que hay que esperar a que venza');

-- ── Punto de venta de siempre ──
select throws_ok(format($$ select arca_guardar_punto_venta(%s, 'Bloqueado', true, true) $$, (select id from puntos_venta_fiscales where numero = 5)),
  'El de siempre tiene que estar activo y habilitado en ARCA', 'uno bloqueado en ARCA no puede ser el de siempre');

-- ── En pruebas se puede agregar un punto de venta a mano; en producción no ──
select arca_agregar_punto_venta_prueba(1);
select is((select count(*)::int from puntos_venta_fiscales where ambiente = 'homologacion' and numero = 1), 1, 'en pruebas se agrega a mano');

-- ── Otro ambiente: el acceso de pruebas no sirve en producción ──
select arca_cambiar_ambiente('produccion');
select is((arca_estado() ->> 'acceso_vigente')::boolean, false, 'en producción hace falta otro acceso (y otro certificado)');
select throws_like($$ select arca_agregar_punto_venta_prueba(2) $$, 'En producción se usan los puntos de venta que da ARCA%', 'en producción no se agregan a mano');

select * from finish();
rollback;
