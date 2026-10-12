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
    desde otro dispositivo. Hay reenviar mail, «Olvidé mi contraseña» (`/olvide-clave`, `/nueva-clave`). Nunca usar `disable_signup`
    de Supabase (frena también las invitaciones): el cierre es el trigger. Manual: `docs/integraciones/correo.md`.

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
npm run revisar      # tsc + eslint + build: tiene que pasar antes de dar algo por terminado
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
