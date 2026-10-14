"use client";
// Personas del equipo: cambiar el rol, sacar del equipo y sumar a alguien por su email.
import { useActionState, useState, useTransition } from "react";
import { CircleCheck, UserMinus, UserPlus } from "lucide-react";
import { asignarSucursalUsuario, cambiarRol, quitarDelEquipo, sumarAlEquipo, type Estado } from "./acciones";

type Persona = {
  usuario_id: string;
  nombre: string | null;
  email: string;
  rol_id: number;
  rol: string;
  desde: string;
  sucursal_id?: number | null;
  sucursal?: string | null;
  punto_venta_id?: number | null;
  punto_venta?: string | null;
};
type Rol = { id: number; nombre: string; activo: boolean };
type SucursalOpcion = { id: number; nombre: string; activa: boolean };
type PuntoVentaOpcion = { id: number; sucursal_id: number; nombre: string; numero: number; activo: boolean };

function Mensaje({ e }: { e: Estado }) {
  if (e.error) return <p className="text-sm text-error">{e.error}</p>;
  if (e.ok) return <p className="flex items-center gap-1.5 text-sm text-ok"><CircleCheck size={16} /> {e.ok}</p>;
  return null;
}

export default function Personas({
  personas,
  roles,
  yo,
  sucursales = [],
  puntosVenta = [],
  multisucursalActiva = false,
}: {
  personas: Persona[];
  roles: Rol[];
  yo: string;
  sucursales?: SucursalOpcion[];
  puntosVenta?: PuntoVentaOpcion[];
  multisucursalActiva?: boolean;
}) {
  const [estado, setEstado] = useState<Estado>({});
  const [ocupado, empezar] = useTransition();
  const [eAlta, aAlta, cAlta] = useActionState(sumarAlEquipo, {});
  const activos = roles.filter((r) => r.activo);
  const accion = (fn: () => Promise<Estado>) => empezar(async () => setEstado(await fn()));

  return (
    <section className="tarjeta space-y-4">
      <h2 className="font-semibold">Personas <span className="text-sm font-normal text-texto-2">({personas.length})</span></h2>
      <ul className={`divide-y divide-gray-100 ${ocupado ? "opacity-60" : ""}`}>
        {personas.map((p) => {
          const cajasSucursal = puntosVenta.filter((pv) => pv.sucursal_id === p.sucursal_id);
          return (
            <li key={p.usuario_id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{p.nombre ?? p.email}{p.usuario_id === yo && <span className="ml-2 text-xs font-normal text-texto-2">(vos)</span>}</div>
                <div className="truncate text-xs text-texto-2">{p.email}</div>
              </div>

              {multisucursalActiva && (
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={p.sucursal_id ?? ""}
                    disabled={ocupado}
                    aria-label={`Sucursal de ${p.nombre ?? p.email}`}
                    className="campo w-auto py-1.5 text-xs"
                    onChange={(e) => {
                      const nuevaSucId = e.target.value ? Number(e.target.value) : null;
                      accion(() => asignarSucursalUsuario(p.usuario_id, nuevaSucId, null));
                    }}
                  >
                    <option value="">Sin sucursal asignada</option>
                    {sucursales.filter((s) => s.activa || s.id === p.sucursal_id).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nombre}
                      </option>
                    ))}
                  </select>

                  {p.sucursal_id && cajasSucursal.length > 0 && (
                    <select
                      value={p.punto_venta_id ?? ""}
                      disabled={ocupado}
                      aria-label={`Punto de venta de ${p.nombre ?? p.email}`}
                      className="campo w-auto py-1.5 text-xs"
                      onChange={(e) => {
                        const nuevaCajaId = e.target.value ? Number(e.target.value) : null;
                        accion(() => asignarSucursalUsuario(p.usuario_id, p.sucursal_id ?? null, nuevaCajaId));
                      }}
                    >
                      <option value="">Caja automática</option>
                      {cajasSucursal.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre} (P.V. {c.numero})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              <select value={p.rol_id} disabled={ocupado} aria-label={`Rol de ${p.nombre ?? p.email}`} className="campo w-auto py-1.5"
                onChange={(e) => accion(() => cambiarRol(p.email, Number(e.target.value)))}>
                {activos.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
              </select>
              {p.usuario_id !== yo && (
                <button type="button" disabled={ocupado} title="Sacar del equipo" aria-label={`Sacar a ${p.nombre ?? p.email} del equipo`}
                  onClick={() => confirm(`¿Sacar a ${p.nombre ?? p.email} del equipo? Va a seguir pudiendo comprar en la tienda; su historial queda.`) && accion(() => quitarDelEquipo(p.usuario_id))}
                  className="grid h-9 w-9 place-items-center rounded-lg text-gray-500 hover:bg-red-50 hover:text-error"><UserMinus size={17} /></button>
              )}
            </li>
          );
        })}
      </ul>
      <Mensaje e={estado} />

      <form action={aAlta} className="space-y-2 rounded-xl border border-dashed border-borde p-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><UserPlus size={16} /> Sumar a alguien</h3>
        <p className="text-xs text-texto-2">Primero tiene que crear su cuenta en la tienda (Registrate) y confirmar el email. Después lo sumás acá con ese email.</p>
        <div className="flex flex-wrap gap-2">
          <input name="email" type="email" required placeholder="email@ejemplo.com" className="campo min-w-0 flex-1" />
          <select name="rol_id" defaultValue={activos.find((r) => r.nombre === "Vendedor")?.id ?? activos[0]?.id} className="campo w-auto">
            {activos.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
          </select>
          <button className="boton" disabled={cAlta}>Sumar</button>
        </div>
        <Mensaje e={eAlta} />
      </form>
    </section>
  );
}
