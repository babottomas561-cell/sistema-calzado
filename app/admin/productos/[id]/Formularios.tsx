"use client";
// Los tres formularios de la ficha: editar datos, agregar talles/colores y ajustar stock.
import { useActionState, useState } from "react";
import { actualizarProducto, agregarVariantes, ajustarStock } from "../acciones";
import { moverAFallados } from "../../fallados/acciones";
import CamposProducto, { type Maestros } from "../CamposProducto";
import ElegirTallesColores, { type Color, type Talle } from "../ElegirTallesColores";
import { CircleCheck, Pencil, Save, X } from "lucide-react";

type Variante = { id: number; talle: string; color: string; stock: number; disponible: number; sku: string | null };
type Producto = { id: number; codigo: string; nombre: string; marca_id: number | null; categoria_id: number | null; subcategoria_id: number | null; genero: string | null; descripcion: string | null;
  escala: string; temporada: string | null; material: string | null; imagen_url: string | null; precio_compra: number; precio_venta: number; activo: boolean; publicado_web: boolean;
  marca?: string | null; categoria?: string | null; subcategoria?: string | null };

function Mensaje({ e }: { e: { error?: string; ok?: string } }) {
  if (e.error) return <p className="text-sm text-error">{e.error}</p>;
  if (e.ok) return <p className="flex items-center gap-1.5 text-sm text-ok"><CircleCheck size={16} /> {e.ok}</p>;
  return null;
}

