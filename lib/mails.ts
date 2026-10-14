// Mails al cliente: las variables que se pueden escribir entre llaves en cada plantilla y qué significan. Es el mismo criterio que _mail_variables() en la base
// (la base es la que las valida al guardar: esto solo las muestra en el editor). Sin dependencias.
export const VARIABLES: Record<string, { nombre: string; que: string; ejemplo: string }> = {
  tienda: { nombre: "{{tienda}}", que: "El nombre del local", ejemplo: "BLAST" },
  nombre: { nombre: "{{nombre}}", que: "El nombre de pila del cliente", ejemplo: "María" },
  email: { nombre: "{{email}}", que: "El email de la cuenta", ejemplo: "maria@correo.com" },
  pedido: { nombre: "{{pedido}}", que: "El número del pedido", ejemplo: "0001-00000123" },
  total: { nombre: "{{total}}", que: "Lo que paga el cliente, con el envío", ejemplo: "$ 108.500" },
  entrega: { nombre: "{{entrega}}", que: "Cómo lo recibe: retiro o envío", ejemplo: "retiro en el local" },
  local: { nombre: "{{local}}", que: "La dirección del local", ejemplo: "Av. Sarmiento 123" },
  sitio: { nombre: "{{sitio}}", que: "La dirección de la tienda online", ejemplo: "https://tutienda.com.ar" },
  seguimiento: { nombre: "{{seguimiento}}", que: "El código de seguimiento del envío (si lo hay)", ejemplo: "Seguimiento: AB123 (Andreani)" },
  motivo: { nombre: "{{motivo}}", que: "Por qué se canceló (queda vacío si no hay motivo)", ejemplo: " porque no hay stock" },
  retirar_hasta: { nombre: "{{retirar_hasta}}", que: "Hasta cuándo se guarda para retirar", ejemplo: "19/10/2026" },
};
const CUENTA = ["tienda", "email"], BIENVENIDA = ["tienda", "nombre", "sitio"], PEDIDO = ["tienda", "nombre", "pedido", "total", "entrega", "local", "sitio", "seguimiento", "motivo", "retirar_hasta"];
export const variablesDe = (clave: string): string[] => (["confirmacion", "recuperar", "cambio_email", "invitacion"].includes(clave) ? CUENTA : clave === "bienvenida" ? BIENVENIDA : PEDIDO);
