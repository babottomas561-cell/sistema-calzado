// Informes: una pestaña por informe. Los números salen de las mismas vistas que el resto del
// panel (v_hechos_ventas, v_stock), así que coinciden con Inicio, Ventas y Stock.
import Pestanas from "./Pestanas";
import { exigir } from "@/lib/exigir";

export default async function LayoutInformes({ children }: { children: React.ReactNode }) {
  const { permisos } = await exigir("informes.ventas", "informes.stock", "gastos.gestionar");
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Informes</h1>
      <Pestanas permisos={permisos} />
      {children}
    </div>
  );
}
