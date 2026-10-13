// Proveedores: sus datos de contacto y, para quien ve costos o carga compras, el crédito a favor del local
// con cada uno (fallados devueltos que se descuentan de sus facturas), con sus movimientos y ajustes.
import Link from "next/link";
import Contactos from "@/components/Contactos";
import { crearCliente } from "@/lib/supabase/server";
import { exigir } from "@/lib/exigir";
import { puede } from "@/lib/permisos";
import { fecha, pesos } from "@/lib/formato";
import { AjustarCredito } from "../compras/Credito";

const TIPO: Record<string, string> = { devolucion: "Fallado devuelto", descuento: "Descontado en factura", ajuste: "Ajuste" };

export default async function Proveedores() {
  const { permisos } = await exigir("proveedores.gestionar", "compras.registrar");
  const veCredito = puede(permisos, "compras.registrar", "costos.ver_precio_compra");
  const ajusta = puede(permisos, "proveedores.gestionar") && puede(permisos, "costos.ver_precio_compra");
  const supabase = await crearCliente();
  const [{ data }, { data: creditos }, { data: movimientos }] = await Promise.all([
    supabase.from("proveedores").select("id, codigo, nombre, telefono, email, notas").order("nombre"),
    veCredito ? supabase.from("v_credito_proveedores").select("proveedor_id, nombre, saldo, a_favor, usado").order("saldo", { ascending: false }) : Promise.resolve({ data: [] }),
    veCredito ? supabase.from("creditos_proveedor")
      .select("id, fecha, proveedor_id, tipo, monto, nota, compra_id, compras(comprobante), fallados(cantidad, variantes(talles(nombre), colores(nombre), productos(nombre)))")
      .order("fecha", { ascending: false }).limit(200) : Promise.resolve({ data: [] }),
  ]);
  // «Zapatilla Running Pro 38 · Negro ×2»: qué fue lo que se le devolvió
  const articulo = (f: { cantidad: number; variantes: { talles: { nombre: string } | null; colores: { nombre: string } | null; productos: { nombre: string } | null } | null } | null) =>
    f?.variantes && `${f.variantes.productos?.nombre} ${f.variantes.talles?.nombre} · ${f.variantes.colores?.nombre}${f.cantidad > 1 ? ` ×${f.cantidad}` : ""}`;
  return (
    <div className="space-y-6">
      {veCredito && (creditos ?? []).length > 0 && (
        <section className="space-y-3">
          <div><h2 className="text-lg font-bold">Crédito con proveedores</h2>
            <p className="text-sm text-texto-2">Lo fallado que se les devolvió, a su costo (y las notas de crédito que se cargan a mano). Se descuenta al cargar su próxima factura.</p></div>
          <div className="grid gap-3 md:grid-cols-2">{(creditos ?? []).map((c) => (
            <details key={c.proveedor_id} className="tarjeta group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                <span className="font-semibold">{c.nombre}</span>
                <span className="text-right"><span className="block text-lg font-bold text-ok">{pesos(c.saldo)}</span>
                  <span className="text-xs text-texto-2">a favor {pesos(c.a_favor)} · usado {pesos(c.usado)}</span></span>
              </summary>
              <ul className="mt-3 divide-y divide-gray-100 border-t border-borde text-sm">
                {(movimientos ?? []).filter((m) => m.proveedor_id === c.proveedor_id).slice(0, 10).map((m) => (
                  <li key={m.id} className="flex justify-between gap-3 py-2">
                    <span><span className="text-texto-2">{fecha(m.fecha)} · </span>{TIPO[m.tipo]}
                      {m.compra_id && <> · <Link href={`/admin/compras/${m.compra_id}`} className="font-mono text-marca">{(m.compras as { comprobante: string } | null)?.comprobante}</Link></>}
                      {articulo(m.fallados) && <span className="block text-xs">{articulo(m.fallados)}</span>}
                      {m.nota && <span className="block text-xs text-texto-2">«{m.nota}»</span>}</span>
                    <span className={`shrink-0 font-semibold ${Number(m.monto) > 0 ? "text-ok" : ""}`}>{Number(m.monto) > 0 ? "+" : "−"}{pesos(Math.abs(Number(m.monto)))}</span>
                  </li>
                ))}
              </ul>
              {ajusta && <AjustarCredito proveedor={c.proveedor_id ?? 0} />}
            </details>
          ))}</div>
        </section>
      )}
      <Contactos tabla="proveedores" titulo="Proveedores" lista={data ?? []} />
    </div>
  );
}
