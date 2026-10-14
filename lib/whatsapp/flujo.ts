// Recorrido del menú de WhatsApp: qué se le contesta a cada opción que el cliente toca.
// Los datos salen de las vistas públicas (v_catalogo) y de la configuración de la tienda: lo mismo que ve cualquiera en la web.
import { createClient } from "@supabase/supabase-js";
import { pesos } from "@/lib/formato";
import type { Database } from "@/lib/database.types";
import { botonesDespuesDelModelo, botonesLineas, botonesMenu, listaModelos, listaRubros, menuPrincipal, type Mensaje } from "./menu";

const base = () => createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
const ORDEN_LINEAS = ["Calzado", "Ropa", "Accesorios"];

async function nombreTienda() {
  const { data } = await base().from("configuracion_tienda").select("nombre").single();
  return data?.nombre ?? "nuestro local";
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
    `📍 ${t?.direccion_retiro ?? "Consultá la dirección por acá"}`,
    `🕒 ${t?.horario ?? "Consultá los horarios por acá"}`,
    pagos.length ? `\n*Medios de pago*\n${pagos.join("\n")}` : "",
  ].filter(Boolean).join("\n");
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
  const { data } = await base().from("v_catalogo").select("producto_id, nombre, marca, precio").eq("categoria", rubro).gt("disponible", 0).limit(1000);
  const unicos = new Map<number, { id: number; nombre: string; marca: string | null; precio: string }>();
  for (const f of data ?? []) if (f.producto_id && !unicos.has(f.producto_id)) unicos.set(f.producto_id, { id: f.producto_id, nombre: f.nombre ?? "", marca: f.marca, precio: f.precio ? pesos(Number(f.precio)) : "Consultar" });
  return [...unicos.values()];
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
    return lineas.length ? [{ interactivo: botonesLineas(lineas) }] : [{ texto: "Por ahora no tenemos productos publicados con stock. ¡Volvé a consultarnos pronto!" }, { interactivo: menuPrincipal(await nombreTienda()) }];
  }
  if (tipo === "l") {
    const rubros = await rubrosDeLinea(valor);
    return rubros.length ? [{ interactivo: listaRubros(valor, rubros) }] : [{ texto: `No tenemos ${valor.toLowerCase()} con stock en este momento.` }, { interactivo: botonesMenu("¿Querés ver otra cosa?") }];
  }
  if (tipo === "r") {
    const modelos = await modelosDeRubro(valor);
    return modelos.length ? [{ interactivo: listaModelos(valor, modelos, modelos.length > 9) }] : [{ texto: `No tenemos ${valor.toLowerCase()} con stock en este momento.` }, { interactivo: botonesMenu("¿Querés ver otra cosa?") }];
  }
  if (tipo === "p") {
    const d = Number(valor) ? await detalleDeModelo(Number(valor), sitio) : null;
    return d ? [{ texto: d.texto }, { interactivo: botonesDespuesDelModelo(d.rubro) }] : [{ texto: "Ese modelo se quedó sin stock. ¡Mirá el resto de las opciones!" }, { interactivo: botonesMenu("¿Seguimos?") }];
  }
  if (tipo === "m" && valor === "info") return [{ texto: await datosDelLocal() }, { interactivo: botonesMenu("¿Te ayudo con algo más?") }];
  if (tipo === "m" && valor === "pedido") return [{ texto: "Escribime el *número de tu pedido* (por ejemplo, 0001-00000015) y te cuento en qué estado está. Tiene que ser el pedido hecho con este mismo número de WhatsApp." }];
  if (tipo === "m" && valor === "humano") return [{ texto: "Listo, ya le avisamos al equipo. En cuanto puedan, te responden por acá. 🙌" }, { interactivo: botonesMenu("Mientras tanto, podés seguir mirando:") }];
  return [{ interactivo: menuPrincipal(await nombreTienda()) }];   // «m:menu» y cualquier opción vieja o desconocida
}
