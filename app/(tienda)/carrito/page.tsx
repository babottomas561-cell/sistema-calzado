// Carrito: los medios de pago habilitados para la tienda vienen de la base (con su descuento o recargo).
import { crearCliente } from "@/lib/supabase/server";
import Carrito from "./Carrito";

export default async function PaginaCarrito() {
  const supabase = await crearCliente();
  const { data: medios } = await supabase.from("medios_pago").select("id, nombre, ajuste_pct, cuotas")
    .eq("activo", true).eq("en_tienda", true).order("orden");
  return <Carrito medios={medios ?? []} />;
}
