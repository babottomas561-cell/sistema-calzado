-- ARCA fase 3 (usa el mismo ARCA simulado que la fase 2): datos fiscales del cliente, Factura A, notas de crédito por devoluciones y cambios.
-- (Encabezado copiado de arca_facturar.) Fase 2: facturar ventas (B y C), importes por alícuota, numeración, recuperación de un corte, cola de reintentos, rechazos,
-- nota de crédito al anular, datos fiscales en el comprobante y permisos. ARCA se simula reemplazando _pedir_http: prueba.arca guarda
-- los comprobantes que «autorizó» (así se puede preparar un número que ARCA tiene y el sistema no).
begin;
create extension if not exists pgtap with schema extensions;
create schema prueba;
grant usage on schema prueba to anon, authenticated;
create table prueba.llamadas (id serial, metodo text, xml text);
create table prueba.config (unica boolean primary key default true, modo text not null default 'ok');   -- ok · caido · rechazo · numero
insert into prueba.config default values;
create table prueba.arca (pv int, tipo int, nro bigint, total numeric, doc text, fecha text, cae text);
create table prueba.ids (nombre text primary key, id bigint);
grant all on all tables in schema prueba to anon, authenticated;
grant all on all sequences in schema prueba to anon, authenticated;

create or replace function public._pedir_http(p_metodo text, p_url text, p_cabeceras jsonb default '{}', p_tipo text default null, p_cuerpo text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c prueba.config; v_accion text := p_cuerpo::jsonb ->> 'accion'; v_url text := p_cuerpo::jsonb ->> 'url'; v_soap text := coalesce(p_cuerpo::jsonb ->> 'soap_action', '');
        v_req text := p_cuerpo::jsonb ->> 'xml'; v_xml text; v_vence text; v_pv int; v_tipo int; v_nro bigint; v_ult bigint; a prueba.arca;
        env1 text := '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>'; env2 text := '</soap:Body></soap:Envelope>';
begin
  select * into c from prueba.config;
  if v_accion = 'firmar' then return jsonb_build_object('status', 200, 'cuerpo', jsonb_build_object('firmado', 'Q01T')); end if;
  if v_accion <> 'enviar' then return jsonb_build_object('status', 404, 'cuerpo', '{}'::jsonb); end if;
  if v_url like '%LoginCms' then
    v_vence := to_char((now() + interval '12 hours') at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD"T"HH24:MI:SS') || '.000-03:00';
    return jsonb_build_object('status', 200, 'cuerpo', jsonb_build_object('status', 200, 'cuerpo',
      '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><loginCmsResponse><loginCmsReturn>'
      || '&lt;loginTicketResponse&gt;&lt;header&gt;&lt;expirationTime&gt;' || v_vence || '&lt;/expirationTime&gt;&lt;/header&gt;&lt;credentials&gt;&lt;token&gt;TK&lt;/token&gt;&lt;sign&gt;SG&lt;/sign&gt;&lt;/credentials&gt;&lt;/loginTicketResponse&gt;'
      || '</loginCmsReturn></loginCmsResponse></soapenv:Body></soapenv:Envelope>'));
  end if;
  insert into prueba.llamadas (metodo, xml) values (substring(v_soap from 'FEV1/(\w+)'), v_req);
  if c.modo = 'caido' then return jsonb_build_object('status', 200, 'cuerpo', jsonb_build_object('status', 0, 'cuerpo', '', 'error', 'Sin conexión con ARCA')); end if;
  v_pv := substring(v_req from '<ar:PtoVta>(\d+)<')::int; v_tipo := substring(v_req from '<ar:CbteTipo>(\d+)<')::int;
  select coalesce(max(nro), 0) into v_ult from prueba.arca where pv = v_pv and tipo = v_tipo;
  if v_soap like '%FECompUltimoAutorizado%' then
    v_xml := '<FECompUltimoAutorizadoResponse><FECompUltimoAutorizadoResult><PtoVta>' || v_pv || '</PtoVta><CbteTipo>' || v_tipo || '</CbteTipo><CbteNro>' || v_ult
      || '</CbteNro></FECompUltimoAutorizadoResult></FECompUltimoAutorizadoResponse>';
  elsif v_soap like '%FECompConsultar%' then
    v_nro := substring(v_req from '<ar:CbteNro>(\d+)<')::bigint;
    select * into a from prueba.arca where pv = v_pv and tipo = v_tipo and nro = v_nro;
    v_xml := case when a.nro is null then '<FECompConsultarResponse><FECompConsultarResult><Errors><Err><Code>602</Code><Msg>No existen datos</Msg></Err></Errors></FECompConsultarResult></FECompConsultarResponse>'
      else '<FECompConsultarResponse><FECompConsultarResult><ResultGet><DocNro>' || a.doc || '</DocNro><CbteFch>' || a.fecha || '</CbteFch><ImpTotal>' || a.total
        || '</ImpTotal><CodAutorizacion>' || a.cae || '</CodAutorizacion><FchVto>20261030</FchVto><Resultado>A</Resultado></ResultGet></FECompConsultarResult></FECompConsultarResponse>' end;
  elsif v_soap like '%FECAESolicitar%' then
    v_nro := substring(v_req from '<ar:CbteDesde>(\d+)<')::bigint;
    if c.modo = 'rechazo' then
      v_xml := '<FECAESolicitarResponse><FECAESolicitarResult><FeCabResp><Resultado>R</Resultado></FeCabResp><FeDetResp><FECAEDetResponse><Resultado>R</Resultado>'
        || '<Observaciones><Obs><Code>10015</Code><Msg>El documento del receptor no es valido</Msg></Obs></Observaciones></FECAEDetResponse></FeDetResp></FECAESolicitarResult></FECAESolicitarResponse>';
    elsif c.modo = 'numero' or v_nro <> v_ult + 1 then
      v_xml := '<FECAESolicitarResponse><FECAESolicitarResult><FeCabResp><Resultado>R</Resultado></FeCabResp><FeDetResp><FECAEDetResponse><Resultado>R</Resultado>'
        || '<Observaciones><Obs><Code>10016</Code><Msg>El numero o fecha del comprobante no se corresponde con el proximo a autorizar</Msg></Obs></Observaciones></FECAEDetResponse></FeDetResp></FECAESolicitarResult></FECAESolicitarResponse>';
    else
      insert into prueba.arca values (v_pv, v_tipo, v_nro, substring(v_req from '<ar:ImpTotal>([\d.]+)<')::numeric, substring(v_req from '<ar:DocNro>(\d+)<'),
        substring(v_req from '<ar:CbteFch>(\d+)<'), '7' || lpad((v_tipo * 1000 + v_nro)::text, 13, '0'));
      v_xml := '<FECAESolicitarResponse><FECAESolicitarResult><FeCabResp><Resultado>A</Resultado></FeCabResp><FeDetResp><FECAEDetResponse><Resultado>A</Resultado>'
        || '<CAE>7' || lpad((v_tipo * 1000 + v_nro)::text, 13, '0') || '</CAE><CAEFchVto>20261030</CAEFchVto></FECAEDetResponse></FeDetResp></FECAESolicitarResult></FECAESolicitarResponse>';
    end if;
  else
    return jsonb_build_object('status', 200, 'cuerpo', jsonb_build_object('status', 0, 'cuerpo', ''));
  end if;
  return jsonb_build_object('status', 200, 'cuerpo', jsonb_build_object('status', 200, 'cuerpo', env1 || v_xml || env2));
end $$;

create function prueba.como_admin() returns void language sql as $$ select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true) $$;
create function prueba.como_vendedora() returns void language sql as $$ select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true) $$;
create function prueba.como_cliente() returns void language sql as $$ select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true) $$;
create function prueba.id(p text) returns bigint language sql stable as $$ select id from prueba.ids where nombre = p $$;
create function prueba.medio(p text) returns bigint language sql stable security definer set search_path = public as $$ select id from medios_pago where codigo = p $$;
-- Dos variantes de artículos distintos, con stock
create function prueba.var(p_n int) returns bigint language sql stable security definer set search_path = public as $$
  select v.id from variantes v join productos p on p.id = v.producto_id where p.activo
   and p.id = (select id from productos where activo order by id offset p_n - 1 limit 1) order by v.id limit 1 $$;
