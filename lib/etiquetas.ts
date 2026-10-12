// Etiquetas: cómo se reparten en páginas según la plantilla (rollo u hoja) y qué lleva cada una. Es la lógica pura de
// /admin/etiquetas y de /admin/impresion: se prueba sin navegador (lib/etiquetas.test.ts). Sin imports: la usan el servidor y el cliente.

export type Plantilla = {
  id: number; nombre: string; tipo: "rollo" | "hoja"; pagina: "A4" | "Carta" | null;
  ancho_mm: number; alto_mm: number; columnas: number; filas: number;
  margen_superior_mm: number; margen_izquierdo_mm: number; separacion_h_mm: number; separacion_v_mm: number;
  mostrar_tienda: boolean; mostrar_nombre: boolean; mostrar_marca: boolean; mostrar_talle_color: boolean; mostrar_precio: boolean; mostrar_codigo: boolean;
  tamano_texto: number; tamano_precio: number; tipo_codigo: "auto" | "code128"; alto_codigo_mm: number;
};

// Lo que lleva cada etiqueta
export type DatoEtiqueta = { tienda: string; nombre: string; marca: string | null; talle: string; color: string; precio: number; codigo: string; sku: string | null };
export type FilaEtiqueta = {
  variante_id: number; producto_id: number; nombre: string; marca: string | null; talle: string; color: string; sku: string | null;
  codigo_barras: string | null; precio_venta: number; stock: number; talle_orden?: number | null;
};

export const PAGINAS = { A4: { ancho: 210, alto: 297 }, Carta: { ancho: 215.9, alto: 279.4 } } as const;

// Lo que llega de la base (los numeric pueden venir como texto): todo a número
export function leerPlantilla(f: Record<string, unknown>): Plantilla {
  const n = (k: string) => Number(f[k]);
  return {
    id: n("id"), nombre: String(f.nombre ?? ""), tipo: f.tipo === "hoja" ? "hoja" : "rollo", pagina: f.pagina === "Carta" ? "Carta" : f.pagina === "A4" ? "A4" : null,
    ancho_mm: n("ancho_mm"), alto_mm: n("alto_mm"), columnas: n("columnas") || 1, filas: n("filas") || 1,
    margen_superior_mm: n("margen_superior_mm") || 0, margen_izquierdo_mm: n("margen_izquierdo_mm") || 0, separacion_h_mm: n("separacion_h_mm") || 0, separacion_v_mm: n("separacion_v_mm") || 0,
    mostrar_tienda: !!f.mostrar_tienda, mostrar_nombre: !!f.mostrar_nombre, mostrar_marca: !!f.mostrar_marca, mostrar_talle_color: !!f.mostrar_talle_color,
    mostrar_precio: !!f.mostrar_precio, mostrar_codigo: !!f.mostrar_codigo,
    tamano_texto: n("tamano_texto") || 7, tamano_precio: n("tamano_precio") || 11, tipo_codigo: f.tipo_codigo === "code128" ? "code128" : "auto", alto_codigo_mm: n("alto_codigo_mm") || 9,
  };
}

// El tamaño de cada página: la hoja, o (en un rollo) las etiquetas de una fila
export function medidasDePagina(p: Plantilla): { ancho: number; alto: number } {
  if (p.tipo === "hoja") return { ...PAGINAS[p.pagina ?? "A4"] };
  return { ancho: redondear(p.columnas * p.ancho_mm + (p.columnas - 1) * p.separacion_h_mm), alto: p.alto_mm };
}
const redondear = (n: number) => Math.round(n * 10) / 10;

// ¿La grilla entra en la hoja? (la base valida lo mismo al guardar). null si entra.
export function cabeEnLaPagina(p: Plantilla): string | null {
  const ancho = p.margen_izquierdo_mm + p.columnas * p.ancho_mm + (p.columnas - 1) * p.separacion_h_mm;
  if (p.tipo === "rollo") return ancho > 200 ? `El rollo es demasiado ancho (${redondear(ancho)} mm): revisá el tamaño y las columnas` : null;
  const hoja = PAGINAS[p.pagina ?? "A4"];
  const alto = p.margen_superior_mm + p.filas * p.alto_mm + (p.filas - 1) * p.separacion_v_mm;
  if (ancho > hoja.ancho + 0.5 || alto > hoja.alto + 0.5) {
    return `Las etiquetas no entran en la hoja (${redondear(ancho)} × ${redondear(alto)} mm, y la hoja ${p.pagina} mide ${hoja.ancho} × ${hoja.alto} mm): revisá el tamaño, las columnas, las filas y los márgenes`;
  }
  return null;
}

