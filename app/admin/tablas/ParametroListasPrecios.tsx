"use client";
// Switch para activar/desactivar las Listas de Precios como parámetro del sistema.
import { useState, useTransition } from "react";
import { CircleAlert, CircleCheck, Tags } from "lucide-react";
import { alternarListasPrecios } from "./acciones";

export default function ParametroListasPrecios({ activaInicial }: { activaInicial: boolean }) {
  const [activa, setActiva] = useState(activaInicial);
  const [isPending, startTransition] = useTransition();
  const [mensaje, setMensaje] = useState<{ texto: string; ok: boolean } | null>(null);

  const cambiar = (nueva: boolean) => {
    setActiva(nueva);
    setMensaje(null);
    startTransition(async () => {
      const res = await alternarListasPrecios(nueva);
      if (res.error) {
        setActiva(!nueva);
        setMensaje({ texto: res.error, ok: false });
      } else {
        setMensaje({ texto: res.ok ?? "Configuración guardada", ok: true });
        setTimeout(() => setMensaje(null), 3000);
      }
    });
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-borde bg-gray-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-marca shadow-xs ring-1 ring-borde">
          <Tags size={18} strokeWidth={2} />
        </span>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900">Listas de precios</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                activa ? "bg-green-100 text-ok" : "bg-gray-200 text-texto-2"
              }`}
            >
              {activa ? "Habilitadas" : "Apagadas (precio único)"}
            </span>
          </div>
          <p className="text-xs text-texto-2">
            Permite diferenciar precios entre el local físico y la tienda web (o listas personalizadas), con ajustes porcentuales y excepciones por artículo.
          </p>
          {mensaje && (
            <p
              className={`mt-1 flex items-center gap-1 text-xs font-medium ${
                mensaje.ok ? "text-ok" : "text-error"
              }`}
            >
              {mensaje.ok ? <CircleCheck size={13} /> : <CircleAlert size={13} />} {mensaje.texto}
            </p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
        <label className="relative inline-flex cursor-pointer items-center">
          <input
            type="checkbox"
            className="peer sr-only"
            checked={activa}
            disabled={isPending}
            onChange={(e) => cambiar(e.target.checked)}
          />
          <div className="peer h-6 w-11 rounded-full bg-gray-200 peer-focus:outline-hidden peer-focus:ring-2 peer-focus:ring-marca/20 peer-checked:bg-marca peer-checked:after:translate-x-full peer-checked:after:border-white after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-disabled:opacity-50"></div>
        </label>
      </div>
    </div>
  );
}
