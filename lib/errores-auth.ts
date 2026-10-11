// Los errores de Supabase Auth llegan en inglés ("email rate limit exceeded"): acá se traducen
// a algo que un cliente entienda y que le diga qué hacer. Se busca por el código del error.
import type { AuthError } from "@supabase/supabase-js";

const MENSAJES: Record<string, string> = {
  over_email_send_rate_limit: "Se mandaron demasiados emails en poco tiempo. Esperá unos minutos y probá de nuevo.",
  over_request_rate_limit: "Demasiados intentos seguidos. Esperá unos minutos y probá de nuevo.",
  user_already_exists: "Ya hay una cuenta con ese email. Probá ingresar.",
  email_exists: "Ya hay una cuenta con ese email. Probá ingresar.",
  weak_password: "La contraseña es muy débil: usá al menos 8 caracteres, mezclando letras y números.",
  email_address_invalid: "Ese email no parece válido. Revisalo.",
  email_not_confirmed: "Todavía no confirmaste tu email. Buscá el mail que te mandamos (fijate en spam) y tocá el link.",
  invalid_credentials: "Email o contraseña incorrectos.",
  signup_disabled: "Por ahora no se pueden crear cuentas nuevas.",
};

export function errorAuth(error: AuthError) {
  return (error.code && MENSAJES[error.code]) || "No pudimos completar la operación. Probá de nuevo en un rato.";
}
