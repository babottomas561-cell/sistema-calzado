"use client";
// Legales: formulario de datos del comercio y un editor por documento (borrador automático, publicar versión, historial).
import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { CircleAlert, CircleCheck, FileText, Wand2 } from "lucide-react";
import { dia } from "@/lib/formato";
import { borrador, faltanDatos, TITULO, type DatosLegales, type ReglasTienda, type TipoDoc } from "@/lib/legales";
import { guardarDatosLegales, publicarDocumento, type Estado } from "./acciones";

type Doc = { id: number; tipo: TipoDoc; version: number; contenido: string; publicado_en: string };

function Aviso({ e }: { e: Estado }) {
  if (e.error) return <p className="text-sm text-error" role="alert">{e.error}</p>;
  if (e.ok) return <p className="flex items-start gap-1.5 text-sm text-ok"><CircleCheck size={15} className="mt-0.5 shrink-0" /> {e.ok}</p>;
  return null;
}

function Editor({ tipo, docs, datos, tienda, completos }: { tipo: TipoDoc; docs: Doc[]; datos: DatosLegales; tienda: ReglasTienda; completos: boolean }) {
  const mias = docs.filter((d) => d.tipo === tipo);
  const vigente = mias[0];
  const [texto, setTexto] = useState(vigente?.contenido ?? borrador(tipo, datos, tienda));
  const [estado, setEstado] = useState<Estado>({});
  const [publicando, publicar] = useTransition();
  const cambiado = texto.trim() !== (vigente?.contenido ?? "").trim();
  return (
    <section className="tarjeta space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold"><FileText size={18} strokeWidth={1.8} className="text-marca" /> {TITULO[tipo]}</h2>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${vigente ? "bg-green-50 text-ok" : "bg-amber-50 text-alerta"}`}>
          {vigente ? `Vigente: versión ${vigente.version} · ${dia(vigente.publicado_en)}` : "Sin publicar"}</span>
      </div>
      <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={16} aria-label={TITULO[tipo]} className="campo font-mono text-xs leading-relaxed" />
      <p className="text-xs text-texto-2">Formato: <code># Título</code>, <code>## Sección</code>, listas con <code>-</code>, <code>**negrita**</code>.</p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="boton" disabled={publicando || !completos || !cambiado}
          onClick={() => publicar(async () => setEstado(await publicarDocumento(tipo, texto)))}>
          {publicando ? "Publicando…" : vigente ? `Publicar versión ${vigente.version + 1}` : "Publicar versión 1"}</button>
        <button type="button" className="boton-sec" onClick={() => { if (!vigente || confirm("Esto reemplaza lo que escribiste en el editor por un borrador nuevo con los datos actuales. ¿Seguimos?")) setTexto(borrador(tipo, datos, tienda)); }}>
          <Wand2 size={15} strokeWidth={1.8} /> Regenerar borrador</button>
        {tipo === "terminos" || tipo === "privacidad" ? <Link href={`/${tipo}`} target="_blank" className="text-sm font-semibold text-marca">Ver en la tienda</Link> : null}
        <Aviso e={estado} />
      </div>
      {!completos && <p className="text-xs text-alerta">Completá los datos del comercio de arriba para poder publicar.</p>}
      {mias.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold text-marca">Historial de versiones ({mias.length})</summary>
          <ul className="mt-2 divide-y divide-borde rounded-lg border border-borde">
            {mias.map((d) => (
              <li key={d.id} className="p-3"><details><summary className="cursor-pointer">Versión {d.version} · {dia(d.publicado_en)}</summary>
                <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-gray-50 p-3 text-xs">{d.contenido}</pre></details></li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

export default function Legales({ datos, tienda, documentos, exigeEnRegistro }: { datos: DatosLegales; tienda: ReglasTienda; documentos: Doc[]; exigeEnRegistro: boolean }) {
  const [estado, accion, cargando] = useActionState(guardarDatosLegales, {});
  const faltan = faltanDatos(datos);
  const completos = faltan.length === 0;
  const hayTerminos = documentos.some((d) => d.tipo === "terminos");
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-alerta">
        <CircleAlert size={20} className="mt-0.5 shrink-0" />
        <p><b>Son un borrador.</b> Armamos los textos con la normativa habitual del comercio electrónico en Argentina (defensa del consumidor, arrepentimiento, datos personales), pero no reemplazan el consejo de un abogado. Hacelos revisar antes de publicar.</p>
      </div>
      {hayTerminos && !exigeEnRegistro && (
        <div className="flex items-start gap-3 rounded-xl border border-borde bg-white p-4 text-sm">
          <CircleAlert size={20} className="mt-0.5 shrink-0 text-marca" />
          <p>En el registro todavía <b>no se pide aceptar los términos</b>. Activalo en <Link href="/admin/equipo/cuentas" className="font-semibold text-marca underline">Equipo → Cuentas e invitaciones → Términos y condiciones</Link> para que quede registrado al crear la cuenta. Al comprar, se les pide siempre que no hayan aceptado la versión vigente.</p>
        </div>
      )}
      <form action={accion} className="tarjeta space-y-4">
        <div><h2 className="font-semibold">Datos del comercio</h2><p className="text-sm text-texto-2">Se muestran en el pie de la tienda y dentro de los términos.</p></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="etiqueta" htmlFor="razon_social">Razón social o nombre y apellido</label><input id="razon_social" name="razon_social" defaultValue={datos.razon_social ?? ""} className="campo" /></div>
          <div><label className="etiqueta" htmlFor="cuit">CUIT</label><input id="cuit" name="cuit" defaultValue={datos.cuit ?? ""} placeholder="20-12345678-9" inputMode="numeric" className="campo" /></div>
          <div><label className="etiqueta" htmlFor="condicion_iva">Condición frente al IVA</label>
            <select id="condicion_iva" name="condicion_iva" defaultValue={datos.condicion_iva ?? ""} className="campo"><option value="">—</option>
              {["Responsable Inscripto", "Monotributo", "IVA Exento"].map((c) => <option key={c}>{c}</option>)}</select></div>
          <div><label className="etiqueta" htmlFor="domicilio_legal">Domicilio legal</label><input id="domicilio_legal" name="domicilio_legal" defaultValue={datos.domicilio_legal ?? ""} className="campo" /></div>
          <div><label className="etiqueta" htmlFor="email_contacto">Email de contacto</label><input id="email_contacto" name="email_contacto" type="email" defaultValue={datos.email_contacto ?? ""} className="campo" /></div>
          <div><label className="etiqueta" htmlFor="telefono_contacto">Teléfono de contacto</label><input id="telefono_contacto" name="telefono_contacto" defaultValue={datos.telefono_contacto ?? ""} className="campo" /></div>
          <div><label className="etiqueta" htmlFor="jurisdiccion">Tribunales de</label><input id="jurisdiccion" name="jurisdiccion" defaultValue={datos.jurisdiccion} className="campo" /></div>
          <div><label className="etiqueta" htmlFor="defensa_consumidor_url">Defensa del Consumidor (link)</label><input id="defensa_consumidor_url" name="defensa_consumidor_url" defaultValue={datos.defensa_consumidor_url} className="campo" /></div>
        </div>
        {!completos && <p className="text-xs text-alerta">Falta: {faltan.join(", ")}. Sin esto no se pueden publicar los términos.</p>}
        <div className="flex flex-wrap items-center gap-3"><button className="boton" disabled={cargando}>{cargando ? "Guardando…" : "Guardar datos"}</button><Aviso e={estado} /></div>
        <p className="text-xs text-texto-2">Después de guardar, tocá «Regenerar borrador» en cada documento para que tome los datos nuevos.</p>
      </form>
      <Editor tipo="terminos" docs={documentos} datos={datos} tienda={tienda} completos={completos} />
      <Editor tipo="privacidad" docs={documentos} datos={datos} tienda={tienda} completos={completos} />
    </div>
  );
}
