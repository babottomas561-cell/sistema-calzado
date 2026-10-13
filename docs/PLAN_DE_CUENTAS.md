# Plan de cuentas y contabilidad automática: diseño

> **Estado:** borrador para aprobar. **No está construido.** Las decisiones abiertas están en la sección 1.

## 0. En pocas palabras

- El sistema tiene por detrás un **plan de cuentas** (Activo, Pasivo, Patrimonio, Ingresos, Costos, Gastos), precargado con un modelo para un
  local de ropa y editable.
- **Cada cosa sabe a qué cuenta va**: cada artículo (por rubro o línea), cada medio de pago, cada proveedor, cada concepto de compra y cada
  categoría de gasto. Se configura una vez; lo que no se configura usa el de su grupo.
- **La contabilidad se hace sola**: cada venta, compra, gasto, devolución o ajuste genera su **asiento** (debe y haber) en el momento, desde la base,
  igual que hoy genera el movimiento de stock. El dueño no necesita saber contabilidad; el contador ve el libro diario, el mayor y el balance.
- La **carga de facturas de compra** pasa a ser un documento completo: comprobante del proveedor, conceptos (mercadería u otros), IVA, percepciones
  y la imputación contable a la vista.

---

## 1. Decisiones (tomadas por el dueño el 2026-10-13)

| # | Tema | Decidido |
|---|---|---|
| 1 | Alcance | **Contabilidad completa**, con asientos de doble partida automáticos |
| 2 | Plan de cuentas | **El modelo del sistema** (editable; se puede importar otro) |
| 3 | Proveedores | **Pagos a proveedores y cuenta corriente** (fase C) |
| 4 | CC2 | **Entra a la contabilidad igual**, marcada como interna |
| 5 | Inicio | Desde una fecha de inicio, **con un asiento de apertura** que el sistema arma (stock valorizado, saldos a favor, crédito con proveedores) y el contador completa (caja, bancos, deudas) |

---|---|---|
| 1 | ¿Solo **imputar** cada movimiento a una cuenta (para informes por cuenta) o **contabilidad completa** con asientos de doble partida automáticos (libro diario, mayor, balance)? | **Completa y automática.** Imputar solo es la mitad del trabajo y después hay que rehacerlo |
| 2 | ¿Plan de cuentas modelo del sistema o el de tu contador? | Modelo precargado (sección 2) y **se puede importar el del contador** (planilla) o editar |
| 3 | ¿Llevamos la **cuenta corriente con proveedores** (facturas pendientes de pago y pagos)? Hoy el sistema no registra los pagos a proveedores | **Sí**, con «Pagos a proveedores» (fase C): sin eso, la cuenta Proveedores nunca baja |
| 4 | Las ventas y compras **CC2** (comprobante interno) | Entran a la contabilidad igual que las CC1, marcadas como internas: todo a la vista (como en ARCA, sección 9 del diseño) |
| 5 | ¿Desde cuándo empieza la contabilidad? | Desde una **fecha de inicio** con un **asiento de apertura** (stock valorizado, caja, deudas): lo carga el contador |

---

## 2. El plan de cuentas

Árbol con **código jerárquico** (`1`, `1.1`, `1.1.01`). Solo las cuentas **imputables** (las hojas) reciben movimientos; las demás agrupan.

```
1 ACTIVO
  1.1 Activo corriente
    1.1.01 Caja (efectivo)                1.1.05 Mercaderías (stock)
    1.1.02 Bancos                          1.1.06 IVA crédito fiscal
    1.1.03 Mercado Pago                    1.1.07 Percepciones sufridas
    1.1.04 Tarjetas a cobrar               1.1.08 Crédito con proveedores (fallados devueltos)
2 PASIVO
  2.1 Pasivo corriente
    2.1.01 Proveedores                     2.1.04 Sueldos y cargas a pagar
    2.1.02 IVA débito fiscal               2.1.05 Impuestos a pagar
    2.1.03 Saldos a favor de clientes      2.1.06 Señas de pedidos web
3 PATRIMONIO NETO
    3.1.01 Capital · 3.1.02 Resultados acumulados · 3.1.03 Resultado del ejercicio
4 INGRESOS
    4.1.01 Ventas de ropa · 4.1.02 Ventas de calzado · 4.1.03 Ventas de accesorios · 4.1.04 Envíos cobrados
    4.2.01 Descuentos y redondeos otorgados (resta)
5 COSTOS
    5.1.01 Costo de mercadería vendida (por línea, como las ventas) · 5.1.04 Mercadería fallada dada de baja
6 GASTOS
    6.1.01 Alquiler y servicios · 6.1.02 Sueldos · 6.1.03 Publicidad · 6.1.04 Comisiones y bancos · 6.1.05 Impuestos
    6.1.06 Envíos · 6.1.07 Insumos (bolsas, etiquetas) · 6.1.08 Servicios digitales · 6.1.09 Otros
```

