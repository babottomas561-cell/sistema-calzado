import { leerMaestros } from "@/lib/maestros";
import FormNuevo from "./FormNuevo";

export default async function NuevoProducto() {
  return <FormNuevo {...await leerMaestros()} />;
}
