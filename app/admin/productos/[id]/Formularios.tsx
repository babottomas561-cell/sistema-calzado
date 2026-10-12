"use client";
// Los tres formularios de la ficha: editar datos, agregar talles/colores y ajustar stock.
import { useActionState } from "react";
import { actualizarProducto, agregarVariantes, ajustarStock } from "../acciones";
import { moverAFallados } from "../../fallados/acciones";
import CamposProducto, { type Maestros } from "../CamposProducto";
import ElegirTallesColores, { type Color, type Talle } from "../ElegirTallesColores";
import { CircleCheck } from "lucide-react";

type Variante = { id: number; talle: string; color: string; stock: number; disponible: number; sku: string | null };
type Producto = { id: number; codigo: string; nombre: string; marca_id: number | null; categoria_id: number | null; subcategoria_id: number | null; genero: string | null; descripcion: string | null;
  escala: string; temporada: string | null; material: string | null; imagen_url: string | null; precio_compra: number; precio_venta: number; activo: boolean; publicado_web: boolean };

function Mensaje({ e }: { e: { error?: string; ok?: string } }) {
  if (e.error) return <p className="text-sm text-error">{e.error}</p>;
  if (e.ok) return <p className="flex items-center gap-1.5 text-sm text-ok"><CircleCheck size={16} /> {e.ok}</p>;
  return null;
}

// edita: "Crear y editar productos" · editaPrecio: "Cambiar precios de venta" · ajusta: "Ajustar stock"
export default function Formularios({ producto, variantes, maestros, talles, colores, edita, editaPrecio, ajusta }: {
  producto: Producto; variantes: Variante[]; maestros: Maestros; talles: Talle[]; colores: Color[]; edita: boolean; editaPrecio: boolean; ajusta: boolean;
}) {
  const [eDatos, aDatos, cDatos] = useActionState(actualizarProducto, {});
  const [eVar, aVar, cVar] = useActionState(agregarVariantes, {});
  const [eAj, aAj, cAj] = useActionState(ajustarStock, {});
  const [eFa, aFa, cFa] = useActionState(moverAFallados, {});

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {edita && <form action={aDatos} className="tarjeta space-y-4 lg:row-span-2">
        <h2 className="font-semibold">Datos del producto</h2>
        <input type="hidden" name="id" value={producto.id} />
        <CamposProducto p={producto} maestros={maestros} editaPrecio={editaPrecio} bloquearEscala={variantes.length > 0} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="activo" defaultChecked={producto.activo} /> Activo (si lo desmarcás, deja de aparecer para vender)</label>
        <Mensaje e={eDatos} />
        <button className="boton" disabled={cDatos}>Guardar cambios</button>
      </form>}

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
  );
}