Tabla `cuentas`: `id`, `codigo` (único, jerárquico), `nombre`, `tipo` (activo/pasivo/patrimonio/ingreso/costo/gasto), `padre_id`, `imputable`,
`activa`, `orden`. Reglas en la base: el código del hijo empieza con el del padre; una cuenta con movimientos no se borra (se desactiva, regla 4);
solo las imputables reciben movimientos. Se edita en **Contabilidad → Plan de cuentas** (agregar, renombrar, mover, desactivar) e **importar** de
una planilla (código, nombre, tipo).

---

## 3. Qué cuenta usa cada cosa (asignaciones)

Se busca de lo particular a lo general: la primera que esté cargada gana. Así alcanza con configurar los grupos y solo lo raro va aparte.

| Qué | Dónde se configura | Cuentas | Si no tiene |
|---|---|---|---|
| **Artículo** | ficha del artículo | ventas · costo · mercadería | la del **rubro** → la de la **línea** (Ropa, Calzado, Accesorios) → la general |
| **Sucursal** | Configuración → Sucursales | su caja (efectivo) y, si se quiere, sus ventas por separado | la Caja general |
| **Medio de pago** | Tablas → Medios de pago | fondos (Caja, Banco, Mercado Pago, Tarjetas a cobrar); «Saldo a favor» → Saldos de clientes | según el tipo (Efectivo → Caja…) |
| **Proveedor** | ficha del proveedor | la de deuda (Proveedores) y el **concepto de compra** de siempre | Proveedores |
| **Concepto de compra** (nuevo) | Tablas → Conceptos de compra | la de lo que se compra: Mercaderías, Insumos, Servicios, Bienes de uso… | — (es obligatorio elegirlo) |
| **Categoría de gasto** | Gastos → Categorías | la de gasto | Otros gastos |
| **Impuestos** | Contabilidad → Configuración | IVA crédito, IVA débito, percepciones | las del plan modelo |

Columnas nuevas: `productos.cuenta_venta_id / cuenta_costo_id` (opcionales), `categorias.cuenta_venta_id / cuenta_costo_id`, una tabla
`cuentas_por_linea`, `medios_pago.cuenta_id`, `proveedores.cuenta_id / concepto_compra_id`, `gasto_categorias.cuenta_id` y la tabla
`conceptos_compra (nombre, cuenta_id, es_mercaderia, alicuota_iva)`. Cada FK con su índice (regla 4).

**Control:** una pantalla **«Qué falta asignar»** lista lo que cae en la cuenta general, para que el contador lo revise.

---

## 4. Asientos automáticos

Tablas `asientos` (fecha, número correlativo, sucursal, concepto, origen: venta/compra/gasto/…, documento, circuito CC1/CC2, `anulado_por`) y
`asiento_lineas` (cuenta, debe, haber, detalle). **La base los genera** dentro de las mismas funciones que ya registran cada operación (regla 1):
no hay forma de hacer una venta sin su asiento. Un trigger controla que **debe = haber** y que solo se usen cuentas imputables y activas.
Los asientos **no se editan ni se borran**: una anulación genera el **contra-asiento**.

