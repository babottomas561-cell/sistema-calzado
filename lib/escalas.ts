// Escalas de talles (productos.escala y talles.tipo). La lista es fija y la valida la base (check);
// el orden es el de las góndolas: calzado primero, después ropa.
export const ESCALAS = ["Adulto", "Niños", "Bebé", "Ropa letras", "Ropa números", "Único"] as const;
export type Escala = (typeof ESCALAS)[number];

// Cómo se rotula cada escala ("Talles adultos", "Talles ropa (S, M, L)"…)
export const TITULO_ESCALA: Record<string, string> = {
  Adulto: "Calzado adultos", Niños: "Calzado niños", Bebé: "Calzado bebés",
  "Ropa letras": "Ropa (S, M, L…)", "Ropa números": "Ropa (36, 38, 40…)", Único: "Talle único",
};
// Prefijo para filtros de la tienda ("Talle", "Talle niños", "Talle ropa"…)
export const FILTRO_ESCALA: Record<string, string> = {
  Adulto: "Talle de calzado", Niños: "Talle de calzado niños", Bebé: "Talle de calzado bebé",
  "Ropa letras": "Talle de ropa", "Ropa números": "Talle de pantalón o jean", Único: "Talle único",
};
export const ordenEscala = (e: string | null | undefined) => { const i = ESCALAS.indexOf(e as Escala); return i < 0 ? 99 : i; };
// Para informes: el «38» de calzado y el de jeans son talles distintos, así que se muestran con su escala
export const rotuloTalle = (talle: string | null, escala: string | null) =>
  !talle ? "" : !escala || escala === "Adulto" ? talle : `${talle} (${escala.toLowerCase()})`;

export const LINEAS = ["Calzado", "Ropa", "Accesorios"] as const;
export const TEMPORADAS = ["Primavera/Verano", "Otoño/Invierno", "Todo el año"] as const;
