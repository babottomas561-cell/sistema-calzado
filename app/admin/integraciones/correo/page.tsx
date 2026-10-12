// Correo: el servidor SMTP del local para los mails de la tienda (confirmar la cuenta, cambiar la contraseña). Solo el Administrador.
import { exigir } from "@/lib/exigir";
import Encabezado from "../Encabezado";
import Manual from "../Manual";
import Correo, { type EstadoCorreo } from "./Correo";

export default async function PaginaCorreo() {
  const { supabase } = await exigir("equipo.administrar");
  const { data: estado } = await supabase.rpc("estado_correo");
  const e = estado as unknown as EstadoCorreo;
  return (
    <div className="max-w-4xl space-y-6">
      <Encabezado titulo="Correo" texto="Los mails que le llegan al cliente (confirmar su cuenta, cambiar la contraseña) salen por tu propio servidor de correo, con el nombre de tu tienda." />
      <section className="overflow-hidden rounded-xl border border-borde bg-white shadow-sm">{e && <Correo estado={e} />}</section>
      <Manual nombre="correo" abierto={!e?.smtp} />
    </div>
  );
}