create function prueba.vender(p_var bigint, p_cant int, p_precio numeric, p_cliente bigint default null) returns bigint language sql as $$
  select registrar_venta(jsonb_build_array(jsonb_build_object('variante_id', p_var, 'cantidad', p_cant, 'precio_unitario', p_precio)),
    jsonb_build_array(jsonb_build_object('medio_pago_id', prueba.medio('EFE'))), p_cliente) $$;
create function prueba.f(p_venta bigint) returns facturas language sql stable security definer set search_path = public as $$
  select * from facturas where venta_id = p_venta and clase = 'factura' order by id desc limit 1 $$;
create function prueba.nc(p_venta bigint) returns facturas language sql stable security definer set search_path = public as $$
  select * from facturas where venta_id = p_venta and clase = 'nota_credito' order by id desc limit 1 $$;
create function prueba.total(p_venta bigint) returns numeric language sql stable security definer set search_path = public as $$ select total from ventas where id = p_venta $$;
create function prueba.solicitudes() returns bigint language sql stable as $$ select count(*) from prueba.llamadas where metodo = 'FECAESolicitar' $$;
create function prueba.modo(p text) returns void language sql security definer as $$ update prueba.config set modo = p $$;
grant execute on all functions in schema prueba to anon, authenticated;

-- ── Instalación: datos fiscales, certificado de pruebas, llave en el Vault, sitio ──
update datos_legales set cuit = '20-12345678-6', razon_social = 'Mi Tienda SRL', condicion_iva = 'Responsable Inscripto', domicilio_legal = 'San Martín 100' where unica;
update integraciones set sitio_url = 'https://tienda.test', arca_cert_homologacion = 'CERT', arca_cert_homologacion_vence = now() + interval '2 years',
  arca_clave_vault_id = vault.create_secret('LLAVE', 'arca_prueba_' || gen_random_uuid()) where unica;