| Operación | Debe | Haber |
|---|---|---|
| **Venta** (por cada pago) | Caja / Banco / Mercado Pago / Tarjetas a cobrar / Saldos de clientes | Ventas (por línea, neto) · IVA débito fiscal (si es factura de responsable inscripto) |
| ↳ su costo | Costo de mercadería vendida | Mercaderías |
| ↳ descuento, redondeo | se restan de la venta (o Descuentos otorgados, si el contador lo prefiere aparte) | |
| **Anulación** | contra-asiento de la venta y de su costo | |
| **Devolución** (saldo a favor) | Ventas · IVA débito (si se facturó: nota de crédito) · Mercaderías (lo bueno vuelve) | Saldos de clientes · Costo de mercadería vendida |
| **Cambio** | devolución + venta nueva (dos asientos) | |
| **Compra de mercadería** | Mercaderías (a costo) · IVA crédito fiscal · Percepciones | Proveedores (o Caja, si se pagó en el momento) |
| **Compra de otro concepto** | la cuenta del concepto (Insumos, Servicios…) · IVA crédito | Proveedores |
| **Pago a proveedor** (fase C) | Proveedores | Caja / Banco / Mercado Pago |
| **Gasto** | la cuenta de su categoría | Caja / Banco / Proveedores |
| **Ajuste de stock** (inventario, pérdida) | Diferencias de inventario | Mercaderías (o al revés) |
| **Fallado dado de baja** | Mercadería fallada dada de baja | Mercaderías |
| **Fallado devuelto al proveedor** | Crédito con proveedores | Mercaderías |
| **Envío cobrado** | Caja / Mercado Pago | Envíos cobrados |
| **Comisión de Mercado Pago** (ya va a Gastos) | Comisiones y bancos | Mercado Pago |

Los importes salen de lo que ya guarda cada operación (costo copiado al vender, pagos con su ajuste, total de la compra): **la contabilidad no
vuelve a calcular precios**, solo los ordena.

**Cierre de ejercicio** (fase D): refundición de resultados al patrimonio con un asiento, por fecha de cierre configurable.

---

## 5. La carga de facturas de compra, rediseñada

Hoy es una búsqueda de modelos con un resumen al costado. Pasa a verse como lo que es: **el comprobante del proveedor**, de arriba a abajo.

```
┌ Comprobante del proveedor ───────────────────────────────────────────────────────────┐
│ Proveedor [Buscar ▾]  CUIT 30-71234567-1 · Responsable inscripto      Circuito ◉ CC1  ○ CC2 │
│ Tipo [Factura A ▾]  Punto de venta [0003]  Número [00012345]  Fecha [13/10]  Vence [12/11] │
└──────────────────────────────────────────────────────────────────────────────────────┘
┌ Mercadería (por curva, como hoy) ─────────────────────────────────────────────────────┐
│ Remera básica · talles × colores · costo c/u · subtotal                                 │
└──────────────────────────────────────────────────────────────────────────────────────┘
┌ Otros conceptos ──────────────────────────────────────────────────────────────────────┐
│ [Concepto ▾ Insumos]  Bolsas con logo           IVA 21 %     $ 45.000                    │
│ + Agregar concepto                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘
┌ Totales ─────────────────────────────┐  ┌ Imputación contable (se genera sola) ──────┐
│ Neto 21 %            $ 1.200.000      │  │ Mercaderías              $ 1.155.000 D     │
│ Neto 10,5 %                $ 0        │  │ Insumos                     $ 45.000 D     │
│ IVA 21 %               $ 252.000      │  │ IVA crédito fiscal         $ 252.000 D     │
│ Percepción IVA          $ 36.000      │  │ Percepciones sufridas       $ 36.000 D     │
│ Percepción IIBB         $ 18.000      │  │ Proveedores            $ 1.506.000   H     │
│ Total               $ 1.506.000       │  └────────────────────────────────────────────┘
│ Total de la factura [ 1.506.000 ] ✓   │
└──────────────────────────────────────┘          [Guardar como borrador]  [Registrar compra]
```

- **Tipo de comprobante:** Factura A/B/C, Nota de crédito, Nota de débito, Remito (sin importes fiscales), Ticket. La letra sugiere qué se
  carga: en A se discrimina IVA; en B/C el IVA va dentro del costo (no se recupera).
- **CC1/CC2** (como en ARCA): CC1 pide los datos fiscales y suma al libro de IVA compras; CC2 es la carga simple de hoy.
- **Mercadería** sigue cargándose por curva (lo que ya funciona); **otros conceptos** son renglones libres con su cuenta.
- **El costo de la mercadería** se calcula según la categoría del local (neto si es responsable inscripto con factura A; con IVA si no), y se puede
  corregir.
