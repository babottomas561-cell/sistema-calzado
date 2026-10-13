// Módulos: qué partes del sistema usa este local. Lo apagado deja de aparecer en el menú de todo el equipo. Solo el Administrador.
import { exigir } from "@/lib/exigir";
import { GRUPOS } from "@/lib/menu";
import Volver from "@/components/Volver";
import Modulos from "./Modulos";

export default async function PaginaModulos() {
  const { supabase } = await exigir("equipo.administrar");
  const { data } = await supabase.from("modulos_desactivados").select("clave");
  const apagados = new Set((data ?? []).map((m) => m.clave));
  const grupos = GRUPOS.filter((g) => g.titulo !== undefined || g.items.some((i) => i.href !== "/admin")).map((g) => ({
    titulo: g.titulo ?? "Base",
    items: g.items.filter((i) => i.href !== "/admin").map((i) => ({ href: i.href, texto: i.texto, fijo: !!i.fijo, encendido: !apagados.has(i.href) })),
  })).filter((g) => g.items.length);
  return (
    <div className="max-w-2xl space-y-6">
      <div className="space-y-2">
        <Volver href="/admin/equipo">Equipo</Volver>
        <h1 className="text-2xl font-bold">Módulos del sistema</h1>
        <p className="text-sm text-texto-2">Elegí qué partes usa este local. Lo que apagues deja de aparecer en el menú de todo el equipo; los datos quedan guardados y se pueden volver a prender cuando quieras. Cada persona además puede armar su propio menú con favoritos.</p>
      </div>
      <Modulos grupos={grupos} />
    </div>
  );
}
