// Dominio propio: que la tienda se vea en mitienda.com.ar. Solo el Administrador.
import { crearCliente } from "@/lib/supabase/server";
import { exigir } from "@/lib/exigir";
import Encabezado from "../Encabezado";
import Manual from "../Manual";
import Dominio, { type Dom, type EstadoDom } from "./Dominio";
import { sitio } from "../sitio";

export default async function PaginaDominio() {
  await exigir("equipo.administrar");
  const supabase = await crearCliente();
  const [{ data: estado }, { data: dominios }] = await Promise.all([
    supabase.rpc("estado_dominio"),
    supabase.from("dominios").select("id, nombre, principal, verificado, configurado, registros, error, revisado_en").order("nombre", { ascending: true }),
  ]);
  return (
    <div className="max-w-4xl space-y-6">
      <Encabezado titulo="Dominio propio" texto="Que la tienda se vea en tu propia dirección (mitienda.com.ar) en vez de la de Vercel. Comprás el dominio, lo agregás acá y cargás los registros que te muestra." />
      <section className="overflow-hidden rounded-xl border border-borde bg-white shadow-sm">
        {estado && <Dominio actual={(estado as { sitio_url?: string | null }).sitio_url ?? sitio()} estado={estado as unknown as EstadoDom} dominios={(dominios ?? []) as unknown as Dom[]} />}
      </section>
      <Manual nombre="dominio" abierto={!(dominios ?? []).some((d) => d.principal)} />
    </div>
  );
}
