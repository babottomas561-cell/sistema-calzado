// Datos de la tienda (una sola fila de configuracion_tienda): nombre, aviso, redes y datos del local.
// Se lee una vez por pedido (cache de React): la usan el layout de la tienda y la portada.
import { cache } from "react";
import { crearCliente } from "@/lib/supabase/server";

export const datosTienda = cache(async () => {
  const supabase = await crearCliente();
  const { data } = await supabase.from("configuracion_tienda")
    .select("nombre, aviso, aviso_enlace, instagram, whatsapp, direccion_retiro, horario").single();
  return data ?? { nombre: "Mi Tienda", aviso: null, aviso_enlace: null, instagram: null, whatsapp: null, direccion_retiro: null, horario: null };
});
