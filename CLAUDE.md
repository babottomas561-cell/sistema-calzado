# Sistema de calzado — leer antes de tocar nada

Sistema de gestión + tienda online para un local de **ropa masculina** (más que nada de hombre, con
calzado y accesorios). Lo usa el dueño desde el celular. Los ejemplos, la demo y los textos por defecto
piensan en ropa de hombre. Hay dos caras sobre la misma base:

- **Tienda** (`/`): catálogo público, registro, carrito, pedidos y seguimiento del pedido.
- **Panel** (`/admin`, solo equipo): vender, compras, stock, pedidos, clientes (CRM),
  seguimientos, proveedores y tablas maestras.

**Stack**: Next.js 16 (App Router) · React 19 · Tailwind 4 · Supabase (Postgres + Auth) ·
se publica en Vercel. Todo el código, los comentarios y los textos están **en castellano** —
mantenerlo.

El modelo de datos completo está en [docs/MODELO.md](docs/MODELO.md). La base entera está en
**una migración**: [`supabase/migrations/20261011000000_inicial.sql`](supabase/migrations/20261011000000_inicial.sql).

---

## ⚠️ Next.js 16 no es el que conocés

Ver el bloque de [AGENTS.md](AGENTS.md): **leer `node_modules/next/dist/docs/` antes de usar
una API de Next.** Lo que ya pisamos:

| cosa | en esta versión |
|---|---|
| middleware | se llama **`proxy.ts`** y exporta `proxy` (no `middleware.ts`) |
| `params` / `searchParams` | son **Promises**: `const { id } = await params` |
| `cookies()` | es async: `await cookies()` |
| `cacheComponents` | **apagado** en `next.config.ts` (modelo dinámico clásico; todas las páginas leen la sesión) |
| formularios | Server Actions + `useActionState` (React 19). La acción devuelve `{ error?, ok? }` o hace `redirect` |

---

## Reglas que no se rompen

1. **El stock nunca se toca con un `UPDATE`/`INSERT` suelto.** Solo por las funciones de la
   base, que dejan el movimiento en `movimientos_stock` y validan todo dentro de una transacción:

   | función | qué hace |
   |---|---|
   | `registrar_venta(p_items, p_pagos, p_cliente, p_descuento, p_canal, p_deposito, p_notas)` | venta de mostrador: descuenta stock, numera el comprobante, registra los pagos con su descuento/recargo |
   | `registrar_compra(p_items, p_proveedor, p_notas, p_actualizar_costo, p_deposito, p_comprobante_proveedor, p_fecha_comprobante)` | factura de compra: suma stock y (si `p_actualizar_costo`) actualiza el precio de compra del artículo **y el de ese proveedor** |
   | `ajustar_stock(p_variante, p_stock_nuevo, p_motivo, p_deposito)` | inventario, rotura, pérdida (con motivo obligatorio) |
   | `crear_pedido(p_items, p_entrega, p_direccion, p_medio_pago, p_notas, p_cliente, p_canal)` | pedido web: **reserva** stock; el precio y el % del medio de pago los pone la base, no el navegador |
   | `cambiar_estado_pedido(p_pedido, p_estado, p_comentario, p_pagos, p_motivo)` | `entregado` → se convierte en venta (respeta el % prometido); `cancelado` (motivo obligatorio) → libera la reserva |
   | `anular_venta(p_venta, p_motivo, p_comentario)` | solo el mismo día y con `ventas.anular`: vuelve el stock (movimiento `anulacion`), la venta queda anulada y deja de contar; su pedido vuelve a estar listo (o se cancela si el cliente se arrepintió) y su presupuesto, vigente. Las pantallas y vistas que suman ventas filtran `anulada_en is null` |
   | `mover_a_fallados(p_variante, p_cantidad, p_motivo)` · `resolver_fallado(p_fallado, p_salida, p_cantidad, p_proveedor, p_nota)` | aparta lo roto en «Fallados» (no se vende) y lo resuelve: `arreglado` (vuelve), `proveedor` (crédito a su costo) o `baja` (pérdida). Permiso `stock.ajustar` |
   | `aplicar_credito_proveedor(p_compra, p_monto)` · `ajustar_credito_proveedor(p_proveedor, p_monto, p_nota)` | el **crédito con el proveedor** (`creditos_proveedor`, saldo en `v_credito_proveedores`): nace al devolverle un fallado (a su costo), se descuenta de una factura **suya** (`compras.credito_aplicado`; el costo de lo que llega no cambia) y se ajusta a mano con nota (nota de crédito, no lo reconoció). Nunca queda negativo. Lo ve y lo usa quien carga compras o ve costos; el ajuste, `proveedores.gestionar` + `costos.ver` |
   | `registrar_devolucion(p_venta, p_items, p_motivo, p_comentario, p_cliente)` · `cotizar_devolucion(p_venta, p_items)` | deja **saldo a favor** (nunca efectivo): lo pagado de verdad (promo recalculada con las de esa venta, descuentos sí, recargo de cuotas no), en `dias_cambio`; lo bueno vuelve al Local y lo fallado a Fallados. El saldo (`saldos_cliente`) se usa con el medio «Saldo a favor» (un trigger lo consume) y vence a los `dias_saldo` |
   | `registrar_cambio(p_venta, p_devuelve, p_lleva, p_pagos, p_motivo, p_comentario, p_cliente)` · `cotizar_cambio(…, p_medio)` | devolución + venta nueva en UNA operación: lo del mismo artículo (otro talle/color) vale lo que trae aunque haya subido; lo demás, precio y promos de hoy; se paga con el saldo y la diferencia con otro medio (o queda saldo) |
   | `ventas_para_cambio(p_buscar)` · `venta_para_cambio(p_venta)` | buscar (ticket, cliente, teléfono) y leer una venta para un cambio o devolución **aunque la haya hecho otro vendedor**, sin abrirle las ventas ajenas (sin montos ni costos) |
   | `cancelar_mi_pedido(p_pedido, p_motivo, p_comentario)` | el cliente cancela el suyo mientras esté pendiente o confirmado. Los *listo para retirar* vencen solos a los `dias_retiro` (pg_cron, `vencer_pedidos_sin_retirar()`) |

   Se llaman con `supabase.rpc("registrar_venta", { p_items: [...], ... })`. Los parámetros
   llevan prefijo `p_`.

2. **`disponible = cantidad − reservado`.** Para vender o mostrar en la tienda se usa
   `disponible`, no `cantidad`. Lo calculan las vistas `v_stock` y `v_catalogo`, **solo con los depósitos que
   venden** (`depositos.vendible`). «Fallados» no vende: un trigger frena ventas, compras, ajustes y reservas ahí;
   lo fallado se ve en `v_fallados` y se mueve con `mover_a_fallados()` / `resolver_fallado()`.

