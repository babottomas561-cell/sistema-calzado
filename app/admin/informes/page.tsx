import { redirect } from "next/navigation";
import { usuarioActual } from "@/lib/supabase/server";

// Abre el primer informe que la persona puede ver
export default async function Informes() {
  const { permisos } = await usuarioActual();
  redirect(permisos.includes("informes.ventas") ? "/admin/informes/ventas" : permisos.includes("informes.stock") ? "/admin/informes/stock" : "/admin/informes/resultado");
}
