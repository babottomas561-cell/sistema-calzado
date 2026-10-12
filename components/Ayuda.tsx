// La ayuda de una pantalla, adentro de la pantalla: docs/ayuda/<nombre>.md (una sola versión que mantener). Plegada para no tapar el trabajo.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { BookOpen } from "lucide-react";
import { Markdown } from "@/lib/markdown";

export default async function Ayuda({ nombre, abierta = false, titulo = "Ayuda: cómo se usa, paso a paso" }: { nombre: string; abierta?: boolean; titulo?: string }) {
  const texto = await readFile(path.join(process.cwd(), "docs", "ayuda", `${nombre}.md`), "utf8");
  return (
    <details open={abierta} className="group overflow-hidden rounded-xl border border-borde bg-white shadow-sm print:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2 font-semibold"><BookOpen size={18} strokeWidth={1.8} className="text-marca" /> {titulo}</span>
        <span className="text-sm font-semibold text-marca group-open:hidden">Abrir</span>
        <span className="hidden text-sm font-semibold text-marca group-open:inline">Cerrar</span>
      </summary>
      <div className="border-t border-borde px-5 py-4"><Markdown texto={texto} /></div>
    </details>
  );
}
