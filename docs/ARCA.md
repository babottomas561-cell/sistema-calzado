# Integración con ARCA (factura electrónica): diseño

> **Estado:** borrador para revisar con el contador. **No está construido.** Este documento queda solo en la compu (no se sube a
> GitHub ni a producción) hasta que se apruebe.
>
> Lo marcado con **(verificar)** sale de guías de terceros o de memoria, no de los manuales oficiales vigentes: se confirma en el
> manual de WSFEv1 de ARCA y en homologación antes de construir.

---

## 0. En pocas palabras

- El sistema pide a ARCA el **CAE** de cada factura por los *web services* oficiales (WSAA para entrar, WSFEv1 para facturar). Es gratis.
- Todo pasa **en la base**, igual que Mercado Pago y Resend: funciones que llaman a ARCA con `_pedir_http`, una cola con reintentos por
  `pg_cron` y pruebas pgTAP con respuestas simuladas. La única pieza nueva es una **ruta chica de la misma app que firma**
  (`app/api/arca/firma`, en Vercel): el certificado de ARCA pide una firma digital que Postgres no sabe hacer.
- **La venta nunca se frena por ARCA.** Primero se registra la venta; después se pide la factura. Si ARCA no contesta, queda
  «factura en trámite» y se reintenta sola.
- Una factura con CAE **no se borra ni se corrige**: anular, devolver o cambiar genera una **nota de crédito**.
- Es un **módulo opcional por instalación** (apagado de fábrica): cada local carga su CUIT y su certificado. No cambia nada para quien no
  lo active (regla 18 y 23 de CLAUDE.md).

---

## 1. Decisiones (respondidas por el dueño el 2026-10-13)

| # | Tema | Decidido |
|---|---|---|
| 1 | Categoría de IVA | **Depende de cada local y de cada cliente**: se configura la de la empresa (por instalación) y la de cada cliente (sección 4) |
| 2 | ¿Facturar todas las ventas? | **Dos circuitos: CC1 (factura) y CC2 (comprobante interno)**; se elige qué ventas facturar (sección 9) |
| 3 | Punto de venta | **Configurable desde el sistema**: se crean en ARCA y el sistema trae los habilitados, se elige cuál usar y se puede tener varios (sección 4) |
| 4 | Recargo por cuotas | **Va con IVA**, como parte del precio |
| 5 | Descuento del efectivo y redondeo | **Se factura por el monto cobrado** |
| 6 | Envío cobrado al cliente | **Va en la factura**, como un renglón «Envío» (con la alícuota configurable, 21 % de fábrica) |
| 7 | Pedido web pagado por Mercado Pago | **Se factura al cobrar, pero es opcional**: el sistema ofrece facturarlo cuando se aprueba el pago; no siempre se factura (sección 8 bis) |
| 8 | Letras | **Cada factura con su letra** (A, B o C) según la categoría de la empresa y del cliente. Leyenda de transparencia fiscal (Ley 27.743) en todas. Solo para locales monotributistas: si la factura C muestra «IVA contenido $ 0» o solo la leyenda queda **configurable** (lo define el contador de cada local) |
| 9 | IVA de los artículos | **Configurable por artículo**, con una alícuota por defecto **de cada local** (y opcional por rubro) |
| 10 | Ventas anteriores | **Se pueden regularizar o dejar como están**: botón «Facturar» en cada venta sin factura y facturación en tanda desde la pantalla Facturas (sección 9) |
| 11 | Identificar al consumidor final | **El monto es un valor configurable** (`configuracion_fiscal.umbral_identificacion`, de fábrica el vigente: $ 10.000.000). Por debajo, la caja nunca pide DNI; por encima, lo pide porque si no ARCA rechaza la factura |
| 12 | Controlador fiscal | **Alcanza con factura electrónica por web service.** A futuro, poder configurar una **impresora fiscal** (sección 17) |
| 13 | Facturas de compra | **También en CC1 o CC2**: la factura del proveedor se carga como fiscal (con sus datos e IVA, para el libro de compras) o interna (sección 9 ter) |

---

## 2. Lo mínimo que hay que saber de ARCA

- **WSAA** (autenticación): con un **certificado digital** del CUIT se firma un pedido de acceso (TRA, un XML corto) y ARCA devuelve un
  **token y una firma** que valen **12 horas**. Mientras haya uno vigente, ARCA no da otro: hay que guardarlo.
- **WSFEv1** (factura electrónica): con el token se piden los CAE. Métodos que usamos:
  - `FECAESolicitar` — autoriza el comprobante y devuelve **CAE** y su vencimiento (o el rechazo con sus motivos).
  - `FECompUltimoAutorizado` — último número autorizado para un punto de venta y tipo (para numerar sin huecos).
  - `FECompConsultar` — consulta un comprobante ya enviado (para recuperarse si se cortó la conexión).
  - `FEDummy` (estado del servicio), `FEParamGetPtosVenta`, `FEParamGetCondicionIvaReceptor`, `FEParamGetTiposCbte`.
- **Ambientes:** *homologación* (pruebas, certificado de prueba) y *producción* (certificado real). Se prueba todo en homologación.
- **Direcciones** **(verificar)**: WSAA `https://wsaa.afip.gov.ar/ws/services/LoginCms` (pruebas: `wsaahomo.afip.gov.ar`); WSFEv1
  `https://servicios1.afip.gov.ar/wsfev1/service.asmx` (pruebas: `wswhomo.afip.gov.ar`). Son SOAP (XML).
