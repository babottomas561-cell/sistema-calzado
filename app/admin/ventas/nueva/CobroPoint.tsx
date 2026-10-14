"use client";
// Cobro con el posnet de Mercado Pago (Point): manda el monto al posnet, espera que el cliente pase la tarjeta y devuelve la
// referencia del cobro aprobado (la orden), que la caja guarda en el pago. La base vuelve a controlar todo al confirmar la venta.
import { useEffect, useRef, useState } from "react";
import { CircleAlert, CircleCheck, Loader2, QrCode, Smartphone, X } from "lucide-react";
import QRCode from "qrcode";
import { crearClienteNavegador } from "@/lib/supabase/navegador";
import { pesos } from "@/lib/formato";

type Estado = { estado: string; detalle: string | null; orden: string | null; usado: boolean; qr?: string | null };
const FINALES: Record<string, string> = { cancelado: "Se canceló el cobro", rechazado: "El posnet rechazó el pago", vencido: "El cobro venció sin que se pagara", error: "No se pudo mandar el cobro", reembolsado: "El cobro fue devuelto" };

export default function CobroPoint({ monto, terminal, referencia, onAprobado, via = "point", permiteQr = true, permiteFijo = true, onPendiente, cajaId = null, qrMinimo = 0 }: {
  qrMinimo?: number;   // el menor cobro que acepta Mercado Pago por QR
  cajaId?: number | null;   // la caja del sistema que cobra (cada una tiene su QR y su posnet)
  onPendiente?: (pendiente: boolean) => void;   // el cobro está esperando el pago (la caja puede frenar la venta)
  monto: number; terminal: string | null; referencia: string; onAprobado: (orden: string | null) => void; via?: "point" | "qr"; permiteQr?: boolean; permiteFijo?: boolean }) {
  const [supabase] = useState(() => crearClienteNavegador());
  const [cobro, setCobro] = useState<number | null>(null);
  const [montoCobro, setMontoCobro] = useState(0);
  const [estado, setEstado] = useState<Estado | null>(null);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [imagenQr, setImagenQr] = useState("");
  const [hayFijo, setHayFijo] = useState(false);       // el QR impreso del mostrador (modo híbrido)
  const [fijo, setFijo] = useState(false);             // este cobro se hizo con el QR del mostrador
  const chico = via === "qr" && monto > 0 && monto < qrMinimo;   // Mercado Pago lo rechazaría
  const aprobado = estado?.estado === "aprobado";
  const avisar = useRef(onPendiente);
  useEffect(() => { avisar.current = onPendiente; });
  const pendiente = !!cobro && !!estado && !aprobado && !FINALES[estado.estado];
  useEffect(() => { avisar.current?.(pendiente); return () => avisar.current?.(false); }, [pendiente]);
  // Si cambia el monto después de aprobar, ese cobro ya no sirve para esta venta
  const desfasado = aprobado && Math.abs(montoCobro - monto) > 0.009;

  useEffect(() => {
    if (!cobro || !estado || ["aprobado", ...Object.keys(FINALES)].includes(estado.estado)) return;
    const t = setTimeout(async () => {
      const { data, error: e } = await supabase.rpc("point_estado", { p_cobro: cobro });
      if (e) { setError(e.message); return; }
      const nuevo = data as unknown as Estado;
      setEstado(nuevo);
      if (nuevo.estado === "aprobado") onAprobado(nuevo.orden);
    }, 2000);
    return () => clearTimeout(t);
  }, [cobro, estado, supabase, onAprobado]);

  useEffect(() => {
    if (via !== "qr") return;
    supabase.rpc("qr_fijo", cajaId ? { p_caja: cajaId } : {}).then(({ data }) => { const r = data as { listo?: boolean; imagen?: string | null; plantilla?: string | null } | null; setHayFijo(!!(r?.listo && (r.imagen || r.plantilla))); });
  }, [via, supabase, cajaId]);

  // El QR se dibuja acá a partir del texto que da Mercado Pago (no sale de la base como imagen)
  useEffect(() => {
    if (via !== "qr" || !estado?.qr) return;
    QRCode.toDataURL(estado.qr, { width: 360, margin: 1 }).then(setImagenQr, () => setError("No se pudo dibujar el QR"));
  }, [via, estado?.qr]);

  async function mandar(delMostrador = false) {
    setError(""); setEnviando(true); setFijo(delMostrador); setImagenQr("");
    const { data, error: e } = via === "qr" ? await supabase.rpc("qr_cobrar", { p_monto: monto, p_modo: delMostrador ? "hybrid" : "dynamic", ...(cajaId ? { p_caja: cajaId } : {}) }) : await supabase.rpc("point_cobrar", { p_monto: monto, ...(cajaId ? { p_caja: cajaId } : {}) });
    setEnviando(false);
    const r = data as { ok: boolean; error?: string; id?: number } | null;
    if (e || !r?.ok || !r.id) { setError(e?.message ?? r?.error ?? "No se pudo mandar el cobro"); return; }
    setCobro(r.id); setMontoCobro(monto); setEstado({ estado: "en_terminal", detalle: null, orden: null, usado: false });
    if (via === "qr") { const { data: d } = await supabase.rpc("point_estado", { p_cobro: r.id }); const n = d as unknown as Estado | null; if (n) setEstado(n); }
  }

  async function cancelar() {
    if (!cobro) return;
    const { data, error: e } = await supabase.rpc("point_cancelar", { p_cobro: cobro });
    const r = data as { ok: boolean; error?: string } | null;
    if (e || !r?.ok) setError(e?.message ?? r?.error ?? "No se pudo cancelar: cancelalo desde el posnet");
  }

  function otraVez() { setCobro(null); setEstado(null); setError(""); onAprobado(null); }

  if (aprobado && !desfasado) return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-green-50 p-3 text-sm text-ok">
      <CircleCheck size={16} /> <span className="font-semibold">Cobrado {via === "qr" ? "con QR" : "con el posnet"}: {pesos(montoCobro)}</span>
      <span className="text-xs">Referencia {referencia}</span>
    </div>
  );
  const esperando = !!cobro && !!estado && !aprobado && !FINALES[estado.estado];
  return (
    <div className="space-y-2 rounded-lg border border-borde bg-white p-3">
      {desfasado && <p className="flex items-start gap-1.5 text-sm text-alerta"><CircleAlert size={15} className="mt-0.5 shrink-0" /> El total cambió después de cobrar ({pesos(montoCobro)}). Ese cobro no sirve: hay que devolverlo desde Mercado Pago y cobrar de nuevo.</p>}
      {esperando ? (
        <div className="flex flex-wrap items-center gap-3">
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-sm font-semibold"><Loader2 size={16} className="animate-spin" /> {via === "qr" ? (fijo ? "Esperando que el cliente escanee el QR del mostrador y pague…" : "Esperando que el cliente escanee y pague…") : "Esperando al cliente en el posnet…"} {pesos(montoCobro)}</p>
            {via === "qr" && !fijo && imagenQr && (
              <img src={imagenQr} alt={`QR para pagar ${pesos(montoCobro)}`} width={280} height={280} className="mx-auto rounded-lg border border-borde bg-white p-2" />)}
          </div>
          <button type="button" onClick={cancelar} className="boton-sec h-9 px-3 text-sm"><X size={14} /> Cancelar cobro</button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={desfasado || estado ? otraVez : () => mandar(via === "qr" && !permiteQr)} disabled={enviando || monto <= 0 || chico} className="boton h-10">
            {via === "qr" ? <QrCode size={16} strokeWidth={1.8} /> : <Smartphone size={16} strokeWidth={1.8} />} {enviando ? (via === "qr" ? "Generando…" : "Mandando…") : estado && !desfasado ? "Cobrar de nuevo" : via === "qr" ? (permiteQr ? `Cobrar ${pesos(monto)} con QR` : `Cobrar ${pesos(monto)} con el QR del mostrador`) : `Cobrar ${pesos(monto)} en el posnet`}</button>
          {via === "qr" && permiteQr && permiteFijo && hayFijo && !estado && <button type="button" onClick={() => mandar(true)} disabled={enviando || monto <= 0 || chico} className="boton-sec h-10">Con el QR del mostrador</button>}
          {via === "point" && terminal && <span className="text-xs text-texto-2">{terminal}</span>}
        </div>
      )}
      {chico && !estado && <p className="text-sm text-alerta">Mercado Pago no acepta cobros por QR menores a {pesos(qrMinimo)}. Elegí otro medio de pago para este importe.</p>}
      {estado && FINALES[estado.estado] && <p className="text-sm text-error" role="alert">{FINALES[estado.estado]}{estado.detalle ? ` (${estado.detalle})` : ""}</p>}
      {error && <p className="text-sm text-error" role="alert">{error}</p>}
    </div>
  );
}