3. **Nunca escribir un `id` a mano.** Todos los `id` son `generated always as identity`.
   Lo que ve la gente es el **`codigo`**, y si viene vacío lo genera la base:

   | qué | ejemplo | quién lo genera |
   |---|---|---|
   | marca / rubro / color | `NIK`, `ZAP`, `NEG` (choque → `NI2`) | `_codigo_corto()` |
   | subrubro | `ZAP-RUN` | prefijo del rubro |
   | artículo (modelo) | `ZAP-0007` | rubro + `seq_articulo` |
   | SKU (variante) | `ZAP-0007-42-NEG` | artículo + talle + color |
   | cliente / proveedor | `1001`, `1002`… | secuencia propia |
   | comprobante | `0001-00000123` | tabla `numeradores` con `FOR UPDATE` (dos ventas a la vez nunca repiten número) |

4. **Las claves siguen una convención**: PK `id`; FK `<tabla_en_singular>_id`, **siempre con
   índice**. Al borrar: lo que tiene historia es `on delete restrict` (artículos, talles,
   colores, clientes, comprobantes) y **se desactiva** en vez de borrarse; solo es `cascade`
   lo que es parte de otra fila (renglones de una venta, el stock de una variante, las notas
   de un cliente). Si agregás una FK, decidí la política a propósito y ponele índice.

5. **Seguridad en la base, no en la pantalla.** Row Level Security en todas las tablas:
   - el equipo (el dueño y su familia: `perfiles.rol = 'staff'` + un **rol** en `perfiles.rol_id`) hace **lo que su rol permite**.
     El **Vendedor** vende, hace cambios y devoluciones en plazo, atiende pedidos y clientes y ve el stock; NO ve costos,
     informes, reposición ni lo que venden los demás, NO cambia precios ni anula, descuento hasta 10 %:
     `tiene_permiso('ventas.registrar')`, `tiene_permiso('costos.ver')`… Los permisos son una lista fija
     (tabla `permisos`); los **roles** (Administrador, Encargado, Vendedor; Depósito desactivado) son editables en
     `/admin/equipo`. `es_staff()` = es del equipo con un rol activo (para lo que ve cualquiera del equipo);
   - **los costos** (`productos.precio_compra`, `venta_items.costo_unitario`, compras, precios de
     proveedores) solo con `costos.ver`; el resto del equipo lee `v_stock` / `v_venta_items` /
     `v_hechos_ventas`, que devuelven el costo **vacío**. Una vista nueva con costos hace lo mismo;
   - **la operación** (ventas, compras, stock, pedidos) se escribe **solo** por las funciones de la regla 1,
     que son `security definer` y verifican el permiso; esas tablas no tienen políticas de escritura;
   - un cliente registrado ve **sus** pedidos y **su** ficha (los renglones por `v_mis_pedido_items`: no lee el catálogo interno), pero la ficha **no** por la tabla `clientes`
     (tiene notas internas del CRM): la lee por `v_mi_ficha` y la cambia con `actualizar_mi_ficha()`;
     su cuenta se vincula a una ficha del local recién cuando **confirma el email**;
   - el público (anon) solo lee `v_catalogo`, que **no tiene costos**.
   Una tabla nueva **nace con RLS activado y una política** (ver la skill `cambiar-base-de-datos`).
   Esconder un botón no es seguridad.

6. **Desplegables, no texto libre**, para todo lo que es una tabla: marca, rubro, subrubro,
   talle, color. Si no, aparece «Nike» y «nike» como dos marcas y el stock se parte en dos SKUs.
   (Igual la base lo frena: índices únicos sobre `lower(nombre)`.) Las altas van en `/admin/tablas`.

7. **Lo que no tiene stock no se ofrece para vender.** En la tienda (`ElegirVariante`) y en el
   punto de venta (`SelectorVariantes` con `soloConStock`) un talle sin `disponible` no aparece,
   y un color sin ningún talle tampoco. En **compras** sí se ve todo (es para reponer).

8. **Precios y costos los decide la base** en los pedidos web (`precio_de(variante)`): nunca
   confiar en un precio que mandó el navegador.

9. **Precio de compra y precio de venta.** `productos.precio_compra` es el de referencia (el último
   que se pagó, se usa para el margen) y `precio_venta` el de lista. **Cada proveedor tiene el suyo**
   en `producto_proveedores` (precio de lista − bonificación % = `precio_compra`, columna generada;
   uno solo `principal` por artículo, lo garantiza un trigger). Al cargar una factura se propone el
   precio de ese proveedor y `registrar_compra` lo actualiza (respetando su bonificación).

10. **Medios de pago con descuento o recargo** (`medios_pago.ajuste_pct`: −10 = 10 % off, +15 = recargo).
    Cada pago cubre una parte del precio (`base`) y guarda **una copia** del % (`ajuste_pct`) y el
    `ajuste` en pesos; `monto = base + ajuste` es lo que entra a caja. En `ventas`:
    `total = subtotal − descuento + ajuste_medio_pago` (lo valida un `check`). En `p_pagos`, un pago
    sin `base` cubre lo que falta: va **último**. Cambiar el % de un medio no toca ventas viejas.
    `en_mostrador` / `en_tienda` dicen dónde se ofrece; la tienda solo ve los `en_tienda` (RLS).

11. **Íconos: `lucide-react`, nunca emojis** (menú, botones, estados). Trazo 1.8 normal / 2.2 activo,
    tamaño 15-18. El logo es `components/Logo.tsx` y el "volver" es `components/Volver.tsx`.

12. **Fotos: varias por producto, una principal.** Están en `producto_imagenes` (orden + `principal`, una sola
    por producto, la garantiza un índice único). `productos.imagen_url` **la mantiene la base** (trigger): es
    siempre la url de la principal, así que **no se escribe desde la app**. Los archivos van al bucket
    `productos` de Storage (lectura pública, escritura con `productos.editar`); el navegador los achica y los sube
    (`lib/supabase/navegador.ts`), y el Server Action solo registra la fila. La tienda lee `v_imagenes_tienda`.


13. **Escalas de talles.** Cada artículo es de una escala (`productos.escala`: Adulto, Niños, Bebé de calzado;
    Ropa letras XS-XXXL, Ropa números 36-52 y Único) y solo acepta talles de esa escala (`talles.tipo`); lo
    frena un trigger. El mismo número puede existir en dos escalas (el 34 de niños y el de adulto, el 38 de
    calzado y el de jeans son talles distintos): para buscar uno, `buscar_talle(nombre, escala)`. Los informes
    agrupan «por talle» con la escala (`lib/escalas.ts`, `rotuloTalle`) para no mezclarlos.
14. **Línea del rubro.** Cada rubro es de una línea (`categorias.linea`: Calzado, Ropa, Accesorios): separa los
    totales en informes y stock (`v_hechos_ventas`, `v_stock`, `v_catalogo` traen `linea`). La ropa
    suma `productos.temporada` y `productos.material` (opcionales). Nada de «calzado» escrito a mano en las pantallas.
