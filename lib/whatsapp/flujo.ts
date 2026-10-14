// Recorrido del menú de WhatsApp: qué se le contesta a cada opción que el cliente toca.
// Los datos salen de las vistas públicas (v_catalogo) y de la configuración de la tienda: lo mismo que ve cualquiera en la web.
import { createClient } from "@supabase/supabase-js";
import { pesos } from "@/lib/formato";
import type { Database } from "@/lib/database.types";
import { botonesDespuesDelModelo, botonesLineas, botonesMenu, listaDeModelos, listaModelos, listaRubros, menuPrincipal, POR_PAGINA, type Mensaje } from "./menu";

const base = () => createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
const ORDEN_LINEAS = ["Calzado", "Ropa", "Accesorios"];

async function nombreTienda() {
  const { data } = await base().from("configuracion_tienda").select("nombre").single();
  return data?.nombre ?? "nuestro local";
}

type ModeloLista = { id: number; nombre: string; marca: string | null; precio: string; extra?: string | null };
const aModelos = (filas: { producto_id: number | null; nombre: string | null; marca: string | null; precio: number | null }[], extras?: Map<number, string>): ModeloLista[] => {
  const unicos = new Map<number, ModeloLista>();
  for (const f of filas) if (f.producto_id && !unicos.has(f.producto_id)) unicos.set(f.producto_id, { id: f.producto_id, nombre: f.nombre ?? "", marca: f.marca, precio: f.precio ? pesos(Number(f.precio)) : "Consultar", extra: extras?.get(f.producto_id) ?? null });
  return [...unicos.values()];
};

/** Lo último que se cargó (con stock), el más nuevo primero. */
async function novedades(): Promise<ModeloLista[]> {
  const { data } = await base().from("v_catalogo").select("producto_id, nombre, marca, precio, creado_en").gt("disponible", 0).order("creado_en", { ascending: false }).limit(200);
  return aModelos(data ?? []).slice(0, 9);
}

/** Productos con una promoción vigente y stock, con su etiqueta («2x1», «20% OFF»…). */
async function conPromocion(): Promise<ModeloLista[]> {
  const supabase = base();
  const { data: promos } = await supabase.from("v_promos_tienda").select("producto_id, etiqueta").limit(200);
  const ids = [...new Set((promos ?? []).map((p) => p.producto_id).filter((x): x is number => !!x))];
  if (!ids.length) return [];
  const etiquetas = new Map((promos ?? []).filter((p) => p.producto_id && p.etiqueta).map((p) => [p.producto_id as number, p.etiqueta as string]));
  const { data } = await supabase.from("v_catalogo").select("producto_id, nombre, marca, precio").in("producto_id", ids).gt("disponible", 0).limit(500);
  return aModelos(data ?? [], etiquetas).slice(0, 9);
}

async function menuDeInicio() {
  const [nombre, nuevos, promos] = await Promise.all([nombreTienda(), novedades(), conPromocion()]);
  return menuPrincipal(nombre, { novedades: nuevos.length > 0, promos: promos.length > 0 });
}

async function datosDelLocal(): Promise<string> {
  const supabase = base();
  const [{ data: t }, { data: medios }] = await Promise.all([
    supabase.from("configuracion_tienda").select("nombre, direccion_retiro, horario, whatsapp").single(),
    supabase.from("medios_pago").select("nombre, ajuste_pct, cuotas").eq("en_tienda", true).eq("activo", true),
  ]);
  const pagos = (medios ?? []).map((m) => {
    let d = `• ${m.nombre}`;
    if (m.ajuste_pct && m.ajuste_pct < 0) d += ` (${Math.abs(m.ajuste_pct)}% OFF)`;
    if (m.ajuste_pct && m.ajuste_pct > 0) d += ` (+${m.ajuste_pct}% recargo)`;
    if (m.cuotas && m.cuotas > 1) d += ` hasta en ${m.cuotas} cuotas`;
    return d;
  });
  return [
    `*${t?.nombre ?? "Nuestro local"}*`,
    t?.direccion_retiro ? `📍 ${t.direccion_retiro}` : "",
    t?.horario ? `🕒 ${t.horario}` : "",
    pagos.length ? `\n*Medios de pago*\n${pagos.join("\n")}` : "",
  ].filter(Boolean).join("\n") + (t?.direccion_retiro || t?.horario ? "" : "\n\nLa dirección y los horarios te los pasamos por acá: escribinos o pedí hablar con una persona.");
}

async function lineasConStock(): Promise<string[]> {
  const { data } = await base().from("v_catalogo").select("linea").gt("disponible", 0).limit(2000);
  const hay = new Set((data ?? []).map((f) => f.linea).filter(Boolean) as string[]);
  return ORDEN_LINEAS.filter((l) => hay.has(l)).concat([...hay].filter((l) => !ORDEN_LINEAS.includes(l))).slice(0, 3);
}

async function rubrosDeLinea(linea: string) {
  const { data } = await base().from("v_catalogo").select("producto_id, categoria").eq("linea", linea).gt("disponible", 0).limit(2000);
  const porRubro = new Map<string, Set<number>>();
  for (const f of data ?? []) if (f.categoria && f.producto_id) (porRubro.get(f.categoria) ?? porRubro.set(f.categoria, new Set()).get(f.categoria)!).add(f.producto_id);
  return [...porRubro.entries()].map(([nombre, ids]) => ({ nombre, modelos: ids.size })).sort((a, b) => b.modelos - a.modelos || a.nombre.localeCompare(b.nombre));
}

async function modelosDeRubro(rubro: string) {
  const { data } = await base().from("v_catalogo").select("producto_id, nombre, marca, precio").eq("categoria", rubro).gt("disponible", 0).order("nombre").limit(1000);
  return aModelos(data ?? []);
}

