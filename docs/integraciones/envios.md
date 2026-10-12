# Envíos en Tucumán (Uber), paso a paso

1. **Integraciones → Envíos → 1. Zonas de envío**: cargá cada zona con lo que paga el cliente (por ejemplo
   «Centro» $ 2.500, «Yerba Buena» $ 4.000). En «qué abarca» poné los barrios, para que el cliente elija bien.
   Sin precio queda «a coordinar» (por ejemplo, «Interior»). Mientras no haya ninguna zona, el envío se coordina.
2. En la tienda, al elegir **Envío a domicilio**, el cliente elige su zona y ve el envío sumado al total. Si paga con
   Mercado Pago, paga productos + envío. El precio lo pone la base (no el navegador).
3. **Se paga antes de enviar** (Integraciones → Envíos → 2, prendido): un pedido con envío no pasa a «Enviado» hasta
   que esté pagado. Si pagó con Mercado Pago, ya figura; si transfirió, en el pedido → **Pago** → **Registrar pago
   recibido** (monto y n.º de operación). Apagalo solo si a veces cobran contra entrega con un cadete propio.
4. Para mandarlo: **Pedidos → el pedido → tarjeta Envío**:
   - **Copiar datos para Uber** (pedido, dirección del local, nombre, teléfono y dirección del cliente) y **Abrir Uber**.
   - En Uber elegí **Envíos** (moto o auto según el paquete; en auto hasta 20 kg), pegá los datos y pedilo.
   - Volvé al pedido y anotá **lo que costó** y el **link de seguimiento** → **Anotar envío**. El cliente ve el
     seguimiento en su pedido, y el costo va solo a **Gastos → Envíos**.
5. El **Resultado** del mes muestra los envíos cobrados a los clientes contra lo que costaron.

## Uber Direct (pedir el Uber solo)

1. Entrá a **direct.uber.com** con una cuenta de Uber y creá la **cuenta de empresa del local** (nombre, dirección
   del local, datos de facturación y una tarjeta). Uber habilita Uber Direct solo en algunos países: si no te deja,
   escribile a Uber para empresas para pedir el acceso en Argentina.
2. En el panel de Uber Direct → **Developer**: copiá el **Customer ID**, el **Client ID** y el **Client Secret**.
3. En esta pantalla → **4. Envíos automáticos → Uber Direct**: pegalos → **Guardar** → **Probar conexión**. Tiene que
   decir «Conectado».
4. Uber pide una **prueba piloto** con envíos reales antes de habilitar producción: coordinala con tu contacto de Uber.

## Andreani (envíos al interior)

1. Pedile a **Andreani** una cuenta comercial con **acceso a la API** (lo habilita tu ejecutivo de cuenta; suelen
   pedir un mínimo de envíos por mes).
2. Te dan: **usuario y contraseña de la API**, tu **código de cliente** y el **número de contrato** (el de envíos a
   domicilio).
3. En esta pantalla → **4. Envíos automáticos → Andreani**: cargalos → **Guardar** → **Probar conexión**.

Con las credenciales probadas, pedir el envío solo (Uber cuando el pedido está listo, Andreani con su etiqueta y
seguimiento) se suma al sistema sin cambiar esta pantalla.

## Costos

| qué | cuánto | dónde queda |
|---|---|---|
| Envíos (Uber) | lo que cobra cada viaje | Gastos → Envíos, al anotarlo en el pedido |
