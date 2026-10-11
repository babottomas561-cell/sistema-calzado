// Cliente de Supabase para el NAVEGADOR (componentes "use client").
// Usa la misma sesión que el servidor (cookies) y la misma publishable key: lo que puede hacer
// lo decide RLS en la base. Se usa solo para lo que no conviene pasar por el servidor,
// como subir fotos a Storage (un Server Action tiene límite de tamaño).
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";

export function crearClienteNavegador() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
