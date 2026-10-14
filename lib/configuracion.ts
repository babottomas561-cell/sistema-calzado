// Índice de Configuración: todo lo que se ajusta en el sistema, con dónde se hace, quién puede y en qué parte está.
// Lo usa /admin/configuracion (tarjetas y buscador). Cada entrada solo aparece si la persona tiene alguno de sus permisos y su módulo está encendido.
// `estado` es la clave de estado_configuracion() (la base dice si ya está configurado); sin `estado`, la tarjeta no muestra etiqueta.
import type { Permiso } from "@/lib/permisos";

export type Entrada = {
  titulo: string; descripcion: string; href: string; seccion: string;
  permisos: Permiso[];            // vacío = cualquiera del equipo
  modulo?: string;                // clave del módulo (si está apagado, no aparece)
  estado?: string;                // clave en estado_configuracion()
  palabras?: string;              // sinónimos para el buscador
};

export const SECCIONES = ["Negocio", "Equipo y permisos", "Ventas y caja", "Catálogo", "Tienda online", "Integraciones", "Contabilidad", "Mi cuenta"] as const;

const EQUIPO: Permiso[] = ["equipo.administrar", "equipo.personas", "equipo.roles", "equipo.modulos", "equipo.cuentas"];
const TABLAS: Permiso[] = ["tablas.editar", "tablas.catalogo", "tablas.medios_pago", "tablas.depositos"];

