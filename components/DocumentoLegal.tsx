// Muestra la versión vigente de un documento legal (términos o privacidad) con su número y fecha.
import { crearCliente } from "@/lib/supabase/server";
import { Markdown } from "@/lib/markdown";
import { dia } from "@/lib/formato";
import { TITULO, type TipoDoc } from "@/lib/legales";

export default async function DocumentoLegal({ tipo }: { tipo: TipoDoc }) {
  const supabase = await crearCliente();
  const { data } = await supabase.from("v_documentos_vigentes").select("version, contenido, publicado_en").eq("tipo", tipo).maybeSingle();
  if (!data) return (
    <div className="tarjeta mx-auto max-w-2xl space-y-2 p-6 text-center">
      <h1 className="text-xl font-bold">{TITULO[tipo]}</h1>
      <p className="text-sm text-texto-2">Todavía no están publicados. Consultanos en el local.</p>
    </div>
  );
  return (
    <article className="mx-auto max-w-3xl space-y-4">
      <p className="text-sm text-texto-2">Versión {data.version} · vigente desde el {dia(data.publicado_en!)}</p>
      <div className="tarjeta p-6 sm:p-8"><Markdown texto={data.contenido!} /></div>
    </article>
  );
}
