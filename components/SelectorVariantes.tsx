"use client";
// Buscar un modelo y elegir talle + color. Lo usan "Nueva venta" y "Nueva compra".
import { useMemo, useRef, useState } from "react";
import { Camera, ChevronLeft, CircleAlert, CircleCheck, Search } from "lucide-react";
import { pesos } from "@/lib/formato";
import { claveDeBusqueda, normalizarCodigo, pareceCodigoLeido } from "@/lib/codigos";
import EscanerCamara, { type Aviso } from "@/components/EscanerCamara";

export type FilaStock = {
  variante_id: number; producto_id: number; nombre: string; marca: string | null;
  talle: string; talle_orden?: number; color: string; sku: string | null; codigo_barras?: string | null; stock: number; precio_venta: number; precio_compra: number;
};

// Orden real del talle (viene de la tabla de talles); si no viene, numérico y después texto
const ordenTalle = (a: FilaStock, b: FilaStock) =>
  (Number(a.talle_orden ?? a.talle) || 999) - (Number(b.talle_orden ?? b.talle) || 999) || a.talle.localeCompare(b.talle);

export default function SelectorVariantes({ filas: todas, alElegir, soloConStock }: {
  filas: FilaStock[]; alElegir: (f: FilaStock) => void; soloConStock: boolean;
}) {
  // Al vender, lo que no tiene stock disponible directamente no aparece (ni el talle, ni el color,
  // ni el modelo si se quedó sin nada). Al comprar se ven todos: justamente es para reponer.
  const filas = useMemo(() => (soloConStock ? todas.filter((f) => f.stock > 0) : todas), [todas, soloConStock]);
  const [busqueda, setBusqueda] = useState("");
  const [productoId, setProductoId] = useState<number | null>(null);
  const [camara, setCamara] = useState(false);
  const [aviso, setAviso] = useState<Aviso>(null);
  const avisoPendiente = useRef<ReturnType<typeof setTimeout> | null>(null);
  const campo = useRef<HTMLInputElement>(null);

  // Código de barras o código interno (SKU) → variante. Se arma con TODAS las filas: así un código de algo sin stock avisa que no hay.
  const porCodigo = useMemo(() => {
    const m = new Map<string, FilaStock>();
    for (const f of todas) { if (f.sku) m.set(claveDeBusqueda(f.sku), f); if (f.codigo_barras) m.set(claveDeBusqueda(f.codigo_barras), f); }
    return m;
  }, [todas]);
  const avisar = (a: NonNullable<Aviso>) => {
    setAviso(a);
    if (avisoPendiente.current) clearTimeout(avisoPendiente.current);
    avisoPendiente.current = setTimeout(() => setAviso(null), 3500);
  };
  // Agrega lo que corresponde al código (de un lector, de la cámara o escrito) y dice qué pasó
  const leerCodigo = (texto: string): boolean => {
    const codigo = normalizarCodigo(texto);
    if (!codigo) return false;
    const f = porCodigo.get(claveDeBusqueda(codigo));
    if (!f) { avisar({ tipo: "error", texto: `No encontramos ningún producto con el código ${codigo}` }); return false; }
    if (soloConStock && f.stock <= 0) { avisar({ tipo: "error", texto: `${f.nombre} · talle ${f.talle} · ${f.color}: no hay stock disponible` }); return false; }
    alElegir(f);
    avisar({ tipo: "ok", texto: `${f.nombre} · talle ${f.talle} · ${f.color}` });
    return true;
  };

  const productos = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const mapa = new Map<number, { id: number; nombre: string; marca: string | null; stock: number }>();
    for (const f of filas) {
      const coincide = !q || f.nombre.toLowerCase().includes(q) || (f.marca ?? "").toLowerCase().includes(q) || (f.sku ?? "").toLowerCase().startsWith(q) || (f.codigo_barras ?? "").toLowerCase().startsWith(q);
      if (!coincide) continue;
      const p = mapa.get(f.producto_id) ?? { id: f.producto_id, nombre: f.nombre, marca: f.marca, stock: 0 };
      p.stock += f.stock;
      mapa.set(f.producto_id, p);
    }
    return [...mapa.values()].slice(0, 12);
  }, [filas, busqueda]);

  const variantes = filas.filter((f) => f.producto_id === productoId).sort((a, b) => ordenTalle(a, b) || a.color.localeCompare(b.color));
  const colores = [...new Set(variantes.map((v) => v.color))];

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input ref={campo} value={busqueda} autoFocus placeholder="Buscar modelo, marca o código…" className="campo pl-9" aria-label="Buscar modelo, marca o código de barras"
            onChange={(e) => {
              const v = e.target.value;
              // Un lector que no manda Enter: si lo escrito es un código completo y existe, se agrega solo
              if (pareceCodigoLeido(normalizarCodigo(v)) && porCodigo.has(claveDeBusqueda(v))) { leerCodigo(v); setBusqueda(""); setProductoId(null); return; }
              setBusqueda(v); setProductoId(null);
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              const t = normalizarCodigo(busqueda);
              // Enter con un código (de un lector o escrito): se agrega; con un nombre a medias, no hace nada
              if (porCodigo.has(claveDeBusqueda(t)) || pareceCodigoLeido(t)) { leerCodigo(t); setBusqueda(""); }
            }} />
        </div>
        <button type="button" onClick={() => { setAviso(null); setCamara(true); }} className="boton-sec shrink-0 px-3" aria-label="Escanear con la cámara" title="Escanear con la cámara"><Camera size={18} strokeWidth={1.8} /></button>
      </div>
      {aviso && !camara && <p role="status" className={`flex items-start gap-1.5 text-sm ${aviso.tipo === "ok" ? "text-ok" : "text-error"}`}>
        {aviso.tipo === "ok" ? <CircleCheck size={16} className="mt-0.5 shrink-0" /> : <CircleAlert size={16} className="mt-0.5 shrink-0" />}<span>{aviso.tipo === "ok" ? "Agregado: " : ""}{aviso.texto}</span></p>}
      {camara && <EscanerCamara aviso={aviso} alLeer={(c) => { leerCodigo(c); }} alCerrar={() => { setCamara(false); campo.current?.focus(); }} />}

      {productoId === null ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {productos.map((p) => (
            <button key={p.id} type="button" onClick={() => setProductoId(p.id)}
              className="rounded-lg border border-borde bg-white p-3 text-left hover:border-marca">
              <div className="font-semibold">{p.nombre}</div>
              <div className="text-xs text-texto-2">{p.marca ?? ""} · {p.stock} unidades</div>
            </button>
          ))}
          {productos.length === 0 && <p className="text-sm text-texto-2">{soloConStock ? "No hay nada con stock que coincida." : "No se encontró nada."}</p>}
        </div>
      ) : (
        <div className="rounded-lg border border-borde bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <b>{variantes[0]?.nombre}</b>
            <button type="button" onClick={() => setProductoId(null)} className="inline-flex items-center gap-0.5 text-sm font-medium text-marca"><ChevronLeft size={15} /> otro modelo</button>
          </div>
          {colores.map((color) => (
            <div key={color} className="mb-2">
              <div className="etiqueta">{color}</div>
              <div className="flex flex-wrap gap-2">
                {variantes.filter((v) => v.color === color).map((v) => {
                  return (
                    <button key={v.variante_id} type="button" onClick={() => alElegir(v)}
                      className="min-w-14 rounded-lg border border-borde bg-white px-3 py-2 text-sm hover:border-marca hover:bg-marca-suave">
                      <div className="font-bold">{v.talle}</div>
                      <div className="text-[11px] text-texto-2">{v.stock} disp.</div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <p className="text-xs text-texto-2">Precio: {pesos(variantes[0]?.precio_venta)} · costo {pesos(variantes[0]?.precio_compra)}</p>
        </div>
      )}
    </div>
  );
}
