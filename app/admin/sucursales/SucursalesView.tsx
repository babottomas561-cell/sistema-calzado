"use client";
// Vista y gestión de sucursales, cajas (puntos de venta), depósitos y transferencias de stock.
import { useState, useActionState } from "react";
import {
  ArrowLeftRight, Edit2, MapPin, Phone, Plus, Store, Warehouse, X,
} from "lucide-react";
import ParametroMultisucursal from "../tablas/ParametroMultisucursal";
import {
  guardarSucursal, guardarPuntoVenta, guardarDeposito, transferirStockEntreDepositos,
} from "./acciones";

export type SucursalFila = {
  id: number;
  codigo: string;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  deposito_id: number | null;
  es_casa_central: boolean;
  activa: boolean;
};

export type PuntoVentaFila = {
  id: number;
  sucursal_id: number;
  numero: number;
  nombre: string;
  tipo: string;
  activo: boolean;
};

export type DepositoFila = {
  id: number;
  nombre: string;
  sucursal_id: number | null;
  vendible: boolean;
  activo: boolean;
};

export type VarianteOpcion = {
  variante_id: number;
  nombre: string;
  marca: string | null;
  talle: string | null;
  color: string | null;
  sku: string;
};

export default function SucursalesView({
  sucursales,
  puntosVenta,
  depositos,
  variantes,
  activaInicial,
}: {
  sucursales: SucursalFila[];
  puntosVenta: PuntoVentaFila[];
  depositos: DepositoFila[];
  variantes: VarianteOpcion[];
  activaInicial: boolean;
}) {
  const [pestana, setPestana] = useState<"sucursales" | "depositos">("sucursales");
  const [modalSucursal, setModalSucursal] = useState<SucursalFila | null | "nueva">(null);
  const [modalPunto, setModalPunto] = useState<{ punto?: PuntoVentaFila; sucursalId: number } | null>(null);
  const [modalDeposito, setModalDeposito] = useState<DepositoFila | null | "nuevo">(null);
  const [modalTransferencia, setModalTransferencia] = useState(false);

  const [estadoSucursal, accionSucursal, pendienteSucursal] = useActionState(guardarSucursal, {});
  const [estadoPunto, accionPunto, pendientePunto] = useActionState(guardarPuntoVenta, {});
  const [estadoDeposito, accionDeposito, pendienteDeposito] = useActionState(guardarDeposito, {});
  const [estadoTransferencia, accionTransferencia, pendienteTransferencia] = useActionState(transferirStockEntreDepositos, {});

  return (
    <div className="space-y-6">
      <ParametroMultisucursal activaInicial={activaInicial} />

      {/* Pestañas internas */}
      <nav className="flex gap-2 border-b border-borde pb-2">
        <button
          type="button"
          onClick={() => setPestana("sucursales")}
          className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
            pestana === "sucursales"
              ? "bg-white text-marca shadow-xs ring-1 ring-borde"
              : "text-texto-2 hover:bg-white/60 hover:text-gray-900"
          }`}
        >
          <Store size={16} /> Sucursales y Puntos de venta
          <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-xs font-bold text-gray-700">
            {sucursales.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setPestana("depositos")}
          className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
            pestana === "depositos"
              ? "bg-white text-marca shadow-xs ring-1 ring-borde"
              : "text-texto-2 hover:bg-white/60 hover:text-gray-900"
          }`}
        >
          <Warehouse size={16} /> Depósitos y Transferencias
          <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-xs font-bold text-gray-700">
            {depositos.length}
          </span>
        </button>
      </nav>

      {pestana === "sucursales" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Locales y Sucursales físicas</h2>
              <p className="text-xs text-texto-2">
                Cada sucursal numera sus comprobantes con sus propios puntos de venta y descuenta stock de su depósito.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setModalSucursal("nueva")}
              className="flex items-center gap-1.5 rounded-lg bg-marca px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-marca/90"
            >
              <Plus size={14} /> Nueva sucursal
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {sucursales.map((s) => {
              const cajas = puntosVenta.filter((p) => p.sucursal_id === s.id);
              const dep = depositos.find((d) => d.id === s.deposito_id);
              return (
                <div
                  key={s.id}
                  className={`rounded-xl border bg-white p-5 shadow-xs space-y-4 ${
                    s.activa ? "border-borde" : "border-borde/60 opacity-60"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 border-b border-borde pb-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-marca">
                          <Store size={18} />
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-gray-900">{s.nombre}</h3>
                            {s.es_casa_central && (
                              <span className="rounded-full bg-marca-suave px-2 py-0.5 text-[10px] font-bold text-marca">
                                Casa Central
                              </span>
                            )}
                            {!s.activa && (
                              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-texto-2">
                                Inactiva
                              </span>
                            )}
                          </div>
                          <span className="font-mono text-xs text-texto-2 font-semibold">{s.codigo}</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-texto-2 pt-1">
                        {s.direccion && (
                          <span className="flex items-center gap-1">
                            <MapPin size={12} /> {s.direccion}
                          </span>
                        )}
                        {s.telefono && (
                          <span className="flex items-center gap-1">
                            <Phone size={12} /> {s.telefono}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Warehouse size={12} /> Depósito: <b>{dep ? dep.nombre : "Sin depósito asignado"}</b>
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setModalSucursal(s)}
                      className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                      title="Editar sucursal"
                    >
                      <Edit2 size={15} />
                    </button>
                  </div>

                  {/* Cajas / Puntos de Venta */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-texto-2">
                        Puntos de venta (Cajas)
                      </span>
                      <button
                        type="button"
                        onClick={() => setModalPunto({ sucursalId: s.id })}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-marca hover:underline"
                      >
                        <Plus size={12} /> Agregar caja
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {cajas.map((c) => (
                        <div
                          key={c.id}
                          className="flex items-center justify-between rounded-lg border border-borde bg-gray-50/70 px-3 py-2 text-xs"
                        >
                          <div>
                            <div className="font-semibold text-gray-900">
                              {c.nombre} <span className="font-mono text-[11px] text-texto-2">({String(c.numero).padStart(4, "0")})</span>
                            </div>
                            <span className="text-[11px] text-texto-2 capitalize">{c.tipo}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setModalPunto({ punto: c, sucursalId: s.id })}
                            className="rounded p-1 text-gray-400 hover:text-gray-700"
                          >
                            <Edit2 size={13} />
                          </button>
                        </div>
                      ))}
                      {cajas.length === 0 && (
                        <p className="col-span-2 text-xs text-texto-2 italic">No tiene cajas configuradas todavía.</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {pestana === "depositos" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Depósitos de Stock</h2>
              <p className="text-xs text-texto-2">
                Espacios de almacenamiento (locales, depósitos centrales o fallados) y transferencias entre ellos.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setModalTransferencia(true)}
                className="flex items-center gap-1.5 rounded-lg border border-borde bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-xs hover:bg-gray-50"
              >
                <ArrowLeftRight size={14} /> Transferir stock
              </button>
              <button
                type="button"
                onClick={() => setModalDeposito("nuevo")}
                className="flex items-center gap-1.5 rounded-lg bg-marca px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-marca/90"
              >
                <Plus size={14} /> Nuevo depósito
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-borde bg-white shadow-xs">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Sucursal asociada</th>
                  <th>Habilitado para la venta</th>
                  <th>Estado</th>
                  <th className="w-12 text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {depositos.map((d) => {
                  const suc = sucursales.find((s) => s.id === d.sucursal_id);
                  return (
                    <tr key={d.id}>
                      <td className="font-semibold text-gray-900">{d.nombre}</td>
                      <td>{suc ? suc.nombre : <span className="text-texto-2">— General —</span>}</td>
                      <td>
                        {d.vendible ? (
                          <span className="chip bg-green-100 text-ok">Vendible</span>
                        ) : (
                          <span className="chip bg-gray-100 text-texto-2">No vende (almacén/fallados)</span>
                        )}
                      </td>
                      <td>
                        {d.activo ? (
                          <span className="text-ok font-medium text-xs">Activo</span>
                        ) : (
                          <span className="text-texto-2 font-medium text-xs">Inactivo</span>
                        )}
                      </td>
                      <td className="text-right">
                        <button
                          type="button"
                          onClick={() => setModalDeposito(d)}
                          className="rounded p-1 text-gray-400 hover:text-gray-700"
                        >
                          <Edit2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Sucursal */}
      {modalSucursal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-borde pb-3">
              <h3 className="font-semibold text-gray-900">
                {modalSucursal === "nueva" ? "Nueva sucursal" : `Editar sucursal ${modalSucursal.nombre}`}
              </h3>
              <button type="button" onClick={() => setModalSucursal(null)} className="text-gray-400 hover:text-gray-700">
                <X size={18} />
              </button>
            </div>
            <form action={accionSucursal} className="space-y-3">
              {modalSucursal !== "nueva" && <input type="hidden" name="id" value={modalSucursal.id} />}
              <div>
                <label className="text-xs font-semibold text-gray-700">Código</label>
                <input
                  name="codigo"
                  required
                  defaultValue={modalSucursal !== "nueva" ? modalSucursal.codigo : ""}
                  placeholder="SUC-02"
                  className="campo font-mono uppercase text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700">Nombre de la sucursal</label>
                <input
                  name="nombre"
                  required
                  defaultValue={modalSucursal !== "nueva" ? modalSucursal.nombre : ""}
                  placeholder="Sucursal Shopping"
                  className="campo text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700">Dirección</label>
                <input
                  name="direccion"
                  defaultValue={modalSucursal !== "nueva" ? (modalSucursal.direccion ?? "") : ""}
                  placeholder="Av. Santa Fe 1234"
                  className="campo text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700">Teléfono</label>
                <input
                  name="telefono"
                  defaultValue={modalSucursal !== "nueva" ? (modalSucursal.telefono ?? "") : ""}
                  placeholder="11-2345-6789"
                  className="campo text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700">Depósito asignado</label>
                <select
                  name="deposito_id"
                  defaultValue={modalSucursal !== "nueva" ? String(modalSucursal.deposito_id ?? "") : ""}
                  className="campo text-xs"
                >
                  <option value="">— Ninguno / Seleccionar después —</option>
                  {depositos.map((d) => (
                    <option key={d.id} value={d.id}>{d.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="activa"
                  name="activa"
                  value="1"
                  defaultChecked={modalSucursal === "nueva" ? true : modalSucursal.activa}
                  className="h-4 w-4 rounded border-borde text-marca focus:ring-marca"
                />
                <label htmlFor="activa" className="text-xs font-medium text-gray-700">Sucursal activa</label>
              </div>
              {estadoSucursal?.error && <p className="text-xs text-error">{estadoSucursal.error}</p>}
              <div className="flex justify-end gap-2 pt-3 border-t border-borde">
                <button type="button" onClick={() => setModalSucursal(null)} className="boton-sec">Cancelar</button>
                <button type="submit" disabled={pendienteSucursal} className="boton">
                  {pendienteSucursal ? "Guardando..." : "Guardar sucursal"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Punto de Venta */}
      {modalPunto && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-borde pb-3">
              <h3 className="font-semibold text-gray-900">
                {modalPunto.punto ? "Editar caja / punto de venta" : "Nuevo punto de venta"}
              </h3>
              <button type="button" onClick={() => setModalPunto(null)} className="text-gray-400 hover:text-gray-700">
                <X size={18} />
              </button>
            </div>
            <form action={accionPunto} className="space-y-3">
              <input type="hidden" name="sucursal_id" value={modalPunto.sucursalId} />
              {modalPunto.punto && <input type="hidden" name="id" value={modalPunto.punto.id} />}
              <div>
                <label className="text-xs font-semibold text-gray-700">Número de punto de venta (1-9999)</label>
                <input
                  name="numero"
                  type="number"
                  min={1}
                  max={9999}
                  required
                  defaultValue={modalPunto.punto ? modalPunto.punto.numero : 2}
                  className="campo font-mono text-xs tabular-nums"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700">Nombre descriptivo</label>
                <input
                  name="nombre"
                  required
                  defaultValue={modalPunto.punto ? modalPunto.punto.nombre : ""}
                  placeholder="Caja 2 / Mostrador"
                  className="campo text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700">Tipo de caja</label>
                <select
                  name="tipo"
                  defaultValue={modalPunto.punto ? modalPunto.punto.tipo : "mostrador"}
                  className="campo text-xs"
                >
                  <option value="mostrador">Mostrador / Local</option>
                  <option value="web">Tienda Online / Web</option>
                  <option value="fiscal">Fiscal / ARCA</option>
                </select>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="activo_punto"
                  name="activo"
                  value="1"
                  defaultChecked={modalPunto.punto ? modalPunto.punto.activo : true}
                  className="h-4 w-4 rounded border-borde text-marca focus:ring-marca"
                />
                <label htmlFor="activo_punto" className="text-xs font-medium text-gray-700">Caja activa</label>
              </div>
              {estadoPunto?.error && <p className="text-xs text-error">{estadoPunto.error}</p>}
              <div className="flex justify-end gap-2 pt-3 border-t border-borde">
                <button type="button" onClick={() => setModalPunto(null)} className="boton-sec">Cancelar</button>
                <button type="submit" disabled={pendientePunto} className="boton">
                  {pendientePunto ? "Guardando..." : "Guardar caja"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Depósito */}
      {modalDeposito && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-borde pb-3">
              <h3 className="font-semibold text-gray-900">
                {modalDeposito === "nuevo" ? "Nuevo depósito" : "Editar depósito"}
              </h3>
              <button type="button" onClick={() => setModalDeposito(null)} className="text-gray-400 hover:text-gray-700">
                <X size={18} />
              </button>
            </div>
            <form action={accionDeposito} className="space-y-3">
              {modalDeposito !== "nuevo" && <input type="hidden" name="id" value={modalDeposito.id} />}
              <div>
                <label className="text-xs font-semibold text-gray-700">Nombre del depósito</label>
                <input
                  name="nombre"
                  required
                  defaultValue={modalDeposito !== "nuevo" ? modalDeposito.nombre : ""}
                  placeholder="Depósito Central"
                  className="campo text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700">Sucursal asociada</label>
                <select
                  name="sucursal_id"
                  defaultValue={modalDeposito !== "nuevo" ? String(modalDeposito.sucursal_id ?? "") : ""}
                  className="campo text-xs"
                >
                  <option value="">— Ninguna (Depósito general) —</option>
                  {sucursales.map((s) => (
                    <option key={s.id} value={s.id}>{s.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="vendible"
                  name="vendible"
                  value="1"
                  defaultChecked={modalDeposito === "nuevo" ? true : modalDeposito.vendible}
                  className="h-4 w-4 rounded border-borde text-marca focus:ring-marca"
                />
                <label htmlFor="vendible" className="text-xs font-medium text-gray-700">
                  Vendible (disponible para vender y mostrar en catálogo)
                </label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="activo_dep"
                  name="activo"
                  value="1"
                  defaultChecked={modalDeposito === "nuevo" ? true : modalDeposito.activo}
                  className="h-4 w-4 rounded border-borde text-marca focus:ring-marca"
                />
                <label htmlFor="activo_dep" className="text-xs font-medium text-gray-700">Depósito activo</label>
              </div>
              {estadoDeposito?.error && <p className="text-xs text-error">{estadoDeposito.error}</p>}
              <div className="flex justify-end gap-2 pt-3 border-t border-borde">
                <button type="button" onClick={() => setModalDeposito(null)} className="boton-sec">Cancelar</button>
                <button type="submit" disabled={pendienteDeposito} className="boton">
                  {pendienteDeposito ? "Guardando..." : "Guardar depósito"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Transferencia de Stock */}
      {modalTransferencia && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-borde pb-3">
              <h3 className="font-semibold text-gray-900">Transferir stock entre depósitos</h3>
              <button type="button" onClick={() => setModalTransferencia(false)} className="text-gray-400 hover:text-gray-700">
                <X size={18} />
              </button>
            </div>
            <form action={accionTransferencia} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-700">Artículo / Variante</label>
                <select name="variante_id" required className="campo text-xs">
                  <option value="">— Elegir variante —</option>
                  {variantes.map((v) => (
                    <option key={v.variante_id} value={v.variante_id}>
                      {v.nombre} ({v.talle ?? ""} - {v.color ?? ""}) [{v.sku}]
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-700">Depósito Origen</label>
                  <select name="origen_id" required className="campo text-xs">
                    {depositos.map((d) => (
                      <option key={d.id} value={d.id}>{d.nombre}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700">Depósito Destino</label>
                  <select name="destino_id" required className="campo text-xs">
                    {depositos.map((d) => (
                      <option key={d.id} value={d.id}>{d.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700">Cantidad a transferir</label>
                <input
                  name="cantidad"
                  type="number"
                  min={1}
                  required
                  placeholder="1"
                  className="campo text-xs tabular-nums"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700">Motivo / Observación (opcional)</label>
                <input
                  name="motivo"
                  placeholder="Reposición de sucursal..."
                  className="campo text-xs"
                />
              </div>
              {estadoTransferencia?.error && <p className="text-xs text-error">{estadoTransferencia.error}</p>}
              {estadoTransferencia?.ok && <p className="text-xs text-ok">{estadoTransferencia.ok}</p>}
              <div className="flex justify-end gap-2 pt-3 border-t border-borde">
                <button type="button" onClick={() => setModalTransferencia(false)} className="boton-sec">Cerrar</button>
                <button type="submit" disabled={pendienteTransferencia} className="boton">
                  {pendienteTransferencia ? "Transfiriendo..." : "Confirmar transferencia"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
