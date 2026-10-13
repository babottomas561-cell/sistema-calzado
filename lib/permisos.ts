// Permisos del equipo (la lista completa vive en la tabla permisos de la base).
// Acá sirven para armar el menú (este archivo se usa también en el navegador); para cortar el paso
// a una pantalla está lib/exigir.ts. La seguridad de verdad está en la base (tiene_permiso()).

export type Permiso =
  | "ventas.registrar" | "ventas.ver_todas" | "ventas.cambiar_precio" | "pedidos.gestionar"
  | "clientes.ver" | "clientes.editar" | "stock.ver" | "stock.ajustar"
  | "compras.registrar" | "proveedores.gestionar" | "productos.editar" | "precios.editar" | "costos.ver"
  | "ventas.anular" | "devoluciones.fuera_de_plazo" | "informes.ventas" | "informes.stock" | "tablas.editar" | "equipo.administrar" | "promociones.gestionar" | "tienda.editar" | "gastos.gestionar"
  | "contabilidad.ver" | "contabilidad.configurar" | "bitacora.ver" | "ventas.autorizar"
  | "costos.ver_precio_compra" | "costos.ver_ganancia" | "costos.ver_valor_stock" | "tablas.catalogo" | "tablas.medios_pago" | "tablas.depositos"
  | "equipo.personas" | "equipo.roles" | "equipo.modulos" | "equipo.cuentas" | "facturas.emitir" | "facturas.ver" | "ventas.sin_factura";

export const puede = (permisos: readonly string[], ...algunos: Permiso[]) => algunos.some((p) => permisos.includes(p));

// Lo que tiene un rol: sus permisos y los hijos de cada padre que tenga (igual que la base: tiene_permiso y mi_equipo)
export const efectivos = (rol: { todos: boolean; permisos: string[] }, permisos: { codigo: string; padre: string | null }[]) =>
  rol.todos ? permisos.map((p) => p.codigo) : [...new Set([...rol.permisos, ...permisos.filter((p) => p.padre && rol.permisos.includes(p.padre)).map((p) => p.codigo)])];
