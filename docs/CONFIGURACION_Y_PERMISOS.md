# Configuración, módulos y permisos — diseño para aprobar

Estado: **diseño, sin construir**. Pedido del dueño (2026-10-13), con sus respuestas: **sí a todo** (un solo lugar de
Configuración, módulos que bloquean de verdad, permisos más finos, alcance por sucursal/depósito, bitácora y plantillas por rubro).

## 1. Cómo está hoy (y dónde duele)

- 24 permisos fijos (tabla `permisos`); roles editables en `/admin/equipo` (`roles.permisos text[]`, `roles.todos`, tope de descuento).
  La base controla con `tiene_permiso()`; las pantallas con `exigir()`; el menú con `puede()`.
- Configuración repartida: Tienda, Integraciones, Impresión, Tablas, Cuentas, Módulos (nuevo), cada una en su pantalla.
- Menú por persona (favoritos, ocultos) y módulos apagados (`modulos_desactivados`): **solo ocultan del menú**.

Problemas:
1. Apagar un módulo no bloquea nada (la dirección sigue abierta, la base sigue aceptando).
2. Permisos gruesos: «Ver costos» mezcla costos, ganancia y valor de stock; «Productos» exige también «Ver costos».
3. Sin alcance: todo el equipo ve todos los depósitos y sucursales.
4. Sin bitácora de quién cambió permisos o configuración.
5. Configuración difícil de encontrar; cada instalación arranca de cero.
6. Una versión nueva con secciones nuevas tiene que convivir con instalaciones atrasadas (regla 23).

## 2. Principios

- **La base manda.** Todo lo de acá se aplica en funciones, RLS y triggers; esconder en pantalla es solo comodidad.
- **Capas, de afuera hacia adentro**: *módulo encendido* → *permiso del rol* → *alcance (sucursal/depósito)* → *preferencia personal*.
  Una capa de afuera nunca la abre una de adentro: una preferencia no da permisos; un permiso no vale si el módulo está apagado.
- **Aditivo.** Migraciones que agregan; el código viejo sigue andando (clientes con versiones atrasadas).
- **Configuración como datos**, no como código ni variables de Vercel (excepto lo que ya es secreto: regla 16).

## 3. Un solo lugar: Configuración (`/admin/configuracion`)

Una pantalla de entrada con **buscador** y tarjetas por tema, que lleva a las pantallas que ya existen (no se reescriben):

| Sección | Contiene hoy en | Permiso |
|---|---|---|
| Negocio | datos legales, identidad, sucursales (nuevo) | `configuracion.negocio` |
| Módulos | `/admin/equipo/modulos` | `equipo.administrar` |
| Equipo y permisos | `/admin/equipo` (personas, roles) | `equipo.administrar` |
| Ventas y caja | impresión, medios de pago, redondeo, topes | `tablas.editar` |
| Catálogo | tablas maestras, escalas, líneas | `tablas.editar` |
| Tienda online | portada, envíos, legales | `tienda.editar` |
| Integraciones | WhatsApp, Mercado Pago, Instagram, ARCA, correo, dominio | `tienda.editar` / `equipo.administrar` |
| Contabilidad | plan de cuentas, asignaciones | `contabilidad.configurar` |
| Mi cuenta | menú personal, impresión personal, contraseña | cualquiera del equipo |

- Cada tarjeta muestra **estado** (configurado / falta / apagado) y solo aparece si el módulo está encendido y la persona tiene permiso.
- El buscador busca también dentro de los ajustes (índice estático en `lib/configuracion.ts`: texto, sinónimos, ruta).
- En el menú lateral queda **Configuración** como un solo ítem (hoy son cinco), más «Mi menú» para lo personal.

## 4. Módulos que bloquean de verdad

### Modelo
`lib/modulos.ts` pasa a ser **el catálogo único**: clave, nombre, grupo, `fijo`, dependencias, permisos que aporta, rutas.
La tabla `modulos_desactivados` se reemplaza (con migración aditiva) por `modulos (clave, activo, cambiado_por, cambiado_en)`;
una clave sin fila = **encendida** si el módulo es de fábrica, y se decide por plantilla de rubro en una instalación nueva.

