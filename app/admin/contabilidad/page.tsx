// Contabilidad: el plan de cuentas y qué cuenta usa cada cosa (fase A). Los asientos automáticos, el libro diario y el balance llegan en las
// próximas fases (docs/PLAN_DE_CUENTAS.md). Lo ve quien tiene «Ver la contabilidad»; edita quien tiene «Configurar la contabilidad».
import Link from "next/link";
import { BookText, Link2 } from "lucide-react";
import { crearCliente } from "@/lib/supabase/server";
import { exigir } from "@/lib/exigir";
import { puede } from "@/lib/permisos";
import PlanCuentas, { type Cuenta } from "./PlanCuentas";
import Asignaciones, { type Fila, type SinAsignar } from "./Asignaciones";

export default async function Contabilidad({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { permisos } = await exigir("contabilidad.ver", "contabilidad.configurar");
  const editar = puede(permisos, "contabilidad.configurar");
  const solapa = (await searchParams).t === "asignaciones" ? "asignaciones" : "plan";
  const supabase = await crearCliente();
  const [{ data: cuentas }, { data: conf }] = await Promise.all([
    supabase.from("cuentas").select("id, codigo, nombre, tipo, padre_id, imputable, activa, clave"),
    supabase.from("configuracion_contable").select("mascara").maybeSingle(),
  ]);
  const mascara = conf?.mascara ?? [1, 1, 2, 3];

  let asignaciones = null;
  if (solapa === "asignaciones") {
    const [{ data: lineas }, { data: rubros }, { data: medios }, { data: gastos }, { data: conceptos }, { data: faltan }] = await Promise.all([
      supabase.from("cuentas_por_linea").select("linea, cuenta_venta_id, cuenta_costo_id").order("linea"),
      supabase.from("categorias").select("id, nombre, linea, cuenta_venta_id, cuenta_costo_id").order("nombre"),
      supabase.from("medios_pago").select("id, nombre, tipo, cuenta_id").eq("activo", true).order("orden"),
      supabase.from("gasto_categorias").select("id, nombre, cuenta_id").order("orden"),
      supabase.from("conceptos_compra").select("id, nombre, cuenta_id").eq("activo", true).order("orden"),
      supabase.from("v_cuentas_sin_asignar").select("que, id, nombre, detalle"),
    ]);
    asignaciones = {
      lineas: (lineas ?? []).map((l): Fila => ({ id: l.linea, nombre: l.linea, cuenta_id: l.cuenta_venta_id, cuenta2_id: l.cuenta_costo_id })),
      rubros: (rubros ?? []).map((r): Fila => ({ id: String(r.id), nombre: r.nombre, detalle: r.linea, cuenta_id: r.cuenta_venta_id, cuenta2_id: r.cuenta_costo_id })),
      medios: (medios ?? []).map((m): Fila => ({ id: String(m.id), nombre: m.nombre, detalle: m.tipo, cuenta_id: m.cuenta_id })),
      gastos: (gastos ?? []).map((g): Fila => ({ id: String(g.id), nombre: g.nombre, cuenta_id: g.cuenta_id })),
      conceptos: (conceptos ?? []).map((c): Fila => ({ id: String(c.id), nombre: c.nombre, cuenta_id: c.cuenta_id })),
      faltan: (faltan ?? []) as SinAsignar[],
    };
  }

  const pestana = (clave: string, texto: string, Icono: typeof BookText) => (
    <Link href={clave === "plan" ? "/admin/contabilidad" : `/admin/contabilidad?t=${clave}`} aria-current={solapa === clave ? "page" : undefined}
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${solapa === clave ? "bg-white text-marca shadow-sm ring-1 ring-borde" : "text-gray-600 hover:bg-white/60"}`}>
      <Icono size={16} strokeWidth={solapa === clave ? 2.2 : 1.8} />{texto}</Link>
  );
  return (
    <div className="max-w-5xl space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Contabilidad</h1>
        <p className="text-sm text-texto-2">El plan de cuentas y a qué cuenta va cada cosa. Con esto, en la próxima etapa el sistema arma solo los asientos de cada venta, compra y gasto.</p>
      </div>
      <nav className="flex gap-1">{pestana("plan", "Plan de cuentas", BookText)}{pestana("asignaciones", "Asignaciones", Link2)}</nav>
      {solapa === "plan"
        ? <PlanCuentas cuentas={(cuentas ?? []) as Cuenta[]} puedeEditar={editar} mascara={mascara} />
        : asignaciones && <Asignaciones cuentas={(cuentas ?? []) as Cuenta[]} {...asignaciones} puedeEditar={editar} />}
    </div>
  );
}
