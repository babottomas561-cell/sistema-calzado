// Cómo manda sus mails el local. Tres caminos a elección; el modo sale del servidor que quedó guardado (no hay un campo aparte).
//  · dominio: Resend con un dominio propio verificado (los mails salen con la marca del local)
//  · gmail:   la cuenta de Gmail del local, con «contraseña de aplicación» (no necesita dominio)
//  · otro:    cualquier otro servidor SMTP
export type ModoCorreo = "dominio" | "gmail" | "otro";

export const SERVIDORES: Record<Exclude<ModoCorreo, "otro">, { host: string; puerto: number; usuario?: string }> = {
  dominio: { host: "smtp.resend.com", puerto: 465, usuario: "resend" },
  gmail: { host: "smtp.gmail.com", puerto: 465 },
};

export function modoDe(host: string | null | undefined): ModoCorreo {
  const h = (host ?? "").trim().toLowerCase();
  if (h === SERVIDORES.dominio.host) return "dominio";
  if (h === SERVIDORES.gmail.host) return "gmail";
  return "otro";
}

// Una contraseña de aplicación de Google son 16 letras (se muestran en grupos de 4 con espacios): se guardan juntas
export const limpiarClaveGmail = (x: string) => x.replace(/\s+/g, "");
