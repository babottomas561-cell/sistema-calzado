"use client";
// Imprimir etiquetas: se elige la plantilla (rollo u hoja), cuántas de cada variante, y se imprime. Lo que se ve acá es lo que sale:
// cada etiqueta tiene su tamaño real en milímetros y la página se acomoda sola a la impresora (@page). Lo que no tiene código de barras
// no se puede etiquetar: se le puede generar uno propio con un toque.
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { CircleAlert, CircleCheck, Layers, Minus, Plus, Printer, Search, Settings2, Trash2, Wand2 } from "lucide-react";
import Etiqueta from "@/components/Etiqueta";
import { esCodigoPropio, ROTULO_TIPO, tipoDeCodigo } from "@/lib/codigos";
import {
  cssDePagina, expandir, GENEROS, MAX_LOTE, paginar, sumarFilas, TEMPORADAS, type ArticuloEtiqueta, type CompraEtiqueta, type FilaConCantidad, type FilaEtiqueta, type FiltroLote, type Plantilla,
} from "@/lib/etiquetas";
import { fecha } from "@/lib/formato";
import { generarCodigosBarras } from "../productos/acciones";
import { buscarArticulosEtiqueta, buscarVariantesEtiqueta, comprasParaEtiquetar, variantesDeArticulos, variantesDeCompra, variantesPorFiltro } from "./acciones";

type Fila = FilaConCantidad;

const resumen = (p: Plantilla) => p.tipo === "hoja"
  ? `Hoja ${p.pagina} · ${p.columnas} × ${p.filas} = ${p.columnas * p.filas} por hoja · etiquetas de ${p.ancho_mm} × ${p.alto_mm} mm`
  : `Rollo · ${p.columnas > 1 ? `${p.columnas} en fila · ` : ""}etiquetas de ${p.ancho_mm} × ${p.alto_mm} mm`;


