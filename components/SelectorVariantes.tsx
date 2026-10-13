"use client";
// Buscar un modelo y elegir talle + color. Lo usan la caja (Nueva venta), los presupuestos, los cambios y las compras.
// Funciona igual con lector de códigos que sin él:
//   · con lector: lo que lee se agrega solo (con o sin Enter), aunque el cursor no esté en el buscador;
//   · sin lector: se busca por nombre, marca o código, se filtra por rubro y se toca el modelo y el talle (botones grandes).
// En la caja (`caja`) además muestra fotos, cuántos hay de cada uno en la venta, se cierra solo al elegir y suena al agregar.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Camera, ChevronLeft, CircleAlert, CircleCheck, ImageOff, ScanBarcode, Search, Volume2, VolumeX, X } from "lucide-react";
import { pesos } from "@/lib/formato";
import { claveDeBusqueda, normalizarCodigo, pareceCodigoLeido } from "@/lib/codigos";
import EscanerCamara, { type Aviso } from "@/components/EscanerCamara";

export type FilaStock = {
  variante_id: number; producto_id: number; nombre: string; marca: string | null;
  talle: string; talle_orden?: number; color: string; color_hex?: string | null; sku: string | null; codigo_barras?: string | null; stock: number;
  precio_venta: number; precio_compra: number | null; imagen_url?: string | null; categoria?: string | null;
};

const MAX_MODELOS = 24;
// Orden real del talle (viene de la tabla de talles); si no viene, numérico y después texto
const ordenTalle = (a: FilaStock, b: FilaStock) =>
  (Number(a.talle_orden ?? a.talle) || 999) - (Number(b.talle_orden ?? b.talle) || 999) || a.talle.localeCompare(b.talle);
const esCampoDeTexto = (el: Element | null) =>
  !!el && (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el as HTMLElement).isContentEditable ||
    (el instanceof HTMLInputElement && !["button", "checkbox", "radio", "submit", "range", "color"].includes(el.type)));

// Un «bip» corto (o uno grave si algo falló): el cajero se entera sin mirar la pantalla
function bip(ok: boolean) {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx(), osc = ctx.createOscillator(), vol = ctx.createGain();
    osc.frequency.value = ok ? 1320 : 220; osc.type = ok ? "sine" : "square";
    vol.gain.setValueAtTime(0.08, ctx.currentTime); vol.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (ok ? 0.09 : 0.25));
    osc.connect(vol).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + (ok ? 0.1 : 0.26));
    osc.onended = () => void ctx.close();
  } catch { /* sin audio: no pasa nada */ }
}

const avisosSonido = new Set<() => void>();
const suscribirSonido = (f: () => void) => { avisosSonido.add(f); return () => { avisosSonido.delete(f); }; };
const leerSonido = () => { try { return localStorage.getItem("caja.sonido") !== "no"; } catch { return true; } };

