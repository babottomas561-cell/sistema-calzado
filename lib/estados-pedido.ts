// Estados de un pedido: nombre para mostrar, color y a qué estados puede pasar.
export const ESTADOS: Record<string, { texto: string; color: string; siguientes: string[] }> = {
  pendiente:    { texto: "Pendiente",          color: "bg-amber-100 text-alerta",  siguientes: ["confirmado", "cancelado"] },
  confirmado:   { texto: "Confirmado",         color: "bg-blue-100 text-marca",    siguientes: ["preparado", "cancelado"] },
  preparado:    { texto: "Preparado",          color: "bg-blue-100 text-marca",    siguientes: ["enviado", "listo_retiro", "cancelado"] },
  enviado:      { texto: "Enviado",            color: "bg-indigo-100 text-indigo-700", siguientes: ["entregado", "cancelado"] },
  listo_retiro: { texto: "Listo para retirar", color: "bg-indigo-100 text-indigo-700", siguientes: ["entregado", "cancelado"] },
  entregado:    { texto: "Entregado",          color: "bg-green-100 text-ok",      siguientes: [] },
  cancelado:    { texto: "Cancelado",          color: "bg-gray-100 text-texto-2",  siguientes: [] },
};

// Por qué se canceló un pedido (pedidos.motivo_cancelacion). El cliente solo elige entre los suyos.
export const MOTIVOS_CANCELACION: Record<string, string> = {
  arrepentido: "El cliente se arrepintió",
  no_retiro: "No lo retiró a tiempo",
  no_pago: "No lo pagó",
  sin_stock: "No hay stock",
  otro: "Otro motivo",
};
export const MOTIVOS_LOCAL = ["arrepentido", "no_pago", "sin_stock", "no_retiro", "otro"] as const;
export const MOTIVOS_CLIENTE = { arrepentido: "Me arrepentí / ya no lo quiero", otro: "Otro motivo" } as const;
// Quién lo canceló (pedidos.cancelado_por)
export const CANCELADO_POR: Record<string, string> = { cliente: "el cliente", local: "el local", vencimiento: "vencimiento automático" };
