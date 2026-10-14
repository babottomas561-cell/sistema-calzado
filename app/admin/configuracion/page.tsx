// Configuración: la entrada única a todo lo que se ajusta en el sistema, con buscador y el estado de cada parte.
// Solo muestra lo que la persona puede usar y lo que está encendido en este local.
import { usuarioActual } from "@/lib/supabase/server";
import { puede } from "@/lib/permisos";
import { ENTRADAS, SECCIONES } from "@/lib/configuracion";
import Configuracion from "./Configuracion";
import { ACCIONES, leerRequisitos, ListaRequisitos, type Accion } from "@/components/Requisitos";

export default async function PaginaConfiguracion() {
  const { supabase, permisos } = await usuarioActual();
  const [{ data: estado }, { data: apagados }] = await Promise.all([
    supabase.rpc("estado_configuracion"),
    supabase.from("modulos").select("clave").eq("activo", false),
  ]);
  // Qué falta para cada cosa, según la configuración y lo que esta persona puede arreglar
  const faltas = (await Promise.all((Object.keys(ACCIONES) as Accion[]).map(async (a) => ({ accion: a, items: await leerRequisitos(a) })))).filter((g) => g.items.length);
  const apagado = new Set((apagados ?? []).map((m) => m.clave));
  const e = (estado ?? {}) as Record<string, boolean | number>;
  const visibles = ENTRADAS.filter((x) => (!x.permisos.length || puede(permisos, ...x.permisos)) && !(x.modulo && apagado.has(x.modulo)))
    .map((x) => ({
      titulo: x.titulo, descripcion: x.descripcion, href: x.href, seccion: x.seccion, palabras: x.palabras ?? "",
      // true = listo, false = falta, null = no aplica
      listo: x.estado && x.estado in e ? !!e[x.estado] : null,
      nota: x.href === "/admin/equipo/modulos" && Number(e.modulos_apagados) > 0 ? `${e.modulos_apagados} ${Number(e.modulos_apagados) === 1 ? "parte apagada" : "partes apagadas"}` : null,
    }));
  return (
    <div className="max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Configuración</h1>
        <p className="text-sm text-texto-2">Todo lo que se ajusta en el sistema, en un solo lugar. Buscá por lo que querés cambiar (por ejemplo «logo», «PIN» o «impresora»).</p>
      </div>
      {faltas.length > 0 && (
        <section className="space-y-3 rounded-xl border border-borde bg-white p-4 shadow-sm">
          <div><h2 className="font-semibold">Qué falta para usar cada parte</h2><p className="text-sm text-texto-2">Lo rojo impide hacer algo hoy; lo ámbar conviene arreglarlo.</p></div>
          {faltas.map((g) => <div key={g.accion} className="space-y-1.5"><p className="text-xs font-semibold text-texto-2">{ACCIONES[g.accion]}</p><ListaRequisitos items={g.items} /></div>)}
        </section>
      )}
      <Configuracion entradas={visibles} secciones={[...SECCIONES]} />
    </div>
  );
}
