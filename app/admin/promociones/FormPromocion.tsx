"use client";
// Alta o edición de una promoción: tipo y su regla, vigencia, dónde vale y a qué artículos aplica.
import { useActionState, useState } from "react";
import { CircleCheck, X } from "lucide-react";
import { guardarPromocion, type Estado } from "./acciones";

export type Opcion = { id: number; nombre: string };
export type Promocion = {
  id: number; nombre: string; tipo: string; lleva: number | null; paga: number | null; descuento_pct: number | null; precio_fijo: number | null;
  desde: string | null; hasta: string | null; activa: boolean; en_tienda: boolean; en_mostrador: boolean; acumula_medio_pago: boolean;
  mezcla: boolean; prioridad: number;
  promocion_alcances: { marca_id: number | null; categoria_id: number | null; subcategoria_id: number | null; producto_id: number | null; excluir: boolean }[];
};

const TIPOS = { nxm: "Lleva N, paga M (2×1, 3×2)", segunda_unidad: "2da unidad con descuento", porcentaje: "% off", precio_fijo: "Precio especial" } as const;

// Día argentino (AAAA-MM-DD) de un timestamp; "hasta" se guarda como el día siguiente a las 0 h
const dia = (iso: string | null, menosUno = false) => {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() - (menosUno ? 86_400_000 : 0));
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(d);
};

