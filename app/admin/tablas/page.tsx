// Tablas maestras: lo que alimenta los desplegables (rubros y subrubros, marcas, colores, talles,
// medios de pago). Como en un ERP: cada una con su código corto, que arma el código de artículo y el SKU.
// Se ven como listas limpias; se edita en una ventana (Editor).
import Link from "next/link";
import { CreditCard, Layers, Monitor, Palette, Plus, Ruler, Store, Tag } from "lucide-react";
import { crearCliente } from "@/lib/supabase/server";
import { porcentaje } from "@/lib/formato";
import Editor from "./Editor";
import { exigir } from "@/lib/exigir";
import { ESCALAS, LINEAS, TITULO_ESCALA } from "@/lib/escalas";

const PESTANAS = [
  { clave: "rubros", texto: "Rubros", icono: Layers },
  { clave: "marcas", texto: "Marcas", icono: Tag },
  { clave: "colores", texto: "Colores", icono: Palette },
  { clave: "talles", texto: "Talles", icono: Ruler },
  { clave: "medios", texto: "Medios de pago", icono: CreditCard },
] as const;
type Clave = (typeof PESTANAS)[number]["clave"];

const usos = (x: { count: number }[] | null | undefined) => x?.[0]?.count ?? 0;
const TIPOS_MEDIO = ["Efectivo", "Transferencia", "Débito", "Crédito", "Billetera", "Otro"];

// Campos comunes: nombre y código (opcional, se genera solo)
function CodigoNombre({ codigo, nombre, ejemplo, prefijo }: { codigo?: string; nombre?: string; ejemplo: string; prefijo?: string }) {
  return (
    <div className="grid grid-cols-[1fr_120px] gap-3">
      <div><label className="etiqueta">Nombre</label><input name="nombre" required defaultValue={nombre} placeholder={ejemplo} className="campo" autoFocus /></div>
      <div><label className="etiqueta">Código</label><input name="codigo" defaultValue={codigo} placeholder={prefijo ? `${prefijo}…` : "automático"} className="campo font-mono uppercase" /></div>
    </div>
  );
}

// La línea del rubro (Calzado, Ropa, Accesorios): separa los totales de cada una en los informes
function SelectorLinea({ actual }: { actual?: string }) {
  return (
    <div><label className="etiqueta">Línea</label>
      <select name="linea" defaultValue={actual ?? "Calzado"} className="campo">{LINEAS.map((l) => <option key={l}>{l}</option>)}</select>
      <p className="mt-0.5 text-[11px] text-texto-2">Los informes separan calzado, ropa y accesorios.</p></div>
  );
}

function Encabezado({ titulo, detalle, children }: { titulo: string; detalle: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-borde px-5 py-4">
      <div><h2 className="font-semibold">{titulo}</h2><p className="text-sm text-texto-2">{detalle}</p></div>
      {children}
    </div>
  );
}

const Codigo = ({ children }: { children: React.ReactNode }) =>
  <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-600">{children}</span>;

