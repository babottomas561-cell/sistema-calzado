"use client";
// Las plantillas de mail: una tarjeta por situación (se prende y apaga) y, al elegir una, su editor con las variables a un toque y la vista previa en vivo
// (el mail armado por la base, con el color y el logo de la tienda).
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { CircleAlert, CircleCheck, FileText, Mail, Pencil, RotateCcw, Send, ShieldCheck, X } from "lucide-react";
import { variablesDe, VARIABLES } from "@/lib/mails";
import { guardarPlantilla, mandarPrueba, restaurarPlantilla, vistaPrevia, type Estado } from "./acciones";

export type Plantilla = { clave: string; grupo: "cuenta" | "pedido"; nombre: string; cuando: string; asunto: string; titulo: string; texto: string; boton: string | null; pie: string | null; activa: boolean; fija: boolean; con_pdf: boolean };

function Editor({ p, alCerrar, correoListo }: { p: Plantilla; alCerrar: () => void; correoListo: boolean }) {
  const [v, setV] = useState({ asunto: p.asunto, titulo: p.titulo, texto: p.texto, boton: p.boton ?? "", pie: p.pie ?? "", activa: p.activa, con_pdf: p.con_pdf });
  const [estado, accion, guardando] = useActionState<Estado, FormData>(guardarPlantilla, {});
  const [vista, setVista] = useState<{ asunto?: string; html?: string; error?: string }>({});
  const [aviso, setAviso] = useState<Estado>({});
  const [ocupado, hacer] = useTransition();
  const campo = useRef<"texto" | "titulo" | "asunto" | "pie">("texto");
  const refTexto = useRef<HTMLTextAreaElement>(null), refTitulo = useRef<HTMLInputElement>(null), refAsunto = useRef<HTMLInputElement>(null), refPie = useRef<HTMLInputElement>(null);
  // La vista previa se pide a la base unos instantes después de dejar de escribir
  useEffect(() => {
    const h = setTimeout(async () => setVista(await vistaPrevia(p.clave, v.asunto, v.titulo, v.texto, v.boton, v.pie)), 350);
    return () => clearTimeout(h);
  }, [p.clave, v.asunto, v.titulo, v.texto, v.boton, v.pie]);
  const insertar = (nombre: string) => {
    const k = campo.current, el = { texto: refTexto, titulo: refTitulo, asunto: refAsunto, pie: refPie }[k].current, ins = `{{${nombre}}}`;
    const actual = v[k], ini = el?.selectionStart ?? actual.length, fin = el?.selectionEnd ?? actual.length;
    setV((x) => ({ ...x, [k]: actual.slice(0, ini) + ins + actual.slice(fin) }));
    setTimeout(() => { el?.focus(); el?.setSelectionRange(ini + ins.length, ini + ins.length); }, 0);
  };
  const vars = variablesDe(p.clave);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <form action={accion} className="tarjeta space-y-3">
        <div className="flex items-start justify-between gap-2"><div><h3 className="font-semibold">{p.nombre}</h3><p className="text-xs text-texto-2">{p.cuando}</p></div>
          <button type="button" onClick={alCerrar} aria-label="Cerrar" className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-gray-500 hover:bg-gray-100"><X size={18} /></button></div>
        <input type="hidden" name="clave" value={p.clave} />
        <div><label className="etiqueta" htmlFor="m-asunto">Asunto</label>
          <input id="m-asunto" ref={refAsunto} name="asunto" value={v.asunto} maxLength={150} onFocus={() => (campo.current = "asunto")} onChange={(e) => setV({ ...v, asunto: e.target.value })} className="campo" /></div>
        <div><label className="etiqueta" htmlFor="m-titulo">Título del mail</label>
          <input id="m-titulo" ref={refTitulo} name="titulo" value={v.titulo} maxLength={100} onFocus={() => (campo.current = "titulo")} onChange={(e) => setV({ ...v, titulo: e.target.value })} className="campo" /></div>
        <div><label className="etiqueta" htmlFor="m-texto">Texto</label>
          <textarea id="m-texto" ref={refTexto} name="texto" rows={6} value={v.texto} maxLength={1500} onFocus={() => (campo.current = "texto")} onChange={(e) => setV({ ...v, texto: e.target.value })} className="campo" />
          <p className="mt-0.5 text-[11px] text-texto-2">Usá **doble asterisco** para la negrita. Sin HTML. Una línea nueva es un salto de línea.</p></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="etiqueta" htmlFor="m-boton">Texto del botón <span className="font-normal text-texto-2">(vacío = sin botón)</span></label>
            <input id="m-boton" name="boton" value={v.boton} maxLength={40} onChange={(e) => setV({ ...v, boton: e.target.value })} className="campo" /></div>
          <div><label className="etiqueta" htmlFor="m-pie">Pie <span className="font-normal text-texto-2">(letra chica)</span></label>
            <input id="m-pie" ref={refPie} name="pie" value={v.pie} maxLength={300} onFocus={() => (campo.current = "pie")} onChange={(e) => setV({ ...v, pie: e.target.value })} className="campo" /></div>
        </div>
        <div>
          <p className="etiqueta">Datos que se completan solos <span className="font-normal text-texto-2">(tocá uno para ponerlo donde está el cursor)</span></p>
          <div className="flex flex-wrap gap-1.5">{vars.map((n) => (
            <button key={n} type="button" onClick={() => insertar(n)} title={`${VARIABLES[n].que}. Ejemplo: ${VARIABLES[n].ejemplo}`} className="rounded-full border border-borde bg-white px-2.5 py-1 font-mono text-xs hover:bg-gray-50">{VARIABLES[n].nombre}</button>))}</div>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          {!p.fija && <label className="flex items-center gap-2"><input type="checkbox" name="activa" checked={v.activa} onChange={(e) => setV({ ...v, activa: e.target.checked })} className="h-4 w-4 accent-[var(--color-marca)]" /> Mandar este mail</label>}
          {p.fija && <input type="hidden" name="activa" value="on" />}
          {p.grupo === "pedido" && <label className="flex items-center gap-2"><input type="checkbox" name="con_pdf" checked={v.con_pdf} onChange={(e) => setV({ ...v, con_pdf: e.target.checked })} className="h-4 w-4 accent-[var(--color-marca)]" /> <FileText size={15} /> Adjuntar el comprobante en PDF</label>}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-borde pt-3">
          <button className="boton min-h-10" disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</button>
          <button type="button" className="boton-sec min-h-10" disabled={ocupado || !correoListo} title={correoListo ? "" : "Primero conectá el correo"} onClick={() => hacer(async () => setAviso(await mandarPrueba(p.clave)))}><Send size={15} /> Mandarme una prueba</button>
          <button type="button" className="boton-sec min-h-10" disabled={ocupado} onClick={() => hacer(async () => { const r = await restaurarPlantilla(p.clave); setAviso(r); if (r.ok) alCerrar(); })}><RotateCcw size={15} /> Restaurar el original</button>
        </div>
        {[estado, aviso].map((e, i) => (e.ok ? <p key={i} role="status" className="flex items-start gap-1.5 text-sm font-semibold text-ok"><CircleCheck size={16} className="mt-0.5 shrink-0" /> {e.ok}</p>
          : e.error ? <p key={i} role="alert" className="flex items-start gap-1.5 text-sm text-error"><CircleAlert size={16} className="mt-0.5 shrink-0" /> {e.error}</p> : null))}
      </form>
      <div className="lg:sticky lg:top-4 lg:self-start">
        <p className="mb-1 text-sm font-semibold">Así lo ve el cliente <span className="font-normal text-texto-2">(con datos de ejemplo)</span></p>
        <p className="mb-1 truncate rounded-t-lg bg-gray-100 px-3 py-1.5 text-xs text-texto-2">Asunto: <b className="text-texto">{vista.asunto ?? "…"}</b></p>
        {vista.error ? <p className="rounded-b-lg bg-red-50 p-3 text-sm text-error">{vista.error}</p>
          : <iframe title="Vista previa del mail" sandbox="" srcDoc={vista.html ?? ""} className="h-[34rem] w-full rounded-b-lg border border-borde bg-white" />}
      </div>
    </div>
  );
}

