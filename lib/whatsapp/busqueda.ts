// «Camisas» → «camisa», «zapatillas negras» → [«zapatilla», «negra»]: los clientes escriben en plural y el catálogo está en singular
// Palabras que no describen una prenda («jeans en talle 42» busca «jean»; el talle se mira aparte)
const RELLENO = new Set(["talle", "talles", "tallas", "talla", "numero", "medida", "en", "de", "del", "la", "el", "los", "las", "un", "una", "con", "para", "que", "hay", "tienen", "tenes", "tiene", "tengan", "quiero", "busco", "necesito", "color", "stock", "disponible", "disponibles", "mostrame", "muestrame", "ver", "algun", "alguna", "algo", "me", "mi", "por", "favor", "o", "y"]);

export function terminosDeBusqueda(...textos: (string | undefined)[]): string[] {
  const palabras = textos.join(" ").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9ñ ]/g, " ").split(/\s+/).filter((t) => t.length > 1 && !RELLENO.has(t) && !/^\d+$/.test(t));
  const sinPlural = (t: string) => (t.length > 4 && t.endsWith("es") && /[^aeiou]es$/.test(t) ? t.slice(0, -2) : t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t);
  return [...new Set(palabras.map(sinPlural))].slice(0, 5);
}