15. **La portada la arma el dueño.** La landing (`/`) son las `inicio_secciones` que se editan en
    `/admin/tienda` (permiso `tienda.editar`); los datos de la tienda (nombre, avisos que rotan, Instagram, WhatsApp, local, días de retiro)
    están en `configuracion_tienda`, en la misma pantalla. Un tipo de sección nuevo se suma en el `check` de la
    tabla, en `lib/inicio.ts` (tipo, `INFO_TIPO`, `leerContenido`, `NUEVA`), en `app/(tienda)/inicio/Secciones.tsx`
    y en el editor. Si la portada es una campaña (`estilo: foto`), la cabecera flota transparente encima
    (`app/(tienda)/marco/Cabecera.tsx`). Tipografía: Bricolage (titulares) + Instrument Serif (`.serif`, frases). El movimiento es **CSS** (bloque «PORTADA» de `globals.css`), siempre dentro de
    `prefers-reduced-motion: no-preference` y sin esconder contenido si el navegador no lo soporta.
16. **Claves de servicios externos (WhatsApp de Meta, Gemini): en la base, nunca legibles.** Se cargan en
    `/admin/integraciones` y van a `integraciones`, una tabla **sin lectura para nadie**
    (`guardar_integraciones()` escribe; `estado_integraciones()` solo dice si están, con los últimos 4).
    **Nunca** en `configuracion_tienda` (la lee el público) **ni en variables de Vercel**. Lo que manda el local
    sale **desde la base** con `pg_net` (`_wa_enviar`: avisos de pedidos por trigger, mensaje de prueba); el webhook
    `app/api/whatsapp` le pasa el cuerpo crudo y la firma a `wa_recibir()`, que la verifica (HMAC con el secreto
    de la app) y recién ahí devuelve los mensajes; `wa_responder()` solo le contesta a quien escribió en ese aviso.
    Lo que cobra Meta se suma solo a `gastos` (`whatsapp_cobros`, una vez por mensaje). El bot, los avisos, la plantilla y
    el **modelo de Gemini** (`configuracion_tienda.ia_modelo`) se eligen en la misma pantalla; «Probar Gemini» (`ia_probar()`)
    consulta desde la base. Cada respuesta del bot registra sus tokens (`ia_registrar_uso()`, solo con el aviso firmado) y,
    los modelos y sus precios oficiales están en `ia_modelos` (con fecha de verificación y límite gratis por día,
    que se copia de AI Studio). Con `configuracion_tienda.ia_plan = 'pago'` suma a Gastos → Inteligencia artificial; con
    'gratis' solo calcula cuánto costaría. La lista de modelos se revisa sola cada mañana (pg_cron + models.list de Google:
    suma los nuevos sin precio, marca los retirados); los precios NO se bajan solos (Google no los publica por API).
    **Mercado Pago** (Checkout Pro): token y secreto también en `integraciones`; la base habla con Mercado Pago con la
    extensión `http` (síncrona): `mp_pagar_pedido()` arma el cobro con el total del pedido (solo el dueño del pedido o el
    equipo), `mp_notificacion()` (webhook `app/api/mercadopago`) verifica la firma y CONSULTA el pago a Mercado Pago;
    aprobado → `pedidos.pagado_online`, confirmado y comisión a Gastos (una vez). Cancelar un pedido pagado lo
    reembolsa en la misma transacción (trigger) o no se cancela; el cliente no lo cancela solo; no se vence solo.
    `configuracion_tienda.mp_modo` (no / opcional / obligatorio, lo frena la base) y `mp_cuotas_max`; la tienda lo lee
    por `tienda_pagos()`. En las pruebas, `_mp_pedir` se reemplaza por respuestas preparadas.
    **Envíos**: `zonas_envio` (precio por zona, null = a coordinar) → `pedidos.zona_envio_id` y `costo_envio`, que pone
    `crear_pedido(…, p_zona)`. El envío va APARTE de la venta (no toca `total` ni la venta al entregar); el cliente paga
    total + envío (también por Mercado Pago). `envios` (uno por pedido con envío): proveedor, `costo_real` y seguimiento
    con `registrar_envio()` → Gastos → Envíos; el Resultado suma `v_envios_cobrados`.
    **Dominio propio** (`/admin/integraciones/dominio`, solo `equipo.administrar`): `dominios`; la base usa la API de
    Vercel (`_vercel`) para sumar el dominio y www (redirige), mostrar los registros a cargar y revisarlo (pg_cron cada
    10 min); «principal» actualiza Supabase (site_url y uri_allow_list) e `integraciones.sitio_url`. Los tokens de Vercel y
    Supabase los carga una vez quien instaló el sistema (Conexión técnica). Los servicios de afuera se llaman con
    `_pedir_http` (en las pruebas se reemplaza).
    Cada integración tiene su manual paso a paso en `docs/integraciones/<servicio>.md`, que se ve adentro de su pantalla.
17. **Gastos** (`/admin/gastos`, permiso `gastos.gestionar`): a mano, fijos por mes (`gastos_fijos`, los genera
    `_generar_gastos_fijos()` con pg_cron) y automáticos (`_sumar_gasto_automatico()`, no se tocan a mano). En dólares
    guardan **una copia** de la cotización. Informes → Resultado: ventas − costo − fallados de baja − gastos = neta.

18. **Un solo producto, código compartido y versiones controladas.** Este repositorio es el producto
    **Sistema para locales comerciales**. Todos los comercios usan el mismo código y reciben versiones
    identificables del producto; **nunca se crea una copia del repositorio modificada a mano para un cliente**.
    Las diferencias entre instalaciones se resuelven, en este orden, como configuración del negocio, módulo
    opcional reutilizable o mejora general del producto. Una necesidad exclusiva solo puede implementarse como
    integración aislada cuando no corresponda incorporarla al producto y no debe bifurcar su núcleo. Cada
    instalación puede quedar temporalmente en una versión anterior para desplegar por etapas, pero debe conservarse
    qué versión tiene, qué migraciones requiere y cómo volver atrás. Primero se prueba una versión, después se publica
    en una instalación piloto y, tras verificarla, se despliega al resto. Otros rubros (por ejemplo, peluquerías)
    serán productos separados: podrán reutilizar componentes comunes más adelante, pero no deben forzarse dentro
    del modelo de datos ni de las pantallas de este sistema. La automatización de instalaciones y la plataforma
    central se construirán después de completar y validar este producto.

