import { Store } from "lucide-react";

// El logo del panel: la imagen que cargó el local (Tienda online → Identidad) o, si no hay, el ícono con el nombre.
// El nombre sale de Tablas → Tienda (configuracion_tienda.nombre); quien lo usa lo pasa.
export default function Logo({ className = "", nombre = "Mi Tienda", imagen }: { className?: string; nombre?: string; imagen?: string | null }) {
  if (imagen) return <img src={imagen} alt={nombre} className={`block h-8 w-auto max-w-[170px] object-contain object-left ${className}`} />;
  return (
    <span className={`inline-flex items-center gap-2 font-bold tracking-tight ${className}`}>
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-marca text-white"><Store size={18} strokeWidth={2.2} /></span>
      {nombre}
    </span>
  );
}
