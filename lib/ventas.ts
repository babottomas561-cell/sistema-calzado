// Ventas: por qué se anula una (ventas.motivo_anulacion) y si todavía se puede (solo el mismo día, hora argentina).
export const MOTIVOS_ANULACION: Record<string, string> = {
  error_carga: "Se cargó mal (talle, producto, precio o medio de pago)",
  duplicada: "Quedó cargada dos veces",
  arrepentido: "El cliente se arrepintió en el momento",
  otro: "Otro motivo",
};

// La base lo vuelve a controlar; acá es para mostrar u ocultar el botón
const diaAR = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
export const esDeHoy = (fecha: string) => diaAR(new Date(fecha)) === diaAR(new Date());
