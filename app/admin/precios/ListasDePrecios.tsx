"use client";
// Gestión de Listas de Precios: visualización, ajuste % general, redondeo y excepciones por producto.
import { useState, useTransition } from "react";
import { Check, Edit2, LoaderCircle, Monitor, Store, X } from "lucide-react";
import { pesos, porcentaje } from "@/lib/formato";
import ParametroListasPrecios from "../tablas/ParametroListasPrecios";
import { actualizarListaPrecio, guardarPrecioExcepcion, type ListaPrecioFila } from "./acciones";
import type { Articulo } from "./AjustePrecios";

const REDONDEOS: Record<string, string> = {
  sin_redondeo: "Sin redondeo",
  "10": "A $10",
  "50": "A $50",
  "100": "A $100",
  "1000": "A $1.000",
  "999": "Terminado en 999",
};

export default function ListasDePrecios({
  listas,
  articulos,
  excepciones,
  activasInicial,
  puedeVenta,
}: {
  listas: ListaPrecioFila[];
  articulos: Articulo[];
  excepciones: { lista_id: number; producto_id: number; precio: number }[];
  activasInicial: boolean;
  puedeVenta: boolean;
}) {
  const [listaSeleccionada, setListaSeleccionada] = useState<number | null>(listas[0]?.id ?? null);
  const [editando, setEditando] = useState<number | null>(null);
  const [nombreEdit, setNombreEdit] = useState("");
  const [ajusteEdit, setAjusteEdit] = useState(0);
  const [redondeoEdit, setRedondeoEdit] = useState("sin_redondeo");
  const [filtroArticulos, setFiltroArticulos] = useState("");
  const [isPending, startTransition] = useTransition();

  const listaActual = listas.find((l) => l.id === listaSeleccionada) ?? listas[0];

  const iniciarEdicion = (l: ListaPrecioFila) => {
    setEditando(l.id);
    setNombreEdit(l.nombre);
    setAjusteEdit(l.ajuste_pct);
    setRedondeoEdit(l.redondeo);
  };

  const guardarEdicion = (id: number) => {
    startTransition(async () => {
      await actualizarListaPrecio(id, {
        nombre: nombreEdit.trim() || undefined,
        ajuste_pct: Number(ajusteEdit),
        redondeo: redondeoEdit,
      });
      setEditando(null);
    });
  };

  const mapaExcepciones = new Map(
    excepciones
      .filter((e) => e.lista_id === listaActual?.id)
      .map((e) => [e.producto_id, Number(e.precio)])
  );

  const calcularPrecioLista = (precioBase: number, ajuste: number, redondeo: string) => {
    const conAjuste = precioBase * (1 + ajuste / 100);
    switch (redondeo) {
      case "10":
        return Math.round(conAjuste / 10) * 10;
      case "50":
        return Math.round(conAjuste / 50) * 50;
      case "100":
        return Math.round(conAjuste / 100) * 100;
      case "1000":
        return Math.round(conAjuste / 1000) * 1000;
      case "999":
        return conAjuste < 1000
          ? Math.round(conAjuste / 10) * 10
          : Math.floor(conAjuste / 1000) * 1000 + 999;
      default:
        return Math.round(conAjuste * 100) / 100;
    }
  };

  const articulosFiltrados = articulos.filter((a) =>
    !filtroArticulos ||
    `${a.nombre} ${a.codigo} ${a.marca ?? ""} ${a.rubro ?? ""}`.toLowerCase().includes(filtroArticulos.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <ParametroListasPrecios activaInicial={activasInicial} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Columna Izquierda: Tarjetas de Listas de Precios */}
        <div className="space-y-3 lg:col-span-1">
          <h2 className="text-sm font-semibold tracking-wide text-texto-2 uppercase">Listas configuradas</h2>
          {listas.map((l) => {
            const esActiva = l.id === listaActual?.id;
            const esEdicion = editando === l.id;
            return (
              <div
                key={l.id}
                onClick={() => !esEdicion && setListaSeleccionada(l.id)}
                className={`relative flex flex-col gap-3 rounded-xl border p-4 transition cursor-pointer ${
                  esActiva
                    ? "border-marca bg-blue-50/40 ring-1 ring-marca/20 shadow-xs"
                    : "border-borde bg-white hover:border-gray-300"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-gray-100 text-marca">
                      {l.canal === "tienda" ? <Monitor size={16} /> : <Store size={16} />}
                    </span>
                    <div>
                      {esEdicion ? (
                        <input
                          type="text"
                          value={nombreEdit}
                          onChange={(e) => setNombreEdit(e.target.value)}
                          className="h-7 rounded border border-borde px-2 text-sm font-semibold"
                          autoFocus
                        />
                      ) : (
                        <h3 className="font-semibold text-gray-900">{l.nombre}</h3>
                      )}
                      <div className="flex items-center gap-1.5 text-xs text-texto-2">
                        <span className="font-mono text-[11px] font-semibold">{l.codigo}</span>
                        <span>·</span>
                        <span>{l.canal === "tienda" ? "Tienda Web" : l.canal === "mostrador" ? "Local" : "Ambos"}</span>
                      </div>
                    </div>
                  </div>

                  {puedeVenta && !esEdicion && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        iniciarEdicion(l);
                      }}
                      className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                      title="Editar configuración de la lista"
                    >
                      <Edit2 size={14} />
                    </button>
                  )}
                </div>

                {esEdicion ? (
                  <div className="space-y-3 rounded-lg bg-white p-3 ring-1 ring-borde" onClick={(e) => e.stopPropagation()}>
                    <div>
                      <label className="text-xs font-medium text-gray-700">Ajuste porcentual general</label>
                      <div className="relative mt-1 flex items-center">
                        <input
                          type="number"
                          step="0.5"
                          value={ajusteEdit}
                          onChange={(e) => setAjusteEdit(Number(e.target.value))}
                          className="h-8 w-full rounded border border-borde px-2 pr-7 text-xs font-semibold tabular-nums"
                        />
                        <span className="absolute right-2 text-xs text-gray-400">%</span>
                      </div>
                      <p className="mt-0.5 text-[10px] text-texto-2">Ej: +10 sube un 10%; 0 mantiene precio base.</p>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-gray-700">Redondeo</label>
                      <select
                        value={redondeoEdit}
                        onChange={(e) => setRedondeoEdit(e.target.value)}
                        className="mt-1 h-8 w-full rounded border border-borde px-2 text-xs"
                      >
                        {Object.entries(REDONDEOS).map(([val, desc]) => (
                          <option key={val} value={val}>{desc}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setEditando(null)}
                        className="rounded px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-100"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => guardarEdicion(l.id)}
                        disabled={isPending}
                        className="flex items-center gap-1 rounded bg-marca px-2.5 py-1 text-xs font-semibold text-white hover:bg-marca/90 disabled:opacity-50"
                      >
                        {isPending ? <LoaderCircle size={12} className="animate-spin" /> : <Check size={12} />} Guardar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between border-t border-borde/60 pt-2 text-xs">
                    <span className="text-texto-2">
                      Ajuste: <b className="text-gray-900">{l.ajuste_pct === 0 ? "0%" : porcentaje(l.ajuste_pct)}</b>
                    </span>
                    <span className="text-texto-2">
                      {REDONDEOS[l.redondeo] ?? l.redondeo}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Columna Derecha: Precios y Excepciones por Artículo para la lista activa */}
        <div className="space-y-4 lg:col-span-2">
          {listaActual && (
            <div className="rounded-xl border border-borde bg-white p-5 shadow-xs">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-borde pb-4">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">
                    Precios en lista: {listaActual.nombre}
                  </h2>
                  <p className="text-xs text-texto-2">
                    Ajuste general: <b>{porcentaje(listaActual.ajuste_pct)}</b> ({REDONDEOS[listaActual.redondeo]}).
                    Podés definir un precio fijo exacto por artículo si no querés usar el ajuste automático.
                  </p>
                </div>
                <div className="w-full sm:w-64">
                  <input
                    type="search"
                    placeholder="Buscar artículo..."
                    value={filtroArticulos}
                    onChange={(e) => setFiltroArticulos(e.target.value)}
                    className="campo text-xs"
                  />
                </div>
              </div>

              <div className="overflow-x-auto mt-4 max-h-[500px]">
                <table className="tabla">
                  <thead className="sticky top-0 bg-white">
                    <tr>
                      <th>Artículo</th>
                      <th>Precio base</th>
                      <th>Ajuste de lista</th>
                      <th>Precio final en lista</th>
                      <th className="w-32 text-right">Precio fijo (excepción)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {articulosFiltrados.slice(0, 50).map((a) => {
                      const excepcion = mapaExcepciones.get(a.id);
                      const tieneFijo = excepcion !== undefined;
                      const precioCalculado = calcularPrecioLista(
                        a.precio_venta,
                        listaActual.ajuste_pct,
                        listaActual.redondeo
                      );
                      const precioFinal = tieneFijo ? excepcion : precioCalculado;

                      return (
                        <tr key={a.id}>
                          <td>
                            <div className="font-medium text-gray-900">{a.nombre}</div>
                            <div className="text-xs text-texto-2 font-mono">{a.codigo} · {a.marca}</div>
                          </td>
                          <td className="tabular-nums text-texto-2">
                            {pesos(a.precio_venta)}
                          </td>
                          <td className="tabular-nums">
                            {tieneFijo ? (
                              <span className="chip bg-purple-50 text-purple-700">Fijo</span>
                            ) : listaActual.ajuste_pct === 0 ? (
                              <span className="text-texto-2">—</span>
                            ) : (
                              <span className={`chip ${listaActual.ajuste_pct > 0 ? "bg-amber-50 text-alerta" : "bg-green-50 text-ok"}`}>
                                {porcentaje(listaActual.ajuste_pct)}
                              </span>
                            )}
                          </td>
                          <td className="font-semibold tabular-nums text-gray-900">
                            {pesos(precioFinal)}
                          </td>
                          <td className="text-right">
                            {puedeVenta ? (
                              <div className="flex items-center justify-end gap-1.5">
                                <input
                                  type="number"
                                  defaultValue={tieneFijo ? excepcion : ""}
                                  placeholder={String(precioCalculado)}
                                  onBlur={(e) => {
                                    const val = e.target.value.trim();
                                    const num = val === "" ? null : Number(val);
                                    if (num !== excepcion) {
                                      startTransition(async () => {
                                        await guardarPrecioExcepcion(listaActual.id, a.id, num);
                                      });
                                    }
                                  }}
                                  className="h-7 w-24 rounded border border-borde px-2 text-right text-xs tabular-nums text-gray-900 placeholder:text-gray-300"
                                />
                                {tieneFijo && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      startTransition(async () => {
                                        await guardarPrecioExcepcion(listaActual.id, a.id, null);
                                      });
                                    }}
                                    className="rounded p-1 text-gray-400 hover:text-error"
                                    title="Quitar precio fijo y volver al cálculo automático"
                                  >
                                    <X size={13} />
                                  </button>
                                )}
                              </div>
                            ) : (
                              <span className="tabular-nums text-xs text-texto-2">
                                {tieneFijo ? pesos(excepcion) : "Automático"}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {articulosFiltrados.length > 50 && (
                <p className="mt-3 text-center text-xs text-texto-2">
                  Mostrando los primeros 50 artículos de {articulosFiltrados.length}. Usá el buscador para encontrar artículos específicos.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