export const ENTRADAS: Entrada[] = [
  { seccion: "Negocio", titulo: "Datos y portada de la tienda", descripcion: "Nombre, logo, color, avisos, redes, local y portada.", href: "/admin/tienda", permisos: ["tienda.editar"], modulo: "tienda", estado: "identidad", palabras: "logo color marca identidad nombre avisos instagram whatsapp portada landing" },
  { seccion: "Negocio", titulo: "Datos legales y documentos", descripcion: "Razón social, CUIT, domicilio, términos y privacidad.", href: "/admin/tienda/legales", permisos: ["tienda.editar"], modulo: "tienda", estado: "legales", palabras: "cuit razon social terminos condiciones privacidad arrepentimiento defensa consumidor" },
  { seccion: "Equipo y permisos", titulo: "Personas y roles", descripcion: "Quién usa el sistema, qué rol tiene y qué puede hacer cada rol.", href: "/admin/equipo", permisos: EQUIPO, palabras: "usuarios vendedores permisos matriz roles descuento tope" },
  { seccion: "Equipo y permisos", titulo: "Módulos del sistema", descripcion: "Qué partes usa este local: lo que apagues deja de verse.", href: "/admin/equipo/modulos", permisos: ["equipo.administrar", "equipo.modulos"], palabras: "apagar prender activar desactivar partes funciones" },
  { seccion: "Equipo y permisos", titulo: "Cuentas e invitaciones", descripcion: "Quién puede registrarse en la tienda y qué datos se piden.", href: "/admin/equipo/cuentas", permisos: ["equipo.administrar", "equipo.cuentas"], palabras: "registro clientes contraseña confirmar email invitaciones" },
  { seccion: "Equipo y permisos", titulo: "Bitácora de cambios", descripcion: "Quién cambió qué y cuándo, para siempre.", href: "/admin/equipo/bitacora", permisos: ["bitacora.ver"], palabras: "auditoria historial registro cambios" },
  { seccion: "Ventas y caja", titulo: "Cuenta corriente", descripcion: "Que los clientes habilitados compren a cuenta y paguen después, con su tope.", href: "/admin/cuenta-corriente", permisos: ["cc.ver", "cc.cobrar", "cc.habilitar"], modulo: "cuenta-corriente", palabras: "deuda fiado credito saldo clientes cobrar recibo tope a cuenta" },
  { seccion: "Ventas y caja", titulo: "Impresión y comprobantes", descripcion: "Papel, modo de impresión, qué lleva el ticket y el redondeo.", href: "/admin/impresion", permisos: ["tablas.editar"], modulo: "impresion", estado: "impresion", palabras: "ticket factura papel impresora a4 80mm comprobante etiquetas" },
  { seccion: "Ventas y caja", titulo: "Medios de pago", descripcion: "Descuentos y recargos por medio de pago, cuotas y dónde se ofrecen.", href: "/admin/tablas", permisos: ["tablas.editar", "tablas.medios_pago"], palabras: "tarjeta efectivo transferencia recargo cuotas debito credito mercado pago" },
  { seccion: "Catálogo", titulo: "Rubros, marcas, colores y talles", descripcion: "Las tablas del catálogo y los depósitos.", href: "/admin/tablas", permisos: TABLAS, palabras: "categorias subrubros marcas colores talles escalas depositos fallados" },
  { seccion: "Catálogo", titulo: "Etiquetas y códigos de barras", descripcion: "Plantillas de etiquetas y códigos por variante.", href: "/admin/etiquetas", permisos: ["stock.ver", "productos.editar"], modulo: "etiquetas", palabras: "codigo barras lector etiquetas rollo hoja" },
  { seccion: "Tienda online", titulo: "Mails al cliente", descripcion: "Los textos que recibe el cliente: cuenta, bienvenida, pedido recibido, pagado, listo y enviado.", href: "/admin/tienda/mails", permisos: ["tienda.editar"], modulo: "tienda", palabras: "email correo plantillas bienvenida pedido pdf comprobante notificaciones avisos" },
  { seccion: "Tienda online", titulo: "Envíos y cobro antes de enviar", descripcion: "Zonas, precios de envío y reglas de pago.", href: "/admin/integraciones/envios", permisos: ["tienda.editar"], modulo: "tienda", estado: "envios", palabras: "zonas envio andreani uber costo retiro" },
  { seccion: "Tienda online", titulo: "Mercado Pago", descripcion: "Cobrar los pedidos de la tienda con Checkout Pro.", href: "/admin/integraciones/mercadopago", permisos: ["tienda.editar"], modulo: "integraciones", estado: "mercadopago", palabras: "cobro online tarjeta cuotas token" },
  { seccion: "Integraciones", titulo: "WhatsApp", descripcion: "Avisos de pedidos y bot de atención.", href: "/admin/integraciones/whatsapp", permisos: ["tienda.editar"], modulo: "integraciones", estado: "whatsapp", palabras: "meta mensajes avisos bot plantilla" },
  { seccion: "Integraciones", titulo: "Inteligencia artificial (Gemini)", descripcion: "Clave, modelo, plan y uso.", href: "/admin/integraciones/ia", permisos: ["tienda.editar"], modulo: "integraciones", estado: "ia", palabras: "gemini ia bot modelo tokens google" },
  { seccion: "Integraciones", titulo: "Instagram", descripcion: "Mostrar las últimas publicaciones en la portada.", href: "/admin/integraciones/instagram", permisos: ["tienda.editar"], modulo: "integraciones", estado: "instagram", palabras: "redes publicaciones fotos" },
  { seccion: "Integraciones", titulo: "Correo (emails del sistema)", descripcion: "El correo con el que sale la confirmación de cuenta y los avisos.", href: "/admin/integraciones/correo", permisos: ["equipo.administrar"], modulo: "integraciones", estado: "correo", palabras: "smtp resend mail email confirmacion" },
  { seccion: "Integraciones", titulo: "Dominio propio", descripcion: "La dirección web de la tienda y su comprobación.", href: "/admin/integraciones/dominio", permisos: ["equipo.administrar"], modulo: "integraciones", estado: "dominio", palabras: "dns www vercel direccion web" },
  { seccion: "Integraciones", titulo: "ARCA (factura electrónica)", descripcion: "Datos fiscales, certificado y puntos de venta.", href: "/admin/integraciones/arca", permisos: ["equipo.administrar"], modulo: "integraciones", estado: "arca", palabras: "afip factura electronica certificado cuit punto de venta fiscal" },
  { seccion: "Contabilidad", titulo: "Plan de cuentas y apertura", descripcion: "Cuentas, asignaciones y comienzo de la contabilidad.", href: "/admin/contabilidad", permisos: ["contabilidad.configurar"], modulo: "contabilidad", estado: "contabilidad", palabras: "asientos libro diario cuentas contador apertura" },
  { seccion: "Mi cuenta", titulo: "Mi PIN de encargado", descripcion: "El PIN para autorizar descuentos sobre el tope en la caja.", href: "/admin/mi-cuenta", permisos: ["ventas.autorizar"], estado: "pin", palabras: "autorizar descuento pin clave caja" },
  { seccion: "Mi cuenta", titulo: "Cambiar mi contraseña", descripcion: "La contraseña con la que entrás al sistema.", href: "/nueva-clave", permisos: [], palabras: "clave password acceso" },
];
