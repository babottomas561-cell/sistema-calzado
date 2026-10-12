"use client";
// Cargar una factura de compra como viene del proveedor: por modelo y por CURVA.
//  1. Cabecera: proveedor, n.º y fecha de la factura, y su total (para controlar que cierre).
//  2. Se busca el modelo (por nombre, marca, código propio o el código del proveedor).
//  3. Aparece la grilla talle × color: se escriben las unidades de cada uno. Un solo costo por modelo,
//     propuesto con el precio de ese proveedor.
//  4. Si el modelo no existe, se crea ahí mismo y se sigue cargando.
import { useMemo, useRef, useState, useTransition, useActionState } from "react";
import { useRouter } from "next/navigation";
import { Camera, CircleAlert, CircleCheck, Eraser, PackagePlus, Plus, Search, Trash2, X } from "lucide-react";
import EscanerCamara, { type Aviso } from "@/components/EscanerCamara";
import { claveDeBusqueda, normalizarCodigo, pareceCodigoLeido } from "@/lib/codigos";
import { diaArgentina, pesos } from "@/lib/formato";
import CamposProducto, { type Maestros } from "../../productos/CamposProducto";
import ElegirTallesColores, { type Color, type Talle } from "../../productos/ElegirTallesColores";
import { crearProductoRapido } from "../../productos/acciones";
import { registrarCompra } from "../acciones";

type Fila = { variante_id: number; producto_id: number; codigo: string; nombre: string; marca: string | null; talle: string; talle_orden: number;
  color: string; color_hex: string | null; sku: string | null; codigo_barras: string | null; stock: number; precio_compra: number };
type Precio = { producto_id: number; proveedor_id: number; codigo_proveedor: string | null; precio_compra: number };
// Un modelo cargado en la factura: su costo y los pares por variante
type Bloque = { producto_id: number; costo: number; costoEditado: boolean; pares: Record<number, number> };

