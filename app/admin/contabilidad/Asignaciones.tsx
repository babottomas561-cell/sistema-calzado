"use client";
// Qué cuenta usa cada cosa. Se configura por grupo (línea, rubro) y solo lo particular va aparte: un artículo sin cuenta usa la de su rubro, y un rubro
// sin cuenta, la de su línea. Cada lista se guarda al elegir. Arriba, lo que falta asignar (lo que hoy cae en una cuenta general o no tiene cuenta).
import { useState, useTransition } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";
import { asignar, type Estado } from "./acciones";
import { porCodigo, type Cuenta } from "./PlanCuentas";

export type Fila = { id: string; nombre: string; detalle?: string | null; cuenta_id: number | null; cuenta2_id?: number | null };
export type SinAsignar = { que: string; id: string; nombre: string; detalle: string };

function Selector({ cuentas, tipos, valor, vacio, alCambiar, etiqueta, deshabilitado }: {
  cuentas: Cuenta[]; tipos: string[]; valor: number | null; vacio?: string; alCambiar: (v: number | null) => void; etiqueta: string; deshabilitado: boolean;
}) {
  const opciones = cuentas.filter((c) => c.imputable && c.activa && tipos.includes(c.tipo)).sort(porCodigo);
  return (
    <select value={valor ?? ""} disabled={deshabilitado} onChange={(e) => alCambiar(e.target.value ? Number(e.target.value) : null)} aria-label={etiqueta} className="campo h-10 py-1.5 text-sm">
      {vacio !== undefined && <option value="">{vacio}</option>}
      {valor && !opciones.some((o) => o.id === valor) && <option value={valor}>(cuenta desactivada)</option>}
      {opciones.map((o) => <option key={o.id} value={o.id}>{o.codigo} · {o.nombre}</option>)}
    </select>
  );
}

