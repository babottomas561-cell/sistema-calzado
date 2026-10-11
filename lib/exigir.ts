// Solo para el servidor (páginas del panel): corta el paso a una pantalla sin el permiso.
import { redirect } from "next/navigation";
import { usuarioActual } from "@/lib/supabase/server";
import { puede, type Permiso } from "@/lib/permisos";

// Para el principio de una página del panel: sin ninguno de esos permisos, vuelve al inicio
export async function exigir(...algunos: Permiso[]) {
  const u = await usuarioActual();
  if (!puede(u.permisos, ...algunos)) redirect("/admin?sin_permiso=1");
  return u;
}
