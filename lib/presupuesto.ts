// Estado de un presupuesto tal como lo ve la gente: "vencido" no se guarda, depende de la fecha.
import { fecha } from "@/lib/formato";

export type EstadoVisible = "vigente" | "vencido" | "convertido" | "anulado";

// valido_hasta viene como "AAAA-MM-DD" (último día en que se respeta, hora argentina)
export function estadoVisible(estado: string, validoHasta: string): EstadoVisible {
  if (estado !== "vigente") return estado as EstadoVisible;
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
  return validoHasta < hoy ? "vencido" : "vigente";
}

export const ESTADOS_PRESUPUESTO: Record<EstadoVisible, { texto: string; color: string }> = {
  vigente: { texto: "Vigente", color: "bg-green-100 text-ok" },
  vencido: { texto: "Vencido", color: "bg-amber-100 text-alerta" },
  convertido: { texto: "Convertido en venta", color: "bg-blue-100 text-marca" },
  anulado: { texto: "Anulado", color: "bg-gray-100 text-texto-2" },
};

export const hasta = (validoHasta: string) => fecha(`${validoHasta}T12:00:00-03:00`);