// edita: "Crear y editar productos" · editaPrecio: "Cambiar precios de venta" · ajusta: "Ajustar stock"
export default function Formularios({ producto, variantes, maestros, talles, colores, edita, editaPrecio, ajusta, abrirEdicion = false }: {
  producto: Producto; variantes: Variante[]; maestros: Maestros; talles: Talle[]; colores: Color[]; edita: boolean; editaPrecio: boolean; ajusta: boolean; abrirEdicion?: boolean;
}) {
  const [editandoDatos, setEditandoDatos] = useState(abrirEdicion);
  const [eDatos, aDatos, cDatos] = useActionState(async (anterior: { error?: string; ok?: string }, formulario: FormData) => {
    const resultado = await actualizarProducto(anterior, formulario);
    if (resultado.ok) setEditandoDatos(false);
    return resultado;
  }, {});
  const [eVar, aVar, cVar] = useActionState(agregarVariantes, {});
  const [eAj, aAj, cAj] = useActionState(ajustarStock, {});
  const [eFa, aFa, cFa] = useActionState(moverAFallados, {});

  return (
    <div className="space-y-4">
      {!editandoDatos ? <section id="datos-producto" className="tarjeta scroll-mt-24 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-borde pb-3">
          <div><h2 className="font-semibold">Datos del artículo</h2><p className="mt-1 text-sm text-texto-2">Identificación, clasificación, precios y publicación online.</p></div>
          {edita && <button type="button" onClick={() => setEditandoDatos(true)} className="boton-sec py-2"><Pencil size={16} /> Editar datos</button>}
        </div>
        <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="etiqueta">Código</dt><dd className="font-mono font-semibold">{producto.codigo}</dd></div>
          <div><dt className="etiqueta">Marca</dt><dd>{producto.marca || "—"}</dd></div>
          <div><dt className="etiqueta">Rubro</dt><dd>{[producto.categoria, producto.subcategoria].filter(Boolean).join(" · ") || "—"}</dd></div>
          <div><dt className="etiqueta">Género</dt><dd>{producto.genero || "—"}</dd></div>
          <div><dt className="etiqueta">Escala</dt><dd>{producto.escala}</dd></div>
          <div><dt className="etiqueta">Temporada</dt><dd>{producto.temporada || "—"}</dd></div>
          <div><dt className="etiqueta">Precio de compra</dt><dd className="font-semibold">$ {Number(producto.precio_compra).toLocaleString("es-AR")}</dd></div>
          <div><dt className="etiqueta">Precio de venta</dt><dd className="font-semibold">$ {Number(producto.precio_venta).toLocaleString("es-AR")}</dd></div>
          <div className="sm:col-span-2 lg:col-span-4"><dt className="etiqueta">Descripción</dt><dd className="whitespace-pre-wrap text-texto-2">{producto.descripcion || "Sin descripción."}</dd></div>
        </dl>
        <div className="flex flex-wrap gap-2 text-xs"><span className={`chip ${producto.activo ? "bg-green-50 text-ok" : "bg-gray-100 text-texto-2"}`}>{producto.activo ? "Activo para vender" : "Inactivo"}</span><span className={`chip ${producto.publicado_web ? "bg-blue-50 text-marca" : "bg-gray-100 text-texto-2"}`}>{producto.publicado_web ? "Publicado en la tienda" : "No publicado"}</span></div>
        {eDatos.ok && <Mensaje e={eDatos} />}
      </section> : edita && <form id="datos-producto" action={aDatos} className="tarjeta scroll-mt-24 space-y-4">
        <div className="border-b border-borde pb-3"><h2 className="font-semibold">Editar datos del artículo</h2><p className="mt-1 text-sm text-texto-2">Modificá los campos necesarios y guardá los cambios.</p></div>
        <input type="hidden" name="id" value={producto.id} />
        <CamposProducto p={producto} maestros={maestros} editaPrecio={editaPrecio} bloquearEscala={variantes.length > 0} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="activo" defaultChecked={producto.activo} /> Activo (si lo desmarcás, deja de aparecer para vender)</label>
        <Mensaje e={eDatos} />
        <div className="flex flex-wrap justify-end gap-2 border-t border-borde pt-4"><button type="button" onClick={() => setEditandoDatos(false)} className="boton-sec" disabled={cDatos}><X size={16} /> Cancelar</button><button className="boton" disabled={cDatos}><Save size={16} />{cDatos ? "Guardando…" : "Guardar cambios"}</button></div>
      </form>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {edita && <form action={aVar} className="tarjeta space-y-3">
        <h2 className="font-semibold">Agregar talles o colores</h2>
        <input type="hidden" name="id" value={producto.id} />
        <ElegirTallesColores talles={talles} colores={colores} escala={producto.escala} />
        <Mensaje e={eVar} />
        <button className="boton-sec" disabled={cVar}>Agregar combinaciones</button>
      </form>}

      {ajusta && <form action={aAj} className="tarjeta space-y-3">
        <h2 className="font-semibold">Ajustar stock</h2>
        <p className="text-xs text-texto-2">Para corregir después de contar (inventario), por rotura o pérdida. Queda registrado con el motivo.</p>
        <input type="hidden" name="producto_id" value={producto.id} />
        <select name="variante_id" required className="campo">
          {variantes.map((v) => <option key={v.id} value={v.id}>Talle {v.talle} · {v.color} (hay {v.stock}) · {v.sku}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="etiqueta">Stock real</label><input name="stock_nuevo" type="number" min="0" required className="campo" /></div>
          <div><label className="etiqueta">Motivo</label><input name="motivo" required placeholder="Conteo, rotura…" className="campo" /></div>
        </div>
        <Mensaje e={eAj} />
        <button className="boton-sec" disabled={cAj || variantes.length === 0}>Ajustar</button>
      </form>}

      {ajusta && <form action={aFa} className="tarjeta space-y-3">
        <h2 className="font-semibold">Mover a fallados</h2>
        <p className="text-xs text-texto-2">Algo roto, manchado o que vino mal: se aparta (no se vende) y queda en la <a href="/admin/fallados" className="text-marca">bandeja de fallados</a> hasta que se arregla, se devuelve al proveedor o se da de baja.</p>
        <input type="hidden" name="producto_id" value={producto.id} />
        <select name="variante_id" required className="campo">
          {variantes.filter((v) => v.disponible > 0).map((v) => <option key={v.id} value={v.id}>Talle {v.talle} · {v.color} (disponibles {v.disponible})</option>)}
        </select>
        <div className="grid grid-cols-[6rem_1fr] gap-3">
          <div><label className="etiqueta">Cuántas</label><input name="cantidad" type="number" min="1" defaultValue={1} required className="campo" /></div>
          <div><label className="etiqueta">Qué tiene</label><input name="motivo" required placeholder="Costura abierta, mancha, suela despegada…" className="campo" /></div>
        </div>
        <Mensaje e={eFa} />
        <button className="boton-sec" disabled={cFa || !variantes.some((v) => v.disponible > 0)}>Mover a fallados</button>
      </form>}
      </div>
    </div>
  );
}
