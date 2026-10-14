"use client";
// Cobro con QR: usar una sucursal y una caja que ya existen en Mercado Pago, o crear una nueva (con la dirección del local), y la regla de «esperar el pago».
import { useActionState, useState, useTransition } from "react";
import { CircleCheck, QrCode, Search } from "lucide-react";
import { buscarSucursalesQr, desvincularQr, guardarEsperaPago, prepararQr, usarSucursalQr, type SucursalMp } from "./acciones";

// Los nombres como los acepta Mercado Pago (la Ciudad de Buenos Aires es «Capital Federal»)
const PROVINCIAS = ["Capital Federal", "Buenos Aires", "Catamarca", "Chaco", "Chubut", "Córdoba", "Corrientes", "Entre Ríos", "Formosa", "Jujuy", "La Pampa", "La Rioja", "Mendoza", "Misiones", "Neuquén", "Río Negro", "Salta", "San Juan", "San Luis", "Santa Cruz", "Santa Fe", "Santiago del Estero", "Tierra del Fuego", "Tucumán"];
type Aviso = { error?: string; ok?: string };
const Mensaje = ({ a }: { a: Aviso }) => a.error ? <p className="text-sm text-error" role="alert">{a.error}</p> : a.ok ? <p className="flex items-center gap-1.5 text-sm text-ok"><CircleCheck size={15} /> {a.ok}</p> : null;

