// La cuenta del cobro en la caja: cómo se reparte entre medios de pago (por monto o por porcentaje), el descuento o recargo de cada medio,
// el redondeo del efectivo y el vuelto. Hace la misma cuenta que la base (_registrar_venta), que es la que manda: esto es para mostrarla
// antes de confirmar. Sin dependencias, para poder probarlo (lib/cobro.test.ts).

export type MedioCobro = { id: number; nombre: string; ajuste_pct: number; cuotas: number; tipo?: string | null; es_saldo?: boolean | null };
// La primera línea cubre «lo que falta»; las demás, una parte fija (en pesos) o un porcentaje de lo que hay que cobrar
export type LineaPago = { medio_pago_id: number; modo: "monto" | "pct"; valor: number };
export type LineaCalculada = LineaPago & { medio: MedioCobro; base: number; ajuste: number; redondeo: number; cobra: number; pct: number };

const centavos = (n: number) => Math.round(n * 100) / 100;
// Mismo redondeo que la base: round(base × % / 100 × factor, 2)
export const ajusteMedio = (base: number, pct: number, factor = 1) => centavos((base * Number(pct) * factor) / 100);
export const esEfectivo = (m: MedioCobro | undefined) => m?.tipo === "Efectivo";

// El redondeo del efectivo: siempre hacia abajo y con el mismo tope que la base (5 % de lo que se cobra con ese medio, nunca más de $ 1.000)
export const MULTIPLOS_REDONDEO = [10, 50, 100, 500, 1000] as const;
export const topeRedondeo = (cobra: number) => Math.min(1000, centavos(cobra * 0.05));
export function redondeoA(cobra: number, multiplo: number): number {
  const queda = Math.floor(cobra / multiplo) * multiplo;
  return queda > 0 ? centavos(cobra - queda) : 0;
}
// Los redondeos que tienen sentido para ese monto (que cambian algo y no pasan el tope). Si dos múltiplos dejan el mismo monto, queda el más grande:
// en pantalla se muestra el monto que queda ($ 86.400), no el múltiplo.
export function opcionesRedondeo(cobra: number): { multiplo: number; redondeo: number; queda: number }[] {
  const porMonto = new Map<number, { multiplo: number; redondeo: number; queda: number }>();
  for (const m of MULTIPLOS_REDONDEO) {
    const r = redondeoA(cobra, m);
    if (r > 0 && r <= topeRedondeo(cobra)) porMonto.set(r, { multiplo: m, redondeo: r, queda: centavos(cobra - r) });
  }
  return [...porMonto.values()];
}

// Reparte lo que hay que cobrar (neto: después de promociones y descuento) entre las líneas. `factor` es la parte del neto que admite el %
// del medio (una promoción puede no acumularse). `multiplo` redondea la línea en efectivo (la primera que haya), si sigue siendo válido.
export function calcularCobro(neto: number, factor: number, lineas: LineaPago[], medios: MedioCobro[], multiplo: number | null) {
  const medio = (id: number) => medios.find((m) => m.id === id) ?? medios[0];
  const fijas = lineas.slice(1).map((l) => centavos(l.modo === "pct" ? (neto * l.valor) / 100 : l.valor));
  const otros = fijas.reduce((s, b) => s + b, 0);
  const excedido = otros > neto + 0.01;
  const calculadas: LineaCalculada[] = lineas.map((l, i) => {
    const m = medio(l.medio_pago_id);
    const base = i === 0 ? Math.max(centavos(neto - otros), 0) : fijas[i - 1];
    const ajuste = ajusteMedio(base, m.ajuste_pct, factor);
    return { ...l, medio: m, base, ajuste, redondeo: 0, cobra: centavos(base + ajuste), pct: neto > 0 ? (base / neto) * 100 : 0 };
  });
  // Redondeo: en la primera línea en efectivo con algo para cobrar
  const iEfectivo = calculadas.findIndex((l) => esEfectivo(l.medio) && l.base > 0);
  if (multiplo && iEfectivo >= 0) {
    const l = calculadas[iEfectivo];
    const r = redondeoA(l.cobra, multiplo);
    if (r > 0 && r <= topeRedondeo(l.cobra)) calculadas[iEfectivo] = { ...l, redondeo: r, cobra: centavos(l.cobra - r) };
  }
  const ajustes = centavos(calculadas.reduce((s, l) => s + l.ajuste, 0));
  const redondeo = centavos(calculadas.reduce((s, l) => s + l.redondeo, 0));
  return { lineas: calculadas, ajustes, redondeo, total: centavos(neto + ajustes - redondeo), excedido, iEfectivo };
}

// Lo que se manda a registrar_venta: primero las partes fijas y al final la que completa (sin base), cada una con su redondeo
export function pagosParaLaBase(lineas: LineaCalculada[]) {
  const pago = (l: LineaCalculada, conBase: boolean) => ({ medio_pago_id: l.medio_pago_id, ...(conBase ? { base: l.base } : {}), ...(l.redondeo > 0 ? { redondeo: l.redondeo } : {}) });
  return [...lineas.slice(1).filter((l) => l.base > 0).map((l) => pago(l, true)), ...(lineas[0] ? [pago(lineas[0], false)] : [])];
}

// Cuánto cobrar con cada medio si se paga todo con ese (para mostrarlo en el botón y decírselo al cliente)
export const totalCon = (neto: number, factor: number, m: MedioCobro) => centavos(neto + ajusteMedio(neto, m.ajuste_pct, factor));

// Atajos para dividir entre dos medios: [lo que completa, la otra parte]
export const REPARTOS = [[50, 50], [70, 30], [30, 70]] as const;

// Billetes con los que puede pagar (para el vuelto): el monto justo y los siguientes redondos
export function billetesSugeridos(cobrar: number): number[] {
  if (cobrar <= 0) return [];
  const saltos = [1000, 2000, 5000, 10000, 20000];
  const opciones = new Set<number>();
  for (const s of saltos) { const v = Math.ceil(cobrar / s) * s; if (v > cobrar) opciones.add(v); }
  return [...opciones].sort((a, b) => a - b).slice(0, 4);
}
export const vuelto = (recibido: number, cobrar: number) => centavos(recibido - cobrar);
