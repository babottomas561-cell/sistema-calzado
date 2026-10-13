// Matriz de permisos: una fila por permiso y una columna por rol. Es de lectura (se edita en cada rol, abajo).
// Muestra lo EFECTIVO: un permiso que viene incluido por su padre se ve tildado, más claro.
import { Check, Minus } from "lucide-react";
import { Fragment } from "react";
import { efectivos } from "@/lib/permisos";

type Rol = { id: number; nombre: string; todos: boolean; permisos: string[] };
type Permiso = { codigo: string; grupo: string; nombre: string; descripcion: string | null; padre: string | null };

export default function Matriz({ roles, permisos }: { roles: Rol[]; permisos: Permiso[] }) {
  const tienen = new Map(roles.map((r) => [r.id, new Set(efectivos(r, permisos))]));
  const grupos = [...new Set(permisos.map((p) => p.grupo))];
  return (
    <details className="tarjeta">
      <summary className="cursor-pointer font-semibold">Matriz de permisos <span className="text-sm font-normal text-texto-2">(qué puede cada rol, de un vistazo)</span></summary>
      <div className="mt-3 overflow-x-auto">
        <table className="tabla text-sm">
          <thead><tr><th>Permiso</th>{roles.map((r) => <th key={r.id} className="text-center">{r.nombre}</th>)}</tr></thead>
          <tbody>
            {grupos.map((g) => (
              <Fragment key={g}>
                <tr><td colSpan={roles.length + 1} className="bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-400">{g}</td></tr>
                {permisos.filter((p) => p.grupo === g && !p.padre).flatMap((p) => [p, ...permisos.filter((h) => h.padre === p.codigo)]).map((p) => (
                  <tr key={p.codigo}>
                    <td className={p.padre ? "pl-8" : "font-medium"}>{p.nombre}</td>
                    {roles.map((r) => {
                      const si = tienen.get(r.id)!.has(p.codigo), propio = r.todos || r.permisos.includes(p.codigo);
                      return <td key={r.id} className="text-center">{si ? <Check size={16} className={`mx-auto ${propio ? "text-ok" : "text-gray-300"}`} aria-label={propio ? "Sí" : "Sí, incluido por su padre"} /> : <Minus size={14} className="mx-auto text-gray-200" aria-label="No" />}</td>;
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