export default function CobroQr({ listo, hayToken, fijo, cajaExterna, espera }: {
  listo: boolean; hayToken: boolean; fijo?: { imagen?: string | null; plantilla?: string | null } | null; cajaExterna?: string | null; espera: boolean }) {
  const [crear, accionCrear, creando] = useActionState(prepararQr, {});
  const [busca, buscar] = useTransition();
  const [sucursales, setSucursales] = useState<SucursalMp[] | null>(null);
  const [elegida, setElegida] = useState("");       // «<sucursal>|<caja>|<externo>»; caja vacía = crear una caja nueva
  const [aviso, setAviso] = useState<Aviso>({});
  const [guardando, guardar] = useTransition();
  const [esperaAhora, setEspera] = useState(espera);

  const encontrar = () => buscar(async () => { const r = await buscarSucursalesQr(); setAviso(r.error ? { error: r.error } : {}); setSucursales(r.sucursales ?? null); });
  const usar = () => guardar(async () => { const [s, c, e] = elegida.split("|"); setAviso(await usarSucursalQr(s, c ?? "", e ?? "")); });

  return (
    <div className="space-y-4 px-5 py-4">
      <p className="flex items-center gap-2 font-semibold"><QrCode size={17} strokeWidth={1.8} /> Cobro con QR</p>

      {listo ? (
        <div className="space-y-3">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-green-50 p-3 text-sm font-semibold text-ok"><CircleCheck size={16} /> Preparado{cajaExterna ? ` · caja ${cajaExterna}` : ""}
            <button type="button" className="font-medium underline" onClick={() => guardar(async () => { setAviso(await desvincularQr()); })} disabled={guardando}>Usar otra sucursal</button></p>
          {(fijo?.imagen || fijo?.plantilla) && (
            <div className="flex flex-wrap items-center gap-4 rounded-lg border border-borde p-3">
              {fijo.imagen && <img src={fijo.imagen} alt="QR fijo del mostrador" width={120} height={120} className="rounded bg-white" />}
              <div className="min-w-48 flex-1 space-y-1 text-sm">
                <p className="font-semibold">QR fijo del mostrador</p>
                <p className="text-texto-2">Imprimilo y pegalo en el mostrador una sola vez. En la caja, «Con el QR del mostrador» le carga el monto de cada venta y el cliente lo ve al escanearlo.</p>
                {fijo.plantilla && <a href={fijo.plantilla} target="_blank" rel="noreferrer" className="inline-block font-medium text-marca">Abrir para imprimir</a>}
              </div>
            </div>
          )}
          <Mensaje a={aviso} />
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-texto-2">La caja muestra un QR con el monto de la venta y el cliente paga escaneándolo. Mercado Pago necesita una sucursal y una caja: usá las que ya tenés o creá nuevas.</p>
          <div className="space-y-2 rounded-lg border border-borde p-3">
            <p className="text-sm font-semibold">Mis sucursales en Mercado Pago</p>
            <button type="button" className="boton-sec" onClick={encontrar} disabled={busca || !hayToken}><Search size={15} strokeWidth={1.8} /> {busca ? "Buscando…" : "Buscar mis sucursales"}</button>
            {!hayToken && <p className="text-xs text-texto-2">Primero cargá el Access Token arriba.</p>}
            {sucursales && sucursales.length === 0 && <p className="text-sm text-texto-2">No hay sucursales en tu cuenta: creá una abajo.</p>}
            {sucursales && sucursales.length > 0 && (
              <div className="space-y-3">
                {sucursales.map((s) => (
                  <fieldset key={s.id} className="space-y-1 rounded-lg bg-gray-50 p-3">
                    <legend className="px-1 text-sm font-semibold">{s.nombre}{s.direccion ? <span className="font-normal text-texto-2"> · {s.direccion}</span> : null}</legend>
                    {s.cajas.map((c) => (
                      <label key={c.id} className="flex items-center gap-2 text-sm"><input type="radio" name="caja-qr" value={`${s.id}|${c.id}|${c.externo ?? ""}`} checked={elegida === `${s.id}|${c.id}|${c.externo ?? ""}`} onChange={(e) => setElegida(e.target.value)} />
                        {c.nombre}{c.externo ? <span className="text-xs text-texto-2"> ({c.externo})</span> : <span className="text-xs text-alerta"> (sin identificador)</span>}</label>
                    ))}
                    <label className="flex items-center gap-2 text-sm"><input type="radio" name="caja-qr" value={`${s.id}||`} checked={elegida === `${s.id}||`} onChange={(e) => setElegida(e.target.value)} /> Crear una caja nueva en esta sucursal</label>
                  </fieldset>
                ))}
                <button type="button" className="boton" onClick={usar} disabled={guardando || !elegida}>{guardando ? "Preparando…" : "Usar esta"}</button>
              </div>
            )}
            <Mensaje a={aviso} />
          </div>

          <details className="rounded-lg border border-borde p-3">
            <summary className="cursor-pointer text-sm font-semibold">O crear una sucursal nueva</summary>
            <form action={accionCrear} className="mt-3 space-y-3">
              <p className="text-sm text-texto-2">Mercado Pago pide la dirección del local una sola vez para crear la sucursal y la caja.</p>
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="sm:col-span-2"><label className="etiqueta" htmlFor="calle">Calle</label><input id="calle" name="calle" className="campo" autoComplete="off" /></div>
                <div><label className="etiqueta" htmlFor="numero">Número</label><input id="numero" name="numero" className="campo" inputMode="numeric" autoComplete="off" /></div>
                <div><label className="etiqueta" htmlFor="ciudad">Ciudad o localidad</label><input id="ciudad" name="ciudad" className="campo" autoComplete="off" placeholder="Rosario" /></div>
                <div className="sm:col-span-2"><label className="etiqueta" htmlFor="provincia">Provincia</label>
                  <select id="provincia" name="provincia" className="campo" defaultValue=""><option value="" disabled>Elegí la provincia</option>{PROVINCIAS.map((p) => <option key={p}>{p}</option>)}</select></div>
              </div>
              <Mensaje a={crear} />
              <button className="boton" disabled={creando || !hayToken}>{creando ? "Preparando…" : "Crear y preparar"}</button>
            </form>
          </details>
        </div>
      )}

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={esperaAhora} onChange={(e) => { const v = e.target.checked; setEspera(v); guardar(async () => { setAviso(await guardarEsperaPago(v)); }); }} className="mt-1" />
        <span><b>Esperar el pago antes de confirmar la venta.</b> <span className="text-texto-2">Mientras un cobro por posnet o QR está pendiente, la caja no confirma la venta ni suelta el ticket hasta que Mercado Pago lo apruebe (o se cancele el cobro).</span></span>
      </label>
    </div>
  );
}
