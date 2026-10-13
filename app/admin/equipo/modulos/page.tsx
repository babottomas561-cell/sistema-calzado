// Módulos: qué partes del sistema usa este local. Lo apagado deja de aparecer en el menú, sus pantallas se cortan y la base frena sus altas.
// Los datos se conservan. Solo el Administrador.
import { exigir } from "@/lib/exigir";
import { GRUPOS } from "@/lib/menu";
import Volver from "@/components/Volver";
import Modulos from "./Modulos";

export default async function PaginaModulos() {
  const { supabase } = await exigir("equipo.administrar");
  const { data } = await supabase.from("modulos").select("clave, nombre, fijo, depende, activo");
  const porClave = new Map((data ?? []).map((m) => [m.clave, m]));
  // Los grupos son los del menú; cada parte con su estado de la base
  const grupos = GRUPOS.map((g) => ({
    titulo: g.titulo ?? "Base",
    modulos: g.items.map((i) => porClave.get(i.href.replace("/admin/", ""))).filter((m): m is NonNullable<typeof m> => !!m),
  })).filter((g) => g.modulos.length);
  return (
    <div className="max-w-2xl space-y-6">
      <div className="space-y-2">
        <Volver href="/admin/equipo">Equipo</Volver>
        <h1 className="text-2xl font-bold">Módulos del sistema</h1>
        <p className="text-sm text-texto-2">Elegí qué partes usa este local. Lo que apagues deja de aparecer en el menú, sus pantallas se cortan y el sistema no deja cargar nada nuevo de esa parte. Los datos quedan guardados y se pueden volver a prender cuando quieras. Para apagar una parte no tiene que haber nada pendiente (por ejemplo, presupuestos vigentes o pedidos sin terminar). Cada persona además puede armar su propio menú con favoritos.</p>
      </div>
      <Modulos grupos={grupos} />
    </div>
  );
}
