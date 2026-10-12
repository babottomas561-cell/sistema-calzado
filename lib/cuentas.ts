// Cuentas de clientes: lo que el dueño configuró en /admin/equipo/cuentas (tabla configuracion_cuentas).
// La base hace cumplir las reglas de registro; acá se leen para armar el formulario y avisar antes de enviar.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export type ConfigCuentas = Database["public"]["Tables"]["configuracion_cuentas"]["Row"];
export type Modo = "no" | "opcional" | "obligatorio";

export async function leerConfigCuentas(supabase: SupabaseClient<Database>): Promise<ConfigCuentas> {
  const { data } = await supabase.from("configuracion_cuentas").select("*").single();
  // Si no se pudo leer, valores de fábrica: nunca dejar la tienda sin formulario
  return data ?? {
    unica: true, registro: "abierto", confirmar_email: true, telefono: "opcional", documento: "no", nacimiento: "no", direccion: "no",
    clave_min: 8, clave_exige_numero: false, clave_exige_mayuscula: false, dominios_permitidos: [], dominios_bloqueados: [],
    exigir_terminos: false, terminos_url: null, ofrecer_novedades: true, texto_registro: null, texto_confirmado: null,
    actualizado_en: "", actualizado_por: null,
  };
}

// Qué le falta a la contraseña según las reglas del local (null = está bien)
export function errorClave(c: Pick<ConfigCuentas, "clave_min" | "clave_exige_numero" | "clave_exige_mayuscula">, clave: string): string | null {
  if (clave.length < c.clave_min) return `La contraseña tiene que tener al menos ${c.clave_min} caracteres`;
  if (c.clave_exige_mayuscula && !/[A-Z]/.test(clave)) return "La contraseña tiene que tener al menos una mayúscula";
  if (c.clave_exige_numero && !/[0-9]/.test(clave)) return "La contraseña tiene que tener al menos un número";
  return null;
}

// La regla de contraseña dicha en una línea, para mostrarla debajo del campo
export function reglaClave(c: Pick<ConfigCuentas, "clave_min" | "clave_exige_numero" | "clave_exige_mayuscula">): string {
  const extra = [c.clave_exige_mayuscula && "una mayúscula", c.clave_exige_numero && "un número"].filter(Boolean);
  return `Mínimo ${c.clave_min} caracteres${extra.length ? `, con ${extra.join(" y ")}` : ""}.`;
}