- **Códigos** **(verificar)**: tipo de comprobante 1 Factura A · 3 NC A · 6 Factura B · 8 NC B · 11 Factura C · 13 NC C. Documento: 80 CUIT ·
  86 CUIL · 96 DNI · 99 consumidor final sin identificar. IVA: 3 = 0 % · 4 = 10,5 % · 5 = 21 % · 6 = 27 %. Concepto 1 = productos.
- **2026:** según notas de difusión, la RG 5866/2026 hace obligatorio el **CAE en el momento** (el CAEA queda solo para contingencias) **(verificar)**.

---

## 3. Arquitectura en este sistema

```
(Todas las flechas hacia ARCA pasan por la pasarela de la app: /api/arca/firma, acción «enviar».)
Caja (Next.js) ──registrar_venta()──▶ Postgres ── venta guardada (como hoy)
      │
      └─facturar_venta(id)─▶ Postgres: arma la factura (importes, IVA, letra, receptor) y la intenta enviar
                                │
                                ├─ _arca_acceso(): token vigente o uno nuevo ──▶ Ruta de firma de la app (Vercel: /api/arca/firma)
                                │                                                 firma el TRA con la clave privada y devuelve el CMS
                                │                     ──▶ WSAA (LoginCms) ─▶ token + firma (12 h), guardados en integraciones
                                │
                                └─ _arca_soap('FECAESolicitar') ──▶ WSFEv1 ─▶ CAE / rechazo
                                     (si no contesta: queda en cola; pg_cron reintenta cada minuto)
```

**Lo que aprendimos al construir la fase 1 (probado contra ARCA real el 2026-10-13):**
- **La base no puede conectarse con ARCA.** Sus servidores usan una seguridad vieja (claves Diffie-Hellman cortas) que la extensión http de Postgres
  rechaza («dh key too small» en producción, cortes en pruebas) y no deja aflojarla. Node sí, con un agente compatible: ARCA respondió «OK» en los dos
  ambientes. Por eso la ruta de la app es **firmador y pasarela**: lleva y trae los mensajes, solo a las direcciones de ARCA (`lib/arca/pasarela.ts`).
  La base sigue armando los mensajes y decidiendo todo.
- **La API corta los pedidos del panel a los 8 segundos** y lo cortado se deshace. ARCA tarda más a veces (el acceso en pruebas tardó más de 15 s).
  Las funciones que hablan con ARCA tienen su propio límite (`alter function … set statement_timeout`, que la API respeta) y las llamadas, más margen
  (`app.http_timeout_ms`). La prueba de conexión va en tres pasos separados: cada uno guarda lo suyo apenas termina.
- **ARCA no da un acceso nuevo mientras haya uno vigente** («ya posee un TA válido»): por eso no se renueva antes, y se guarda apenas llega.

**Por qué así:**
- La cuenta, la numeración y los reintentos viven en la base: se prueban con pgTAP reemplazando `_pedir_http` (como Mercado Pago y Resend)
  y nadie puede saltearlos desde la pantalla (regla 5).
- `_pedir_http` ya devuelve el cuerpo como texto cuando no es JSON (sirve para XML) y corta a los 15 s. El XML se arma con texto y se lee con
  `xpath()` de Postgres.