// Elegir varios de una lista con chips tildables (los elegidos viajan como inputs ocultos)
function Elegir({ titulo, nombre, opciones, elegidos, setElegidos, buscar = false }: {
  titulo: string; nombre: string; opciones: Opcion[]; elegidos: number[]; setElegidos: (v: number[]) => void; buscar?: boolean;
}) {
  const [q, setQ] = useState("");
  const visibles = buscar && q ? opciones.filter((o) => o.nombre.toLowerCase().includes(q.toLowerCase())) : buscar ? opciones.filter((o) => elegidos.includes(o.id)) : opciones;
  return (
    <div>
      <div className="etiqueta">{titulo}</div>
      {buscar && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar artículo…" className="campo mb-1.5 py-1.5" />}
      <div className="flex flex-wrap gap-1.5">
        {visibles.slice(0, 40).map((o) => {
          const on = elegidos.includes(o.id);
          return (
            <button key={o.id} type="button" onClick={() => setElegidos(on ? elegidos.filter((x) => x !== o.id) : [...elegidos, o.id])}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${on ? "border-marca bg-marca text-white" : "border-borde bg-white hover:border-marca"}`}>
              {o.nombre}{on && <X size={12} />}
            </button>
          );
        })}
        {buscar && !q && !elegidos.length && <span className="text-xs text-texto-2">Ninguno</span>}
      </div>
      {elegidos.map((id) => <input key={id} type="hidden" name={nombre} value={id} />)}
    </div>
  );
}

export default function FormPromocion({ promo, marcas, rubros, subrubros, productos, alGuardar }: {
  promo?: Promocion; marcas: Opcion[]; rubros: Opcion[]; subrubros: Opcion[]; productos: Opcion[]; alGuardar?: () => void;
}) {
  const al = promo?.promocion_alcances ?? [];
  const de = (campo: "marca_id" | "categoria_id" | "subcategoria_id" | "producto_id", excluir = false) =>
    al.filter((a) => a[campo] !== null && a.excluir === excluir).map((a) => a[campo]!) as number[];
  const [tipo, setTipo] = useState(promo?.tipo ?? "nxm");
  const [marcasSel, setMarcas] = useState(de("marca_id"));
  const [rubrosSel, setRubros] = useState(de("categoria_id"));
  const [subrubrosSel, setSubrubros] = useState(de("subcategoria_id"));
  const [productosSel, setProductos] = useState(de("producto_id"));
  const [excluidos, setExcluidos] = useState(de("producto_id", true));
  const [estado, accion, cargando] = useActionState(async (prev: Estado, f: FormData) => {
    const r = await guardarPromocion(prev, f);
    if (r.ok) alGuardar?.();
    return r;
  }, {});

  return (
    <form action={accion} className="space-y-4">
      {promo && <input type="hidden" name="id" value={promo.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="etiqueta">Nombre (lo ve el cliente)</label><input name="nombre" required defaultValue={promo?.nombre} placeholder="2×1 en Adidas" className="campo" /></div>
        <div><label className="etiqueta">Tipo</label>
          <select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} className="campo">
            {Object.entries(TIPOS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select></div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tipo === "nxm" && <>
          <div><label className="etiqueta">Lleva</label><input name="lleva" type="number" min={2} defaultValue={promo?.lleva ?? 2} className="campo" /></div>
          <div><label className="etiqueta">Paga</label><input name="paga" type="number" min={1} defaultValue={promo?.paga ?? 1} className="campo" /></div>
        </>}
        {(tipo === "segunda_unidad" || tipo === "porcentaje") &&
          <div><label className="etiqueta">{tipo === "segunda_unidad" ? "% off en la 2da" : "% off"}</label>
            <input name="descuento_pct" type="number" min={1} max={100} step="0.5" defaultValue={promo?.descuento_pct ?? (tipo === "segunda_unidad" ? 50 : 20)} className="campo" /></div>}
        {tipo === "precio_fijo" &&
          <div><label className="etiqueta">Precio ($)</label><input name="precio_fijo" type="number" min={0} defaultValue={promo?.precio_fijo ?? ""} className="campo" /></div>}
        <div><label className="etiqueta">Desde</label><input name="desde" type="date" defaultValue={dia(promo?.desde ?? null)} className="campo" /></div>
        <div><label className="etiqueta">Hasta (inclusive)</label><input name="hasta" type="date" defaultValue={dia(promo?.hasta ?? null, true)} className="campo" /></div>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" name="en_tienda" defaultChecked={promo?.en_tienda ?? true} /> En la tienda web</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="en_mostrador" defaultChecked={promo?.en_mostrador ?? true} /> En el local</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="acumula_medio_pago" defaultChecked={promo?.acumula_medio_pago ?? true} /> Se suma el descuento del medio de pago</label>
        {(tipo === "nxm" || tipo === "segunda_unidad") &&
          <label className="flex items-center gap-2"><input type="checkbox" name="mezcla" defaultChecked={promo?.mezcla ?? true} /> Vale combinando modelos distintos</label>}
        <label className="flex items-center gap-2">Prioridad <input name="prioridad" type="number" defaultValue={promo?.prioridad ?? 0} className="campo w-20 py-1" /></label>
      </div>

      <fieldset className="space-y-3 rounded-xl border border-borde p-3">
        <legend className="px-1 text-sm font-semibold">¿A qué aplica?</legend>
        <Elegir titulo="Marcas" nombre="marca_ids" opciones={marcas} elegidos={marcasSel} setElegidos={setMarcas} />
        <Elegir titulo="Rubros" nombre="categoria_ids" opciones={rubros} elegidos={rubrosSel} setElegidos={setRubros} />
        {subrubros.length > 0 && <Elegir titulo="Subrubros" nombre="subcategoria_ids" opciones={subrubros} elegidos={subrubrosSel} setElegidos={setSubrubros} />}
        <Elegir titulo="Artículos sueltos" nombre="producto_ids" opciones={productos} elegidos={productosSel} setElegidos={setProductos} buscar />
        <Elegir titulo="Menos estos artículos" nombre="excluir_ids" opciones={productos} elegidos={excluidos} setElegidos={setExcluidos} buscar />
      </fieldset>

      {estado.error && <p className="text-sm text-error">{estado.error}</p>}
      {estado.ok && <p className="flex items-center gap-1.5 text-sm text-ok"><CircleCheck size={16} /> {estado.ok}</p>}
      <button className="boton" disabled={cargando}>{promo ? "Guardar promoción" : "Crear promoción"}</button>
    </form>
  );
}
