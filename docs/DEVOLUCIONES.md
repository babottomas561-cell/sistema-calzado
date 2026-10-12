# Cancelaciones, anulaciones, devoluciones y cambios (diseño, sin construir)

Estado: **propuesta para decidir**. Va junto con la caja diaria (punto C del plan): casi toda
devolución mueve plata de la caja o deja un saldo a favor.

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
| **Recibo** (pendiente) | — | si se devuelve plata cobrada, sale un **recibo de reintegro** (egreso de caja) | no cambia |
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
- **cuánto vale lo devuelto**: lo que **realmente pagó** por esa unidad, no el precio de lista de hoy:
  precio − promoción − su parte del descuento manual ± su parte del % del medio de pago (la misma cuenta
  que ya hace `importe_neto` en los informes).
  - **Con promoción** (regla ya escrita en PROMOCIONES.md): si devuelve uno de un 2×1, se reintegra la
    diferencia entre lo que pagó el grupo y lo que vale lo que se queda, recalculado con `cotizar()`.
- **el stock**: cada unidad se marca **en buen estado** (vuelve al depósito y se puede vender:
  movimiento tipo `devolucion`) o **fallada** (no vuelve a la venta: va a un depósito «Fallados» para
  reclamarle al proveedor, o se da de baja con motivo).
- **la plata** (`p_reintegro`), una de tres:
  1. **en efectivo** → egreso de la caja del día (recibo de reintegro);
  2. **por el mismo medio** (anular el cobro con tarjeta, transferir) → queda registrado con su referencia;
  3. **saldo a favor** del cliente → se usa en una próxima compra como un medio de pago más.
- **el documento**: «Devolución DEV 0001-…» que dice qué volvió, cuánto y cómo se reintegró, y apunta a la venta.

### 5. Cambio (lo más común en calzado y ropa: otro talle, otro color, otro modelo)
Es una devolución + una venta nueva **en una sola operación** (`registrar_cambio`), así nunca queda
una mitad hecha:
- lo que trae vale lo que pagó (caso 4) y queda como crédito;
- lo nuevo se cobra al **precio de hoy** (ver decisión 3);
- si lo nuevo cuesta **más**, paga la diferencia con cualquier medio; si cuesta **menos**, la diferencia
  queda como saldo a favor (o se le devuelve, según la decisión 1);
- el stock: entra lo devuelto y sale lo nuevo, cada uno con su movimiento;
- cambio **del mismo artículo y mismo precio** (solo otro talle o color): diferencia cero, se resuelve con dos toques.

## Lo que hay que agregar a la base (cuando se construya)

| qué | para qué |
|---|---|
| `devoluciones` + `devolucion_items` (→ `venta_items`) | el documento DEV, numerado con `numeradores` |
| `ventas.anulada_en`, `anulada_por`, `motivo_anulacion` | la anulación (los informes filtran) |
| `movimientos_stock.tipo` suma `devolucion` y `anulacion` | el stock sigue cerrando con sus movimientos |
| depósito «Fallados» | lo que vuelve roto no se vende por error |
| `saldos_cliente` (movimientos de cuenta del cliente) | saldo a favor, y más adelante la cuenta corriente y los recibos |
| medio de pago «Saldo a favor» | usar el crédito al cobrar |
| `pedidos.motivo_cancelacion` + vencimiento de *listo_retiro* | medir y liberar stock dormido |
| `configuracion_tienda.dias_cambio` | plazo de cambios que se muestra en la tienda y se controla al hacerlo |
| permisos `ventas.anular` y `ventas.devolver` | no cualquiera devuelve plata |

## Cómo se ve en los informes

- **Ventas netas = ventas − devoluciones** del período (la devolución cuenta el día en que se hace).
- El margen se corrige: lo devuelto en buen estado vuelve al costo original.
- **Informe de devoluciones** por motivo, artículo, **talle** y marca: si un modelo vuelve mucho «por
  talle chico», hay que avisarlo en la ficha («calza chico, pedí uno más»).

## Lo que tiene que decidir el dueño

1. **¿Se devuelve plata o solo cambio / saldo a favor?** Lo habitual en un local: **cambio o saldo
   a favor**, y plata solo si el producto vino fallado.
   Ojo con la **tienda online**: en Argentina, las compras a distancia tienen **derecho de arrepentimiento**
   (10 días, con devolución del dinero), y las tiendas online tienen que mostrar un **«botón de
   arrepentimiento»** visible. Conviene confirmarlo con el contador; si aplica, se agrega a la tienda.
2. **Plazo de cambios**: ¿30 días con ticket? ¿Liquidación o promoción sin cambio?
3. **Precio en un cambio**: lo nuevo, ¿al precio de hoy (lo habitual) o al que pagó por lo anterior?
4. **Fallados**: ¿depósito aparte para reclamar al proveedor, o baja directa?
5. **Quién puede**: ¿la cajera puede hacer cambios pero no devolver plata? (dos permisos separados).
6. **Pedidos**: ¿el cliente puede cancelar solo? ¿En cuántos días se cancela un pedido que nadie retiró?

## Orden sugerido para construirlo

1. Motivo de cancelación + cancelar desde Mi cuenta + vencimiento de pedidos sin retirar (chico, ya sirve).
2. Anular venta del día.
3. Devolución con saldo a favor y fallados (necesita `saldos_cliente`).
4. Cambio en una sola operación desde el punto de venta.
5. Con la caja diaria: reintegros en efectivo como egreso, y recibos.
