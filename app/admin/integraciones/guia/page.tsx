// La guía para conectar WhatsApp y Gemini, paso a paso. Es la misma de docs/WHATSAPP.md (una sola versión que mantener).
import { readFile } from "node:fs/promises";
import path from "node:path";
import Volver from "@/components/Volver";
import { exigir } from "@/lib/exigir";
import { Markdown } from "@/lib/markdown";

export default async function Guia() {
  await exigir("tienda.editar");
  const texto = await readFile(path.join(process.cwd(), "docs", "WHATSAPP.md"), "utf8");
  return (
    <div className="max-w-3xl space-y-4">
      <Volver href="/admin/integraciones">Integraciones</Volver>
      <article className="tarjeta"><Markdown texto={texto} /></article>
    </div>
  );
}
