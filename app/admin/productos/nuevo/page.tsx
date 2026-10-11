import { leerMaestros } from "@/lib/maestros";
import FormNuevo from "./FormNuevo";
import { exigir } from "@/lib/exigir";

export default async function NuevoProducto() {
  const { permisos } = await exigir("productos.editar");
  return <FormNuevo {...await leerMaestros()} editaPrecio={permisos.includes("precios.editar")} />;
}
