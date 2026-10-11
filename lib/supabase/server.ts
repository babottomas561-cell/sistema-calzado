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

// El usuario logueado y su rol ("staff" = equipo, "cliente" = comprador de la tienda).
// Si es del equipo, también su rol dentro del equipo (Administrador, Cajero…), sus permisos y su
// tope de descuento: con eso la app arma el menú; lo que se puede hacer de verdad lo controla la base.
export async function usuarioActual() {
  const supabase = await crearCliente();
  const { data: { user } } = await supabase.auth.getUser();
  const sinEquipo = { rolEquipo: null as string | null, permisos: [] as string[], descuentoMax: null as number | null };
  if (!user) return { supabase, user: null, rol: null as null | "staff" | "cliente", nombre: null, ...sinEquipo };
  const { data: perfil } = await supabase.from("perfiles").select("rol, nombre").eq("id", user.id).single();
  const rol = (perfil?.rol ?? "cliente") as "staff" | "cliente";
  let equipo = sinEquipo;
  if (rol === "staff") {
    const { data } = await supabase.rpc("mi_equipo").maybeSingle();
    if (data) equipo = { rolEquipo: data.rol, permisos: data.permisos ?? [], descuentoMax: data.descuento_max_pct === null ? null : Number(data.descuento_max_pct) };
  }
  return { supabase, user, rol, nombre: perfil?.nombre ?? user.email ?? null, ...equipo };
}
