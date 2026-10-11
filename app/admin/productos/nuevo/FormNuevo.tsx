"use client";
import { useActionState } from "react";
import { crearProducto } from "../acciones";
import CamposProducto, { type Maestros } from "../CamposProducto";
import ElegirTallesColores, { type Color, type Talle } from "../ElegirTallesColores";

export default function FormNuevo({ maestros, talles, colores, editaPrecio }: { maestros: Maestros; talles: Talle[]; colores: Color[]; editaPrecio: boolean }) {
  const [estado, accion, cargando] = useActionState(crearProducto, {});
  return (
    <form action={accion} className="max-w-2xl space-y-5">
      <h1 className="text-2xl font-bold">Nuevo producto</h1>
      <div className="tarjeta"><CamposProducto maestros={maestros} editaPrecio={editaPrecio} /></div>
      <div className="tarjeta space-y-4">
        <div>
          <h2 className="font-semibold">Talles y colores</h2>
          <p className="text-sm text-texto-2">Se crea una variante (SKU) por cada combinación, cada una con su propio stock. El stock se carga después con una compra.</p>
        </div>
        <ElegirTallesColores talles={talles} colores={colores} />
      </div>
      <p className="text-sm text-texto-2">Las fotos se agregan en la ficha del producto, apenas lo creás.</p>
      {estado.error && <p className="text-sm text-error">{estado.error}</p>}
      <button className="boton" disabled={cargando}>{cargando ? "Guardando…" : "Crear producto"}</button>
    </form>
  );
}
