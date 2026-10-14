// Listas de precios: el precio de lista se ajusta con un % y un redondeo, distinto para el mostrador y la tienda. Apagadas de fábrica.
import { crearCliente } from "@/lib/supabase/server";
import { exigir } from "@/lib/exigir";
import Volver from "@/components/Volver";
import Listas, { type Lista } from "./Listas";

export default async function PaginaListas() {
  await exigir("precios.editar");
  const supabase = await crearCliente();
  const [{ data: listas }, { data: config }, { data: modulo }] = await Promise.all([
    supabase.from("listas_precios").select("id, nombre, ajuste_pct, redondeo, activa").order("id"),
    supabase.from("configuracion_tienda").select("lista_mostrador_id, lista_tienda_id").single(),
    supabase.from("modulos").select("activo").eq("clave", "precios/listas").maybeSingle(),
  ]);
  return (
    <div className="max-w-3xl space-y-5">
      <Volver href="/admin/precios">Precios</Volver>
      <div><h1 className="text-2xl font-bold">Listas de precios</h1>
        <p className="text-sm text-texto-2">El precio de cada artículo es uno solo (el de Productos). Una lista lo sube o baja con un porcentaje y lo redondea: así el mostrador y la tienda pueden cobrar distinto sin cargar dos precios.</p></div>
      {config && <Listas listas={(listas ?? []).map((l) => ({ ...l, ajuste_pct: Number(l.ajuste_pct) })) as Lista[]} activas={modulo?.activo ?? false} mostrador={config.lista_mostrador_id} tienda={config.lista_tienda_id} />}
    </div>
  );
}
