// Estilos de la tienda que elige el dueño (configuracion_tienda.estilo). Cada uno es un juego de variables en globals.css
// (bloque «ESTILOS»): la tienda pone data-estilo en su raíz y las secciones usan .titular, así cambia sin tocar el contenido.
export const ESTILOS = {
  clasico: { nombre: "Clásico", ayuda: "Letra gruesa y moderna, con movimiento al bajar. El de siempre." },
  editorial: { nombre: "Editorial", ayuda: "Serif fina, mucho aire y casi nada de movimiento. Sobrio, tipo revista de moda." },
  urbano: { nombre: "Urbano", ayuda: "Letra angosta en mayúsculas, alto contraste y bordes rectos. Más streetwear." },
} as const;
export type Estilo = keyof typeof ESTILOS;
export const esEstilo = (v: unknown): v is Estilo => typeof v === "string" && v in ESTILOS;