- **Control contra el total de la factura** como hoy, pero ahora por importes fiscales: neto, IVA y percepciones tienen que dar el total.
- **Duplicados:** no deja cargar dos veces el mismo comprobante del mismo proveedor.
- **Borrador:** una factura larga se puede guardar a medias y seguir después.
- **Vencimiento y estado de pago** (fase C): impaga / pagada en parte / pagada.
- Atajos y escaneo como en la caja (el lector suma de a una unidad, como hoy).

---

## 6. Informes contables (Contabilidad)

- **Libro diario** (por fecha, con filtros por origen y circuito).
- **Mayor** de una cuenta (movimientos y saldo).
- **Balance de sumas y saldos** a una fecha.
- **Estado de resultados** por cuenta (reemplaza a la larga el «Resultado» de hoy, que suma ventas − costo − gastos sin cuentas).
- **Libro de IVA compras y ventas** (con ARCA).
- Exportación a planilla para el contador (y formatos de importación de sistemas contables comunes, si el contador usa alguno).

---

## 7. Permisos

`contabilidad.ver` (informes) y `contabilidad.configurar` (plan de cuentas, asignaciones, apertura y cierre). Los asientos no tienen políticas de
escritura (solo las funciones, regla 5). El Vendedor no ve nada de esto (tiene costos).

---

## 8. Fases

| Fase | Qué | Tamaño |
|---|---|---|
| A | Plan de cuentas (modelo, edición, importación) y asignaciones con «Qué falta asignar» | mediano |
| B | Asientos automáticos de ventas, anulaciones, devoluciones, cambios, gastos, ajustes y fallados; libro diario y mayor | grande |
| C | Carga de facturas de compra rediseñada (comprobante, conceptos, IVA, CC1/CC2, borrador) con sus asientos; **pagos a proveedores** y cuenta corriente | grande |
| D | Balance, estado de resultados, apertura y cierre de ejercicio, exportación | mediano |

Las fases B y C se cruzan con ARCA (IVA débito al facturar, libro de IVA): se construyen para que funcionen con o sin ARCA activado.

---

## 9. Riesgos

| Riesgo | Cómo se cubre |
|---|---|
| Asientos que no cuadran | Trigger: debe = haber o la operación entera se deshace. Prueba que recorre todo el historial |
| Cambiar una asignación después | No toca asientos viejos (como el % de un medio de pago, regla 10); solo los nuevos |
| Ventas anteriores a la contabilidad | Fecha de inicio + asiento de apertura; lo anterior queda fuera |
| El dueño no sabe contabilidad | No hace falta: el plan modelo y las asignaciones por grupo cubren todo; el contador revisa «Qué falta asignar» |

---

## 10. Comprobantes y su asiento modelo (pedido del dueño, 2026-10-13)

En lugar de escribir en el código qué asiento hace cada operación, cada **tipo de comprobante** tiene un **asiento modelo** editable (como en los sistemas de
gestión): una lista de renglones que dicen *qué cuenta* va *al debe o al haber* y *con qué importe*. La base arma el asiento de cada comprobante aplicando su
modelo. Cambiar la contabilidad de un tipo de comprobante es editar su modelo, no el programa.

### Tipos de comprobante

| Circuito | Comprobante | Stock | IVA | Cuenta corriente | Fondos |
|---|---|---|---|---|---|
| Ventas | Factura A/B/C (CC1) · Comprobante interno (CC2) | sale | débito (CC1) | cliente, si queda saldo | entra (cobro en el momento) |
| Ventas | Nota de crédito A/B/C · Devolución interna | vuelve | revierte | saldo a favor | — |
| Ventas | **Recibo de cobro** (paga una deuda de cuenta corriente) | — | — | baja la deuda del cliente | entra |
| Ventas | Pedido web cobrado por adelantado | — (reservado) | — | cobro anticipado | entra |
| Compras | Factura A/B/C del proveedor (CC1) · Compra interna (CC2) | entra (si es mercadería) | crédito (CC1, A) | proveedor | — |
| Compras | Nota de crédito / débito del proveedor | sale / — | revierte / suma | proveedor | — |
| Compras | **Orden de pago** (pago a proveedor) | — | — | baja la deuda con el proveedor | sale |
| Compras | Remito del proveedor | entra | — | — | — (sin asiento hasta la factura) |
| Tesorería | Gasto · Movimiento de fondos (depósito al banco, retiro de caja) · Ajuste | — | — | — | entra / sale |
| Stock | Ajuste de inventario · Fallado de baja · Fallado al proveedor | según | — | crédito con proveedor | — |

