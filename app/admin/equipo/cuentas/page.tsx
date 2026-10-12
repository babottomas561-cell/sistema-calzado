// Cuentas de clientes: quién puede registrarse y con qué datos, la contraseña, la confirmación de email y las
// invitaciones. Solo el Administrador; las reglas las hace cumplir la base.
import { exigir } from "@/lib/exigir";
import { leerConfigCuentas } from "@/lib/cuentas";
import Volver from "@/components/Volver";
import { sitio } from "../../integraciones/sitio";
import Cuentas from "./Cuentas";

export default async function PaginaCuentas() {
  const { supabase } = await exigir("equipo.administrar");
  const [config, { data: estadoCorreo }, { data: invitaciones }, { data: roles }, { data: principal }] = await Promise.all([
    leerConfigCuentas(supabase),
    supabase.rpc("estado_correo"),
    supabase.from("invitaciones_cuenta").select("id, email, token, usada_en, vence_en, creado_en, rol:roles(nombre)").order("creado_en", { ascending: false }).limit(30),
    supabase.from("roles").select("id, nombre").eq("activo", true).order("nombre"),
    supabase.from("dominios").select("nombre").eq("principal", true).maybeSingle(),
  ]);
  const correo = estadoCorreo as { smtp: boolean; conexion: boolean } | null;
  return (
    <div className="max-w-4xl space-y-6">
      <div className="space-y-2">
        <Volver href="/admin/equipo">Equipo</Volver>
        <h1 className="text-2xl font-bold">Cuentas de clientes</h1>
        <p className="text-sm text-texto-2">Quién puede crear una cuenta en la tienda, qué datos le pedimos y cómo confirma su email. Las reglas las hace cumplir la base: no se pueden saltear.</p>
      </div>
      <Cuentas config={config} smtp={!!correo?.smtp} conexion={!!correo?.conexion}
        base={principal ? `https://${principal.nombre}` : sitio()}
        invitaciones={(invitaciones ?? []).map((i) => ({ id: i.id, email: i.email, token: i.token, usada: !!i.usada_en, vence_en: i.vence_en, rol: (i.rol as { nombre: string } | null)?.nombre ?? null }))}
        roles={roles ?? []} />
    </div>
  );
}
