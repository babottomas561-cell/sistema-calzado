"use client";
// Cobro con el posnet de Mercado Pago (Point): manda el monto al posnet, espera que el cliente pase la tarjeta y devuelve la
// referencia del cobro aprobado (la orden), que la caja guarda en el pago. La base vuelve a controlar todo al confirmar la venta.
import { useEffect, useState } from "react";
import { CircleAlert, CircleCheck, Loader2, Smartphone, X } from "lucide-react";
import { crearClienteNavegador } from "@/lib/supabase/navegador";
import { pesos } from "@/lib/formato";

type Estado = { estado: string; detalle: string | null; orden: string | null; usado: boolean };
const FINALES: Record<string, string> = { cancelado: "Se canceló el cobro", rechazado: "El posnet rechazó el pago", vencido: "El cobro venció sin que se pagara", error: "No se pudo mandar el cobro", reembolsado: "El cobro fue devuelto" };

export default function CobroPoint({ monto, terminal, referencia, onAprobado }: { monto: number; terminal: string | null; referencia: string; onAprobado: (orden: string | null) => void }) {
  const [supabase] = useState(() => crearClienteNavegador());
  const [cobro, setCobro] = useState<number | null>(null);
  const [montoCobro, setMontoCobro] = useState(0);
  const [estado, setEstado] = useState<Estado | null>(null);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const aprobado = estado?.estado === "aprobado";
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

  async function mandar() {
    setError(""); setEnviando(true);
    const { data, error: e } = await supabase.rpc("point_cobrar", { p_monto: monto });
    setEnviando(false);
    const r = data as { ok: boolean; error?: string; id?: number } | null;
    if (e || !r?.ok || !r.id) { setError(e?.message ?? r?.error ?? "No se pudo mandar el cobro"); return; }
    setCobro(r.id); setMontoCobro(monto); setEstado({ estado: "en_terminal", detalle: null, orden: null, usado: false });
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
      <CircleCheck size={16} /> <span className="font-semibold">Cobrado con el posnet: {pesos(montoCobro)}</span>
      <span className="text-xs">Referencia {referencia}</span>
    </div>
  );
  const esperando = !!cobro && !!estado && !aprobado && !FINALES[estado.estado];
  return (
    <div className="space-y-2 rounded-lg border border-borde bg-white p-3">
      {desfasado && <p className="flex items-start gap-1.5 text-sm text-alerta"><CircleAlert size={15} className="mt-0.5 shrink-0" /> El total cambió después de cobrar ({pesos(montoCobro)}). Ese cobro no sirve: hay que devolverlo desde Mercado Pago y cobrar de nuevo.</p>}
      {esperando ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="flex items-center gap-2 text-sm font-semibold"><Loader2 size={16} className="animate-spin" /> Esperando al cliente en el posnet… {pesos(montoCobro)}</p>
          <button type="button" onClick={cancelar} className="boton-sec h-9 px-3 text-sm"><X size={14} /> Cancelar cobro</button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={desfasado || estado ? otraVez : mandar} disabled={enviando || monto <= 0} className="boton h-10">
            <Smartphone size={16} strokeWidth={1.8} /> {enviando ? "Mandando…" : estado && !desfasado ? "Cobrar de nuevo" : `Cobrar ${pesos(monto)} en el posnet`}</button>
          {terminal && <span className="text-xs text-texto-2">{terminal}</span>}
        </div>
      )}
      {estado && FINALES[estado.estado] && <p className="text-sm text-error" role="alert">{FINALES[estado.estado]}{estado.detalle ? ` (${estado.detalle})` : ""}</p>}
      {error && <p className="text-sm text-error" role="alert">{error}</p>}
    </div>
  );
}