Tabla `tipos_comprobante` (código, nombre, circuito, letra, CC1/CC2, qué afecta, numerador propio y su **asiento modelo**). Los comprobantes que ya
existen (ventas, devoluciones, compras, gastos) pasan a tener su tipo; los nuevos son **recibo de cobro**, **orden de pago**, **notas de crédito/débito
de proveedor** y **movimiento de fondos**.

### El asiento modelo

`modelos_asiento` y sus renglones (`modelo_asiento_lineas`):

| columna | qué |
|---|---|
| `orden` | el orden en el asiento |
| `lado` | debe / haber |
| `cuenta` | **fija** (una cuenta del plan) o **variable**: la del medio de pago de cada pago, la de ventas de cada artículo, la de costo de cada artículo, la del proveedor, la del concepto de compra, la de la categoría de gasto, la de la caja de la sucursal |
| `importe` | qué importe toma: total, neto por alícuota, IVA por alícuota, costo de lo vendido, percepción, descuento, redondeo, envío, monto de cada pago… |
| `por_cada` | si el renglón se repite por cada pago, cada artículo o cada alícuota (y se agrupa por cuenta) |

Ejemplo — **Factura B de venta (responsable inscripto)**:

| lado | cuenta | importe | por cada |
|---|---|---|---|
| debe | la del medio de pago | monto del pago | pago |
| haber | la de ventas del artículo | neto del artículo | artículo |
| haber | IVA débito fiscal (fija) | IVA | alícuota |
| haber | Envíos cobrados (fija) | neto del envío | — |
| debe | la de costo del artículo | costo | artículo |
| haber | Mercaderías (fija) | costo | artículo |

Ejemplo — **Recibo de cobro**: debe la del medio de pago (monto de cada pago) · haber Deudores por ventas (total).
Ejemplo — **Orden de pago**: debe la del proveedor (total) · haber la del medio con que se paga (monto de cada pago).

Reglas en la base: un modelo tiene que **cuadrar** (debe = haber con cualquier importe: se controla al guardar y al aplicarlo); un asiento que no cuadra
deshace la operación. El sistema trae **un modelo para cada tipo**, armado con el plan modelo; el contador lo puede ajustar. Cambiar un modelo afecta
los comprobantes nuevos, no los ya asentados.

### Qué cambia en las fases

- **Fase A** (hecha, sin publicar): plan de cuentas y asignaciones. Se ajustan los **códigos** al formato que pida el dueño (ver abajo).
- **Fase B**: tipos de comprobante, asientos modelo y el armado automático para lo que ya existe (ventas, devoluciones, cambios, compras, gastos, ajustes,
  fallados); libro diario y mayor.
- **Fase C**: recibos de cobro y cuenta corriente de clientes; órdenes de pago y cuenta corriente de proveedores; notas de crédito/débito de proveedor;
  movimientos de fondos; carga de compras rediseñada.

### Códigos de las cuentas (hecho)

Como en Infomanager: **numéricos de largo fijo**, sin puntos. De fábrica 7 dígitos con la máscara `{1,1,2,3}`: `1 · 1 · 01 · 001`.
`1101001` = Caja (1 Activo · 1 corriente · 01 Disponibilidades · 001 Caja). Cada nivel completa con ceros al final: `1100000` agrupa, `1101000` agrupa
las disponibilidades y `1101001` es una cuenta que recibe movimientos. El padre se deduce solo del código. El formato (cantidad de niveles y de dígitos
de cada uno) es configurable en `configuracion_contable.mascara` y se puede cambiar mientras los códigos que ya hay entren en el nuevo formato.
**Pendiente de confirmar:** que el formato de Infomanager sea ese (cantidad de dígitos por nivel); si no, se ajusta la máscara y el plan modelo, y la
importación acepta el plan exportado de Infomanager.