- **La firma CMS (PKCS#7) no se puede hacer en Postgres** (pgcrypto no firma con RSA; escribirla a mano en SQL sería criptografía casera: no).
  Por eso una **ruta de la misma app**, `app/api/arca/firma/route.ts` (Node, con una librería de firma CMS): un **firmador puro**, sin estado y
  sin secretos. Recibe la clave, el certificado y el TRA, firma y devuelve el TRA firmado; no tiene acceso a la base, no guarda nada y no registra el
  cuerpo de los pedidos. También genera el par de claves y el pedido de certificado (CSR) al configurar. La base la llama con `_pedir_http` a
  `integraciones.sitio_url`. **Se publica sola con cada versión de la app**: no hay pasos ni variables extra por cliente.
  - Como la ruta no sabe ningún secreto, atacarla no sirve: solo firma con la llave que le mandan.
  - El pase de 12 horas se renueva con 2 a 3 horas de margen: una caída corta de Vercel no frena facturas.
  - Alternativa descartada: una Edge Function de Supabase (mismo funcionamiento, pero hay que publicarla aparte en cada proyecto).
  - Descartado: cifrar la llave con una clave guardada en Vercel. La ruta descifraría para cualquiera que le mande la llave cifrada (por ejemplo,
    alguien con una copia de la base) y la protección no cumpliría lo que promete.
- **Secretos (regla 16):** la clave privada, el certificado y el token van en `integraciones` (sin lectura para nadie). La clave privada **nunca
  llega al navegador** y la app sigue sin usar la `service_role`.

---

## 4. Modelo de datos (una migración nueva, solo agrega)

### `integraciones` (secretos, sin lectura)
`arca_certificado`, `arca_certificado_vence`, `arca_token`, `arca_firma_token`, `arca_token_vence`.

### La llave privada: en el Vault de Supabase
La llave privada **no** va en una columna común: va en el **Vault** del proyecto (`vault.create_secret`), que la cifra con una clave que Supabase guarda
fuera de la base. Una copia o un volcado de la base trae la llave cifrada, inservible; solo la base en funcionamiento la descifra (en `_arca_acceso`, al
firmar). `integraciones` guarda solo el id del secreto (`arca_clave_vault_id`). **(verificar que el Vault siga disponible en los proyectos nuevos; si no,
la llave va a `integraciones` como las demás claves de la regla 16)**

### `configuracion_fiscal` (una fila; la lee el equipo, sin secretos)
| columna | qué |
|---|---|
| `activa` | facturación con ARCA prendida (falso de fábrica) |
| `ambiente` | `homologacion` / `produccion` |
| `cuit` | CUIT del local (el mismo de `datos_legales`) |
| `condicion_iva` | `monotributo` / `responsable_inscripto` |
| `alicuota_por_defecto` | la del local (21 % de fábrica): la toman los artículos nuevos y el envío |
| `pedidos_al_cobrar` | `no` / `ofrecer` / `siempre`: qué pasa cuando Mercado Pago aprueba un pedido (de fábrica `ofrecer`) |
| `umbral_identificacion` | desde qué total se pide DNI o CUIT al consumidor final (de fábrica, el de la norma vigente) |
| `iva_contenido_en_c` | solo monotributo: mostrar «IVA contenido $ 0» o solo la leyenda de transparencia fiscal |
| `ingresos_brutos`, `inicio_actividades` | van impresos en la factura |
| `modo` | `todas` (CC1 siempre) / `elegir` (el cajero elige CC1 o CC2; ver sección 9) |
| `serie_por_defecto` | `fiscal` / `interna` (cuando `modo = elegir`) |

### Empresas y sucursales (pedido del dueño, 2026-10-13)

Un local puede tener **varias sucursales**, y una sucursal puede ser **de otra razón social** (otro CUIT). Por eso los datos fiscales se separan en dos:

**`empresas`** — cada razón social que factura (hoy, una: la de `datos_legales`, que pasa a ser la empresa principal):
| columna | qué |
|---|---|
| `cuit`, `razon_social`, `condicion_iva`, `ingresos_brutos`, `inicio_actividades`, `domicilio_fiscal` | lo de la empresa |
| `ambiente` | pruebas o producción, **por empresa** |
| certificado y llave | **cada empresa tiene su propio certificado** (ARCA da uno por CUIT) y su llave en el Vault; su acceso de 12 horas también es suyo |

**`sucursales`** — cada local:
| columna | qué |
|---|---|
| `nombre`, `domicilio_comercial`, `telefono`, `email` | lo que va impreso en sus facturas |
| `empresa_id` | **de qué razón social es** (de qué CUIT salen sus facturas) |
| `deposito_id` | de dónde sale la mercadería que vende |
| `punto_venta_id` | su punto de venta de siempre (uno de los de su empresa) |
| `cuenta_caja_id` | su caja en el plan de cuentas |
| `activa`, `principal` | |

**Puntos de venta por sucursal:** cada punto de venta de ARCA es de una empresa (los trae su certificado) y se asigna a una sucursal. Una sucursal puede
tener varios (por ejemplo, uno por caja); cada persona del equipo usa el de su sucursal. Dos empresas pueden tener el mismo número de punto de venta
sin problema: la numeración va por empresa + punto de venta + tipo.

**Qué cambia en lo que ya está hecho (fase 1):** hoy hay una sola empresa con un certificado en `integraciones`. La migración de sucursales crea la
empresa principal con esos datos y mueve ahí el certificado, la llave y el acceso, sin pedir nada de nuevo. La pantalla de ARCA pasa a ser por empresa
(elegís la empresa y hacés los mismos cuatro pasos). La contabilidad sigue siendo una sola por instalación; si las razones sociales tienen que llevar
contabilidades separadas, es una decisión para el contador (se marcaría cada asiento con su empresa).

Cada persona del equipo tiene su **sucursal de trabajo** (`perfiles.sucursal_id`): la caja usa su depósito, su empresa, su punto de venta y su domicilio.
Hoy hay un solo local: la migración crea la empresa y la sucursal «Principal» con los datos actuales, así nada cambia hasta que se agregue otra.
Se administra en **Configuración → Empresas y sucursales**.

### `puntos_venta_fiscales` (los de ARCA que usa el sistema)
| columna | qué |
|---|---|
| `numero` | el punto de venta creado en ARCA (tipo web services) |
| `nombre` | «Local centro», «Caja 2», «Tienda online»… |
| `activo`, `por_defecto` | uno solo por defecto (índice único) |
| `verificado_en` | la última vez que `FEParamGetPtosVenta` confirmó que está habilitado |
| `emisor` | `web_service` (por ahora el único); preparado para `controlador_fiscal` (sección 17) |

Los puntos de venta **se crean en la página de ARCA** (no hay servicio para crearlos desde otro sistema). En Integraciones → ARCA, «Traer puntos de venta»
lista los habilitados para web services, se elige cuáles usar y cuál es el de siempre. Se puede fijar uno **por persona del equipo** (como la impresión) o por
canal (por ejemplo, la tienda online con el suyo). Cada punto de venta numera por separado (`arca_numeradores`).

### IVA de cada artículo (`productos.alicuota_iva`)

Campo **IVA** en la tabla de artículos: `numeric(4,2)` con `check` en 0 · 2,5 · 5 · 10,5 · 21 · 27, más «exento» y «no gravado» (columna
`condicion_iva_articulo`: `gravado` / `exento` / `no_gravado`, que ARCA informa distinto). Vacío = el del rubro (`categorias.alicuota_iva`) y si
tampoco, el del local (`configuracion_fiscal.alicuota_por_defecto`). Se carga en la ficha y en el alta del artículo, se cambia en tanda desde
Productos y se ve en la lista. Se copia al renglón de la venta (`venta_items.alicuota_iva`) al vender, como se copia el costo: si después se cambia,
las ventas viejas no se tocan. También lo usa la compra (renglones de mercadería) y el presupuesto.

### Categoría de IVA: de la empresa y de cada cliente

La letra de la factura sale de **dos datos**: la categoría de la empresa y la del cliente. Los dos se configuran antes de facturar.

**La empresa** — una sola fuente: `datos_legales.condicion_iva` (hoy es texto libre) pasa a ser un valor fijo con `check`:
`responsable_inscripto`, `monotributo`, `exento`. Se elige en **Integraciones → ARCA** (paso 1) y se ve también en Tienda online → Legales.
Sin categoría cargada no se puede activar ARCA.

**Cada cliente** — columnas para su facturación en `clientes`:
| columna | valores | de fábrica |
|---|---|---|
| `condicion_iva` | `consumidor_final`, `responsable_inscripto`, `monotributo`, `exento`, `no_alcanzado` | `consumidor_final` |
| `tipo_documento` | `DNI`, `CUIT`, `CUIL`, `pasaporte` | `DNI` |
| `documento` | (ya existe) el número | — |
| `razon_social` | la que va en la factura (si no, el nombre) | vacío |
| `domicilio_fiscal`, `localidad_fiscal`, `provincia` | para Factura A (hoy hay `direccion` y `localidad`: se proponen como valor inicial) | vacíos |
| `email_facturas` | a dónde mandarle la factura (si no, su email) | vacío |
| `factura_por_defecto` | `si` / `no`: si a este cliente siempre se le factura (CC1) | según la categoría |

Se cargan en la ficha del cliente (sección «Datos para facturar», plegada si es consumidor final) y desde la caja sin salir.

Reglas que controla la base (`check` y trigger, como en el resto del sistema):
- `responsable_inscripto`, `monotributo` y `exento` **exigen CUIT** (tipo `CUIT` y dígito verificador correcto).
- `consumidor_final` puede no tener documento (salvo que la compra pase el umbral de identificación).

**Qué letra sale** (la decide `facturar_venta`, nunca la pantalla):

| Empresa \ Cliente | Consumidor final | Monotributo | Responsable inscripto | Exento |
|---|---|---|---|---|
| **Responsable inscripto** | B | A **(verificar: desde 2021 al monotributista se le hace A)** | A | B |
| **Monotributo** | C | C | C | C |
| **Exento** | C | C | C | C |

**Dónde se carga el cliente:**
- En la ficha del cliente (Clientes): categoría, tipo y número de documento.
- **Desde la caja**, sin salir: al elegir «Factura» con un cliente que necesita A y le falta el CUIT, se abre un recuadro para cargarlo
  ahí mismo (es la «alta rápida de cliente» que quedó anotada para después).
- **Opcional, fase 4:** escribir el CUIT y traer razón social, domicilio y categoría desde el **padrón de ARCA** (servicio `ws_sr_padron_a13`,
  se habilita con el mismo certificado) **(verificar)**. Evita errores de tipeo, que son la causa más común de rechazo.

### `facturas` (una fila por documento fiscal: factura o nota de crédito)
| columna | qué |
|---|---|
| `id`, `clase` | `factura` / `nota_credito` |
| `letra`, `cbte_tipo` | A/B/C y su código de ARCA |
| `punto_venta`, `numero` | `numero` queda vacío hasta que ARCA lo autoriza; `numero_intentado` guarda el que se envió |
| `comprobante` | generado: `B 0003-00000123` |
| `venta_id` | la venta facturada (único para `clase = factura`) |
| `pedido_id` | si se facturó un pedido web **al cobrarlo** (antes de que sea venta); al entregarlo, la venta toma esta misma factura |
| `factura_id` | en una nota de crédito, la factura que corrige |
| `devolucion_id` | si la NC nació de una devolución o un cambio |
| `cliente_id`, `doc_tipo`, `doc_nro`, `condicion_iva_receptor` | el receptor como se informó |
| `fecha` | fecha del comprobante (la que va a ARCA) |
| `total`, `neto`, `iva`, `exento`, `detalle_iva` (jsonb por alícuota) | importes informados |
| `estado` | `pendiente` → `enviando` → `autorizada` / `rechazada` / `error` · `cancelada` |
| `cae`, `cae_vence`, `observaciones`, `ultimo_error`, `intentos`, `proximo_intento` | resultado y reintentos |
| `ambiente`, `creada_por`, `creada_en`, `autorizada_en` | |

Índices: único `(cbte_tipo, punto_venta, numero)` cuando hay número; único `venta_id` y único `pedido_id` para facturas (nunca dos facturas por lo mismo);
cada FK con su índice (regla 4).
Política: la ve quien ve la venta (`puede_ver_venta`); **sin políticas de escritura** (solo las funciones).

### `factura_envios` (bitácora de cada llamada a ARCA)
`factura_id`, `metodo`, `enviado` (XML sin token), `respuesta`, `status`, `ms`, `creado_en`. Se borra a los 180 días (pg_cron).

### `arca_numeradores`
`(punto_venta, cbte_tipo) → ultimo`. Se bloquea con `FOR UPDATE` mientras se pide un CAE: dos cajas nunca mandan el mismo número.

---

## 5. Funciones de la base

| función | qué hace | quién |
|---|---|---|
| `arca_generar_pedido_certificado()` | llama a la ruta de firma, guarda la clave privada en el Vault y devuelve el **CSR** para subir a ARCA | `equipo.administrar` |
| `arca_guardar_certificado(p_pem)` | guarda el certificado, controla que corresponda a la clave y anota su vencimiento | `equipo.administrar` |
| `arca_probar()` | `FEDummy` + `FEParamGetPtosVenta`: dice si hay conexión y si el punto de venta está habilitado | `equipo.administrar` |
| `arca_estado()` | qué falta, ambiente, vencimiento del certificado, pendientes y último error (sin secretos) | equipo |
| `facturar_venta(p_venta, p_serie default null)` | arma la factura (sección 6), la deja `pendiente` y la intenta enviar; devuelve el estado | `facturas.emitir` |
| `reintentar_factura(p_factura)` | reintento manual desde la pantalla | `facturas.emitir` |
| `_arca_acceso()` | token vigente o pide uno (TRA → firma → WSAA) | interna |
| `_arca_soap(p_metodo, p_cuerpo)` | arma el sobre SOAP con el token, llama y devuelve el XML | interna |
| `_factura_enviar(p_factura)` | numera, envía, recupera y guarda el resultado (sección 7) | interna |
| `_nota_credito(p_factura, p_monto, p_devolucion, p_motivo)` | crea la NC por todo o por una parte | interna |
| `_facturas_reintentar()` | pg_cron cada minuto: pendientes y errores con espera creciente | cron |
| `_arca_avisos()` | pg_cron diario: certificado que vence en 30 días, facturas trabadas > 1 hora | cron |
| `comprobante_de(...)` | suma los datos fiscales (letra, CAE, QR) cuando la venta tiene factura | (existe) |

**Ganchos en lo que ya existe** (sin cambiar sus parámetros):
- `anular_venta`: si la venta tiene factura **autorizada** → NC por el total; si estaba **pendiente** → se cancela (nunca llegó a ARCA).
- `registrar_devolucion`: NC por lo que se devuelve (el mismo importe que el saldo a favor).
- `registrar_cambio`: NC por lo que vuelve + factura nueva por lo que se lleva (la venta nueva).
- `cambiar_estado_pedido(…'entregado')`: la venta que nace se factura igual que una del mostrador.

---

## 6. Cómo se calculan los importes

1. **Total de la factura = lo cobrado**: `ventas.total` (con promos, descuento, recargo o descuento del medio de pago y redondeo) **más el envío**
   si se le cobró al cliente (renglón «Envío», con la alícuota del local). El recargo por cuotas va con IVA, como parte del precio.
2. Ese total se **reparte entre los renglones** en proporción a lo que vale cada uno después de su promoción (el mismo prorrateo que
   usa `v_hechos_ventas`), y se agrupa **por alícuota**.
3. Por cada alícuota `a`: `iva = round(total_grupo × a / (1 + a), 2)` y `neto = total_grupo − iva`. Así `neto + iva` da justo el total.
   ARCA controla que el IVA sea `neto × a` con una tolerancia de centavos **(verificar el margen en homologación)**.
4. **Factura C** (monotributo): sin IVA discriminado: `neto = total`, `iva = 0`, sin detalle de alícuotas.
5. **Letra y receptor:**
   - Monotributo → C siempre.
   - Responsable inscripto y cliente `responsable_inscripto` con CUIT → **A** (`doc_tipo` 80).
   - Responsable inscripto y el resto → **B**: sin identificar (99 / 0) salvo que el total pase el umbral (sección 1, punto 11) o el cliente
     tenga documento cargado.
   - `CondicionIVAReceptorId` va siempre (obligatorio para ARCA desde 2025) **(verificar)**.
6. Fecha = hoy (Argentina). ARCA acepta para productos unos días hacia atrás **(verificar el límite)**: si una factura queda trabada más
   que eso, pasa a `error` y se avisa.

**Ejemplo (responsable inscripto, Factura B):** camisa $ 45.000 + jean 2 × $ 38.000 con 2da al 50 %, pago en efectivo −10 %, redondeo $ 50.
Total cobrado $ 108.450 → todo 21 % → IVA = round(108.450 × 0,21 / 1,21) = $ 18.821,90 · neto $ 89.628,10. La factura muestra el total y
«IVA contenido $ 18.821,90» (transparencia fiscal).

---

## 7. Numeración, envío y recuperación

```
pendiente ──(_factura_enviar)──▶ enviando ──▶ autorizada (CAE)
    ▲                                 │ └──▶ rechazada (ARCA dijo que no: se corrige el dato y se reintenta)
    └────── error (no contestó) ◀─────┘        cancelada (venta anulada antes de autorizarse)
```

1. Bloquea `arca_numeradores (punto_venta, cbte_tipo)`.
2. **Si la factura ya tenía `numero_intentado`** (un intento anterior se cortó): `FECompConsultar` de ese número.
   - Existe y coincide total y documento → **era nuestra**: se guarda su CAE. Nunca se pide dos veces.
   - Existe y no coincide → alguien más usó ese número (otro sistema en el mismo punto de venta) → `error` y aviso. No se reintenta solo.
   - No existe → se reenvía con el mismo número.
3. Si no: número = `ultimo + 1` y `FECAESolicitar`.
4. Si ARCA responde que el número no es el próximo **(verificar código de error)**: `FECompUltimoAutorizado`, se resincroniza y se reintenta una vez.
5. Guarda resultado, bitácora y libera el bloqueo. Dos cajas a la vez esperan su turno (unos segundos); la venta ya está guardada.

Reintentos de `pg_cron`: 1, 2, 5, 10, 30 minutos y después cada hora. Las **notas de crédito esperan** a que su factura esté autorizada.

---

## 8. Notas de crédito

| Situación | Hoy | Con ARCA |
|---|---|---|
| Anular una venta del día | se anula y vuelve el stock | igual, **más NC por el total** (si la factura se autorizó) |
| Anular con factura pendiente | — | la factura se cancela sin ir a ARCA |
| Devolución (saldo a favor) | comprobante DEV + saldo | igual, **más NC por el importe devuelto** |
| Cambio | devolución + venta nueva | **NC** por lo que vuelve + **factura** de la venta nueva |
| Pedido web cancelado | libera la reserva | sin factura todavía: nada que hacer |

La NC va con la **misma letra** que la factura y la referencia a ella (`CbtesAsoc`). La regla de «anular solo el mismo día» queda igual
(es una regla del local); la NC se puede emitir cualquier día.

### 8 bis. Pedidos web pagados por Mercado Pago

Se factura **al cobrar, pero es opcional** (`configuracion_fiscal.pedidos_al_cobrar`):
- `ofrecer` (de fábrica): cuando Mercado Pago aprueba el pago, el pedido muestra **«Facturar»** en el panel (y aparece en la lista «Pedidos cobrados sin
  factura»). Si no se factura, sigue como CC2.
- `siempre`: se factura solo al aprobarse el pago (`mp_notificacion` encola la factura).
- `no`: no se ofrece; se puede facturar la venta cuando se entrega.

La factura de un pedido incluye los productos al precio prometido y el envío. **Al entregar**, la venta que nace queda unida a esa factura: no se factura
dos veces. **Si el pedido pagado se cancela** (y Mercado Pago reembolsa, como hoy), se emite la **NC** de esa factura.

---

## 9. Dos circuitos: CC1 (fiscal) y CC2 (interno)

Pedido del dueño: poder elegir si una venta va con **factura de ARCA (CC1)** o con **comprobante interno no fiscal (CC2)**.

**Cómo funciona:**
- `configuracion_fiscal.modo = elegir` y una serie por defecto. En la caja, un selector simple: **«Factura» / «Comprobante interno»**.
- CC1 → factura con CAE. CC2 → el comprobante interno de hoy («No válido como factura»), con su propia numeración.
- **Una venta CC2 se puede facturar después** (botón «Facturar» en la venta; por ejemplo, si el cliente vuelve y pide factura). Mientras esté
  dentro del plazo que acepte ARCA, con fecha de hoy.
- Se puede fijar por persona del equipo o por medio de pago (por ejemplo, tarjeta → siempre CC1), si el contador lo pide.
- **Regularizar ventas anteriores** (de antes de activar ARCA o hechas en CC2): en **Facturas → «Ventas sin factura»** se eligen (por fecha, por medio
  de pago o una por una) y se facturan **en tanda**. Cada una sale como factura propia **con fecha del día en que se emite** (ARCA no acepta fechas
  viejas para productos) **(verificar el límite)**. Dejarlas como están también es válido: siguen como comprobante interno.

**Lo que este sistema NO va a hacer** (por obligación legal y para cuidarte):
- Todas las ventas, CC1 y CC2, **cuentan en informes, stock, caja y resultado**. No hay ventas ocultas, ni pantallas para unos usuarios y no para
  otros, ni borrado de ventas internas.
- Informe **«Ventas sin factura»** con totales por día, para que el contador lo vea y decida.
- En Argentina la regla general es emitir comprobante fiscal por cada venta; el CC2 sirve para lo que no corresponde facturar o se factura
  después. **El contador define cuándo se usa.**

### 9 ter. Facturas de compra en CC1 o CC2

Al cargar una compra (`/admin/compras/nueva`) se elige **«Factura del proveedor» (CC1)** o **«Compra interna» (CC2)**, como en la venta.

- **Las compras no se mandan a ARCA:** la factura ya la emitió el proveedor. Se cargan bien para que el contador arme el **libro de IVA compras** y,
  si el local es responsable inscripto, compute el **crédito fiscal**.
- **CC1** pide los datos del comprobante del proveedor: letra (A, B, C), punto de venta y número, fecha, CAE (opcional), y los importes: **neto por
  alícuota, IVA, percepciones** (IVA, Ingresos Brutos) y otros impuestos. Controla que sumen el total de la factura (como hoy se controla contra el total).
- **CC2**: como hoy, sin datos fiscales (remito, compra sin factura).
- **Proveedores** suman `cuit` y `categoria_iva` (hoy tienen `documento`); el CUIT con dígito verificador.
- **El costo de la mercadería depende de la categoría del local** (esto toca `registrar_compra` y los márgenes):
  - Responsable inscripto con factura A: el costo es el **neto** (el IVA no es costo, es crédito fiscal).
  - Monotributo, o factura B/C: el costo es el **total** (el IVA no se recupera).
  - Hoy el sistema carga un solo costo por modelo; con CC1 se propone el neto o el total según la regla, y el cajero puede corregirlo.
- `compras` suma: `circuito` (`fiscal`/`interno`), `letra`, `punto_venta_proveedor`, `numero_proveedor`, `cae_proveedor`, `neto`, `iva`, `percepciones`,
  `otros_impuestos`, `detalle_iva` (jsonb). El `comprobante_proveedor` de hoy se reemplaza por punto de venta + número (con migración de los datos).
- **Duplicados:** no se puede cargar dos veces la misma factura del mismo proveedor (letra + punto de venta + número + CUIT).
- **Opcional, más adelante:** verificar el CAE de la factura del proveedor con el servicio de constatación de ARCA (`WSCDC`) **(verificar)**.
- Pantallas: Compras → **«Libro de IVA compras»** (por mes, exportable a CSV), junto al de ventas en Facturas. Igual que en ventas, **todas las compras
  cuentan** en stock, costos e informes, sean CC1 o CC2.

---

## 10. Qué lleva una factura (impresa y digital)

Se agrega al comprobante actual (`components/Comprobante.tsx`) un formato «fiscal» cuando la venta tiene factura autorizada:

- Recuadro con la **letra** (A/B/C) y «Cód. 006» (el código del tipo).
- Emisor: razón social, domicilio comercial, CUIT, Ingresos Brutos, inicio de actividades, condición frente al IVA.
- Punto de venta y número, fecha.
- Receptor: «A CONSUMIDOR FINAL» o nombre, documento y condición frente al IVA.
- Detalle: en **A**, precios netos y el IVA por alícuota; en **B/C**, precios finales.
- **«Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)»** e «IVA contenido» en B (y lo que diga el contador para C).
- **CAE y vencimiento** del CAE.
- **QR de ARCA**: link `https://www.afip.gob.ar/fe/qr/?p=` + JSON en base64 con fecha, CUIT, punto de venta, tipo, número, importe, moneda,
  documento del receptor, tipo de código («E») y CAE **(verificar dirección y versión vigentes)**. Va en lugar del QR al link digital (que puede
  quedar abajo, más chico).
