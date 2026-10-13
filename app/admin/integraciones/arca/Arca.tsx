"use client";
// Conectar el sistema con ARCA, en orden: datos fiscales → ambiente → certificado → probar y puntos de venta. Cada paso dice si está listo.
// La llave privada nunca llega acá: la genera la app y queda en el Vault de la base; acá solo se ve el pedido de certificado (que no es secreto).
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { CircleAlert, CircleCheck, Copy, Download, FileCheck2, FlaskConical, Loader2, PlugZap, Power, ShieldCheck, Store, Upload } from "lucide-react";
import { activarFacturacion, agregarPuntoPrueba, cambiarAmbiente, generarPedido, guardarCertificado, guardarDatos, guardarPunto, probarPaso, type Estado, type Paso as PasoPrueba } from "./acciones";

export type EstadoArca = {
  ambiente: "homologacion" | "produccion"; activa: boolean;
  datos: { cuit: string | null; cuit_valido: boolean; razon_social: string | null; condicion_iva: string | null; domicilio: string | null; ingresos_brutos: string | null; inicio_actividades: string | null };
  configuracion: { alicuota_por_defecto: number; umbral_identificacion: number; iva_contenido_en_c: "leyenda" | "cero" };
  sitio: boolean; llave: boolean; pedido_pendiente: boolean; csr: string | null;
  certificado: { homologacion: string | null; produccion: string | null }; certificado_vence: string | null;
  acceso_vigente: boolean; acceso_vence: string | null; ultimo_error: string | null; probado_en: string | null;
  modo: "todas" | "elegir"; serie_por_defecto: "fiscal" | "interna"; letra: string | null;
  facturas: { autorizadas: number; en_cola: number; rechazadas: number; ultima_rechazada: string | null };
};
export type PuntoVenta = { id: number; numero: number; nombre: string | null; activo: boolean; por_defecto: boolean; bloqueado: boolean; baja: string | null; tipo_arca: string | null };
export type Llamada = { id: number; servicio: string; metodo: string; status: number | null; ms: number | null; ok: boolean; detalle: string | null; creado_en: string };

const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" }) : "");
const hora = (iso: string) => new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function Mensaje({ estado }: { estado: Estado }) {
  if (estado.ok) return <p role="status" className="flex items-start gap-1.5 text-sm font-semibold text-ok"><CircleCheck size={16} className="mt-0.5 shrink-0" /> {estado.ok}</p>;
  if (estado.error) return <p role="alert" className="flex items-start gap-1.5 text-sm text-error"><CircleAlert size={16} className="mt-0.5 shrink-0" /> {estado.error}</p>;
  return null;
}

