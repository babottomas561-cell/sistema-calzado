# Modelo de datos

Todo vive en **una migración**: [`supabase/migrations/20261011000000_inicial.sql`](../supabase/migrations/20261011000000_inicial.sql).
Este documento explica el *porqué*; el SQL es la verdad.

## Idea general: un modelo estrella

Como un modelo semántico de Power BI: **hechos** (lo que pasa, con importes y cantidades) que
apuntan a **dimensiones** (de qué, a quién, cómo).

| hechos | dimensiones |
|---|---|
| `venta_items`, `compra_items`, `pedido_items`, `movimientos_stock`, `pagos` | `productos` (→ `marcas`, `categorias`, `subcategorias`), `variantes` (→ `talles`, `colores`), `clientes`, `proveedores`, `depositos`, `medios_pago`, fecha, canal |

Para analizar (Excel, Power BI, Looker Studio) está la vista **`v_hechos_ventas`**: cada par
vendido con todas sus dimensiones ya unidas, y `importe_neto` / `margen_neto` con el descuento y el
ajuste por medio de pago prorrateados.

```mermaid
erDiagram
  marcas ||--o{ productos : ""
  categorias ||--o{ productos : "rubro"
  categorias ||--o{ subcategorias : ""
  subcategorias ||--o{ productos : "subrubro"
  productos ||--o{ variantes : "talle × color"
  talles ||--o{ variantes : ""
  colores ||--o{ variantes : ""
  productos ||--o{ producto_proveedores : "precio de compra"
  proveedores ||--o{ producto_proveedores : ""
  variantes ||--o{ stock : "por depósito"
  depositos ||--o{ stock : ""
  variantes ||--o{ movimientos_stock : ""
  ventas ||--o{ venta_items : ""
  ventas ||--o{ pagos : ""
  medios_pago ||--o{ pagos : ""
  medios_pago ||--o{ pedidos : ""
  clientes ||--o{ ventas : ""
  clientes ||--o{ pedidos : ""
  clientes ||--o{ interacciones : "CRM"
  pedidos ||--o{ pedido_items : ""
  pedidos ||--o{ pedido_estados : "seguimiento"
  pedidos |o--o| ventas : "al entregarse"
  proveedores ||--o{ compras : ""
  compras ||--o{ compra_items : ""
  variantes ||--o{ venta_items : ""
  variantes ||--o{ compra_items : ""
  variantes ||--o{ pedido_items : ""
```

## El artículo, en dos niveles

- **`productos`** = el **modelo** («Zapatilla Running Pro», Nike, rubro Zapatilla, subrubro
  Running). Lo común a todos los talles y colores: precio de compra, precio de venta, foto,
  descripción, si se publica en la tienda.
- **`variantes`** = el **artículo vendible (SKU)**: modelo + talle + color. Tiene su propio stock,
  su SKU (`ZAP-0003-42-NEG`) y, si hace falta, un precio propio (si es `null`, vale el del modelo).

Talles y colores son **tablas**, no texto: así «Negro» es uno solo, los talles se ordenan bien
(38 < 38.5 < 39 por la columna `orden`) y la tienda puede ofrecer solo los que tienen stock.

## Escalas de talles

`productos.escala` (Adulto, Niños, Bebé) dice qué talles puede tener el artículo: solo los de
`talles.tipo` igual a su escala (lo frena un trigger, y un artículo no cambia de escala si ya tiene
talles de la otra). El nombre del talle es único **por escala**: el 34 de niños y el 34 de adulto son
dos talles distintos. La escala es independiente del género (una juvenil puede ser Niños y llegar al 36).

## Fotos

`producto_imagenes` = la galería de un modelo: `url`, `ruta` (dónde está en el bucket `productos`;
null si es un link externo), `orden` y `principal`. La primera foto nace principal; marcar otra
desmarca la anterior; si se borra la principal, pasa a serlo la primera que queda. Los triggers
copian la url de la principal a `productos.imagen_url`, que es lo que usan `v_catalogo`, el carrito
y las vistas previas. La tienda ve la galería por `v_imagenes_tienda` (solo productos publicados).

## Precios

| dónde | qué es |
|---|---|
| `productos.precio_venta` | precio de lista (sin descuentos) |
| `variantes.precio_venta` | opcional, pisa al del modelo para ese talle/color |
| `productos.precio_compra` | el **último** que se pagó; es el que se usa para el margen |
| `producto_proveedores` | lo que cobra **cada** proveedor: `precio_lista`, `bonificacion_pct` y `precio_compra` (calculado). Uno es el `principal` |
| `venta_items.costo_unitario` | foto del precio de compra al vender (el margen histórico no cambia) |

## Medios de pago: descuentos y recargos

`medios_pago` tiene `ajuste_pct` (−10 = 10 % de descuento; +15 = recargo), `cuotas`, y dónde se
ofrece (`en_mostrador`, `en_tienda`). Una venta puede pagarse con varios:

```
Venta $100.000 → $60.000 en efectivo (−10 %) + $40.000 en 3 cuotas (+15 %)
  pago 1: base 60.000 · ajuste −6.000 · monto 54.000
  pago 2: base 40.000 · ajuste +6.000 · monto 46.000
  ventas: subtotal 100.000 · descuento 0 · ajuste_medio_pago 0 · total 100.000
```

`base` = qué parte del precio cubre; `monto` = lo que entró a caja. El % se **copia** en cada pago
(y en el pedido), así cambiarlo mañana no altera lo ya vendido ni lo prometido. Si la suma de las
`base` no llega al total, la diferencia queda como **saldo sin cobrar**.

## Claves y borrado

- **PK**: `id` autonumérico en todas (salvo `stock`, `(variante_id, deposito_id)`, y `numeradores`).
  Nunca se escribe a mano.
- **FK**: `<tabla_en_singular>_id`, todas con índice.
- **Código visible** (`codigo`): lo que busca la gente. Único, en mayúsculas, se genera solo si
  queda vacío.
- **Borrado**: lo que tiene historia es `restrict` (se desactiva en vez de borrarse). `cascade`
  solo para lo que es parte de otra fila: renglones de venta/compra/pedido, pagos de una venta,
  estados de un pedido, el stock de una variante, las notas de un cliente, los precios de un
  proveedor para un artículo.

## Comprobantes

`ventas`, `pedidos` y `compras` se numeran con la tabla `numeradores` (por tipo y punto de venta,
con `FOR UPDATE`): `0001-00000123`. Las compras guardan además el número y la fecha de la
**factura del proveedor** (`comprobante_proveedor`, `fecha_comprobante`).

## Stock

`stock(variante, depósito)` tiene `cantidad` y `reservado` (comprometido en pedidos web).
`disponible = cantidad − reservado`. Solo lo mueven las funciones (`registrar_venta`,
`registrar_compra`, `ajustar_stock`, `crear_pedido`, `cambiar_estado_pedido`), y cada movimiento
queda en `movimientos_stock`. Siempre: `stock.cantidad = Σ movimientos`.

## Seguridad (Row Level Security)

| quién | ve |
|---|---|
| equipo (`perfiles.rol = 'staff'` + `rol_id`) | lo que su rol permite (`tiene_permiso('…')`); los costos solo con `costos.ver` |
| cliente registrado | su ficha, sus pedidos (con sus renglones y su seguimiento) |
| cualquiera (sin cuenta) | `v_catalogo` (sin costos) y los `medios_pago` habilitados en la tienda |
