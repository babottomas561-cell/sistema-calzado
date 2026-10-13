// Mi cuenta (equipo): lo personal de cada persona. Por ahora, el PIN para autorizar excepciones (solo quien tiene ese permiso).
import { Lock } from "lucide-react";
import { usuarioActual } from "@/lib/supabase/server";
import { puede } from "@/lib/permisos";
import FormPin from "./FormPin";

export default async function MiCuenta() {
  const { supabase, permisos, user, rolEquipo } = await usuarioActual();
  const autoriza = puede(permisos, "ventas.autorizar");
  const { data: tienePin } = autoriza ? await supabase.rpc("tengo_pin") : { data: false };
  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Mi cuenta</h1>
        <p className="text-sm text-texto-2">{user?.email}{rolEquipo ? ` · ${rolEquipo}` : ""}</p>
      </div>
      {autoriza ? <FormPin tienePin={!!tienePin} /> : (
        <p className="flex items-center gap-2 rounded-lg border border-borde bg-white px-4 py-2.5 text-sm text-texto-2"><Lock size={16} /> Tu rol no autoriza excepciones, así que no necesitás un PIN. Para cambiar la contraseña usá «Cambiar contraseña» en el menú.</p>
      )}
    </div>
  );
}