19. **Cuentas y correo configurables** (`/admin/equipo/cuentas`, `/admin/integraciones/correo`, `equipo.administrar`):
    `configuracion_cuentas` (una fila, la lee el público: sin secretos) dice quién puede registrarse (`abierto` / `invitacion`), qué
    datos pide el formulario (teléfono, documento, nacimiento, dirección: no / opcional / obligatorio), la contraseña, dominios de
    email permitidos/bloqueados, términos y la confirmación de email (obligatoria de fábrica). Las reglas las hace cumplir la
    base: `_registro_error()` (la usa `validar_registro()` antes de crear la cuenta, para mostrar el motivo, y el trigger
    `antes_de_registrarse` en `auth.users`, que no se puede saltear). `invitaciones_cuenta` = links de un solo uso atados a un
    email y con rol opcional (`crear_invitacion`, `invitacion_info`): sirven aunque el registro esté cerrado y las usa
    `_nuevo_usuario`. El SMTP del local (Resend) está en `integraciones` (regla 16); `cuentas_aplicar()` le pasa a Supabase Auth,
    por su API, el SMTP, `mailer_autoconfirm`, las reglas de contraseña y las plantillas (`_correo_plantilla`, con el nombre de la
    tienda). Los links de los mails van a `/auth/confirmar?token_hash=…&type=…` (`app/auth/confirmar/route.ts`, `verifyOtp`): andan
    desde otro dispositivo. Hay reenviar mail, «Olvidé mi contraseña» (`/olvide-clave`, `/nueva-clave`). **El correo es a elección** (`lib/correo.ts`): dominio propio con
    Resend (API desde la base), **Gmail del local** con contraseña de aplicación (sin dominio) u otro SMTP; con Gmail u otro, los comprobantes los manda la ruta
    `/api/correo/enviar` (nodemailer) con el pedido **firmado** por la base (`_correo_enviar`, HMAC con `integraciones.correo_secreto`, que nace con la instalación: la
    ruta lo verifica desde otra conexión con `correo_verificar`). Sin dominio propio, `sitio_url` es la de Vercel (la guarda `guardar_correo`). Nunca usar `disable_signup`
    de Supabase (frena también las invitaciones): el cierre es el trigger. Manual: `docs/integraciones/correo.md`.

20. **Legales** (`/admin/tienda/legales`, `tienda.editar`; `/admin/arrepentimientos`, `pedidos.gestionar`): `datos_legales` (razón
    social, CUIT, domicilio, contacto; pública, va al pie) y `documentos_legales` (términos y privacidad **versionados e
    inmutables**: un trigger frena editar o borrar; se publica solo con `publicar_documento()`, que exige los datos del comercio;
    la vigente es `v_documentos_vigentes`). `aceptaciones_legales` guarda quién aceptó qué versión, cuándo y dónde (`registro` por
    `_nuevo_usuario` si tildó la casilla; `compra` por `aceptar_documentos_compra()` desde `confirmarPedido`, que pide tildar si
    `documentos_pendientes()` no está vacío). Los textos son un borrador (`lib/legales.ts`, con los días de cambio/retiro/saldo de
    la tienda) y **los tiene que revisar un abogado**. El botón de arrepentimiento (`/arrepentimiento`, público, 10 días) llama a
    `registrar_arrepentimiento()` y devuelve un código; solo se vincula a un pedido si el email coincide con el de ese cliente.

21. **Identidad de la tienda** (`/admin/tienda` → Identidad, `tienda.editar`): `configuracion_tienda.logo_url` / `logo_oscuro_url` (este
    último solo para la cabecera transparente sobre una campaña con foto: `.logo-claro` / `.logo-oscuro` en `globals.css`) y
    `color_marca` (`#rrggbb`). Los logos se achican en el navegador y van al bucket `tienda`. El color pisa `--color-marca` en el panel y
    en la tienda desde `app/layout.tsx` (`lib/color.ts`, `cssMarca`): solo se aplica si el texto blanco se lee sobre él (contraste ≥ 4,5).
    Los mails usan el mismo color y logo (`_correo_plantilla`; se reaplican con `cuentas_aplicar()` al guardar en Integraciones → Correo).
    No escribir `#1d4ed8` ni `blue-800` a mano: usar `bg-marca` / `bg-marca-oscuro`.

22. **Instagram** (`/admin/integraciones/instagram`, `tienda.editar`): muestra las últimas publicaciones del local en la portada (sección
    `instagram` de `inicio_secciones`). Usa «Instagram API with Instagram Login» de Meta: **la cuenta tiene que ser profesional**
    (`guardar_instagram()` lo verifica contra Meta y lo rechaza si no), no hace falta página de Facebook y alcanza con el acceso estándar
    (cada local usa su propia app de Meta). El token vive en `integraciones` (`ig_*`, regla 16: nadie lo lee; `estado_instagram()` solo
    dice si está), dura 60 días y `_instagram_renovar()` lo renueva solo. La tienda **no llama a Meta**: pg_cron copia cada 3 horas las
    últimas publicaciones a `instagram_posts` (`_instagram_tarea()`), que lee la tienda; el dueño puede ocultar una (`visible`). Los links de
    las fotos de Meta vencen a los pocos días: por eso el refresco frecuente. Manual: `docs/integraciones/instagram.md`. Lucide no trae íconos
    de marcas: usar `components/IconoInstagram.tsx`. Recibir DMs o publicar desde el panel quedan pendientes (Meta no deja claro si el
    acceso estándar alcanza para mensajes de público: probarlo antes de prometerlo).

23. **Instalaciones y versiones.** Cada cliente tiene SU instalación (su Supabase y su Vercel) con el mismo código; la fuente es este repositorio,
    sin copias por cliente (regla 18). Una **versión** es una etiqueta de Git `vAAAA.MM.DD`; el **piloto** (`instalaciones/mi-calzado.json`, `canal: main`) se
    despliega solo desde `main` y es donde se prueba; los **clientes** (`canal: manual`) solo cambian con `npm run instalaciones -- actualizar` (primero las
    migraciones, después el código). `scripts/instalaciones.mjs` hace `alta` (base + sitio + dueño como Administrador + ficha), `actualizar`, `etiquetar`,
    `estado` y `lista`; todo lo que cambia algo admite `--dry-run`. Las fichas de `instalaciones/` **no llevan secretos**. Una migración nueva tiene que dejar
    andando al código de la versión anterior (agregar, no sacar ni renombrar de golpe): los clientes pueden quedar atrás. La versión instalada se ve abajo del menú
    del panel (`lib/version.ts`, `NEXT_PUBLIC_VERSION`). El alta guarda los tokens del instalador en `integraciones` de cada base (para que el dueño configure su
    dominio y su correo sin tocar Vercel ni Supabase): ver «Seguridad» en `docs/INSTALACIONES.md`. Skill: `alta-de-cliente`. Dominio: `lib/dns.ts` consulta el DNS
    de verdad (botón «Comprobar en internet»), `lib/dns-guias.ts` trae los pasos por proveedor; NIC.ar solo delega, no tiene zona DNS. `vercel.json` fija la región
    de las funciones en `gru1` (São Paulo), cerca de la base.

