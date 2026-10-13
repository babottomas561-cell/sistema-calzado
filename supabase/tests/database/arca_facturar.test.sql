-- ARCA fase 2: facturar ventas (B y C), importes por alícuota, numeración, recuperación de un corte, cola de reintentos, rechazos,
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
select plan(54);

set local role authenticated;
select prueba.como_admin();
select ajustar_stock(prueba.var(1), 50, 'Inventario para la prueba'), ajustar_stock(prueba.var(2), 50, 'Inventario para la prueba');

-- ── Activar ──
select throws_like($$ select arca_activar(true) $$, 'Falta elegir el punto de venta%', 'sin punto de venta no se activa');
reset role;
insert into puntos_venta_fiscales (ambiente, numero, nombre, por_defecto) values ('homologacion', 3, 'Local', true);
set local role authenticated; select prueba.como_admin();
select lives_ok($$ select arca_activar(true, 'elegir', 'fiscal') $$, 'con todo cargado se activa');
select is(facturacion_caja() ->> 'letra', 'B', 'un responsable inscripto le factura B al consumidor final');
select is(facturacion_caja() ->> 'modo', 'elegir', 'y la caja sabe que puede elegir factura o comprobante interno');

-- ── Factura B de una venta ──
insert into prueba.ids values ('v1', prueba.vender(prueba.var(1), 2, 50000));
select is((select alicuota_iva from venta_items where venta_id = prueba.id('v1')), 21.00, 'el renglón guarda el IVA del artículo (el del local, 21 %)');
select is(facturar_venta(prueba.id('v1')) ->> 'estado', 'autorizada', 'la factura sale autorizada');
select is((prueba.f(prueba.id('v1'))).comprobante, '00003-00000001', 'con el punto de venta y el primer número');
select is((prueba.f(prueba.id('v1'))).cae, '70000000006001', 'y el CAE que dio ARCA');
select is((prueba.f(prueba.id('v1'))).total, prueba.total(prueba.id('v1')), 'el total es lo cobrado');
select is((prueba.f(prueba.id('v1'))).iva, round(prueba.total(prueba.id('v1')) * 21 / 121, 2), 'el IVA contenido al 21 %');
select ok((select xml from prueba.llamadas where metodo = 'FECAESolicitar' order by id desc limit 1) ~ '<ar:CbteTipo>6</ar:CbteTipo>.*<ar:DocTipo>99</ar:DocTipo><ar:DocNro>0</ar:DocNro>',
  'Factura B (6) a consumidor final sin identificar (99)');
select ok((select xml from prueba.llamadas where metodo = 'FECAESolicitar' order by id desc limit 1) ~ '<ar:AlicIva><ar:Id>5</ar:Id>', 'con el IVA al 21 % (código 5)');
select throws_ok(format('select facturar_venta(%s)', prueba.id('v1')), 'Esta venta ya tiene factura', 'una venta no se factura dos veces');

-- ── Dos alícuotas, con el cliente identificado ──
reset role; update productos set alicuota_iva = 10.5 where id = (select producto_id from variantes where id = prueba.var(2)); set local role authenticated; select prueba.como_admin();
insert into prueba.ids select 'v2', registrar_venta(jsonb_build_array(jsonb_build_object('variante_id', prueba.var(1), 'cantidad', 1, 'precio_unitario', 30000),
  jsonb_build_object('variante_id', prueba.var(2), 'cantidad', 1, 'precio_unitario', 20000)),
  jsonb_build_array(jsonb_build_object('medio_pago_id', prueba.medio('EFE'))), (select id from clientes where nombre = 'María González'));
select is(facturar_venta(prueba.id('v2')) ->> 'comprobante', '00003-00000002', 'la siguiente toma el número siguiente');
select is(jsonb_array_length((prueba.f(prueba.id('v2'))).detalle_iva), 2, 'con dos alícuotas, dos grupos de IVA');
select is((select sum((d ->> 'base')::numeric + (d ->> 'iva')::numeric) from jsonb_array_elements((prueba.f(prueba.id('v2'))).detalle_iva) d), prueba.total(prueba.id('v2')),
  'base + IVA de los grupos suman justo el total');
select is((prueba.f(prueba.id('v2'))).doc_tipo, 96, 'el cliente con DNI va identificado');
select is((prueba.f(prueba.id('v2'))).doc_nro, '30123456', 'con su DNI sin puntos');

