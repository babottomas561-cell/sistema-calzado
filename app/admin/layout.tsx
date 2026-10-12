// Panel interno: solo el equipo (el proxy ya redirige; acá se vuelve a verificar).
import { redirect } from "next/navigation";
import Menu from "@/components/Menu";
import { crearCliente, usuarioActual } from "@/lib/supabase/server";
import { datosTienda } from "@/lib/tienda";

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

  return (
    <div className="md:flex">
      <Menu nombre={tienda.nombre} email={user.email ?? ""} rolEquipo={rolEquipo} permisos={permisos} salir={salir} />
      <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 py-5 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
