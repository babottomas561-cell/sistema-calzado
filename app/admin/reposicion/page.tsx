// Reposición sugerida: qué pedir de cada modelo, color y talle según lo que se vende (lo calcula la base:
// reposicion_sugerida). Agrupado por proveedor, para copiar el pedido y mandarlo por WhatsApp.
import Link from "next/link";
import { PackageCheck } from "lucide-react";
import { exigir } from "@/lib/exigir";
import { numero, pesos } from "@/lib/formato";
import BotonCSV from "@/components/BotonCSV";
import CopiarPedido from "./CopiarPedido";

const VENTAS = [30, 60, 90] as const;
const COBERTURA = [15, 30, 45, 60, 90] as const;

function Chip({ activo, href, children }: { activo: boolean; href: string; children: React.ReactNode }) {
  return <Link href={href} className={`rounded-lg border px-3 py-1.5 text-sm ${activo ? "border-marca bg-marca-suave font-semibold text-marca" : "border-borde bg-white"}`}>{children}</Link>;
}

type Fila = { producto_id: number; codigo: string; nombre: string; marca: string | null; proveedor: string | null; talle: string;
  talle_orden: number; color: string; color_hex: string | null; vendidos: number; disponible: number; sugerido: number; costo_unitario: number | null };

export default async function Reposicion({ searchParams }: { searchParams: Promise<{ dias?: string; cobertura?: string; proveedor?: string; marca?: string }> }) {
  const { supabase } = await exigir("compras.registrar", "stock.ver");
  const sp = await searchParams;
  const dias = VENTAS.includes(Number(sp.dias) as never) ? Number(sp.dias) : 60;
  const cobertura = COBERTURA.includes(Number(sp.cobertura) as never) ? Number(sp.cobertura) : 30;
  const { data, error } = await supabase.rpc("reposicion_sugerida", { p_dias_ventas: dias, p_dias_cobertura: cobertura });
  const todas = (data ?? []) as Fila[];
  const proveedores = [...new Set(todas.map((f) => f.proveedor ?? "Sin proveedor"))].sort();
  const marcas = [...new Set(todas.map((f) => f.marca ?? "Sin marca"))].sort();
  const filas = todas.filter((f) => (!sp.proveedor || (f.proveedor ?? "Sin proveedor") === sp.proveedor) && (!sp.marca || (f.marca ?? "Sin marca") === sp.marca));
  const conCostos = filas.some((f) => f.costo_unitario !== null);

  // Proveedor → modelo + color → curva de talles
  const porProveedor = new Map<string, Map<string, { nombre: string; codigo: string; producto_id: number; color: string; hex: string | null; talles: Fila[] }>>();
  for (const f of filas) {
    const prov = f.proveedor ?? "Sin proveedor";
    const grupos = porProveedor.get(prov) ?? new Map();
    const k = `${f.producto_id}-${f.color}`;
    const g = grupos.get(k) ?? { nombre: f.nombre, codigo: f.codigo, producto_id: f.producto_id, color: f.color, hex: f.color_hex, talles: [] };
    g.talles.push(f); grupos.set(k, g); porProveedor.set(prov, grupos);
  }
  const pares = (l: Fila[]) => l.reduce((s, f) => s + f.sugerido, 0);
  const costo = (l: Fila[]) => l.reduce((s, f) => s + f.sugerido * Number(f.costo_unitario ?? 0), 0);
  // Texto para WhatsApp: un renglón por modelo y color con su curva
  const textoPedido = (prov: string, grupos: Map<string, { nombre: string; codigo: string; color: string; talles: Fila[] }>) =>
    [`Hola! Te paso un pedido de reposición${prov !== "Sin proveedor" ? ` (${prov})` : ""}:`, "",
     ...[...grupos.values()].map((g) => `• ${g.nombre} ${g.color} (${g.codigo}): ${g.talles.map((t) => `${t.talle}×${t.sugerido}`).join(", ")}`),
     "", `Total: ${pares([...grupos.values()].flatMap((g) => g.talles))} unidades. ¡Gracias!`].join("\n");

  const link = (cambio: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams(Object.entries({ dias, cobertura, proveedor: sp.proveedor, marca: sp.marca, ...cambio })
      .filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)]));
    return `/admin/reposicion?${p}`;
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Reposición</h1>
        <p className="text-sm text-texto-2">Qué pedir de cada talle para cubrir los próximos {cobertura} días al ritmo de venta de los últimos {dias}. Solo aparecen los talles que se vendieron.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-texto-2">Ventas de los últimos</span>{VENTAS.map((d) => <Chip key={d} activo={d === dias} href={link({ dias: d })}>{d} días</Chip>)}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-texto-2">Cubrir</span>{COBERTURA.map((d) => <Chip key={d} activo={d === cobertura} href={link({ cobertura: d })}>{d} días</Chip>)}
      </div>
      {(proveedores.length > 1 || marcas.length > 1) && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Chip activo={!sp.proveedor && !sp.marca} href={link({ proveedor: undefined, marca: undefined })}>Todo</Chip>
          {proveedores.length > 1 && proveedores.map((p) => <Chip key={p} activo={sp.proveedor === p} href={link({ proveedor: sp.proveedor === p ? undefined : p })}>{p}</Chip>)}
          {marcas.length > 1 && marcas.map((m) => <Chip key={m} activo={sp.marca === m} href={link({ marca: sp.marca === m ? undefined : m })}>{m}</Chip>)}
        </div>
      )}
      {error && <p className="text-error">{error.message}</p>}

      {filas.length === 0 ? (
        <p className="tarjeta flex items-center gap-2 py-8 text-texto-2"><PackageCheck size={20} className="text-ok" /> Con ese ritmo de venta, el stock alcanza para los próximos {cobertura} días.</p>
      ) : [...porProveedor.entries()].map(([prov, grupos]) => {
        const lineas = [...grupos.values()].flatMap((g) => g.talles);
        return (
          <section key={prov} className="tarjeta space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="font-semibold">{prov}</h2>
                <p className="text-sm text-texto-2">{numero(pares(lineas))} unidades{conCostos ? ` · costo estimado ${pesos(costo(lineas))}` : ""}</p></div>
              <div className="flex flex-wrap gap-2">
                <CopiarPedido texto={textoPedido(prov, grupos)} />
                <BotonCSV archivo={`reposicion-${prov.toLowerCase().replace(/\W+/g, "-")}`}
                  columnas={["Código", "Modelo", "Color", "Talle", "Vendidos", "Disponible", "Pedir", ...(conCostos ? ["Costo estimado"] : [])]}
                  filas={lineas.map((f) => [f.codigo, f.nombre, f.color, f.talle, f.vendidos, f.disponible, f.sugerido, ...(conCostos ? [f.sugerido * Number(f.costo_unitario ?? 0)] : [])])} />
              </div>
            </div>
            <ul className="divide-y divide-gray-100">
              {[...grupos.values()].map((g) => (
                <li key={`${g.producto_id}-${g.color}`} className="py-2.5">
                  <div className="mb-1.5 flex items-center gap-2 text-sm">
                    <span className="h-3 w-3 rounded-full border border-gray-300" style={{ background: g.hex ?? "transparent" }} />
                    <b>{g.nombre}</b><span className="text-texto-2">{g.color} · <span className="font-mono text-xs">{g.codigo}</span></span>
                    <span className="ml-auto font-semibold">{pares(g.talles)} unidades</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {g.talles.map((t) => (
                      <div key={t.talle} title={`Se vendieron ${t.vendidos} · hay ${t.disponible} disponibles`} className="w-14 rounded-lg border border-marca/30 bg-marca-suave py-1 text-center text-marca">
                        <div className="text-[11px] leading-none opacity-75">{t.talle}</div>
                        <div className="text-base font-bold leading-tight">×{t.sugerido}</div>
                        <div className="text-[10px] leading-none text-texto-2">hay {t.disponible}</div>
                      </div>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