export default function Plantillas({ plantillas, correoListo }: { plantillas: Plantilla[]; correoListo: boolean }) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const grupos: [string, Plantilla["grupo"], string][] = [["Cuenta del cliente", "cuenta", "Cuando crea su cuenta, cambia la contraseña o ingresa por primera vez."], ["Pedidos", "pedido", "Cada paso del pedido, de que lo hace a que lo recibe."]];
  const actual = plantillas.find((p) => p.clave === abierta);
  return (
    <div className="space-y-5">
      {grupos.map(([titulo, grupo, detalle]) => (
        <section key={grupo} className="space-y-2" aria-labelledby={`g-${grupo}`}>
          <div><h2 id={`g-${grupo}`} className="font-semibold">{titulo}</h2><p className="text-sm text-texto-2">{detalle}</p></div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {plantillas.filter((p) => p.grupo === grupo).map((p) => (
              <li key={p.clave}>
                <button type="button" onClick={() => setAbierta(abierta === p.clave ? null : p.clave)} aria-pressed={abierta === p.clave}
                  className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition ${abierta === p.clave ? "border-marca bg-marca-suave/40 ring-1 ring-marca" : "border-borde bg-white hover:bg-gray-50"}`}>
                  <Mail size={18} strokeWidth={1.8} className="mt-0.5 shrink-0 text-gray-500" />
                  <span className="min-w-0 flex-1"><b className="block">{p.nombre}</b><span className="block text-xs text-texto-2">{p.cuando}</span>
                    <span className="mt-1.5 flex flex-wrap gap-1">
                      {p.fija ? <span className="chip gap-1 bg-gray-100 text-gray-700"><ShieldCheck size={12} /> Siempre se manda</span>
                        : <span className={`chip ${p.activa ? "bg-green-50 text-ok" : "bg-gray-100 text-texto-2"}`}>{p.activa ? "Se manda" : "Apagado"}</span>}
                      {p.con_pdf && <span className="chip gap-1 bg-blue-50 text-marca"><FileText size={12} /> Con PDF</span>}
                    </span></span>
                  <Pencil size={15} className="mt-1 shrink-0 text-gray-400" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {actual && <Editor key={actual.clave + String(actual.activa)} p={actual} alCerrar={() => setAbierta(null)} correoListo={correoListo} />}
    </div>
  );
}
