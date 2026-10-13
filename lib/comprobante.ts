// Comprobantes (venta, presupuesto, devolución): cómo llega el JSON que arma la base, las medidas del papel, el texto para mandar por WhatsApp
// y un comprobante de ejemplo para la vista previa. Sin dependencias: lo usan el navegador, el servidor y las pruebas (lib/comprobante.test.ts).

export type FormatoComprobante = "ticket80" | "ticket58" | "a4";
// ancho: el del papel; contenido: lo que de verdad imprime una térmica (72 y 48 mm en las de 80 y 58) para no cortar los bordes
export const FORMATOS: Record<FormatoComprobante, { nombre: string; ancho: number; contenido: number; detalle: string }> = {
  ticket80: { nombre: "Ticket 80 mm", ancho: 80, contenido: 72, detalle: "Impresora térmica de rollo ancho (la más común en comercios)" },
  ticket58: { nombre: "Ticket 58 mm", ancho: 58, contenido: 48, detalle: "Impresora térmica chica o portátil" },
  a4: { nombre: "Hoja A4", ancho: 210, contenido: 180, detalle: "Impresora común, para guardar o presentar" },
};
export const esFormato = (x: unknown): x is FormatoComprobante => x === "ticket80" || x === "ticket58" || x === "a4";

export const TIPOS_COMPROBANTE = ["venta", "presupuesto", "devolucion"] as const;
export type TipoComprobante = (typeof TIPOS_COMPROBANTE)[number];
export const esTipo = (x: unknown): x is TipoComprobante => (TIPOS_COMPROBANTE as readonly unknown[]).includes(x);

export type Renglon = { detalle: string; marca: string | null; variante: string; cantidad: number; precio: number | null; promocion: string | null; descuento: number; subtotal: number };
export type PagoComprobante = { medio: string; base: number; ajuste_pct: number; ajuste: number; monto: number; cuotas: number; referencia: string | null };
export type Emisor = { nombre: string; logo_url: string | null; es_icono?: boolean; razon_social: string | null; cuit: string | null; condicion_iva: string | null; domicilio: string | null; telefono: string | null; email: string | null; local: string | null };
export type ModoImpresion = "automatica" | "opcional" | "manual";
export const MODOS_IMPRESION: Record<ModoImpresion, { nombre: string; detalle: string }> = {
  automatica: { nombre: "Automática", detalle: "Al confirmar la venta, el comprobante sale solo por la impresora." },
  opcional: { nombre: "Opcional", detalle: "Al confirmar, la caja pregunta: imprimir, mandarlo por WhatsApp o mail, o seguir sin comprobante." },
  manual: { nombre: "Manual", detalle: "No se ofrece nada al vender: se imprime o se manda después, desde la venta." },
};
export type LetraComprobante = "chica" | "normal" | "grande";
export const LETRAS: Record<LetraComprobante, { nombre: string; escala: number }> = { chica: { nombre: "Chica", escala: 0.88 }, normal: { nombre: "Normal", escala: 1 }, grande: { nombre: "Grande", escala: 1.15 } };
export type ConfigComprobante = {
  formato: FormatoComprobante; logo: boolean; datos_legales: boolean; qr: boolean; barras: boolean; copias: number;
  modo: ModoImpresion; configurado: boolean; letra: LetraComprobante; encabezado: string | null;
  mostrar_cliente: boolean; mostrar_vendedor: boolean; mostrar_marca: boolean;
};
// La factura de ARCA de una venta (si tiene): con ella el comprobante pasa a ser fiscal (letra, CAE y QR de ARCA)
export type Fiscal = {
  estado: "pendiente" | "autorizada" | "rechazada" | "error" | "cancelada"; letra: "A" | "B" | "C"; codigo: string; comprobante: string | null; fecha: string;
  cae: string | null; cae_vence: string | null; receptor: string; doc_tipo: number; doc_nro: string; condicion_receptor: string;
  neto: number; iva: number; detalle_iva: { alicuota: number; base: number; iva: number }[]; total: number; iva_contenido_en_c: "leyenda" | "cero"; pruebas: boolean;
  qr: string | null;
  emisor: { razon_social: string | null; cuit: string | null; condicion_iva: string | null; ingresos_brutos: string | null; inicio_actividades: string | null; domicilio: string | null };
  nota_credito: { estado: string; letra: string; codigo: string; comprobante: string | null; cae: string | null; cae_vence: string | null; fecha: string } | null;
};
// Autorizada = el comprobante es la factura; si no, sigue siendo el interno
export const esFactura = (c: Comprobante) => c.fiscal?.estado === "autorizada";
// Lo que se lee arriba: «Factura B» o el título interno
export const tituloDe = (c: Comprobante) => (esFactura(c) ? `Factura ${c.fiscal!.letra}` : c.titulo);
export const numeroDe = (c: Comprobante) => (esFactura(c) && c.fiscal!.comprobante ? c.fiscal!.comprobante : c.numero);

export type Comprobante = {
  fiscal?: Fiscal | null;
  tipo: TipoComprobante; titulo: string; numero: string; fecha: string; anulada: boolean;
  cliente: string | null; atendio: string | null; origen: string | null;
  renglones: Renglon[]; totales: { rotulo: string; monto: number; fuerte?: boolean }[]; pagos: PagoComprobante[]; saldo: number;
  emisor: Emisor; config: ConfigComprobante; leyenda: string | null; pie: string | null;
  enlace?: { token?: string; ruta?: string; url?: string | null };
};

