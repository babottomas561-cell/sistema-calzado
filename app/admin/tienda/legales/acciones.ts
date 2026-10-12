"use server";
// Legales: datos del comercio y publicación de términos / privacidad. Lo valida la base (permiso, datos completos, versión inmutable).
import { revalidatePath } from "next/cache";
import { crearCliente } from "@/lib/supabase/server";

export type Estado = { error?: string; ok?: string };
const texto = (f: FormData, campo: string, max = 300) => String(f.get(campo) ?? "").trim().slice(0, max);

export async function guardarDatosLegales(_: Estado, f: FormData): Promise<Estado> {
  const supabase = await crearCliente();
  const iva = texto(f, "condicion_iva", 40);
  const { error } = await supabase.from("datos_legales").update({
    razon_social: texto(f, "razon_social", 150) || null, cuit: texto(f, "cuit", 20) || null,
    condicion_iva: iva || null, domicilio_legal: texto(f, "domicilio_legal", 250) || null,
    email_contacto: texto(f, "email_contacto", 150) || null, telefono_contacto: texto(f, "telefono_contacto", 40) || null,
    jurisdiccion: texto(f, "jurisdiccion", 100) || "San Miguel de Tucumán",
    defensa_consumidor_url: texto(f, "defensa_consumidor_url", 300) || "https://www.argentina.gob.ar/produccion/defensadelconsumidor",
  }).eq("unica", true);
  if (error) return { error: error.message.includes("check") ? "Revisá los datos: algún campo no tiene el formato correcto (CUIT, email o dirección https)" : error.message };
  revalidatePath("/admin/tienda/legales"); revalidatePath("/", "layout");
  return { ok: "Datos guardados" };
}

export async function publicarDocumento(tipo: "terminos" | "privacidad", contenido: string): Promise<Estado> {
  const supabase = await crearCliente();
  const { data, error } = await supabase.rpc("publicar_documento", { p_tipo: tipo, p_contenido: contenido });
  if (error) return { error: error.message };
  revalidatePath("/admin/tienda/legales"); revalidatePath("/", "layout");
  return { ok: `Publicada la versión ${data}. Ya está en la tienda y los clientes la aceptan al comprar.` };
}