export type Pagina<T> = { ancho: number; alto: number; celdas: (T | null)[] };

// Reparte las etiquetas en páginas. En una hoja, `inicio` es cuántas posiciones se saltean al principio (para seguir una hoja ya usada).
// Cada página trae todas sus celdas (las vacías, en null) para que la grilla quede en su lugar.
export function paginar<T>(p: Plantilla, etiquetas: T[], inicio = 0): Pagina<T>[] {
  if (etiquetas.length === 0) return [];
  const porPagina = p.tipo === "hoja" ? p.columnas * p.filas : p.columnas;
  const salto = p.tipo === "hoja" ? Math.max(0, Math.min(Math.floor(inicio) || 0, porPagina - 1)) : 0;
  const todas: (T | null)[] = [...Array<null>(salto).fill(null), ...etiquetas];
  const { ancho, alto } = medidasDePagina(p);
  const paginas: Pagina<T>[] = [];
  for (let i = 0; i < todas.length; i += porPagina) {
    const celdas = todas.slice(i, i + porPagina);
    while (celdas.length < porPagina) celdas.push(null);
    paginas.push({ ancho, alto, celdas });
  }
  return paginas;
}

// La regla de la página para imprimir: sin márgenes del navegador y del tamaño exacto
export const cssDePagina = (p: Plantilla) => { const { ancho, alto } = medidasDePagina(p); return `@page { size: ${ancho}mm ${alto}mm; margin: 0; }`; };

// De las filas con su cantidad a una lista de etiquetas (una por unidad). Lo que no tiene código de barras no se puede imprimir.
export function expandir(filas: (FilaEtiqueta & { cantidad: number })[], tienda: string): { etiquetas: DatoEtiqueta[]; sinCodigo: number } {
  const etiquetas: DatoEtiqueta[] = [];
  let sinCodigo = 0;
  for (const f of filas) {
    if (f.cantidad <= 0) continue;
    if (!f.codigo_barras) { sinCodigo++; continue; }
    const dato: DatoEtiqueta = { tienda, nombre: f.nombre, marca: f.marca, talle: f.talle, color: f.color, precio: Number(f.precio_venta), codigo: f.codigo_barras, sku: f.sku };
    for (let i = 0; i < f.cantidad; i++) etiquetas.push(dato);
  }
  return { etiquetas, sinCodigo };
}

// Medidas que se ofrecen al armar una plantilla nueva (el dueño las ajusta)
export const MEDIDAS_COMUNES: { nombre: string; tipo: "rollo" | "hoja"; pagina: "A4" | null; ancho_mm: number; alto_mm: number; columnas: number; filas: number;
  margen_superior_mm: number; margen_izquierdo_mm: number; separacion_h_mm: number; separacion_v_mm: number }[] = [
  { nombre: "Rollo 50 × 30", tipo: "rollo", pagina: null, ancho_mm: 50, alto_mm: 30, columnas: 1, filas: 1, margen_superior_mm: 0, margen_izquierdo_mm: 0, separacion_h_mm: 0, separacion_v_mm: 0 },
  { nombre: "Rollo 60 × 40", tipo: "rollo", pagina: null, ancho_mm: 60, alto_mm: 40, columnas: 1, filas: 1, margen_superior_mm: 0, margen_izquierdo_mm: 0, separacion_h_mm: 0, separacion_v_mm: 0 },
  { nombre: "Rollo 40 × 25", tipo: "rollo", pagina: null, ancho_mm: 40, alto_mm: 25, columnas: 1, filas: 1, margen_superior_mm: 0, margen_izquierdo_mm: 0, separacion_h_mm: 0, separacion_v_mm: 0 },
  { nombre: "Rollo 2 en fila · 40 × 25", tipo: "rollo", pagina: null, ancho_mm: 40, alto_mm: 25, columnas: 2, filas: 1, margen_superior_mm: 0, margen_izquierdo_mm: 0, separacion_h_mm: 2, separacion_v_mm: 0 },
  { nombre: "Hoja A4 · 3 × 7 (21 etiquetas)", tipo: "hoja", pagina: "A4", ancho_mm: 63.5, alto_mm: 38.1, columnas: 3, filas: 7, margen_superior_mm: 15.1, margen_izquierdo_mm: 7.2, separacion_h_mm: 2.5, separacion_v_mm: 0 },
  { nombre: "Hoja A4 · 3 × 8 (24 etiquetas)", tipo: "hoja", pagina: "A4", ancho_mm: 63.5, alto_mm: 33.9, columnas: 3, filas: 8, margen_superior_mm: 12.9, margen_izquierdo_mm: 7.2, separacion_h_mm: 2.5, separacion_v_mm: 0 },
  { nombre: "Hoja A4 · 5 × 13 (65 etiquetas)", tipo: "hoja", pagina: "A4", ancho_mm: 38.1, alto_mm: 21.2, columnas: 5, filas: 13, margen_superior_mm: 10.7, margen_izquierdo_mm: 4.7, separacion_h_mm: 2.5, separacion_v_mm: 0 },
];

