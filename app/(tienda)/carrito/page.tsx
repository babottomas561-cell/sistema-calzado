// Carrito: los medios de pago habilitados para la tienda vienen de la base (con su descuento o recargo).
// Si la tienda cobra con Mercado Pago (Integraciones), elegirlo lleva a pagar; con «solo online» es el único medio.
import { crearCliente } from "@/lib/supabase/server";
import Carrito from "./Carrito";

export default async function PaginaCarrito() {
  const supabase = await crearCliente();
  const [{ data: medios }, { data: tienda }, { data: pagos }] = await Promise.all([
    supabase.from("medios_pago").select("id, codigo, nombre, ajuste_pct, cuotas").eq("activo", true).eq("en_tienda", true).order("orden"),
    supabase.from("configuracion_tienda").select("whatsapp").single(),
    supabase.rpc("tienda_pagos"),
  ]);
  const modo = (pagos as { mp_modo?: string } | null)?.mp_modo ?? "no";
  const mp = (medios ?? []).find((m) => m.codigo === "MP");
  const lista = modo === "obligatorio" && mp ? [mp] : (medios ?? []);
  return <Carrito medios={lista} conWhatsApp={!!tienda?.whatsapp} mpId={modo !== "no" && mp ? mp.id : null} />;
}
