// Legales de la tienda: datos del comercio (CUIT, domicilio…), términos y condiciones, política de privacidad.
// Cada publicación es una versión nueva e inmutable. Lo ve quien tiene el permiso «Tienda online».
import { exigir } from "@/lib/exigir";
import Volver from "@/components/Volver";
import Legales from "./Legales";

export default async function PaginaLegales() {
  const { supabase } = await exigir("tienda.editar");
  const [{ data: datos }, { data: tienda }, { data: docs }, { data: cuentas }] = await Promise.all([
    supabase.from("datos_legales").select("*").single(),
    supabase.from("configuracion_tienda").select("nombre, direccion_retiro, horario, dias_retiro, dias_cambio, dias_saldo").single(),
    supabase.from("documentos_legales").select("id, tipo, version, contenido, publicado_en").order("version", { ascending: false }),
    supabase.from("configuracion_cuentas").select("exigir_terminos").single(),
  ]);
  return (
    <div className="max-w-4xl space-y-6">
      <div className="space-y-2">
        <Volver href="/admin/tienda">Tienda online</Volver>
        <h1 className="text-2xl font-bold">Legales</h1>
        <p className="text-sm text-texto-2">Los datos que la ley pide mostrar, los términos y condiciones y la política de privacidad. Cada vez que publicás queda una versión nueva y se registra quién aceptó cuál.</p>
      </div>
      {datos && tienda && <Legales datos={datos} tienda={tienda} documentos={(docs ?? []).map((d) => ({ ...d, tipo: d.tipo as "terminos" | "privacidad" }))} exigeEnRegistro={!!cuentas?.exigir_terminos} />}
    </div>
  );
}
