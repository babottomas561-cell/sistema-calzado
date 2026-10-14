# Conectar WhatsApp, paso a paso

Las claves quedan guardadas en la base y **nadie las puede volver a leer** (ni desde el panel): solo se ve si están cargadas. Para cambiar una, se pega la nueva encima.

Para WhatsApp necesitás: una compu (las pantallas de Meta son incómodas en el celular), un **número de celular que NO esté usando
WhatsApp** (conviene un chip nuevo solo para el bot) y una tarjeta para pagar lo que cobra Meta.

> Meta cambia los nombres de sus pantallas seguido. Si algo no aparece exactamente así, buscá el nombre parecido.

## Paso 1 — Meta: la cuenta del negocio

1. Entrá a **business.facebook.com** con tu Facebook personal (Meta lo pide; no se publica nada en tu perfil).
2. **Crear un portfolio comercial** (antes se llamaba «cuenta comercial»): nombre del local, tu nombre y el email del
   negocio. Confirmá el email que te llega.
3. (Recomendado) **Configuración del negocio → Centro de seguridad → Verificación del negocio**: cargá los datos del
   local (CUIT, dirección, teléfono, web). Sin verificar se puede usar, pero con límites de mensajes por día.

## Paso 2 — Meta: la app con WhatsApp

1. Entrá a **developers.facebook.com** → arriba a la derecha **Empezar** (la primera vez te registra como
   desarrollador: aceptá y verificá tu teléfono).
2. **Mis apps → Crear app**.
   - Caso de uso: **«Conectarte con los clientes a través de WhatsApp»** (o tipo *Empresa* si te pregunta el tipo).
   - Nombre: por ejemplo «Bot del local». Email de contacto: el tuyo.
   - Portfolio comercial: elegí el del paso 1. → **Crear app**.
3. En el panel de la app, en **WhatsApp → Configuración de la API** (o «Primeros pasos»), Meta crea un **número de
   prueba** y una cuenta de WhatsApp Business. Sirve para probar ya, sin pagar ni verificar el negocio: solo le podés escribir a los números que
   agregues como destinatarios («Para» → Administrar lista de números), y Meta le pone sus límites (se ven en el panel de la app).

   > **Para probar no hace falta publicar la app ni completar nada legal.** Una app nueva arranca en *modo de desarrollo*: ahí solo la usan quienes
   > tienen un rol en la app (vos). La **política de privacidad**, los **términos** y la **verificación del negocio** los pide Meta recién cuando pasás la app
   > a *modo en vivo* o pedís permisos avanzados. Dejá esos campos vacíos y seguí con el paso 3.

## Paso 3 — Meta: tu número real

1. En **WhatsApp → Configuración de la API**, abajo: **Agregar número de teléfono**.
2. **Nombre visible**: el nombre del local tal como querés que lo vea el cliente (Meta lo revisa; tiene que
   coincidir con el negocio).
3. Categoría (Ropa y accesorios) y descripción corta.
4. Ingresá el número con +54 9 y el código de área, y elegí recibir el **código por SMS o llamada**. Cargalo.
5. Meta te pide un **PIN de 6 dígitos** (verificación en dos pasos). Anotalo en un lugar seguro.
6. Volvé a **Configuración de la API**, elegí tu número en «De» y copiá dos datos:
   - **Identificador del número de teléfono** (Phone number ID): son solo números.
   - **Identificador de la cuenta de WhatsApp Business** (WABA ID): también solo números.

## Paso 4 — Meta: el token permanente

El token que aparece en «Configuración de la API» es **temporal (vence en 24 h)**: no lo uses. Hacé uno permanente:

1. **business.facebook.com → Configuración del negocio → Usuarios → Usuarios del sistema → Agregar**.
   Nombre: «sistema-local». Rol: **Administrador**. → Crear.
2. Con ese usuario elegido: **Asignar activos**:
   - **Apps** → tu app → permiso **Control total**.
   - **Cuentas de WhatsApp** → tu cuenta → **Control total**. → Guardar.
3. **Generar nuevo token**:
   - App: la tuya. Caducidad: **Nunca**.
   - Permisos: tildá **whatsapp_business_messaging** y **whatsapp_business_management**.
   - **Generar token** y copialo **ahora** (Meta no lo vuelve a mostrar). Empieza con `EAA…`.

## Paso 5 — Meta: la clave secreta de la app

1. **developers.facebook.com → tu app → Configuración de la app → Básica**.
2. **Clave secreta de la app** → **Mostrar** (te pide tu contraseña de Facebook) → copiala.
   Sirve para que el sistema compruebe que cada mensaje viene de verdad de Meta: **sin ella no se acepta ninguno**.

