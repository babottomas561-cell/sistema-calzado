// Los módulos pasaron a Parametrización (qué usa el local, sí o no).
import { redirect } from "next/navigation";

export default function PaginaModulos() {
  redirect("/admin/parametrizacion");
}
