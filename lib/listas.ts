// Listas de precios: la misma cuenta que hace la base (_aplicar_lista). El precio que vale lo decide siempre la base; esto sirve para mostrar un ejemplo.
export const REDONDEOS = [{ valor: 0, texto: "Sin redondear" }, { valor: 10, texto: "A $ 10" }, { valor: 50, texto: "A $ 50" }, { valor: 100, texto: "A $ 100" }, { valor: 500, texto: "A $ 500" }, { valor: 1000, texto: "A $ 1.000" }] as const;

// Ajusta un precio con el % de la lista y lo redondea al múltiplo más cercano (0 = sin redondear: centavos)
export function aplicarLista(precio: number, pct: number, redondeo: number): number {
  const ajustado = precio * (1 + pct / 100);
  const r = redondeo > 0 ? Math.round(ajustado / redondeo) * redondeo : Math.round(ajustado * 100) / 100;
  return Math.max(r, 0);
}
