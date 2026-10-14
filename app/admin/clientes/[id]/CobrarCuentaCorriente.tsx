"use client";
// Modal para registrar un recibo de cobro a un cliente con deuda en cuenta corriente.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleAlert, HandCoins, Plus, ReceiptText, Trash2, X } from "lucide-react";
import { pesos } from "@/lib/formato";
import { registrarReciboCobro } from "../acciones";

type Medio = { id: number; nombre: string; tipo: string };

type LineaCobro = {
  medio_pago_id: number;
  monto: number;
  referencia: string;
};

export default function CobrarCuentaCorriente({
  clienteId,
  clienteNombre,
  saldoDeudor,
  medios,
}: {
  clienteId: number;
  clienteNombre: string;
  saldoDeudor: number;
  medios: Medio[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [notas, setNotas] = useState("");

  const mediosValidos = medios.filter((m) => m.tipo !== "Cuenta corriente");
  const medioDefault = mediosValidos[0]?.id ?? 0;

  const [pagos, setPagos] = useState<LineaCobro[]>([
    { medio_pago_id: medioDefault, monto: Math.max(0, saldoDeudor), referencia: "" },
  ]);

  const totalAbonado = pagos.reduce((acc, p) => acc + (Number(p.monto) || 0), 0);
  const saldoRestante = Math.max(0, saldoDeudor - totalAbonado);

  const abrirModal = () => {
    setPagos([{ medio_pago_id: medioDefault, monto: Math.max(0, saldoDeudor), referencia: "" }]);
    setError("");
    setNotas("");
    setAbierto(true);
  };

  const agregarMedio = () => {
    setPagos([...pagos, { medio_pago_id: medioDefault, monto: 0, referencia: "" }]);
  };

  const quitarMedio = (index: number) => {
    if (pagos.length <= 1) return;
    setPagos(pagos.filter((_, i) => i !== index));
  };

  const actualizarPago = (index: number, campo: keyof LineaCobro, valor: string | number) => {
    setPagos(
      pagos.map((p, i) =>
        i === index ? { ...p, [campo]: campo === "monto" ? Number(valor) || 0 : valor } : p
      )
    );
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totalAbonado <= 0) {
      setError("El monto a cobrar debe ser mayor a 0");
      return;
    }
    setCargando(true);
    setError("");

    try {
      const res = await registrarReciboCobro(
        clienteId,
        pagos.map((p) => ({
          medio_pago_id: p.medio_pago_id,
          monto: Number(p.monto) || 0,
          referencia: p.referencia.trim() || undefined,
        })),
        notas
      );

      if (res.error) {
        setError(res.error);
        setCargando(false);
      } else if (res.id) {
        setAbierto(false);
        router.push(`/admin/comprobante/recibo/${res.id}?nueva=1`);
      }
    } catch {
      setError("Ocurrió un error al registrar el recibo. Intentá nuevamente.");
      setCargando(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={abrirModal}
        className="boton py-1.5 text-xs shadow-sm"
      >
        <HandCoins size={15} strokeWidth={2} /> Registrar cobro
      </button>

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-borde bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-marca-suave text-marca">
                  <ReceiptText size={20} strokeWidth={2} />
                </span>
                <div>
                  <h3 className="font-bold text-gray-900">Recibo de cobro</h3>
                  <p className="text-xs text-texto-2">Cuenta corriente de {clienteNombre}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                className="grid h-8 w-8 place-items-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={enviar} className="mt-4 space-y-4">
              {/* Resumen de saldo */}
              <div className="grid grid-cols-2 gap-3 rounded-xl bg-gray-50 p-3 text-sm">
                <div>
                  <span className="block text-xs font-medium text-texto-2">Deuda actual</span>
                  <span className="text-base font-bold text-alerta">{pesos(saldoDeudor)}</span>
                </div>
                <div>
                  <span className="block text-xs font-medium text-texto-2">Saldo restante</span>
                  <span className="text-base font-bold text-gray-900">{pesos(saldoRestante)}</span>
                </div>
              </div>

              {/* Medios de cobro */}
              <div className="space-y-2">
                <label className="etiqueta">Medios de cobro</label>
                {pagos.map((p, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <select
                      value={p.medio_pago_id}
                      onChange={(e) => actualizarPago(idx, "medio_pago_id", Number(e.target.value))}
                      className="campo flex-1 text-sm"
                    >
                      {mediosValidos.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nombre}
                        </option>
                      ))}
                    </select>

                    <div className="relative w-32">
                      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-texto-2">
                        $
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={p.monto || ""}
                        onChange={(e) => actualizarPago(idx, "monto", e.target.value)}
                        placeholder="0"
                        className="campo pl-6 text-right font-medium"
                      />
                    </div>

                    <input
                      type="text"
                      placeholder="N.º comp / ref"
                      value={p.referencia}
                      onChange={(e) => actualizarPago(idx, "referencia", e.target.value)}
                      className="campo w-28 text-xs"
                      title="Referencia o comprobante"
                    />

                    {pagos.length > 1 && (
                      <button
                        type="button"
                        onClick={() => quitarMedio(idx)}
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-error"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                ))}

                <button
                  type="button"
                  onClick={agregarMedio}
                  className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-marca hover:underline"
                >
                  <Plus size={13} /> Agregar otro medio de pago
                </button>
              </div>

              {/* Notas */}
              <div>
                <label className="etiqueta">Notas u observaciones (opcional)</label>
                <input
                  type="text"
                  placeholder="Ej: Pago a cuenta de compras del mes"
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  className="campo text-sm"
                />
              </div>

              {error && (
                <p className="flex items-center gap-1.5 rounded-lg bg-red-50 p-2.5 text-xs font-medium text-error">
                  <CircleAlert size={14} className="shrink-0" /> {error}
                </p>
              )}

              {/* Acciones */}
              <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-3">
                <button
                  type="button"
                  onClick={() => setAbierto(false)}
                  className="boton-sec"
                  disabled={cargando}
                >
                  Cancelar
                </button>
                <button type="submit" className="boton" disabled={cargando || totalAbonado <= 0}>
                  {cargando ? (
                    "Registrando…"
                  ) : (
                    <>
                      <Check size={16} /> Emitir recibo ({pesos(totalAbonado)})
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
