// El manual de una integración, adentro de su pantalla: docs/integraciones/<nombre>.md (una sola versión que mantener).
// Plegado para no tapar la configuración; abierto si todavía no está conectada.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { BookOpen } from "lucide-react";
import { Markdown } from "@/lib/markdown";

export default async function Manual({ nombre, abierto = false }: { nombre: "whatsapp" | "ia" | "mercadopago" | "envios" | "dominio"; abierto?: boolean }) {
  const texto = await readFile(path.join(process.cwd(), "docs", "integraciones", `${nombre}.md`), "utf8");
  return (
    <details id="manual" open={abierto} className="group overflow-hidden rounded-xl border border-borde bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2 font-semibold"><BookOpen size={18} strokeWidth={1.8} className="text-marca" /> Manual: cómo conectarlo, paso a paso</span>
        <span className="text-sm font-semibold text-marca group-open:hidden">Abrir</span>
        <span className="hidden text-sm font-semibold text-marca group-open:inline">Cerrar</span>
      </summary>
      <div className="border-t border-borde px-5 py-4"><Markdown texto={texto} /></div>
    </details>
  );
}