// Armar una tanda grande de una sola vez: artículos completos (todos sus talles y colores), lo que entró en una compra, o todo lo de una
// marca, rubro, género o temporada. Lo que se agrega se suma a la lista de abajo, donde se ajusta cantidad por cantidad.
function PanelLotes({ marcas, categorias, alAgregar }: {
  marcas: string[]; categorias: string[]; alAgregar: (filas: FilaConCantidad[], texto: string, truncado: boolean) => void;
}) {
  const [modo, setModo] = useState<"articulos" | "compra" | "filtro">("articulos");
  const [q, setQ] = useState("");
  const [articulos, setArticulos] = useState<ArticuloEtiqueta[]>([]);
  const [elegidos, setElegidos] = useState<Set<number>>(new Set());
  const [compras, setCompras] = useState<CompraEtiqueta[] | null>(null);
  const [compraId, setCompraId] = useState("");
  const [filtro, setFiltro] = useState<FiltroLote>({ marca: "", categoria: "", genero: "", temporada: "", soloConStock: true });
  const [ocupado, hacer] = useTransition();
  const [, buscar] = useTransition();
  const pedido = useRef(0);

  // La lista de compras se trae recién cuando se la quiere ver
  useEffect(() => { if (modo === "compra" && compras === null) void comprasParaEtiquetar().then(setCompras); }, [modo, compras]);

  function alBuscar(texto: string) {
    setQ(texto);
    const mio = ++pedido.current;
    if (texto.trim().length < 2) { setArticulos([]); return; }
    buscar(async () => { const r = await buscarArticulosEtiqueta(texto); if (mio === pedido.current) setArticulos(r); });
  }
  const alternar = (id: number) => setElegidos((e) => { const n = new Set(e); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const cuantosArticulos = (filas: FilaConCantidad[]) => new Set(filas.map((f) => f.producto_id)).size;

  const agregarArticulos = () => hacer(async () => {
    const r = await variantesDeArticulos([...elegidos]);
    alAgregar(r.filas, `${cuantosArticulos(r.filas)} ${cuantosArticulos(r.filas) === 1 ? "artículo" : "artículos"}`, r.truncado);
    setElegidos(new Set());
  });
  const agregarCompra = () => hacer(async () => {
    if (!compraId) return;
    const r = await variantesDeCompra(Number(compraId));
    alAgregar(r.filas, `la compra ${r.comprobante}`, false);
  });
  const agregarFiltro = () => hacer(async () => {
    const r = await variantesPorFiltro(filtro);
    alAgregar(r.filas, `${cuantosArticulos(r.filas)} ${cuantosArticulos(r.filas) === 1 ? "artículo" : "artículos"} del filtro`, r.truncado);
  });

  const solapa = (m: typeof modo, texto: string) => (
    <button type="button" role="tab" aria-selected={modo === m} onClick={() => setModo(m)}
      className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${modo === m ? "bg-marca-suave text-marca" : "text-texto-2 hover:bg-gray-100"}`}>{texto}</button>
  );
  return (
    <details className="group rounded-lg border border-borde">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        <Layers size={16} strokeWidth={1.8} className="text-marca" /> Agregar en bloque
        <span className="font-normal text-texto-2">· varios artículos de una vez</span></summary>
      <div className="space-y-3 border-t border-borde p-3">
        <div role="tablist" className="flex flex-wrap gap-1">{solapa("articulos", "Artículos completos")}{solapa("compra", "Una compra")}{solapa("filtro", "Por marca, rubro o temporada")}</div>

        {modo === "articulos" && (
          <div className="space-y-2">
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={q} onChange={(e) => alBuscar(e.target.value)} placeholder="Buscá artículos por nombre, marca o código…" className="campo pl-9" aria-label="Buscar artículos completos" />
            </div>
            {articulos.length > 0 && (
              <>
                <div className="flex gap-3 text-xs font-semibold text-marca">
                  <button type="button" onClick={() => setElegidos(new Set(articulos.map((a) => a.producto_id)))}>Marcar todos</button>
                  <button type="button" onClick={() => setElegidos(new Set())} className="text-texto-2">Ninguno</button></div>
                <ul className="max-h-64 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-borde">
                  {articulos.map((a) => (
                    <li key={a.producto_id}><label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-gray-50">
                      <input type="checkbox" checked={elegidos.has(a.producto_id)} onChange={() => alternar(a.producto_id)} />
                      <span className="min-w-0 flex-1"><b>{a.nombre}</b>{a.marca && <span className="text-texto-2"> · {a.marca}</span>}</span>
                      <span className="shrink-0 text-xs text-texto-2">{a.variantes} {a.variantes === 1 ? "variante" : "variantes"} · hay {a.stock}</span></label></li>
                  ))}
                </ul>
              </>
            )}
            <button type="button" className="boton" disabled={ocupado || elegidos.size === 0} onClick={agregarArticulos}>
              <Plus size={15} /> {ocupado ? "Agregando…" : `Agregar ${elegidos.size || ""} ${elegidos.size === 1 ? "artículo completo" : "artículos completos"}`.replace("  ", " ")}</button>
            <p className="text-xs text-texto-2">Se suman todos sus talles y colores, con una etiqueta por unidad que hay en stock.</p>
          </div>
        )}

        {modo === "compra" && (
          <div className="space-y-2">
            <label className="etiqueta" htmlFor="lote-compra">Compra</label>
            <select id="lote-compra" value={compraId} onChange={(e) => setCompraId(e.target.value)} className="campo">
              <option value="">{compras === null ? "Cargando…" : compras.length ? "Elegí una compra" : "No hay compras"}</option>
              {(compras ?? []).map((c) => <option key={c.id} value={c.id}>{c.comprobante} · {fecha(c.fecha)} · {c.proveedor ?? "sin proveedor"} · {c.unidades} u.</option>)}
            </select>
            <button type="button" className="boton" disabled={ocupado || !compraId} onClick={agregarCompra}><Plus size={15} /> {ocupado ? "Agregando…" : "Agregar lo que entró"}</button>
            <p className="text-xs text-texto-2">Una etiqueta por cada unidad que se compró.</p>
          </div>
        )}

        {modo === "filtro" && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              {([["marca", "Marca", marcas], ["categoria", "Rubro", categorias], ["genero", "Género", GENEROS], ["temporada", "Temporada", TEMPORADAS]] as const).map(([k, rotulo, opciones]) => (
                <div key={k}><label className="etiqueta" htmlFor={`lote-${k}`}>{rotulo}</label>
                  <select id={`lote-${k}`} value={filtro[k]} onChange={(e) => setFiltro({ ...filtro, [k]: e.target.value })} className="campo">
                    <option value="">Todas</option>{opciones.map((o) => <option key={o}>{o}</option>)}</select></div>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={filtro.soloConStock} onChange={(e) => setFiltro({ ...filtro, soloConStock: e.target.checked })} /> Solo lo que tiene stock</label>
            <button type="button" className="boton" disabled={ocupado} onClick={agregarFiltro}><Plus size={15} /> {ocupado ? "Agregando…" : "Agregar lo que cumple"}</button>
            <p className="text-xs text-texto-2">Sin elegir nada se suma todo el catálogo (hasta {MAX_LOTE.toLocaleString("es-AR")} variantes por vez). Después ajustás cantidades abajo.</p>
          </div>
        )}
      </div>
    </details>
  );
}

export default function Etiquetas({ plantillas, plantillaInicial, tienda, filasIniciales, puedeGenerar, puedeConfigurar, marcas, categorias }: {
  plantillas: Plantilla[]; plantillaInicial: number | null; tienda: string; filasIniciales: Fila[]; puedeGenerar: boolean; puedeConfigurar: boolean; marcas: string[]; categorias: string[];
}) {
  const [filas, setFilas] = useState<Fila[]>(filasIniciales);
  const [plantillaId, setPlantillaId] = useState(plantillaInicial ?? plantillas[0]?.id ?? 0);
  const [inicio, setInicio] = useState(1);
  const [prueba, setPrueba] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<FilaEtiqueta[]>([]);
  const [, buscar] = useTransition();
  const pedido = useRef(0);
  const [generando, generar] = useTransition();
  const [aviso, setAviso] = useState<{ error?: string; ok?: string }>({});

  const plantilla = plantillas.find((p) => p.id === plantillaId) ?? plantillas[0];
  const { etiquetas: todas, sinCodigo } = useMemo(() => expandir(filas, tienda), [filas, tienda]);
  const etiquetas = prueba ? todas.slice(0, 1) : todas;
  const paginas = useMemo(() => (plantilla ? paginar(plantilla, etiquetas, inicio - 1) : []), [plantilla, etiquetas, inicio]);
  const sinCodigoFilas = filas.filter((f) => f.cantidad > 0 && !f.codigo_barras);
  const porHoja = plantilla ? (plantilla.tipo === "hoja" ? plantilla.columnas * plantilla.filas : plantilla.columnas) : 1;

  const poner = (id: number, cantidad: number) => setFilas((fs) => fs.map((f) => (f.variante_id === id ? { ...f, cantidad: Math.max(0, Math.min(999, Math.floor(cantidad) || 0)) } : f)));
  const sumar = (f: FilaEtiqueta) => setFilas((fs) => fs.some((x) => x.variante_id === f.variante_id)
    ? fs.map((x) => (x.variante_id === f.variante_id ? { ...x, cantidad: Math.min(999, x.cantidad + 1) } : x)) : [...fs, { ...f, cantidad: 1 }]);

  // Un lote que llega del panel: se suma a lo que hay (lo repetido junta sus cantidades) y se cuenta qué pasó
  function agregarLote(nuevas: FilaConCantidad[], texto: string, truncado: boolean) {
    if (nuevas.length === 0) { setAviso({ error: `No hay nada para agregar de ${texto}.` }); return; }
    const r = sumarFilas(filas, nuevas);
    setFilas(r.filas);
    setAviso({ ok: `Se agregaron ${r.nuevas} ${r.nuevas === 1 ? "variante" : "variantes"} de ${texto}${r.repetidas ? ` (${r.repetidas} ya estaban: se sumaron las cantidades)` : ""}.${truncado ? ` Eran más de ${MAX_LOTE.toLocaleString("es-AR")}: acotá el filtro para el resto.` : ""}` });
  }

  function alBuscar(texto: string) {
    setBusqueda(texto);
    const mio = ++pedido.current;
    if (texto.trim().length < 2) { setResultados([]); return; }
    buscar(async () => { const r = await buscarVariantesEtiqueta(texto); if (mio === pedido.current) setResultados(r); });
  }

  const generarFaltantes = () => generar(async () => {
    setAviso({});
    const r = await generarCodigosBarras(sinCodigoFilas.map((f) => f.variante_id));
    if (r.error) { setAviso({ error: r.error }); return; }
    setFilas((fs) => fs.map((f) => (r.codigos?.[f.variante_id] ? { ...f, codigo_barras: r.codigos[f.variante_id] } : f)));
    setAviso({ ok: `Se generaron ${r.cantidad} ${r.cantidad === 1 ? "código propio" : "códigos propios"}.` });
  });

  if (!plantilla) return (
    <p className="tarjeta text-sm text-texto-2">No hay plantillas de etiquetas. {puedeConfigurar ? <>Creá una en <Link href="/admin/impresion?seccion=etiquetas" className="font-semibold text-marca">Impresión → Etiquetas</Link>.</> : "Pedile al administrador que cree una en Impresión."}</p>
  );

  const zoom = (ancho: number) => (plantilla.tipo === "hoja" ? 0.5 : Math.min(3, 340 / (ancho * 3.78)));
  return (
    <div className="space-y-4 print:space-y-0">
      <style>{cssDePagina(plantilla)}</style>

      <section className="tarjeta space-y-3 print:hidden">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <label className="etiqueta" htmlFor="plantilla">Plantilla de etiqueta</label>
            <select id="plantilla" value={plantillaId} onChange={(e) => setPlantillaId(Number(e.target.value))} className="campo">
              {plantillas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
            <p className="mt-1 text-xs text-texto-2">{resumen(plantilla)}</p>
          </div>
          {puedeConfigurar && <Link href="/admin/impresion?seccion=etiquetas" className="boton-sec"><Settings2 size={15} strokeWidth={1.8} /> Ajustar plantillas</Link>}
        </div>
        {plantilla.tipo === "hoja" && (
          <div className="max-w-xs">
            <label className="etiqueta" htmlFor="inicio">Empezar en la etiqueta n.º</label>
            <input id="inicio" type="number" min={1} max={porHoja} value={inicio} onChange={(e) => setInicio(Math.max(1, Math.min(porHoja, Number(e.target.value) || 1)))} className="campo" />
            <p className="mt-1 text-xs text-texto-2">Para seguir con una hoja que ya usaste: las posiciones anteriores quedan vacías.</p>
          </div>
        )}
      </section>

      <section className="tarjeta space-y-3 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Qué etiquetas</h2>
          <div className="flex flex-wrap gap-3 text-sm font-semibold text-marca">
            <button type="button" onClick={() => setFilas((fs) => fs.map((f) => ({ ...f, cantidad: 1 })))}>1 de cada una</button>
            <button type="button" onClick={() => setFilas((fs) => fs.map((f) => ({ ...f, cantidad: Math.max(f.stock, 0) })))}>Una por unidad en stock</button>
            <button type="button" onClick={() => setFilas([])} className="text-texto-2">Vaciar</button>
          </div>
        </div>

        <div className="relative">
          <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={busqueda} onChange={(e) => alBuscar(e.target.value)} placeholder="Sumar otro: modelo, marca o código…" className="campo pl-9" aria-label="Buscar para sumar etiquetas" />
          {resultados.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-borde bg-white shadow-lg">
              {resultados.map((r) => (
                <li key={r.variante_id}><button type="button" onClick={() => { sumar(r); setBusqueda(""); setResultados([]); }}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-marca-suave">
                  <span><b>{r.nombre}</b><span className="text-texto-2"> · talle {r.talle} · {r.color}</span></span>
                  <span className="shrink-0 text-xs text-texto-2">{r.codigo_barras ? "con código" : "sin código"}</span></button></li>
              ))}
            </ul>
          )}
        </div>

        <PanelLotes marcas={marcas} categorias={categorias} alAgregar={agregarLote} />

        {filas.length === 0 ? <p className="rounded-lg border border-dashed border-borde p-5 text-center text-sm text-texto-2">Todavía no elegiste nada: buscá arriba, sumá varios artículos en bloque, o entrá desde un artículo, una compra o la lista de productos.</p> : (
          <ul className="divide-y divide-gray-100 rounded-lg border border-borde">
            {filas.map((f) => (
              <li key={f.variante_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <div className="min-w-0 flex-1 basis-48">
                  <p className="truncate text-sm font-semibold">{f.nombre}</p>
                  <p className="text-xs text-texto-2">Talle {f.talle} · {f.color} · hay {f.stock}</p>
                </div>
                <span className="w-28 text-right text-xs">
                  {f.codigo_barras ? <span className={`chip ${esCodigoPropio(f.codigo_barras) ? "bg-marca-suave text-marca" : "bg-gray-100"}`}>{esCodigoPropio(f.codigo_barras) ? "Propio" : ROTULO_TIPO[tipoDeCodigo(f.codigo_barras)]}</span>
                    : <span className="chip bg-amber-50 text-alerta">Sin código</span>}
                </span>
                <div className="flex items-center gap-1">
                  <button type="button" aria-label="Una menos" onClick={() => poner(f.variante_id, f.cantidad - 1)} className="grid h-9 w-9 place-items-center rounded-lg border border-borde hover:bg-gray-50"><Minus size={15} /></button>
                  <input type="number" min={0} max={999} value={f.cantidad} onChange={(e) => poner(f.variante_id, Number(e.target.value))} aria-label={`Cantidad de etiquetas de ${f.nombre}, talle ${f.talle}, ${f.color}`} className="campo !w-16 !px-1 text-center" />
                  <button type="button" aria-label="Una más" onClick={() => poner(f.variante_id, f.cantidad + 1)} className="grid h-9 w-9 place-items-center rounded-lg border border-borde hover:bg-gray-50"><Plus size={15} /></button>
                  <button type="button" aria-label="Quitar" onClick={() => setFilas((fs) => fs.filter((x) => x.variante_id !== f.variante_id))} className="grid h-9 w-9 place-items-center rounded-lg text-gray-500 hover:bg-red-50 hover:text-error"><Trash2 size={15} /></button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {sinCodigoFilas.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-amber-50 p-3 text-sm text-alerta">
            <p className="flex items-start gap-2"><CircleAlert size={17} className="mt-0.5 shrink-0" /> {sinCodigoFilas.length} {sinCodigoFilas.length === 1 ? "variante no tiene" : "variantes no tienen"} código de barras y no se {sinCodigoFilas.length === 1 ? "imprime" : "imprimen"}.</p>
            {puedeGenerar ? <button type="button" className="boton" disabled={generando} onClick={generarFaltantes}><Wand2 size={15} strokeWidth={1.8} /> {generando ? "Generando…" : "Generar códigos propios"}</button>
              : <span className="text-xs">Pedile a quien edita productos que los genere.</span>}
          </div>
        )}
        {aviso.error && <p className="text-sm text-error" role="alert">{aviso.error}</p>}
        {aviso.ok && <p className="flex items-center gap-1.5 text-sm text-ok"><CircleCheck size={15} /> {aviso.ok}</p>}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-borde pt-3">
          <p className="text-sm text-texto-2"><b className="text-gray-900">{etiquetas.length}</b> {etiquetas.length === 1 ? "etiqueta" : "etiquetas"} · {paginas.length} {plantilla.tipo === "hoja" ? (paginas.length === 1 ? "hoja" : "hojas") : (paginas.length === 1 ? "tira" : "tiras")}
            {sinCodigo > 0 ? ` · ${sinCodigo} sin código` : ""}</p>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={prueba} onChange={(e) => setPrueba(e.target.checked)} /> Solo una, de prueba</label>
            <button type="button" className="boton" disabled={etiquetas.length === 0} onClick={() => window.print()}><Printer size={16} strokeWidth={1.8} /> Imprimir</button>
          </div>
        </div>
        <p className="text-xs text-texto-2">En el cuadro de impresión elegí tu impresora, el tamaño de papel de la etiqueta, escala 100 % y sin márgenes ni encabezados. El navegador se acuerda de la última elección.</p>
      </section>

      {paginas.length > 0 && (
        <section aria-label="Vista previa" className="space-y-2 print:space-y-0">
          <h2 className="font-semibold print:hidden">Vista previa</h2>
          <div className="flex flex-wrap items-start gap-4 print:block print:gap-0">
            {paginas.map((pg, i) => (
              <div key={i} className="pagina-impresa bg-white shadow ring-1 ring-black/10 print:shadow-none print:ring-0"
                style={{ width: `${pg.ancho}mm`, height: `${pg.alto - 0.3}mm`, overflow: "hidden", zoom: zoom(pg.ancho) }}>
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${plantilla.columnas}, ${plantilla.ancho_mm}mm)`, gridAutoRows: `${plantilla.alto_mm}mm`,
                  columnGap: `${plantilla.separacion_h_mm}mm`, rowGap: `${plantilla.separacion_v_mm}mm`, paddingTop: `${plantilla.margen_superior_mm}mm`, paddingLeft: `${plantilla.margen_izquierdo_mm}mm` }}>
                  {pg.celdas.map((d, j) => (
                    <div key={j} className="outline-dashed outline-1 -outline-offset-1 outline-gray-300 print:outline-none" style={{ width: `${plantilla.ancho_mm}mm`, height: `${plantilla.alto_mm}mm` }}>
                      {d && <Etiqueta t={plantilla} d={d} />}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
