// Bultos: las curvas guardadas para agregar de un toque al cargar una compra. Se arman desde la compra («Guardar lo cargado como bulto»).
import Link from "next/link";
import { crearCliente } from "@/lib/supabase/server";
import { exigir } from "@/lib/exigir";
import Volver from "@/components/Volver";
import ListaBultos, { type Bulto } from "./ListaBultos";

export default async function PaginaBultos() {
  await exigir("compras.registrar");
  const supabase = await crearCliente();
  const [{ data: bultos }, { data: items }, { data: variantes }, { data: proveedores }] = await Promise.all([
    supabase.from("bultos").select("id, nombre, proveedor_id").order("nombre"),
    supabase.from("bulto_items").select("bulto_id, variante_id, cantidad"),
    supabase.from("v_stock").select("variante_id, nombre, talle, color").limit(5000),
    supabase.from("proveedores").select("id, nombre"),
  ]);
  const porVariante = new Map((variantes ?? []).map((v) => [v.variante_id, `${v.nombre} · ${v.talle} · ${v.color}`]));
  const prov = new Map((proveedores ?? []).map((p) => [p.id, p.nombre]));
  const lista: Bulto[] = (bultos ?? []).map((b) => ({
    id: b.id, nombre: b.nombre, proveedor: b.proveedor_id ? prov.get(b.proveedor_id) ?? null : null,
    items: (items ?? []).filter((i) => i.bulto_id === b.id).map((i) => ({ texto: porVariante.get(i.variante_id) ?? "Producto", cantidad: i.cantidad })),
  }));
  return (
    <div className="max-w-3xl space-y-5">
      <Volver href="/admin/compras">Compras</Volver>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-bold">Bultos</h1>
          <p className="text-sm text-texto-2">Una curva cerrada que te vende el proveedor (por ejemplo «Caja de 12 jeans»). Al cargar una compra se agrega de un toque, ×1, ×2, ×3…</p></div>
        <Link href="/admin/compras/nueva" className="boton">Cargar una compra</Link>
      </div>
      <ListaBultos bultos={lista} />
    </div>
  );
}
