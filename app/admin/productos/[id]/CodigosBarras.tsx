"use client";
// Códigos de barras de un artículo: uno por talle y color. Se escriben o se escanean con un lector (el lector «escribe» el
// código y manda Enter: se guarda y pasa solo a la variante siguiente, así se cargan todos los talles de corrido).
// Para lo que no trae código, «Generar» arma uno propio (EAN-13 que empieza en 200).
import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Check, CircleAlert, Printer, ScanBarcode, Wand2 } from "lucide-react";
import { esCodigoPropio, normalizarCodigo, ROTULO_TIPO, tipoDeCodigo, validarCodigo } from "@/lib/codigos";
import { generarCodigosBarras, guardarCodigoBarras } from "../acciones";

export type VarianteCodigo = { id: number; talle: string; talle_orden: number | null; color: string; sku: string | null; codigo_barras: string | null };
type Fila = { guardado: string; texto: string; error?: string; guardando?: boolean; ok?: boolean };

export default function CodigosBarras({ productoId, variantes, edita }: { productoId: number; variantes: VarianteCodigo[]; edita: boolean }) {
  const orden = [...variantes].sort((a, b) => a.color.localeCompare(b.color) || Number(a.talle_orden ?? 999) - Number(b.talle_orden ?? 999));
  const [filas, setFilas] = useState<Record<number, Fila>>(() => Object.fromEntries(variantes.map((v) => [v.id, { guardado: v.codigo_barras ?? "", texto: v.codigo_barras ?? "" }])));
  const [general, setGeneral] = useState<{ error?: string; ok?: string }>({});
  const [generando, generar] = useTransition();
  const campos = useRef<Record<number, HTMLInputElement | null>>({});

  const poner = (id: number, cambio: Partial<Fila>) => setFilas((f) => ({ ...f, [id]: { ...f[id], ...cambio } }));
  const faltan = orden.filter((v) => !filas[v.id]?.guardado);

  async function guardar(id: number): Promise<boolean> {
    const f = filas[id];
    const texto = normalizarCodigo(f.texto);
    if (texto === f.guardado) { poner(id, { texto, error: undefined }); return true; }
    const falla = validarCodigo(texto);
    if (falla) { poner(id, { error: falla, ok: false }); return false; }
    poner(id, { guardando: true, error: undefined });
    const r = await guardarCodigoBarras(id, texto);
    if (r.error) { poner(id, { guardando: false, error: r.error, ok: false }); return false; }
    poner(id, { guardando: false, guardado: r.codigo ?? "", texto: r.codigo ?? "", ok: true, error: undefined });
    return true;
  }
  const irAlSiguiente = (id: number) => { const i = orden.findIndex((v) => v.id === id); const sig = orden[i + 1]; if (sig) campos.current[sig.id]?.focus(); };

  const generarFaltantes = () => generar(async () => {
    setGeneral({});
    const r = await generarCodigosBarras(faltan.map((v) => v.id));
    if (r.error) { setGeneral({ error: r.error }); return; }
    setFilas((f) => { const n = { ...f }; for (const [id, cod] of Object.entries(r.codigos ?? {})) n[Number(id)] = { guardado: cod, texto: cod, ok: true }; return n; });
    setGeneral({ ok: `Se generaron ${r.cantidad} ${r.cantidad === 1 ? "código" : "códigos"} propios.` });
  });

  const colores = [...new Set(orden.map((v) => v.color))];
  return (
    <section className="tarjeta space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold"><ScanBarcode size={18} strokeWidth={1.8} className="text-marca" /> Códigos de barras</h2>
        <div className="flex flex-wrap gap-2">
          {edita && faltan.length > 0 && <button type="button" className="boton-sec" disabled={generando} onClick={generarFaltantes}><Wand2 size={15} strokeWidth={1.8} /> {generando ? "Generando…" : `Generar los que faltan (${faltan.length})`}</button>}
          <Link href={`/admin/etiquetas?producto=${productoId}`} className="boton-sec"><Printer size={15} strokeWidth={1.8} /> Imprimir etiquetas</Link>
        </div>
      </div>
      <p className="text-sm text-texto-2">{edita ? "Escaneá con el lector (o escribí) el código de cada talle y color: se guarda solo y pasa al siguiente. " : ""}Si el producto no trae código, generá uno propio y pegalo con las etiquetas.</p>
      {general.error && <p className="text-sm text-error" role="alert">{general.error}</p>}
      {general.ok && <p className="flex items-center gap-1.5 text-sm text-ok"><Check size={15} /> {general.ok}</p>}

      <div className="space-y-4">
        {colores.map((color) => (
          <div key={color} className="space-y-1.5">
            <p className="text-sm font-medium">{color}</p>
            <ul className="divide-y divide-gray-100 rounded-lg border border-borde">
              {orden.filter((v) => v.color === color).map((v) => {
                const f = filas[v.id];
                const tipo = f.guardado ? tipoDeCodigo(f.guardado) : null;
                return (
                  <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                    <span className="w-14 shrink-0 text-sm font-semibold">Talle {v.talle}</span>
                    <div className="min-w-0 flex-1 basis-48">
                      <input ref={(el) => { campos.current[v.id] = el; }} value={f.texto} readOnly={!edita} disabled={f.guardando}
                        aria-label={`Código de barras, talle ${v.talle}, ${color}`} aria-invalid={!!f.error} autoComplete="off" spellCheck={false}
                        placeholder={edita ? "Escaneá o escribí el código" : "Sin código"} className={`campo font-mono text-sm ${f.error ? "border-error" : ""}`}
                        onChange={(e) => poner(v.id, { texto: e.target.value, error: undefined, ok: false })}
                        onBlur={() => { if (edita) void guardar(v.id); }}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void guardar(v.id).then((bien) => { if (bien) irAlSiguiente(v.id); }); } }} />
                      {f.error && <p className="mt-0.5 flex items-start gap-1 text-xs text-error" role="alert"><CircleAlert size={13} className="mt-0.5 shrink-0" /> {f.error}</p>}
                    </div>
                    <span className="flex w-28 shrink-0 items-center justify-end gap-1.5 text-xs text-texto-2">
                      {f.guardando ? "Guardando…" : f.guardado ? <>
                        {f.ok && <Check size={14} className="text-ok" aria-label="Guardado" />}
                        <span className={`chip ${esCodigoPropio(f.guardado) ? "bg-marca-suave text-marca" : "bg-gray-100"}`}>{esCodigoPropio(f.guardado) ? "Propio" : ROTULO_TIPO[tipo!]}</span></> : <span className="chip bg-amber-50 text-alerta">Sin código</span>}
                    </span>
                    <span className="hidden basis-full font-mono text-[11px] text-texto-2 sm:inline sm:basis-auto sm:text-right" title="Código interno">{v.sku}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
