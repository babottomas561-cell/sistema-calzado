"use client";
// La agenda con los clientes: lo vencido arriba (en rojo), lo de hoy, lo que viene y los cumpleaños. Cada cosa con WhatsApp ya escrito, «Hecho» y
// «Posponer» (mañana o en una semana). «Nuevo seguimiento» se carga acá mismo: cliente, qué hacer y cuándo.
import { useActionState, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { CalendarClock, CalendarPlus, Cake, Check, CircleAlert, CircleCheck, Clock, MessageCircle, Phone, Plus, X } from "lucide-react";
import { paraWhatsApp } from "@/lib/telefono";
import { crearSeguimiento, hecho, posponer, type Estado } from "./acciones";

export type Pendiente = { id: number; cliente_id: number; cliente: string; telefono: string | null; accion: string; fecha: string | null; nota: string | null; canal: string | null };
export type Cumple = { id: number; nombre: string; telefono: string | null; dia: string; hoy: boolean };
type Cliente = { id: number; nombre: string; telefono: string | null };

const diasEntre = (a: string, b: string) => Math.round((new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 864e5);
const cuandoTexto = (fecha: string | null, hoy: string) => {
  if (!fecha) return "Sin fecha";
  const d = diasEntre(hoy, fecha);
  if (d === 0) return "Hoy"; if (d === 1) return "Mañana"; if (d === -1) return "Ayer";
  if (d < 0) return `Hace ${-d} días`;
  if (d < 7) return new Date(`${fecha}T12:00:00`).toLocaleDateString("es-AR", { weekday: "long" }).replace(/^./, (x) => x.toUpperCase());
  return new Date(`${fecha}T12:00:00`).toLocaleDateString("es-AR", { day: "numeric", month: "short" });
};
const masDias = (hoy: string, n: number) => { const d = new Date(`${hoy}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const primerNombre = (n: string) => n.split(" ")[0];

const IDEAS = ["Avisarle que entró su talle", "Mandarle la promo", "Llamarlo por el reclamo", "Ofrecerle lo nuevo de la temporada", "Recordarle el pedido para retirar"];

function Nuevo({ clientes, hoy, alCerrar }: { clientes: Cliente[]; hoy: string; alCerrar: () => void }) {
  const [estado, accion, guardando] = useActionState<Estado, FormData>(async (prev, f) => { const r = await crearSeguimiento(prev, f); if (r.ok) alCerrar(); return r; }, {});
  const [busca, setBusca] = useState("");
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [que, setQue] = useState("");
  const [cuando, setCuando] = useState(masDias(hoy, 1));
  const opciones = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return t ? clientes.filter((c) => c.nombre.toLowerCase().includes(t) || (c.telefono ?? "").replace(/\D/g, "").includes(t.replace(/\D/g, "") || "#")).slice(0, 6) : [];
  }, [busca, clientes]);
  const rapido = [["Hoy", 0], ["Mañana", 1], ["En 3 días", 3], ["En una semana", 7]] as const;
  return (
    <form action={accion} className="tarjeta space-y-4 border-marca/40">
      <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 font-semibold"><CalendarPlus size={18} /> Nuevo seguimiento</h2>
        <button type="button" onClick={alCerrar} className="grid h-9 w-9 place-items-center rounded-md text-gray-500 hover:bg-gray-100" aria-label="Cerrar"><X size={18} /></button></div>
      <div>
        <span className="etiqueta">Cliente</span>
        {cliente ? (
          <div className="flex items-center justify-between rounded-lg bg-marca-suave px-3 py-2 text-sm"><b>{cliente.nombre}</b>
            <button type="button" onClick={() => setCliente(null)} className="text-xs font-semibold text-marca underline">Cambiar</button></div>
        ) : (
          <div className="space-y-1">
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscá por nombre o teléfono" className="campo" aria-label="Buscar cliente" autoFocus />
            {opciones.length > 0 && <ul className="rounded-lg border border-borde">{opciones.map((c) => (
              <li key={c.id}><button type="button" onClick={() => { setCliente(c); setBusca(""); }} className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50">{c.nombre}{c.telefono && <span className="text-texto-2"> · {c.telefono}</span>}</button></li>
            ))}</ul>}
          </div>
        )}
        {cliente && <input type="hidden" name="cliente_id" value={cliente.id} />}
      </div>
      <div>
        <label className="etiqueta" htmlFor="s-accion">Qué hay que hacer</label>
        <input id="s-accion" name="accion" value={que} onChange={(e) => setQue(e.target.value)} maxLength={200} placeholder="Avisarle que entró el 42 en negro" className="campo" />
        <div className="mt-1.5 flex flex-wrap gap-1.5">{IDEAS.map((i) => <button key={i} type="button" onClick={() => setQue(i)} className="rounded-full border border-borde px-2.5 py-1 text-xs text-texto-2 hover:bg-gray-50">{i}</button>)}</div>
      </div>
      <div>
        <span className="etiqueta">Cuándo</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {rapido.map(([t, n]) => (
            <button key={t} type="button" onClick={() => setCuando(masDias(hoy, n))} className={`rounded-lg border px-3 py-1.5 text-sm ${cuando === masDias(hoy, n) ? "border-marca bg-marca-suave font-semibold text-marca" : "border-borde bg-white"}`}>{t}</button>
          ))}
          <input type="date" name="cuando" value={cuando} min={hoy} onChange={(e) => setCuando(e.target.value)} className="campo h-9 w-auto" aria-label="Otra fecha" />
        </div>
      </div>
      <div><label className="etiqueta" htmlFor="s-nota">Nota (opcional)</label><input id="s-nota" name="nota" maxLength={300} placeholder="Lo pidió por Instagram; prefiere que le escriban a la tarde" className="campo" /></div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="boton min-h-10" disabled={guardando || !cliente || !que.trim()}>{guardando ? "Guardando…" : "Agendar"}</button>
        {estado.error && <p role="alert" className="flex items-center gap-1.5 text-sm text-error"><CircleAlert size={15} /> {estado.error}</p>}
      </div>
    </form>
  );
}

function Fila({ p, hoy, tienda, quien, puedeEditar }: { p: Pendiente; hoy: string; tienda: string; quien: string | null; puedeEditar: boolean }) {
  const [ocupado, hacer] = useTransition();
  const [listo, setListo] = useState<string | null>(null);
  const wa = paraWhatsApp(p.telefono);
  const vencido = !!p.fecha && p.fecha < hoy;
  const mensaje = `Hola ${primerNombre(p.cliente)}! ${quien ? `Te escribe ${quien} de ` : "Te escribimos de "}${tienda}. `;
  if (listo) return <li className="flex items-center gap-2 py-3 text-sm text-ok"><CircleCheck size={16} /> {p.cliente}: {listo}</li>;
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <Link href={`/admin/clientes/${p.cliente_id}`} className="font-semibold text-marca">{p.cliente}</Link>
          <span className={`text-xs font-semibold ${vencido ? "text-error" : "text-texto-2"}`}>{cuandoTexto(p.fecha, hoy)}</span>
        </div>
        <p className="text-sm">{p.accion}</p>
        {p.nota && <p className="text-xs text-texto-2">{p.nota}</p>}
      </div>
      <div className="flex shrink-0 flex-wrap gap-1.5">
        {wa && <a href={`https://wa.me/${wa}?text=${encodeURIComponent(mensaje)}`} target="_blank" rel="noopener noreferrer" className="boton-sec min-h-9 px-3 text-sm"><MessageCircle size={15} /> WhatsApp</a>}
        {!wa && p.telefono && <a href={`tel:${p.telefono}`} className="boton-sec min-h-9 px-3 text-sm"><Phone size={15} /> Llamar</a>}
        {puedeEditar && <>
          <button type="button" disabled={ocupado} onClick={() => hacer(async () => { const r = await posponer(p.id, 1); if (r.ok) setListo("pospuesto para mañana"); })} className="boton-sec min-h-9 px-3 text-sm" title="Posponer para mañana"><Clock size={15} /> Pasar a mañana</button>
          <button type="button" disabled={ocupado} onClick={() => hacer(async () => { const r = await posponer(p.id, 7); if (r.ok) setListo("pospuesto una semana"); })} className="boton-sec min-h-9 px-3 text-sm" title="Posponer una semana"><CalendarClock size={15} /> +7 días</button>
          <button type="button" disabled={ocupado} onClick={() => hacer(async () => { const r = await hecho(p.id, p.cliente_id); if (r.ok) setListo("hecho"); })} className="boton min-h-9 px-3 text-sm"><Check size={15} /> Hecho</button>
        </>}
      </div>
    </li>
  );
}

export default function Agenda({ pendientes, cumples, hoy, clientes, puedeEditar, tienda, quien }: {
  pendientes: Pendiente[]; cumples: Cumple[]; hoy: string; clientes: Cliente[]; puedeEditar: boolean; tienda: string; quien: string | null;
}) {
  const [nuevo, setNuevo] = useState(false);
  const enSemana = masDias(hoy, 7);
  const grupos: { titulo: string; filas: Pendiente[]; rojo?: boolean }[] = [
    { titulo: "Vencidos", filas: pendientes.filter((p) => p.fecha && p.fecha < hoy), rojo: true },
    { titulo: "Hoy", filas: pendientes.filter((p) => p.fecha === hoy) },
    { titulo: "Esta semana", filas: pendientes.filter((p) => p.fecha && p.fecha > hoy && p.fecha <= enSemana) },
    { titulo: "Más adelante", filas: pendientes.filter((p) => p.fecha && p.fecha > enSemana) },
    { titulo: "Sin fecha", filas: pendientes.filter((p) => !p.fecha) },
  ];
  const resumen = [["Vencidos", grupos[0].filas.length, "text-error"], ["Hoy", grupos[1].filas.length, "text-marca"], ["Esta semana", grupos[2].filas.length, ""], ["Cumpleaños", cumples.length, ""]] as const;

  return (
    <div className="max-w-4xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-bold">Seguimientos</h1>
          <p className="text-sm text-texto-2">Lo que quedó para hacer con cada cliente: avisarle que entró su talle, mandarle una promo, llamarlo por un reclamo. También se cargan desde la ficha del cliente.</p></div>
        {puedeEditar && !nuevo && <button type="button" onClick={() => setNuevo(true)} className="boton"><Plus size={16} /> Nuevo seguimiento</button>}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {resumen.map(([t, n, c]) => <div key={t} className="tarjeta"><p className="text-xs font-semibold text-texto-2">{t}</p><p className={`text-2xl font-bold tabular-nums ${n ? c : "text-gray-400"}`}>{n}</p></div>)}
      </div>
      {nuevo && <Nuevo clientes={clientes} hoy={hoy} alCerrar={() => setNuevo(false)} />}

      {cumples.length > 0 && (
        <section className="tarjeta space-y-2">
          <h2 className="flex items-center gap-2 font-semibold"><Cake size={18} /> Cumpleaños esta semana</h2>
          <ul className="divide-y divide-gray-100">{cumples.map((c) => {
            const wa = paraWhatsApp(c.telefono);
            return (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span><Link href={`/admin/clientes/${c.id}`} className="font-semibold text-marca">{c.nombre}</Link>
                  <span className={c.hoy ? "font-semibold text-ok" : "text-texto-2"}> · {c.hoy ? "¡hoy!" : `${c.dia.slice(3)}/${c.dia.slice(0, 2)}`}</span></span>
                {wa && <a href={`https://wa.me/${wa}?text=${encodeURIComponent(`¡Feliz cumpleaños, ${primerNombre(c.nombre)}! Te saludamos de ${tienda}.`)}`} target="_blank" rel="noopener noreferrer" className="boton-sec min-h-9 px-3"><MessageCircle size={15} /> Saludar</a>}
              </li>
            );
          })}</ul>
        </section>
      )}

      {grupos.filter((g) => g.filas.length).map((g) => (
        <section key={g.titulo} className="tarjeta">
          <h2 className={`font-semibold ${g.rojo ? "text-error" : ""}`}>{g.titulo} <span className="font-normal text-texto-2">({g.filas.length})</span></h2>
          <ul className="divide-y divide-gray-100">{g.filas.map((p) => <Fila key={p.id} p={p} hoy={hoy} tienda={tienda} quien={quien} puedeEditar={puedeEditar} />)}</ul>
        </section>
      ))}
      {!pendientes.length && !cumples.length && (
        <div className="rounded-xl border border-dashed border-borde px-4 py-10 text-center">
          <p className="font-semibold">No hay nada pendiente</p>
          <p className="text-sm text-texto-2">Cuando un cliente pida algo (un talle que no hay, que le avisen de una promo), agendalo acá y te lo recuerda el día que toca.</p>
        </div>
      )}
    </div>
  );
}
