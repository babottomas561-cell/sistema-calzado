"use client";
// Galería del producto: subir fotos (cámara o galería del celular), elegir la principal,
// ordenarlas y borrarlas. La principal es la que se ve en el catálogo y en las vistas previas.
import { useRef, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, ImagePlus, LoaderCircle, Star, Trash2 } from "lucide-react";
import { crearClienteNavegador } from "@/lib/supabase/navegador";
import { achicarFoto } from "@/lib/fotos";
import { borrarImagen, marcarPrincipal, moverImagen, registrarImagenes, type Estado } from "../acciones";

export type Imagen = { id: number; url: string; principal: boolean };

export default function Fotos({ productoId, imagenes }: { productoId: number; imagenes: Imagen[] }) {
  const entrada = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [estado, setEstado] = useState<Estado>({});
  const [ocupado, empezar] = useTransition();

  async function subir(archivos: FileList | null) {
    if (!archivos?.length) return;
    const supabase = crearClienteNavegador();
    const fotos: { url: string; ruta: string }[] = [];
    setEstado({});
    try {
      for (const [i, archivo] of [...archivos].entries()) {
        setSubiendo(`Subiendo ${i + 1} de ${archivos.length}…`);
        const ruta = `${productoId}/${crypto.randomUUID()}.jpg`;
        const { error } = await supabase.storage.from("productos").upload(ruta, await achicarFoto(archivo), { contentType: "image/jpeg" });
        if (error) throw error;
        fotos.push({ ruta, url: supabase.storage.from("productos").getPublicUrl(ruta).data.publicUrl });
      }
    } catch (e) {
      setEstado({ error: `No se pudo subir: ${(e as Error).message}` });
    }
    // Se registran las que llegaron a subirse, aunque alguna haya fallado
    if (fotos.length) setEstado(await registrarImagenes(productoId, fotos));
    setSubiendo(null);
    if (entrada.current) entrada.current.value = "";
  }

  const accion = (fn: () => Promise<Estado>) => empezar(async () => setEstado(await fn()));

  return (
    <section className="tarjeta space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Fotos <span className="text-sm font-normal text-texto-2">({imagenes.length})</span></h2>
        <button type="button" className="boton-sec py-2" disabled={!!subiendo} onClick={() => entrada.current?.click()}>
          {subiendo ? <LoaderCircle size={16} className="animate-spin" /> : <ImagePlus size={16} />} {subiendo ?? "Agregar fotos"}
        </button>
        {/* accept="image/*": en el celular ofrece sacar una foto o elegir de la galería */}
        <input ref={entrada} type="file" accept="image/*" multiple hidden onChange={(e) => subir(e.target.files)} />
      </div>

      {imagenes.length === 0 ? (
        <button type="button" onClick={() => entrada.current?.click()}
          className="grid w-full place-items-center gap-1 rounded-xl border-2 border-dashed border-borde py-8 text-sm text-texto-2 hover:border-marca">
          <ImagePlus size={28} className="text-gray-300" />Sin fotos todavía. Tocá para sacar o elegir.
        </button>
      ) : (
        <div className={`grid grid-cols-3 gap-2 sm:grid-cols-4 ${ocupado ? "pointer-events-none opacity-60" : ""}`}>
          {imagenes.map((img, i) => (
            <div key={img.id} className={`overflow-hidden rounded-xl border-2 ${img.principal ? "border-marca" : "border-transparent"}`}>
              <div className="relative aspect-square bg-gray-100">
                <img src={img.url} alt="" className="h-full w-full object-cover" />
                {img.principal && <span className="chip absolute left-1 top-1 bg-marca text-[10px] text-white">Principal</span>}
              </div>
              <div className="flex items-center justify-between bg-white px-0.5 py-0.5 text-gray-500">
                <button type="button" title="Mover a la izquierda" aria-label="Mover a la izquierda" disabled={i === 0}
                  onClick={() => accion(() => moverImagen(productoId, img.id, -1))} className="grid h-8 w-7 place-items-center rounded disabled:opacity-25"><ArrowLeft size={15} /></button>
                <button type="button" title={img.principal ? "Es la principal" : "Usar como principal"} aria-label="Usar como principal" disabled={img.principal}
                  onClick={() => accion(() => marcarPrincipal(productoId, img.id))} className={`grid h-8 w-7 place-items-center rounded ${img.principal ? "text-marca" : "hover:text-marca"}`}>
                  <Star size={15} strokeWidth={img.principal ? 2.2 : 1.8} fill={img.principal ? "currentColor" : "none"} /></button>
                <button type="button" title="Borrar" aria-label="Borrar"
                  onClick={() => confirm("¿Borrar esta foto?") && accion(() => borrarImagen(productoId, img.id))} className="grid h-8 w-7 place-items-center rounded hover:text-error"><Trash2 size={15} /></button>
                <button type="button" title="Mover a la derecha" aria-label="Mover a la derecha" disabled={i === imagenes.length - 1}
                  onClick={() => accion(() => moverImagen(productoId, img.id, 1))} className="grid h-8 w-7 place-items-center rounded disabled:opacity-25"><ArrowRight size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      {estado.error && <p className="text-sm text-error">{estado.error}</p>}
      <p className="text-xs text-texto-2">La foto con la estrella es la <b>principal</b>: la que se ve en el catálogo, el carrito y las vistas previas. En la tienda se muestran todas, en este orden.</p>
    </section>
  );
}
