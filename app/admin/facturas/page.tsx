// Las facturas viven en Ventas (filtro «Con factura» / «Sin factura» y el libro IVA): esta dirección queda por si alguien la tenía guardada.
import { redirect } from "next/navigation";

export default function Facturas() {
  redirect("/admin/ventas?factura=con");
}