// Un paso numerado (es una secuencia real: cada uno necesita el anterior)
function Paso({ n, titulo, listo, detalle, children }: { n: number; titulo: string; listo: boolean; detalle?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="tarjeta space-y-4" aria-labelledby={`paso-${n}`}>
      <div className="flex items-start gap-3">
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold text-white ${listo ? "bg-ok" : "bg-marca"}`} aria-hidden>{listo ? <CircleCheck size={16} strokeWidth={2.4} /> : n}</span>
        <div className="min-w-0">
          <h2 id={`paso-${n}`} className="font-semibold">{titulo}</h2>
          {detalle && <p className="text-sm text-texto-2">{detalle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function FilaPunto({ p }: { p: PuntoVenta }) {
  const [v, setV] = useState({ nombre: p.nombre ?? "", activo: p.activo, por_defecto: p.por_defecto });
  const [estado, setEstado] = useState<Estado>({});
  const [guardando, hacer] = useTransition();
  const guardar = (nuevo: typeof v) => { setV(nuevo); hacer(async () => setEstado(await guardarPunto(p.id, nuevo))); };
  const inhabilitado = p.bloqueado || !!p.baja;
  return (
    <li className="grid gap-2 py-3 sm:grid-cols-[5rem_1fr_auto_auto] sm:items-center">
      <span className="font-mono text-lg font-bold tabular-nums">{String(p.numero).padStart(4, "0")}</span>
      <div className="min-w-0">
        <input value={v.nombre} onChange={(e) => setV({ ...v, nombre: e.target.value })} onBlur={() => v.nombre !== (p.nombre ?? "") && guardar(v)}
          placeholder="Nombre (Local centro, Tienda online…)" maxLength={60} className="campo h-10 py-1.5" aria-label={`Nombre del punto de venta ${p.numero}`} />
        <p className="mt-0.5 text-xs text-texto-2">{p.tipo_arca ?? "Web services"}{p.bloqueado ? " · bloqueado en ARCA" : ""}{p.baja ? ` · dado de baja el ${fecha(p.baja)}` : ""}
          {guardando ? " · guardando…" : estado.error ? <span className="text-error"> · {estado.error}</span> : estado.ok ? <span className="text-ok"> · guardado</span> : null}</p>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.activo} disabled={inhabilitado} onChange={(e) => guardar({ ...v, activo: e.target.checked, por_defecto: e.target.checked && v.por_defecto })} className="h-4 w-4 accent-[var(--color-marca)]" /> Usar</label>
      <label className="flex items-center gap-2 text-sm"><input type="radio" name="por_defecto" checked={v.por_defecto} disabled={inhabilitado || !v.activo} onChange={() => guardar({ ...v, por_defecto: true })} className="h-4 w-4 accent-[var(--color-marca)]" /> El de siempre</label>
    </li>
  );
}

// En pruebas ARCA suele no listar puntos de venta: se agrega uno a mano (cualquier número sirve en ese ambiente)
function AgregarPuntoPrueba() {
  const [numero, setNumero] = useState("1");
  const [estado, setEstado] = useState<Estado>({});
  const [agregando, hacer] = useTransition();
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg bg-gray-50 p-3 text-sm">
      <p className="w-full text-texto-2">¿No aparece ninguno? En pruebas ARCA suele no listarlos: agregá uno a mano (cualquier número sirve en este ambiente).</p>
      <div><label className="etiqueta" htmlFor="pv-prueba">Punto de venta</label><input id="pv-prueba" value={numero} onChange={(x) => setNumero(x.target.value.replace(/\D/g, ""))} inputMode="numeric" className="campo h-10 w-28" /></div>
      <button type="button" disabled={agregando || !numero} onClick={() => hacer(async () => setEstado(await agregarPuntoPrueba(Number(numero))))} className="boton-sec min-h-10">Agregar</button>
      <Mensaje estado={estado} />
    </div>
  );
}

export default function Arca({ estado: e, puntos, llamadas }: { estado: EstadoArca; puntos: PuntoVenta[]; llamadas: Llamada[] }) {
  const [datos, accionDatos, guardandoDatos] = useActionState<Estado, FormData>(guardarDatos, {});
  const [pedido, accionPedido, generando] = useActionState<Estado, FormData>(generarPedido, {});
  const [cert, accionCert, guardandoCert] = useActionState<Estado, FormData>(guardarCertificado, {});
  const [categoria, setCategoria] = useState(e.datos.condicion_iva ?? "");
  const [ambiente, setAmbiente] = useState<Estado>({});
  const [cambiando, hacerAmbiente] = useTransition();
  const [prueba, setPrueba] = useState<{ pasos?: PasoPrueba[]; error?: string } | null>(null);
  const [probando, hacerPrueba] = useTransition();
  const [copiado, setCopiado] = useState(false);
  const [archivo, setArchivo] = useState<string | null>(null);
  const [certTexto, setCertTexto] = useState("");

  const csr = pedido.csr ?? e.csr;
  // Recién generado: se descarga solo
  const ultimo = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (pedido.csr && pedido.csr !== ultimo.current) { ultimo.current = pedido.csr; descargarTexto(pedido.csr); }
  }, [pedido.csr]); // eslint-disable-line react-hooks/exhaustive-deps
  const datosListos = e.datos.cuit_valido && !!e.datos.razon_social && !!e.datos.condicion_iva && !!e.datos.domicilio;
  const certificadoListo = !!e.certificado_vence && !e.pedido_pendiente;
  const conexionLista = e.acceso_vigente && puntos.some((p) => p.por_defecto);
  const produccion = e.ambiente === "produccion";
  function descargarTexto(texto: string) {
    const url = URL.createObjectURL(new Blob([texto], { type: "application/pkcs10" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `pedido-arca-${(e.datos.cuit ?? "").replace(/\D/g, "")}.csr` });
    a.click(); URL.revokeObjectURL(url);
  }
  const descargar = () => { if (csr) descargarTexto(csr); };

  return (
    <div className="space-y-4">
      <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border p-4 text-sm ${produccion ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
        {produccion ? <ShieldCheck size={20} className="shrink-0 text-ok" /> : <FlaskConical size={20} className="shrink-0 text-alerta" />}
        <p className="min-w-0 flex-1"><b>{produccion ? "Producción: ARCA de verdad." : "Pruebas (homologación)."}</b>{" "}
          {produccion ? "Lo que se facture tiene validez fiscal." : "Nada de lo que se haga acá tiene validez fiscal: sirve para probar sin riesgo."}
          {" "}{e.activa ? `La facturación está activa: las ventas salen con Factura ${e.letra ?? ""}.` : "La facturación todavía no está activa (paso 5)."}</p>
      </div>

      <Paso n={1} titulo="Datos fiscales del comercio" listo={datosListos} detalle="Van en cada factura. La categoría frente al IVA decide la letra (A, B o C).">
        <form action={accionDatos} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="etiqueta" htmlFor="cuit">CUIT</label><input id="cuit" name="cuit" defaultValue={e.datos.cuit ?? ""} required inputMode="numeric" placeholder="30-12345678-9" className="campo tabular-nums" /></div>
            <div><label className="etiqueta" htmlFor="razon_social">Razón social</label><input id="razon_social" name="razon_social" defaultValue={e.datos.razon_social ?? ""} required className="campo" /></div>
            <div><label className="etiqueta" htmlFor="condicion_iva">Categoría frente al IVA</label>
              <select id="condicion_iva" name="condicion_iva" value={categoria} onChange={(x) => setCategoria(x.target.value)} required className="campo">
                <option value="">Elegí…</option>{["Responsable Inscripto", "Monotributo", "IVA Exento"].map((c) => <option key={c}>{c}</option>)}</select></div>
            <div><label className="etiqueta" htmlFor="domicilio">Domicilio comercial</label><input id="domicilio" name="domicilio" defaultValue={e.datos.domicilio ?? ""} required className="campo" /></div>
            <div><label className="etiqueta" htmlFor="ingresos_brutos">Ingresos Brutos</label><input id="ingresos_brutos" name="ingresos_brutos" defaultValue={e.datos.ingresos_brutos ?? ""} placeholder="Número o «Convenio multilateral»" className="campo" /></div>
            <div><label className="etiqueta" htmlFor="inicio_actividades">Inicio de actividades</label><input id="inicio_actividades" name="inicio_actividades" type="date" defaultValue={e.datos.inicio_actividades ?? ""} className="campo" /></div>
          </div>
          <div className="grid gap-3 border-t border-borde pt-4 sm:grid-cols-2">
            <div><label className="etiqueta" htmlFor="alicuota">IVA de los artículos (de fábrica)</label>
              <select id="alicuota" name="alicuota" defaultValue={String(e.configuracion.alicuota_por_defecto)} className="campo">
                {[21, 10.5, 27, 5, 2.5, 0].map((a) => <option key={a} value={a}>{String(a).replace(".", ",")} %</option>)}</select>
              <p className="mt-0.5 text-[11px] text-texto-2">Cada artículo o rubro puede tener otro (se configura en la próxima etapa).</p></div>
            <div><label className="etiqueta" htmlFor="umbral">Pedir DNI al consumidor final desde</label>
              <div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-texto-2">$</span>
                <input id="umbral" name="umbral" inputMode="numeric" defaultValue={Math.round(e.configuracion.umbral_identificacion)} className="campo pl-7 tabular-nums" /></div>
              <p className="mt-0.5 text-[11px] text-texto-2">El monto que fija ARCA (hoy $ 10.000.000). Por debajo, la caja nunca pide DNI.</p></div>
            {categoria === "Monotributo" && (
              <div className="sm:col-span-2"><label className="etiqueta" htmlFor="iva_contenido_en_c">En la factura C, por la ley de transparencia fiscal</label>
                <select id="iva_contenido_en_c" name="iva_contenido_en_c" defaultValue={e.configuracion.iva_contenido_en_c} className="campo">
                  <option value="leyenda">Mostrar solo la leyenda de la Ley 27.743</option><option value="cero">Mostrar «IVA contenido $ 0» y la leyenda</option></select>
                <p className="mt-0.5 text-[11px] text-texto-2">Lo define tu contador.</p></div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button className="boton min-h-11" disabled={guardandoDatos}>{guardandoDatos ? "Guardando…" : "Guardar datos fiscales"}</button>
            <Mensaje estado={datos} />
          </div>
        </form>
      </Paso>

      <Paso n={2} titulo="Ambiente" listo={datosListos} detalle="Primero se prueba en el ambiente de pruebas de ARCA. Cuando todo anda, se pasa a producción (con otro certificado).">
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Ambiente de ARCA">
          {([["homologacion", "Pruebas (homologación)", "Facturas de mentira, para probar. Certificado de pruebas."], ["produccion", "Producción", "ARCA de verdad. Hace falta el certificado de producción."]] as const).map(([valor, titulo, texto]) => (
            <button key={valor} type="button" role="radio" aria-checked={e.ambiente === valor} disabled={cambiando}
              onClick={() => e.ambiente !== valor && hacerAmbiente(async () => setAmbiente(await cambiarAmbiente(valor)))}
              className={`rounded-lg border p-3 text-left transition-colors ${e.ambiente === valor ? "border-marca bg-marca-suave ring-1 ring-marca" : "border-borde bg-white hover:bg-gray-50"}`}>
              <span className="block text-sm font-bold">{titulo}</span><span className="block text-xs text-texto-2">{texto}</span>
            </button>
          ))}
        </div>
        <Mensaje estado={ambiente} />
      </Paso>

      <Paso n={3} titulo={`Certificado de ${produccion ? "producción" : "pruebas"}`} listo={certificadoListo}
        detalle={certificadoListo ? `Cargado: vale hasta el ${fecha(e.certificado_vence)}. Avisamos 30 días antes de que venza.` : "Es la «firma digital» del comercio ante ARCA. Se genera acá y se autoriza en la página de ARCA (ver el manual)."}>
        {!datosListos ? <p className="text-sm text-texto-2">Primero completá los datos fiscales (paso 1).</p> : !e.sitio ? (
          <p className="flex items-start gap-1.5 text-sm text-error"><CircleAlert size={16} className="mt-0.5 shrink-0" /> Falta la dirección del sitio en la instalación: avisale a quien instaló el sistema.</p>
        ) : (
          <div className="space-y-4">
            <form action={accionPedido} className="space-y-2">
              <p className="text-sm"><b>a) Generá el pedido de certificado</b> y subilo a ARCA.{e.llave && " Si ya tenés uno andando, generar otro no lo corta hasta que cargues el certificado nuevo."}</p>
              <div className="flex flex-wrap items-end gap-2">
                <div><label className="etiqueta" htmlFor="alias">Nombre para el certificado</label><input id="alias" name="alias" defaultValue="sistema" maxLength={30} className="campo h-11 w-48" /></div>
                <button className="boton-sec min-h-11" disabled={generando}>{generando ? <><Loader2 size={16} className="animate-spin" /> Generando…</> : "Generar pedido de certificado"}</button>
              </div>
              <Mensaje estado={pedido} />
              {csr && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 p-3">
                  <button type="button" onClick={descargar} className="boton min-h-10"><Download size={16} strokeWidth={1.8} /> Descargar el pedido (.csr)</button>
                  <span className="text-xs text-texto-2">Ese archivo es el que se sube en la página de ARCA.</span>
                  <details className="w-full text-xs text-texto-2"><summary className="cursor-pointer">Verlo como texto</summary>
                    <textarea readOnly value={csr} rows={4} className="campo mt-1 font-mono text-[11px]" aria-label="Pedido de certificado (CSR)" onFocus={(x) => x.currentTarget.select()} />
                    <button type="button" onClick={async () => { await navigator.clipboard.writeText(csr); setCopiado(true); setTimeout(() => setCopiado(false), 2000); }} className="boton-sec mt-1 min-h-9"><Copy size={15} strokeWidth={1.8} /> {copiado ? "Copiado" : "Copiar"}</button>
                  </details>
                </div>
              )}
            </form>
            <form action={accionCert} className="space-y-2 border-t border-borde pt-4">
              <p className="text-sm"><b>b) Subí el certificado que te da ARCA</b> (el archivo .crt).</p>
              <label className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed border-borde px-4 py-5 text-center text-sm hover:border-marca hover:bg-marca-suave">
                <Upload size={20} strokeWidth={1.8} className="text-marca" />
                <span className="font-semibold">{archivo ?? "Elegí el archivo del certificado"}</span>
                <span className="text-xs text-texto-2">.crt, .cer o .pem</span>
                <input type="file" accept=".crt,.cer,.pem,application/x-x509-ca-cert" className="sr-only"
                  onChange={async (x) => { const f = x.target.files?.[0]; if (!f) return; setArchivo(f.name); setCertTexto(await f.text()); }} />
              </label>
              <input type="hidden" name="certificado" value={certTexto} />
              <details className="text-xs text-texto-2"><summary className="cursor-pointer">¿Lo tenés como texto? Pegalo acá</summary>
                <textarea rows={4} value={certTexto} onChange={(x) => { setCertTexto(x.target.value); setArchivo(null); }} placeholder="-----BEGIN CERTIFICATE-----" className="campo mt-1 font-mono text-[11px]" aria-label="Certificado de ARCA como texto" /></details>
              <div className="flex flex-wrap items-center gap-3">
                <button className="boton min-h-11" disabled={guardandoCert || !certTexto.trim()}>{guardandoCert ? "Guardando…" : "Guardar certificado"}</button>
                <Mensaje estado={cert} />
              </div>
            </form>
          </div>
        )}
      </Paso>

      <Paso n={4} titulo="Probar la conexión y elegir el punto de venta" listo={conexionLista}
        detalle="Se fija que ARCA responda, que el certificado ande y trae los puntos de venta habilitados para web services.">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => hacerPrueba(async () => {
            // De a un paso, mostrando cada resultado apenas llega; si uno falla, no sigue
            const pasos: PasoPrueba[] = [];
            for (const p of ["servicio", "acceso", "puntos_venta"] as const) {
              const r = await probarPaso(p); pasos.push(r); setPrueba({ pasos: [...pasos] });
              if (!r.ok && p !== "puntos_venta") break;
            }
          })} disabled={probando || !certificadoListo} className="boton min-h-11">
            {probando ? <><Loader2 size={16} className="animate-spin" /> Probando…</> : <><PlugZap size={17} strokeWidth={1.8} /> Probar la conexión</>}</button>
          {!certificadoListo && <span className="text-sm text-texto-2">Primero cargá el certificado (paso 3).</span>}
          {e.probado_en && !prueba && <span className="text-sm text-texto-2">Última prueba: {hora(e.probado_en)}{e.acceso_vigente && e.acceso_vence ? ` · acceso vigente hasta las ${new Date(e.acceso_vence).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}` : ""}</span>}
        </div>
        {prueba?.error && <p role="alert" className="text-sm text-error">{prueba.error}</p>}
        {prueba?.pasos && (
          <ul className="space-y-1.5 text-sm">
            {prueba.pasos.map((p) => <li key={p.paso} className={`flex items-start gap-2 ${p.ok ? "text-ok" : "text-error"}`}>{p.ok ? <CircleCheck size={16} className="mt-0.5 shrink-0" /> : <CircleAlert size={16} className="mt-0.5 shrink-0" />}<span>{p.texto}</span></li>)}
          </ul>
        )}
        {!prueba && e.ultimo_error && <p className="flex items-start gap-1.5 text-sm text-error"><CircleAlert size={16} className="mt-0.5 shrink-0" /> {e.ultimo_error}</p>}
        {!produccion && e.acceso_vigente && <AgregarPuntoPrueba />}
        {puntos.length > 0 && (
          <div className="border-t border-borde pt-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Store size={16} strokeWidth={1.8} /> Puntos de venta habilitados en ARCA</h3>
            <ul className="divide-y divide-gray-100">{puntos.map((p) => <FilaPunto key={`${p.id}-${p.por_defecto}-${p.activo}`} p={p} />)}</ul>
            <p className="text-xs text-texto-2">Se crean en la página de ARCA (ver el manual). Usá uno exclusivo del sistema: si otro programa factura con el mismo, se pisan los números.</p>
          </div>
        )}
      </Paso>

      <Activar e={e} listo={datosListos && certificadoListo && puntos.some((p) => p.por_defecto && p.activo)} />

      {llamadas.length > 0 && (
        <details className="tarjeta text-sm">
          <summary className="cursor-pointer font-semibold">Últimas comunicaciones con ARCA</summary>
          <ul className="mt-2 space-y-1">
            {llamadas.map((l) => (
              <li key={l.id} className="flex flex-wrap gap-x-2 text-xs">
                <span className="text-texto-2">{hora(l.creado_en)}</span><span className="font-mono">{l.servicio} · {l.metodo}</span>
                <span className={l.ok ? "text-ok" : "text-error"}>{l.ok ? "bien" : "con error"}</span>{l.ms != null && <span className="text-texto-2">{l.ms} ms</span>}
                {l.detalle && !l.ok && <span className="w-full text-error">{l.detalle}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

// Paso 5: prender la facturación y elegir cómo se usa en la caja
function Activar({ e, listo }: { e: EstadoArca; listo: boolean }) {
  const [modo, setModo] = useState(e.modo);
  const [serie, setSerie] = useState(e.serie_por_defecto);
  const [estado, setEstado] = useState<Estado>({});
  const [guardando, hacer] = useTransition();
  const guardar = (activa: boolean) => hacer(async () => setEstado(await activarFacturacion(activa, modo, serie)));
  const opcion = (sel: boolean, texto: string, detalle: string, alElegir: () => void) => (
    <label className={`flex cursor-pointer flex-col gap-0.5 rounded-lg border p-3 text-sm ${sel ? "border-marca bg-marca-suave/40 ring-1 ring-marca" : "border-borde hover:bg-gray-50"}`}>
      <input type="radio" checked={sel} onChange={alElegir} className="sr-only" /><span className="font-semibold">{texto}</span><span className="text-texto-2">{detalle}</span>
    </label>
  );
  return (
    <Paso n={5} titulo="Activar la facturación" listo={e.activa}
      detalle={e.letra ? `Con la categoría cargada, a un consumidor final le sale Factura ${e.letra}.` : "Falta la categoría frente al IVA (paso 1)."}>
      <div className="grid gap-2 sm:grid-cols-2">
        {opcion(modo === "elegir", "La caja elige", "En cada venta: «Factura» o «Comprobante interno». Una venta interna se puede facturar después.", () => setModo("elegir"))}
        {opcion(modo === "todas", "Todas con factura", "Cada venta sale con factura, sin preguntar.", () => setModo("todas"))}
      </div>
      {modo === "elegir" && (
        <div className="flex flex-wrap items-center gap-3 text-sm"><span className="text-texto-2">En la caja viene marcado:</span>
          {(["fiscal", "interna"] as const).map((x) => (
            <label key={x} className="flex items-center gap-1.5"><input type="radio" name="serie" checked={serie === x} onChange={() => setSerie(x)} className="h-4 w-4 accent-[var(--color-marca)]" />
              {x === "fiscal" ? `Factura ${e.letra ?? ""}` : "Comprobante interno"}</label>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {e.activa ? <>
          <button type="button" disabled={guardando} onClick={() => guardar(true)} className="boton min-h-10"><FileCheck2 size={16} /> Guardar</button>
          <button type="button" disabled={guardando} onClick={() => guardar(false)} className="boton-sec min-h-10"><Power size={16} /> Apagar la facturación</button>
        </> : <button type="button" disabled={guardando || !listo} onClick={() => guardar(true)} className="boton min-h-11"><Power size={16} /> {guardando ? "Activando…" : "Activar la facturación"}</button>}
        {!listo && !e.activa && <span className="text-sm text-texto-2">Primero completá los pasos 1 a 4.</span>}
        <Mensaje estado={estado} />
      </div>
      {(e.facturas.autorizadas > 0 || e.facturas.en_cola > 0 || e.facturas.rechazadas > 0) && (
        <div className="flex flex-wrap gap-2 border-t border-borde pt-3 text-sm">
          <span className="rounded-full bg-green-50 px-2.5 py-1 font-semibold text-ok">{e.facturas.autorizadas} autorizadas</span>
          {e.facturas.en_cola > 0 && <span className="rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-alerta">{e.facturas.en_cola} en la cola (se reintentan solas)</span>}
          {e.facturas.rechazadas > 0 && <span className="rounded-full bg-red-50 px-2.5 py-1 font-semibold text-error">{e.facturas.rechazadas} rechazadas</span>}
          {e.facturas.ultima_rechazada && <p className="w-full text-xs text-error">Último rechazo: {e.facturas.ultima_rechazada}. Se corrige el dato y se reintenta desde la venta.</p>}
        </div>
      )}
    </Paso>
  );
}
