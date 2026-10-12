import { Store } from "lucide-react";

// El nombre sale de Tablas → Tienda (configuracion_tienda.nombre); quien lo usa lo pasa.
export default function Logo({ className = "", nombre = "Mi Tienda" }: { className?: string; nombre?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-bold tracking-tight ${className}`}>
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-marca text-white"><Store size={18} strokeWidth={2.2} /></span>
      {nombre}
    </span>
  );
}
