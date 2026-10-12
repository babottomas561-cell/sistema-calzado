# Cancelaciones, anulaciones, devoluciones y cambios (diseño, sin construir)

Estado: **decisiones del dueño tomadas** (ver «Decidido», abajo); falta construirlo. Va junto con la caja diaria (punto C del plan), aunque
una devolución **no saca plata de la caja**: siempre deja saldo a favor.

## La regla de fondo: un documento hecho no se toca

Ni se borra ni se edita: se emite **otro documento que lo compensa** y queda enlazado al original.
Es lo mismo que hace una nota de crédito con una factura (acá sin validez fiscal). Así:

- el número del comprobante nunca se reutiliza ni queda "un hueco";
- los informes del mes pasado no cambian solos: la devolución cuenta **el día en que se hizo**;
- el stock sigue cerrando: `stock = suma de movimientos` (regla 1), porque todo entra con su movimiento.

## Los documentos y en qué estado puede estar cada uno

| documento | hoy | qué le puede pasar | cómo queda el original |
|---|---|---|---|
| **Presupuesto** | vigente → convertido / anulado | se **anula** (ya existe). Si ya se convirtió, lo que se cancela es su venta | no cambia: queda «convertido» como historia |
| **Pedido web** | pendiente … listo_retiro → entregado / cancelado | se **cancela** antes de entregarse (ya existe: libera la reserva). Entregado ya es una venta | «cancelado» con motivo y quién lo hizo |
| **Venta** (comprobante) | emitida | se **anula** entera (error de carga) o recibe **devoluciones** parciales o totales | estado calculado: *emitida · devuelta en parte · devuelta · anulada* |
| **Recibo** (pendiente) | — | no se anula: una devolución deja saldo a favor, no saca plata | no cambia |
| **Devolución** (nuevo) | — | documento propio, numerado `DEV 0001-00000001`, apunta a la venta | — |

## Los cinco casos

### 1. Se anula un presupuesto
Ya resuelto (`anular_presupuesto`). No toca stock ni plata.

### 2. Se cancela un pedido web antes de entregarlo
Ya resuelto en lo básico (`cambiar_estado_pedido(..., 'cancelado')`): libera lo reservado y el stock
vuelve a estar disponible en la tienda. **Falta:**
- **motivo obligatorio** de una lista (se arrepintió · no lo retiró a tiempo · sin stock · otro): sirve para medir;
- que **el cliente** pueda cancelar desde *Mi cuenta* mientras esté *pendiente* o *confirmado*;
- **vencimiento**: si está *listo para retirar* y pasan N días sin retirarlo, se cancela solo (libera el stock);
- si el cliente **pagó por adelantado** (seña o transferencia, cuando existan los recibos): al cancelar
  se elige devolverle la plata (recibo de reintegro) o dejarle **saldo a favor**.

### 3. Se anula una venta (error al cargarla)
Para cuando la venta no tendría que existir: se cargó dos veces, se eligió mal el producto.
`anular_venta(p_venta, p_motivo)`:
- vuelve **todo** el stock (movimiento nuevo tipo `anulacion`, al mismo costo de la venta);
- revierte los pagos: si hubo efectivo, sale de la caja del día;
- la venta queda **anulada** con su número (no se reutiliza) y los informes la excluyen;
- solo **el mismo día** (con la caja abierta) y con un permiso nuevo `ventas.anular`. Pasado ese día
  ya no es un error de carga: es una devolución (caso 4).

### 4. Devolución (el cliente trae algo)
`registrar_devolucion(p_venta, p_items, p_reintegro, p_motivo)`:
- **qué**: renglones de la venta original y cuántas unidades (nunca más de las vendidas menos las ya
  devueltas). Sin la venta original (sin ticket) no hay devolución, solo un ajuste de stock.
- **cuánto vale lo devuelto**: lo que **realmente pagó** por esa unidad (ver «Cuánto vale lo devuelto»).
- **el stock**: cada unidad se marca **en buen estado** (vuelve al Local y se puede vender:
  movimiento tipo `devolucion`) o **fallada** (va a Fallados, ver más abajo).
- **la plata**: siempre **saldo a favor** del cliente (decidido). Se usa en otra compra como un medio de pago más.
- **el documento**: «Devolución DEV 0001-…» que dice qué volvió, cuánto y cómo se reintegró, y apunta a la venta.

### 5. Cambio (lo más común en calzado y ropa: otro talle, otro color, otro modelo)
Es una devolución + una venta nueva **en una sola operación** (`registrar_cambio`), así nunca queda
una mitad hecha:
- lo que trae vale lo que pagó (caso 4) y queda como crédito;
- lo nuevo se cobra al **precio de hoy** (ver decisión 3);
- si lo nuevo cuesta **más**, paga la diferencia con cualquier medio; si cuesta **menos**, la diferencia
  queda como saldo a favor;
