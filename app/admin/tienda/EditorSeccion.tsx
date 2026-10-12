"use client";
// Ventana para editar una sección de la portada. Los campos comunes (título, bajada, botón, foto) van
// como inputs del formulario; lo propio de cada tipo (tarjetas, pasos, frases, productos) se arma en
// estado y viaja como JSON en un campo oculto. El servidor lo vuelve a validar (lib/inicio.ts).
import { useActionState, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, ImagePlus, LoaderCircle, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { crearClienteNavegador } from "@/lib/supabase/navegador";
import { achicarFoto } from "@/lib/fotos";
import { CRITERIOS, ESTILOS_PORTADA, FONDOS, INFO_TIPO, esVideo, type Contenido, type Filtro, type Seccion, type Tarjeta, type Tipo } from "@/lib/inicio";
import { guardarSeccion, type Estado } from "./acciones";

export type Opciones = { generos: string[]; lineas: string[]; rubros: string[]; productos: { id: number; nombre: string; marca: string | null; imagen: string | null }[] };

// "A dónde lleva" una tarjeta, como un solo desplegable: "genero:Mujer", "linea:Calzado", "categoria:Remera"
const aValor = (f: Filtro) => Object.entries(f).map(([k, v]) => `${k}:${v}`)[0] ?? "";
const aFiltro = (v: string): Filtro => { const [k, ...r] = v.split(":"); return k && r.length ? { [k]: r.join(":") } : {}; };

// Sube una foto (achicada) o un video (tal cual, hasta 50 MB) al bucket "tienda" y devuelve su url y su ruta
const MAX_VIDEO = 50 * 1024 * 1024;
async function subirFoto(archivo: File, lado: number) {
  const supabase = crearClienteNavegador();
  const video = archivo.type === "video/mp4" || archivo.type === "video/webm";
  if (archivo.type.startsWith("video/") && !video) throw new Error("el video tiene que ser MP4 o WebM (en el iPhone: Ajustes → Cámara → Formatos → Más compatible)");
  if (video && archivo.size > MAX_VIDEO) throw new Error(`el video pesa ${Math.round(archivo.size / 1048576)} MB y el tope es 50 MB. Recortalo o bajale la calidad`);
  const ruta = `${new Date().getFullYear()}/${crypto.randomUUID()}.${video ? archivo.type.split("/")[1] : "jpg"}`;
  const { error } = await supabase.storage.from("tienda").upload(ruta, video ? archivo : await achicarFoto(archivo, lado), { contentType: video ? archivo.type : "image/jpeg" });
  if (error) throw error;
  return { ruta, url: supabase.storage.from("tienda").getPublicUrl(ruta).data.publicUrl };
}

function CampoFoto({ url, onCambio, lado = 2400, alto = "aspect-[16/9]", ayuda, conVideo = false }: { url: string | null; onCambio: (f: { url: string; ruta: string } | null) => void; lado?: number; alto?: string; ayuda?: string; conVideo?: boolean }) {
  const entrada = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function elegir(archivos: FileList | null) {
    if (!archivos?.[0]) return;
    setSubiendo(true); setError(null);
    try { onCambio(await subirFoto(archivos[0], lado)); } catch (e) { setError(`No se pudo subir: ${(e as Error).message}`); }
    setSubiendo(false);
    if (entrada.current) entrada.current.value = "";
  }
  return (
    <div className="space-y-1.5">
      <button type="button" onClick={() => entrada.current?.click()} disabled={subiendo}
        className={`group relative grid w-full place-items-center overflow-hidden rounded-xl border-2 border-dashed border-borde bg-gray-50 text-sm text-texto-2 hover:border-marca ${alto}`}>
        {url && (esVideo(url)
          ? <video src={url} muted loop autoPlay playsInline className="absolute inset-0 h-full w-full object-cover" />
          : <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" />)}
        <span className={`relative flex items-center gap-2 rounded-lg px-3 py-2 font-semibold ${url ? "bg-white/90 text-gray-800 opacity-0 shadow group-hover:opacity-100 group-focus-visible:opacity-100" : ""}`}>
          {subiendo ? <LoaderCircle size={17} className="animate-spin" /> : <ImagePlus size={17} />}{subiendo ? "Subiendo…" : url ? (conVideo ? "Cambiar foto o video" : "Cambiar foto") : conVideo ? "Elegir una foto o un video" : "Elegir o sacar una foto"}</span>
      </button>
      <input ref={entrada} type="file" accept={conVideo ? "image/*,video/mp4,video/webm" : "image/*"} hidden onChange={(e) => elegir(e.target.files)} />
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-texto-2">{ayuda}</p>
        {url && <button type="button" onClick={() => onCambio(null)} className="shrink-0 text-xs font-semibold text-error hover:underline">Quitar</button>}
      </div>
      {error && <p className="text-sm text-error">{error}</p>}
    </div>
  );
}

// Lista editable genérica (tarjetas, pasos, frases): subir, bajar, quitar y agregar
function Lista<T>({ items, setItems, nuevo, max, render, agregar }: { items: T[]; setItems: (x: T[]) => void; nuevo: () => T; max: number; agregar: string; render: (x: T, cambiar: (y: T) => void) => React.ReactNode }) {
  const mover = (i: number, d: number) => { const c = [...items]; [c[i], c[i + d]] = [c[i + d], c[i]]; setItems(c); };
  return (
    <div className="space-y-2">
      {items.map((x, i) => (
        <div key={i} className="flex gap-2 rounded-xl border border-borde bg-gray-50/60 p-2.5">
          <div className="min-w-0 flex-1 space-y-2">{render(x, (y) => setItems(items.map((z, k) => (k === i ? y : z))))}</div>
          <div className="flex flex-col gap-0.5 text-gray-500">
            <button type="button" aria-label="Subir" disabled={i === 0} onClick={() => mover(i, -1)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white disabled:opacity-25"><ArrowUp size={15} /></button>
            <button type="button" aria-label="Bajar" disabled={i === items.length - 1} onClick={() => mover(i, 1)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white disabled:opacity-25"><ArrowDown size={15} /></button>
            <button type="button" aria-label="Quitar" onClick={() => setItems(items.filter((_, k) => k !== i))} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white hover:text-error"><Trash2 size={15} /></button>
          </div>
        </div>
      ))}
      {items.length < max && <button type="button" onClick={() => setItems([...items, nuevo()])} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-marca hover:bg-marca-suave"><Plus size={15} /> {agregar}</button>}
    </div>
  );
}

export default function EditorSeccion({ s, opciones }: { s: Seccion; opciones: Opciones }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [c, setC] = useState<Contenido[Tipo]>(s.contenido);
  const [foto, setFoto] = useState<{ url: string; ruta: string | null } | null>(s.imagen_url ? { url: s.imagen_url, ruta: s.imagen_ruta } : null);
  const [buscar, setBuscar] = useState("");
  const [estado, accion, guardando] = useActionState(async (prev: Estado, f: FormData) => {
    const r = await guardarSeccion(prev, f);
    if (r.ok) dialogo.current?.close();
    return r;
  }, {});
  const abrir = () => { setC(s.contenido); setFoto(s.imagen_url ? { url: s.imagen_url, ruta: s.imagen_ruta } : null); dialogo.current?.showModal(); };
  const info = INFO_TIPO[s.tipo];
  // Qué campos comunes usa cada tipo
  const usa = {
    titulo: s.tipo !== "cinta", bajada: ["portada", "banner", "editorial", "local", "accesos", "productos"].includes(s.tipo),
    boton: !["cinta", "pasos"].includes(s.tipo), foto: s.tipo === "banner" || s.tipo === "editorial" || (s.tipo === "portada" && (c as Contenido["portada"]).estilo === "foto"),
  };

  const destinos = (
    <>
      <option value="">Toda la tienda</option>
      {opciones.generos.length > 0 && <optgroup label="Para">{opciones.generos.map((g) => <option key={g} value={`genero:${g}`}>{g}</option>)}</optgroup>}
      {opciones.lineas.length > 0 && <optgroup label="Línea">{opciones.lineas.map((g) => <option key={g} value={`linea:${g}`}>{g}</option>)}</optgroup>}
      {opciones.rubros.length > 0 && <optgroup label="Rubro">{opciones.rubros.map((g) => <option key={g} value={`categoria:${g}`}>{g}</option>)}</optgroup>}
    </>
  );

  function propio() {
    switch (s.tipo) {
      case "portada": { const p = c as Contenido["portada"]; return <>
        <div><label className="etiqueta">Cómo se ve</label>
          <div className="grid gap-2 sm:grid-cols-2">{(Object.entries(ESTILOS_PORTADA) as [keyof typeof ESTILOS_PORTADA, string][]).map(([k, t]) => (
            <label key={k} className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm ${p.estilo === k ? "border-marca bg-marca-suave font-semibold text-marca" : "border-borde"}`}>
              <input type="radio" className="sr-only" checked={p.estilo === k} onChange={() => setC({ ...p, estilo: k })} />{p.estilo === k && <Check size={15} />}{t}</label>
          ))}</div>
          {p.estilo === "columnas" && <p className="mt-1 text-[11px] text-texto-2">Usa las fotos de los productos publicados con stock: cambian solas con el catálogo.</p>}
          {p.estilo === "foto" && <p className="mt-1 text-[11px] text-texto-2">Sin foto o video subido, se ve la de columnas. La cabecera queda transparente encima.</p>}</div>
        {p.estilo === "foto" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={p.marca_gigante} onChange={(e) => setC({ ...p, marca_gigante: e.target.checked })} /> Nombre de la tienda gigante arriba de la foto</label>}
        <div><label className="etiqueta">Texto chico arriba del título (opcional)</label>
          <input value={p.antetitulo ?? ""} onChange={(e) => setC({ ...p, antetitulo: e.target.value })} maxLength={60} placeholder="Nueva temporada · Primavera 2026" className="campo" /></div>
      </>; }
      case "cinta": { const p = c as Contenido["cinta"]; return <>
        <div><label className="etiqueta">Frases</label>
          <Lista items={p.frases} setItems={(frases) => setC({ ...p, frases })} nuevo={() => ""} max={8} agregar="Agregar frase"
            render={(x, cambiar) => <input value={x} onChange={(e) => cambiar(e.target.value)} maxLength={60} placeholder="Envío gratis en Tucumán" className="campo" />} /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={p.marcas} onChange={(e) => setC({ ...p, marcas: e.target.checked })} /> Sumar las marcas que hay en la tienda</label>
      </>; }
      case "accesos": { const p = c as Contenido["accesos"]; return (
        <div><label className="etiqueta">Tarjetas</label>
          <Lista items={p.tarjetas} setItems={(tarjetas) => setC({ ...p, tarjetas })} nuevo={(): Tarjeta => ({ titulo: "", filtro: {} })} max={6} agregar="Agregar tarjeta"
            render={(t, cambiar) => <>
              <div className="grid grid-cols-2 gap-2">
                <input value={t.titulo} onChange={(e) => cambiar({ ...t, titulo: e.target.value })} maxLength={40} placeholder="Título (Mujer)" className="campo" aria-label="Título" />
                <select value={aValor(t.filtro)} onChange={(e) => cambiar({ ...t, filtro: aFiltro(e.target.value) })} className="campo" aria-label="A dónde lleva">{destinos}</select>
              </div>
              <input value={t.bajada ?? ""} onChange={(e) => cambiar({ ...t, bajada: e.target.value })} maxLength={80} placeholder="Bajada (opcional)" className="campo" aria-label="Bajada" />
              <CampoFoto url={t.imagen_url ?? null} lado={1600} alto="h-28" ayuda="Sin foto propia, usa la de un producto de esa parte de la tienda."
                onCambio={(f) => cambiar({ ...t, imagen_url: f?.url ?? null })} />
            </>} /></div>
      ); }
      case "productos": { const p = c as Contenido["productos"];
        const filtrados = opciones.productos.filter((x) => `${x.nombre} ${x.marca ?? ""}`.toLowerCase().includes(buscar.toLowerCase())).slice(0, 60);
        const tocar = (id: number) => setC({ ...p, productos: p.productos.includes(id) ? p.productos.filter((x) => x !== id) : [...p.productos, id].slice(0, 16) });
        return <>
          <div className="grid grid-cols-[1fr_7rem] gap-3">
            <div><label className="etiqueta">Qué muestra</label>
              <select value={p.criterio} onChange={(e) => setC({ ...p, criterio: e.target.value as keyof typeof CRITERIOS })} className="campo">
                {Object.entries(CRITERIOS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
            <div><label className="etiqueta">Cuántos</label>
              <input type="number" min={2} max={16} value={p.cantidad} onChange={(e) => setC({ ...p, cantidad: Number(e.target.value) })} className="campo" /></div>
          </div>
          {p.criterio === "mas_vendidos" && <p className="text-[11px] text-texto-2">Según las ventas de los últimos 90 días. Solo aparecen los que tienen foto y stock.</p>}
          {p.criterio === "elegidos" && <div className="space-y-2">
            <label className="etiqueta">Elegí los productos <span className="normal-case tracking-normal">({p.productos.length} elegidos, en el orden en que los tocás)</span></label>
            <div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar por nombre o marca" className="campo pl-9" /></div>
            <ul className="max-h-64 divide-y divide-gray-100 overflow-y-auto rounded-xl border border-borde">
              {filtrados.map((x) => { const n = p.productos.indexOf(x.id) + 1; return (
                <li key={x.id}><button type="button" onClick={() => tocar(x.id)} className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm ${n ? "bg-marca-suave" : "hover:bg-gray-50"}`}>
                  {x.imagen ? <img src={x.imagen} alt="" className="h-10 w-8 shrink-0 rounded object-cover" /> : <span className="h-10 w-8 shrink-0 rounded bg-gray-100" />}
                  <span className="min-w-0 flex-1"><span className="block truncate font-medium">{x.nombre}</span><span className="text-xs text-texto-2">{x.marca}</span></span>
                  {n > 0 && <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-marca text-xs font-bold text-white">{n}</span>}
                </button></li>
              ); })}
            </ul>
          </div>}
        </>; }
      case "banner": { const p = c as Contenido["banner"]; return (
        <div><label className="etiqueta">Texto</label>
          <select value={p.alineacion} onChange={(e) => setC({ ...p, alineacion: e.target.value as "izquierda" | "centro" })} className="campo">
            <option value="izquierda">Abajo a la izquierda</option><option value="centro">Centrado</option></select></div>
      ); }
      case "editorial": { const p = c as Contenido["editorial"]; return <>
        <div><label className="etiqueta">Texto chico arriba del título (opcional)</label>
          <input value={p.antetitulo ?? ""} onChange={(e) => setC({ ...p, antetitulo: e.target.value })} maxLength={60} placeholder="La edición de la semana" className="campo" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="etiqueta">Foto</label>
            <select value={p.lado} onChange={(e) => setC({ ...p, lado: e.target.value as "izquierda" | "derecha" })} className="campo">
              <option value="izquierda">A la izquierda</option><option value="derecha">A la derecha</option></select></div>
          <div><label className="etiqueta">Fondo del texto</label>
            <select value={p.fondo} onChange={(e) => setC({ ...p, fondo: e.target.value as keyof typeof FONDOS })} className="campo">
              {Object.entries(FONDOS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
        </div>
      </>; }
      case "pasos": { const p = c as Contenido["pasos"]; return (
        <div><label className="etiqueta">Pasos</label>
          <Lista items={p.pasos} setItems={(pasos) => setC({ ...p, pasos })} nuevo={() => ({ titulo: "", texto: "" })} max={6} agregar="Agregar paso"
            render={(x, cambiar) => <>
              <input value={x.titulo} onChange={(e) => cambiar({ ...x, titulo: e.target.value })} maxLength={40} placeholder="Título del paso" className="campo" aria-label="Título del paso" />
              <textarea value={x.texto} onChange={(e) => cambiar({ ...x, texto: e.target.value })} maxLength={200} rows={2} placeholder="Qué hace el cliente" className="campo" aria-label="Texto del paso" />
            </>} /></div>
      ); }
      case "local": return <p className="rounded-xl bg-gray-50 px-3 py-2.5 text-sm text-texto-2">La dirección, el horario y el WhatsApp salen de <b>Datos de la tienda</b>, más abajo en esta misma pantalla.</p>;
      default: return null;
    }
  }

  return (
    <>
      <button type="button" onClick={abrir} className="boton-sec px-3 py-2"><Pencil size={15} /> Editar</button>
      <dialog ref={dialogo} className="m-auto max-h-[92dvh] w-[calc(100%-1.5rem)] max-w-lg rounded-2xl border border-borde p-0 shadow-xl backdrop:bg-gray-900/40 backdrop:backdrop-blur-[2px]">
        <form action={accion} className="flex max-h-[92dvh] flex-col">
          <div className="flex items-center gap-3 border-b border-borde px-5 py-4">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-marca-suave text-marca"><info.icono size={18} /></span>
            <div className="min-w-0 flex-1"><h3 className="font-semibold">{info.nombre}</h3><p className="truncate text-xs text-texto-2">{info.ayuda}</p></div>
            <button type="button" onClick={() => dialogo.current?.close()} className="grid h-8 w-8 place-items-center rounded-lg text-gray-400 hover:bg-gray-100" aria-label="Cerrar"><X size={17} /></button>
          </div>
          <input type="hidden" name="id" value={s.id} />
          <input type="hidden" name="contenido" value={JSON.stringify(c)} />
          <input type="hidden" name="imagen_url" value={usa.foto ? foto?.url ?? "" : ""} />
          <input type="hidden" name="imagen_ruta" value={usa.foto ? foto?.ruta ?? "" : ""} />
          <div className="space-y-4 overflow-y-auto px-5 py-4">
            {usa.foto && <CampoFoto url={foto?.url ?? null} onCambio={setFoto} conVideo={s.tipo !== "editorial"}
              alto={s.tipo === "editorial" ? "aspect-[4/5] max-h-72" : s.tipo === "portada" ? "aspect-[4/3]" : "aspect-[16/9]"}
              ayuda={s.tipo === "editorial" ? "Mejor vertical: ocupa media pantalla en la compu." : "Foto horizontal o video corto (MP4, hasta 50 MB). El texto va abajo a la izquierda."} />}
            {usa.titulo && <div><label className="etiqueta">{s.tipo === "portada" ? "Título grande" : "Título"}</label>
              <input name="titulo" defaultValue={s.titulo ?? ""} maxLength={120} className="campo" placeholder={s.tipo === "portada" ? "Elegí lo que más te gusta" : ""} /></div>}
            {usa.bajada && <div><label className="etiqueta">Bajada (opcional)</label>
              <textarea name="bajada" defaultValue={s.bajada ?? ""} maxLength={300} rows={2} className="campo" /></div>}
            {usa.boton && <div className="grid grid-cols-2 gap-3">
              <div><label className="etiqueta">Texto del botón</label><input name="boton_texto" defaultValue={s.boton_texto ?? ""} maxLength={40} placeholder="Ver todo" className="campo" /></div>
              <div><label className="etiqueta">Lleva a</label><input name="boton_enlace" defaultValue={s.boton_enlace ?? ""} placeholder="/tienda" className="campo" /></div>
            </div>}
            {propio()}
            {estado.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-error">{estado.error}</p>}
          </div>
          <div className="flex justify-end gap-2 border-t border-borde bg-gray-50/70 px-5 py-3">
            <button type="button" onClick={() => dialogo.current?.close()} className="boton-sec py-2">Cancelar</button>
            <button className="boton py-2" disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