export default async function Tablas({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  await exigir("tablas.editar");
  const { t } = await searchParams;
  const actual: Clave = PESTANAS.some((p) => p.clave === t) ? (t as Clave) : "rubros";
  const supabase = await crearCliente();
  const [rubros, subrubros, marcas, colores, talles, medios] = await Promise.all([
    supabase.from("categorias").select("id, codigo, nombre, linea, productos(count)").order("nombre"),
    supabase.from("subcategorias").select("id, codigo, nombre, categoria_id, productos(count)").order("nombre"),
    supabase.from("marcas").select("id, codigo, nombre, productos(count)").order("nombre"),
    supabase.from("colores").select("id, codigo, nombre, hex, variantes(count)").order("nombre"),
    supabase.from("talles").select("id, nombre, orden, tipo, variantes(count)").order("orden"),
    supabase.from("medios_pago").select("id, codigo, nombre, tipo, ajuste_pct, cuotas, en_mostrador, en_tienda, activo, orden, pagos(count)").eq("es_saldo", false).order("orden"),   // «Saldo a favor» es automático
  ]);
  const cantidades: Record<Clave, number> = { rubros: rubros.data?.length ?? 0, marcas: marcas.data?.length ?? 0,
    colores: colores.data?.length ?? 0, talles: talles.data?.length ?? 0, medios: medios.data?.length ?? 0 };

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold">Tablas</h1>
        <p className="text-sm text-texto-2">Lo que aparece en los desplegables. Si dejás el código vacío, se genera solo.</p></div>

      {/* Pestañas */}
      <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:px-0">
        {PESTANAS.map(({ clave, texto, icono: Icono }) => (
          <Link key={clave} href={`/admin/tablas?t=${clave}`} aria-current={clave === actual ? "page" : undefined}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${clave === actual ? "bg-white text-marca shadow-sm ring-1 ring-borde" : "text-gray-600 hover:bg-white/60"}`}>
            <Icono size={16} strokeWidth={clave === actual ? 2.2 : 1.8} />{texto}
            {<span className={`rounded-full px-1.5 text-xs ${clave === actual ? "bg-marca-suave" : "bg-gray-200/70"}`}>{cantidades[clave]}</span>}
          </Link>
        ))}
      </nav>

      <section className="overflow-hidden rounded-xl border border-borde bg-white shadow-sm">
        {actual === "rubros" && <>
          <Encabezado titulo="Rubros y subrubros" detalle="El código del rubro arma el código de artículo (ZAP-0001, REM-0001). Cada rubro es de una línea: calzado, ropa o accesorios.">
            <Editor tabla="categorias" titulo="Nuevo rubro" nuevo="Nuevo rubro"><CodigoNombre ejemplo="Zapatilla" /><SelectorLinea /></Editor>
          </Encabezado>
          <ul className="divide-y divide-gray-100">
            {(rubros.data ?? []).map((r) => (
              <li key={r.id} className="flex items-start gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><span className="font-semibold">{r.nombre}</span><Codigo>{r.codigo}</Codigo>
                    <span className="rounded-full bg-gray-100 px-2 text-[11px] font-semibold text-texto-2">{r.linea}</span>
                    <span className="text-xs text-texto-2">{usos(r.productos)} {usos(r.productos) === 1 ? "artículo" : "artículos"}</span></div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(subrubros.data ?? []).filter((s) => s.categoria_id === r.id).map((s) => (
                      <Editor key={`${s.id}-${s.codigo}-${s.nombre}`} tabla="subcategorias" id={s.id} titulo={`Subrubro de ${r.nombre}`} enUso={usos(s.productos)}
                        disparador={<span className="inline-flex items-center gap-1.5 rounded-full border border-borde bg-white px-2.5 py-1 text-xs hover:border-marca hover:text-marca">
                          {s.nombre}<span className="font-mono text-[10px] text-gray-400">{s.codigo}</span></span>}>
                        <input type="hidden" name="categoria_id" value={r.id} />
                        <CodigoNombre codigo={s.codigo} nombre={s.nombre} ejemplo="Running" prefijo={`${r.codigo}-`} />
                      </Editor>
                    ))}
                    <Editor tabla="subcategorias" titulo={`Nuevo subrubro de ${r.nombre}`}
                      disparador={<span className="inline-flex items-center gap-1 rounded-full border border-dashed border-gray-300 px-2.5 py-1 text-xs text-texto-2 hover:border-marca hover:text-marca"><Plus size={12} /> subrubro</span>}>
                      <input type="hidden" name="categoria_id" value={r.id} />
                      <CodigoNombre ejemplo="Running" prefijo={`${r.codigo}-`} />
                    </Editor>
                  </div>
                </div>
                <Editor key={`${r.id}-${r.codigo}-${r.nombre}`} tabla="categorias" id={r.id} titulo="Editar rubro" enUso={usos(r.productos)}>
                  <CodigoNombre codigo={r.codigo} nombre={r.nombre} ejemplo="Zapatilla" />
                  <SelectorLinea actual={r.linea} />
                  <p className="text-xs text-texto-2">Cambiar el código no renombra los artículos ya creados.</p>
                </Editor>
              </li>
            ))}
          </ul>
        </>}

        {actual === "marcas" && <>
          <Encabezado titulo="Marcas" detalle="Se eligen al cargar un artículo.">
            <Editor tabla="marcas" titulo="Nueva marca" nuevo="Nueva marca"><CodigoNombre ejemplo="Nike" /></Editor>
          </Encabezado>
          <table className="tabla">
            <thead><tr><th>Marca</th><th>Código</th><th className="text-right">Artículos</th><th className="w-12" /></tr></thead>
            <tbody>{(marcas.data ?? []).map((m) => (
              <tr key={m.id}><td className="font-medium">{m.nombre}</td><td><Codigo>{m.codigo}</Codigo></td>
                <td className="text-right text-texto-2">{usos(m.productos)}</td>
                <td className="py-1"><Editor key={`${m.id}-${m.codigo}-${m.nombre}`} tabla="marcas" id={m.id} titulo="Editar marca" enUso={usos(m.productos)}>
                  <CodigoNombre codigo={m.codigo} nombre={m.nombre} ejemplo="Nike" /></Editor></td></tr>
            ))}</tbody>
          </table>
        </>}

        {actual === "colores" && <>
          <Encabezado titulo="Colores" detalle="La muestra es la que se ve en la tienda. El código va al final del SKU (…-42-NEG).">
            <Editor tabla="colores" titulo="Nuevo color" nuevo="Nuevo color">
              <CodigoNombre ejemplo="Negro" />
              <div><label className="etiqueta">Muestra</label><input name="hex" type="color" defaultValue="#cccccc" className="h-10 w-20 cursor-pointer rounded-lg border border-borde" /></div>
            </Editor>
          </Encabezado>
          <ul className="grid gap-px bg-gray-100 sm:grid-cols-2 lg:grid-cols-3">
            {(colores.data ?? []).map((c) => (
              <li key={c.id} className="flex items-center gap-3 bg-white px-5 py-3">
                <span className="h-8 w-8 shrink-0 rounded-full border border-black/10 shadow-inner" style={{ background: c.hex ?? "#ddd" }} />
                <div className="min-w-0 flex-1"><div className="font-medium">{c.nombre}</div>
                  <div className="flex items-center gap-2 text-xs text-texto-2"><Codigo>{c.codigo}</Codigo>{usos(c.variantes)} {usos(c.variantes) === 1 ? "variante" : "variantes"}</div></div>
                <Editor key={`${c.id}-${c.codigo}-${c.nombre}-${c.hex}`} tabla="colores" id={c.id} titulo="Editar color" enUso={usos(c.variantes)}>
                  <CodigoNombre codigo={c.codigo} nombre={c.nombre} ejemplo="Negro" />
                  <div><label className="etiqueta">Muestra</label><input name="hex" type="color" defaultValue={c.hex ?? "#cccccc"} className="h-10 w-20 cursor-pointer rounded-lg border border-borde" /></div>
                </Editor>
              </li>
            ))}
          </ul>
        </>}

        {actual === "talles" && <>
          <Encabezado titulo="Talles" detalle="Tocá un talle para editarlo. El orden define cómo se listan (38 · 38.5 · 39).">
            <Editor tabla="talles" titulo="Nuevo talle" nuevo="Nuevo talle">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="etiqueta">Talle</label><input name="nombre" required placeholder="44 · 37.5 · XL · Único" className="campo" autoFocus /></div>
                <div><label className="etiqueta">Escala</label><select name="tipo" defaultValue="" className="campo">
                  <option value="">Automática</option>{ESCALAS.map((e) => <option key={e} value={e}>{TITULO_ESCALA[e]}</option>)}</select></div>
              </div>
              <p className="text-xs text-texto-2">El orden se calcula solo. Escala automática: menos de 35 es de niños, las letras son de ropa. El mismo número puede existir en dos escalas (el 38 de calzado y el 38 de jeans son talles distintos).</p>
            </Editor>
          </Encabezado>
          <div className="space-y-5 px-5 py-4">
            {ESCALAS.map((tipo) => {
              const lista = (talles.data ?? []).filter((x) => x.tipo === tipo);
              if (!lista.length) return null;
              return (
                <div key={tipo}>
                  <div className="etiqueta">{TITULO_ESCALA[tipo]}</div>
                  <div className="flex flex-wrap gap-2">{lista.map((x) => (
                    <Editor key={`${x.id}-${x.nombre}-${x.orden}-${x.tipo}`} tabla="talles" id={x.id} titulo={`Talle ${x.nombre}`} enUso={usos(x.variantes)}
                      disparador={<span className="flex h-14 w-16 flex-col items-center justify-center rounded-lg border border-borde bg-white transition hover:border-marca hover:bg-marca-suave">
                        <span className="font-semibold">{x.nombre}</span><span className="text-[10px] text-texto-2">{usos(x.variantes)} var.</span></span>}>
                      <div className="grid grid-cols-3 gap-3">
                        <div><label className="etiqueta">Talle</label><input name="nombre" required defaultValue={x.nombre} className="campo" /></div>
                        <div><label className="etiqueta">Orden</label><input name="orden" type="number" step="0.5" required defaultValue={x.orden} className="campo" /></div>
                        <div><label className="etiqueta">Escala</label><select name="tipo" defaultValue={x.tipo} className="campo">{ESCALAS.map((e) => <option key={e} value={e}>{TITULO_ESCALA[e]}</option>)}</select></div>
                      </div>
                    </Editor>
                  ))}</div>
                </div>
              );
            })}
          </div>
        </>}


        {actual === "medios" && <>
          <Encabezado titulo="Medios de pago" detalle="El descuento o recargo se aplica sobre la parte que se paga con ese medio. Cambiarlo no toca ventas ya hechas.">
            <Editor tabla="medios_pago" titulo="Nuevo medio de pago" nuevo="Nuevo medio"><CamposMedio /></Editor>
          </Encabezado>
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead><tr><th>Medio</th><th>Tipo</th><th>Descuento / recargo</th><th>Se ofrece en</th><th className="w-12" /></tr></thead>
              <tbody>{(medios.data ?? []).map((m) => {
                const pct = Number(m.ajuste_pct);
                return (
                  <tr key={m.id} className={m.activo ? "" : "opacity-50"}>
                    <td><div className="font-medium">{m.nombre}{!m.activo && <span className="chip ml-2 bg-gray-100 text-texto-2">inactivo</span>}</div>
                      <div className="flex items-center gap-2 text-xs text-texto-2"><Codigo>{m.codigo}</Codigo>{m.cuotas > 1 && `${m.cuotas} cuotas`}</div></td>
                    <td className="text-texto-2">{m.tipo}</td>
                    <td>{pct === 0 ? <span className="text-texto-2">—</span>
                      : <span className={`chip ${pct < 0 ? "bg-green-100 text-ok" : "bg-amber-100 text-alerta"}`}>{pct < 0 ? "Descuento" : "Recargo"} {porcentaje(Math.abs(pct)).replace("+", "")}</span>}</td>
                    <td><div className="flex gap-1.5">
                      {m.en_mostrador && <span className="chip gap-1 bg-gray-100 text-gray-700"><Store size={12} /> Local</span>}
                      {m.en_tienda && <span className="chip gap-1 bg-blue-50 text-marca"><Monitor size={12} /> Tienda</span>}</div></td>
                    <td className="py-1"><Editor key={`${m.id}-${m.nombre}-${pct}-${m.cuotas}-${m.en_mostrador}-${m.en_tienda}-${m.activo}-${m.orden}-${m.tipo}-${m.codigo}`}
                      tabla="medios_pago" id={m.id} titulo="Editar medio de pago" enUso={usos(m.pagos)}><CamposMedio m={m} /></Editor></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        </>}
      </section>
    </div>
  );
}

type Medio = { codigo: string; nombre: string; tipo: string; ajuste_pct: number; cuotas: number; en_mostrador: boolean; en_tienda: boolean; activo: boolean; orden: number };

// Campos de un medio de pago. En pantalla el % va en positivo y se elige si es descuento o recargo.
function CamposMedio({ m }: { m?: Medio }) {
  const pct = Number(m?.ajuste_pct ?? 0);
  return (
    <>
      <CodigoNombre codigo={m?.codigo} nombre={m?.nombre} ejemplo="Efectivo" />
      <div className="grid grid-cols-2 gap-3">
        <div><label className="etiqueta">Escala</label>
          <select name="tipo" defaultValue={m?.tipo ?? "Otro"} className="campo">{TIPOS_MEDIO.map((t) => <option key={t}>{t}</option>)}</select></div>
        <div><label className="etiqueta">Cuotas</label><input name="cuotas" type="number" min="1" defaultValue={m?.cuotas ?? 1} className="campo" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="etiqueta">Ajuste</label>
          <select name="signo" defaultValue={pct < 0 ? "descuento" : "recargo"} className="campo"><option value="descuento">Descuento</option><option value="recargo">Recargo</option></select></div>
        <div><label className="etiqueta">Porcentaje</label>
          <div className="relative"><input name="porcentaje" type="number" min="0" max="100" step="0.5" defaultValue={Math.abs(pct)} className="campo pr-8" />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-texto-2">%</span></div></div>
      </div>
      <fieldset className="space-y-2 rounded-lg border border-borde p-3">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-texto-2">Dónde se ofrece</legend>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="en_mostrador" defaultChecked={m?.en_mostrador ?? true} /> Al vender en el local</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="en_tienda" defaultChecked={m?.en_tienda ?? false} /> En la tienda online</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="activo" defaultChecked={m?.activo ?? true} /> Activo</label>
      </fieldset>
      <input type="hidden" name="orden" value={m?.orden ?? 99} />
    </>
  );
}
