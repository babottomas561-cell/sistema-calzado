// Devoluciones: por qué vuelve algo (devoluciones.motivo) y en qué estado (devolucion_items.estado).
export const MOTIVOS_DEVOLUCION: Record<string, string> = {
  talle: "No le quedó el talle",
  no_gusto: "No le gustó / se arrepintió",
  fallado: "Vino fallado",
  otro: "Otro motivo",
};
export const ESTADOS_DEVUELTO = { bueno: "En buen estado", fallado: "Fallado" } as const;