- el stock: entra lo devuelto y sale lo nuevo, cada uno con su movimiento;
- cambio **del mismo artículo** (solo otro talle o color): **sin diferencia, aunque el precio haya subido**
  (decidido). Se resuelve con dos toques y no genera saldo. El precio de hoy rige solo si cambia a otro modelo.

## Cuánto vale lo devuelto (la cuenta, con números)

**Regla:** vale lo que el cliente **pagó de verdad** por esa unidad. Se calcula en tres pasos,
siempre con los datos **de esa venta** (sus precios y sus promociones), nunca con los de hoy.

**Paso 1 — la promoción, por grupo.** Si la unidad entró en una promoción de grupo (2×1, 2do al 50 %),
no se mira la unidad sola: lo devuelto vale **lo que pagó el grupo − lo que vale lo que se queda**,
recalculando lo que se queda con la misma promoción y los mismos precios de la venta (aunque la
promo ya haya terminado). Con promociones de % por marca o precio fijo, cada unidad vale lo suyo.

| promoción | compró | pagó | devuelve | se queda (recalculado) | vale lo devuelto |
|---|---|---|---|---|---|
| 2×1 | dos remeras de $20.000 | $20.000 | una | una sola, sin promo: $20.000 | **$0** |
| 2do al 50 % | dos de $20.000 | $30.000 | una | una sola: $20.000 | **$10.000** |
| 2do al 50 %, precios distintos | zapatilla $120.000 + ojota $80.000 (la más barata al 50 %) | $160.000 | la zapatilla | la ojota sola: $80.000 | **$80.000** |
| 2do al 50 %, precios distintos | igual | $160.000 | la ojota | la zapatilla sola: $120.000 | **$40.000** |

Así nadie paga una y se lleva dos: si devuelve justo «la que pagó», lo que se queda deja de estar en promoción.

**Paso 2 — el descuento manual**, repartido en proporción al importe de cada renglón.
Ej.: venta de $100.000 con $10.000 de descuento manual → cada peso de mercadería pagó $0,90.

**Paso 3 — el % del medio de pago**, también en proporción:
- **descuentos** (efectivo −10 %): **se restan**. Si pagó $90.000 en efectivo algo de $100.000, el saldo es
  de $90.000; si no, comprar en efectivo y devolver sería ganarle un 10 % al local.
- **recargos** (cuotas +15 %): **no se devuelven** (decidido). Pagó $115.000 en cuotas algo de $100.000 →
  saldo de $100.000. El recargo es el costo de la financiación, que el local ya le pagó a la tarjeta.

**Redondeo:** cada devolución se redondea al peso, y la última unidad de una venta se lleva lo que
falte. Lo devuelto en total **nunca** puede pasar lo que se cobró en esa venta (la base lo controla).

## Casos borde

- **Pagos mixtos** (mitad efectivo −10 %, mitad cuotas +15 %): el paso 3 usa el % ponderado de esa venta.
- **Venta sin cliente** (consumidor final): el saldo a favor necesita un dueño. Al devolver se carga al
  cliente en el momento (nombre y WhatsApp, como en el punto de venta) y el saldo queda en su ficha.
- **Usar el saldo a favor**: es un medio de pago con 0 % (no tiene descuento ni recargo), así no se
  aplica dos veces un descuento que ya se restó. Se puede combinar con otro medio en la misma venta.
- **Devuelve una parte y después otra**: cada devolución recalcula con lo que **queda** en ese momento;
  la suma nunca pasa lo pagado.
- **Pedido web entregado**: es una venta como cualquier otra; el plazo cuenta desde la **entrega**.
- **Inflación**: el saldo a favor queda en pesos; si los precios suben, alcanza para menos. Por eso el
  cambio del mismo modelo no paga diferencia (abajo) y el saldo tiene vencimiento.

## Lo que hay que agregar a la base (cuando se construya)

| qué | para qué |
|---|---|
| `devoluciones` + `devolucion_items` (→ `venta_items`) | el documento DEV, numerado con `numeradores` |
| `ventas.anulada_en`, `anulada_por`, `motivo_anulacion` | la anulación (los informes filtran) |
| `movimientos_stock.tipo` suma `devolucion` y `anulacion` | el stock sigue cerrando con sus movimientos |
| `depositos.vendible` + depósito «Fallados» | lo que vuelve roto no se vende por error |
| `fallados` (salida de cada unidad: arreglado / proveedor / baja) | la bandeja y el crédito con el proveedor |
| `saldos_cliente` (movimientos de cuenta del cliente) | saldo a favor, y más adelante la cuenta corriente y los recibos |
| medio de pago «Saldo a favor» | usar el crédito al cobrar |
| `pedidos.motivo_cancelacion` + vencimiento de *listo_retiro* | medir y liberar stock dormido |
| `configuracion_tienda.dias_cambio`, `dias_saldo`, `dias_retiro` | plazo de cambios, vencimiento del saldo a favor y de los pedidos sin retirar |
| permisos `ventas.anular` y `ventas.devolver` | quién anula y quién hace devoluciones y cambios |

