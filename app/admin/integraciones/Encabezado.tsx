// Encabezado de cada integración: volver a la portada, título, para qué sirve y su parte de la guía paso a paso.
import Link from "next/link";
import { BookOpen } from "lucide-react";
import Volver from "@/components/Volver";

export default function Encabezado({ titulo, texto, guia }: { titulo: string; texto: string; guia?: string }) {
  return (
    <div className="space-y-2">
      <Volver href="/admin/integraciones">Integraciones</Volver>
      <h1 className="text-2xl font-bold">{titulo}</h1>
      <p className="text-sm text-texto-2">{texto}</p>
      {guia && <Link href={`/admin/integraciones/guia${guia}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-marca">
        <BookOpen size={15} strokeWidth={1.8} /> Cómo se configura, paso a paso</Link>}
    </div>
  );
}
