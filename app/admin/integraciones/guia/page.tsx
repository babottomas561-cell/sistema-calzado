// La guía para conectar WhatsApp y Gemini, paso a paso. Es la misma de docs/WHATSAPP.md (una sola versión que mantener).
// Es larga: además del «volver» de arriba, hay uno al final y uno flotante que queda a mano mientras se baja.
import { readFile } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import Volver from "@/components/Volver";
import { exigir } from "@/lib/exigir";
import { Markdown } from "@/lib/markdown";

export default async function Guia() {
  await exigir("tienda.editar");
  const texto = await readFile(path.join(process.cwd(), "docs", "WHATSAPP.md"), "utf8");
  return (
    <div className="max-w-3xl space-y-4 pb-20">
      <Volver href="/admin/integraciones">Integraciones</Volver>
      <article className="tarjeta"><Markdown texto={texto} /></article>
      <Link href="/admin/integraciones" className="boton inline-flex w-full items-center justify-center gap-1.5 sm:w-auto">
        <ChevronLeft size={16} strokeWidth={2.2} /> Volver a Integraciones</Link>
      {/* Siempre a mano mientras se baja */}
      <Link href="/admin/integraciones" aria-label="Volver a Integraciones"
        className="fixed bottom-4 right-4 z-30 inline-flex items-center gap-1.5 rounded-full bg-marca px-4 py-3 text-sm font-semibold text-white shadow-lg">
        <ChevronLeft size={16} strokeWidth={2.2} /> Integraciones</Link>
    </div>
  );
}