## Cómo se ve en los informes

- **Ventas netas = ventas − devoluciones** del período (la devolución cuenta el día en que se hace).
- El margen se corrige: lo devuelto en buen estado vuelve al costo original; lo fallado pasa a Fallados
  y, si se da de baja, a **pérdidas**.
- **Saldos a favor pendientes**: cuánto le debe el local en mercadería a sus clientes (es una deuda).
- **Informe de devoluciones** por motivo, artículo, **talle** y marca: si un modelo vuelve mucho «por
  talle chico», hay que avisarlo en la ficha («calza chico, pedí uno más»).

## Decidido (2026-10-12)

1. **La plata depende del caso:**
   - pedido **sin pagar** que se cancela → no hay nada que devolver (solo se libera la reserva);
   - **toda devolución** (y un pedido ya pagado que se cancela) → **saldo a favor**, nunca efectivo.
     Así una devolución nunca saca plata de la caja.
   - Pendiente de confirmar con el contador: el **derecho de arrepentimiento** de las compras online
     (10 días, con reintegro del dinero). Si aplica, es la única excepción: compra web, dentro de los
     10 días → se puede elegir reintegrar en vez de saldo a favor.
2. **Plazo de cambios: 30 días, configurable** (`configuracion_tienda.dias_cambio`, en Tienda online).
   Pasado el plazo, la devolución no se deja hacer (salvo quien tenga el permiso de excepción).
3. **En un cambio, lo nuevo va al precio de hoy**, salvo que sea **el mismo artículo** en otro talle o
   color: ese cambio es directo, sin diferencia aunque el precio haya subido.
4. **Fallados:** depósito «Fallados» no vendible + bandeja con tres salidas (sección siguiente).
6. **El saldo a favor no incluye el recargo** de las cuotas (sí resta los descuentos del medio).
7. **El saldo a favor vence**, con plazo configurable (por defecto 6 meses, `configuracion_tienda.dias_saldo`).
   El cliente lo ve en Mi cuenta con su fecha de vencimiento.

**Propuestas por defecto (cambiables):** un pedido *listo para retirar* que nadie retira se cancela
solo a los **7 días** (configurable) y libera el stock. Devoluciones y cambios los puede hacer quien
vende (no sale plata de la caja); **anular una venta** solo Encargado y Administrador.
5. **El cliente puede cancelar su pedido solo**, desde Mi cuenta, con un paso de confirmación
   («¿Seguro que querés cancelar el pedido 0001-…?»). Mientras el local no lo haya empezado a preparar.

## Fallados: cómo se maneja

**El problema hoy:** hay un solo depósito («Local») y la tienda suma el stock de **todos** los depósitos.
Un depósito «Fallados» común haría aparecer lo roto como disponible en la tienda y en el punto de venta.

**La propuesta:** los depósitos pasan a tener una marca **`vendible`**. «Local» es vendible; «Fallados»
nace **no vendible**. Todo lo que ofrece o reserva stock (tienda, punto de venta, pedidos, reposición)
mira solo los vendibles; el informe de stock muestra lo fallado aparte, valorizado al costo.

**Cómo llega algo a Fallados** (siempre con su movimiento, el stock sigue cerrando):
- **devolución** de un cliente marcada «vino fallado» → entra directo a Fallados (no al Local);
- **se encontró fallado en el local** (se descosió en la percha, vino mal de fábrica) → «Mover a
  fallados» desde la ficha o el stock, con motivo.

**La bandeja de fallados** (una pantalla): cada unidad con de dónde vino (cliente y venta, o encontrado
en el local), el motivo, la fecha y el proveedor del artículo. Tres salidas posibles:

| salida | qué pasa | stock | cuenta |
|---|---|---|---|
| **Se arregló** | vuelve a la venta | pasa de Fallados a Local (transferencia) | nada |
| **Se le devuelve al proveedor** | sale del local, queda el reclamo anotado (proveedor, fecha, nota) | sale de Fallados (`devolucion_proveedor`) | queda como **crédito con el proveedor** a su costo, para descontar de la próxima factura |
| **Se da de baja** | no tiene arreglo ni reclamo | sale de Fallados (ajuste con motivo) | **pérdida** a costo, en el informe de pérdidas |

Así el dueño ve en un lugar cuánto tiene «parado» en fallados y qué proveedor le manda más fallas.

## Orden sugerido para construirlo

1. **HECHO (2026-10-12):** motivo de cancelación + el cliente cancela desde Mi cuenta (con confirmación) + vencimiento de pedidos sin retirar (migración `cancelacion_de_pedidos`).
2. Anular venta del día.
3. Depósitos vendibles + bandeja de fallados.
4. Devolución con saldo a favor (necesita `saldos_cliente`) y plazo configurable.
5. Cambio en una sola operación desde el punto de venta.
6. Con la caja diaria: recibos (y, si el contador lo confirma, el reintegro por arrepentimiento online).