- Mientras está pendiente: el comprobante interno con «**Factura en trámite**»; al autorizarse, el link digital ya muestra la factura.
- Las notas de crédito salen con el mismo formato, con la referencia a la factura.

---

## 11. Pantallas

1. **Integraciones → ARCA** (`/admin/integraciones/arca`, `equipo.administrar`), con manual paso a paso (`docs/integraciones/arca.md`):
   1. Datos fiscales (CUIT, categoría de IVA, Ingresos Brutos, inicio de actividades, alícuota por defecto del local).
   2. **Generar pedido de certificado** → descarga el CSR. Instrucciones para subirlo en ARCA («Administración de certificados digitales»),
      asociarlo al servicio de factura electrónica («Administrador de relaciones de clave fiscal») y crear el punto de venta.
   3. Pegar el certificado que da ARCA.
   4. **Puntos de venta:** «Traer los de ARCA», elegir cuáles usar, ponerles nombre y cuál es el de siempre (y, si hace falta, uno por persona o canal).
   5. **Probar** (homologación): conexión y punto de venta. Emitir una factura de prueba.
   6. **Pasar a producción** (otro certificado, el real) y **activar**. Elegir también qué pasa con los pedidos cobrados por Mercado Pago (sección 8 bis).
   - Estado siempre visible: ambiente, certificado (vence el…), pendientes, último error.
