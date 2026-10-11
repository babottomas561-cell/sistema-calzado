"use client";
// Ajuste masivo: 1) qué precio, 2) a qué artículos (filtros), 3) cómo, 4) vista previa y aplicar.
import { useMemo, useState, useTransition } from "react";
import { ArrowRight, CircleCheck, Eye, LoaderCircle } from "lucide-react";
import { pesos } from "@/lib/formato";
import { aplicar, previsualizar, type Cambio, type Parametros } from "./acciones";

export type Articulo = { id: number; codigo: string; nombre: string; marca: string | null; rubro: string | null;
  precio_venta: number; precio_compra: number | null; proveedores: number[] };

const MODOS = { porcentaje: "Subir o bajar un %", monto: "Subir o bajar $", fijo: "Poner un precio fijo", margen: "Costo + % (margen)" } as const;
const REDONDEOS = { ninguno: "Sin redondear", "10": "A $10", "100": "A $100", "1000": "A $1.000", "999": "Terminado en 999" } as const;

export default function AjustePrecios({ articulos, proveedores, puedeVenta, puedeCompra }: {
  articulos: Articulo[]; proveedores: { id: number; nombre: string }[]; puedeVenta: boolean; puedeCompra: boolean;
}) {
  const [que, setQue] = useState<"venta" | "compra">(puedeVenta ? "venta" : "compra");
  const [proveedor, setProveedor] = useState("");
  const [marca, setMarca] = useState("");
  const [rubro, setRubro] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [modo, setModo] = useState<Parametros["modo"]>("porcentaje");
  const [valor, setValor] = useState("");
  const [redondeo, setRedondeo] = useState<Parametros["redondeo"]>(puedeVenta ? "999" : "ninguno");
  const [cambios, setCambios] = useState<Cambio[] | null>(null);
  const [fuera, setFuera] = useState<Set<number>>(new Set());   // destildados en la vista previa
  const [mensaje, setMensaje] = useState<{ error?: string; ok?: string }>({});
  const [ocupado, empezar] = useTransition();

  const marcas = [...new Set(articulos.map((a) => a.marca).filter(Boolean))].sort() as string[];
  const rubros = [...new Set(articulos.map((a) => a.rubro).filter(Boolean))].sort() as string[];
  const elegidos = useMemo(() => articulos.filter((a) =>
    (!proveedor || a.proveedores.includes(Number(proveedor))) && (!marca || a.marca === marca) && (!rubro || a.rubro === rubro) &&
    (!busqueda || `${a.nombre} ${a.codigo}`.toLowerCase().includes(busqueda.toLowerCase()))), [articulos, proveedor, marca, rubro, busqueda]);

  // Cualquier cambio en los filtros o el ajuste invalida la vista previa
  const reiniciar = () => { setCambios(null); setFuera(new Set()); setMensaje({}); };
  const descripcion = [que === "venta" ? "Venta" : "Compra",
    proveedor && `Proveedor ${proveedores.find((p) => p.id === Number(proveedor))?.nombre}`, marca && `Marca ${marca}`, rubro && `Rubro ${rubro}`,
    busqueda && `"${busqueda}"`, `${MODOS[modo]}: ${valor}`, redondeo !== "ninguno" && REDONDEOS[redondeo]].filter(Boolean).join(" · ");
  const parametros = (productos: number[]): Parametros => ({
    que, productos, modo, valor: Number(valor), redondeo, proveedor: que === "compra" && proveedor ? Number(proveedor) : null, descripcion });

  const verCambios = () => empezar(async () => {
    setMensaje({});
    const r = await previsualizar(parametros(elegidos.map((a) => a.id)));
    if (r.error) { setMensaje({ error: r.error }); setCambios(null); } else { setCambios(r.cambios ?? []); setFuera(new Set()); }
  });
  const aAplicar = (cambios ?? []).filter((c) => !fuera.has(c.producto_id));
  const confirmar = () => {
    if (!confirm(`¿Cambiar el precio de ${que} de ${aAplicar.length} artículo${aAplicar.length === 1 ? "" : "s"}?`)) return;
    empezar(async () => {
      const r = await aplicar(parametros(aAplicar.map((c) => c.producto_id)));
      if (r.error) setMensaje({ error: r.error });
      else { setMensaje({ ok: `Listo: ${r.cambios?.length} precio${r.cambios?.length === 1 ? "" : "s"} actualizado${r.cambios?.length === 1 ? "" : "s"}. Si te equivocaste, deshacelo en el historial.` }); setCambios(null); }
    });
  };
  const variacion = (c: Cambio) => (c.precio_anterior > 0 ? Math.round(((c.precio_nuevo - c.precio_anterior) / c.precio_anterior) * 1000) / 10 : null);

  return (
    <section className="tarjeta space-y-5">
      {/* 1. Qué precio */}
      {puedeVenta && puedeCompra && (
        <div className="inline-flex rounded-lg border border-borde p-0.5 text-sm">
          {(["venta", "compra"] as const).map((q) => (
            <button key={q} type="button" onClick={() => { setQue(q); if (q === "compra" && modo === "margen") setModo("porcentaje"); setRedondeo(q === "venta" ? "999" : "ninguno"); reiniciar(); }}
              className={`rounded-md px-4 py-1.5 font-semibold ${que === q ? "bg-marca text-white" : "text-texto-2"}`}>Precio de {q}</button>
          ))}
        </div>
      )}

      {/* 2. A qué artículos */}
      <div className="space-y-2">
        <div className="etiqueta">¿A qué artículos?</div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {proveedores.length > 0 && (
            <select value={proveedor} onChange={(e) => { setProveedor(e.target.value); reiniciar(); }} className="campo" aria-label="Proveedor">
              <option value="">{que === "compra" ? "Costo de referencia (sin proveedor)" : "Todos los proveedores"}</option>
              {proveedores.map((p) => <option key={p.id} value={p.id}>{que === "compra" ? `Lista de ${p.nombre}` : p.nombre}</option>)}
            </select>
          )}
          <select value={marca} onChange={(e) => { setMarca(e.target.value); reiniciar(); }} className="campo" aria-label="Marca">
            <option value="">Todas las marcas</option>{marcas.map((m) => <option key={m}>{m}</option>)}
          </select>
          <select value={rubro} onChange={(e) => { setRubro(e.target.value); reiniciar(); }} className="campo" aria-label="Rubro">
            <option value="">Todos los rubros</option>{rubros.map((r) => <option key={r}>{r}</option>)}
          </select>
          <input value={busqueda} onChange={(e) => { setBusqueda(e.target.value); reiniciar(); }} placeholder="Modelo o código…" className="campo" aria-label="Buscar artículo" />
        </div>
        <p className="text-xs text-texto-2">{elegidos.length} artículo{elegidos.length === 1 ? "" : "s"}
          {que === "compra" && proveedor ? " de ese proveedor: se cambia su precio de lista (respeta su bonificación) y, si es el principal, el costo de referencia." : ""}</p>
      </div>

      {/* 3. Cómo */}
      <div className="grid gap-2 sm:grid-cols-3">
        <div><label className="etiqueta">Ajuste</label>
          <select value={modo} onChange={(e) => { setModo(e.target.value as Parametros["modo"]); reiniciar(); }} className="campo">
            {Object.entries(MODOS).filter(([k]) => k !== "margen" || que === "venta").map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select></div>
        <div><label className="etiqueta">{modo === "porcentaje" || modo === "margen" ? "Porcentaje (%)" : "Monto ($)"}</label>
          <input type="number" step="any" value={valor} onChange={(e) => { setValor(e.target.value); reiniciar(); }} className="campo"
            placeholder={modo === "porcentaje" ? "8 (o −10 para bajar)" : modo === "monto" ? "5000 (o −5000)" : modo === "margen" ? "90" : "199999"} /></div>
        <div><label className="etiqueta">Redondeo</label>
          <select value={redondeo} onChange={(e) => { setRedondeo(e.target.value as Parametros["redondeo"]); reiniciar(); }} className="campo">
            {Object.entries(REDONDEOS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select></div>
      </div>
      {modo === "margen" && <p className="-mt-3 text-xs text-texto-2">Precio de venta = último costo de compra + ese %. Ejemplo: costo $100.000 + 90 % = $190.000.</p>}

      <button type="button" onClick={verCambios} disabled={ocupado || !elegidos.length || valor === ""} className="boton-sec">
        {ocupado && !cambios ? <LoaderCircle size={16} className="animate-spin" /> : <Eye size={16} />} Ver cambios
      </button>

      {/* 4. Vista previa */}
      {cambios && (
        <div className="space-y-3 border-t border-borde pt-4">
          {cambios.length === 0 ? <p className="text-sm text-texto-2">Con ese ajuste ningún precio cambia.</p> : (
            <>
              <ul className="max-h-[28rem] divide-y divide-gray-100 overflow-y-auto rounded-lg border border-borde">
                {cambios.map((c) => {
                  const v = variacion(c);
                  return (
                    <li key={c.producto_id} className={`flex items-center gap-3 px-3 py-2 text-sm ${fuera.has(c.producto_id) ? "opacity-40" : ""}`}>
                      <input type="checkbox" checked={!fuera.has(c.producto_id)} aria-label={`Incluir ${c.nombre}`}
                        onChange={() => setFuera((f) => { const n = new Set(f); if (n.has(c.producto_id)) n.delete(c.producto_id); else n.add(c.producto_id); return n; })} />
                      <span className="min-w-0 flex-1"><span className="block truncate font-medium">{c.nombre}</span><span className="font-mono text-xs text-texto-2">{c.codigo}</span></span>
                      <span className="shrink-0 text-right tabular-nums">
                        <span className="text-texto-2 line-through">{pesos(c.precio_anterior)}</span>
                        <ArrowRight size={13} className="mx-1 inline text-gray-400" />
                        <b>{pesos(c.precio_nuevo)}</b>
                        {v !== null && <span className={`ml-1.5 text-xs ${v >= 0 ? "text-alerta" : "text-ok"}`}>{v > 0 ? "+" : ""}{String(v).replace(".", ",")} %</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <button type="button" onClick={confirmar} disabled={ocupado || !aAplicar.length} className="boton w-full sm:w-auto">
                {ocupado ? <LoaderCircle size={16} className="animate-spin" /> : <CircleCheck size={16} />} Aplicar a {aAplicar.length} artículo{aAplicar.length === 1 ? "" : "s"}
              </button>
            </>
          )}
        </div>
      )}
      {mensaje.error && <p className="text-sm text-error">{mensaje.error}</p>}
      {mensaje.ok && <p className="flex items-center gap-1.5 text-sm text-ok"><CircleCheck size={16} /> {mensaje.ok}</p>}
    </section>
  );
}
