// Datos de la tienda (una sola fila de configuracion_tienda): nombre, avisos, redes y datos del local.
// Se lee una vez por pedido (cache de React): la usan el layout de la tienda y la portada.
import { cache } from "react";
import { crearCliente } from "@/lib/supabase/server";

export const datosTienda = cache(async () => {
  const supabase = await crearCliente();
  const { data } = await supabase.from("configuracion_tienda")
    .select("nombre, avisos, aviso_enlace, instagram, whatsapp, direccion_retiro, horario, icono_url").single();
  return data ?? { nombre: "Mi Tienda", avisos: [] as string[], aviso_enlace: null, instagram: null, whatsapp: null, direccion_retiro: null, horario: null, icono_url: null as string | null };
});

// Lo legal que se muestra en el pie: datos del comercio y qué documentos están publicados
export const datosLegales = cache(async () => {
  const supabase = await crearCliente();
  const [{ data: d }, { data: docs }] = await Promise.all([
    supabase.from("datos_legales").select("razon_social, cuit, condicion_iva, domicilio_legal, email_contacto, telefono_contacto, defensa_consumidor_url").single(),
    supabase.from("v_documentos_vigentes").select("tipo"),
  ]);
  return { datos: d, terminos: !!docs?.some((x) => x.tipo === "terminos"), privacidad: !!docs?.some((x) => x.tipo === "privacidad") };
});