24. **Códigos de barras, etiquetas e impresión** (`/admin/etiquetas`, `/admin/impresion`): el código es **por variante** (`variantes.codigo_barras`, opcional y único; el `sku`
    sigue siendo el código interno legible). La base valida el formato y el dígito verificador GS1 de los de 8/12/13/14 cifras y que no se repita
    (`_variante_codigo_barras`); lo que no trae código recibe uno propio: EAN-13 que empieza en 200, el rango de uso interno de GS1
    (`generar_codigos_barras()`, `productos.editar`). `lib/codigos.ts` es el mismo criterio del lado de la app y compara lo que lee un lector (un UPC-A es
    el EAN-13 con un 0 adelante). Venta, presupuesto, cambio y compra reconocen el código escrito, de un lector (con o sin Enter) o de la cámara
    (`components/EscanerCamara.tsx`: BarcodeDetector nativo y ZXing de respaldo, cargado recién al abrirlo); `SelectorVariantes` arma un mapa código → variante con TODAS las
    filas (así avisa «sin stock»). Las etiquetas salen de **plantillas** (`plantillas_etiqueta`: rollo o hoja A4/Carta, tamaño, columnas y filas, márgenes, qué lleva): cada
    local imprime con lo que tiene, y `configuracion_impresion` guarda la que se propone. Se imprime desde el navegador: cada página es un `.pagina-impresa` del tamaño
    exacto del papel y `@page` lo fija (`lib/etiquetas.ts`: `paginar`, `cssDePagina`); el menú y los controles llevan `print:hidden`. Un **lote** se arma desde una compra, la
    lista de Productos (selección múltiple), Stock o «Agregar en bloque» (artículos completos, una compra, un filtro). Las hojas dejan margen: las impresoras comunes no
    imprimen pegado al borde. Desde la web no se puede elegir la impresora ni imprimir sin el cuadro del navegador. **Verificar la impresión generando un PDF con Chrome
    headless** (`--headless=new` + `Page.printToPDF`), no solo mirando la pantalla.


25. **Comprobantes y caja** (`/admin/comprobante/<tipo>/<id>`, `/comprobante/<token>`, `/admin/impresion`): la base arma el comprobante de venta, presupuesto o devolución
    (`comprobante_de`, sin costos ni notas; `components/Comprobante.tsx` lo dibuja en ticket 80/58 mm, A4 o pantalla). Link privado con token al azar
    (`enlaces_comprobante`, nadie la lee: solo funciones; `renovar_enlace_comprobante` invalida el anterior); la página pública no indexa ni manda «referer».
    Envío **manual**: WhatsApp por `wa.me` (`lib/telefono.ts`, `paraWhatsApp`), mail por la API de Resend desde la base (`enviar_comprobante_mail`, devuelve
    `{ok, error}` y deja `comprobante_envios`). `configuracion_impresion`: papel, `modo_impresion` (automatica / opcional / manual), qué lleva, letra, textos y
    `comprobante_configurado` (hasta guardar una vez, la caja avisa y no imprime); `impresion_por_usuario` pisa papel, modo y copias de una persona
    (`impresion_de()` da lo que vale para quien está usando el sistema; el link público usa lo de la tienda). **Formato por comprobante:**
    `configuracion_impresion.por_tipo` (factura, nota_credito, interno, presupuesto, devolucion; lo que falta sale del general; prioridad comprobante > persona > general;
    `_comprobante_json` arma `config.clave`). Los internos dicen «No válido como factura»; con factura autorizada, el comprobante es la factura (y la devolución, su nota de crédito). Un ticket pide a Chrome el alto medido
    (`cssDePagina`). **Caja**: `lib/cobro.ts` hace la misma cuenta que `_registrar_venta` (reparto por % o monto, redondeo, vuelto) y tiene pruebas. El
    **redondeo del efectivo** va en `p_pagos[].redondeo`: solo medios `tipo = 'Efectivo'`, hacia abajo, hasta 5 % y $ 1.000; queda dentro de `pagos.ajuste` (así
    `monto` y `ventas.total` cuadran como siempre) y además en `pagos.redondeo` para mostrarlo aparte. El lector se toma aunque el foco no esté en el buscador.


26. **ARCA (factura electrónica)** — rama `arca`, fase 1 (conexión), diseño en `docs/ARCA.md`. `/admin/integraciones/arca` (`equipo.administrar`):
    datos fiscales (`datos_legales`), ambiente (`configuracion_fiscal`), certificado y puntos de venta (`puntos_venta_fiscales`). La **llave privada va
    en el Vault** (`integraciones.arca_clave_vault_id`). **La base no puede conectarse con ARCA** (TLS viejo de sus servidores) ni firmar con RSA: lo hace
    la ruta `/api/arca/firma` (firmador y pasarela sin secretos, solo hacia las direcciones de ARCA; `lib/arca/`), que la base llama con `_arca_app`.
    Las funciones que hablan con ARCA tienen `statement_timeout` propio (la API corta a los 8 s) y nunca lanzan errores después de guardar el acceso
    (ARCA no da otro mientras haya uno vigente). Bitácora en `arca_llamadas` (sin claves). Las pruebas simulan la ruta reemplazando `_pedir_http`.
    **Fase 2 (facturar):** `facturar_venta` (permiso `facturas.emitir`, hijo de `ventas.registrar`) arma la factura B o C (`_factura_letra`; la A llega con la fase 3),
    importes por alícuota (`_factura_importes`: lo cobrado + envío, prorrateado; IVA del renglón copiado al vender en `venta_items.alicuota_iva`, de artículo → rubro →
    local) y la manda con `_factura_enviar`, que **nunca lanza**: numera con el último de ARCA (`FECompUltimoAutorizado`) bajo candado, y si ARCA ya tiene un número
    que el sistema no guardó lo consulta (`FECompConsultar`) y lo adopta si coincide (nunca dos CAE por venta). Cola: pg_cron cada minuto (`_facturas_reintentar`);
    las rechazadas esperan corrección. Anular una venta facturada crea la nota de crédito (trigger). El comprobante suma `fiscal` (letra, CAE, QR de ARCA).

27. **Plan de cuentas** (`/admin/contabilidad`, `contabilidad.ver` / `contabilidad.configurar`; diseño en `docs/PLAN_DE_CUENTAS.md`). Fase A: `cuentas` (árbol por
    código; el padre y el tipo los pone la base; solo las imputables reciben movimientos; `clave` = las que usa el sistema, no se borran ni se desactivan),
    importación por planilla (`importar_plan_cuentas`, agrega y renombra) y asignaciones con jerarquía: artículo → rubro → línea (`cuentas_por_linea`) →
    general (`cuenta_venta_de`, `cuenta_costo_de`); medios de pago (nacen con la cuenta de su tipo), proveedores, `conceptos_compra`, categorías de gasto.
    `asignar_cuenta` controla que el tipo de cuenta tenga sentido. «Qué falta asignar» = `v_cuentas_sin_asignar`. Los asientos llegan en la fase B.

28. **Asientos automáticos** (fase B; `asientos` + `asiento_lineas`, libro diario, mayor y sumas y saldos en `/admin/contabilidad`). Cada operación genera su asiento con un
    **trigger** (venta, compra y devolución, **diferidos** al cierre de la transacción para ver los renglones y pagos; anulación, gasto, ajuste de stock, fallado resuelto y
    ajuste del crédito con proveedores, directos), así vale para toda venta venga de donde venga. `_asentar()` controla que **cuadre** (si no, se deshace la operación),
    que las cuentas sean imputables y activas, y numera sin saltos. **Los asientos no se editan ni se borran** (trigger): una anulación hace el contra-asiento. No se genera nada
    hasta `iniciar_contabilidad(fecha)` (arma el asiento de apertura: stock a costo, saldos a favor y crédito con proveedores; el resto lo completa el contador con
    `registrar_asiento_manual`). Hasta que ARCA esté activa, todo es «interno» y el IVA no se discrimina. En las pruebas hay que forzar los diferidos con
    `set constraints all immediate; set constraints all deferred;` (si no, no corren: la transacción nunca se confirma). No se desactiva una cuenta asignada. Falta: recibos,
    órdenes de pago y compras rediseñadas (fase C) e IVA con ARCA.
