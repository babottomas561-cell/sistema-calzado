"use client";
import { useState, useTransition } from "react";
import { resolver, type Estado } from "./acciones";

export default function Resolver({ id }: { id: number }) {
  const [nota, setNota] = useState("");
  const [estado, setEstado] = useState<Estado>({});
  const [cargando, ir] = useTransition();
  const enviar = (que: "resuelto" | "rechazado") => ir(async () => setEstado(await resolver(id, que, nota)));
  return (
    <div className="space-y-2 border-t border-borde pt-3">
      <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Qué se hizo o por qué se rechaza" aria-label="Respuesta" className="campo" />
      <div className="flex flex-wrap items-center gap-2">
        <button className="boton" disabled={cargando} onClick={() => enviar("resuelto")}>Marcar como resuelto</button>
        <button className="boton-sec" disabled={cargando} onClick={() => enviar("rechazado")}>Rechazar</button>
        {estado.error && <span className="text-sm text-error" role="alert">{estado.error}</span>}
      </div>
    </div>
  );
}
