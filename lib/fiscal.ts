// Datos fiscales del cliente: categorías frente al IVA, documento y el CUIT con su dígito verificador (el mismo criterio que _cuit_valido en la base).
// Sin dependencias: lo usan la ficha del cliente, la caja y las pruebas (lib/fiscal.test.ts).

export type CondicionIva = "consumidor_final" | "responsable_inscripto" | "monotributo" | "exento" | "no_alcanzado";
export const CONDICIONES: Record<CondicionIva, string> = {
  consumidor_final: "Consumidor final",
  responsable_inscripto: "Responsable inscripto",
  monotributo: "Monotributista",
  exento: "Exento",
  no_alcanzado: "No alcanzado",
};
export type TipoDocumento = "DNI" | "CUIT" | "CUIL" | "pasaporte";
export const TIPOS_DOCUMENTO: TipoDocumento[] = ["DNI", "CUIT", "CUIL", "pasaporte"];
// Las que facturan con CUIT (la base no deja guardarlas sin uno válido)
export const conCuit = (c: CondicionIva) => c === "responsable_inscripto" || c === "monotributo" || c === "exento";

export const PROVINCIAS = ["Buenos Aires", "Ciudad Autónoma de Buenos Aires", "Catamarca", "Chaco", "Chubut", "Córdoba", "Corrientes", "Entre Ríos", "Formosa", "Jujuy",
  "La Pampa", "La Rioja", "Mendoza", "Misiones", "Neuquén", "Río Negro", "Salta", "San Juan", "San Luis", "Santa Cruz", "Santa Fe", "Santiago del Estero",
  "Tierra del Fuego", "Tucumán"];

export function cuitValido(x: string | null | undefined): boolean {
  const c = (x ?? "").replace(/\D/g, "");
  if (!/^\d{11}$/.test(c)) return false;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((s, p, i) => s + p * Number(c[i]), 0);
  const dv = 11 - (suma % 11);
  return (dv === 11 ? 0 : dv === 10 ? 9 : dv) === Number(c[10]);
}
// 20123456786 → 20-12345678-6
export const formatoCuit = (x: string) => { const c = x.replace(/\D/g, ""); return c.length === 11 ? `${c.slice(0, 2)}-${c.slice(2, 10)}-${c[10]}` : x; };

// La letra que le sale a un cliente, igual que _factura_receptor: local inscripto → A a inscriptos y monotributistas con CUIT, B al resto; si no, C
export function letraPara(letraLocal: string, cliente: { condicion_iva?: string | null; tipo_documento?: string | null; documento?: string | null } | null): string {
  if (letraLocal !== "B" || !cliente) return letraLocal;
  const conA = (cliente.condicion_iva === "responsable_inscripto" || cliente.condicion_iva === "monotributo") && cliente.tipo_documento === "CUIT" && cuitValido(cliente.documento);
  return conA ? "A" : "B";
}

// Los datos fiscales que vienen de un formulario (ficha del cliente o alta rápida de la caja). Si el formulario no los trae, no se tocan.
export function datosFiscales(get: (k: string) => string | null): Record<string, string | null> {
  if (get("condicion_iva") == null) return {};
  const t = (k: string) => (get(k) ?? "").trim() || null;
  return {
    condicion_iva: t("condicion_iva") ?? "consumidor_final", tipo_documento: t("tipo_documento") ?? "DNI", documento: t("documento"),
    razon_social: t("razon_social"), domicilio_fiscal: t("domicilio_fiscal"), localidad_fiscal: t("localidad_fiscal"), provincia: t("provincia"),
    email_facturas: t("email_facturas"),
  };
}