---

## Dónde está cada cosa

```
app/(tienda)/          tienda pública: portada (page.tsx + inicio/), catálogo, producto, carrito, ingresar/registro, mi-cuenta
app/admin/             panel del equipo (el layout verifica que sea staff; cada página, su permiso con exigir())
  equipo/              personas del equipo y roles con sus permisos
  productos/           alta con desplegables + talles/colores tildables; ficha con grilla talle×color
  productos/[id]/      ficha: grilla talle×color, proveedores y precios de compra, ajustes de stock
  ventas/nueva/        punto de venta (pagos mixtos con descuento/recargo por medio, descuento manual)
  compras/nueva/       cargar factura de compra POR CURVA: cabecera, grilla talle×color por modelo,
                       un costo por modelo, control contra el total de la factura, alta rápida de artículos
  stock/  pedidos/  clientes/  seguimientos/
  proveedores/         contactos y el crédito con cada uno (movimientos, ajuste con nota)
  devoluciones/        devoluciones (comprobante DEV, saldo a favor) y su desglose por motivo y talle; se hacen desde la venta
  fallados/            bandeja de fallados: lo apartado por roto, y su salida (arreglado, al proveedor, baja)
  reposicion/          pedido sugerido por talle según el ritmo de venta (reposicion_sugerida), copiable a WhatsApp
  precios/             ajuste masivo de precios de venta y compra (ajustar_precios), historial y deshacer
  tienda/              tienda online: secciones de la portada (orden, ocultar, editar, fotos) y datos de la tienda
  integraciones/       portada con una tarjeta por servicio; whatsapp/ (claves, webhook, bot y avisos), ia/ (Gemini: clave,
                       modelo, plan, uso), mercadopago/, envios/ (zonas, cobrar antes de
                       enviar, Uber Direct y Andreani); cada una con su manual (Manual.tsx lee docs/integraciones/)
  tablas/              maestros: rubros/subrubros, marcas, colores (muestra), talles (orden), medios de pago
components/            Menu (íconos lucide), Logo, Volver, SelectorVariantes (venta), Contactos…
lib/supabase/server.ts crearCliente() tipado y usuarioActual() → { supabase, user, rol, nombre }
lib/database.types.ts  GENERADO — no editar a mano (npm run db:tipos)
lib/maestros.ts        lee las tablas que alimentan los desplegables
lib/formato.ts         pesos(), porcentaje(), fecha(), inicioDe() con zona -03:00
lib/permisos.ts       tipo Permiso y puede() (menú) · lib/exigir.ts: exigir('permiso') al principio de cada página
lib/medios.ts          MedioPago, textoMedio(), ajusteDe() (mismo redondeo que la base)
lib/carrito.ts         carrito en localStorage
lib/inicio.ts          tipos de sección de la portada, su contenido y cómo se lee sin romperse
lib/fotos.ts           achicarFoto(): las fotos se achican en el navegador antes de subirlas
proxy.ts               refresca la sesión; /admin exige staff; /mi-cuenta exige login
supabase/migrations/   el esquema (una migración por cambio)
supabase/seed.sql      datos de ejemplo SOLO para la base local
```

---

## Cómo trabajar

```bash
npm run db:start     # base local en Docker (la primera vez tarda)
npm run db:reset     # rehace la base: migraciones + seed.sql
npm run db:tipos     # regenera lib/database.types.ts — después de CADA cambio de esquema
npm run db:test      # pruebas de la base (supabase/tests): ventas, compras, pedidos, fotos, portada, seguridad
npm run dev          # http://localhost:3000
npm run test:unidades   # pruebas de lib/*.test.ts y scripts/*.test.mjs (Node ejecuta TypeScript directo)
npm run instalaciones -- ayuda   # alta, actualización y estado de los clientes (docs/INSTALACIONES.md)
npm run revisar      # tsc + eslint + pruebas unitarias + build: tiene que pasar antes de dar algo por terminado
```

Usuarios de la base **local** (los crea `seed.sql`, no existen en producción):
`admin@demo.local` (equipo, Administrador), `vendedor@demo.local` (equipo, rol Vendedor: sin costos, sin precios,
sin anular, solo sus ventas) y `cliente@demo.local` (cliente), contraseña `demo1234`.

### Antes de dar un cambio por terminado

1. `npm run revisar` sin errores.
2. Si tocaste la base: `npm run db:reset` corre limpio, regeneraste los tipos y `npm run db:test` pasa
   (si agregaste una regla, sumale su prueba en `supabase/tests/database/`).
3. Probalo en el navegador como **equipo y como cliente** si toca permisos o la tienda.
4. Si tocaste stock: el stock de cada variante tiene que seguir siendo igual a la suma de sus
   movimientos:
   ```sql
   select v.sku, s.cantidad, coalesce(sum(m.cantidad),0) as movimientos
   from variantes v join stock s on s.variante_id = v.id
   left join movimientos_stock m on m.variante_id = v.id and m.deposito_id = s.deposito_id
   group by v.sku, s.cantidad having s.cantidad <> coalesce(sum(m.cantidad),0);   -- debe dar 0 filas
   ```

### Skills (en `.claude/skills/`)

- `agregar-pantalla` — una pantalla nueva del panel o de la tienda, con el patrón de la casa.
- `cambiar-base-de-datos` — una migración nueva (tabla, columna, función) sin romper RLS ni tipos.
- `publicar` — de local a producción: Supabase en la nube + Vercel.

---

## Lo que NO hacer

- No editar una migración que ya se aplicó en producción: se agrega **una nueva**.
- No usar la `service_role` key en el código de la app (saltea toda la seguridad). La app usa
  solo la *publishable key* y la sesión del usuario.
- No subir `.env.local` (está en `.gitignore`).
- No guardar una clave (token, secreto, API key) en una tabla con lectura ni en el código: va a `integraciones` (regla 16).
- No `select *` desde la tienda sobre tablas con costos: la tienda lee `v_catalogo`.

