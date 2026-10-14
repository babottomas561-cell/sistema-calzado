"use client";
// El pago de un pedido: si está pagado (Mercado Pago o confirmado a mano) o cuánto falta, y registrar un pago recibido. Reglas:
//   · el EFECTIVO lo confirma un cajero (el que lo recibió): queda «pendiente» hasta tildar «recibí el efectivo» o confirmarlo después;
//   · la TRANSFERENCIA pide lo que decidió el dueño en Medios de pago: nada, el n.º de operación o el comprobante adjunto (foto o PDF);
//   · lo que se paga con Mercado Pago se verifica solo.
import { useActionState, useRef, useState, useTransition } from "react";
import { CircleAlert, CircleCheck, Clock, Paperclip, Trash2 } from "lucide-react";
import { crearClienteNavegador } from "@/lib/supabase/navegador";
import { fechaHora, pesos } from "@/lib/formato";
import { confirmarPago, quitarPagoPendiente, registrarPago } from "../acciones";

export type PagoManual = { id: number; fecha: string; monto: number; referencia: string | null; medio: string | null; tipo: string | null; confirmado: boolean; comprobante: string | null };
type Medio = { id: number; nombre: string; tipo: string };

export default function Pago({ pedido, aPagar, pagadoOnline, pagos, exigeParaEnviar, abierto, medios, medioPedido, exigencia, puedeConfirmar }: {
  pedido: number; aPagar: number; pagadoOnline: boolean; pagos: PagoManual[]; exigeParaEnviar: boolean; abierto: boolean;
  medios: Medio[]; medioPedido: number; exigencia: "no" | "referencia" | "adjunto"; puedeConfirmar: boolean;
}) {
  const [estado, accion, guardando] = useActionState(registrarPago, {});
  const [medio, setMedio] = useState(medioPedido);
  const [archivo, setArchivo] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [errorArchivo, setErrorArchivo] = useState("");
  const [ocupado, hacer] = useTransition();
  const [aviso, setAviso] = useState<{ error?: string; ok?: string }>({});
  const entrada = useRef<HTMLInputElement>(null);
  const confirmado = pagos.filter((p) => p.confirmado).reduce((s, p) => s + p.monto, 0);
  const pendiente = pagos.filter((p) => !p.confirmado).reduce((s, p) => s + p.monto, 0);
  const falta = Math.max(0, aPagar - confirmado);
  const pagado = pagadoOnline || falta < 0.01;
  const m = medios.find((x) => x.id === medio);
  const esEfectivo = m?.tipo === "Efectivo";

  async function subir(f: File | undefined) {
    if (!f) return;
    setErrorArchivo(""); setSubiendo(true);
    const ext = (f.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
    const ruta = `pedido-${pedido}/${crypto.randomUUID()}.${ext}`;
    const { error } = await crearClienteNavegador().storage.from("comprobantes-pago").upload(ruta, f, { contentType: f.type, upsert: false });
    setSubiendo(false);
    if (error) { setErrorArchivo(error.message.includes("mime") || error.message.includes("size") ? "El archivo tiene que ser una foto o un PDF de hasta 8 MB" : error.message); return; }
    setArchivo(ruta);
  }
  async function ver(ruta: string) {
    const { data } = await crearClienteNavegador().storage.from("comprobantes-pago").createSignedUrl(ruta, 120);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <section className="tarjeta space-y-2 text-sm">
      <h2 className="font-semibold">Pago</h2>
      {pagado
        ? <p className="flex items-center gap-1.5 font-semibold text-ok"><CircleCheck size={16} /> Pagado{pagadoOnline ? " con Mercado Pago (verificado solo)" : ""}</p>
        : <p className={`flex items-center gap-1.5 font-semibold ${exigeParaEnviar ? "text-alerta" : "text-texto-2"}`}><CircleAlert size={16} />
            Falta pagar {pesos(falta)}{exigeParaEnviar ? ": no se puede enviar hasta que esté pagado" : ""}</p>}
      {pendiente > 0 && <p className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-alerta"><Clock size={14} /> {pesos(pendiente)} anotado sin confirmar: no cuenta hasta que un cajero lo confirme</p>}
      {pagos.length > 0 && (
        <ul className="space-y-1.5 text-xs">{pagos.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {p.confirmado ? <CircleCheck size={13} className="text-ok" /> : <Clock size={13} className="text-alerta" />}
            <span>{fechaHora(p.fecha)} · <b>{pesos(p.monto)}</b>{p.medio ? ` · ${p.medio}` : ""}{p.referencia ? ` · ${p.referencia}` : ""}</span>
            {p.comprobante && <button type="button" onClick={() => ver(p.comprobante!)} className="inline-flex items-center gap-1 font-semibold text-marca"><Paperclip size={12} /> Ver comprobante</button>}
            {!p.confirmado && abierto && <>
              {puedeConfirmar && <button type="button" disabled={ocupado} onClick={() => hacer(async () => setAviso(await confirmarPago(p.id)))} className="boton min-h-8 px-2.5 text-xs">Confirmar que lo recibí</button>}
              <button type="button" disabled={ocupado} onClick={() => hacer(async () => setAviso(await quitarPagoPendiente(p.id)))} aria-label="Sacar este pago" className="inline-flex items-center gap-1 text-texto-2 hover:text-error"><Trash2 size={13} /> Sacar</button>
            </>}
          </li>
        ))}</ul>
      )}
      {aviso.error && <p role="alert" className="text-xs text-error">{aviso.error}</p>}
      {!pagado && abierto && (
        <form action={accion} key={estado.ok ?? "pago"} className="space-y-2 border-t border-borde pt-2">
          <input type="hidden" name="pedido_id" value={pedido} /><input type="hidden" name="comprobante" value={archivo ?? ""} />
          <div className="grid grid-cols-[1fr_8rem] gap-2">
            <select name="medio_pago_id" value={medio} onChange={(e) => setMedio(Number(e.target.value))} className="campo" aria-label="Con qué pagó">{medios.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select>
            <div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-texto-2">$</span>
              <input name="monto" inputMode="decimal" defaultValue={Math.max(0, aPagar - confirmado - pendiente).toFixed(2).replace(".", ",")} className="campo pl-7" aria-label="Monto recibido" /></div>
          </div>
          {esEfectivo ? (
            puedeConfirmar
              ? <label className="flex items-start gap-2 rounded-lg bg-gray-50 p-2.5 text-xs"><input type="checkbox" name="confirma" defaultChecked className="mt-0.5 h-4 w-4 accent-[var(--color-marca)]" /> <span><b>Confirmo que recibí el efectivo.</b> Si no lo tildás, queda pendiente hasta que un cajero lo confirme.</span></label>
              : <p className="rounded-lg bg-amber-50 p-2.5 text-xs text-alerta">Vas a dejarlo anotado: un cajero tiene que confirmar que recibió el efectivo.</p>
          ) : (
            <>
              <input name="referencia" placeholder={exigencia === "no" ? "N.º de operación (opcional)" : "N.º de operación (obligatorio)"} className="campo" aria-label="N.º de operación" required={exigencia === "referencia"} />
              <div className="space-y-1">
                  <input ref={entrada} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={(e) => subir(e.target.files?.[0])} />
                  <button type="button" onClick={() => entrada.current?.click()} disabled={subiendo} className="boton-sec min-h-10 text-sm"><Paperclip size={15} /> {subiendo ? "Subiendo…" : archivo ? "Cambiar el comprobante" : exigencia === "adjunto" ? "Adjuntar el comprobante (obligatorio)" : "Adjuntar el comprobante (opcional)"}</button>
                  {archivo && <p className="flex items-center gap-1 text-xs text-ok"><CircleCheck size={13} /> Comprobante subido</p>}
                  {errorArchivo && <p role="alert" className="text-xs text-error">{errorArchivo}</p>}
              </div>
            </>
          )}
          {estado.error && <p className="text-error">{estado.error}</p>}
          {estado.ok && <p className="text-ok">{estado.ok}</p>}
          <button className="boton-sec" disabled={guardando || subiendo}>{guardando ? "Guardando…" : "Registrar pago recibido"}</button>
          <p className="text-xs text-texto-2">Es la constancia de que ya pagó: al entregarlo, la venta se registra con el medio del pedido, sin cobrarlo dos veces.</p>
        </form>
      )}
    </section>
  );
}
