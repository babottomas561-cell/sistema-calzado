// Promociones: 2×1, 2do al X %, % off, precio especial. Las aplica la base (cotizar) en la tienda,
// los pedidos y el punto de venta, siempre con las mismas reglas (docs/PROMOCIONES.md).
import { exigir } from "@/lib/exigir";
import ListaPromociones from "./ListaPromociones";
import type { Promocion } from "./FormPromocion";

const etiqueta = (p: Promocion) =>
  p.tipo === "nxm" ? `${p.lleva}×${p.paga}` : p.tipo === "segunda_unidad" ? (Number(p.descuento_pct) === 100 ? "2do gratis" : `2do ${Number(p.descuento_pct)}%`)
  : p.tipo === "porcentaje" ? `${Number(p.descuento_pct)}%` : "$";

// El estado (vigente, programada…) depende de la hora del pedido: se calcula una vez por página
const ahora = () => Date.now();

export default async function Promociones() {
  const momento = ahora();
  const { supabase } = await exigir("promociones.gestionar");
  const [{ data: promos }, { data: marcas }, { data: rubros }, { data: subrubros }, { data: productos }] = await Promise.all([
    supabase.from("promociones").select("*, promocion_alcances(marca_id, categoria_id, subcategoria_id, producto_id, excluir)")
      .order("activa", { ascending: false }).order("creado_en", { ascending: false }),
    supabase.from("marcas").select("id, nombre").order("nombre"),
    supabase.from("categorias").select("id, nombre").order("nombre"),
    supabase.from("subcategorias").select("id, nombre").order("nombre"),
    supabase.from("productos").select("id, nombre").eq("activo", true).order("nombre"),
  ]);
  const nombres = (lista: { id: number; nombre: string }[] | null) => new Map((lista ?? []).map((x) => [x.id, x.nombre]));
  const [nm, nr, ns, np] = [nombres(marcas), nombres(rubros), nombres(subrubros), nombres(productos)];

  const filas = (promos ?? []).map((p) => {
    const al = p.promocion_alcances;
    const incluye = [...al.filter((a) => !a.excluir).map((a) =>
      a.marca_id ? nm.get(a.marca_id) : a.categoria_id ? nr.get(a.categoria_id) : a.subcategoria_id ? ns.get(a.subcategoria_id) : np.get(a.producto_id!))];
    const excluye = al.filter((a) => a.excluir).map((a) => np.get(a.producto_id!));
    const estado = !p.activa ? "pausada" : p.hasta && new Date(p.hasta).getTime() <= momento ? "terminada"
      : p.desde && new Date(p.desde).getTime() > momento ? "programada" : "vigente";
    return { ...p, descuento_pct: p.descuento_pct === null ? null : Number(p.descuento_pct), precio_fijo: p.precio_fijo === null ? null : Number(p.precio_fijo),
      etiqueta: etiqueta(p as Promocion), estado: estado as "vigente" | "programada" | "terminada" | "pausada",
      alcance: incluye.filter(Boolean).join(", ") + (excluye.length ? ` (menos ${excluye.join(", ")})` : "") };
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Promociones</h1>
        <p className="text-sm text-texto-2">Se aplican solas en la tienda, en los pedidos y al vender en el local. Un par tiene una sola promoción: si dos podrían tocarlo, gana la de mayor prioridad.</p>
      </div>
      <ListaPromociones promos={filas as never} opciones={{ marcas: marcas ?? [], rubros: rubros ?? [], subrubros: subrubros ?? [], productos: productos ?? [] }} />
    </div>
  );
}
