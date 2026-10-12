# Conectar la IA (Gemini), paso a paso

Las claves quedan guardadas en la base y **nadie las puede volver a leer** (ni desde el panel): solo se ve si están cargadas. Para cambiar una, se pega la nueva encima.

1. Entrá a **aistudio.google.com** con una cuenta de Google (conviene la del negocio).
2. **Get API key → Crear clave de API** (elegí o creá un proyecto) → copiala (empieza con `AIza…`).
3. En el panel, **Integraciones → Inteligencia artificial** → **1. La clave** → pegala → **Guardar clave**.
4. **2. Probala → Probar Gemini**: a los pocos segundos, actualizá la página. Tiene que decir **Funciona**; si no, muestra el error
   de Google.
5. En la misma pantalla, **3. Modelo, precio y plan**:
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
   - **Guardar modelo y plan**. Después, en **Integraciones → WhatsApp → Bot y avisos**, tildá **Bot de WhatsApp** → **Guardar bot y avisos**.
6. **Uso de la IA**: ahí ves las consultas de hoy contra el límite gratis (la barra se pone naranja al 70 % y roja al
   90 %), los tokens del mes, cuánto costaría (o cuánto se gastó, con el plan pago) y el promedio por respuesta.
   El día de Google se reinicia a la medianoche de California (04:00 o 05:00 en Argentina). Si se pasa el tope, Google
   deja de contestar hasta esa hora y el bot manda el mensaje fijo.

Sin la clave de Gemini, el bot igual contesta: manda un mensaje fijo («Recibimos tu mensaje, te respondemos en
breve») y la charla sigue a mano desde el WhatsApp del local.

## Costos

| qué | cuánto | dónde queda |
|---|---|---|
| Gemini, plan gratis | US$ 0 (con límite de consultas por día) | Integraciones → Uso de la IA (y cuánto costaría) |
| Gemini, plan pago | según el modelo y los tokens | Gastos → Inteligencia artificial, solo |

## Si algo falla

| qué pasa | qué revisar |
|---|---|
| El bot contesta siempre el mensaje fijo | Falta la clave de Gemini o es inválida: usá **Probar Gemini**. |
| Probar Gemini da «model not found» | Ese modelo ya no existe: tocá «Buscar ahora» y elegí otro en Modelo. |
| El bot dejó de contestar con IA a la tarde | Se pasó el límite gratis del día: mirá Uso de la IA. Vuelve solo a la medianoche de California. |
