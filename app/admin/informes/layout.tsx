// Informes: una pestaña por informe. Los números salen de las mismas vistas que el resto del
// panel (v_hechos_ventas, v_stock), así que coinciden con Inicio, Ventas y Stock.
import Pestanas from "./Pestanas";

export default function LayoutInformes({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Informes</h1>
      <Pestanas />
      {children}
    </div>
  );
}