-- ── Recuperación: ARCA tiene el número 3 autorizado para esta venta, pero el sistema no lo guardó (se cortó) ──
insert into prueba.ids values ('v3', prueba.vender(prueba.var(1), 1, 41000));
reset role;
insert into prueba.arca values (3, 6, 3, prueba.total(prueba.id('v3')), '0', to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'YYYYMMDD'), '79999999999999');
set local role authenticated; select prueba.como_admin();
insert into prueba.ids values ('solicitudes_antes', prueba.solicitudes());
select is(facturar_venta(prueba.id('v3')) ->> 'comprobante', '00003-00000003', 'se reconoce el comprobante que ARCA ya había autorizado');
select is((prueba.f(prueba.id('v3'))).cae, '79999999999999', 'con su CAE');
select is(prueba.solicitudes(), prueba.id('solicitudes_antes'), 'sin pedir un CAE nuevo: nunca dos facturas para la misma venta');

-- ── ARCA no contesta: queda en la cola y se reintenta sola ──
select prueba.modo('caido');
insert into prueba.ids values ('v4', prueba.vender(prueba.var(1), 1, 12000));
select is(facturar_venta(prueba.id('v4')) ->> 'estado', 'error', 'sin respuesta de ARCA queda para reintentar');
select ok((prueba.f(prueba.id('v4'))).proximo_intento > now(), 'con su próximo intento');
select is(prueba.id('v4') is not null and exists (select 1 from ventas where id = prueba.id('v4')), true, 'la venta queda guardada igual');
reset role;
select prueba.modo('ok');
update facturas set proximo_intento = now() where id = (prueba.f(prueba.id('v4'))).id;
select is(_facturas_reintentar(), 1, 'la cola la manda');
select is((prueba.f(prueba.id('v4'))).estado, 'autorizada', 'y sale autorizada');
set local role authenticated; select prueba.como_admin();

-- ── ARCA rechaza: no se reintenta sola; se corrige y se reintenta a mano ──
select prueba.modo('rechazo');
insert into prueba.ids values ('v5', prueba.vender(prueba.var(1), 1, 15000));
select is(facturar_venta(prueba.id('v5')) ->> 'estado', 'rechazada', 'si ARCA dice que no, queda rechazada');
select matches((prueba.f(prueba.id('v5'))).ultimo_error, '^ARCA: 10015', 'con el motivo de ARCA');
reset role; update facturas set proximo_intento = now() - interval '1 minute' where id = (prueba.f(prueba.id('v5'))).id;
select is(_facturas_reintentar(), 0, 'la cola no reintenta una rechazada (hay que corregir el dato)');
select prueba.modo('ok');
set local role authenticated; select prueba.como_admin();
select is(reintentar_factura((prueba.f(prueba.id('v5'))).id) ->> 'estado', 'autorizada', 'reintentada a mano, sale');

-- ── Número desfasado (otro sistema emitió en el medio): vuelve a la cola ──
select prueba.modo('numero');
insert into prueba.ids values ('v6', prueba.vender(prueba.var(1), 1, 9000));
select is(facturar_venta(prueba.id('v6')) ->> 'estado', 'error', 'un número que no era el próximo vuelve a la cola');
select prueba.modo('ok');

-- ── Umbral de identificación ──
reset role; update configuracion_fiscal set umbral_identificacion = 5000; set local role authenticated; select prueba.como_admin();
insert into prueba.ids values ('v7', prueba.vender(prueba.var(1), 1, 8000));
select throws_like(format('select facturar_venta(%s)', prueba.id('v7')), 'Para facturar $ 5.000 o más a consumidor final, ARCA pide el DNI%', 'desde el umbral, sin DNI no se factura');
reset role; update configuracion_fiscal set umbral_identificacion = 10000000; set local role authenticated; select prueba.como_admin();

-- ── Anular una venta facturada: nota de crédito ──
select anular_venta(prueba.id('v1'), 'error_carga', null);
select is((prueba.nc(prueba.id('v1'))).cbte_tipo, 8, 'anular una venta con factura B crea la nota de crédito B');
select is((prueba.nc(prueba.id('v1'))).total, (prueba.f(prueba.id('v1'))).total, 'por el total');
reset role;
update facturas set proximo_intento = now() where id = (prueba.nc(prueba.id('v1'))).id;
select ok(_facturas_reintentar() >= 1, 'la cola la manda');
select is((prueba.nc(prueba.id('v1'))).estado, 'autorizada', 'y sale autorizada');
select ok((select xml from prueba.llamadas where metodo = 'FECAESolicitar' order by id desc limit 1) ~ '<ar:CbtesAsoc><ar:CbteAsoc><ar:Tipo>6</ar:Tipo><ar:PtoVta>3</ar:PtoVta><ar:Nro>1</ar:Nro>',
  'con la referencia a la factura que corrige');
