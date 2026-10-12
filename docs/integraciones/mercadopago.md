# Conectar Mercado Pago, paso a paso

Las claves quedan guardadas en la base y **nadie las puede volver a leer** (ni desde el panel): solo se ve si están cargadas. Para cambiar una, se pega la nueva encima.

Usá una cuenta de Mercado Pago **a nombre del local** (con su CUIT), no una personal: la plata, las retenciones y los
reportes quedan a nombre de quien sea la cuenta. Al conectarla, el panel muestra de quién es para que lo confirmes.

1. Entrá a **mercadopago.com.ar/developers** con la cuenta del local → **Tus integraciones → Crear aplicación**.
   - Nombre: «Tienda online». Tipo de solución: **Pagos online**. Producto: **Checkout Pro**.
   - Mercado Pago puede pedirte que verifiques tu identidad.
2. Dentro de la aplicación → **Credenciales de producción** → **Activar credenciales** (te pide rubro y la web de la
   tienda) → copiá el **Access Token** (empieza con `APP_USR-`). No compartas este token con nadie.
3. En el panel, **Integraciones → Mercado Pago**: pegalo y **Guardar Mercado Pago**. Arriba tiene que decir
   «Conectado a la cuenta …» con el nombre del local.
4. Avisos de pago: en la aplicación de Mercado Pago → **Webhooks → Configurar notificaciones**:
   - **Modo productivo**, URL: la que muestra el panel («URL para las notificaciones», botón copiar).
   - Eventos: tildá **Pagos** → **Guardar**.
   - Copiá la **clave secreta** que aparece ahí y pegala en el panel («Clave secreta de las notificaciones»).
5. **Cómo cobra la tienda** (en el panel):
   - *Sin Mercado Pago*: como hasta ahora (se coordina por WhatsApp o al retirar).
   - *Mercado Pago como opción*: el cliente elige pagar online o con otro medio.
   - *Solo online*: todo pedido de la tienda se paga con Mercado Pago al confirmarlo.
   - Cuotas máximas: lo que querés ofrecer. El costo de las cuotas lo define tu cuenta de Mercado Pago
     (Tu negocio → Costos → Cuotas).
6. Revisá en **Medios de pago** (Tablas) que «Mercado Pago» esté activo para la tienda.

**Cómo funciona:** el cliente confirma el pedido, paga en Mercado Pago (tarjeta, débito, cuotas o dinero en cuenta) y
vuelve a la tienda. Cuando Mercado Pago avisa que se aprobó, el pedido queda **pagado y confirmado**, el cliente recibe
el aviso por WhatsApp (si está activo) y la **comisión** de Mercado Pago se anota sola en **Gastos → Comisiones y
bancos**. Si el pago no se completó, el pedido sigue reservado y el cliente lo puede pagar después desde su pedido.

- **Cancelar un pedido pagado** (desde el panel) le **devuelve la plata** por Mercado Pago en el momento. Si
  Mercado Pago no puede devolverla, el pedido no se cancela y el panel muestra por qué.
- El cliente **no puede cancelar solo** un pedido ya pagado: tiene que escribirles.
- Un pedido pagado **no se vence solo** aunque no lo retiren.

**Para probar sin plata de verdad:** en la aplicación de Mercado Pago → **Cuentas de prueba**, creá un vendedor y un
comprador; cargá en el panel el Access Token de **prueba** (el panel avisa «cuenta de PRUEBA») y pagá con las tarjetas
de prueba de Mercado Pago. Cuando todo ande, cambiá al Access Token de producción.

## Costos

| qué | cuánto | dónde queda |
|---|---|---|
| Mercado Pago | la comisión de cada pago (depende de tu cuenta, el plazo y las cuotas) | Gastos → Comisiones y bancos, sola |

## Si algo falla

| qué pasa | qué revisar |
|---|---|
| Mercado Pago: «no reconoce el Access Token» | Copialo entero desde Credenciales **de producción** (empieza con APP_USR-). |
| El cliente pagó pero el pedido no figura pagado | Revisá en Mercado Pago → Webhooks que la URL sea la del panel y esté tildado **Pagos**. |