export default function FacturaCompra({ filas, proveedores, precios, maestros, talles, colores, editaPrecio, creditos }: {
  filas: Fila[]; proveedores: { id: number; nombre: string }[]; precios: Precio[]; maestros: Maestros; talles: Talle[]; colores: Color[]; editaPrecio: boolean;
  creditos: Record<number, number>;   // crédito a favor con cada proveedor (fallados devueltos)
}) {
  const router = useRouter();
  const [escalaNueva, setEscalaNueva] = useState("Adulto");   // escala del artículo que se crea en el alta rápida
  const [proveedor, setProveedor] = useState<number | "">("");
  const [comprobante, setComprobante] = useState("");
  const [fechaFactura, setFechaFactura] = useState(diaArgentina());
  const [totalFactura, setTotalFactura] = useState<number | "">("");
  const [notas, setNotas] = useState("");
  const [actualizarCosto, setActualizarCosto] = useState(true);
  const [bloques, setBloques] = useState<Bloque[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [creando, setCreando] = useState(false);
  const [errorAlta, setErrorAlta] = useState("");
  const [altaPendiente, iniciarAlta] = useTransition();
  const [estado, accion, cargando] = useActionState(registrarCompra, {});

  // Los modelos (una entrada por producto) con sus variantes
  const modelos = useMemo(() => {
    const m = new Map<number, { id: number; codigo: string; nombre: string; marca: string | null; precio_compra: number; variantes: Fila[] }>();
    for (const f of filas) {
      const x = m.get(f.producto_id) ?? { id: f.producto_id, codigo: f.codigo, nombre: f.nombre, marca: f.marca, precio_compra: Number(f.precio_compra), variantes: [] };
      x.variantes.push(f);
      m.set(f.producto_id, x);
    }
    return m;
  }, [filas]);
  const precioDe = (productoId: number, prov: number | "") => precios.find((p) => p.producto_id === productoId && p.proveedor_id === prov);
  const costoSugerido = (productoId: number, prov: number | "") =>
    Number(precioDe(productoId, prov)?.precio_compra ?? modelos.get(productoId)?.precio_compra ?? 0);

  // Búsqueda: los artículos de este proveedor primero; también por SU código
  const resultados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return [];
    return [...modelos.values()]
      .filter((m) => !bloques.some((b) => b.producto_id === m.id))
      .filter((m) => [m.nombre, m.marca ?? "", m.codigo, precioDe(m.id, proveedor)?.codigo_proveedor ?? ""].some((t) => t.toLowerCase().includes(q))
        || m.variantes.some((v) => (v.sku ?? "").toLowerCase() === q))
      .sort((a, b) => Number(!!precioDe(b.id, proveedor)) - Number(!!precioDe(a.id, proveedor)) || a.nombre.localeCompare(b.nombre))
      .slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda, modelos, bloques, proveedor, precios]);

  const agregarBloque = (productoId: number, costo?: number) => {
    setBloques((bs) => bs.some((b) => b.producto_id === productoId) ? bs
      : [{ producto_id: productoId, costo: costo ?? costoSugerido(productoId, proveedor), costoEditado: costo !== undefined, pares: {} }, ...bs]);
    setBusqueda("");
  };
  const cambiarBloque = (productoId: number, cambio: (b: Bloque) => Bloque) =>
    setBloques((bs) => bs.map((b) => (b.producto_id === productoId ? cambio(b) : b)));
  const ponerPares = (productoId: number, varianteId: number, n: number) =>
    cambiarBloque(productoId, (b) => ({ ...b, pares: { ...b.pares, [varianteId]: Math.max(0, Math.floor(n) || 0) } }));

  // Código de barras (lector o cámara): suma UNA unidad de esa variante a su modelo. Sirve para contar la mercadería que llega.
  const porCodigo = useMemo(() => {
    const m = new Map<string, Fila>();
    for (const f of filas) { if (f.sku) m.set(claveDeBusqueda(f.sku), f); if (f.codigo_barras) m.set(claveDeBusqueda(f.codigo_barras), f); }
    return m;
  }, [filas]);
  const [camara, setCamara] = useState(false);
  const [aviso, setAviso] = useState<Aviso>(null);
  const avisoPendiente = useRef<ReturnType<typeof setTimeout> | null>(null);
  const avisar = (a: NonNullable<Aviso>) => {
    setAviso(a);
    if (avisoPendiente.current) clearTimeout(avisoPendiente.current);
    avisoPendiente.current = setTimeout(() => setAviso(null), 3500);
  };
  const sumarPorCodigo = (texto: string): boolean => {
    const f = porCodigo.get(claveDeBusqueda(texto));
    if (!f) { avisar({ tipo: "error", texto: `No encontramos ningún producto con el código ${normalizarCodigo(texto)}` }); return false; }
    const sumar = (b: Bloque): Bloque => ({ ...b, pares: { ...b.pares, [f.variante_id]: (b.pares[f.variante_id] ?? 0) + 1 } });
    setBloques((bs) => bs.some((b) => b.producto_id === f.producto_id) ? bs.map((b) => (b.producto_id === f.producto_id ? sumar(b) : b))
      : [sumar({ producto_id: f.producto_id, costo: costoSugerido(f.producto_id, proveedor), costoEditado: false, pares: {} }), ...bs]);
    avisar({ tipo: "ok", texto: `${f.nombre} · talle ${f.talle} · ${f.color}: +1` });
    return true;
  };

  // Al cambiar de proveedor se re-proponen los costos que no se tocaron a mano
  const elegirProveedor = (valor: number | "") => {
    setProveedor(valor);
    setBloques((bs) => bs.map((b) => (b.costoEditado ? b : { ...b, costo: costoSugerido(b.producto_id, valor) })));
  };

  // Totales
  const paresDe = (b: Bloque) => Object.values(b.pares).reduce((s, n) => s + n, 0);
  const totalPares = bloques.reduce((s, b) => s + paresDe(b), 0);
  const totalCargado = bloques.reduce((s, b) => s + paresDe(b) * b.costo, 0);
  const diferencia = totalFactura === "" ? null : Number(totalFactura) - totalCargado;
  // Crédito con este proveedor: se propone descontarlo (hasta el total de la factura)
  const [usarCredito, setUsarCredito] = useState(true);
  const creditoDisponible = proveedor ? creditos[proveedor] ?? 0 : 0;
  const credito = usarCredito ? Math.min(creditoDisponible, totalCargado) : 0;

  const compra = JSON.stringify({
    items: bloques.flatMap((b) => Object.entries(b.pares).filter(([, n]) => n > 0)
      .map(([variante_id, cantidad]) => ({ variante_id: Number(variante_id), cantidad, costo_unitario: b.costo }))),
    proveedor_id: proveedor || null, notas, actualizar_costo: actualizarCosto,
    comprobante_proveedor: comprobante, fecha_comprobante: fechaFactura || null, credito,
  });

  // Alta rápida: crea el artículo, recarga los datos y lo deja agregado a la factura
  const crearArticulo = (f: FormData) => iniciarAlta(async () => {
    setErrorAlta("");
    const r = await crearProductoRapido(f);
    if (r.error || !r.id) { setErrorAlta(r.error ?? "No se pudo crear"); return; }
    agregarBloque(r.id, Number(f.get("precio_compra")) || 0);
    setCreando(false);
    router.refresh();
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Cargar factura de compra</h1>
        <p className="text-sm text-texto-2">Buscá cada modelo de la factura y escribí las unidades de cada talle y color.</p>
      </div>

      {/* 1. Cabecera de la factura */}
      <section className="tarjeta grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div><label className="etiqueta">Proveedor</label>
          <select value={proveedor} onChange={(e) => elegirProveedor(e.target.value ? Number(e.target.value) : "")} className="campo">
            <option value="">Sin proveedor</option>{proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select></div>
        <div><label className="etiqueta">N.º de factura o remito</label>
          <input value={comprobante} onChange={(e) => setComprobante(e.target.value)} placeholder="A-0003-00012345" className="campo" /></div>
        <div><label className="etiqueta">Fecha de la factura</label>
          <input type="date" value={fechaFactura} max={diaArgentina()} onChange={(e) => setFechaFactura(e.target.value)} className="campo" /></div>
        <div><label className="etiqueta">Total de la factura (control)</label>
          <input type="number" min={0} step="0.01" value={totalFactura} placeholder="opcional"
            onChange={(e) => setTotalFactura(e.target.value === "" ? "" : Number(e.target.value))} className="campo" /></div>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          {/* 2. Buscar el modelo */}
          <div className="flex gap-2"><div className="relative flex-1">
            <Search size={17} className="pointer-events-none absolute left-3 top-3 text-gray-400" />
            <input value={busqueda} autoFocus className="campo pl-9" aria-label="Buscar modelo, marca o código de barras"
              placeholder={proveedor ? "Modelo, marca, código, código del proveedor o escaneá…" : "Modelo, marca, código o escaneá…"}
              onChange={(e) => {
                const v = e.target.value;
                // Un lector que no manda Enter: un código completo que existe se suma solo
                if (pareceCodigoLeido(normalizarCodigo(v)) && porCodigo.has(claveDeBusqueda(v))) { sumarPorCodigo(v); setBusqueda(""); return; }
                setBusqueda(v);
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                const t = normalizarCodigo(busqueda);
                if (porCodigo.has(claveDeBusqueda(t)) || pareceCodigoLeido(t)) { sumarPorCodigo(t); setBusqueda(""); return; }
                if (resultados[0]) agregarBloque(resultados[0].id);
              }} />
            {busqueda && (
              <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-borde bg-white shadow-lg">
                {resultados.map((m) => {
                  const pp = precioDe(m.id, proveedor);
                  return (
                    <button key={m.id} type="button" onClick={() => agregarBloque(m.id)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-marca-suave">
                      <span><span className="mr-2 font-mono text-xs text-texto-2">{m.codigo}</span><b>{m.nombre}</b>{m.marca && <span className="text-texto-2"> · {m.marca}</span>}
                        {pp?.codigo_proveedor && <span className="ml-2 font-mono text-xs text-texto-2">({pp.codigo_proveedor})</span>}</span>
                      <span className="shrink-0 text-xs">{pp ? <span className="chip bg-green-100 text-ok">de este proveedor · {pesos(pp.precio_compra)}</span> : pesos(m.precio_compra)}</span>
                    </button>
                  );
                })}
                {resultados.length === 0 && <p className="px-3 py-2 text-sm text-texto-2">No hay coincidencias.</p>}
                <button type="button" onClick={() => { setCreando(true); setBusqueda(""); }}
                  className="flex w-full items-center gap-2 border-t border-borde px-3 py-2 text-left text-sm font-semibold text-marca hover:bg-marca-suave">
                  <PackagePlus size={16} /> Es un artículo nuevo: crearlo</button>
              </div>
            )}
          </div>
          <button type="button" onClick={() => { setAviso(null); setCamara(true); }} className="boton-sec shrink-0 px-3" aria-label="Escanear con la cámara" title="Escanear con la cámara"><Camera size={18} strokeWidth={1.8} /></button></div>
          {aviso && !camara && <p role="status" className={`flex items-start gap-1.5 text-sm ${aviso.tipo === "ok" ? "text-ok" : "text-error"}`}>
            {aviso.tipo === "ok" ? <CircleCheck size={16} className="mt-0.5 shrink-0" /> : <CircleAlert size={16} className="mt-0.5 shrink-0" />}<span>{aviso.texto}</span></p>}
          {camara && <EscanerCamara aviso={aviso} titulo="Escaneá lo que llega" alLeer={(c) => { sumarPorCodigo(c); }} alCerrar={() => setCamara(false)} />}
          {!creando && <button type="button" onClick={() => setCreando(true)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-marca"><PackagePlus size={16} /> Artículo nuevo</button>}

          {/* 4. Alta rápida */}
          {creando && (
            <form action={crearArticulo} className="tarjeta space-y-4 border-marca/40">
              <div className="flex items-center justify-between"><h2 className="font-semibold">Artículo nuevo</h2>
                <button type="button" onClick={() => setCreando(false)} className="text-gray-400 hover:text-gray-700" aria-label="Cerrar"><X size={18} /></button></div>
              <CamposProducto maestros={maestros} editaPrecio={editaPrecio} alCambiarEscala={setEscalaNueva} />
              <ElegirTallesColores key={escalaNueva} talles={talles} colores={colores} escala={escalaNueva} />
              {errorAlta && <p className="text-sm text-error">{errorAlta}</p>}
              <button className="boton" disabled={altaPendiente}>{altaPendiente ? "Creando…" : <><Plus size={16} /> Crear y agregar a la factura</>}</button>
            </form>
          )}

          {/* 3. Un bloque por modelo, con su curva */}
          {bloques.length === 0 && !creando && (
            <div className="rounded-xl border border-dashed border-borde p-8 text-center text-sm text-texto-2">Todavía no cargaste ningún modelo.</div>
          )}
          {bloques.map((b) => {
            const m = modelos.get(b.producto_id);
            if (!m) return <div key={b.producto_id} className="tarjeta text-sm text-texto-2">Cargando el artículo nuevo…</div>;
            const tallesM = [...new Map(m.variantes.map((v) => [v.talle, v.talle_orden])).entries()].sort((a, c) => a[1] - c[1]).map(([t]) => t);
            const coloresM = [...new Map(m.variantes.map((v) => [v.color, v.color_hex])).entries()];
            const celda = (t: string, c: string) => m.variantes.find((v) => v.talle === t && v.color === c);
            const pp = precioDe(m.id, proveedor);
            return (
              <section key={b.producto_id} className="tarjeta space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><div className="font-mono text-xs text-texto-2">{m.codigo}{pp?.codigo_proveedor ? ` · prov. ${pp.codigo_proveedor}` : ""}</div>
                    <div className="font-semibold">{m.nombre}{m.marca && <span className="font-normal text-texto-2"> · {m.marca}</span>}</div></div>
                  <div className="flex items-end gap-2">
                    <label className="text-xs text-texto-2">Costo c/u
                      <input type="number" min={0} step="0.01" value={b.costo} className="campo mt-0.5 w-32 py-1.5 text-right"
                        onChange={(e) => cambiarBloque(b.producto_id, (x) => ({ ...x, costo: Math.max(0, Number(e.target.value)), costoEditado: true }))} /></label>
                    <button type="button" title="Vaciar cantidades" onClick={() => cambiarBloque(b.producto_id, (x) => ({ ...x, pares: {} }))}
                      className="grid h-9 w-9 place-items-center rounded-lg border border-borde text-gray-500 hover:bg-gray-50"><Eraser size={16} /></button>
                    <button type="button" title="Quitar de la factura" onClick={() => setBloques((bs) => bs.filter((x) => x.producto_id !== b.producto_id))}
                      className="grid h-9 w-9 place-items-center rounded-lg border border-borde text-gray-500 hover:bg-red-50 hover:text-error"><Trash2 size={16} /></button>
                  </div>
                </div>
                {pp && b.costo !== Number(pp.precio_compra) && (
                  <p className="text-xs text-alerta">Su lista dice {pesos(pp.precio_compra)}: {b.costo > Number(pp.precio_compra) ? "aumentó" : "bajó"}. Al registrar se actualiza.</p>)}

                <div className="overflow-x-auto">
                  <table className="text-sm">
                    <thead><tr><th className="pr-3 text-left text-xs font-semibold text-texto-2">Color \ Talle</th>
                      {tallesM.map((t) => <th key={t} className="w-14 px-0.5 text-center text-xs font-semibold">{t}</th>)}
                      <th className="w-16 text-right text-xs font-semibold text-texto-2">Unidades</th></tr></thead>
                    <tbody>{coloresM.map(([c, hex]) => {
                      const fila = tallesM.map((t) => celda(t, c)).filter(Boolean) as Fila[];
                      const paresFila = fila.reduce((s, v) => s + (b.pares[v.variante_id] ?? 0), 0);
                      return (
                        <tr key={c}>
                          <td className="whitespace-nowrap py-1 pr-3">
                            <span className="mr-1.5 inline-block h-3 w-3 rounded-full border border-gray-300 align-middle" style={{ background: hex ?? "#ddd" }} />{c}
                            <button type="button" className="ml-2 text-[11px] font-semibold text-marca" title="Una unidad de cada talle"
                              onClick={() => cambiarBloque(b.producto_id, (x) => ({ ...x, pares: { ...x.pares, ...Object.fromEntries(fila.map((v) => [v.variante_id, 1])) } }))}>1 c/u</button>
                          </td>
                          {tallesM.map((t) => {
                            const v = celda(t, c);
                            return <td key={t} className="px-0.5 py-1">{v ? (
                              <input type="number" min={0} inputMode="numeric" value={b.pares[v.variante_id] || ""} placeholder="0" title={`Hay ${v.stock} en stock`}
                                onChange={(e) => ponerPares(b.producto_id, v.variante_id, Number(e.target.value))}
                                className={`w-14 rounded-md border px-1 py-1.5 text-center ${b.pares[v.variante_id] ? "border-marca bg-marca-suave font-semibold" : "border-borde"}`} />
                            ) : <span className="block text-center text-gray-300">·</span>}</td>;
                          })}
                          <td className="text-right font-semibold">{paresFila || ""}</td>
                        </tr>
                      );
                    })}</tbody>
                  </table>
                </div>
                <div className="flex justify-between border-t border-borde pt-2 text-sm"><span className="text-texto-2">{paresDe(b)} unidades × {pesos(b.costo)}</span><b>{pesos(paresDe(b) * b.costo)}</b></div>
              </section>
            );
          })}
        </div>

        {/* Resumen y control contra el total de la factura */}
        <form action={accion} className="tarjeta h-fit space-y-3 lg:sticky lg:top-6">
          <h2 className="font-semibold">Resumen</h2>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-texto-2">Modelos</dt><dd>{bloques.length}</dd></div>
            <div className="flex justify-between"><dt className="text-texto-2">Unidades</dt><dd>{totalPares}</dd></div>
            <div className="flex items-baseline justify-between"><dt className="text-texto-2">Total cargado</dt><dd className="text-xl font-bold">{pesos(totalCargado)}</dd></div>
          </dl>
          {diferencia !== null && (Math.abs(diferencia) < 1
            ? <p className="flex items-center gap-1.5 rounded-lg bg-green-50 p-2 text-sm font-semibold text-ok"><CircleCheck size={16} /> Coincide con la factura</p>
            : <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 p-2 text-sm text-alerta"><CircleAlert size={16} className="mt-0.5 shrink-0" />
                {diferencia > 0 ? `Faltan ${pesos(diferencia)}` : `Sobran ${pesos(-diferencia)}`} para llegar a la factura. Revisá cantidades y costos (¿IVA, flete o un descuento?).</p>)}
          {creditoDisponible > 0 && (
            <div className="space-y-1 rounded-lg bg-green-50 p-2.5 text-sm">
              <label className="flex items-start gap-2"><input type="checkbox" checked={usarCredito} onChange={(e) => setUsarCredito(e.target.checked)} className="mt-1" />
                <span>Tenés <b>{pesos(creditoDisponible)}</b> de crédito a favor con este proveedor. Descontarlo de esta factura.</span></label>
              {credito > 0 && <div className="flex justify-between pl-6 font-semibold text-ok"><span>A pagar</span><span>{pesos(totalCargado - credito)}</span></div>}
            </div>
          )}
          <div><label className="etiqueta">Notas</label><input value={notas} onChange={(e) => setNotas(e.target.value)} className="campo" /></div>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={actualizarCosto} onChange={(e) => setActualizarCosto(e.target.checked)} className="mt-1" />
            <span>Actualizar el precio de compra{proveedor ? " (del artículo y de este proveedor)" : " de los artículos"}</span></label>
          <input type="hidden" name="compra" value={compra} />
          {estado.error && <p className="text-sm text-error">{estado.error}</p>}
          <button className="boton w-full py-3" disabled={cargando || totalPares === 0}>{cargando ? "Registrando…" : "Registrar compra"}</button>
          {!proveedor && totalPares > 0 && <p className="text-xs text-texto-2">Sin proveedor no se guarda su lista de precios.</p>}
        </form>
      </div>
    </div>
  );
}
