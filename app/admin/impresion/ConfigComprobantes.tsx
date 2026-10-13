"use client";
// Cómo salen los comprobantes de venta, presupuesto y devolución: el papel, qué pasa al confirmar una venta (impresión automática, opcional o
// manual), qué lleva y los textos. A la derecha, un comprobante de ejemplo que cambia en el momento; «Imprimir una prueba» lo manda a la
// impresora para comprobar el papel antes de vender. Hasta que se guarda una vez, la caja avisa que falta configurar la impresión.
import { useActionState, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { CircleAlert, CircleCheck, Minus, Plus, Printer } from "lucide-react";
import Comprobante from "@/components/Comprobante";
import {
  comprobanteDeEjemplo, cssDePagina, FORMATOS, LETRAS, MM_A_PX, MODOS_IMPRESION, type Emisor, type FormatoComprobante, type LetraComprobante, type ModoImpresion,
} from "@/lib/comprobante";
import { guardarComprobantes, type Estado } from "./acciones";

export type ConfigInicial = {
  formato: FormatoComprobante; modo: ModoImpresion; letra: LetraComprobante; logo: boolean; datos_legales: boolean; qr: boolean; barras: boolean;
  mostrar_cliente: boolean; mostrar_vendedor: boolean; mostrar_marca: boolean; encabezado: string; pie: string; leyenda: string; copias: number; configurado: boolean;
};

const URL_EJEMPLO = "https://mitienda.com.ar/comprobante/a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6";

function Casilla({ nombre, valor, alCambiar, titulo, detalle }: { nombre: string; valor: boolean; alCambiar: (v: boolean) => void; titulo: string; detalle?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-borde p-3 transition-colors has-[:checked]:border-marca has-[:checked]:bg-marca-suave">
      <input type="checkbox" name={nombre} checked={valor} onChange={(e) => alCambiar(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-marca)]" />
      <span className="text-sm"><b className="block font-semibold">{titulo}</b>{detalle && <span className="text-texto-2">{detalle}</span>}</span>
    </label>
  );
}

// Opciones de una sola elección como tarjetas (papel, modo de impresión)
function Opciones<T extends string>({ nombre, valor, opciones, alCambiar, columnas = 3 }: {
  nombre: string; valor: T; opciones: { valor: T; titulo: string; detalle: string }[]; alCambiar: (v: T) => void; columnas?: 2 | 3;
}) {
  return (
    <div className={`grid gap-2 ${columnas === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
      {opciones.map((o) => (
        <label key={o.valor} className="flex cursor-pointer flex-col gap-1 rounded-lg border border-borde p-3 transition-colors has-[:checked]:border-marca has-[:checked]:bg-marca-suave">
          <span className="flex items-center gap-2 text-sm font-bold"><input type="radio" name={nombre} value={o.valor} checked={valor === o.valor} onChange={() => alCambiar(o.valor)} className="h-4 w-4 accent-[var(--color-marca)]" />{o.titulo}</span>
          <span className="text-xs leading-snug text-texto-2">{o.detalle}</span>
        </label>
      ))}
    </div>
  );
}

export default function ConfigComprobantes({ inicial, emisor, faltanLegales }: { inicial: ConfigInicial; emisor: Emisor; faltanLegales: boolean }) {
  const [f, setF] = useState<ConfigInicial>(inicial);
  const [estado, accion, guardando] = useActionState<Estado, FormData>(guardarComprobantes, {});
  const poner = <K extends keyof ConfigInicial>(k: K, v: ConfigInicial[K]) => setF((x) => ({ ...x, [k]: v }));
  const cambios = JSON.stringify(f) !== JSON.stringify(inicial);

  // El ejemplo lleva datos inventados donde el local todavía no cargó los suyos, para que se vea cómo queda cada cosa
  const conEjemplo: Emisor = faltanLegales
    ? { ...emisor, razon_social: emisor.razon_social ?? "Razón Social S.R.L.", cuit: emisor.cuit ?? "30-12345678-9", condicion_iva: emisor.condicion_iva ?? "Responsable Inscripto", domicilio: emisor.domicilio ?? "Av. Siempreviva 742", telefono: emisor.telefono ?? "381 555-0123" }
    : emisor;
  const ejemplo = comprobanteDeEjemplo(conEjemplo, {
    formato: f.formato, logo: f.logo, datos_legales: f.datos_legales, qr: f.qr, barras: f.barras, copias: f.copias, modo: f.modo, configurado: true, letra: f.letra,
    encabezado: f.encabezado.trim() || null, mostrar_cliente: f.mostrar_cliente, mostrar_vendedor: f.mostrar_vendedor, mostrar_marca: f.mostrar_marca,
  }, { leyenda: f.leyenda.trim() || null, pie: f.pie.trim() || null });

  // Vista previa: que entre en la columna; y el alto del ticket, para la prueba de impresión
  const caja = useRef<HTMLDivElement>(null);
  const hoja = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [alto, setAlto] = useState<number | undefined>();
  useLayoutEffect(() => {
    const el = caja.current, h = hoja.current;
    if (!el || !h) return;
    const ajustar = () => {
      setZoom(Math.max(0.2, Math.min(1.25, (el.clientWidth - 24) / (FORMATOS[f.formato].ancho * MM_A_PX))));
      setAlto(h.offsetHeight / MM_A_PX);
    };
    ajustar();
    const o = new ResizeObserver(ajustar);
    o.observe(el); o.observe(h);
    return () => o.disconnect();
  }, [f.formato]);

  return (
    <>
      <section className="space-y-3 print:hidden" aria-labelledby="comprobantes-titulo">
        <div>
          <h2 id="comprobantes-titulo" className="text-lg font-semibold">Comprobantes</h2>
          <p className="text-sm text-texto-2">Cómo salen el comprobante de venta, el presupuesto y el de devolución, en papel y en el link que recibe el cliente.</p>
        </div>
        {!inicial.configurado && (
          <p role="alert" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <CircleAlert size={18} className="mt-0.5 shrink-0" />
            <span><b>Todavía no se configuró la impresión.</b> Mientras tanto la caja avisa y no imprime comprobantes. Elegí el papel, revisá el ejemplo y guardá.</span>
          </p>
        )}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
          <form action={accion} className="tarjeta space-y-6">
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-semibold">Papel de tu impresora</legend>
              <Opciones nombre="formato" valor={f.formato} alCambiar={(v) => poner("formato", v)}
                opciones={(Object.keys(FORMATOS) as FormatoComprobante[]).map((k) => ({ valor: k, titulo: FORMATOS[k].nombre, detalle: FORMATOS[k].detalle }))} />
              <p className="text-xs text-texto-2">Es el que se usa siempre. Si alguna vez hace falta otro (por ejemplo, una hoja A4 para un cliente), se cambia en ese comprobante.</p>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-semibold">Al confirmar una venta</legend>
              <Opciones nombre="modo" valor={f.modo} alCambiar={(v) => poner("modo", v)}
                opciones={(Object.keys(MODOS_IMPRESION) as ModoImpresion[]).map((k) => ({ valor: k, titulo: MODOS_IMPRESION[k].nombre, detalle: MODOS_IMPRESION[k].detalle }))} />
              {f.modo === "automatica" && <p className="text-xs text-texto-2">El navegador igual muestra su ventana de impresión. Para que salga sin preguntar, mirá «Impresión sin ventana» en la ayuda de abajo.</p>}
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-semibold">Qué lleva</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                <Casilla nombre="logo" valor={f.logo} alCambiar={(v) => poner("logo", v)} titulo="Logo" detalle="El de la tienda (o su ícono, con el nombre al lado)." />
                <Casilla nombre="datos_legales" valor={f.datos_legales} alCambiar={(v) => poner("datos_legales", v)} titulo="Datos del comercio" detalle="Razón social, CUIT, domicilio y teléfono." />
                <Casilla nombre="mostrar_cliente" valor={f.mostrar_cliente} alCambiar={(v) => poner("mostrar_cliente", v)} titulo="Nombre del cliente" />
                <Casilla nombre="mostrar_vendedor" valor={f.mostrar_vendedor} alCambiar={(v) => poner("mostrar_vendedor", v)} titulo="Quién atendió" />
                <Casilla nombre="mostrar_marca" valor={f.mostrar_marca} alCambiar={(v) => poner("mostrar_marca", v)} titulo="Marca de cada prenda" />
                <Casilla nombre="qr" valor={f.qr} alCambiar={(v) => poner("qr", v)} titulo="Código QR" detalle="Lleva al comprobante digital." />
                <Casilla nombre="barras" valor={f.barras} alCambiar={(v) => poner("barras", v)} titulo="Código de barras del número" detalle="Para encontrar la venta en un cambio." />
              </div>
              {faltanLegales && f.datos_legales && <p className="text-xs text-amber-800">Todavía no cargaste los datos del comercio: en el ejemplo se ven inventados. Cargalos en <Link href="/admin/tienda/legales" className="font-semibold underline">Tienda online → Legales</Link>.</p>}
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="mb-1 text-sm font-semibold">Textos y letra</legend>
              <div>
                <label className="etiqueta" htmlFor="c-encabezado">Línea debajo del logo</label>
                <input id="c-encabezado" name="encabezado" maxLength={160} value={f.encabezado} onChange={(e) => poner("encabezado", e.target.value)} placeholder="Ej.: Instagram @milocal · Lunes a sábado de 9 a 20" className="campo" />
              </div>
              <div>
                <label className="etiqueta" htmlFor="c-pie">Mensaje al final</label>
                <input id="c-pie" name="pie" maxLength={200} value={f.pie} onChange={(e) => poner("pie", e.target.value)} placeholder="¡Gracias por tu compra!" className="campo" />
              </div>
              <div>
                <label className="etiqueta" htmlFor="c-leyenda">Aclaración legal</label>
                <input id="c-leyenda" name="leyenda" maxLength={200} required value={f.leyenda} onChange={(e) => poner("leyenda", e.target.value)} className="campo" />
                <p className="mt-0.5 text-[11px] text-texto-2">Este comprobante no es una factura de ARCA. Si además das factura aparte, dejalo aclarado acá.</p>
              </div>
              <div className="flex flex-wrap items-end gap-6">
                <div>
                  <span className="etiqueta" id="c-letra">Tamaño de letra</span>
                  <div className="inline-flex rounded-lg border border-borde p-0.5" role="radiogroup" aria-labelledby="c-letra">
                    {(Object.keys(LETRAS) as LetraComprobante[]).map((l) => (
                      <label key={l} className="cursor-pointer rounded-md px-3 py-1.5 text-sm has-[:checked]:bg-marca has-[:checked]:font-semibold has-[:checked]:text-white">
                        <input type="radio" name="letra" value={l} checked={f.letra === l} onChange={() => poner("letra", l)} className="sr-only" />{LETRAS[l].nombre}</label>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="etiqueta" id="c-copias">Copias</span>
                  <div className="inline-flex items-center rounded-lg border border-borde" role="group" aria-labelledby="c-copias">
                    <button type="button" onClick={() => poner("copias", Math.max(1, f.copias - 1))} disabled={f.copias <= 1} aria-label="Una copia menos" className="grid h-10 w-10 place-items-center text-gray-600 disabled:opacity-30"><Minus size={16} strokeWidth={2} /></button>
                    <input type="hidden" name="copias" value={f.copias} />
                    <span className="min-w-10 text-center text-sm font-bold" aria-live="polite">{f.copias}</span>
                    <button type="button" onClick={() => poner("copias", Math.min(5, f.copias + 1))} disabled={f.copias >= 5} aria-label="Una copia más" className="grid h-10 w-10 place-items-center text-gray-600 disabled:opacity-30"><Plus size={16} strokeWidth={2} /></button>
                  </div>
                </div>
              </div>
            </fieldset>

            <div className="flex flex-wrap items-center gap-3 border-t border-borde pt-4">
              <button type="submit" disabled={guardando} className="boton min-h-11">{guardando ? "Guardando…" : inicial.configurado ? "Guardar cambios" : "Guardar y activar la impresión"}</button>
              <button type="button" onClick={() => window.print()} className="boton-sec min-h-11"><Printer size={17} strokeWidth={1.8} /> Imprimir una prueba</button>
              {cambios && <span className="text-xs text-texto-2">Hay cambios sin guardar.</span>}
              {estado.ok && <span role="status" className="flex items-center gap-1.5 text-sm font-semibold text-ok"><CircleCheck size={16} /> {estado.ok}</span>}
              {estado.error && <span role="alert" className="flex items-center gap-1.5 text-sm text-error"><CircleAlert size={16} /> {estado.error}</span>}
            </div>
          </form>

          <div className="lg:sticky lg:top-4">
            <p className="mb-1 text-sm font-semibold">Así queda <span className="font-normal text-texto-2">(con datos de ejemplo)</span></p>
            <div ref={caja} className="overflow-hidden rounded-xl bg-gray-100 p-3">
              <div ref={hoja} className="mx-auto bg-white shadow-md" style={{ width: `${FORMATOS[f.formato].ancho}mm`, maxWidth: "none", zoom }}>
                <Comprobante c={ejemplo} formato={f.formato} url={URL_EJEMPLO} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* La prueba de impresión: el mismo ejemplo, a tamaño real (solo se ve al imprimir) */}
      <div className="hidden print:block">
        <style>{cssDePagina(f.formato, alto)}</style>
        <div className="pagina-impresa" style={{ width: `${FORMATOS[f.formato].ancho}mm` }}><Comprobante c={ejemplo} formato={f.formato} url={URL_EJEMPLO} /></div>
      </div>
    </>
  );
}