2. **Caja:** si está activa, en el paso 3: «Factura B» / «Comprobante interno» (si el modo es elegir). Con cliente responsable inscripto
   ofrece **Factura A** y pide su CUIT si falta. Después de cobrar: «Factura B 0003-00000045 · CAE …» o «Factura en trámite: se reintenta sola».
3. **Detalle de la venta:** factura y notas de crédito, con su estado; botones «Facturar» (si es CC2) y «Reintentar» (si quedó en error).
4. **Facturas** (`/admin/facturas`): lista por fecha, letra, punto de venta y estado; filtros de pendientes y errores; **«Ventas sin factura»** para
   regularizar en tanda; exportación CSV (libro IVA ventas) para el contador.
5. **Pedidos:** botón «Facturar» en los cobrados por Mercado Pago (si el modo es `ofrecer`) y su factura a la vista.
6. **Productos:** campo «IVA» en la ficha (vacío = el del rubro o el del local) y cambio en tanda desde la lista. **Rubros** (Tablas): alícuota opcional.
   **Clientes:** categoría de IVA, tipo y número de documento.
7. **Informes:** facturado vs. interno; IVA del período.

---

## 12. Permisos y seguridad

- Permisos nuevos: `facturas.emitir` (Vendedor sí: factura al vender) y `facturas.ver`. Configurar ARCA: `equipo.administrar`.
- Certificado y token: en `integraciones`, nadie los lee (regla 16). La llave privada, en el **Vault** de Supabase (cifrada fuera de la base).
  La ruta de firma no sabe secretos, no guarda nada, no registra el cuerpo de los pedidos y rechaza pedidos grandes.
