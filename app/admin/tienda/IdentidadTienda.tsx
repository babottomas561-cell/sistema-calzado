"use client";
// Identidad: el logo (y su versión para fondo oscuro) y el color de la marca. Los logos se achican en el navegador a PNG
// con fondo transparente y se suben al bucket «tienda»; el color se valida para que el texto blanco se lea sobre él.
import { useRef, useState } from "react";
import { crearClienteNavegador } from "@/lib/supabase/navegador";
import { contrasteConBlanco, esHex, sirveParaBotones } from "@/lib/color";
import { guardarColor, guardarLogo } from "./acciones";

type Aviso = { error?: string; ok?: string };

async function aPngAcotado(archivo: File, ancho = 720, alto = 220): Promise<Blob> {
  const img = await createImageBitmap(archivo);
  const escala = Math.min(1, ancho / img.width, alto / img.height);
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(img.width * escala)); c.height = Math.max(1, Math.round(img.height * escala));
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return await new Promise((ok, mal) => c.toBlob((b) => (b ? ok(b) : mal(new Error("no se pudo procesar la imagen"))), "image/png"));
}

function Logo({ cual, titulo, ayuda, url, fondo }: { cual: "claro" | "oscuro"; titulo: string; ayuda: string; url: string | null; fondo: string }) {
  const entrada = useRef<HTMLInputElement>(null);
  const [actual, setActual] = useState(url);
  const [aviso, setAviso] = useState<Aviso>({});
  const [subiendo, setSubiendo] = useState(false);
  async function elegir(archivos: FileList | null) {
    const a = archivos?.[0];
    if (!a) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(a.type)) { setAviso({ error: "Usá una imagen PNG, JPG o WebP (PNG con fondo transparente queda mejor)" }); return; }
    setSubiendo(true); setAviso({});
    try {
      const supabase = crearClienteNavegador();
      const ruta = `logo/${crypto.randomUUID()}.png`;
      const { error } = await supabase.storage.from("tienda").upload(ruta, await aPngAcotado(a), { contentType: "image/png" });
      if (error) throw error;
      const nueva = supabase.storage.from("tienda").getPublicUrl(ruta).data.publicUrl;
      const r = await guardarLogo(cual, nueva, ruta);
      setAviso(r);
      if (r.ok) setActual(nueva);
    } catch (e) { setAviso({ error: `No se pudo subir: ${(e as Error).message}` }); }
    setSubiendo(false);
    if (entrada.current) entrada.current.value = "";
  }
  return (
    <div className="space-y-2">
      <p className="etiqueta">{titulo}</p>
      <div className={`grid h-20 place-items-center rounded-lg border border-borde px-4 ${fondo}`}>
        {actual ? <img src={actual} alt={titulo} className="max-h-14 max-w-full object-contain" /> : <span className="text-xs text-texto-2">Sin logo: se muestra el nombre en letras</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="boton-sec py-1.5" onClick={() => entrada.current?.click()} disabled={subiendo}>{subiendo ? "Subiendo…" : actual ? "Cambiar" : "Subir logo"}</button>
        {actual && <button type="button" className="text-sm text-texto-2 hover:text-error" disabled={subiendo}
          onClick={async () => { const r = await guardarLogo(cual, null, null); setAviso(r); if (r.ok) setActual(null); }}>Quitar</button>}
      </div>
      <p className="text-[11px] text-texto-2">{ayuda}</p>
      {aviso.error && <p className="text-xs text-error" role="alert">{aviso.error}</p>}
      {aviso.ok && <p className="text-xs text-ok">{aviso.ok}</p>}
      <input ref={entrada} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => elegir(e.target.files)} />
    </div>
  );
}

const SUGERIDOS = ["#1d4ed8", "#0f766e", "#7c2d12", "#9f1239", "#4338ca", "#18181b"];

function Color({ color }: { color: string | null }) {
  const [hex, setHex] = useState(color ?? "#1d4ed8");
  const [guardado, setGuardado] = useState(color);
  const [aviso, setAviso] = useState<Aviso>({});
  const valido = esHex(hex);
  const contraste = valido ? contrasteConBlanco(hex) : 0;
  const sirve = valido && sirveParaBotones(hex);
  return (
    <div className="space-y-2">
      <p className="etiqueta">Color de la marca</p>
      <div className="flex flex-wrap items-center gap-3">
        <input type="color" value={valido ? hex : "#1d4ed8"} onChange={(e) => setHex(e.target.value.toLowerCase())} aria-label="Elegir color" className="h-11 w-14 cursor-pointer rounded-lg border border-borde bg-white p-1" />
        <input value={hex} onChange={(e) => setHex(e.target.value.toLowerCase())} maxLength={7} aria-label="Color en formato #rrggbb" className="campo !w-28 font-mono" />
        <span className="inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold text-white" style={{ background: valido ? hex : "#999" }}>Botón de ejemplo</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {SUGERIDOS.map((c) => <button key={c} type="button" onClick={() => setHex(c)} aria-label={`Usar ${c}`} className="h-7 w-7 rounded-full border border-borde" style={{ background: c }} />)}
      </div>
      {valido && <p className={`text-xs ${sirve ? "text-ok" : "text-error"}`}>{sirve ? `Se lee bien (contraste ${contraste.toFixed(1)}:1).` : `Muy claro para botones con texto blanco (contraste ${contraste.toFixed(1)}:1, hace falta 4.5:1 o más).`}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="boton py-1.5" disabled={!sirve || hex === guardado} onClick={async () => { const r = await guardarColor(hex); setAviso(r); if (r.ok) setGuardado(hex); }}>Guardar color</button>
        {guardado && <button type="button" className="text-sm text-texto-2 hover:text-error" onClick={async () => { const r = await guardarColor(null); setAviso(r); if (r.ok) { setGuardado(null); setHex("#1d4ed8"); } }}>Volver al de siempre</button>}
      </div>
      <p className="text-[11px] text-texto-2">Pinta los botones y detalles de la tienda, el panel y los mails. Para que los mails ya enviados por Supabase lo tomen, guardá de nuevo en Integraciones → Correo.</p>
      {aviso.error && <p className="text-xs text-error" role="alert">{aviso.error}</p>}
      {aviso.ok && <p className="text-xs text-ok">{aviso.ok}</p>}
    </div>
  );
}

export default function IdentidadTienda({ logo, logoOscuro, color }: { logo: string | null; logoOscuro: string | null; color: string | null }) {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      <Logo cual="claro" titulo="Logo" ayuda="Para fondo claro. Se achica solo; PNG con fondo transparente queda mejor." url={logo} fondo="bg-white" />
      <Logo cual="oscuro" titulo="Logo para fondo oscuro (opcional)" ayuda="Versión clara o blanca. Se usa en la cabecera cuando flota sobre la foto de la portada." url={logoOscuro} fondo="bg-neutral-800" />
      <Color color={color} />
    </div>
  );
}
