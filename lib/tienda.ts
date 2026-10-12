// Datos de la tienda (una sola fila de configuracion_tienda): nombre, portada, WhatsApp. Se lee una vez por pedido.
import { cache } from "react";
import { crearCliente } from "@/lib/supabase/server";

export const datosTienda = cache(async () => {
  const supabase = await crearCliente();
  const { data } = await supabase.from("configuracion_tienda").select("nombre, titulo_inicio, bajada_inicio").single();
  return data ?? { nombre: "Mi Tienda", titulo_inicio: "Elegí lo que más te gusta", bajada_inicio: "Elegí tu modelo y tu talle. Retirás en el local o te lo enviamos." };
});
