// Cliente de Supabase para el SERVIDOR (páginas, server actions).
// Lee y escribe la sesión del usuario en las cookies.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";

export async function crearCliente() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (lista) => {
          try {
            lista.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Desde un Server Component no se pueden escribir cookies; el proxy ya refresca la sesión.
          }
        },
      },
    },
  );
}

// El usuario logueado y su rol ("staff" = equipo, "cliente" = comprador de la tienda)
export async function usuarioActual() {
  const supabase = await crearCliente();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, rol: null as null | "staff" | "cliente" };
  const { data: perfil } = await supabase.from("perfiles").select("rol, nombre").eq("id", user.id).single();
  return { supabase, user, rol: (perfil?.rol ?? "cliente") as "staff" | "cliente", nombre: perfil?.nombre ?? user.email };
}
