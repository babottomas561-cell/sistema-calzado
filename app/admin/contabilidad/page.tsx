// Contabilidad: el plan de cuentas y qué cuenta usa cada cosa (fase A). Los asientos automáticos, el libro diario y el balance llegan en las
// próximas fases (docs/PLAN_DE_CUENTAS.md). Lo ve quien tiene «Ver la contabilidad»; edita quien tiene «Configurar la contabilidad».
import Link from "next/link";
import { BookText, Link2, Scale, ScrollText, Table2 } from "lucide-react";
import { crearCliente } from "@/lib/supabase/server";
import { exigir } from "@/lib/exigir";
import { puede } from "@/lib/permisos";
import PlanCuentas, { type Cuenta } from "./PlanCuentas";
import Asignaciones, { type Fila, type SinAsignar } from "./Asignaciones";
import AsientoManual from "./AsientoManual";
import Iniciar from "./Iniciar";
import { Filtro, LibroDiario, Mayor, SumasYSaldos, type Mov, type Renglon, type Suma } from "./Libros";

const hoyAR = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
const fechaValida = (x: string | undefined, porDefecto: string) => (x && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : porDefecto);

export default async function Contabilidad({ searchParams }: { searchParams: Promise<{ t?: string; desde?: string; hasta?: string; cuenta?: string }> }) {
  const { permisos } = await exigir("contabilidad.ver", "contabilidad.configurar");
  const editar = puede(permisos, "contabilidad.configurar");
  const q = await searchParams;
  const solapa = ["asignaciones", "diario", "mayor", "balance"].includes(q.t ?? "") ? (q.t as string) : "plan";
  const hoy = hoyAR();
  const supabase = await crearCliente();
  const [{ data: cuentas }, { data: conf }] = await Promise.all([
    supabase.from("cuentas").select("id, codigo, nombre, tipo, padre_id, imputable, activa, clave"),
    supabase.from("configuracion_contable").select("mascara, inicio").maybeSingle(),
  ]);
  const mascara = conf?.mascara ?? [1, 1, 2, 3];
  const inicio = conf?.inicio ?? null;
  const desde = fechaValida(q.desde, inicio ?? hoy.slice(0, 8) + "01"), hasta = fechaValida(q.hasta, hoy);
  const cuentaMayor = Number(q.cuenta) || null;

  let asignaciones = null;
  let diario: Renglon[] = [], mayor: Mov[] = [], sumas: Suma[] = [];
  if (solapa === "diario") diario = ((await supabase.rpc("libro_diario", { p_desde: desde, p_hasta: hasta })).data ?? []) as Renglon[];
  if (solapa === "mayor" && cuentaMayor) mayor = ((await supabase.rpc("mayor_cuenta", { p_cuenta: cuentaMayor, p_desde: desde, p_hasta: hasta })).data ?? []) as Mov[];
  if (solapa === "balance") sumas = ((await supabase.rpc("sumas_y_saldos", { p_hasta: hasta })).data ?? []) as Suma[];
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
  const todas = (cuentas ?? []) as Cuenta[];

  const pestana = (clave: string, texto: string, Icono: typeof BookText) => (
    <Link href={clave === "plan" ? "/admin/contabilidad" : `/admin/contabilidad?t=${clave}`} aria-current={solapa === clave ? "page" : undefined}
      className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${solapa === clave ? "bg-white text-marca shadow-sm ring-1 ring-borde" : "text-gray-600 hover:bg-white/60"}`}>
      <Icono size={16} strokeWidth={solapa === clave ? 2.2 : 1.8} />{texto}</Link>
  );
  return (
    <div className="max-w-5xl space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Contabilidad</h1>
        <p className="text-sm text-texto-2">{inicio ? `Empezó el ${new Date(inicio + "T12:00:00").toLocaleDateString("es-AR")}: cada venta, compra y gasto genera su asiento solo.` : "El plan de cuentas, a qué cuenta va cada cosa y, cuando la inicies, los asientos automáticos."}</p>
      </div>
      {!inicio && editar && <Iniciar hoy={hoy} />}
      <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:px-0">{pestana("plan", "Plan de cuentas", BookText)}{pestana("asignaciones", "Asignaciones", Link2)}{pestana("diario", "Libro diario", ScrollText)}{pestana("mayor", "Mayor", Table2)}{pestana("balance", "Sumas y saldos", Scale)}</nav>
      {solapa === "plan" && <PlanCuentas cuentas={todas} puedeEditar={editar} mascara={mascara} />}
      {solapa === "asignaciones" && asignaciones && <Asignaciones cuentas={todas} {...asignaciones} puedeEditar={editar} />}
      {solapa === "diario" && (
        <div className="space-y-4">
          <Filtro t="diario" desde={desde} hasta={hasta} />
          <LibroDiario filas={diario} />
          {inicio && editar && <AsientoManual cuentas={todas} hoy={hoy} />}
        </div>
      )}
      {solapa === "mayor" && (
        <div className="space-y-4">
          <Filtro t="mayor" desde={desde} hasta={hasta} extra={
            <div><label className="etiqueta" htmlFor="cuenta">Cuenta</label>
              <select id="cuenta" name="cuenta" defaultValue={cuentaMayor ?? ""} className="campo h-10 w-72 max-w-full"><option value="">Elegí una cuenta…</option>
                {todas.filter((c) => c.activa).sort((a, b) => a.codigo.localeCompare(b.codigo)).map((c) => <option key={c.id} value={c.id}>{c.codigo} · {c.nombre}</option>)}</select></div>} />
          {cuentaMayor ? <Mayor filas={mayor} /> : <p className="rounded-xl border border-dashed border-borde px-4 py-8 text-center text-sm text-texto-2">Elegí una cuenta para ver sus movimientos con el saldo corrido.</p>}
        </div>
      )}
      {solapa === "balance" && (
        <div className="space-y-4">
          <form method="get" className="flex flex-wrap items-end gap-3"><input type="hidden" name="t" value="balance" />
            <div><label className="etiqueta" htmlFor="hasta">A la fecha</label><input id="hasta" name="hasta" type="date" defaultValue={hasta} className="campo h-10" /></div><button className="boton-sec min-h-10">Ver</button></form>
          <SumasYSaldos filas={sumas} />
        </div>
      )}
    </div>
  );
}
