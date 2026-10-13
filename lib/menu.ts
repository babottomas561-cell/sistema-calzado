// Catálogo del menú del panel (lo usan el menú y la pantalla de módulos).
import { BadgePercent, BookText, Boxes, ChartBar, FileText, House, MessageCircleMore, Package, PackagePlus, PackageSearch, PackageX, Plug, Printer, Receipt, Scale, ScanBarcode, Settings2, ShieldCheck, ShoppingBag, Store, Tags, Truck, Undo2, Users, Wallet, type LucideIcon } from "lucide-react";
import type { Permiso } from "@/lib/permisos";

// El menú del panel. Cada ítem aparece si la persona tiene alguno de sus permisos (la base controla igual lo que puede hacer),
// si su módulo está encendido en esta instalación (Equipo → Módulos; los `fijo` no se apagan) y si no lo ocultó ella misma.
// La clave de un ítem es su ruta.
export type Item = { href: string; texto: string; icono: LucideIcon; permisos: Permiso[]; fijo?: true };
export const GRUPOS: { titulo?: string; items: Item[] }[] = [
  { items: [{ href: "/admin", texto: "Inicio", icono: House, permisos: [], fijo: true }] },
  { titulo: "Operación", items: [
    { href: "/admin/ventas", texto: "Ventas", icono: Receipt, permisos: ["ventas.registrar", "ventas.ver_todas"], fijo: true },
    { href: "/admin/devoluciones", texto: "Cambios y devol.", icono: Undo2, permisos: ["ventas.registrar", "ventas.ver_todas"] },
    { href: "/admin/presupuestos", texto: "Presupuestos", icono: FileText, permisos: ["ventas.registrar", "ventas.ver_todas"] },
    { href: "/admin/pedidos", texto: "Pedidos", icono: ShoppingBag, permisos: ["pedidos.gestionar"] },
    { href: "/admin/arrepentimientos", texto: "Arrepentimientos", icono: Scale, permisos: ["pedidos.gestionar"] },
    { href: "/admin/compras", texto: "Compras", icono: PackagePlus, permisos: ["compras.registrar"] },
  ] },
  { titulo: "Catálogo", items: [
    { href: "/admin/productos", texto: "Productos", icono: Package, permisos: ["costos.ver_precio_compra"], fijo: true },
    { href: "/admin/stock", texto: "Stock", icono: Boxes, permisos: ["stock.ver"], fijo: true },
    { href: "/admin/etiquetas", texto: "Etiquetas", icono: ScanBarcode, permisos: ["stock.ver", "productos.editar"] },
    { href: "/admin/precios", texto: "Precios", icono: Tags, permisos: ["precios.editar", "proveedores.gestionar"] },
    { href: "/admin/promociones", texto: "Promociones", icono: BadgePercent, permisos: ["promociones.gestionar"] },
    { href: "/admin/fallados", texto: "Fallados", icono: PackageX, permisos: ["stock.ver"] },
    { href: "/admin/reposicion", texto: "Reposición", icono: PackageSearch, permisos: ["compras.registrar"] },
  ] },
  { titulo: "Análisis", items: [
    { href: "/admin/informes", texto: "Informes", icono: ChartBar, permisos: ["informes.ventas", "informes.stock", "gastos.gestionar"] },
    { href: "/admin/gastos", texto: "Gastos", icono: Wallet, permisos: ["gastos.gestionar"] },
    { href: "/admin/contabilidad", texto: "Contabilidad", icono: BookText, permisos: ["contabilidad.ver", "contabilidad.configurar"] },
  ] },
  { titulo: "Contactos", items: [
    { href: "/admin/clientes", texto: "Clientes", icono: Users, permisos: ["clientes.ver"], fijo: true },
    { href: "/admin/seguimientos", texto: "Seguimientos", icono: MessageCircleMore, permisos: ["clientes.ver"] },
    { href: "/admin/proveedores", texto: "Proveedores", icono: Truck, permisos: ["proveedores.gestionar", "compras.registrar"] },
  ] },
  { titulo: "Configuración", items: [
    { href: "/admin/tienda", texto: "Tienda online", icono: Store, permisos: ["tienda.editar"] },
    { href: "/admin/integraciones", texto: "Integraciones", icono: Plug, permisos: ["tienda.editar"] },
    { href: "/admin/tablas", texto: "Tablas", icono: Settings2, permisos: ["tablas.editar", "tablas.catalogo", "tablas.medios_pago", "tablas.depositos"], fijo: true },
    { href: "/admin/impresion", texto: "Impresión", icono: Printer, permisos: ["tablas.editar"] },
    { href: "/admin/equipo", texto: "Equipo", icono: ShieldCheck, permisos: ["equipo.administrar", "equipo.personas", "equipo.roles", "equipo.modulos", "equipo.cuentas"], fijo: true },
  ] },
];

// La configuración se junta en un solo ítem del menú (las pantallas siguen en GRUPOS: sirven para buscar, favoritos y módulos)
export const CONFIGURACION = { href: "/admin/configuracion", texto: "Configuración", icono: Settings2, permisos: [] as Permiso[] };
export const ITEMS = GRUPOS.flatMap((g) => g.items);
