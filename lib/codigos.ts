// Códigos de barras: dígito verificador GS1, qué tipo de código es y cómo se comparan con lo que lee un lector.
// Es el mismo criterio que aplica la base (migración codigos_de_barras): acá se usa para avisar antes de mandar y para
// dibujar la etiqueta. Sin dependencias, así lo usan el navegador, el servidor y las pruebas.

export type TipoCodigo = "ean13" | "ean8" | "upca" | "gtin14" | "code128";

// Cómo se llama cada formato en jsbarcode y cómo se lo muestra
export const FORMATO_JSBARCODE: Record<TipoCodigo, string> = { ean13: "EAN13", ean8: "EAN8", upca: "UPC", gtin14: "ITF14", code128: "CODE128" };
export const ROTULO_TIPO: Record<TipoCodigo, string> = { ean13: "EAN-13", ean8: "EAN-8", upca: "UPC-A", gtin14: "GTIN-14", code128: "Code 128" };

// Dígito verificador de un cuerpo numérico (el código sin su último dígito): pesos 3 y 1 alternados desde la derecha
export function digitoGs1(cuerpo: string): number | null {
  if (!/^[0-9]+$/.test(cuerpo)) return null;
  let suma = 0;
  for (let i = 0; i < cuerpo.length; i++) suma += Number(cuerpo[i]) * ((cuerpo.length - 1 - i) % 2 === 0 ? 3 : 1);
  return (10 - (suma % 10)) % 10;
}

// ¿EAN-8, UPC-A, EAN-13 o GTIN-14 con su dígito verificador bien?
export const gs1Valido = (c: string) => /^[0-9]+$/.test(c) && [8, 12, 13, 14].includes(c.length) && Number(c[c.length - 1]) === digitoGs1(c.slice(0, -1));

// Los lectores a veces suman un salto de línea o una tabulación; los espacios no forman parte de un código
export const normalizarCodigo = (texto: string) => texto.replace(/\s+/g, "");

// null si el código sirve; si no, qué está mal (las mismas reglas que la base)
export function validarCodigo(texto: string): string | null {
  const c = normalizarCodigo(texto);
  if (!c) return null;
  if (!/^[A-Za-z0-9._-]{4,32}$/.test(c)) return "Solo letras, números, punto, guion y guion bajo (de 4 a 32 caracteres)";
  if (/^[0-9]+$/.test(c) && [8, 12, 13, 14].includes(c.length) && !gs1Valido(c)) return `El dígito verificador de ${c} no coincide: revisá que esté bien escrito`;
  return null;
}

// Cómo se dibuja: los numéricos con dígito válido en su formato; todo lo demás, Code 128 (lleva cualquier texto)
export function tipoDeCodigo(codigo: string): TipoCodigo {
  if (gs1Valido(codigo)) return ({ 13: "ean13", 8: "ean8", 12: "upca", 14: "gtin14" } as Record<number, TipoCodigo>)[codigo.length];
  return "code128";
}

// Un EAN-13 de los que arma el sistema para lo que no trae código: empieza en 2 (rango de uso interno de GS1)
export const esCodigoPropio = (c: string) => /^2[0-9]{12}$/.test(c) && gs1Valido(c);

// Para comparar lo que lee un lector con lo guardado: un UPC-A (12 cifras) es lo mismo que el EAN-13 con un 0 adelante,
// y los lectores a veces lo mandan de una forma o de la otra. Lo alfanumérico se compara sin importar mayúsculas.
export const claveDeBusqueda = (codigo: string) => {
  const c = normalizarCodigo(codigo);
  return /^[0-9]{8,14}$/.test(c) ? c.replace(/^0+/, "") : c.toUpperCase();
};

// ¿Parece lo que escupe un lector? (solo cifras y del largo de un GTIN): sirve para agregar solo, sin esperar el Enter
export const pareceCodigoLeido = (texto: string) => /^[0-9]+$/.test(texto) && [8, 12, 13, 14].includes(texto.length);

// Un código propio a partir de un número correlativo (la base usa el mismo: 200 + 9 cifras + dígito verificador)
export function codigoPropio(numero: number): string {
  const cuerpo = `200${String(numero).padStart(9, "0")}`;
  return `${cuerpo}${digitoGs1(cuerpo)}`;
}