### Qué significa «apagado»
1. **Menú y buscador**: no aparece (ya hecho).
2. **Pantallas**: `exigir()` también chequea el módulo → redirige con aviso «Esta parte no está activa».
3. **Base**: las funciones de ese módulo empiezan con `_modulo_activo('presupuestos')` y fallan con mensaje claro; los triggers de
   asientos y avisos que dependen de él se saltean. Los **datos no se tocan** (se puede volver a prender).
4. **Permisos**: en la edición de roles no aparecen los permisos de módulos apagados; los que ya estaban quedan guardados pero inactivos.
5. **Tienda y API pública**: lo apagado no se ofrece (pedidos, presupuestos, arrepentimiento…).

### Dependencias
Apagar no puede dejar el sistema incoherente. Cada módulo declara de qué depende:
- Pedidos web ← Tienda online; Arrepentimientos ← Pedidos; Contabilidad ← (nada, pero **no se apaga** una vez iniciada: ya tiene asientos);
  Fallados ← Stock; Reposición ← Compras; Etiquetas ← Productos; ARCA ← Datos fiscales.
- Al apagar uno, la pantalla lista lo que se apaga con él y pide confirmar; al encender, enciende sus dependencias.
- Lo **fijo** (Ventas, Productos, Stock, Clientes, Tablas, Equipo, Configuración) no se apaga.

### Versiones
Una sección nueva trae en su migración la fila con su estado inicial. Una instalación atrasada simplemente no la tiene: sin fila y sin
código, no pasa nada. Queda registrado en la ficha de la instalación qué módulos tiene encendidos.

## 5. Permisos más finos

### Principios
- Permiso = **una acción o una cosa que se ve**, con verbo: `ver`, `crear`, `editar`, `anular`, `exportar`, `aprobar`.
- Nombre `modulo.recurso.accion`. Los 24 actuales se **migran sin perder nada**: cada rol conserva lo que podía (mapa viejo→nuevos).
- Los permisos no son editables por el cliente (lista fija por versión); los **roles** sí.

### Qué se separa (propuesta)

| Hoy | Pasa a |
|---|---|
| `costos.ver` | `costos.ver_precio_compra`, `costos.ver_ganancia`, `costos.ver_valor_stock` |
| `productos.editar` (+ exige costos) | `productos.crear`, `productos.editar`, `productos.publicar_tienda`, `productos.fotos` (ya no exigen costos) |
| `ventas.registrar` | queda; se suman `ventas.descuento_manual` (con tope del rol) y `ventas.reimprimir` |
| `ventas.ver_todas` | `ventas.ver_propias` / `ventas.ver_todas` / `ventas.exportar` |
| `clientes.ver`/`editar` | `clientes.ver`, `clientes.crear`, `clientes.editar`, `clientes.exportar`, `clientes.notas_internas` |
| `informes.ventas`/`stock` | por informe: `informes.ventas`, `informes.stock`, `informes.resultado`, `informes.exportar` |
| `tablas.editar` | `tablas.catalogo`, `tablas.medios_pago`, `tablas.depositos` |
| `equipo.administrar` | `equipo.personas`, `equipo.roles`, `equipo.modulos`, `equipo.cuentas` |
| `contabilidad.*` | + `contabilidad.asientos_manuales`, `contabilidad.cierre` |
| (nuevo) | `configuracion.negocio`, `bitacora.ver` |

Se hace en tandas para no romper: primero se agregan los nuevos y se rellenan los roles existentes, después las funciones y pantallas pasan a
usar los nuevos, y recién en una versión posterior se retiran los viejos (regla de versiones).

### Roles y tope de descuento
- Se mantiene: roles editables, tope de descuento por rol. Se suma **tope de devolución sin autorización** (monto) y **«requiere autorización
  de un encargado»** para descuentos por encima del tope (PIN de encargado) — *opcional, a decidir*.
- Pantalla de roles con **matriz** (permisos en filas, roles en columnas), filtrada por módulos encendidos, con «¿qué ve este rol?» (vista previa del menú).
- «Probar como…» (ver el sistema como un rol) para el Administrador: solo lectura, sin acciones.

## 6. Alcance por sucursal y depósito

Depende de la tabla `sucursales` ya diseñada (docs/ARCA.md): domicilio, depósito, punto de venta, caja, `empresa_id`.

- `perfiles.sucursal_id` queda como **sucursal base**, y una tabla `usuario_sucursales (usuario_id, sucursal_id)` dice **a cuáles tiene acceso**
  (una persona puede cubrir dos locales). El rol puede marcar «ve todas las sucursales» (Administrador, Encargado general).
