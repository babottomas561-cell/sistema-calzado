// Curvas de compra: la distribución de talles con la que se compra, por escala. Al cargar una compra se aplica «curva ×N» a un modelo.
import Link from "next/link";
import { crearCliente } from "@/lib/supabase/server";
import { exigir } from "@/lib/exigir";
import Volver from "@/components/Volver";
import Curvas, { type Curva } from "./Curvas";

export default async function PaginaCurvas() {
  await exigir("compras.registrar");
  const supabase = await crearCliente();
  const [{ data: curvas }, { data: items }, { data: talles }, { data: proveedores }] = await Promise.all([
    supabase.from("curvas").select("id, nombre, escala, proveedor_id").order("nombre"),
    supabase.from("curva_items").select("curva_id, talle_id, cantidad"),
    supabase.from("talles").select("id, nombre, tipo, orden").order("orden"),
    supabase.from("proveedores").select("id, nombre").order("nombre"),
  ]);
  const lista: Curva[] = (curvas ?? []).map((c) => ({ ...c, items: (items ?? []).filter((i) => i.curva_id === c.id).map((i) => ({ talle_id: i.talle_id, cantidad: i.cantidad })) }));
  return (
    <div className="max-w-3xl space-y-5">
      <Volver href="/admin/compras">Compras</Volver>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-bold">Curvas de compra</h1>
          <p className="text-sm text-texto-2">La distribución de talles con la que comprás (por ejemplo, 1 del 39, 2 del 40, 2 del 41, 1 del 42). Vale para cualquier artículo de esa escala: al cargar una compra la aplicás a un modelo, ×1, ×2, ×3…</p></div>
        <Link href="/admin/compras/nueva" className="boton">Cargar una compra</Link>
      </div>
      <Curvas curvas={lista} talles={talles ?? []} proveedores={proveedores ?? []} />
    </div>
  );
}
