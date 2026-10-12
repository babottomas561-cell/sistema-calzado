"use client";
// «Comprobar en internet»: consulta el DNS de verdad y dice, registro por registro, qué está bien y qué falta, con los
// pasos del proveedor donde está el dominio (NIC.ar, Cloudflare, GoDaddy…). No hace falta esperar a que Vercel lo revise.
import { useState, useTransition } from "react";
import { CircleAlert, CircleCheck, CircleX, Search } from "lucide-react";
import { Markdown } from "@/lib/markdown";
import { guiaDe, GUIAS, nombreCorto } from "@/lib/dns-guias";
import type { Diagnostico } from "@/lib/dns";
import { diagnosticarDominio } from "../acciones";

export default function DiagnosticoDns({ id, dominio, verificado }: { id: number; dominio: string; verificado: boolean }) {
  const [resultado, setResultado] = useState<Diagnostico | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revisando, revisar] = useTransition();
  const faltan = resultado?.chequeos.filter((c) => !c.ok) ?? [];
  // Un .ar sin servidores de nombres es un dominio todavía sin delegar en NIC.ar: no tiene DNS en ningún lado
  const guia = resultado ? (resultado.sinDelegar && dominio.endsWith(".ar") ? GUIAS.nic : guiaDe(resultado.proveedor)) : null;
  const apex = dominio.replace(/^www\./, "");

  return (
    <div className="space-y-2 text-sm">
      <button type="button" className="boton-sec inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs" disabled={revisando}
        onClick={() => revisar(async () => { setError(null); const r = await diagnosticarDominio(id); if (r.error) setError(r.error); else setResultado(r.diagnostico ?? null); })}>
        <Search size={13} /> {revisando ? "Consultando internet…" : "Comprobar en internet"}</button>
      {error && <p className="flex items-center gap-1 text-xs text-error"><CircleAlert size={13} /> {error}</p>}

      {resultado && guia && (
        <div className="space-y-3 rounded-lg border border-borde p-3">
          {resultado.sinDelegar && <p className="flex items-start gap-1.5 text-alerta"><CircleAlert size={15} className="mt-0.5 shrink-0" />
            <span>Este dominio <b>todavía no responde en internet</b>{dominio.endsWith(".ar") ? ": falta delegarlo en NIC.ar" : ": revisá que esté activo y que tenga servidores de nombres"}.</span></p>}
          {!resultado.sinDelegar && <p className="text-xs text-texto-2">Servidores de nombres hoy: <span className="font-mono">{resultado.servidores.join(", ")}</span>{resultado.proveedor && <> · parece estar en <b>{guiaDe(resultado.proveedor).nombre}</b></>}</p>}

          {resultado.chequeos.length > 0 && (
            <ul className="space-y-1.5">
              {resultado.chequeos.map((c, i) => (
                <li key={i} className="flex items-start gap-2">
                  {c.ok ? <CircleCheck size={16} className="mt-0.5 shrink-0 text-ok" /> : <CircleX size={16} className="mt-0.5 shrink-0 text-error" />}
                  <span>
                    <span className="font-mono text-xs"><b>{c.registro.tipo}</b> {nombreCorto(c.registro.nombre, apex)} → {c.registro.valor}</span>
                    <span className="block text-xs text-texto-2">{c.ok ? "Ya está cargado." : c.hoy.length ? `Hoy ese nombre dice: ${c.hoy.join(", ")}. Cambialo por el de arriba.` : "Todavía no existe (o no se propagó)."}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {resultado.chequeos.length > 0 && faltan.length === 0 && (
            <p className="flex items-start gap-1.5 text-ok"><CircleCheck size={15} className="mt-0.5 shrink-0" /> <span>Los registros ya están bien en internet. Falta que Vercel lo confirme: se revisa solo cada 10 minutos, o tocá <b>Revisar ahora</b>.</span></p>
          )}
          {resultado.chequeos.length === 0 && verificado && <p className="flex items-start gap-1.5 text-ok"><CircleCheck size={15} className="mt-0.5 shrink-0" /> No hay registros pendientes.</p>}

          {(faltan.length > 0 || resultado.sinDelegar) && (
            <details className="rounded-lg bg-gray-50 p-3" open>
              <summary className="cursor-pointer font-semibold">Cómo cargarlos en {guia.nombre}</summary>
              <div className="mt-2"><Markdown texto={[...guia.pasos.map((p, i) => `${i + 1}. ${p}`), ...(guia.avisos ?? []).map((a) => `> ${a}`)].join("\n")} /></div>
              <p className="mt-2 text-[11px] text-texto-2">Los nombres de los menús pueden cambiar un poco. Si no lo encontrás, escribile al soporte de ese proveedor con esta lista de registros.</p>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