- Qué se filtra por alcance: ventas, caja, pedidos, stock por depósito, compras, informes. Lo que es del negocio entero (catálogo, clientes,
  proveedores) **no** se filtra.
- Se aplica con una función `mis_sucursales()` usada por RLS y por las funciones de operación (`registrar_venta` valida que el depósito sea de
  su alcance). Las vistas (`v_stock`, `v_hechos_ventas`) se filtran por ella.
- Con **una sola sucursal** todo esto es invisible: no se muestra ningún selector.
- Transferencias entre sucursales (stock de un depósito a otro) quedan como pedido aparte; este diseño solo deja el alcance listo.

## 7. Bitácora

`bitacora (id, fecha, usuario_id, modulo, accion, entidad, entidad_id, antes jsonb, despues jsonb, ip_hint)` — **solo se agrega**
(trigger que frena editar y borrar, como `asientos`).

Se registra: cambios de roles y permisos, alta/baja/cambio de rol de personas, módulos encendidos/apagados, configuración del negocio,
integraciones (**nunca el valor de una clave**, solo «se cambió»), medios de pago, precios masivos, anulaciones, ajustes de stock, cambios de
impresión y de plan de cuentas. Los datos de operación (ventas, stock) ya tienen su propio historial; no se duplican.

- Pantalla `/admin/configuracion/bitacora` (`bitacora.ver`): filtros por persona, módulo y fecha; «ver el cambio» muestra antes/después.
- Se escribe **desde las mismas funciones/triggers** que hacen el cambio (si no se puede registrar, no se cambia).
- Retención: sin borrado automático; exportable.

## 8. Plantillas por rubro y arranque de una instalación

- `plantillas_instalacion` (en el repositorio, no en la base): para cada **perfil** (p. ej. «Ropa de hombre», «Calzado», «Accesorios») define
  módulos encendidos, roles con sus permisos, tablas maestras de ejemplo, medios de pago típicos y textos de la tienda.
- El alta de cliente (`npm run instalaciones -- alta`, regla 23) recibe `--plantilla` y la aplica **una vez**; después la instalación es
  suya (cambios propios no se pisan al actualizar). Las actualizaciones **no** reaplican la plantilla.
- Un asistente «Primer día» en Configuración muestra lo que falta (datos del negocio, impresión, medios de pago, primer rol, primera persona).
- Otros rubros (peluquerías…) serán productos separados (regla 18): las plantillas son de este producto.

## 9. Preferencias personales (Mi cuenta)

Una sola pantalla «Mi cuenta» para el equipo: menú (favoritos, ocultos — ya hecho), impresión personal (papel, copias, modo — ya existe),
contraseña, aspecto. Ninguna preferencia da permisos. Se guardan por usuario (`menu_usuario`, `impresion_por_usuario`); se unifican
en la pantalla, no en la tabla.

## 10. Plan por etapas

1. **Catálogo único de módulos** (`lib/modulos.ts`) + tabla `modulos` + `_modulo_activo()`; `exigir()` y funciones de base lo respetan;
   dependencias en la pantalla de módulos. *(La más chica y la que más valor da ya.)*
2. **Bitácora** (tabla inmutable + registro en roles, módulos, personas, configuración).
3. **Permisos finos**: migración aditiva, matriz de roles, vista previa del menú, «probar como».
4. **Configuración como entrada única** con buscador y estados.
5. **Sucursales y alcance** (junto con la fase 2 de ARCA / `empresas`).
6. **Plantillas por rubro** y asistente «Primer día», integrado al script de alta.

Cada etapa: migración nueva, pruebas pgTAP (incluida una que verifique que un rol **no** gana nada con la migración), tipos regenerados,
`npm run revisar`, y se publica después de probar en el piloto.

## 11. Decisiones (del dueño, 2026-10-13)

1. **PIN de encargado**: SÍ. Un descuento sobre el tope del rol (o una devolución sobre el tope) se autoriza con el PIN de un encargado en la
   misma caja; queda en la bitácora quién autorizó. El PIN se guarda con hash (nunca legible), es por persona y se cambia desde Mi cuenta;
   lo valida una función de la base (`autorizar_con_pin`), no la pantalla. Permiso nuevo: `ventas.autorizar` (lo tiene el Encargado).
