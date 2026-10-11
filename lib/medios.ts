// Medios de pago (tabla medios_pago): cada uno con su descuento (−) o recargo (+).
// La cuenta definitiva la hace la base (registrar_venta / crear_pedido); esto es para mostrarla antes.
import { porcentaje } from "@/lib/formato";

export type MedioPago = { id: number; nombre: string; ajuste_pct: number; cuotas: number };

// "Efectivo (−10 %)", "Crédito 3 cuotas (+15 %)"
export const textoMedio = (m: MedioPago) => (Number(m.ajuste_pct) ? `${m.nombre} (${porcentaje(m.ajuste_pct)})` : m.nombre);

// Mismo redondeo que la base: round(base × % / 100, 2)
export const ajusteDe = (base: number, pct: number) => Math.round(base * Number(pct)) / 100;
