"use client";
// La vista de impresión de un comprobante: se elige el formato (ticket 80 mm, 58 mm o A4) y cuántas copias, y se imprime. Lo que se ve es
// lo que sale: el comprobante tiene su tamaño real en milímetros y a la impresora se le pide ese papel (@page). Un ticket es un rollo
// continuo, así que se mide cuánto mide y se pide ese alto justo (si no, el navegador usa una hoja Carta).
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { CircleAlert, Minus, Plus, Printer, Settings2 } from "lucide-react";
import Comprobante from "@/components/Comprobante";
import { cssDePagina, FORMATOS, MM_A_PX, type Comprobante as Doc, type FormatoComprobante } from "@/lib/comprobante";

const ORDEN: FormatoComprobante[] = ["ticket80", "ticket58", "a4"];
const ROTULOS: Record<FormatoComprobante, [string, string]> = { ticket80: ["Ticket", "80 mm"], ticket58: ["Ticket", "58 mm"], a4: ["Hoja", "A4"] };

export default function VistaComprobante({ c, url, autoImprimir, puedeConfigurar }: { c: Doc; url: string | null; autoImprimir: boolean; puedeConfigurar: boolean }) {
  const configurado = c.config.configurado;
  const [formato, setFormato] = useState<FormatoComprobante>(c.config.formato);
  const [copias, setCopias] = useState(c.config.copias);
  const [alto, setAlto] = useState<number | undefined>();   // lo que mide el ticket, en mm
  const [zoom, setZoom] = useState(1);
  const caja = useRef<HTMLDivElement>(null);
  const hoja = useRef<HTMLDivElement>(null);

  // Que el papel entre en la pantalla (en un celular una hoja A4 se achica; un ticket se agranda un poco para leerlo bien)
  useLayoutEffect(() => {
    const el = caja.current;
    if (!el) return;
    const ajustar = () => {
      const libre = el.clientWidth - 24, papel = FORMATOS[formato].ancho * MM_A_PX;
      setZoom(Math.max(0.2, Math.min(formato === "a4" ? 1 : 1.25, libre / papel)));
    };
    ajustar();
    const o = new ResizeObserver(ajustar);
    o.observe(el);
    return () => o.disconnect();
  }, [formato]);

  // Cuánto mide el ticket (offsetHeight no cambia con el zoom): se vuelve a medir si cambia el contenido o el ancho
  useLayoutEffect(() => {
    const el = hoja.current;
    if (!el || formato === "a4") return;
    const medir = () => setAlto(el.offsetHeight / MM_A_PX);
    medir();
    const o = new ResizeObserver(medir);
    o.observe(el);
    return () => o.disconnect();
  }, [formato, c]);

  // Al registrar una venta con «abrir al vender», se imprime solo: cuando están las imágenes y se dibujaron las barras
  useEffect(() => {
    if (!autoImprimir || !configurado) return;
    let cancelado = false;
    (async () => {
      const pendientes = Array.from(document.images).filter((i) => !i.complete).map((i) => new Promise((r) => { i.onload = i.onerror = () => r(null); }));
      await Promise.race([Promise.all(pendientes), new Promise((r) => setTimeout(r, 2500))]);
      await new Promise((r) => setTimeout(r, 400));
      if (cancelado) return;
      window.history.replaceState(null, "", window.location.pathname);   // que recargar la página no vuelva a imprimir
      window.print();
    })();
    return () => { cancelado = true; };
  }, [autoImprimir, configurado]);

  return (
    <div className="space-y-3 print:space-y-0">
      {!configurado ? (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm print:hidden">
          <CircleAlert size={20} className="mt-0.5 shrink-0 text-error" />
          <div className="space-y-2">
            <p><b className="text-error">No se puede imprimir: falta configurar la impresión de comprobantes.</b> Mientras tanto se puede mandar por WhatsApp, mail o link.</p>
            {puedeConfigurar
              ? <Link href="/admin/impresion" className="boton-sec min-h-10"><Settings2 size={16} strokeWidth={1.8} /> Configurar la impresión</Link>
              : <p className="text-texto-2">Avisale al encargado o al dueño: se configura una sola vez en Impresión.</p>}
          </div>
        </div>
      ) : (
        <div className="tarjeta space-y-3 print:hidden">
          <button type="button" onClick={() => window.print()} className="boton min-h-12 w-full text-base"><Printer size={19} strokeWidth={1.8} /> Imprimir{copias > 1 ? ` ${copias} copias` : ""} · {FORMATOS[formato].nombre}</button>
          <details className="group text-sm">
            <summary className="cursor-pointer list-none text-texto-2 hover:text-gray-900 [&::-webkit-details-marker]:hidden">Cambiar el papel o las copias solo esta vez</summary>
            <div className="mt-3 space-y-3">
              <div role="radiogroup" aria-label="Formato del papel" className="grid grid-cols-3 gap-1.5">
                {ORDEN.map((f) => (
                  <button key={f} type="button" role="radio" aria-checked={formato === f} onClick={() => setFormato(f)} title={FORMATOS[f].detalle}
                    className={`rounded-lg border px-2 py-2 text-center leading-tight transition ${formato === f ? "border-marca bg-marca-suave text-marca" : "border-borde bg-white text-gray-700 hover:bg-gray-50"}`}>
                    <span className="block text-xs">{ROTULOS[f][0]}</span><span className="block text-sm font-bold">{ROTULOS[f][1]}</span></button>
                ))}
              </div>
              <div className="flex items-center rounded-lg border border-borde w-fit" role="group" aria-label="Copias">
                <button type="button" onClick={() => setCopias((n) => Math.max(1, n - 1))} disabled={copias <= 1} aria-label="Una copia menos" className="grid h-10 w-10 place-items-center text-gray-600 disabled:opacity-30"><Minus size={16} strokeWidth={2} /></button>
                <span className="min-w-14 text-center text-sm" aria-live="polite"><b>{copias}</b> {copias === 1 ? "copia" : "copias"}</span>
                <button type="button" onClick={() => setCopias((n) => Math.min(5, n + 1))} disabled={copias >= 5} aria-label="Una copia más" className="grid h-10 w-10 place-items-center text-gray-600 disabled:opacity-30"><Plus size={16} strokeWidth={2} /></button>
              </div>
            </div>
          </details>
        </div>
      )}

      <div ref={caja} className={`${configurado ? "" : "print:hidden "}overflow-hidden rounded-xl bg-gray-100 p-3 print:overflow-visible print:rounded-none print:bg-transparent print:p-0`}>
        <style>{cssDePagina(formato, alto)}</style>
        {Array.from({ length: copias }, (_, i) => (
          <div key={i} ref={i === 0 ? hoja : undefined} className={`pagina-impresa mx-auto bg-white shadow-md ${i > 0 ? "hidden print:block" : ""}`}
            style={{ width: `${FORMATOS[formato].ancho}mm`, maxWidth: "none", zoom }}>
            <Comprobante c={c} formato={formato} url={url} />
          </div>
        ))}
      </div>
    </div>
  );
}
