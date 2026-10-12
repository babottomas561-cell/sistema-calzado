"use client";
// El ícono de la pestaña del navegador (y el del celular al guardar la tienda en la pantalla de inicio).
// Se achica a 256×256 en PNG (conserva el fondo transparente) y se sube al bucket «tienda».
import { useRef, useState } from "react";
import { crearClienteNavegador } from "@/lib/supabase/navegador";
import { guardarIcono } from "./acciones";

async function aPngCuadrado(archivo: File, lado = 256): Promise<Blob> {
  const img = await createImageBitmap(archivo);
  const c = document.createElement("canvas");
  c.width = c.height = lado;
  const ctx = c.getContext("2d")!;
  // Centrada y entera (si no es cuadrada, queda con margen transparente)
  const escala = Math.min(lado / img.width, lado / img.height);
  const [w, h] = [img.width * escala, img.height * escala];
  ctx.drawImage(img, (lado - w) / 2, (lado - h) / 2, w, h);
  return await new Promise((ok, mal) => c.toBlob((b) => (b ? ok(b) : mal(new Error("no se pudo procesar la imagen"))), "image/png"));
}

export default function IconoTienda({ url, nombre }: { url: string | null; nombre: string }) {
  const entrada = useRef<HTMLInputElement>(null);
  const [actual, setActual] = useState(url);
  const [estado, setEstado] = useState<{ error?: string; ok?: string }>({});
  const [subiendo, setSubiendo] = useState(false);

  async function elegir(archivos: FileList | null) {
    const a = archivos?.[0];
    if (!a) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(a.type)) { setEstado({ error: "Usá una imagen PNG, JPG o WebP (cuadrada queda mejor)" }); return; }
    setSubiendo(true); setEstado({});
    try {
      const supabase = crearClienteNavegador();
      const ruta = `icono/${crypto.randomUUID()}.png`;
      const { error } = await supabase.storage.from("tienda").upload(ruta, await aPngCuadrado(a), { contentType: "image/png" });
      if (error) throw error;
      const nueva = supabase.storage.from("tienda").getPublicUrl(ruta).data.publicUrl;
      const r = await guardarIcono(nueva, ruta);
      setEstado(r);
      if (r.ok) setActual(nueva);
    } catch (e) { setEstado({ error: `No se pudo subir: ${(e as Error).message}` }); }
    setSubiendo(false);
    if (entrada.current) entrada.current.value = "";
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {actual
        ? <img src={actual} alt="Ícono actual" className="h-12 w-12 rounded-lg border border-borde object-contain" />
        : <span className="grid h-12 w-12 place-items-center rounded-lg bg-marca text-xl font-extrabold text-white" aria-label="Ícono actual: la inicial">{nombre.trim().charAt(0).toUpperCase() || "M"}</span>}
      <div className="space-y-1">
        <div className="flex flex-wrap gap-2">
          <button type="button" className="boton-sec py-1.5" onClick={() => entrada.current?.click()} disabled={subiendo}>{subiendo ? "Subiendo…" : actual ? "Cambiar ícono" : "Subir ícono"}</button>
          {actual && <button type="button" className="text-sm text-texto-2 hover:text-error" disabled={subiendo}
            onClick={async () => { const r = await guardarIcono(null, null); setEstado(r); if (r.ok) setActual(null); }}>Usar la inicial</button>}
        </div>
        <p className="text-[11px] text-texto-2">El que aparece en la pestaña del navegador. Una imagen cuadrada (el logo) en PNG; se achica sola.</p>
        {estado.error && <p className="text-xs text-error">{estado.error}</p>}
        {estado.ok && <p className="text-xs text-ok">{estado.ok}</p>}
      </div>
      <input ref={entrada} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => elegir(e.target.files)} />
    </div>
  );
}
