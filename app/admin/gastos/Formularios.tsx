"use client";
// Formularios de Gastos: cargar un gasto (en pesos o dólares), un gasto fijo por mes y la cotización del dólar.
import { useActionState, useState } from "react";
import { CircleCheck } from "lucide-react";
import { pesos } from "@/lib/formato";
import { cargarFijo, cargarGasto, guardarDolar } from "./acciones";

type Opcion = { id: number; nombre: string };

function Aviso({ estado }: { estado: { error?: string; ok?: string } }) {
  if (estado.error) return <p className="text-sm text-error">{estado.error}</p>;
  if (estado.ok) return <p className="flex items-center gap-1.5 text-sm text-ok"><CircleCheck size={15} /> {estado.ok}</p>;
  return null;
}

// Importe con su moneda; en dólares muestra cuánto da en pesos
function Importe({ dolar, cotizacionEditable = false }: { dolar: number; cotizacionEditable?: boolean }) {
  const [moneda, setMoneda] = useState<"ARS" | "USD">("ARS");
  const [importe, setImporte] = useState("");
  const [cotizacion, setCotizacion] = useState(String(dolar));
  return (
    <div className="space-y-1">
      <div className="grid grid-cols-[5.5rem_1fr] gap-2">
        <select name="moneda" value={moneda} onChange={(e) => setMoneda(e.target.value as "ARS" | "USD")} className="campo" aria-label="Moneda">
          <option value="ARS">$</option><option value="USD">US$</option>
        </select>
        <input name="importe" type="number" min={0.01} step="0.01" required value={importe} onChange={(e) => setImporte(e.target.value)} placeholder="Importe" className="campo" aria-label="Importe" />
      </div>
      {moneda === "USD" && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-texto-2">
          {cotizacionEditable
            ? <label className="flex items-center gap-1">Dólar a $<input name="cotizacion" type="number" min={1} step="0.01" value={cotizacion} onChange={(e) => setCotizacion(e.target.value)} className="campo w-24 py-1" /></label>
            : <span>Dólar del sistema: {pesos(dolar)}</span>}
          {Number(importe) > 0 && <span>= <b>{pesos(Number(importe) * Number(cotizacionEditable ? cotizacion : dolar))}</b></span>}
        </div>
      )}
    </div>
  );
}

export function CargarGasto({ categorias, proveedores, dolar, hoy }: { categorias: Opcion[]; proveedores: Opcion[]; dolar: number; hoy: string }) {
  const [estado, accion, guardando] = useActionState(cargarGasto, {});
  return (
    <form action={accion} key={estado.vez ?? 0} className="tarjeta space-y-3">
      <h2 className="font-semibold">Cargar un gasto</h2>
      <div className="grid grid-cols-2 gap-2">
        <input name="fecha" type="date" defaultValue={hoy} className="campo" aria-label="Fecha" />
        <select name="categoria_id" required className="campo" aria-label="Categoría">
          {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </div>
      <input name="descripcion" required maxLength={120} placeholder="Qué es (luz, bolsas, publicidad en Instagram…)" className="campo" aria-label="Descripción" />
      <Importe dolar={dolar} cotizacionEditable />
      <select name="proveedor_id" className="campo" aria-label="Proveedor">
        <option value="">Sin proveedor</option>
        {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
      </select>
      <input name="nota" maxLength={200} placeholder="Nota (opcional)" className="campo" aria-label="Nota" />
      <Aviso estado={estado} />
      <button className="boton w-full" disabled={guardando}>{guardando ? "Guardando…" : "Cargar gasto"}</button>
    </form>
  );
}

export function CargarFijo({ categorias, dolar }: { categorias: Opcion[]; dolar: number }) {
  const [estado, accion, guardando] = useActionState(cargarFijo, {});
  return (
    <form action={accion} key={estado.vez ?? 0} className="space-y-2 border-t border-borde pt-3">
      <p className="text-sm font-semibold">Agregar un gasto fijo</p>
      <input name="descripcion" required maxLength={120} placeholder="Vercel, Supabase, alquiler…" className="campo" aria-label="Descripción del fijo" />
      <select name="categoria_id" required className="campo" aria-label="Categoría del fijo">
        {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
      </select>
      <Importe dolar={dolar} />
      <label className="flex items-center gap-2 text-sm text-texto-2">Se carga el día
        <input name="dia" type="number" min={1} max={28} defaultValue={1} className="campo w-20 py-1.5" /> de cada mes</label>
      <Aviso estado={estado} />
      <button className="boton-sec w-full py-2" disabled={guardando}>{guardando ? "Guardando…" : "Agregar fijo"}</button>
    </form>
  );
}

export function Dolar({ dolar }: { dolar: number }) {
  const [estado, accion, guardando] = useActionState(guardarDolar, {});
  return (
    <form action={accion} className="flex flex-wrap items-center gap-2 text-sm">
      <label className="flex items-center gap-2">Dólar <span className="text-texto-2">$</span>
        <input name="dolar" type="number" min={1} step="0.01" defaultValue={dolar} className="campo w-28 py-1.5" aria-label="Cotización del dólar" /></label>
      <button className="boton-sec py-1.5" disabled={guardando}>{guardando ? "…" : "Guardar"}</button>
      <Aviso estado={estado} />
    </form>
  );
}
