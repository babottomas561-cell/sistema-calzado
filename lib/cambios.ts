// La venta tal como la ve quien hace un cambio o una devolución (venta_para_cambio, en la base): sus renglones
// con el precio pagado y cuánto ya se devolvió, sin costos. Sirve aunque la venta la haya hecho otro vendedor.
export type VentaParaCambio = {
  id: number; comprobante: string; fecha: string; anulada: boolean; cliente_id: number | null; cliente: string | null; visible: boolean;
  items: { id: number; producto_id: number; nombre: string; talle: string; color: string; cantidad: number; precio_unitario: number;
    descuento_promo: number; promocion: string | null; devuelto: number }[];
};

// Los renglones que todavía se pueden devolver
export const renglonesDevolvibles = (v: VentaParaCambio) => v.items
  .map((i) => ({ id: i.id, producto_id: i.producto_id, nombre: i.nombre, marca: null, talle: i.talle, color: i.color, precio: Number(i.precio_unitario),
    promocion: Number(i.descuento_promo) > 0 ? i.promocion : null, quedan: i.cantidad - i.devuelto }))
  .filter((r) => r.quedan > 0);

// A dónde vuelve: al detalle de la venta si la puede ver; si no (la hizo otro), a Cambios y devoluciones
export const volverDe = (v: VentaParaCambio) => (v.visible ? { href: `/admin/ventas/${v.id}`, texto: `Venta ${v.comprobante}` } : { href: "/admin/devoluciones", texto: "Cambios y devoluciones" });
