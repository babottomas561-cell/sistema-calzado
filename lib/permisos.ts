// Permisos del equipo (la lista completa vive en la tabla permisos de la base).
// Acá sirven para armar el menú (este archivo se usa también en el navegador); para cortar el paso
// a una pantalla está lib/exigir.ts. La seguridad de verdad está en la base (tiene_permiso()).

export type Permiso =
  | "ventas.registrar" | "ventas.ver_todas" | "ventas.cambiar_precio" | "pedidos.gestionar"
  | "clientes.ver" | "clientes.editar" | "stock.ver" | "stock.ajustar"
  | "compras.registrar" | "proveedores.gestionar" | "productos.editar" | "precios.editar" | "costos.ver"
  | "informes.ventas" | "informes.stock" | "tablas.editar" | "equipo.administrar" | "promociones.gestionar" | "tienda.editar";

export const puede = (permisos: readonly string[], ...algunos: Permiso[]) => algunos.some((p) => permisos.includes(p));