## Paso 6 — En el panel: cargar todo

1. **esta pantalla (Integraciones → WhatsApp)**, punto **2**: pegá
   - ID del número de teléfono,
   - ID de la cuenta de WhatsApp Business,
   - Token de acceso (el permanente),
   - Clave secreta de la app.
2. **Guardar conexiones**. Arriba tiene que decir **WhatsApp (Meta): conectado**.

## Paso 7 — Meta: el webhook (para recibir los mensajes)

1. En el panel, punto **1**: copiá la **URL de devolución de llamada** y el **Token de verificación** (botón copiar).
2. **developers.facebook.com → tu app → WhatsApp → Configuración** → sección **Webhook → Editar**:
   pegá la URL y el token → **Verificar y guardar**. (Si da error, mirá «Si algo falla» abajo.)
3. En la misma pantalla, **Campos del webhook → Administrar** → **messages → Suscribirse**.

## Paso 8 — Probar WhatsApp

1. En el panel, punto **3**: escribí tu celular y **Mandar prueba**. Te llega «Hello World» de Meta.
2. En **Últimos envíos** aparece «Aceptado», o «Rechazado» con el motivo que dio Meta.
3. Escribile desde tu celular al número del local: el mensaje queda marcado como leído (y si el bot está activo, contesta).

## Paso 9 — Publicar la app (para escribirle a cualquiera)

Mientras la app está en modo **Desarrollo**, solo funciona con los números de prueba. Para usarla con clientes:

1. **developers.facebook.com → tu app → Configuración de la app → Básica**: cargá la **URL de la política de
   privacidad** (puede ser una página de la tienda) y un ícono.
2. Arriba, cambiá **Modo de la app: Desarrollo → Activo** (Publicar).
3. **business.facebook.com → Configuración del negocio → Cuentas → Cuentas de WhatsApp → tu cuenta → Configuración
   de pago**: agregá la tarjeta. Sin medio de pago, Meta no manda los avisos que se cobran.

## Paso 10 — La plantilla para los avisos de pedidos

Para escribirle a un cliente que no te escribió en las últimas 24 h (por ejemplo «tu pedido está listo»), Meta
exige una **plantilla aprobada**.

1. **business.facebook.com → WhatsApp Manager → Administrar plantillas → Crear plantilla**.
2. Categoría: **Utilidad**. Nombre: `estado_pedido` (minúsculas y guion bajo). Idioma: **Español (ARG)**.
3. Cuerpo, con las tres variables en este orden:
   > Hola {{1}}, tu pedido {{2}} está {{3}}. Cualquier consulta, respondé este mensaje. ¡Gracias por tu compra!
   - Ejemplos que pide Meta: {{1}} = Juan, {{2}} = 0001-00000015, {{3}} = listo para retirar.
4. **Enviar a revisión**. Tarda de minutos a un día.
5. Cuando diga **Activa / Aprobada**: en el panel, **Integraciones → WhatsApp → Bot y avisos** → Plantilla `estado_pedido`, Idioma `es_AR`
   → tildá **Avisos de pedidos** → **Guardar bot y avisos**.

Desde ahí, el aviso sale solo cuando el pedido pasa a confirmado, listo, en camino, entregado o cancelado
(lo cambie quien lo cambie, o si vence solo). El cliente tiene que tener el teléfono cargado en su ficha.

## Costos

| qué | cuánto | dónde queda |
|---|---|---|
| Lo que contesta el bot dentro de las 24 h de que el cliente escribió | gratis | — |
| Avisos de pedidos (plantilla de utilidad) | ~US$ 0,026 cada uno | Gastos → WhatsApp (Meta), solo |
| Promociones (plantilla de marketing) | ~US$ 0,06 cada una | Gastos → WhatsApp (Meta), solo |

## Si algo falla

| qué pasa | qué revisar |
|---|---|
| Meta no verifica el webhook | Que la URL sea la que muestra el panel (la de producción) y el token esté copiado entero, sin espacios. |
| La prueba dice «Malformed access token» o «Invalid OAuth» | El token está mal copiado o es el temporal: generá uno permanente (paso 4). |
| «Recipient phone number not in allowed list» | La app está en Desarrollo: agregá ese número como destinatario o publicá la app (paso 9). |
| «Template name does not exist» | El nombre de la plantilla no coincide o todavía no está aprobada; revisá también el idioma (es_AR). |
| Los mensajes llegan pero el bot no contesta | ¿Está tildado **Bot de WhatsApp**? ¿Te suscribiste a **messages** (paso 7)? ¿Está cargada la clave secreta? |
| Los avisos no salen | Avisos tildados, plantilla aprobada con su nombre en el panel, y el cliente con teléfono en su ficha. |
