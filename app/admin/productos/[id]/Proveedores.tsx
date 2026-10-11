"use client";
// Proveedores que venden este artículo y a cuánto: precio de lista − bonificación = precio de compra.
// Al cargar una factura de ese proveedor se propone su precio, y la compra lo actualiza.
import Link from "next/link";
import { useActionState } from "react";
import { BadgeCheck, CircleCheck, Plus, Trash2 } from "lucide-react";
import { fecha, pesos } from "@/lib/formato";
import { guardarProveedor } from "../acciones";

export type FilaProveedor = { id: number; proveedor_id: number; codigo_proveedor: string | null; precio_lista: number; bonificacion_pct: number;
  precio_compra: number; principal: boolean; actualizado_en: string; proveedores: { nombre: string } };

function Fila({ productoId, f, masBarato }: { productoId: number; f?: FilaProveedor; masBarato?: boolean; }) {
  const [estado, accion, cargando] = useActionState(guardarProveedor, {});
  return (
    <form action={accion} className="grid grid-cols-2 items-end gap-2 border-b border-borde py-3 last:border-0 sm:grid-cols-[1.4fr_1fr_1fr_.7fr_1fr_auto]">
      <input type="hidden" name="producto_id" value={productoId} />
      {f && <input type="hidden" name="id" value={f.id} />}
      <div className="col-span-2 sm:col-span-1">
        {f ? <div className="font-semibold">{f.proveedores.nombre}
              <div className="flex flex-wrap gap-1 pt-0.5">
                {f.principal && <span className="chip bg-blue-50 text-marca"><BadgeCheck size={12} className="mr-0.5" /> principal</span>}
                {masBarato && <span className="chip bg-green-100 text-ok">más barato</span>}
                <span className="text-[11px] font-normal text-texto-2">act. {fecha(f.actualizado_en)}</span></div></div>
           : null}
      </div>
      <label className="text-xs text-texto-2">Su código<input name="codigo_proveedor" defaultValue={f?.codigo_proveedor ?? ""} placeholder="—" className="campo mt-0.5 py-1.5" /></label>
      <label className="text-xs text-texto-2">Precio de lista<input name="precio_lista" type="number" min="0" step="0.01" required defaultValue={f?.precio_lista ?? ""} className="campo mt-0.5 py-1.5" /></label>
      <label className="text-xs text-texto-2">Bonif. %<input name="bonificacion_pct" type="number" min="0" max="99" step="0.5" defaultValue={f?.bonificacion_pct ?? 0} className="campo mt-0.5 py-1.5" /></label>
      <div className="text-xs text-texto-2">Precio de compra<div className="py-1.5 text-base font-bold text-gray-900">{f ? pesos(f.precio_compra) : "—"}</div></div>
      <div className="col-span-2 flex items-center gap-2 sm:col-span-1">
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="principal" defaultChecked={f?.principal ?? false} /> Principal</label>
        <button className={f ? "boton-sec px-3 py-1.5" : "boton px-3 py-1.5"} disabled={cargando}>{f ? "Guardar" : <><Plus size={15} /> Agregar</>}</button>
        {f && <button name="_accion" value="quitar" className="grid h-8 w-8 place-items-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-error" title="Quitar" disabled={cargando}><Trash2 size={15} /></button>}
      </div>
      {estado.error && <p className="col-span-full text-sm text-error">{estado.error}</p>}
      {estado.ok && <p className="col-span-full flex items-center gap-1 text-sm text-ok"><CircleCheck size={15} /> {estado.ok}</p>}
    </form>
  );
}

export default function Proveedores({ productoId, filas, todos }: { productoId: number; filas: FilaProveedor[]; todos: { id: number; nombre: string }[] }) {
  const minimo = Math.min(...filas.map((f) => Number(f.precio_compra)));
  const libres = todos.filter((p) => !filas.some((f) => f.proveedor_id === p.id));
  return (
    <section className="tarjeta">
      <h2 className="font-semibold">Proveedores y precios de compra</h2>
      <p className="mb-1 text-xs text-texto-2">Al cargar una factura de compra se propone el precio de ese proveedor, y la compra lo actualiza.</p>
      {filas.map((f) => <Fila key={`${f.id}-${f.precio_lista}-${f.bonificacion_pct}-${f.principal}-${f.codigo_proveedor}`} productoId={productoId} f={f}
        masBarato={filas.length > 1 && Number(f.precio_compra) === minimo} />)}
      {libres.length > 0 ? <AgregarProveedor productoId={productoId} libres={libres} />
        : <p className="pt-2 text-xs text-texto-2">Ya están todos los proveedores. <Link href="/admin/proveedores" className="font-semibold text-marca">Dar de alta otro</Link></p>}
    </section>
  );
}

// Fila de alta: igual a las otras pero con el desplegable de proveedores que todavía no están
function AgregarProveedor({ productoId, libres }: { productoId: number; libres: { id: number; nombre: string }[] }) {
  const [estado, accion, cargando] = useActionState(guardarProveedor, {});
  return (
    <form action={accion} className="grid grid-cols-2 items-end gap-2 pt-3 sm:grid-cols-[1.4fr_1fr_1fr_.7fr_1fr_auto]">
      <input type="hidden" name="producto_id" value={productoId} />
      <label className="col-span-2 text-xs text-texto-2 sm:col-span-1">Agregar proveedor
        <select name="proveedor_id" required className="campo mt-0.5 py-1.5"><option value="">Elegí…</option>{libres.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></label>
      <label className="text-xs text-texto-2">Su código<input name="codigo_proveedor" placeholder="—" className="campo mt-0.5 py-1.5" /></label>
      <label className="text-xs text-texto-2">Precio de lista<input name="precio_lista" type="number" min="0" step="0.01" required className="campo mt-0.5 py-1.5" /></label>
      <label className="text-xs text-texto-2">Bonif. %<input name="bonificacion_pct" type="number" min="0" max="99" step="0.5" defaultValue={0} className="campo mt-0.5 py-1.5" /></label>
      <div />
      <div className="col-span-2 flex items-center gap-2 sm:col-span-1">
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="principal" /> Principal</label>
        <button className="boton px-3 py-1.5" disabled={cargando}><Plus size={15} /> Agregar</button>
      </div>
      {estado.error && <p className="col-span-full text-sm text-error">{estado.error}</p>}
    </form>
  );
}
