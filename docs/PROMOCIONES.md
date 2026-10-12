# Promociones (construido: ver supabase/migrations/20261011232500_promociones_y_cotizar.sql)

2×1, 3×2, "segundo par al 50 %", "20 % off en toda la marca", "precio especial de liquidación".
Este documento fija **cómo se modelan** y **cómo se reflejan** en la tienda, el presupuesto, el
pedido y la venta, para construirlo sin rehacer nada.

## La idea central: un solo "motor de precios"

Hoy el precio se calcula en varios lugares (carrito, `crear_pedido`, punto de venta). Con promociones
eso no se sostiene: el 2×1 tiene que dar **exactamente lo mismo** en la tienda, en el mensaje de
WhatsApp, en el presupuesto y en la venta. Entonces:

```
cotizar(p_items, p_canal, p_medio_pago)  →  renglones con: precio de lista, promoción aplicada,
                                             descuento de la promoción, precio final
                                            + totales (subtotal, promociones, % del medio, total)
```

- La **base** la calcula (regla 8: el navegador nunca decide un precio).
- La llaman el carrito (para mostrar), `crear_pedido`, `registrar_venta`, los presupuestos y el
  armado del mensaje de WhatsApp. **Conviene construir `cotizar()` junto con presupuestos/WhatsApp**,
  aunque todavía no haya promociones: después solo se le suma la regla.

## Tablas

```
promociones
  id, nombre ("2do par al 50 %"), tipo, desde, hasta, activa,
  en_tienda, en_mostrador,            -- dónde vale
  acumula_medio_pago boolean,         -- ¿se suma el 10 % del efectivo encima del 2×1?
  mezcla boolean,                     -- ¿el 2×1 vale combinando modelos distintos del alcance?
  prioridad int,                      -- si dos promos podrían tocar el mismo par, gana la de mayor prioridad
  -- parámetros según el tipo:
  lleva int, paga int,                -- nxm: lleva 2 paga 1 (2×1), lleva 3 paga 2 (3×2)
  descuento_pct numeric,              -- segunda_unidad (50 = el 2do al 50 %) y porcentaje (20 = 20 % off)
  precio_fijo numeric                 -- precio_fijo (liquidación)
  check: tipo in ('nxm', 'segunda_unidad', 'porcentaje', 'precio_fijo') y los parámetros de cada tipo

promocion_alcances                    -- a qué artículos aplica (una fila por cosa)
  id, promocion_id (cascade: es parte de la promo),
  marca_id | categoria_id | subcategoria_id | producto_id   -- exactamente uno (check), FKs restrict + índice
  excluir boolean                     -- "toda Nike menos la Pegasus"
```

Permiso nuevo: `promociones.gestionar` (Administrador y Encargado). Pantalla en Catálogo → Promociones.

## Cómo se aplica (reglas fijas, para que siempre dé lo mismo)

1. Se expanden los pares (2 unidades del mismo talle = 2 pares).
2. Para cada promoción vigente, de mayor a menor prioridad, se toman los pares de su alcance que
   **todavía no tienen promoción** (un par tiene una sola promoción: no se apilan).
3. Según el tipo:
   - **nxm** (lleva N, paga M): pares ordenados del más caro al más barato, en grupos de N; en cada
     grupo completo, los N−M **más baratos** salen gratis. Con `mezcla = false`, los grupos son por
     modelo.
   - **segunda_unidad**: de a pares; el más barato de cada par lleva el `descuento_pct`.
   - **porcentaje**: cada par, `descuento_pct` off.
   - **precio_fijo**: el par vale `precio_fijo` (si es menor que el de lista).
4. Orden de los descuentos: **lista → promoción → descuento manual del vendedor → % del medio de
   pago**. El tope de descuento del cajero se mide sobre lo que queda después de la promoción (la
   promo no "gasta" su tope). Si la promo no acumula con el medio de pago, el % del medio se calcula
   sin esos renglones.

## Qué se guarda

- `venta_items`, `pedido_items` y `presupuesto_items` (cuando exista): `promocion_id` (FK restrict +
  índice) y `descuento_promo`. `precio_unitario` sigue siendo el de **lista**: así los informes
  muestran cuánto costó cada promoción.
- `ventas`: `descuento_promociones`, y el `check` pasa a
  `total = subtotal − descuento − descuento_promociones + ajuste_medio_pago`.
- Un **pedido o presupuesto respeta la promoción con la que se hizo** aunque después termine (igual
  que hoy respeta el % del medio de pago), hasta su vencimiento.

## Dónde se ve

| dónde | qué muestra |
|---|---|
| Catálogo de la tienda | etiqueta en la tarjeta: "2×1", "2do al 50 %" (vista pública sin costos) |
| Página del producto | "Llevando 2 pares de Nike, el 2do a mitad de precio (pueden ser modelos distintos)" |
| Carrito | renglón "Promo 2×1: −$X" calculado por `cotizar()`; aviso "Te falta 1 par para el 2×1" |
| Mensaje de WhatsApp | cada par con su precio final y la promoción aplicada |
| Presupuesto / pedido | la promoción y su descuento, con la fecha hasta la que se respeta |
| Punto de venta | se aplica sola al agregar los pares; la vendedora la ve pero no la puede sacar |
| Informes | "Ventas por promoción": pares, vendido y **cuánto se resignó** (suma de `descuento_promo`) |

## Devoluciones con promoción

Si devuelven **uno** de los pares de un 2×1, se reintegra la diferencia entre lo que pagó el grupo
y lo que vale **lo que se queda** recalculado con `cotizar()`. Es la regla habitual en comercios y
evita que devuelvan el par que se pagó y se queden gratis con el otro.
