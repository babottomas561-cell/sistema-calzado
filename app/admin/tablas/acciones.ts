"use server";
// Alta, edición y baja de las tablas maestras (marcas, rubros, subrubros, colores, talles).
// El código, si queda vacío, lo genera la base (NIK, ZAP, ZAP-RUN, NEG).
import { revalidatePath } from "next/cache";
import { crearCliente } from "@/lib/supabase/server";

export type Estado = { error?: string; ok?: string };
const TABLAS = ["marcas", "categorias", "subcategorias", "colores", "talles", "medios_pago"] as const;
type Tabla = (typeof TABLAS)[number];

const texto = (f: FormData, campo: string) => String(f.get(campo) ?? "").trim();

// Cada tabla guarda sus propios campos (nunca se toma un campo que no corresponda)
function datos(tabla: Tabla, f: FormData) {
  switch (tabla) {
    case "marcas": return { nombre: texto(f, "nombre"), codigo: texto(f, "codigo").toUpperCase() };
    case "categorias": return { nombre: texto(f, "nombre"), codigo: texto(f, "codigo").toUpperCase(), linea: texto(f, "linea") || "Calzado" };
    case "subcategorias": return { nombre: texto(f, "nombre"), codigo: texto(f, "codigo").toUpperCase(), categoria_id: Number(f.get("categoria_id")) };
    case "colores": return { nombre: texto(f, "nombre"), codigo: texto(f, "codigo").toUpperCase(), hex: texto(f, "hex") || null };
    case "talles": return { nombre: texto(f, "nombre"), orden: Number(f.get("orden")), tipo: texto(f, "tipo") || "Adulto" };
    case "medios_pago": return {
      nombre: texto(f, "nombre"), codigo: texto(f, "codigo").toUpperCase(), tipo: texto(f, "tipo") || "Otro",
      // En pantalla se carga "descuento" o "recargo" en positivo; en la base, descuento = negativo
      ajuste_pct: (f.get("signo") === "descuento" ? -1 : 1) * Math.abs(Number(f.get("porcentaje") ?? 0)),
      cuotas: Math.max(1, Number(f.get("cuotas") ?? 1)), orden: Number(f.get("orden") ?? 0),
      en_mostrador: f.get("en_mostrador") === "on", en_tienda: f.get("en_tienda") === "on", activo: f.get("activo") === "on",
    };
  }
}

// Los errores de Postgres, en castellano y sin jerga
function traducir(mensaje: string, codigo?: string) {
  if (codigo === "23505") return "Ya existe uno con ese nombre o código";
  if (codigo === "23503") return "No se puede borrar: está en uso. Si ya no va, desactivalo";
  if (codigo === "23514") return "Algún dato no es válido (el color va como #RRGGBB; el % entre 0 y 100)";
  return mensaje;
}

export async function guardarMaestro(_: Estado, f: FormData): Promise<Estado> {
  const tabla = String(f.get("tabla")) as Tabla;
  if (!TABLAS.includes(tabla)) return { error: "Tabla desconocida" };
  const id = Number(f.get("id")) || null;
  const supabase = await crearCliente();
  let error;

  if (f.get("_accion") === "borrar" && id) {
    ({ error } = await supabase.from(tabla).delete().eq("id", id));
  } else if (!id && tabla === "talles") {
    // Talle nuevo: la base calcula el orden (38.5 entre 38 y 39; S, M, L al final); la escala, si no se elige,
    // la deduce (menos de 35 = Niños, letras = Ropa letras)
    if (!texto(f, "nombre")) return { error: "Falta el talle" };
    ({ error } = await supabase.rpc("buscar_talle", { p_nombre: texto(f, "nombre"), p_escala: texto(f, "tipo") || undefined }));
  } else {
    const fila = datos(tabla, f);
    if (!fila.nombre) return { error: "Falta el nombre" };
    // `as never`: la unión de las 5 tablas no la puede tipar TypeScript; cada `datos()` ya es la correcta
    ({ error } = id ? await supabase.from(tabla).update(fila as never).eq("id", id) : await supabase.from(tabla).insert(fila as never));
  }
  if (error) return { error: traducir(error.message, error.code) };
  revalidatePath("/admin/tablas");
  return { ok: f.get("_accion") === "borrar" ? "Borrado" : "Guardado" };
}