function Grupo({ titulo, explicacion, filas, que, columnas, cuentas, puedeEditar }: {
  titulo: string; explicacion: string; filas: Fila[]; que: string; cuentas: Cuenta[]; puedeEditar: boolean;
  columnas: { campo: string; titulo: string; tipos: string[]; vacio?: string; segunda?: boolean }[];
}) {
  const [valores, setValores] = useState<Record<string, number | null>>(() => Object.fromEntries(filas.flatMap((f) => columnas.map((c) => [`${f.id}:${c.campo}`, (c.segunda ? f.cuenta2_id : f.cuenta_id) ?? null]))));
  const [estado, setEstado] = useState<Record<string, Estado>>({});
  const [, hacer] = useTransition();
  const cambiar = (id: string, campo: string, cuenta: number | null) => {
    const k = `${id}:${campo}`;
    setValores((v) => ({ ...v, [k]: cuenta }));
    hacer(async () => { const r = await asignar(que, id, campo, cuenta); setEstado((e) => ({ ...e, [k]: r })); });
  };
  return (
    <section className="tarjeta space-y-3">
      <div><h3 className="font-semibold">{titulo}</h3><p className="text-sm text-texto-2">{explicacion}</p></div>
      <div className="hidden gap-3 border-b border-borde pb-1 text-xs font-semibold text-texto-2 sm:grid" style={{ gridTemplateColumns: `minmax(0,14rem) repeat(${columnas.length}, minmax(0,1fr))` }}>
        <span>{titulo.split(" ")[0]}</span>{columnas.map((c) => <span key={c.campo}>{c.titulo}</span>)}
      </div>
      <ul className="divide-y divide-gray-100">
        {filas.map((f) => (
          <li key={f.id} className="grid gap-2 py-2 sm:items-center sm:gap-3" style={{ gridTemplateColumns: `minmax(0,14rem) repeat(${columnas.length}, minmax(0,1fr))` }}>
            <div className="min-w-0"><p className="truncate font-medium">{f.nombre}</p>{f.detalle && <p className="truncate text-xs text-texto-2">{f.detalle}</p>}</div>
            {columnas.map((c) => {
              const k = `${f.id}:${c.campo}`, e = estado[k];
              return (
                <div key={c.campo} className="min-w-0">
                  <Selector cuentas={cuentas} tipos={c.tipos} valor={valores[k]} vacio={c.vacio} etiqueta={`${c.titulo} de ${f.nombre}`} deshabilitado={!puedeEditar} alCambiar={(v) => cambiar(f.id, c.campo, v)} />
                  {e?.error && <p className="mt-0.5 text-xs text-error">{e.error}</p>}
                  {e?.ok && <p className="mt-0.5 text-xs text-ok">Guardado</p>}
                </div>
              );
            })}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function Asignaciones({ cuentas, lineas, rubros, medios, gastos, conceptos, faltan, puedeEditar }: {
  cuentas: Cuenta[]; lineas: Fila[]; rubros: Fila[]; medios: Fila[]; gastos: Fila[]; conceptos: Fila[]; faltan: SinAsignar[]; puedeEditar: boolean;
}) {
  return (
    <div className="space-y-4">
      {faltan.length > 0 ? (
        <section className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4" aria-labelledby="faltan">
          <h3 id="faltan" className="flex items-center gap-2 font-semibold text-amber-900"><CircleAlert size={18} /> Qué falta asignar ({faltan.length})</h3>
          <ul className="space-y-1 text-sm text-amber-950">{faltan.map((x) => <li key={`${x.que}-${x.id}`}><b>{x.nombre}</b> · {x.detalle}</li>)}</ul>
        </section>
      ) : (
        <p className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 p-3 text-sm font-semibold text-ok"><CircleCheck size={18} /> Todo tiene su cuenta.</p>
      )}
      <Grupo titulo="Líneas" que="linea" filas={lineas} cuentas={cuentas} puedeEditar={puedeEditar}
        explicacion="Lo de fábrica para todos los artículos de cada línea: a qué cuenta va lo vendido y su costo."
        columnas={[{ campo: "venta", titulo: "Ventas", tipos: ["ingreso"] }, { campo: "costo", titulo: "Costo de lo vendido", tipos: ["costo"], segunda: true }]} />
      <Grupo titulo="Rubros" que="rubro" filas={rubros} cuentas={cuentas} puedeEditar={puedeEditar}
        explicacion="Solo si un rubro tiene que ir aparte de su línea. Vacío = el de su línea. (Un artículo puntual se cambia en su ficha.)"
        columnas={[{ campo: "venta", titulo: "Ventas", tipos: ["ingreso"], vacio: "Como su línea" }, { campo: "costo", titulo: "Costo de lo vendido", tipos: ["costo"], vacio: "Como su línea", segunda: true }]} />
      <Grupo titulo="Medios de pago" que="medio" filas={medios} cuentas={cuentas} puedeEditar={puedeEditar}
        explicacion="A qué cuenta entra la plata de cada cobro (el efectivo a la Caja, las tarjetas a «Tarjetas a cobrar»…)."
        columnas={[{ campo: "fondos", titulo: "Cuenta", tipos: ["activo", "pasivo"], vacio: "Sin cuenta" }]} />
      <Grupo titulo="Categorías de gasto" que="gasto" filas={gastos} cuentas={cuentas} puedeEditar={puedeEditar}
        explicacion="Cada gasto (a mano, fijo o automático) va a la cuenta de su categoría."
        columnas={[{ campo: "gasto", titulo: "Cuenta", tipos: ["gasto", "costo"], vacio: "Otros gastos" }]} />
      <Grupo titulo="Conceptos de compra" que="concepto" filas={conceptos} cuentas={cuentas} puedeEditar={puedeEditar}
        explicacion="Lo que se compra además de mercadería (insumos, servicios, muebles): a qué cuenta va al cargar la factura del proveedor."
        columnas={[{ campo: "concepto", titulo: "Cuenta", tipos: ["activo", "gasto", "costo"] }]} />
    </div>
  );
}
