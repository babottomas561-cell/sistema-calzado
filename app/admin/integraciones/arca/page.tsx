// ARCA (factura electrónica), fase 1: conectar el sistema con ARCA y probarlo. Diseño completo en docs/ARCA.md. Solo el Administrador.
import { crearCliente } from "@/lib/supabase/server";
import { exigir } from "@/lib/exigir";
import Encabezado from "../Encabezado";
import Manual from "../Manual";
import Arca, { type EstadoArca, type Llamada, type PuntoVenta } from "./Arca";
import Requisitos from "@/components/Requisitos";

export default async function PaginaArca() {
  await exigir("equipo.administrar");
  const supabase = await crearCliente();
  const { data: estado } = await supabase.rpc("arca_estado");
  const e = estado as unknown as EstadoArca;
  const [{ data: puntos }, { data: llamadas }] = await Promise.all([
    supabase.from("puntos_venta_fiscales").select("id, numero, nombre, activo, por_defecto, bloqueado, baja, tipo_arca").eq("ambiente", e.ambiente).order("numero"),
    supabase.from("arca_llamadas").select("id, servicio, metodo, status, ms, ok, detalle, creado_en").order("id", { ascending: false }).limit(8),
  ]);
  return (
    <div className="max-w-4xl space-y-6">
      <Requisitos accion="facturar" />
      <Encabezado titulo="ARCA (factura electrónica)"
        texto="Conectá el sistema con ARCA para emitir facturas electrónicas con CAE. Se hace una sola vez, en cuatro pasos, primero en el ambiente de pruebas." />
      <Arca estado={e} puntos={(puntos ?? []) as PuntoVenta[]} llamadas={(llamadas ?? []) as Llamada[]} />
      <Manual nombre="arca" abierto={!e.certificado_vence} />
    </div>
  );
}