// Lo que devuelve la base viene como json cualquiera: se revisa lo esencial para no romper la pantalla si falta algo
export function leerComprobante(x: unknown): Comprobante | null {
  if (!x || typeof x !== "object") return null;
  const c = x as Partial<Comprobante>;
  if (!c.numero || !Array.isArray(c.renglones) || !Array.isArray(c.totales) || !c.emisor || !c.config) return null;
  return {
    ...c, titulo: c.titulo ?? "Comprobante", fecha: c.fecha ?? "", anulada: !!c.anulada, cliente: c.cliente ?? null, atendio: c.atendio ?? null, origen: c.origen ?? null,
    pagos: c.pagos ?? [], saldo: Number(c.saldo ?? 0), leyenda: c.leyenda ?? null, pie: c.pie ?? null,
    config: {
      ...c.config, formato: esFormato(c.config.formato) ? c.config.formato : "ticket80", copias: Math.min(5, Math.max(1, Number(c.config.copias) || 1)),
      modo: (["automatica", "opcional", "manual"] as const).includes(c.config.modo) ? c.config.modo : "opcional", configurado: !!c.config.configurado,
      letra: (["chica", "normal", "grande"] as const).includes(c.config.letra) ? c.config.letra : "normal", encabezado: c.config.encabezado ?? null,
      mostrar_cliente: c.config.mostrar_cliente !== false, mostrar_vendedor: c.config.mostrar_vendedor !== false, mostrar_marca: c.config.mostrar_marca !== false,
    },
  } as Comprobante;
}

// El total del comprobante: el último renglón destacado de los totales
export const totalDe = (c: Comprobante) => c.totales.find((t) => t.fuerte)?.monto ?? c.totales.at(-1)?.monto ?? 0;

// El importe de un renglón antes de la promoción (que se muestra aparte, abajo): así lo que se ve suma lo que dice el subtotal.
// En una devolución no hay precio de lista: es lo que se devolvió.
export const importeRenglon = (r: Renglon) => (r.precio != null ? r.cantidad * r.precio : r.subtotal);

// El texto que se manda por WhatsApp con el link (con *negrita* de WhatsApp)
export function mensajeWhatsApp(c: Comprobante, url: string, pesos: (n: number) => string): string {
  const nombre = c.cliente?.split(" ")[0];
  const cosa = c.tipo === "presupuesto" ? "el presupuesto" : c.tipo === "devolucion" ? "el comprobante de tu devolución" : "tu comprobante";
  return [
    `¡Hola${nombre ? ` ${nombre}` : ""}! Te paso ${cosa} *${c.numero}* de ${c.emisor.nombre}.`,
    `${c.tipo === "devolucion" ? "Saldo a favor" : "Total"}: *${pesos(totalDe(c))}*`,
    "", url, "",
    c.tipo === "venta" ? "¡Gracias por tu compra!" : "Cualquier duda, escribinos.",
  ].join("\n");
}

// ── El papel ──────────────────────────────────────────────────────────
export const MM_A_PX = 96 / 25.4;   // 1 mm de CSS en píxeles

// El tamaño de página que se le pide al navegador. Un ticket es un rollo continuo: Chrome no entiende «80mm auto» (cae a Carta), así que se
// mide lo que ocupa el comprobante y se pide ese alto justo. La hoja A4 fluye en las páginas que necesite.
export function cssDePagina(formato: FormatoComprobante, altoMm?: number): string {
  if (formato === "a4") return "@page{size:A4;margin:0}";
  const alto = Math.max(40, Math.ceil(altoMm ?? 150) + 2);
  return `@page{size:${FORMATOS[formato].ancho}mm ${alto}mm;margin:0}`;
}

// ── Vista previa en Impresión ─────────────────────────────────────────
// Un comprobante inventado para ver cómo queda con lo que se prendió y apagó (nunca se guarda ni se manda)
export function comprobanteDeEjemplo(emisor: Emisor, config: ConfigComprobante, textos: { leyenda: string | null; pie: string | null }): Comprobante {
  return {
    tipo: "venta", titulo: "Comprobante de venta", numero: "0001-00000123", fecha: new Date().toISOString(), anulada: false, cliente: "María González", atendio: "Caro", origen: null,
    renglones: [
      { detalle: "Camisa lino slim", marca: "Gabardina", variante: "Talle M · Blanco", cantidad: 1, precio: 45000, promocion: null, descuento: 0, subtotal: 45000 },
      { detalle: "Jean recto clásico", marca: null, variante: "Talle 42 · Azul oscuro", cantidad: 2, precio: 38000, promocion: "2da unidad −50 %", descuento: 19000, subtotal: 57000 },
      { detalle: "Cinto de cuero", marca: null, variante: "Talle Único · Marrón", cantidad: 1, precio: 12500, promocion: null, descuento: 0, subtotal: 12500 },
    ],
    totales: [{ rotulo: "Subtotal", monto: 133500 }, { rotulo: "Promociones", monto: -19000 }, { rotulo: "Descuento por medio de pago", monto: -6000 }, { rotulo: "Total", monto: 108500, fuerte: true }],
    pagos: [{ medio: "Efectivo", base: 60000, ajuste_pct: -10, ajuste: -6000, monto: 54000, cuotas: 1, referencia: null }, { medio: "Tarjeta de crédito", base: 54500, ajuste_pct: 0, ajuste: 0, monto: 54500, cuotas: 3, referencia: "Cupón 8123" }],
    saldo: 0, emisor, config, leyenda: textos.leyenda, pie: textos.pie, enlace: { ruta: "/comprobante/ejemplo" },
  };
}
