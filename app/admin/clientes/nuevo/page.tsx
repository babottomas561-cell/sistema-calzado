import FichaForm from "../FichaForm";
import { exigir } from "@/lib/exigir";

export default async function NuevoCliente() {
  await exigir("clientes.editar");
  return <div className="max-w-2xl space-y-4"><h1 className="text-2xl font-bold">Nuevo cliente</h1><FichaForm /></div>;
}
