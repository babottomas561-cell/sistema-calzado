"use client";
// Instagram: requisitos, conexión (el token se escribe acá y la base no lo devuelve nunca), estado y las publicaciones
// copiadas, que se pueden ocultar de la tienda una por una.
import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { CircleAlert, CircleCheck, Eye, EyeOff, GalleryHorizontal, Play, RefreshCw, Unplug } from "lucide-react";
import { IconoInstagram } from "@/components/IconoInstagram";
import { dia, fechaHora } from "@/lib/formato";
import { conectarInstagram, desconectarInstagram, mostrarPublicacion, sincronizarInstagram } from "../acciones";

export type EstadoInstagram = {
  conectado: boolean; usuario: string | null; tipo_cuenta: string | null; token: string | null; vence: string | null; dias: number | null;
  conectado_en: string | null; sincronizado_en: string | null; error: string | null; publicaciones: number; visibles: number;
};
export type Publicacion = { id: number; tipo: string; imagen_url: string; permalink: string; descripcion: string | null; publicado_en: string; visible: boolean };
type Aviso = { error?: string; ok?: string };

function Mensaje({ e }: { e: Aviso }) {
  if (e.error) return <p className="flex items-start gap-1.5 text-sm text-error" role="alert"><CircleAlert size={15} className="mt-0.5 shrink-0" /> {e.error}</p>;
  if (e.ok) return <p className="flex items-start gap-1.5 text-sm text-ok"><CircleCheck size={15} className="mt-0.5 shrink-0" /> {e.ok}</p>;
  return null;
}

const REQUISITOS = [
  <>Tu Instagram es una cuenta <b>profesional</b> (Business o de Creador). Si es personal, se cambia gratis en Instagram → Configuración → Tipo de cuenta y herramientas. <b>Sin esto no se puede conectar.</b></>,
  <>La cuenta es <b>pública</b>: las fotos que mostramos son las que cualquiera ve en tu perfil.</>,
  <>Tenés una <b>app de Meta</b> (tipo Business) con el producto «Instagram». Puede ser la misma que usás para WhatsApp.</>,
  <>Generaste un <b>token</b> en esa app (el manual de abajo te dice dónde).</>,
];

