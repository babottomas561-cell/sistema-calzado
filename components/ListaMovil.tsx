// Listados en el celular: en vez de una tabla que hay que deslizar de costado, una tarjeta
// con una fila tocable por registro (lo esencial a la izquierda, el importe a la derecha).
// En la compu (md+) se sigue viendo la tabla: la página la envuelve en "hidden md:block".
import Link from "next/link";
import { ChevronRight } from "lucide-react";

export default function ListaMovil({ vacio, children }: { vacio?: string | false; children: React.ReactNode }) {
  return (
    <div className="tarjeta divide-y divide-gray-100 p-0 md:hidden">
      {children}
      {vacio && <p className="py-8 text-center text-sm text-texto-2">{vacio}</p>}
    </div>
  );
}

export function FilaMovil({ href, titulo, detalle, valor, extra, atenuado }: {
  href: string; titulo: React.ReactNode; detalle?: React.ReactNode; valor?: React.ReactNode; extra?: React.ReactNode; atenuado?: boolean;
}) {
  return (
    <Link href={href} className={`flex items-center gap-3 px-4 py-3 active:bg-gray-50 ${atenuado ? "opacity-50" : ""}`}>
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{titulo}</div>
        {detalle && <div className="truncate text-xs text-texto-2">{detalle}</div>}
        {extra && <div className="mt-1 flex flex-wrap gap-1">{extra}</div>}
      </div>
      {valor !== undefined && <div className="shrink-0 text-right text-sm">{valor}</div>}
      <ChevronRight size={16} className="shrink-0 text-gray-300" />
    </Link>
  );
}
