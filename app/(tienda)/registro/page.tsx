// Crear cuenta: el formulario lo arma la configuración del local (/admin/equipo/cuentas): qué datos pide,
// si hace falta una invitación y las reglas de la contraseña. Las reglas las hace cumplir la base.
import Link from "next/link";
import { Lock } from "lucide-react";
import { crearCliente } from "@/lib/supabase/server";
import { leerConfigCuentas } from "@/lib/cuentas";
import Formulario from "./Formulario";

export default async function Registro({ searchParams }: { searchParams: Promise<{ invitacion?: string; volver?: string }> }) {
  const { invitacion, volver } = await searchParams;
  const supabase = await crearCliente();
  const config = await leerConfigCuentas(supabase);
  const { data: inv } = invitacion ? await supabase.rpc("invitacion_info", { p_token: invitacion }) : { data: null };
  const invitada = inv as { email: string; rol: string | null } | null;

  if (invitacion && !invitada) return (
    <div className="tarjeta mx-auto max-w-sm space-y-3 p-6 text-center">
      <Lock size={36} className="mx-auto text-alerta" />
      <h1 className="text-xl font-bold">La invitación venció</h1>
      <p className="text-sm text-texto-2">Este link ya se usó o pasó su fecha. Pedile al local que te mande uno nuevo.</p>
      <Link href="/ingresar" className="boton w-full">Ir a ingresar</Link>
    </div>
  );
  if (config.registro === "invitacion" && !invitada) return (
    <div className="tarjeta mx-auto max-w-sm space-y-3 p-6 text-center">
      <Lock size={36} className="mx-auto text-texto-2" />
      <h1 className="text-xl font-bold">Cuentas por invitación</h1>
      <p className="text-sm text-texto-2">Por ahora solo se puede crear una cuenta con una invitación del local. Si ya tenés cuenta, ingresá.</p>
      <Link href="/ingresar" className="boton w-full">Ingresar</Link>
    </div>
  );
  return <Formulario config={config} invitacion={invitada ? { token: invitacion!, email: invitada.email, rol: invitada.rol } : null} volver={volver ?? ""} />;
}
