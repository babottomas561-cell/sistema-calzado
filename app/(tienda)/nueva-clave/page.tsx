// Elegir la contraseña nueva: se llega desde el link del mail (que ya abrió la sesión). Sin sesión, hay que pedir otro link.
import Link from "next/link";
import { redirect } from "next/navigation";
import { usuarioActual } from "@/lib/supabase/server";
import { leerConfigCuentas, reglaClave } from "@/lib/cuentas";
import NuevaClave from "./NuevaClave";

export default async function Pagina() {
  const { supabase, user } = await usuarioActual();
  if (!user) redirect("/olvide-clave?aviso=enlace");
  const config = await leerConfigCuentas(supabase);
  return <NuevaClave regla={reglaClave(config)} minimo={config.clave_min} volver={<Link href="/mi-cuenta" className="font-semibold text-marca">Ahora no</Link>} />;
}