set local role authenticated; select prueba.como_admin();
select anular_venta(prueba.id('v6'), 'error_carga', null);
select is((prueba.f(prueba.id('v6'))).estado, 'cancelada', 'anular una venta cuya factura nunca llegó a ARCA la cancela');
select is(prueba.nc(prueba.id('v6')) is null or (prueba.nc(prueba.id('v6'))).id is null, true, 'sin nota de crédito');

-- ── El comprobante con los datos fiscales ──
select is(comprobante_de('venta', prueba.id('v2')) -> 'fiscal' ->> 'letra', 'B', 'el comprobante lleva la letra');
select is(comprobante_de('venta', prueba.id('v2')) -> 'fiscal' ->> 'cae', (prueba.f(prueba.id('v2'))).cae, 'el CAE');
select is((convert_from(decode(split_part(comprobante_de('venta', prueba.id('v2')) -> 'fiscal' ->> 'qr', '?p=', 2), 'base64'), 'UTF8')::jsonb ->> 'nroCmp')::int, 2,
  'y el QR de ARCA con el número de la factura');
select is(comprobante_de('venta', prueba.id('v1')) -> 'fiscal' -> 'nota_credito' ->> 'estado', 'autorizada', 'una venta anulada muestra su nota de crédito');

-- ── Permisos ──
select prueba.como_vendedora();
insert into prueba.ids values ('vv', prueba.vender(prueba.var(1), 1, 11000));
select is(facturar_venta(prueba.id('vv')) ->> 'estado', 'autorizada', 'la vendedora factura sus ventas');
select is((select count(*) from facturas where venta_id = prueba.id('v2')), 0::bigint, 'pero no ve las facturas de ventas ajenas');
select prueba.como_cliente();
select throws_ok(format('select facturar_venta(%s)', prueba.id('vv')), 'No tenés permiso para facturar', 'un cliente de la tienda no factura');

-- ── Monotributo: Factura C ──
reset role; update datos_legales set condicion_iva = 'Monotributo' where unica; set local role authenticated; select prueba.como_admin();
insert into prueba.ids values ('v8', prueba.vender(prueba.var(2), 1, 20000));
select is((facturar_venta(prueba.id('v8')) ->> 'letra'), 'C', 'un monotributista factura C');
select ok((prueba.f(prueba.id('v8'))).iva = 0 and (prueba.f(prueba.id('v8'))).neto = (prueba.f(prueba.id('v8'))).total, 'sin IVA discriminado');
select ok((select xml from prueba.llamadas where metodo = 'FECAESolicitar' order by id desc limit 1) !~ '<ar:Iva>', 'y sin detalle de alícuotas');

-- ── Medio de pago «siempre con factura»: la base crea la factura al guardar la venta ──
reset role; update medios_pago set siempre_factura = true where codigo = 'TRA'; set local role authenticated; select prueba.como_admin();
insert into prueba.ids select 'vt', registrar_venta(jsonb_build_array(jsonb_build_object('variante_id', prueba.var(1), 'cantidad', 1, 'precio_unitario', 7000)),
  jsonb_build_array(jsonb_build_object('medio_pago_id', prueba.medio('TRA'))));
set constraints all immediate; set constraints all deferred;
select is((prueba.f(prueba.id('vt'))).estado, 'pendiente', 'pagada con un medio «siempre con factura», la venta ya tiene su factura (la manda la cola)');
select is(facturar_venta(prueba.id('vt')) ->> 'estado', 'autorizada', 'y si la caja pide facturar, manda esa misma (no hace otra)');
select is((select count(*) from facturas where venta_id = prueba.id('vt'))::int, 1, 'una sola factura');
insert into prueba.ids values ('ve', prueba.vender(prueba.var(1), 1, 7000));
set constraints all immediate; set constraints all deferred;
select is(prueba.f(prueba.id('ve')) is null or (prueba.f(prueba.id('ve'))).id is null, true, 'en efectivo, no se crea sola');

-- ── Apagada ──
select arca_activar(false);
insert into prueba.ids values ('v9', prueba.vender(prueba.var(1), 1, 5000));
select throws_like(format('select facturar_venta(%s)', prueba.id('v9')), 'La facturación con ARCA no está activa%', 'apagada, no factura');

select * from finish();
rollback;
