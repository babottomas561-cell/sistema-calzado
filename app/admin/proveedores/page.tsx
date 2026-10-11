import Contactos from "@/components/Contactos";
import { crearCliente } from "@/lib/supabase/server";

export default async function Proveedores() {
  const supabase = await crearCliente();
  const { data } = await supabase.from("proveedores").select("id, codigo, nombre, telefono, email, notas").order("nombre");
  return <Contactos tabla="proveedores" titulo="Proveedores" lista={data ?? []} />;
}