export default function Instagram({ estado: e, publicaciones, seccion }: { estado: EstadoInstagram; publicaciones: Publicacion[]; seccion: boolean }) {
  const [guardado, conectar, conectando] = useActionState(conectarInstagram, {});
  const [aviso, setAviso] = useState<Aviso>({});
  const [ocupado, hacer] = useTransition();
  const dias = e.dias;
  const porVencer = e.conectado && dias !== null && dias < 15;
  return (
    <div className="space-y-5 px-5 py-4">
      <p className={`flex items-center gap-1.5 rounded-lg p-2.5 text-sm ${e.conectado ? "bg-green-50 text-ok" : "bg-amber-50 text-alerta"}`}>
        {e.conectado ? <CircleCheck size={16} /> : <CircleAlert size={16} />}
        {e.conectado ? <>Instagram conectado: <b>@{e.usuario}</b>{e.tipo_cuenta ? ` (${e.tipo_cuenta === "BUSINESS" ? "cuenta Business" : "cuenta de Creador"})` : ""}</> : "Instagram: falta conectar"}</p>

      {!e.conectado && (
        <div className="rounded-lg border border-borde p-3 text-sm">
          <p className="font-semibold">Antes de empezar, necesitás</p>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-texto-2">{REQUISITOS.map((r, i) => <li key={i}>{r}</li>)}</ol>
        </div>
      )}

      {e.error && <p className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-error"><CircleAlert size={16} className="mt-0.5 shrink-0" /> {e.error}</p>}
      {porVencer && !e.error && <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-alerta"><CircleAlert size={16} className="mt-0.5 shrink-0" /> El token vence en {Math.max(dias ?? 0, 0)} días y todavía no se renovó solo. Generá uno nuevo en Meta y pegalo acá.</p>}

      <form action={conectar} className="space-y-2">
        <label className="etiqueta flex items-center justify-between gap-2" htmlFor="token">Token de Instagram
          {e.token ? <span className="inline-flex items-center gap-1 text-xs font-normal text-ok"><CircleCheck size={13} /> Cargado {e.token}</span> : <span className="text-xs font-normal text-alerta">Sin cargar</span>}</label>
        <input id="token" name="token" type="password" autoComplete="off" placeholder={e.token ? "Pegá uno nuevo solo si querés cambiarlo" : "IGAA…"} className="campo" />
        <p className="text-[11px] text-texto-2">Se verifica con Meta al guardar y queda guardado en la base, donde nadie lo puede volver a leer. Dura 60 días y se renueva solo.</p>
        <div className="flex flex-wrap items-center gap-3">
          <button className="boton" disabled={conectando}>{conectando ? "Verificando con Meta…" : e.conectado ? "Cambiar el token" : "Conectar Instagram"}</button>
          <Mensaje e={guardado} />
        </div>
      </form>

      {e.conectado && (
        <div className="space-y-3 border-t border-borde pt-4">
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <div className="flex justify-between gap-2"><dt className="text-texto-2">Última actualización</dt><dd>{e.sincronizado_en ? fechaHora(e.sincronizado_en) : "—"}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-texto-2">El token vence</dt><dd>{e.vence ? `${dia(e.vence)}${dias !== null ? ` (en ${Math.max(dias, 0)} días)` : ""}` : "—"}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-texto-2">Publicaciones copiadas</dt><dd>{e.publicaciones} ({e.visibles} visibles)</dd></div>
          </dl>
          <p className="text-xs text-texto-2">Se actualiza solo cada 3 horas. Si publicás algo y querés verlo ya, tocá «Actualizar ahora».</p>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="boton-sec" disabled={ocupado} onClick={() => hacer(async () => setAviso(await sincronizarInstagram()))}><RefreshCw size={15} strokeWidth={1.8} /> Actualizar ahora</button>
            <button type="button" className="inline-flex items-center gap-1.5 text-sm text-texto-2 hover:text-error" disabled={ocupado}
              onClick={() => { if (confirm("¿Desconectar Instagram? Se sacan las publicaciones de la tienda hasta que lo vuelvas a conectar.")) hacer(async () => setAviso(await desconectarInstagram())); }}><Unplug size={15} strokeWidth={1.8} /> Desconectar</button>
            <Mensaje e={aviso} />
          </div>
        </div>
      )}

      {e.conectado && (
        <div className="space-y-2 border-t border-borde pt-4">
          <p className="text-sm font-semibold">En la portada</p>
          <p className="text-sm text-texto-2">{seccion
            ? <>Ya hay una sección de Instagram en la portada. La ordenás y la editás en <Link href="/admin/tienda" className="font-semibold text-marca">Tienda online</Link>.</>
            : <>Todavía no hay una sección de Instagram en la portada: en <Link href="/admin/tienda" className="font-semibold text-marca">Tienda online</Link> tocá «Agregar sección» y elegí Instagram.</>}</p>
        </div>
      )}

      {publicaciones.length > 0 && (
        <div className="space-y-2 border-t border-borde pt-4">
          <p className="text-sm font-semibold">Publicaciones copiadas</p>
          <p className="text-xs text-texto-2">Con el ojo ocultás una de la tienda (sigue en tu Instagram).</p>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {publicaciones.map((p) => (
              <li key={p.id} className={`relative aspect-square overflow-hidden rounded-lg border border-borde bg-gray-50 ${p.visible ? "" : "opacity-45"}`}>
                <img src={p.imagen_url} alt={p.descripcion?.slice(0, 80) || "Publicación"} loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                {p.tipo === "VIDEO" && <span className="absolute left-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/55 text-white" aria-label="Video"><Play size={11} fill="currentColor" /></span>}
                {p.tipo === "CAROUSEL_ALBUM" && <span className="absolute left-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/55 text-white" aria-label="Varias fotos"><GalleryHorizontal size={12} /></span>}
                <button type="button" disabled={ocupado} aria-pressed={p.visible} aria-label={p.visible ? "Ocultar de la tienda" : "Mostrar en la tienda"} title={p.visible ? "Ocultar de la tienda" : "Mostrar en la tienda"}
                  onClick={() => hacer(async () => setAviso(await mostrarPublicacion(p.id, !p.visible)))}
                  className="absolute bottom-1.5 right-1.5 grid h-8 w-8 place-items-center rounded-full bg-white/90 text-gray-700 shadow hover:bg-white">
                  {p.visible ? <Eye size={15} /> : <EyeOff size={15} />}</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {e.conectado && publicaciones.length === 0 && !e.error && (
        <p className="flex items-center gap-2 text-sm text-texto-2"><IconoInstagram size={16} /> Todavía no hay publicaciones copiadas: tocá «Actualizar ahora».</p>
      )}
    </div>
  );
}
