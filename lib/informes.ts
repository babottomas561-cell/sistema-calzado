// Ayudas para informes: leer TODAS las filas de una consulta y manejar períodos de fechas.

// Supabase devuelve como máximo 1000 filas por consulta (max_rows): un informe de un año, o el
// stock de muchos modelos, lo pasa enseguida y quedaría cortado sin avisar. Esto lee de a páginas.
// La consulta tiene que tener un .order() estable (por id) para que las páginas no se pisen.
type Pagina<T> = (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

export async function leerTodo<T>(pagina: Pagina<T>): Promise<T[]> {
  const TAM = 1000;
  const filas: T[] = [];
  for (let i = 0; ; i += TAM) {
    const { data, error } = await pagina(i, i + TAM - 1);
    if (error) throw new Error(error.message);
    filas.push(...(data ?? []));
    if (!data || data.length < TAM) return filas;
  }
}

// ── Períodos ──────────────────────────────────────────────────────────
// Las fechas van como "AAAA-MM-DD" (día argentino). "hasta" es inclusive.
export const PERIODOS = {
  hoy: "Hoy", semana: "7 días", mes: "Este mes", "mes-anterior": "Mes anterior", anio: "Este año", rango: "Elegir fechas",
} as const;
export type Periodo = keyof typeof PERIODOS;
export type Rango = { desde: string; hasta: string };

const aFecha = (d: string) => new Date(`${d}T12:00:00Z`);
const aTexto = (d: Date) => d.toISOString().slice(0, 10);
const sumarDias = (d: string, n: number) => { const x = aFecha(d); x.setUTCDate(x.getUTCDate() + n); return aTexto(x); };
// Mismo día, n meses antes/después (el 31 en un mes de 30 queda en el último día)
function sumarMeses(d: string, n: number) {
  const x = aFecha(d), dia = x.getUTCDate();
  x.setUTCDate(1); x.setUTCMonth(x.getUTCMonth() + n);
  const ultimo = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate();
  x.setUTCDate(Math.min(dia, ultimo));
  return aTexto(x);
}
export const diasEntre = (r: Rango) => Math.round((aFecha(r.hasta).getTime() - aFecha(r.desde).getTime()) / 86_400_000) + 1;

export function rangoDe(periodo: Periodo, hoy: string, desde?: string, hasta?: string): Rango {
  const [a, m] = hoy.split("-");
  switch (periodo) {
    case "hoy": return { desde: hoy, hasta: hoy };
    case "semana": return { desde: sumarDias(hoy, -6), hasta: hoy };
    case "mes": return { desde: `${a}-${m}-01`, hasta: hoy };
    case "mes-anterior": { const ini = sumarMeses(`${a}-${m}-01`, -1); return { desde: ini, hasta: sumarDias(`${a}-${m}-01`, -1) }; }
    case "anio": return { desde: `${a}-01-01`, hasta: hoy };
    case "rango": {
      const ok = (d?: string) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);
      const d1 = ok(desde) ? desde! : `${a}-${m}-01`, d2 = ok(hasta) ? hasta! : hoy;
      return d1 <= d2 ? { desde: d1, hasta: d2 } : { desde: d2, hasta: d1 };
    }
  }
}

// El período anterior con el que se compara: los meses y el año contra los mismos días
// del mes/año anterior (1 al 11 de este mes vs 1 al 11 del anterior); el resto, contra
// la misma cantidad de días justo antes.
export function rangoAnterior(periodo: Periodo, r: Rango): Rango {
  if (periodo === "mes" || periodo === "mes-anterior") return { desde: sumarMeses(r.desde, -1), hasta: periodo === "mes" ? sumarMeses(r.hasta, -1) : sumarDias(r.desde, -1) };
  if (periodo === "anio") return { desde: sumarMeses(r.desde, -12), hasta: sumarMeses(r.hasta, -12) };
  const n = diasEntre(r);
  return { desde: sumarDias(r.desde, -n), hasta: sumarDias(r.desde, -1) };
}

// El mismo período, un año antes (para comparar temporadas: julio contra julio, no contra junio). El 29/02 pasa al 28/02.
export const rangoAnioAnterior = (r: Rango): Rango => ({ desde: sumarMeses(r.desde, -12), hasta: sumarMeses(r.hasta, -12) });

// Día de la semana (0 = lunes … 6 = domingo) y hora (0-23) de un instante, en hora argentina
export const DIAS_SEMANA = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"] as const;
const formatoAR = new Intl.DateTimeFormat("en-US", { timeZone: "America/Argentina/Buenos_Aires", weekday: "short", hour: "numeric", hourCycle: "h23" });
const ABREV = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export function diaYHora(iso: string): { dia: number; hora: number } {
  const partes = formatoAR.formatToParts(new Date(iso));
  const dia = ABREV.indexOf(partes.find((p) => p.type === "weekday")?.value ?? "");
  const hora = Number(partes.find((p) => p.type === "hour")?.value ?? 0);
  return { dia: dia < 0 ? 0 : dia, hora: hora % 24 };
}

// Para filtrar timestamps en la base: desde las 00:00 de "desde" hasta antes de las 00:00 del día siguiente a "hasta"
export const limites = (r: Rango) => ({ gte: `${r.desde}T00:00:00-03:00`, lt: `${sumarDias(r.hasta, 1)}T00:00:00-03:00` });

// Todos los días del rango (para no saltear los días sin ventas en el gráfico)
export function diasDe(r: Rango) {
  const dias: string[] = [];
  for (let d = r.desde; d <= r.hasta; d = sumarDias(d, 1)) dias.push(d);
  return dias;
}