export default function SelectorVariantes({ filas: todas, alElegir, soloConStock, caja = false, enVenta }: {
  filas: FilaStock[]; alElegir: (f: FilaStock) => void; soloConStock: boolean;
  caja?: boolean; enVenta?: Map<number, number>;   // en la caja: cuántas de cada variante ya están en la venta
}) {
  // Al vender, lo que no tiene stock disponible directamente no aparece (ni el talle, ni el color,
  // ni el modelo si se quedó sin nada). Al comprar se ven todos: justamente es para reponer.
  const filas = useMemo(() => (soloConStock ? todas.filter((f) => f.stock > 0) : todas), [todas, soloConStock]);
  const [busqueda, setBusqueda] = useState("");
  const [rubro, setRubro] = useState<string | null>(null);
  const [productoId, setProductoId] = useState<number | null>(null);
  const [camara, setCamara] = useState(false);
  const [aviso, setAviso] = useState<Aviso>(null);
  const avisoPendiente = useRef<ReturnType<typeof setTimeout> | null>(null);
  const campo = useRef<HTMLInputElement>(null);

  // El sonido al escanear se recuerda en este navegador
  const sonido = useSyncExternalStore(suscribirSonido, leerSonido, () => true);
  const alternarSonido = () => { try { localStorage.setItem("caja.sonido", sonido ? "no" : "si"); } catch { /* nada */ } avisosSonido.forEach((f) => f()); };

  // Código de barras o código interno (SKU) → variante. Se arma con TODAS las filas: así un código de algo sin stock avisa que no hay.
  const porCodigo = useMemo(() => {
    const m = new Map<string, FilaStock>();
    for (const f of todas) { if (f.sku) m.set(claveDeBusqueda(f.sku), f); if (f.codigo_barras) m.set(claveDeBusqueda(f.codigo_barras), f); }
    return m;
  }, [todas]);
  const avisar = (a: NonNullable<Aviso>) => {
    setAviso(a);
    if (caja && sonido) bip(a.tipo === "ok");
    if (avisoPendiente.current) clearTimeout(avisoPendiente.current);
    avisoPendiente.current = setTimeout(() => setAviso(null), 3500);
  };
  // Con mouse y teclado (compu, tablet con lector), el cursor vuelve al buscador para el próximo código; en el celular no (abriría el teclado)
  const volverAlBuscador = () => { if (window.matchMedia("(pointer: fine)").matches) campo.current?.focus({ preventScroll: true }); };
  const elegir = (f: FilaStock) => {
    alElegir(f);
    if (caja) { avisar({ tipo: "ok", texto: `${f.nombre} · talle ${f.talle} · ${f.color}` }); setProductoId(null); volverAlBuscador(); }
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
  const leer = useRef(leerCodigo);
  useEffect(() => { leer.current = leerCodigo; });

  // Un lector de códigos «escribe» muy rápido y termina con Enter. Si el cursor no está en un campo de texto (por ejemplo, después de tocar
  // un botón), igual se toma: así nunca se pierde una lectura.
  useEffect(() => {
    if (!caja) return;
    let buffer = "", ultimo = 0;
    const alTeclear = (e: KeyboardEvent) => {
      if (esCampoDeTexto(document.activeElement) || e.ctrlKey || e.metaKey || e.altKey) return;
      const ahora = performance.now();
      if (ahora - ultimo > 80) buffer = "";
      ultimo = ahora;
      if (e.key === "Enter") {
        if (buffer.length >= 4) { e.preventDefault(); leer.current(buffer); }
        buffer = "";
      } else if (e.key.length === 1) buffer += e.key;
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [caja]);

  const rubros = useMemo(() => [...new Set(filas.map((f) => f.categoria).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b)), [filas]);
  const { productos, hayMas } = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const mapa = new Map<number, { id: number; nombre: string; marca: string | null; stock: number; precio: number; imagen: string | null; variantes: FilaStock[] }>();
    for (const f of filas) {
      if (rubro && f.categoria !== rubro) continue;
      const coincide = !q || f.nombre.toLowerCase().includes(q) || (f.marca ?? "").toLowerCase().includes(q) || (f.sku ?? "").toLowerCase().startsWith(q) || (f.codigo_barras ?? "").toLowerCase().startsWith(q);
      if (!coincide) continue;
      const p = mapa.get(f.producto_id) ?? { id: f.producto_id, nombre: f.nombre, marca: f.marca, stock: 0, precio: Number(f.precio_venta), imagen: f.imagen_url ?? null, variantes: [] };
      p.stock += f.stock; p.variantes.push(f);
      mapa.set(f.producto_id, p);
    }
    const lista = [...mapa.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
    return { productos: lista.slice(0, MAX_MODELOS), hayMas: lista.length > MAX_MODELOS };
  }, [filas, busqueda, rubro]);

  const variantes = filas.filter((f) => f.producto_id === productoId).sort((a, b) => ordenTalle(a, b) || a.color.localeCompare(b.color));
  const colores = [...new Set(variantes.map((v) => v.color))];
  const cuantas = (ids: number[]) => ids.reduce((s, id) => s + (enVenta?.get(id) ?? 0), 0);
  // Tocar un modelo: si tiene una sola variante con stock, se agrega directo
  const abrir = (p: (typeof productos)[number]) => { if (caja && p.variantes.length === 1) elegir(p.variantes[0]); else setProductoId(p.id); };

  const cajaDeAviso = (
    <div className="min-h-6" aria-live="polite">
      {aviso && !camara && <p role="status" className={`flex items-start gap-1.5 text-sm font-medium ${aviso.tipo === "ok" ? "text-ok" : "text-error"}`}>
        {aviso.tipo === "ok" ? <CircleCheck size={16} className="mt-0.5 shrink-0" /> : <CircleAlert size={16} className="mt-0.5 shrink-0" />}<span>{aviso.tipo === "ok" ? "Agregado: " : ""}{aviso.texto}</span></p>}
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          {caja ? <ScanBarcode size={19} strokeWidth={1.8} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            : <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />}
          <input ref={campo} value={busqueda} autoFocus={caja ? undefined : true} placeholder={caja ? "Escaneá o buscá por nombre" : "Buscar modelo, marca o código…"}
            className={`campo ${caja ? "h-12 pl-10 pr-9 text-base" : "pl-9"}`} aria-label="Buscar modelo, marca o código de barras" enterKeyHint="search"
            onChange={(e) => {
              const v = e.target.value;
              // Un lector que no manda Enter: si lo escrito es un código completo y existe, se agrega solo
              if (pareceCodigoLeido(normalizarCodigo(v)) && porCodigo.has(claveDeBusqueda(v))) { leerCodigo(v); setBusqueda(""); setProductoId(null); return; }
              setBusqueda(v); setProductoId(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") { setBusqueda(""); setProductoId(null); return; }
              if (e.key !== "Enter") return;
              e.preventDefault();
              const t = normalizarCodigo(busqueda);
              // Enter con un código (de un lector o escrito): se agrega; con un nombre que deja un solo modelo, se abre
              if (porCodigo.has(claveDeBusqueda(t)) || pareceCodigoLeido(t)) { leerCodigo(t); setBusqueda(""); }
              else if (caja && productos.length === 1) abrir(productos[0]);
            }} />
          {caja && busqueda && <button type="button" onClick={() => { setBusqueda(""); campo.current?.focus(); }} aria-label="Borrar la búsqueda" className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-md text-gray-500 hover:bg-gray-100"><X size={17} /></button>}
        </div>
        <button type="button" onClick={() => { setAviso(null); setCamara(true); }} className={`boton-sec shrink-0 ${caja ? "h-12 px-3.5" : "px-3"}`} aria-label="Escanear con la cámara" title="Escanear con la cámara del celular o la compu"><Camera size={19} strokeWidth={1.8} /></button>
        {caja && <button type="button" onClick={alternarSonido} className="boton-sec h-12 shrink-0 px-3.5" aria-pressed={sonido} aria-label={sonido ? "Silenciar el sonido al escanear" : "Activar el sonido al escanear"} title={sonido ? "Sonido al escanear: activado" : "Sonido al escanear: apagado"}>
          {sonido ? <Volume2 size={19} strokeWidth={1.8} /> : <VolumeX size={19} strokeWidth={1.8} />}</button>}
      </div>
      {cajaDeAviso}
      {camara && <EscanerCamara aviso={aviso} alLeer={(c) => { leerCodigo(c); }} alCerrar={() => { setCamara(false); campo.current?.focus(); }} />}

      {productoId === null ? (
        <>
          {caja && rubros.length > 1 && (
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Rubros">
              {[null, ...rubros].map((r) => (
                <button key={r ?? "todos"} type="button" role="tab" aria-selected={rubro === r} onClick={() => setRubro(r)}
                  className={`h-9 shrink-0 rounded-full border px-3.5 text-sm font-medium transition-colors ${rubro === r ? "border-marca bg-marca text-white" : "border-borde bg-white text-gray-700 hover:bg-gray-50"}`}>{r ?? "Todo"}</button>
              ))}
            </div>
          )}
          <div className={caja ? "grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2.5" : "grid gap-2 sm:grid-cols-2"}>
            {productos.map((p) => {
              const n = cuantas(p.variantes.map((v) => v.variante_id));
              return caja ? (
                <button key={p.id} type="button" onClick={() => abrir(p)}
                  className="group relative flex flex-col overflow-hidden rounded-xl border border-borde bg-white text-left transition hover:border-marca hover:shadow-sm focus-visible:outline-2 focus-visible:outline-marca">
                  <div className="aspect-[4/3] w-full overflow-hidden bg-gray-100">
                    {p.imagen ? <img src={p.imagen} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]" />
                      : <div className="grid h-full w-full place-items-center text-gray-300"><ImageOff size={26} strokeWidth={1.5} /></div>}
                  </div>
                  <div className="flex flex-1 flex-col gap-0.5 p-2.5">
                    <span className="line-clamp-2 text-sm font-semibold leading-snug">{p.nombre}</span>
                    <span className="truncate text-xs text-texto-2">{p.marca ?? "Sin marca"} · {p.stock} {p.stock === 1 ? "disponible" : "disponibles"}</span>
                    <span className="truncate text-xs text-gray-700" title="Talles con stock">Talles {[...new Set([...p.variantes].sort(ordenTalle).map((v) => v.talle))].join(" · ")}</span>
                    <span className="mt-auto pt-1 text-sm font-bold tabular-nums">{pesos(p.precio)}</span>
                  </div>
                  {n > 0 && <span className="absolute right-2 top-2 rounded-full bg-marca px-2 py-0.5 text-xs font-bold text-white shadow" aria-label={`${n} en la venta`}>×{n}</span>}
                </button>
              ) : (
                <button key={p.id} type="button" onClick={() => setProductoId(p.id)} className="rounded-lg border border-borde bg-white p-3 text-left hover:border-marca">
                  <div className="font-semibold">{p.nombre}</div>
                  <div className="text-xs text-texto-2">{p.marca ?? ""} · {p.stock} unidades</div>
                </button>
              );
            })}
          </div>
          {productos.length === 0 && (
            <div className="rounded-xl border border-dashed border-borde px-4 py-8 text-center text-sm text-texto-2">
              {busqueda || rubro ? <>No hay {soloConStock ? "nada con stock" : "nada"} que coincida{busqueda ? <> con «{busqueda}»</> : null}. Probá con otra palabra{rubro ? " o con «Todo»" : ""}.</>
                : soloConStock ? "No hay productos con stock para vender." : "Todavía no hay productos cargados."}
            </div>
          )}
          {hayMas && <p className="text-xs text-texto-2">Se muestran {MAX_MODELOS} modelos: escribí más para encontrar el que buscás.</p>}
        </>
      ) : (
        <div className="space-y-3 rounded-xl border border-borde bg-white p-3 sm:p-4">
          <div className="flex items-start gap-3">
            <button type="button" onClick={() => { setProductoId(null); volverAlBuscador(); }} className="boton-sec h-10 shrink-0 px-2.5" aria-label="Volver a los modelos"><ChevronLeft size={18} /></button>
            <div className="min-w-0">
              <p className="font-semibold leading-tight">{variantes[0]?.nombre}</p>
              <p className="text-sm text-texto-2">{variantes[0]?.marca ? `${variantes[0].marca} · ` : ""}{pesos(variantes[0]?.precio_venta)}
                {variantes[0]?.precio_compra != null && <span className="text-xs"> · costo {pesos(variantes[0].precio_compra)}</span>}</p>
            </div>
          </div>
          <p className="text-sm text-texto-2">{caja ? "Tocá el talle para sumarlo a la venta." : "Elegí el talle."}</p>
          {colores.map((color) => {
            const hex = variantes.find((v) => v.color === color)?.color_hex;
            return (
              <div key={color} className="space-y-1.5">
                {colores.length > 1 || caja ? <div className="flex items-center gap-2 text-sm font-semibold">
                  {hex && <span className="h-4 w-4 rounded-full border border-black/10" style={{ background: hex }} aria-hidden />}{color}</div> : null}
                <div className="flex flex-wrap gap-2">
                  {variantes.filter((v) => v.color === color).map((v) => {
                    const n = enVenta?.get(v.variante_id) ?? 0;
                    return (
                      <button key={v.variante_id} type="button" onClick={() => (caja ? elegir(v) : alElegir(v))}
                        className="relative min-h-14 min-w-16 rounded-lg border border-borde bg-white px-3 py-2 text-center transition hover:border-marca hover:bg-marca-suave active:scale-[0.97]">
                        <div className="text-base font-bold leading-tight">{v.talle}</div>
                        <div className="text-[11px] text-texto-2">{v.stock} disp.</div>
                        {n > 0 && <span className="absolute -right-1.5 -top-1.5 rounded-full bg-marca px-1.5 text-[11px] font-bold text-white">×{n}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