// Las columnas de v_stock que hacen falta para armar etiquetas
export const COLUMNAS_ETIQUETA = "variante_id, producto_id, nombre, marca, talle, talle_orden, color, sku, codigo_barras, precio_venta, stock";

// v_stock trae una fila por depósito que vende: se deja una sola por variante, con el stock sumado
export function unaPorVariante(filas: Record<string, unknown>[]): FilaEtiqueta[] {
  const m = new Map<number, FilaEtiqueta>();
  for (const f of filas) {
    const id = Number(f.variante_id);
    const ya = m.get(id);
    if (ya) { ya.stock += Number(f.stock ?? 0); continue; }
    m.set(id, { variante_id: id, producto_id: Number(f.producto_id), nombre: String(f.nombre ?? ""), marca: (f.marca as string | null) ?? null, talle: String(f.talle ?? ""), color: String(f.color ?? ""),
      sku: (f.sku as string | null) ?? null, codigo_barras: (f.codigo_barras as string | null) ?? null, precio_venta: Number(f.precio_venta ?? 0), stock: Number(f.stock ?? 0),
      talle_orden: f.talle_orden == null ? null : Number(f.talle_orden) });
  }
  return [...m.values()];
}

// ── Lotes: sumar varios artículos de una sola vez ──
export type FilaConCantidad = FilaEtiqueta & { cantidad: number };
export type ArticuloEtiqueta = { producto_id: number; nombre: string; marca: string | null; variantes: number; conCodigo: number; stock: number };
export type CompraEtiqueta = { id: number; comprobante: string; fecha: string; proveedor: string | null; unidades: number };
export type FiltroLote = { marca: string; categoria: string; genero: string; temporada: string; soloConStock: boolean };
export const MAX_LOTE = 1500;   // variantes por vez: más que eso es un error de filtro, no una tanda
export const TEMPORADAS = ["Primavera/Verano", "Otoño/Invierno", "Todo el año"];
export const GENEROS = ["Hombre", "Mujer", "Unisex", "Niños"];

// Suma lo que se agrega a lo que ya hay: la misma variante junta sus cantidades (hasta 999). Devuelve cuántas eran nuevas.
export function sumarFilas(actuales: FilaConCantidad[], nuevas: FilaConCantidad[]): { filas: FilaConCantidad[]; nuevas: number; repetidas: number } {
  const mapa = new Map(actuales.map((f) => [f.variante_id, f]));
  let agregadas = 0, repetidas = 0;
  for (const n of nuevas) {
    const ya = mapa.get(n.variante_id);
    if (ya) { mapa.set(n.variante_id, { ...ya, cantidad: Math.min(999, ya.cantidad + n.cantidad) }); repetidas++; }
    else { mapa.set(n.variante_id, { ...n, cantidad: Math.min(999, n.cantidad) }); agregadas++; }
  }
  return { filas: [...mapa.values()], nuevas: agregadas, repetidas };
}
