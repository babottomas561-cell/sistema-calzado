# Conectar WhatsApp (Meta) y la IA (Gemini) — paso a paso

Todo se configura desde el panel, en **Configuración → Integraciones**. No hace falta tocar Vercel ni código.
Las claves quedan guardadas en la base y **nadie las puede volver a leer** (ni desde el panel): solo se ve si están
cargadas y sus últimos 4 caracteres. Para cambiar una, se pega la nueva encima.

Necesitás: una compu (las pantallas de Meta son incómodas en el celular), un **número de celular que NO esté usando
WhatsApp** (conviene un chip nuevo solo para el bot) y una tarjeta para pagar lo que cobra Meta.

> Meta cambia los nombres de sus pantallas seguido. Si algo no aparece exactamente así, buscá el nombre parecido.

---

## Parte 1 — Meta: la cuenta del negocio

1. Entrá a **business.facebook.com** con tu Facebook personal (Meta lo pide; no se publica nada en tu perfil).
2. **Crear un portfolio comercial** (antes se llamaba «cuenta comercial»): nombre del local, tu nombre y el email del
   negocio. Confirmá el email que te llega.
3. (Recomendado) **Configuración del negocio → Centro de seguridad → Verificación del negocio**: cargá los datos del
   local (CUIT, dirección, teléfono, web). Sin verificar se puede usar, pero con límites de mensajes por día.

## Parte 2 — Meta: la app con WhatsApp

1. Entrá a **developers.facebook.com** → arriba a la derecha **Empezar** (la primera vez te registra como
   desarrollador: aceptá y verificá tu teléfono).
2. **Mis apps → Crear app**.
   - Caso de uso: **«Conectarte con los clientes a través de WhatsApp»** (o tipo *Empresa* si te pregunta el tipo).
   - Nombre: por ejemplo «Bot del local». Email de contacto: el tuyo.
   - Portfolio comercial: elegí el del paso 1. → **Crear app**.
3. En el panel de la app, en **WhatsApp → Configuración de la API** (o «Primeros pasos»), Meta crea un **número de
   prueba** y una cuenta de WhatsApp Business. Sirve para probar ya, pero solo le puede escribir a 5 números que
   agregues como destinatarios («Para» → Administrar lista de números).

## Parte 3 — Meta: tu número real

1. En **WhatsApp → Configuración de la API**, abajo: **Agregar número de teléfono**.
2. **Nombre visible**: el nombre del local tal como querés que lo vea el cliente (Meta lo revisa; tiene que
   coincidir con el negocio).
3. Categoría (Ropa y accesorios) y descripción corta.
4. Ingresá el número con +54 9 y el código de área, y elegí recibir el **código por SMS o llamada**. Cargalo.
5. Meta te pide un **PIN de 6 dígitos** (verificación en dos pasos). Anotalo en un lugar seguro.
6. Volvé a **Configuración de la API**, elegí tu número en «De» y copiá dos datos:
   - **Identificador del número de teléfono** (Phone number ID): son solo números.
   - **Identificador de la cuenta de WhatsApp Business** (WABA ID): también solo números.

## Parte 4 — Meta: el token permanente

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

## Parte 5 — Meta: la clave secreta de la app

1. **developers.facebook.com → tu app → Configuración de la app → Básica**.
2. **Clave secreta de la app** → **Mostrar** (te pide tu contraseña de Facebook) → copiala.
   Sirve para que el sistema compruebe que cada mensaje viene de verdad de Meta: **sin ella no se acepta ninguno**.

## Parte 6 — En el panel: cargar todo

1. **Configuración → Integraciones → Conexiones**, punto **2**: pegá
   - ID del número de teléfono,
   - ID de la cuenta de WhatsApp Business,
   - Token de acceso (el permanente),
   - Clave secreta de la app.
2. **Guardar conexiones**. Arriba tiene que decir **WhatsApp (Meta): conectado**.

## Parte 7 — Meta: el webhook (para recibir los mensajes)

1. En el panel, punto **1**: copiá la **URL de devolución de llamada** y el **Token de verificación** (botón copiar).
2. **developers.facebook.com → tu app → WhatsApp → Configuración** → sección **Webhook → Editar**:
   pegá la URL y el token → **Verificar y guardar**. (Si da error, mirá «Si algo falla» abajo.)
3. En la misma pantalla, **Campos del webhook → Administrar** → **messages → Suscribirse**.

## Parte 8 — Probar WhatsApp

1. En el panel, punto **3**: escribí tu celular y **Mandar prueba**. Te llega «Hello World» de Meta.
2. En **Últimos envíos** aparece «Aceptado», o «Rechazado» con el motivo que dio Meta.
3. Escribile desde tu celular al número del local: el mensaje queda marcado como leído (y si el bot está activo, contesta).

## Parte 9 — Publicar la app (para escribirle a cualquiera)

Mientras la app está en modo **Desarrollo**, solo funciona con los números de prueba. Para usarla con clientes:

1. **developers.facebook.com → tu app → Configuración de la app → Básica**: cargá la **URL de la política de
   privacidad** (puede ser una página de la tienda) y un ícono.
2. Arriba, cambiá **Modo de la app: Desarrollo → Activo** (Publicar).
3. **business.facebook.com → Configuración del negocio → Cuentas → Cuentas de WhatsApp → tu cuenta → Configuración
   de pago**: agregá la tarjeta. Sin medio de pago, Meta no manda los avisos que se cobran.

## Parte 10 — La plantilla para los avisos de pedidos

Para escribirle a un cliente que no te escribió en las últimas 24 h (por ejemplo «tu pedido está listo»), Meta
exige una **plantilla aprobada**.