2. **Costos en tres permisos** (`costos.ver_precio_compra`, `costos.ver_ganancia`, `costos.ver_valor_stock`): SÍ.
3. **Apagar un módulo con datos vigentes**: se **bloquea** hasta cerrarlos (p. ej. presupuestos vigentes, pedidos abiertos); la pantalla dice qué falta cerrar.
4. **«Probar como…»**: solo el Administrador, solo lectura.
5. **Bitácora**: se guarda **para siempre en la base de cada cliente** (sin borrado automático; no sale de su instalación).
6. **Transferencias entre sucursales**: **entran ahora**, dentro de la etapa 5 (ver 12).
7. **Nombres de los permisos**: los de la tabla de la sección 5 quedan aprobados.

## 12. Transferencias entre sucursales (entra en la etapa 5)

- `transferencias (id, origen_deposito_id, destino_deposito_id, estado, creada_por, enviada_en, recibida_por, recibida_en, notas)` y
  `transferencia_items (transferencia_id, variante_id, cantidad, cantidad_recibida)`.
- Funciones (únicas formas de mover stock entre depósitos, regla 1): `crear_transferencia`, `enviar_transferencia` (sale del origen: movimiento
  `transferencia_salida`, queda «en camino», no cuenta como disponible en ningún lado), `recibir_transferencia` (entra al destino con lo que
  efectivamente llegó; la diferencia queda como faltante para resolver con `ajustar_stock`/fallados), `cancelar_transferencia` (solo antes de enviar,
  o vuelve al origen si está en camino).
- Alcance: quien envía necesita acceso al origen; quien recibe, al destino. Permisos: `stock.transferir`, `stock.recibir_transferencia`.
- El stock de cada variante sigue siendo igual a la suma de sus movimientos (verificación de la regla de stock); asientos contables si corresponde
  (mismo costo, entre depósitos de la misma empresa: sin efecto; entre empresas distintas: se resuelve con el contador, queda marcado).
- Pantalla `/admin/transferencias` (módulo propio, apagable) y etiquetas/lista de preparación para imprimir.

## 13. Avance

- **Etapa 1 (módulos con bloqueo): hecha y publicada.**
- **Etapa 2 (bitácora): hecha** (migración `20261018300000_bitacora`).
- **Etapa 3 (permisos finos y PIN): hecha** (migraciones `20261018400000_permisos_finos` y `20261018500000_pin_encargado`):
  - Padre → hijos: quien tiene el padre tiene todos sus hijos (nadie pierde nada); un rol nuevo puede tener solo algunos. `tiene_permiso()` y
    `mi_equipo()` los expanden. Hechos: **costos** (`ver_precio_compra`, `ver_ganancia`, `ver_valor_stock`), **tablas** (`catalogo`, `medios_pago`,
    `depositos`) y **equipo** (`personas`, `roles`, `modulos`, `cuentas`; integraciones, dominio y fiscal siguen con el padre).
  - Las vistas, políticas y funciones pasaron al permiso fino que protegen (reescritas con una migración controlada y probada).
  - Pantalla de Equipo: hijos anidados bajo su padre, «¿qué ve este rol?» y matriz de permisos por rol.
  - **PIN de encargado**: permiso `ventas.autorizar` (Encargado), PIN con hash en `pines_autorizacion` (nadie lo lee), `autorizar_descuento()`
    (5 intentos / 10 min), autorización de 10 minutos y de un solo uso consumida por `registrar_venta`, con registro en la bitácora. En la caja
    aparece al pasar el tope; el PIN se pone en Mi PIN de encargado (`/admin/mi-cuenta`).
  - **Diferido a propósito**: `productos.*` (crear/editar/publicar/fotos) porque exige una vista de productos sin costos (hoy la tabla `productos` solo la
    lee quien ve precios de compra); `clientes.notas_internas`, `*.exportar` y `ventas.reimprimir` (todavía no existen esas funciones);
    «Probar como…» (vista previa real con datos: hoy hay «¿qué ve este rol?», que muestra el menú); tope y PIN para devoluciones y presupuestos
    (hoy solo descuentos de la caja).

Siguen: etapa 4 (Configuración como entrada única con buscador), 5 (sucursales, alcance y transferencias), 6 (plantillas por rubro y «Primer día»).
