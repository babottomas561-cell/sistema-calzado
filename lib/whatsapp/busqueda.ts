// «Camisas» → «camisa», «zapatillas negras» → [«zapatilla», «negra»]: los clientes escriben en plural y el catálogo está en singular
export function terminosDeBusqueda(...textos: (string | undefined)[]): string[] {
  const palabras = textos.join(" ").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9ñ ]/g, " ").split(/\s+/).filter((t) => t.length > 1);
  const sinPlural = (t: string) => (t.length > 4 && t.endsWith("es") && /[^aeiou]es$/.test(t) ? t.slice(0, -2) : t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t);
  return [...new Set(palabras.map(sinPlural))].slice(0, 5);
}
