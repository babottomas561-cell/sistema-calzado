// Corre ANTES de cada página: refresca la sesión y controla quién entra a dónde.
//   /admin/*                  → solo el equipo (rol "staff")
//   /mi-cuenta/*              → cualquier usuario logueado
//   /ingresar, /registro      → si ya está logueado, lo manda a su lugar
//   el resto (tienda)         → público
// (En Next.js 16 este archivo se llama proxy.ts; antes se llamaba middleware.ts.)
// Ojo: esto es comodidad de navegación. La seguridad real la pone la base (Row Level Security).
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let respuesta = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (lista) => {
          lista.forEach(({ name, value }) => request.cookies.set(name, value));
          respuesta = NextResponse.next({ request });
          lista.forEach(({ name, value, options }) => respuesta.cookies.set(name, value, options));
        },
      },
    },
  );

  // getUser() valida la sesión contra Supabase (no confía solo en la cookie)
  const { data: { user } } = await supabase.auth.getUser();
  const ruta = request.nextUrl.pathname;
  const ir = (destino: string) => NextResponse.redirect(new URL(destino, request.url));

  const esAdmin = ruta.startsWith("/admin");
  const esCuenta = ruta.startsWith("/mi-cuenta");
  const esAcceso = ruta.startsWith("/ingresar") || ruta.startsWith("/registro");

  if (!user) {
    if (esAdmin || esCuenta) return ir(`/ingresar?volver=${encodeURIComponent(ruta)}`);
    return respuesta;
  }
  if (esAdmin || esAcceso) {
    const { data: perfil } = await supabase.from("perfiles").select("rol").eq("id", user.id).single();
    const staff = perfil?.rol === "staff";
    if (esAdmin && !staff) return ir("/mi-cuenta");
    if (esAcceso) return ir(staff ? "/admin" : "/mi-cuenta");
  }
  return respuesta;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
