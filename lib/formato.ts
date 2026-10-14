// Formatos argentinos para mostrar números y fechas.
const pesosFmt = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const numFmt = new Intl.NumberFormat("es-AR");

export const pesos = (n: number | string | null | undefined) => pesosFmt.format(Number(n ?? 0));
export const numero = (n: number | string | null | undefined) => numFmt.format(Number(n ?? 0));

export const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", year: "numeric" });
export const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

// Fecha y hora con el año, para los comprobantes: «14/10/2026 15:42»
export const fechaCompleta = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).replace(",", "");

// Inicio del día y del mes en hora argentina (UTC-3 todo el año), como ISO, para filtrar en la base.
// Funciona igual en la compu y en Vercel (que corre en UTC).
export function inicioDe(periodo: "hoy" | "mes") {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date()); // "2026-10-11"
  const [anio, mes, dia] = partes.split("-");
  return new Date(`${anio}-${mes}-${periodo === "hoy" ? dia : "01"}T00:00:00-03:00`).toISOString();
}

// Ajuste de un medio de pago: −10 → "−10 %", 15 → "+15 %", 0 → ""
export function porcentaje(n: number | string | null | undefined) {
  const v = Number(n ?? 0);
  if (!v) return "";
  return `${v < 0 ? "−" : "+"}${numFmt.format(Math.abs(v))} %`;
}

// Fecha de hoy (o dentro de n días) en hora argentina, como "AAAA-MM-DD"
export function diaArgentina(masDias = 0) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" })
    .format(new Date(Date.now() + masDias * 86_400_000));
}

// Una fecha SIN hora de la base ("2027-04-10", columnas date): se muestra tal cual, sin pasar por la zona
// horaria (new Date() la tomaría como medianoche UTC, que en Argentina es el día anterior).
export const dia = (d: string | null | undefined) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "");

// Un monto escrito a mano: «3.800», «3800,50», «3800.50», «$ 3.800» → número (vacío → null; algo que no es número → NaN).
// Con coma, la coma es el decimal y los puntos son de miles; sin coma, un punto seguido de 3 cifras es de miles.
export function leerMonto(texto: string): number | null {
  const t = texto.replace(/[\s$]/g, "");
  if (!t) return null;
  if (t.includes(",")) return Number(t.replace(/\./g, "").replace(",", "."));
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ""));
  return Number(t);
}

// Los últimos n días (hoy incluido) como fechas «AAAA-MM-DD» de Argentina, del más viejo al de hoy
export function ultimosDias(n: number): string[] {
  const ahora = Date.now();
  return Array.from({ length: n }, (_, i) => new Date(ahora - (n - 1 - i) * 864e5).toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }));
}
// El día (AAAA-MM-DD, hora de Argentina) de un instante
export const diaDe = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });

// ¿Pasaron menos de N días desde esa fecha? (para el cartelito «Nuevo»)
export function esReciente(iso: string | null | undefined, dias = 30): boolean {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() < dias * 864e5;
}