update clientes set documento = '30.123.456' where nombre = 'María González';
select plan(30);

set local role authenticated;
select prueba.como_admin();
select ajustar_stock(prueba.var(1), 50, 'Inventario para la prueba'), ajustar_stock(prueba.var(2), 50, 'Inventario para la prueba');
reset role;
insert into puntos_venta_fiscales (ambiente, numero, nombre, por_defecto) values ('homologacion', 3, 'Local', true);
update configuracion_fiscal set activa = true;
create function prueba.cliente(p_nombre text) returns bigint language sql stable security definer set search_path = public as $$ select id from clientes where nombre = p_nombre $$;
create function prueba.devolver(p_venta bigint) returns bigint language sql as $$
  select registrar_devolucion(p_venta, jsonb_build_array(jsonb_build_object('venta_item_id', (select min(id) from venta_items where venta_id = p_venta), 'cantidad', 1, 'estado', 'bueno')), 'talle') $$;
grant execute on all functions in schema prueba to anon, authenticated;
set local role authenticated; select prueba.como_admin();

-- ── Datos fiscales del cliente ──
select throws_like($$ insert into clientes (nombre, condicion_iva) values ('Sin CUIT SA', 'responsable_inscripto') $$, 'Para un cliente responsable inscripto hace falta su CUIT%',
  'un inscripto sin CUIT no se guarda');
select throws_like($$ insert into clientes (nombre, tipo_documento, documento) values ('Mal', 'CUIT', '20-12345678-0') $$, 'El CUIT no es válido%', 'un CUIT con el dígito mal, tampoco');
insert into clientes (nombre, razon_social, condicion_iva, tipo_documento, documento, domicilio_fiscal, localidad_fiscal, provincia)
  values ('Pérez Inscripto', 'Pérez Indumentaria SRL', 'responsable_inscripto', 'CUIT', '20-12345678-6', 'Mitre 50', 'San Miguel de Tucumán', 'Tucumán');
insert into clientes (nombre, condicion_iva, tipo_documento, documento) values ('Ana Mono', 'monotributo', 'CUIT', '20123456786');
insert into clientes (nombre, condicion_iva, tipo_documento, documento) values ('Exento SA', 'exento', 'CUIT', '20123456786');
select pass('un inscripto, un monotributista y un exento con CUIT se guardan');

-- ── Letra según el cliente (local responsable inscripto) ──
select is(letra_para_cliente(null), 'B', 'consumidor final: B');
select is(letra_para_cliente(prueba.cliente('Pérez Inscripto')), 'A', 'responsable inscripto: A');
select is(letra_para_cliente(prueba.cliente('Ana Mono')), 'A', 'monotributista: A');
select is(letra_para_cliente(prueba.cliente('Exento SA')), 'B', 'exento: B');

-- ── Factura A ──
insert into prueba.ids values ('va', prueba.vender(prueba.var(1), 2, 30000, prueba.cliente('Pérez Inscripto')));
select is(facturar_venta(prueba.id('va')) ->> 'letra', 'A', 'la venta a un inscripto sale con Factura A');
select ok((prueba.f(prueba.id('va'))).cbte_tipo = 1 and (prueba.f(prueba.id('va'))).doc_tipo = 80 and (prueba.f(prueba.id('va'))).condicion_iva_receptor = 1,
  'tipo 1, con su CUIT (80) y condición inscripto (1)');
select is((prueba.f(prueba.id('va'))).receptor, 'Pérez Indumentaria SRL', 'a nombre de su razón social');
select ok((select xml from prueba.llamadas where metodo = 'FECAESolicitar' order by id desc limit 1) ~ '<ar:DocTipo>80</ar:DocTipo><ar:DocNro>20123456786</ar:DocNro>.*<ar:CondicionIVAReceptorId>1</ar:CondicionIVAReceptorId>',
  'ARCA recibe el CUIT y la condición');