29. **Mails al cliente = plantillas editables** (`/admin/tienda/mails`, `tienda.editar`; `plantillas_mail`): una por situación (confirmar cuenta, cambiar contraseña, cambiar email, invitación,
    bienvenida, pedido recibido / pagado / confirmado / listo / enviado / entregado / cancelado). Texto plano con `{{variables}}` (las valida la base: `_mail_variables`) y **negrita**;
    **nunca HTML** (`_mail_texto` escapa todo). `_mail_html` arma el mail con la marca de la tienda. Las de cuenta (`fija`) las manda Supabase y no se apagan: `_correo_plantilla` las lee de la
    tabla y `cuentas_aplicar()` se las pasa (se aplica al guardar). Las demás salen por **cola** (`mails_cola`, pg_cron cada minuto, `_mails_procesar`, 5 intentos): los triggers
    (`_mail_aviso_pedido`, `_mail_aviso_pago`, `_mail_bienvenida`) encolan **solo si el correo está conectado**, la plantilla está activa y hay email, y nunca frenan la operación (cada aviso sale
    una vez por pedido). `_correo_enviar(para, asunto, html, reply_to, adjuntos)` es el único camino de salida: Resend por API desde la base, Gmail/otro SMTP por `/api/correo/enviar`.
    **El comprobante viaja en PDF**: `/comprobante/<token>/pdf` (`lib/comprobante-pdf.ts`, pdfkit, en `serverExternalPackages`) lo arma de `comprobante_publico`; el mail lo adjunta
    (solo links del propio sitio). Hay comprobante de **pedido** (`_comprobante_pedido`, tipo `pedido`). El mail de una venta con factura dice «Factura B 0003-…», el CAE y la ley de transparencia.

30. **Confirmación de pagos** (`pedido_pagos`: `medio_pago_id`, `confirmado_en/por`, `comprobante_path`; Tablas → Medios de pago): un pago a mano de un pedido nace **pendiente** si es efectivo (lo confirma quien tiene
    `pagos.confirmar`, `confirmar_pago_pedido`; con ese permiso y la casilla, nace confirmado) y cuenta como pagado solo **confirmado** (`pedido_pagado`). La transferencia pide lo que decida el dueño
    (`configuracion_tienda.transferencia_comprobante`: `no` / `referencia` / `adjunto`; el archivo va al bucket privado `comprobantes-pago`, `pedido-<id>/<uuid>.<ext>`); con la constancia pedida nace confirmada.
    Lo que paga el cliente por Mercado Pago se verifica solo. No se entrega un pedido con un pago sin confirmar. En la caja, la transferencia pide el n.º de operación si hay exigencia (se controla al cierre de
    la operación: `_pago_pide_referencia`, deferido). El aviso «pago recibido» sale al confirmar.


31. **Mercado Pago Point** (posnet del mostrador; `point_terminales`, `point_cobros`, `integraciones.mp_point_*`, `configuracion_tienda.tarjetas_modo`): la base habla con la API de Órdenes
    (`_mp_point_pedir`, que en las pruebas se reemplaza). Usa las credenciales de Mercado Pago de Integraciones (Checkout, QR y posnet comparten una sola aplicación; las columnas `mp_point_*` quedaron sin pantalla y solo valen si alguna vez se cargaron): el webhook `/api/mercadopago`
    reparte los avisos `order` a `point_notificacion()`, que verifica la firma y CONSULTA la orden. La caja manda el monto con `point_cobrar()` y mira `point_estado()` cada 2 s (`CobroPoint`); el cobro
    aprobado deja su orden como `referencia` del pago. Regla `tarjetas_modo`: `libre` (de fábrica) o `vinculado` (el trigger deferido `pagos_tarjeta_vinculada` frena una tarjeta que no pasó por el posnet y
    ata el cobro a la venta una sola vez). Pantalla: Integraciones → Mercado Pago. Manual: `docs/integraciones/mercadopago.md`.

    **QR dinámico** (`qr_preparar`, `qr_cobrar`; la caja y la sucursal se crean una vez en Mercado Pago, `integraciones.mp_qr_*`): mismo circuito que el posnet (`point_cobros.via = 'qr'`, `point_estado`, webhook `order`);
    la caja dibuja el QR con `qr_data` (`CobroPoint`, librería `qrcode`); el **QR fijo** del mostrador (modo `hybrid`, `qr_fijo()`) se imprime una vez y la caja le carga cada monto. Se ofrece para los medios de tipo Billetera o con «mercado pago»/«qr» en el nombre.

32. **Preferencias de cobro** (`dispositivos`, `preferencias_cobro`; Integraciones → Mercado Pago → «Cobro en la caja», `equipo.administrar`): qué medios de Mercado Pago ofrece la caja (`posnet`, `qr`, `qr_fijo`)
    según el rol, la persona y el **dispositivo** (se registra una vez; el navegador guarda su `clave` en `localStorage`, y `cobro_medios(clave)` da lo que corresponde). Gana lo más específico (dispositivo > persona > rol; sin
    nada dicho, todo habilitado). Es comodidad de la pantalla: no reemplaza el permiso de cobrar ni la regla de tarjetas, que controla la base. El mismo mecanismo sirve para sumar otros medios después.

33. **Requisitos** (`requisitos(p_accion)`; `components/Requisitos.tsx`): qué falta antes de `vender`, `facturar`, `cobrar_online`, `publicar_tienda` o `enviar_mails`. La base mira la configuración y devuelve cada ítem con
    `bloquea` (rojo: impide hacerlo hoy) o aviso (ámbar), la `ruta` donde se arregla y `puede` (si quien mira tiene el permiso para arreglarlo; si no, «pedíselo a quien administra»). Los carteles están en la caja
    (lo que frena detiene «confirmar» con el motivo), Tienda, Mercado Pago, Correo y ARCA, y el resumen en Configuración. Es información para la pantalla: lo que frena de verdad una operación lo controla la
    función de la base de esa operación. Un requisito nuevo = un caso más en `requisitos()` (migración nueva, no se edita la vieja) y su prueba en `supabase/tests/database/requisitos.test.sql`.

34. **Cuenta corriente** (módulo `cuenta-corriente`, APAGADO de fábrica: Equipo → Módulos; `/admin/cuenta-corriente`; `cc_movimientos`, `clientes.cc_habilitada` y `cc_tope`, medio de pago `es_cuenta_corriente`): un cliente habilitado
    compra «a cuenta» y paga después. El medio «Cuenta corriente» está activo solo con el módulo encendido (un trigger lo sigue). La base frena la venta sin cliente, a un cliente no habilitado o que pasaría su tope
    (`_cc_vender`, con el cliente bloqueado `for update`: dos ventas a la vez no pasan el tope). El libro `cc_movimientos` es la fuente del saldo (+ debe, − pagó), no se edita ni se borra: se corrige con `cc_ajustar` (nota
    obligatoria). `cc_cobrar` registra el cobro (n.º de recibo = id del movimiento, `/admin/cuenta-corriente/recibo/<id>`) y, con contabilidad iniciada, su asiento (`recibo`: medio → Deudores por ventas). Anular una venta a cuenta
    descuenta su deuda (`_cc_anular`). Permisos `cc.ver`, `cc.cobrar`, `cc.habilitar` (el Encargado los trae). La clave de un módulo es su ruta (`/admin/<clave>`; se admite el guion). Una devolución de una venta a cuenta deja
    saldo a favor y no toca la deuda; el interés por mora no existe todavía.

