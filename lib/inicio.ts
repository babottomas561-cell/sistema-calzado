// Portada de la tienda (/): las secciones que la arman, lo que guarda cada tipo en `contenido`
// y cómo se lee sin romperse. Lo usan la landing (app/(tienda)/page.tsx) y el editor del panel
// (/admin/tienda). La base solo exige que `contenido` sea un objeto: la forma la cuida este archivo,
// y todo lo que no cuadra se reemplaza por un valor por defecto en vez de tirar error en la tienda.
import {
  BookOpen, Images, LayoutTemplate, ListOrdered, MapPin, Megaphone, PanelsTopLeft, ShoppingBag, type LucideIcon,
} from "lucide-react";

export const TIPOS = ["portada", "cinta", "accesos", "productos", "promociones", "banner", "editorial", "pasos", "local"] as const;
export type Tipo = (typeof TIPOS)[number];

// Para el panel: nombre, ícono y qué es cada tipo, en palabras del dueño
export const INFO_TIPO: Record<Tipo, { nombre: string; icono: LucideIcon; ayuda: string }> = {
  portada: { nombre: "Portada", icono: LayoutTemplate, ayuda: "Lo primero que se ve: una campaña a pantalla completa (foto o video) o fotos del catálogo en movimiento." },
  cinta: { nombre: "Cinta que corre", icono: Megaphone, ayuda: "Una franja con frases y marcas que se desliza sola." },
  accesos: { nombre: "Accesos", icono: PanelsTopLeft, ayuda: "Tarjetas grandes con foto que llevan a una parte de la tienda (Mujer, Hombre, Calzado…)." },
  productos: { nombre: "Vidriera", icono: ShoppingBag, ayuda: "Una fila de productos: los más vendidos, lo nuevo, lo que está en promoción o los que elijas." },
  promociones: { nombre: "Promociones", icono: Megaphone, ayuda: "Una franja de color con las promociones vigentes de la tienda. Si no hay ninguna, no aparece." },
  banner: { nombre: "Banner con foto", icono: Images, ayuda: "Una foto o video grande a lo ancho con un texto y un botón. Ideal para una temporada o un lanzamiento." },
  editorial: { nombre: "Editorial 50/50", icono: BookOpen, ayuda: "Una foto grande de un lado y el texto de una colección del otro, como en las revistas de moda." },
  pasos: { nombre: "Cómo comprar", icono: ListOrdered, ayuda: "Los pasos para comprar, numerados." },
  local: { nombre: "El local", icono: MapPin, ayuda: "Dirección, horario y WhatsApp (salen de los datos de la tienda)." },
};

// ── Lo particular de cada tipo ────────────────────────────────────────
// A dónde lleva una tarjeta de acceso: arma el link a /tienda con sus filtros
export type Filtro = { genero?: string; categoria?: string; linea?: string; q?: string };
export type Tarjeta = { titulo: string; bajada?: string; filtro: Filtro; imagen_url?: string | null };
export type Paso = { titulo: string; texto: string };
export const CRITERIOS = { mas_vendidos: "Los más vendidos", nuevos: "Lo nuevo", promocion: "En promoción", elegidos: "Elegidos a mano" } as const;
export type Criterio = keyof typeof CRITERIOS;
export const FONDOS = { claro: "Claro", oscuro: "Oscuro", acento: "Color de promociones" } as const;
export type Fondo = keyof typeof FONDOS;
export const ESTILOS_PORTADA = { foto: "Campaña: foto o video a pantalla completa", columnas: "Fotos del catálogo en movimiento" } as const;
export type EstiloPortada = keyof typeof ESTILOS_PORTADA;

export type Contenido = {
  portada: { estilo: EstiloPortada; antetitulo?: string; marca_gigante: boolean };
  cinta: { frases: string[]; marcas: boolean };
  accesos: { tarjetas: Tarjeta[] };
  productos: { criterio: Criterio; cantidad: number; productos: number[] };
  promociones: Record<string, never>;
  banner: { alineacion: "izquierda" | "centro" };
  editorial: { lado: "izquierda" | "derecha"; fondo: Fondo; antetitulo?: string };
  pasos: { pasos: Paso[] };
  local: Record<string, never>;
};

export type Seccion<T extends Tipo = Tipo> = {
  id: number; tipo: T; orden: number; visible: boolean;
  titulo: string | null; bajada: string | null; boton_texto: string | null; boton_enlace: string | null;
  imagen_url: string | null; imagen_ruta: string | null; contenido: Contenido[T];
};

// ── Lectura segura de `contenido` (viene de la base como json cualquiera) ──
type Json = unknown;
const obj = (x: Json): Record<string, Json> => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, Json>) : {});
const txt = (x: Json, max = 200) => (typeof x === "string" ? x.trim().slice(0, max) : "");
const lista = (x: Json) => (Array.isArray(x) ? x : []);

function leerFiltro(x: Json): Filtro {
  const o = obj(x); const f: Filtro = {};
  for (const k of ["genero", "categoria", "linea", "q"] as const) if (txt(o[k])) f[k] = txt(o[k], 60);
  return f;
}

