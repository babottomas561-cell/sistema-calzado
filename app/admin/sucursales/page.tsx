// Página de administración de Sucursales, Puntos de Venta (cajas), Depósitos y Transferencias.
import { exigir } from "@/lib/exigir";
import SucursalesView, {
  type SucursalFila,
  type PuntoVentaFila,
  type DepositoFila,
  type VarianteOpcion,
} from "./SucursalesView";

export default async function SucursalesPage() {
  const { supabase } = await exigir("tablas.depositos", "tablas.editar");

  const [
    { data: tienda },
    { data: sucursalesRaw },
    { data: puntosVentaRaw },
    { data: depositosRaw },
    { data: variantesRaw },
  ] = await Promise.all([
    supabase.from("configuracion_tienda").select("multisucursal_activa").single(),
    supabase.from("sucursales").select("id, codigo, nombre, direccion, telefono, deposito_id, es_casa_central, activa").order("id"),
    supabase.from("puntos_venta").select("id, sucursal_id, numero, nombre, tipo, activo").order("numero"),
    supabase.from("depositos").select("id, nombre, sucursal_id, vendible, activo").order("id"),
    supabase.from("v_stock").select("variante_id, nombre, marca, talle, color, sku").order("nombre").limit(500),
  ]);

  const sucursales: SucursalFila[] = (sucursalesRaw ?? []).map((s) => ({
    id: s.id,
    codigo: s.codigo,
    nombre: s.nombre,
    direccion: s.direccion,
    telefono: s.telefono,
    deposito_id: s.deposito_id,
    es_casa_central: s.es_casa_central,
    activa: s.activa,
  }));

  const puntosVenta: PuntoVentaFila[] = (puntosVentaRaw ?? []).map((p) => ({
    id: p.id,
    sucursal_id: p.sucursal_id,
    numero: p.numero,
    nombre: p.nombre,
    tipo: p.tipo,
    activo: p.activo,
  }));

  const depositos: DepositoFila[] = (depositosRaw ?? []).map((d) => ({
    id: d.id,
    nombre: d.nombre,
    sucursal_id: d.sucursal_id,
    vendible: d.vendible,
    activo: d.activo,
  }));

  // Eliminamos duplicados de variantes si v_stock trae una fila por depósito
  const mapaVariantes = new Map<number, VarianteOpcion>();
  for (const v of variantesRaw ?? []) {
    if (v.variante_id && !mapaVariantes.has(v.variante_id)) {
      mapaVariantes.set(v.variante_id, {
        variante_id: v.variante_id,
        nombre: v.nombre ?? "Sin nombre",
        marca: v.marca,
        talle: v.talle,
        color: v.color,
        sku: v.sku ?? "",
      });
    }
  }
  const variantes: VarianteOpcion[] = Array.from(mapaVariantes.values());

  return (
    <SucursalesView
      sucursales={sucursales}
      puntosVenta={puntosVenta}
      depositos={depositos}
      variantes={variantes}
      activaInicial={Boolean(tienda?.multisucursal_activa)}
    />
  );
}