- La bitácora no guarda el token ni la firma.
- `facturas` sin políticas de escritura: todo por las funciones.
- El certificado de ARCA es por CUIT: cada instalación tiene el suyo (encaja con «una instalación por cliente»).

---

## 13. Pruebas

- **pgTAP** con `_pedir_http` reemplazado (respuestas de WSAA y WSFEv1 preparadas): token vigente y vencido; factura B, C y A; rechazo;
  corte de conexión y recuperación con `FECompConsultar`; número desfasado y resincronización; dos facturas a la vez; NC por anulación,
  devolución y cambio; CC2 y facturar después; permisos; importes (que `neto + iva = total` y cuadre con `ventas.total` en ventas con promo,
  descuento, cuotas y redondeo).
- **Unitarias** (`lib/arca.test.ts`): armado del QR y del texto de la factura.
- **Homologación real** con un certificado de prueba: lista de chequeo (B, C, A, NC, corte de red simulado) antes de producción.
- **PDF real** del ticket fiscal (80/58/A4) y lectura del QR con un celular.

---

## 14. Puesta en marcha por instalación

- La ruta de firma viaja con la app: **no hay ningún paso extra por cliente**. Antes de activar ARCA, confirmar que `integraciones.sitio_url` del
  cliente apunte a su sitio (el alta lo carga; en el piloto, revisarlo).