async function detalleDeModelo(id: number, sitio: string): Promise<{ texto: string; rubro: string | null } | null> {
  const { data } = await base().from("v_catalogo").select("nombre, marca, categoria, precio, talle, talle_orden, color, disponible").eq("producto_id", id).gt("disponible", 0).limit(500);
  if (!data || data.length === 0) return null;
  const porColor = new Map<string, { talle: string; orden: number }[]>();
  for (const f of data) (porColor.get(f.color ?? "") ?? porColor.set(f.color ?? "", []).get(f.color ?? "")!).push({ talle: f.talle ?? "", orden: f.talle_orden ?? 0 });
  const colores = [...porColor.entries()].map(([color, ts]) => `• ${color || "Único"}: ${ts.sort((a, b) => a.orden - b.orden).map((t) => t.talle).join(", ")}`);
  const f = data[0];
  const texto = [
    `*${f.nombre}*${f.marca ? ` — ${f.marca}` : ""}`,
    f.precio ? pesos(Number(f.precio)) : "",
    `\n*Talles disponibles por color*\n${colores.join("\n")}`,
    `\nVerlo con fotos y comprarlo: ${sitio}/producto/${id}`,
  ].filter(Boolean).join("\n");
  return { texto, rubro: f.categoria ?? null };
}

/** Lo que se le contesta al cliente cuando toca una opción (o pide el menú). Cada elemento es un mensaje, en orden. */
export async function respuestasDeMenu(opcion: string, sitio: string): Promise<Mensaje[]> {
  const [tipo, ...resto] = opcion.split(":");
  const valor = resto.join(":");

  if (tipo === "m" && valor === "cat") {
    const lineas = await lineasConStock();
    return lineas.length ? [{ interactivo: botonesLineas(lineas) }] : [{ texto: "Por ahora no tenemos productos publicados con stock. ¡Volvé a consultarnos pronto!" }, { interactivo: await menuDeInicio() }];
  }
  if (tipo === "l") {
    const rubros = await rubrosDeLinea(valor);
    return rubros.length ? [{ interactivo: listaRubros(valor, rubros) }] : [{ texto: `No tenemos ${valor.toLowerCase()} con stock en este momento.` }, { interactivo: botonesMenu("¿Querés ver otra cosa?") }];
  }
  if (tipo === "r") {
    const [rubro, pag] = valor.split("|");   // «Camisa» o «Camisa|1» (segunda página)
    const modelos = await modelosDeRubro(rubro);
    const pagina = Math.min(Math.max(Number(pag) || 0, 0), Math.max(Math.ceil(modelos.length / POR_PAGINA) - 1, 0));
    return modelos.length ? [{ interactivo: listaModelos(rubro, modelos, pagina) }] : [{ texto: `No tenemos ${rubro.toLowerCase()} con stock en este momento.` }, { interactivo: botonesMenu("¿Querés ver otra cosa?") }];
  }
  if (tipo === "m" && valor === "nuevo") {
    const lista = await novedades();
    return lista.length ? [{ interactivo: listaDeModelos("Esto es lo último que llegó. Elegí uno para ver talles y colores.", "Ver novedades", lista, "Novedades") }] : [{ interactivo: botonesMenu("Por ahora no hay novedades para mostrar.") }];
  }
  if (tipo === "m" && valor === "promo") {
    const lista = await conPromocion();
    return lista.length ? [{ interactivo: listaDeModelos("Estas son las promociones vigentes. Elegí un modelo para ver talles y colores.", "Ver promociones", lista, "Promociones") }] : [{ interactivo: botonesMenu("Por ahora no hay promociones vigentes.") }];
  }
  if (tipo === "m" && valor === "nosoporta") return [{ texto: "Por ahora no puedo ver audios, fotos ni archivos. 🙈 Escribime tu consulta o elegí una opción:" }, { interactivo: await menuDeInicio() }];
  if (tipo === "p") {
    const d = Number(valor) ? await detalleDeModelo(Number(valor), sitio) : null;
    return d ? [{ texto: d.texto }, { interactivo: botonesDespuesDelModelo(d.rubro) }] : [{ texto: "Ese modelo se quedó sin stock. ¡Mirá el resto de las opciones!" }, { interactivo: botonesMenu("¿Seguimos?") }];
  }
  if (tipo === "m" && valor === "comprar") return [{ texto: [
    "¡Buenísimo! El pedido se hace en nuestra tienda online, y *antes tenés que crearte una cuenta* (es rápido: así te reservamos los productos y seguís tu pedido).",
    "",
    "1. Creá tu cuenta (o ingresá si ya tenés):",
    `${sitio}/registro?volver=/carrito`,
    "",
    "2. Elegí lo que te gusta:",
    `${sitio}/tienda`,
    "",
    "3. Confirmá el pedido: lo reservamos y te avisamos cuando esté listo.",
  ].join("\n") }, { interactivo: botonesMenu("¿Te ayudo con algo más?") }];
  if (tipo === "m" && valor === "info") return [{ texto: await datosDelLocal() }, { interactivo: botonesMenu("¿Te ayudo con algo más?") }];
  if (tipo === "m" && valor === "pedido") return [{ texto: "Escribime el *número de tu pedido* (por ejemplo, 0001-00000015) y te cuento en qué estado está. Tiene que ser el pedido hecho con este mismo número de WhatsApp." }];
  if (tipo === "m" && valor === "humano") return [{ texto: "Listo, ya le avisamos al equipo. En cuanto puedan, te responden por acá. 🙌" }, { interactivo: botonesMenu("Mientras tanto, podés seguir mirando:") }];
  return [{ interactivo: await menuDeInicio() }];   // «m:menu» y cualquier opción vieja o desconocida
}