35. **Listas de precios** (`listas_precios`, `configuracion_tienda.listas_precios_activas` / `lista_mostrador_id` / `lista_tienda_id`; APAGADAS de fábrica): `productos.precio_venta` es el precio base; cada canal lo ajusta con un % y un redondeo
    (`_aplicar_lista`, la misma cuenta en la base y en las pruebas). `precio_de()` (caja, presupuestos, cambios) usa la lista del mostrador, salvo que `app.canal_precio = 'tienda'` (lo fija `crear_pedido`, que cotiza con la lista de la
    tienda); `v_catalogo.precio` es el de la tienda y `v_stock.precio_lista` el del mostrador (la caja lo usa). Las listas se administran con `guardar_lista_precios`, `quitar_lista_precios` y `configurar_listas_precios`
    (permiso `precios.editar`). Sin pantalla todavía: falta la administración en Precios. Si se cambia `crear_pedido` otra vez, conservar su primera línea (`set_config('app.canal_precio', 'tienda', true)`).

36. **Mercado Pago, auditado contra la documentación oficial** (`supabase/migrations/20261026000000_mercado_pago_auditoria.sql`): la idempotencia del cobro es estable (`cobro-c<id>`), si Mercado Pago no contesta el cobro queda en `error`
    (no se pierde), el importe cobrado (`monto_pagado`) tiene que ser el pedido, la referencia de un cobro sirve **una sola vez** y por su importe con cualquier medio (`_pago_tarjeta_vinculada`), anular una venta cobrada con el
    posnet o el QR devuelve el dinero por la API (o no se anula: `_point_reembolsar_al_anular`, diferido), un barrido cada 2 minutos actualiza los pendientes (`_point_reconciliar`) y sin clave secreta un aviso no se acepta.
    Pendiente: reembolso parcial, comisiones de Point/QR a Gastos y confirmar con una prueba real la firma del webhook de órdenes (la documentación de órdenes no describe el cálculo; se usa el de los webhooks generales).

    **QR y sucursales existentes:** `qr_sucursales()` lee las sucursales y cajas de la cuenta de Mercado Pago y `qr_usar_sucursal()` usa una (o crea una caja nueva en ella); `qr_preparar()` crea una sucursal nueva.
    **Esperar el pago** (`configuracion_tienda.cobro_espera_pago`, encendido de fábrica; `cobro_espera_pago()`): mientras un cobro por posnet o QR está pendiente la caja no deja confirmar la venta ni suelta el ticket.

37. **Sucursales y cajas** (`sucursales`, `cajas`; módulo `sucursales` APAGADO de fábrica: `/admin/sucursales`): siempre existe una sucursal y una caja «principal» (quien tiene un solo local no ve nada distinto; el cobro con QR de
    Integraciones → Mercado Pago trabaja sobre la caja principal). Cada sucursal es de un depósito y se vincula con UNA sucursal de Mercado Pago (`mp_sucursal_id`, única); cada caja con UNA caja de Mercado Pago (`mp_caja_id`,
    `mp_externo` = su `external_id`, lo que pide la orden de QR; única) y con UN posnet (`terminal_id`). Cada dispositivo (`dispositivos.caja_id`) cobra con la caja asignada: `cobro_medios(clave)` devuelve su `caja`
    (`point_caja(p_caja)`), y `point_cobrar(…, p_caja)`, `qr_cobrar(…, p_caja)` y `qr_fijo(p_caja)` usan SU QR y SU posnet; el cobro anota `caja_id`. Mercado Pago pide `store_id` como TEXTO, un monto mínimo de $ 15 por QR
    (`_mp_error_texto` explica los rechazos) y el `external_id` de cada caja tiene que ser distinto (`CAJA<id>`). Falta: los datos fiscales (razón social, CUIT, certificado y punto de venta de ARCA) por sucursal.
38. **Supabase en la nube rechaza un `UPDATE` sin `WHERE`** (la base local no): en la fila única de `integraciones` / `configuracion_tienda` usar siempre `where unica`. `scripts/migraciones.test.mjs` lo controla en las migraciones nuevas.
    Y una función con parámetros opcionales los declara `default null`: la pantalla omite los vacíos y PostgREST resuelve la función por los nombres que llegan.

39. **Razón social por sucursal (etapa 1)** (`empresas`, `sucursales.empresa_id` / `domicilio` / `telefono`, `ventas.caja_id` / `sucursal_id`): la razón social PRINCIPAL sigue siendo `datos_legales`; las ADICIONALES viven en `empresas`
    (`guardar_empresa`, CUIT validado, único); `sucursales.empresa_id` null = la principal. Cada venta anota su caja y sucursal con un disparador (`_venta_caja`): `registrar_venta(…, p_caja)` fija `app.caja_id` en la transacción (sin dato,
    la caja principal; los pedidos, presupuestos y cambios caen en la principal). El comprobante (`_comprobante_json` → `_emisor_de`) lleva la razón social, el CUIT, el local y el teléfono de la sucursal que vendió, y su nombre si hay
    más de una. **Facturar por ARCA desde una razón social adicional todavía NO se puede** (`_factura_crear` lo frena con un mensaje claro): falta la etapa 2 (certificado y punto de venta por razón social), que se hace después de
    probar ARCA con un certificado real. Mientras tanto una sucursal de otra razón social vende e imprime el comprobante interno.

40. **Parametrización vs configuración** (`/admin/parametrizacion`, `lib/parametrizacion.ts`; permiso `equipo.modulos`): la **parametrización** es qué usa el local, sí o no; cada interruptor es un módulo de la tabla `modulos`
    (devoluciones, presupuestos, pedidos, tienda, cuenta corriente, sucursales, **listas de precios** `precios/listas` y cada **integración** `integraciones/<servicio>`: mercadopago, whatsapp, ia, instagram, envios,
    dominio, correo, arca). Lo que se enciende ahí aparece en **Configuración** (`lib/configuracion.ts`, campo `modulo`) con su «cómo»; lo apagado se oculta (menú, tarjetas de Integraciones, Configuración, Inicio) y el
    `proxy.ts` corta su pantalla (mira los dos tramos de la ruta: `cuenta-corriente`, `integraciones/whatsapp`). La clave de un módulo es su ruta (`[a-z_/-]`). Un local nuevo arranca con lo mínimo; en esta instalación quedó
    encendido lo que ya se usaba. Apagar una integración la oculta: lo ya conectado sigue funcionando hasta desconectarlo. `accionActiva()` hace que los carteles de «qué falta» respeten lo apagado. El interruptor de las
    listas de precios es el módulo (`_precio_con_lista` lo lee); `configurar_listas_precios` solo guarda la lista de cada canal. Un módulo nuevo: fila en `modulos` (migración), su `descripcion` en `lib/parametrizacion.ts` y su
    entrada en `lib/configuracion.ts`. Las pruebas de la base que apagan módulos parten de «todo encendido».
41. **Caja de cada persona**: `perfiles.caja_id` (Equipo → Personas). La caja con la que se cobra se resuelve de lo más específico a lo general: el dispositivo registrado y asignado → la persona → la caja principal (`cobro_medios`,
    `_venta_caja`).