- Cada dueño hace la sección 11.1 con su contador. Hasta que active ARCA, todo sigue como hoy.
- Orden: piloto (`mi-calzado`) en homologación → piloto en producción con el contador → clientes.

### Nosotros administramos los Supabase de todos los clientes

Los proyectos de cada cliente están en **nuestra organización de Supabase** (así los crea `instalaciones alta`). Para ARCA eso significa:
- **El cliente no toca nada técnico:** la ruta de firma viene con la app; el dueño solo hace los pasos de ARCA desde el panel.
- **Somos custodios de las llaves fiscales.** «Nadie la lee» protege la llave de los usuarios del panel, no de quien administra Supabase: desde nuestra
  cuenta se podría abrir la base de cualquier cliente. Por eso: verificación en dos pasos obligatoria en la cuenta de Supabase, la menor cantidad posible
  de personas con acceso, y dejar escrito en el acuerdo con cada cliente que guardamos su certificado y que **él lo puede dar de baja en ARCA cuando quiera**.
- **Menos exposición en copias:** la llave va en el Vault de Supabase: un volcado o una copia de la base, por sí solos, no alcanzan para usarla.
  Quien administra la base en funcionamiento sí podría llegar a ella: por eso la verificación en dos pasos y el acuerdo con el cliente.
