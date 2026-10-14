# Parametrización y configuración (a hacer)

Idea del dueño (14/10/2026): separar dos cosas que hoy se mezclan.

| | Parametrización | Configuración |
|---|---|---|
| Qué es | **Qué usa el local**: sí o no | **Cómo** se configura cada cosa encendida |
| Ejemplos | Modo intersucursal · Integraciones · Mercado Pago · WhatsApp · Listas de precios · ¿Hacen devoluciones? · ¿Aceptan pedidos? · ¿Usan página web? | Cómo se conecta WhatsApp · las listas (nombres, %, redondeo) · el QR y el posnet · las zonas de envío |
| Cuándo aparece | Siempre (es el punto de partida) | **Solo si esa parte está encendida** en Parametrización |

Ejemplo: se enciende WhatsApp en Parametrización → recién entonces aparece, en Configuración, «cómo configurar WhatsApp». Si no se usa, no hay nada que mostrar ni que se pueda dejar a medias.

## Qué hay hoy (el germen)

- Módulos que se apagan (`modulos`, Equipo → Módulos): ventas, devoluciones, presupuestos, pedidos, compras, tienda, integraciones, contabilidad… más los nuevos, apagados de fábrica: `cuenta-corriente`, `sucursales`.
- Interruptores sueltos dentro de cada pantalla: `configuracion_tienda.listas_precios_activas`, `mp_modo` (Mercado Pago: no / opcional / obligatorio), `tarjetas_modo`, `cobro_espera_pago`, `wa_bot_activo`…
- La pantalla Configuración (`lib/configuracion.ts`) ya oculta las entradas cuyo módulo está apagado.
- `requisitos()` dice qué falta para usar algo que está encendido.

## Cómo encararlo

1. Una pantalla **Parametrización** con todos los interruptores (los módulos + los sí/no que hoy viven en cada pantalla), agrupados por tema y con su explicación.
2. Cada interruptor tiene sus dependencias (ya existe `modulos.depende`) y una validación de lo que implica apagarlo (ya existe `_modulo_pendientes`).
3. **Configuración** muestra solo lo encendido; cada entrada de `lib/configuracion.ts` apunta a su interruptor.
4. Un local nuevo arranca con lo mínimo (vender, stock, clientes) y el alta guía qué encender.
5. La versión instalada y los pendientes por cliente se leen desde acá (ver `docs/INSTALACIONES.md`).

Pendiente de decidir: qué interruptores son por local y cuáles por sucursal, y si «parametrización» y «configuración» van en el mismo menú o separados.

---

# Otros pendientes anotados

- **Bultos para compras** (14/10/2026): tablas de bultos (packs) de distintos artículos, con sus talles, colores y cantidades, para que una compra por bulto dé de alta el stock sin cargar renglón por renglón. Idea: `bultos` + `bulto_items`; en Compras, «Agregar bulto» expande a renglones que sigue recibiendo `registrar_compra` (el stock solo se toca por esa función).
- **Datos fiscales por sucursal, etapa 2**: certificado de ARCA y punto de venta por razón social, después de probar ARCA con un certificado real con un solo CUIT.
