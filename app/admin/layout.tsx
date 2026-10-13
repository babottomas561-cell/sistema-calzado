// Panel interno: solo el equipo (el proxy ya redirige; acá se vuelve a verificar).
import { redirect } from "next/navigation";
import Menu from "@/components/Menu";
import { crearCliente, usuarioActual } from "@/lib/supabase/server";
import { datosTienda } from "@/lib/tienda";
import { versionSistema } from "@/lib/version";
import { guardarMenu } from "./menu-acciones";

async function salir() {
  "use server";
  const supabase = await crearCliente();
  await supabase.auth.signOut();
  redirect("/ingresar");
}

export default async function LayoutAdmin({ children }: { children: React.ReactNode }) {
  const [{ user, rol, rolEquipo, permisos }, tienda] = await Promise.all([usuarioActual(), datosTienda()]);
  if (!user) redirect("/ingresar?volver=/admin");
  if (rol !== "staff") redirect("/mi-cuenta");
  const supabase = await crearCliente();
  const [{ data: apagados }, { data: miMenu }] = await Promise.all([
    supabase.from("modulos_desactivados").select("clave"),
    supabase.from("menu_usuario").select("favoritos, ocultos").eq("usuario_id", user.id).maybeSingle(),
  ]);

  return (
    <div className="md:flex print:block">
      <Menu version={versionSistema()} logo={tienda.logo_url} nombre={tienda.nombre} email={user.email ?? ""} rolEquipo={rolEquipo} permisos={permisos} salir={salir}
        desactivados={(apagados ?? []).flatMap((m) => (m.clave ? [m.clave] : []))} favoritos={miMenu?.favoritos ?? []} ocultos={miMenu?.ocultos ?? []} guardarMenu={guardarMenu} />
      <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 py-5 md:px-8 md:py-8 print:m-0 print:max-w-none print:p-0">{children}</main>
    </div>
  );
}