select is(comprobante_de('venta', prueba.id('va')) -> 'fiscal' ->> 'condicion_receptor', 'IVA Responsable Inscripto', 'el comprobante muestra la condición del cliente');
select matches(comprobante_de('venta', prueba.id('va')) -> 'fiscal' ->> 'domicilio_receptor', 'Mitre 50', 'y su domicilio fiscal');

-- ── Devolución de una venta facturada: nota de crédito por lo devuelto ──
insert into prueba.ids values ('da', prueba.devolver(prueba.id('va')));
set constraints all immediate; set constraints all deferred;
select is((select clase || '-' || cbte_tipo from facturas where devolucion_id = prueba.id('da')), 'nota_credito-3', 'la devolución crea la nota de crédito A');
select is((select total from facturas where devolucion_id = prueba.id('da')), (select total from devoluciones where id = prueba.id('da')), 'por lo devuelto (el saldo a favor)');
select ok((select neto + iva = total from facturas where devolucion_id = prueba.id('da')), 'neto + IVA = total');
reset role;
update facturas set proximo_intento = now() where devolucion_id = prueba.id('da');
select ok(_facturas_reintentar() >= 1, 'la cola la manda');
select is((select estado from facturas where devolucion_id = prueba.id('da')), 'autorizada', 'y sale autorizada');
-- Su comprobante: la devolución se imprime como la nota de crédito, con el formato propio de las notas de crédito
update configuracion_impresion set por_tipo = '{"nota_credito": {"formato": "a4", "copias": 2}, "factura": {"copias": 3}}';
set local role authenticated; select prueba.como_admin();
select is(comprobante_de('devolucion', prueba.id('da')) -> 'fiscal' ->> 'clase', 'nota_credito', 'la devolución se imprime como nota de crédito');
select matches(comprobante_de('devolucion', prueba.id('da')) -> 'fiscal' ->> 'asociada', '^Factura A ', 'diciendo qué factura corrige');
select is(comprobante_de('devolucion', prueba.id('da')) -> 'config' ->> 'formato', 'a4', 'con el papel propio de las notas de crédito');
select is((comprobante_de('venta', prueba.id('va')) -> 'config' ->> 'copias')::int, 3, 'y la factura, con sus copias');
select is(comprobante_de('venta', (select min(id) from ventas)) -> 'config' ->> 'clave', 'interno', 'una venta sin factura usa el formato del comprobante interno');
insert into prueba.ids values ('db', prueba.devolver(prueba.id('va')));
set constraints all immediate; set constraints all deferred;
select is((select count(*) from facturas where factura_id = (prueba.f(prueba.id('va'))).id)::int, 2, 'otra devolución parcial de la misma factura, otra nota de crédito');

-- ── Venta sin factura: la devolución no hace nota de crédito ──
insert into prueba.ids values ('vb', prueba.vender(prueba.var(1), 1, 30000, (select id from clientes where nombre = 'María González')));
insert into prueba.ids values ('dc', prueba.devolver(prueba.id('vb')));
set constraints all immediate; set constraints all deferred;
select is((select count(*) from facturas where devolucion_id = prueba.id('dc'))::int, 0, 'sin factura, sin nota de crédito');

-- ── Cambio de una venta facturada: la venta nueva también sale con factura ──
insert into prueba.ids values ('vc', prueba.vender(prueba.var(1), 1, 30000, prueba.cliente('Pérez Inscripto')));
select facturar_venta(prueba.id('vc'));
insert into prueba.ids select 'cv', (registrar_cambio(prueba.id('vc'),
  jsonb_build_array(jsonb_build_object('venta_item_id', (select min(id) from venta_items where venta_id = prueba.id('vc')), 'cantidad', 1, 'estado', 'bueno')),
  jsonb_build_array(jsonb_build_object('variante_id', prueba.var(2), 'cantidad', 1)),
  jsonb_build_array(jsonb_build_object('medio_pago_id', prueba.medio('EFE')))) ->> 'venta_id')::bigint;
set constraints all immediate; set constraints all deferred;
select is((prueba.f(prueba.id('cv'))).letra, 'A', 'la venta del cambio sale con factura (A, como la original)');

-- ── Pantalla Facturas: ventas sin factura y facturar en tanda ──
select ok(exists (select 1 from ventas_sin_factura(current_date - 1, current_date + 1) where id = prueba.id('vb')), 'la venta sin factura aparece para regularizar');
select is((facturar_en_tanda(array[prueba.id('vb')]) ->> 'creadas')::int, 1, 'facturar en tanda la crea');
select is((prueba.f(prueba.id('vb'))).estado, 'pendiente', 'y queda en la cola');
select ok(not exists (select 1 from ventas_sin_factura(current_date - 1, current_date + 1) where id = prueba.id('vb')), 'ya no figura como sin factura');

select * from finish();
rollback;
