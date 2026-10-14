// Parametrización: qué usa el local, sí o no. Cada interruptor es un módulo (tabla `modulos`); lo que se enciende acá aparece en Configuración con su «cómo».
// Esta lista dice cómo se agrupan, qué explica cada uno y dónde se configura una vez encendido. Un módulo que no figura acá aparece en «Otros».
export type Parametro = { clave: string; descripcion: string; configurar?: string };
export type GrupoParametros = { titulo: string; parametros: Parametro[] };

export const GRUPOS_PARAMETROS: GrupoParametros[] = [
  { titulo: "Ventas y caja", parametros: [
    { clave: "devoluciones", descripcion: "¿Hacen cambios y devoluciones? Se hacen desde la venta y dejan saldo a favor.", configurar: "/admin/devoluciones" },
    { clave: "presupuestos", descripcion: "¿Hacen presupuestos que después se convierten en venta?", configurar: "/admin/presupuestos" },
    { clave: "promociones", descripcion: "¿Usan promociones (2×1, descuentos por cantidad…)?", configurar: "/admin/promociones" },
    { clave: "precios", descripcion: "Ajuste masivo de precios de venta y de compra, con historial.", configurar: "/admin/precios" },
    { clave: "precios/listas", descripcion: "¿Cobran distinto en el mostrador y en la tienda? Una lista sube o baja el precio con un % y un redondeo.", configurar: "/admin/precios/listas" },
    { clave: "cuenta-corriente", descripcion: "¿Venden a cuenta y cobran después? Clientes habilitados, con su tope y sus recibos.", configurar: "/admin/cuenta-corriente" },
    { clave: "sucursales", descripcion: "Modo intersucursal: varias sucursales y cajas, cada una con su depósito, su razón social, su QR y su posnet.", configurar: "/admin/sucursales" },
  ] },
  { titulo: "Tienda online", parametros: [
    { clave: "tienda", descripcion: "¿Usan página web? Catálogo, registro de clientes, carrito y seguimiento del pedido.", configurar: "/admin/tienda" },
    { clave: "pedidos", descripcion: "¿Aceptan pedidos de la tienda? Se atienden, arman y entregan desde el panel.", configurar: "/admin/pedidos" },
    { clave: "arrepentimientos", descripcion: "Botón de arrepentimiento de la tienda (obligatorio si vendés online).", configurar: "/admin/arrepentimientos" },
  ] },
  { titulo: "Compras y stock", parametros: [
    { clave: "compras", descripcion: "¿Cargan facturas de compra? Suman stock y actualizan los costos.", configurar: "/admin/compras" },
    { clave: "proveedores", descripcion: "Ficha de proveedores, sus precios y el crédito con cada uno.", configurar: "/admin/proveedores" },
    { clave: "reposicion", descripcion: "Pedido sugerido según lo que se vende.", configurar: "/admin/reposicion" },
    { clave: "fallados", descripcion: "¿Apartan lo roto? Va a Fallados y se resuelve (arreglado, al proveedor o baja).", configurar: "/admin/fallados" },
    { clave: "etiquetas", descripcion: "Códigos de barras y etiquetas para imprimir.", configurar: "/admin/etiquetas" },
  ] },
  { titulo: "Gestión", parametros: [
    { clave: "informes", descripcion: "Informes de ventas, stock, clientes y vendedores.", configurar: "/admin/informes" },
    { clave: "gastos", descripcion: "Gastos del local, fijos y automáticos, y el resultado.", configurar: "/admin/gastos" },
    { clave: "contabilidad", descripcion: "Plan de cuentas y asientos automáticos (una vez iniciada, no se apaga).", configurar: "/admin/contabilidad" },
    { clave: "seguimientos", descripcion: "Agenda de seguimientos de clientes.", configurar: "/admin/seguimientos" },
    { clave: "impresion", descripcion: "Comprobantes, tickets y su formato.", configurar: "/admin/impresion" },
  ] },
  { titulo: "Integraciones", parametros: [
    { clave: "integraciones", descripcion: "Servicios de afuera. Encendé solo los que usás: cada uno trae su configuración y su manual.", configurar: "/admin/integraciones" },
    { clave: "integraciones/mercadopago", descripcion: "Cobrar con Mercado Pago: online, con QR y con el posnet.", configurar: "/admin/integraciones/mercadopago" },
    { clave: "mercadopago/posnet", descripcion: "¿Cobran las tarjetas con el posnet de Mercado Pago (Point)? La caja le manda el monto y espera la respuesta.", configurar: "/admin/integraciones/mercadopago" },
    { clave: "mercadopago/qr", descripcion: "¿Cobran con QR (en pantalla o con el QR fijo del mostrador)? Necesita una sucursal y una caja de Mercado Pago.", configurar: "/admin/integraciones/mercadopago" },
    { clave: "integraciones/whatsapp", descripcion: "Bot y avisos de pedidos por WhatsApp.", configurar: "/admin/integraciones/whatsapp" },
    { clave: "integraciones/ia", descripcion: "Inteligencia artificial (Gemini) para que el bot conteste con datos del local.", configurar: "/admin/integraciones/ia" },
    { clave: "integraciones/instagram", descripcion: "Mostrar las últimas publicaciones de Instagram en la portada.", configurar: "/admin/integraciones/instagram" },
    { clave: "integraciones/envios", descripcion: "Zonas de envío, su precio y el costo real de cada envío.", configurar: "/admin/integraciones/envios" },
    { clave: "integraciones/dominio", descripcion: "La tienda en tu propia dirección (mitienda.com.ar).", configurar: "/admin/integraciones/dominio" },
    { clave: "integraciones/correo", descripcion: "Los mails que recibe el cliente, por tu propio correo.", configurar: "/admin/integraciones/correo" },
    { clave: "integraciones/arca", descripcion: "Factura electrónica con CAE (ARCA).", configurar: "/admin/integraciones/arca" },
  ] },
];

// Qué parte de Parametrización tiene que estar encendida para que tenga sentido avisar lo que falta de cada acción (Requisitos)
export const MODULO_DE_ACCION: Record<string, string> = {
  facturar: "integraciones/arca", cobrar_online: "integraciones/mercadopago", enviar_mails: "integraciones/correo", publicar_tienda: "tienda",
};
// ¿Vale la pena mostrar lo que falta de esta acción? No si la parte está apagada. `apagados` = claves de módulos apagados (con o sin «/admin/» adelante).
export function accionActiva(accion: string, apagados: Iterable<string>): boolean {
  const modulo = MODULO_DE_ACCION[accion];
  if (!modulo) return true;
  for (const a of apagados) if (a.replace(/^\/admin\//, "") === modulo) return false;
  return true;
}