- **Vigilancia de todos desde un lugar:** `npm run instalaciones -- estado` suma, por cliente, el estado de ARCA (certificado que vence, facturas
  trabadas, último error), sin mostrar secretos. Así nos enteramos antes que el cliente.
- **Costos:** ver `docs/INSTALACIONES.md` (con clientes reales hacen falta los planes Pro de Supabase y Vercel; la ruta de firma no suma costo).

---

## 15. Fases (cada una se prueba y se publica por separado)

| Fase | Qué | Tamaño |
|---|---|---|
| 0 | Respuestas del contador (sección 1) | — |
| 1 | Datos fiscales, certificado, ruta de firma, conexión y prueba en homologación | mediano |
| 2 | Factura B/C de una venta: importes, numeración, cola, reintentos, comprobante con CAE y QR | grande |
| 3 | Notas de crédito (anulación, devolución, cambio) y Factura A con clientes inscriptos | mediano |
| 4 | CC1/CC2 en ventas y **compras** (libro de IVA compras), facturar después y regularizar en tanda, pedidos de Mercado Pago, puntos de venta por persona o canal, pantalla Facturas, exportación, avisos, informes | mediano |
| 5 | Producción en el piloto con el contador; después, clientes | chico |

En total, **dos o tres veces lo que llevó la tanda de comprobantes y caja**.

---

## 16. Riesgos y qué hacer

| Riesgo | Qué hace el sistema |
|---|---|
| ARCA caído o lento | La venta se guarda; la factura queda en cola y se reintenta. Aviso si pasa más de una hora |
| Corte justo después de enviar | `FECompConsultar` antes de reintentar: nunca dos CAE para la misma venta |
| Otro sistema usa el mismo punto de venta | Se detecta (número ocupado que no coincide) y se avisa. Por eso un punto de venta exclusivo |
| Vence el certificado (dura unos 2 años) | Aviso 30 días antes en el panel; se renueva con el mismo paso 11.1 |
| Cambian las reglas de ARCA | El armado está en una sola función (`facturar_venta`) y en un componente: se ajusta en un lugar |
| Una factura rechazada | Queda con el motivo de ARCA en castellano; se corrige el dato (por ejemplo, el CUIT del cliente) y se reintenta |

---

## 17. Fuera de alcance (por ahora)

- CAEA (lotes por período): solo para contingencias; se evalúa si hace falta.
- Factura E (exportación), Factura M, percepciones de Ingresos Brutos (`ImpTrib`), otras monedas.
- **Controlador fiscal (impresora fiscal) — previsto para más adelante.** Se deja preparado desde el principio:
  - `facturar_venta` decide **qué** se factura (letra, receptor, importes, IVA); **cómo** se emite queda en un «emisor» intercambiable:
    `web_service` (ahora) o `controlador_fiscal` (después), elegido **por punto de venta** en `puntos_venta_fiscales.emisor`.
  - Una impresora fiscal se conecta a la compu de la caja, y una página web no puede hablarle directo. Hará falta un **programa chico instalado en esa
    compu** (un «agente») que reciba la factura del sistema y la mande a la impresora con el protocolo de su marca (Hasar, Epson…), y devuelva el número
    fiscal. El resto (CC1/CC2, notas de crédito, informes) es igual.
- Libro IVA digital automático (se exporta el CSV para el contador).
