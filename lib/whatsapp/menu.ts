// Menús de WhatsApp: el cliente elige tocando (lista desplegable o botones) en vez de escribir.
// Solo arma los mensajes interactivos (formato de la API de Meta); los datos los pone ./flujo.ts.
// Límites de Meta: lista de hasta 10 filas (título 24, descripción 72, botón 20), botones hasta 3 (título 20), cuerpo 1024.

export type Interactivo = Record<string, unknown> & { type: "list" | "button" };
export type Mensaje = { interactivo: Interactivo } | { texto: string };

export const recorta = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);

type Fila = { id: string; title: string; description?: string };
const lista = (cuerpo: string, boton: string, filas: Fila[], seccion?: string, pie?: string): Interactivo => ({
  type: "list",
  body: { text: recorta(cuerpo, 1024) },
  ...(pie ? { footer: { text: recorta(pie, 60) } } : {}),
  action: {
    button: recorta(boton, 20),
    sections: [{ ...(seccion ? { title: recorta(seccion, 24) } : {}), rows: filas.slice(0, 10).map((f) => ({ id: f.id, title: recorta(f.title, 24), ...(f.description ? { description: recorta(f.description, 72) } : {}) })) }],
  },
});
const botones = (cuerpo: string, opciones: { id: string; title: string }[]): Interactivo => ({
  type: "button",
  body: { text: recorta(cuerpo, 1024) },
  action: { buttons: opciones.slice(0, 3).map((o) => ({ type: "reply", reply: { id: o.id, title: recorta(o.title, 20) } })) },
});

export const OPCIONES_PRINCIPALES: Fila[] = [
  { id: "m:cat", title: "Ver el catálogo", description: "Calzado, ropa y accesorios con precios" },
  { id: "m:pedido", title: "Consultar un pedido", description: "Fijate en qué estado está" },
  { id: "m:info", title: "Horarios y pagos", description: "Dónde estamos, cuándo abrimos y cómo pagar" },
  { id: "m:humano", title: "Hablar con una persona", description: "Te contesta alguien del local" },
];

export const menuPrincipal = (tienda: string): Interactivo =>
  lista(`¡Hola! Soy el asistente de ${tienda}. ¿Qué querés hacer? Elegí una opción tocando el botón, o escribime tu consulta.`, "Ver opciones", OPCIONES_PRINCIPALES, "¿Qué necesitás?");

export const botonesLineas = (lineas: string[]): Interactivo =>
  botones("¿Qué estás buscando?", [...lineas.map((l) => ({ id: `l:${l}`, title: l })), ...(lineas.length < 3 ? [{ id: "m:menu", title: "Volver al menú" }] : [])]);

export const listaRubros = (linea: string, rubros: { nombre: string; modelos: number }[]): Interactivo =>
  lista(`Esto es lo que tenemos en ${linea.toLowerCase()}. Elegí un rubro para ver los modelos.`, "Elegir rubro",
    [...rubros.slice(0, 9).map((r) => ({ id: `r:${r.nombre}`, title: r.nombre, description: `${r.modelos} modelo${r.modelos === 1 ? "" : "s"} con stock` })), { id: "m:cat", title: "← Volver" }], linea);

export const listaModelos = (rubro: string, modelos: { id: number; nombre: string; marca: string | null; precio: string }[], hayMas: boolean): Interactivo =>
  lista(`${rubro}: elegí un modelo para ver talles, colores y disponibilidad.${hayMas ? " (Te muestro algunos; escribime si buscás uno puntual)." : ""}`, "Ver modelos",
    [...modelos.slice(0, 9).map((m) => ({ id: `p:${m.id}`, title: m.nombre, description: `${m.precio}${m.marca ? ` · ${m.marca}` : ""}` })), { id: "m:cat", title: "← Otros rubros" }], rubro);

export const botonesDespuesDelModelo = (rubro: string | null): Interactivo =>
  botones("¿Qué más querés hacer?", [...(rubro ? [{ id: `r:${rubro}`, title: `Más ${rubro.toLowerCase()}` }] : []), { id: "m:menu", title: "Menú principal" }, { id: "m:humano", title: "Hablar con alguien" }]);

export const botonesMenu = (cuerpo: string): Interactivo => botones(cuerpo, [{ id: "m:menu", title: "Menú principal" }]);

// ¿El mensaje es SOLO un saludo o pide el menú? («hola, ¿tienen camperas?» es una consulta: la contesta la IA)
const DISPARADORES = new Set(["hola", "holis", "hello", "hi", "buenas", "buen", "buenos", "menu", "opciones", "inicio", "ayuda", "empezar", "comenzar"]);
const RELLENO = new Set(["dia", "dias", "tardes", "noches", "que", "tal", "como", "estas", "todo", "bien", "a", "todos", "por", "favor", "el", "la", "de", "las", "los"]);
export function pideMenu(texto: string): boolean {
  const palabras = texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9ñ ]/g, " ").split(/\s+/).filter(Boolean);
  return palabras.length > 0 && palabras.length <= 6 && DISPARADORES.has(palabras[0]) && palabras.every((p) => DISPARADORES.has(p) || RELLENO.has(p));
}