export function leerContenido<T extends Tipo>(tipo: T, x: Json): Contenido[T] {
  const o = obj(x);
  const r: { [K in Tipo]: () => Contenido[K] } = {
    portada: () => ({ estilo: o.estilo === "foto" ? "foto" : "columnas", antetitulo: txt(o.antetitulo, 60) || undefined, marca_gigante: o.marca_gigante !== false }),
    cinta: () => ({ frases: lista(o.frases).map((f) => txt(f, 60)).filter(Boolean).slice(0, 8), marcas: o.marcas !== false }),
    accesos: () => ({ tarjetas: lista(o.tarjetas).map((t) => { const a = obj(t);
      return { titulo: txt(a.titulo, 40), bajada: txt(a.bajada, 80) || undefined, filtro: leerFiltro(a.filtro), imagen_url: txt(a.imagen_url, 500) || null };
    }).filter((t) => t.titulo).slice(0, 6) }),
    productos: () => ({
      criterio: (Object.keys(CRITERIOS) as Criterio[]).includes(o.criterio as Criterio) ? (o.criterio as Criterio) : "mas_vendidos",
      cantidad: Math.min(16, Math.max(2, Math.round(Number(o.cantidad)) || 8)),
      productos: lista(o.productos).map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 16),
    }),
    promociones: () => ({}),
    banner: () => ({ alineacion: o.alineacion === "centro" ? "centro" : "izquierda" }),
    editorial: () => ({ lado: o.lado === "derecha" ? "derecha" : "izquierda", fondo: (Object.keys(FONDOS) as Fondo[]).includes(o.fondo as Fondo) ? (o.fondo as Fondo) : "claro",
      antetitulo: txt(o.antetitulo, 60) || undefined }),
    pasos: () => ({ pasos: lista(o.pasos).map((p) => { const a = obj(p); return { titulo: txt(a.titulo, 40), texto: txt(a.texto, 200) }; })
      .filter((p) => p.titulo).slice(0, 6) }),
    local: () => ({}),
  };
  return r[tipo]();
}

// Lo que crea "Agregar sección" (el dueño después lo cambia)
export const NUEVA: { [K in Tipo]: { titulo: string | null; bajada?: string; boton_texto?: string; boton_enlace?: string; contenido: Contenido[K] } } = {
  portada: { titulo: "Nueva temporada", boton_texto: "Entrar a la tienda", boton_enlace: "/tienda", contenido: { estilo: "foto", marca_gigante: true } },
  cinta: { titulo: null, contenido: { frases: ["Reservá online", "Retirá sin cargo en el local"], marcas: true } },
  accesos: { titulo: "Elegí por dónde empezar", boton_texto: "Ver todo", boton_enlace: "/tienda", contenido: { tarjetas: [{ titulo: "Mujer", filtro: { genero: "Mujer" } }, { titulo: "Hombre", filtro: { genero: "Hombre" } }] } },
  productos: { titulo: "Lo nuevo", boton_texto: "Ver toda la tienda", boton_enlace: "/tienda", contenido: { criterio: "nuevos", cantidad: 8, productos: [] } },
  promociones: { titulo: "Ahora en la tienda", boton_texto: "Ver las prendas", boton_enlace: "/tienda", contenido: {} },
  banner: { titulo: "Llegó la nueva colección", bajada: "Pasá a verla al local o reservala online.", boton_texto: "Ver la colección", boton_enlace: "/tienda", contenido: { alineacion: "izquierda" } },
  editorial: { titulo: "Para salir esta noche", bajada: "Vestidos, sacos y zapatos para cualquier ocasión.", boton_texto: "Ver la selección", boton_enlace: "/tienda", contenido: { lado: "izquierda", fondo: "claro", antetitulo: "La edición de la semana" } },
  pasos: { titulo: "Comprar es así de simple", contenido: { pasos: [{ titulo: "Elegí", texto: "Sumá lo que te guste al carrito." }, { titulo: "Reservá", texto: "Te lo guardamos y coordinamos por WhatsApp." }] } },
  local: { titulo: "Pasá a probártelo", bajada: "Te esperamos en el local.", boton_texto: "Entrar a la tienda", boton_enlace: "/tienda", contenido: {} },
};

// Link a la tienda con los filtros de una tarjeta: /tienda?genero=Mujer#catalogo
export function enlaceFiltro(f: Filtro) {
  const p = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]);
  return `/tienda${p.size ? `?${p}` : ""}#catalogo`;
}

// La foto de una sección puede ser un video (portada y banner): se reconoce por la extensión
export const esVideo = (url: string | null | undefined) => !!url && /\.(mp4|webm)(\?|#|$)/i.test(url);

// Un link que pone el dueño: interno (/tienda), ancla (#local) o externo con http(s). Lo demás no se guarda.
export const enlaceValido = (x: string) => /^(\/|#|https?:\/\/)/.test(x);
