// Color de la marca: se elige en Tienda online → Identidad. Se valida que el texto blanco (botones) se lea sobre él.
const HEX = /^#[0-9a-f]{6}$/;
export const esHex = (c: string) => HEX.test(c);

function luminancia(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Contraste del texto blanco sobre ese color (WCAG: 4.5 es el mínimo para texto normal)
export const contrasteConBlanco = (hex: string) => 1.05 / (luminancia(hex) + 0.05);
export const sirveParaBotones = (hex: string) => esHex(hex) && contrasteConBlanco(hex) >= 4.5;

// El CSS que pisa el color de la marca (panel y tienda). Solo se arma con un hex ya validado.
export function cssMarca(hex: string | null | undefined): string | null {
  if (!hex || !sirveParaBotones(hex)) return null;
  const vars = `--color-marca:${hex};--color-marca-suave:color-mix(in srgb,${hex} 14%,white);--color-marca-oscuro:color-mix(in srgb,${hex} 82%,black);`;
  return `html{${vars}}html .tienda{${vars}}`;
}
