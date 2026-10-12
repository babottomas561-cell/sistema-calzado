"use client";
// La IA (Gemini): la clave, qué modelo usa el bot, a qué precio, con qué plan (gratis o pago), cuánto se va usando del
// límite gratis de hoy y cuánto costaría. La clave se guarda en la base y no se vuelve a leer.
import { useActionState, useState } from "react";
import { CircleAlert, CircleCheck, RefreshCw } from "lucide-react";
import { dia, fechaHora } from "@/lib/formato";
import { buscarModelos, guardarConexiones, guardarIA, probarGemini } from "./acciones";

export type ConfigIA = { ia_modelo: string; ia_plan: "gratis" | "pago" };
export type Modelo = {
  id: string; nombre: string; precio_entrada: number | null; precio_salida: number | null; tiene_gratis: boolean;
  limite_diario_gratis: number | null; nota: string | null; verificado: string; disponible: boolean; nuevo: boolean;
};
export type EstadoIA = {
  gemini: string | null;
  ia_modelos_revisado: string | null;
  ia_modelos_error: string | null;
  ia_prueba: { estado: "probando" | "ok" | "error"; fecha?: string; error?: string | null } | null;
  ia_hoy: { consultas: number; limite: number | null; reinicia: string };
  ia_mes: { respuestas: number; consultas: number; tokens_entrada: number; tokens_salida: number; costo_usd: number; estimado_usd: number };
};

const usd = (n: number | null | undefined, dec = 2) => `US$ ${Number(n ?? 0).toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: 4 })}`;
const precio = (m: Modelo) => (m.precio_entrada == null || m.precio_salida == null ? "precio a confirmar" : `${usd(m.precio_entrada)} / ${usd(m.precio_salida)}`);
const VIEJO = 60 * 86_400_000;   // un precio verificado hace más de 2 meses: avisar

function Aviso({ estado }: { estado: { error?: string; ok?: string } }) {
  if (estado.error) return <p className="text-sm text-error">{estado.error}</p>;
  if (estado.ok) return <p className="flex items-center gap-1.5 text-sm text-ok"><CircleCheck size={15} /> {estado.ok}</p>;
  return null;
}

