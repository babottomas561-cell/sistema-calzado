// Encabezado de cada integración: volver a la portada, título, para qué sirve y el atajo a su manual (abajo).
import Volver from "@/components/Volver";
import AbrirManual from "./AbrirManual";

export default function Encabezado({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="space-y-2">
      <Volver href="/admin/integraciones">Integraciones</Volver>
      <h1 className="text-2xl font-bold">{titulo}</h1>
      <p className="text-sm text-texto-2">{texto}</p>
      <AbrirManual />
    </div>
  );
}