1. **business.facebook.com → WhatsApp Manager → Administrar plantillas → Crear plantilla**.
2. Categoría: **Utilidad**. Nombre: `estado_pedido` (minúsculas y guion bajo). Idioma: **Español (ARG)**.
3. Cuerpo, con las tres variables en este orden:
   > Hola {{1}}, tu pedido {{2}} está {{3}}. Cualquier consulta, respondé este mensaje. ¡Gracias por tu compra!
   - Ejemplos que pide Meta: {{1}} = Juan, {{2}} = 0001-00000015, {{3}} = listo para retirar.
4. **Enviar a revisión**. Tarda de minutos a un día.
5. Cuando diga **Activa / Aprobada**: en el panel, **Bot, avisos e IA** → Plantilla `estado_pedido`, Idioma `es_AR`
   → tildá **Avisos de pedidos** → **Guardar bot, avisos e IA**.

Desde ahí, el aviso sale solo cuando el pedido pasa a confirmado, listo, en camino, entregado o cancelado
(lo cambie quien lo cambie, o si vence solo). El cliente tiene que tener el teléfono cargado en su ficha.

## Parte 11 — La IA (Gemini)

1. Entrá a **aistudio.google.com** con una cuenta de Google (conviene la del negocio).
2. **Get API key → Crear clave de API** (elegí o creá un proyecto) → copiala (empieza con `AIza…`).
3. En el panel, **Conexiones** → **Clave de Gemini** → pegala → **Guardar conexiones**.
4. En **Bot, avisos e IA → Inteligencia artificial**:
   - **Modelo**: dejá *Gemini 2.5 Flash* (rápido y barato). Al lado de cada uno se ve su precio por millón de tokens.
     La lista se revisa sola cada mañana: si Google saca un modelo nuevo aparece «(nuevo)», y si retira el que usás,
     el panel avisa en rojo para que elijas otro. «Buscar ahora» la revisa en el momento.
   - **Precios**: vienen cargados los oficiales, con la fecha en que se verificaron. Google no los publica de forma
     automática, así que si un precio tiene más de 2 meses o el modelo es nuevo, el panel lo marca en naranja para
     que lo confirmes en ai.google.dev/gemini-api/docs/pricing.
   - **Consultas gratis por día**: Google no lo publica; lo ves en **aistudio.google.com → tu proyecto → Límites de
     frecuencia** (la columna RPD, «solicitudes por día», del modelo elegido). Copiá ese número en el panel.
   - **Plan**: *Gratis* mientras no actives la facturación en Google (no se gasta nada; el panel muestra cuánto
     costaría). *Pago* cuando la actives: cada respuesta suma su costo a Gastos → Inteligencia artificial.
   - Tildá **Bot de WhatsApp** → **Guardar bot, avisos e IA**.
5. **Probar Gemini**: a los pocos segundos, actualizá la página. Tiene que decir **Funciona**; si no, muestra el error
   de Google.
6. **Uso de la IA**: ahí ves las consultas de hoy contra el límite gratis (la barra se pone naranja al 70 % y roja al
   90 %), los tokens del mes, cuánto costaría (o cuánto se gastó, con el plan pago) y el promedio por respuesta.
   El día de Google se reinicia a la medianoche de California (04:00 o 05:00 en Argentina). Si se pasa el tope, Google
   deja de contestar hasta esa hora y el bot manda el mensaje fijo.

Sin la clave de Gemini, el bot igual contesta: manda un mensaje fijo («Recibimos tu mensaje, te respondemos en
breve») y la charla sigue a mano desde el WhatsApp del local.

---

## Costos

| qué | cuánto | dónde queda |
|---|---|---|
| Lo que contesta el bot dentro de las 24 h de que el cliente escribió | gratis | — |
| Avisos de pedidos (plantilla de utilidad) | ~US$ 0,026 cada uno | Gastos → WhatsApp (Meta), solo |
| Promociones (plantilla de marketing) | ~US$ 0,06 cada una | Gastos → WhatsApp (Meta), solo |
| Gemini, plan gratis | US$ 0 (con límite de consultas por día) | Integraciones → Uso de la IA (y cuánto costaría) |
| Gemini, plan pago | según el modelo y los tokens | Gastos → Inteligencia artificial, solo |

Los precios de Meta son aproximados para Argentina; si Meta los cambia, se corrigen en la base
(`configuracion_gastos.wa_precio_*`). Para que los gastos en dólares den bien, cargá la cotización en **Gastos**.

## Si algo falla

| qué pasa | qué revisar |
|---|---|
| Meta no verifica el webhook | Que la URL sea la que muestra el panel (la de producción) y el token esté copiado entero, sin espacios. |
| La prueba dice «Malformed access token» o «Invalid OAuth» | El token está mal copiado o es el temporal: generá uno permanente (Parte 4). |
| «Recipient phone number not in allowed list» | La app está en Desarrollo: agregá ese número como destinatario o publicá la app (Parte 9). |
| «Template name does not exist» | El nombre de la plantilla no coincide o todavía no está aprobada; revisá también el idioma (es_AR). |
| Los mensajes llegan pero el bot no contesta | ¿Está tildado **Bot de WhatsApp**? ¿Te suscribiste a **messages** (Parte 7)? ¿Está cargada la clave secreta? |
| El bot contesta siempre el mensaje fijo | Falta la clave de Gemini o es inválida: usá **Probar Gemini**. |
| Probar Gemini da «model not found» | Ese modelo ya no existe: tocá «Buscar ahora» y elegí otro en Modelo. |
| El bot dejó de contestar con IA a la tarde | Se pasó el límite gratis del día: mirá Uso de la IA. Vuelve solo a la medianoche de California. |
| Los avisos no salen | Avisos tildados, plantilla aprobada con su nombre en el panel, y el cliente con teléfono en su ficha. |