function Paso({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return <div className="space-y-3 rounded-lg border border-borde p-3"><p className="text-sm font-semibold">{n}. {titulo}</p>{children}</div>;
}

// La clave de Gemini (se guarda con las demás conexiones; vacío = no se toca)
function ClaveGemini({ cargada }: { cargada: string | null }) {
  const [estado, accion, guardando] = useActionState(guardarConexiones, {});
  return (
    <form action={accion} className="space-y-2">
      <label className="etiqueta flex items-center justify-between gap-2" htmlFor="gemini_api_key">Clave de Gemini
        {cargada ? <span className="inline-flex items-center gap-1 text-xs font-normal text-ok"><CircleCheck size={13} /> Cargada {cargada}</span>
          : <span className="text-xs font-normal text-alerta">Sin cargar</span>}</label>
      <input id="gemini_api_key" name="gemini_api_key" type="password" autoComplete="off" placeholder={cargada ? "Dejalo vacío para no cambiarla" : "AIza…"} className="campo" />
      <p className="text-[11px] text-texto-2">aistudio.google.com → Get API key → Crear clave de API. Sin ella, el bot de WhatsApp contesta un mensaje fijo.</p>
      {cargada && <label className="inline-flex items-center gap-1.5 text-xs text-texto-2"><input type="checkbox" name="quitar" value="gemini" /> Quitarla</label>}
      <Aviso estado={estado} />
      <button className="boton-sec" disabled={guardando}>{guardando ? "Guardando…" : "Guardar clave"}</button>
    </form>
  );
}

export default function IA({ config, modelos, ia, hoy }: { config: ConfigIA; modelos: Modelo[]; ia: EstadoIA; hoy: string }) {
  const [estado, guardar, guardando] = useActionState(guardarIA, {});
  const [prueba, probar, probando] = useActionState(probarGemini, {});
  const [busqueda, buscar, buscando] = useActionState(buscarModelos, {});
  const [elegido, setElegido] = useState(config.ia_modelo);
  const m = modelos.find((x) => x.id === elegido);
  const actual = modelos.find((x) => x.id === config.ia_modelo);
  const usados = ia.ia_hoy.consultas, limite = ia.ia_hoy.limite;
  const pct = limite ? Math.min(100, Math.round((usados / limite) * 100)) : 0;

  return (
    <div className="space-y-4 px-5 py-4">
      <Paso n={1} titulo="La clave"><ClaveGemini cargada={ia.gemini} /></Paso>

      <Paso n={2} titulo="Probala">
        <form action={probar} className="space-y-2 text-sm">
          <p className="text-xs text-texto-2">Le hace una pregunta corta a Gemini con la clave y el modelo guardados.</p>
          <button className="boton-sec" disabled={probando || !ia.gemini}>{probando ? "Probando…" : "Probar Gemini"}</button>
          {!ia.gemini && <p className="text-xs text-alerta">Primero cargá la clave</p>}
          {ia.ia_prueba?.estado === "ok" && <p className="flex items-center gap-1 text-ok"><CircleCheck size={15} /> Funciona{ia.ia_prueba.fecha && ` (probado ${fechaHora(ia.ia_prueba.fecha)})`}</p>}
          {ia.ia_prueba?.estado === "probando" && <p className="text-texto-2">Esperando la respuesta de Google… actualizá la página.</p>}
          {ia.ia_prueba?.estado === "error" && <p className="flex items-center gap-1 text-error"><CircleAlert size={15} /> No anduvo: {ia.ia_prueba.error ?? "sin respuesta"}</p>}
          <Aviso estado={prueba} />
        </form>
      </Paso>

      <Paso n={3} titulo="Modelo, precio y plan">
        <form action={guardar} className="space-y-3">
          {actual && !actual.disponible && <p className="flex items-center gap-1.5 rounded-lg bg-red-50 p-2 text-xs text-error"><CircleAlert size={14} /> Google ya no ofrece {actual.nombre}: elegí otro modelo para que el bot siga andando.</p>}
          <div><label className="etiqueta" htmlFor="ia_modelo">Modelo</label>
            <select id="ia_modelo" name="ia_modelo" value={elegido} onChange={(e) => setElegido(e.target.value)} className="campo">
              {modelos.filter((x) => x.disponible || x.id === config.ia_modelo).map((x) => (
                <option key={x.id} value={x.id}>{x.nombre}{x.nuevo ? " (nuevo)" : ""} · {precio(x)}{x.disponible ? "" : " · ya no está"}</option>
              ))}
            </select>
            {m?.nota && <p className="mt-0.5 text-[11px] text-texto-2">{m.nota}</p>}</div>
          {m && (
            <div key={m.id} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div><label className="etiqueta" htmlFor="precio_entrada">US$ por millón (lo que se le manda)</label>
                <input id="precio_entrada" name="precio_entrada" type="number" min={0} step="0.0001" defaultValue={m.precio_entrada ?? ""} className="campo" /></div>
              <div><label className="etiqueta" htmlFor="precio_salida">US$ por millón (lo que contesta)</label>
                <input id="precio_salida" name="precio_salida" type="number" min={0} step="0.0001" defaultValue={m.precio_salida ?? ""} className="campo" /></div>
              <div><label className="etiqueta" htmlFor="limite_diario_gratis">Consultas gratis por día</label>
                <input id="limite_diario_gratis" name="limite_diario_gratis" type="number" min={1} step={1} defaultValue={m.limite_diario_gratis ?? ""} placeholder="de AI Studio" className="campo" /></div>
              <p className={`text-[11px] sm:col-span-3 ${m.precio_entrada == null || new Date(hoy).getTime() - new Date(m.verificado).getTime() > VIEJO ? "text-alerta" : "text-texto-2"}`}>
                {m.precio_entrada == null ? "Este modelo es nuevo: confirmá su precio" : `Precio verificado el ${dia(m.verificado)}`} en ai.google.dev/gemini-api/docs/pricing.
                {" "}El límite gratis no lo publica Google: está en aistudio.google.com → tu proyecto → Límites de frecuencia (RPD).</p>
            </div>
          )}
          <fieldset className="space-y-1.5">
            <legend className="etiqueta">Plan de Google</legend>
            <label className="flex items-start gap-2 text-sm"><input type="radio" name="ia_plan" value="gratis" defaultChecked={config.ia_plan === "gratis"} className="mt-1" />
              <span><b>Gratis</b> <span className="text-texto-2">— no se paga; hay un tope de consultas por día. El sistema muestra cuánto costaría.</span></span></label>
            <label className="flex items-start gap-2 text-sm"><input type="radio" name="ia_plan" value="pago" defaultChecked={config.ia_plan === "pago"} className="mt-1" />
              <span><b>Pago</b> <span className="text-texto-2">— con facturación activada en Google. Cada respuesta suma su costo a Gastos → Inteligencia artificial.</span></span></label>
          </fieldset>
          <Aviso estado={estado} />
          <button className="boton" disabled={guardando}>{guardando ? "Guardando…" : "Guardar modelo y plan"}</button>
        </form>
        <form action={buscar} className="space-y-1 border-t border-borde pt-3 text-sm">
          <p className="text-xs text-texto-2">La lista de modelos se revisa sola cada mañana: suma los nuevos y marca los que Google retira.
            {ia.ia_modelos_revisado ? ` Última revisión: ${fechaHora(ia.ia_modelos_revisado)}.` : ia.gemini ? " Todavía no se revisó." : " Hace falta la clave de Gemini."}</p>
          {ia.ia_modelos_error && <p className="flex items-center gap-1 text-xs text-error"><CircleAlert size={14} /> La última búsqueda falló: {ia.ia_modelos_error}</p>}
          <button className="boton-sec inline-flex items-center gap-1.5" disabled={buscando || !ia.gemini}><RefreshCw size={15} strokeWidth={1.8} />{buscando ? "Buscando…" : "Buscar modelos ahora"}</button>
          <Aviso estado={busqueda} />
        </form>
      </Paso>

      <div className="space-y-3 rounded-lg bg-gray-50 p-3 text-sm">
        <p className="font-semibold">Uso de la IA</p>
        <div>
          <div className="flex items-baseline justify-between gap-2"><span>Hoy ({actual?.nombre ?? config.ia_modelo})</span>
            <span className="font-semibold">{usados}{limite ? ` de ${limite} gratis` : " consultas"}</span></div>
          {limite ? <div className="mt-1 h-2 rounded-full bg-white"><div className={`h-2 rounded-full ${pct >= 90 ? "bg-error" : pct >= 70 ? "bg-alerta" : "bg-ok"}`} style={{ width: `${Math.max(pct, 1)}%` }} /></div>
            : <p className="text-xs text-alerta">Cargá arriba las consultas gratis por día para ver cuánto queda.</p>}
          <p className="mt-1 text-xs text-texto-2">El día de Google se reinicia {fechaHora(ia.ia_hoy.reinicia)} (medianoche en California). Cuando se pasa el tope, Google deja de contestar hasta esa hora y el bot manda el mensaje fijo.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <p><span className="block text-xs text-texto-2">Respuestas del mes</span><b>{ia.ia_mes.respuestas}</b></p>
          <p><span className="block text-xs text-texto-2">Tokens enviados / recibidos</span><b>{Number(ia.ia_mes.tokens_entrada).toLocaleString("es-AR")} / {Number(ia.ia_mes.tokens_salida).toLocaleString("es-AR")}</b></p>
          <p><span className="block text-xs text-texto-2">{config.ia_plan === "pago" ? "Gastado este mes" : "Pagando, costaría"}</span><b>{usd(config.ia_plan === "pago" ? ia.ia_mes.costo_usd : ia.ia_mes.estimado_usd)}</b></p>
          <p><span className="block text-xs text-texto-2">Por respuesta, en promedio</span><b>{usd(ia.ia_mes.respuestas ? ia.ia_mes.estimado_usd / ia.ia_mes.respuestas : 0, 4)}</b></p>
        </div>
      </div>
    </div>
  );
}
