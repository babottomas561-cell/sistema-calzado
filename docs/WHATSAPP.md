# Conectar WhatsApp (Meta) y la IA (Gemini)

Todo se carga desde el panel: **Tienda online → Conexiones: WhatsApp e IA**. No hace falta tocar Vercel.
Las claves quedan guardadas en la base y nadie las puede volver a leer (ni desde el panel): solo se ve si están
cargadas. Si hay que cambiarlas, se pega la nueva encima.

## 1. En Meta (una sola vez)

1. **business.facebook.com**: crear la cuenta del negocio (con los datos del local). Conviene verificarla.
2. **developers.facebook.com** → Mis apps → Crear app → tipo *Empresa* → agregarle el producto **WhatsApp**.
3. WhatsApp → **Configuración de la API**: agregar el número del local (conviene uno aparte, solo para esto).
   Ahí están el **ID del número de teléfono** y el **ID de la cuenta de WhatsApp Business**.
4. **Token permanente**: Configuración del negocio → Usuarios → **Usuarios del sistema** → Agregar (rol Admin) →
   Generar token, con los permisos `whatsapp_business_messaging` y `whatsapp_business_management`.
   (El token que aparece en la pantalla de la API es temporal: vence en 24 h.)
5. **Clave secreta de la app**: tu app → Configuración → Básica → Clave secreta de la app (botón Mostrar).
6. Cargar un medio de pago en la cuenta de WhatsApp (Meta cobra los avisos que manda el local; ver abajo).

## 2. En el panel

1. Pegar: ID del número, ID de la cuenta, token permanente y clave secreta. **Guardar conexiones**.
2. Copiar la **URL** y el **token de verificación** que muestra el panel.
3. En Meta → WhatsApp → **Configuración** → Webhook → Editar: pegar los dos datos → Verificar y guardar.
   Después, en *Campos del webhook*, suscribirse a **messages**.
4. **Mandar prueba** a tu celular: tiene que llegar «Hello World». (Mientras la app está en modo desarrollo, el
   número tiene que estar agregado como destinatario en la pantalla de la API.) En «Últimos envíos» se ve si Meta
   lo aceptó o por qué lo rechazó.

## 3. El bot y los avisos

- **Bot**: en *Datos de la tienda* → WhatsApp, activar el bot. Con la **clave de Gemini** (aistudio.google.com →
  Get API key) contesta con stock, precios, el estado del pedido (solo al teléfono de ese cliente) y los datos del
  local. Sin la clave, contesta un mensaje fijo y la charla sigue a mano.
- **Avisos de pedidos**: en Meta → WhatsApp → Plantillas, crear una de categoría **Utilidad**, en español, con 3
  variables, por ejemplo:
  > Hola {{1}}, tu pedido {{2}} está {{3}}. ¡Gracias por tu compra!

  Cuando Meta la aprueba, poner su nombre en *Datos de la tienda* y activar los avisos. Salen solos cuando el
  pedido pasa a confirmado, listo, en camino, entregado o cancelado.

## Costos

- Lo que contesta el bot dentro de las 24 h de que el cliente escribió: **gratis**.
- Avisos del local (plantillas): Meta los cobra por mensaje (utilidad ~US$ 0,026; marketing ~US$ 0,06).
  El sistema los suma solo como gasto **WhatsApp (Meta)** en Gastos. Los precios se pueden corregir en la base
  (`configuracion_gastos.wa_precio_*`) si Meta los cambia.
- Gemini tiene un plan gratis con límite de consultas por día; si se pasa a pago, cargarlo como gasto fijo.
