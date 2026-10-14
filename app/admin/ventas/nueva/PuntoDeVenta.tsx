"use client";
// La caja: se arma la venta (con lector de códigos o tocando el producto), se ve el total siempre y se cobra con uno o varios medios.
//   · Cobro: un toque por medio (cada botón dice cuánto se cobra con ese medio), o dividido por porcentaje o por monto.
//   · Efectivo: redondeo hacia abajo (con el tope de la base) y cálculo del vuelto.
//   · Cliente, descuento y canal quedan a mano pero plegados: la mayoría de las ventas no los usa.
//   · En el celular, la venta queda abajo en una barra con el total; «Cobrar» abre el cobro a pantalla completa.
// La cuenta definitiva la hace la base (registrar_venta): precios, promociones, topes y redondeo se vuelven a controlar ahí.
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeftRight, BadgePercent, Banknote, ChevronDown, CircleAlert, CreditCard, Gift, KeyRound, Minus, Plus, Printer, ScanBarcode, ShieldCheck, ShoppingBag, Smartphone,
  SplitSquareHorizontal, Trash2, User, UserPlus, Wallet, X, FileCheck2, ReceiptText, type LucideIcon } from "lucide-react";
import SelectorVariantes, { type FilaStock } from "@/components/SelectorVariantes";
import DatosFiscales from "@/components/DatosFiscales";
import CambioRapido from "./CambioRapido";
import { cuitValido, letraPara } from "@/lib/fiscal";
import { pesos, porcentaje } from "@/lib/formato";
import { billetesSugeridos, calcularCobro, opcionesRedondeo, pagosParaLaBase, REPARTOS, totalCon, vuelto, type LineaPago, type MedioCobro } from "@/lib/cobro";
import { autorizarDescuento, cotizarMostrador, crearClienteRapido, registrarVenta, type CotizacionMostrador } from "../acciones";

type Item = FilaStock & { cantidad: number; precio: number };
type Cliente = { id: number; nombre: string; telefono: string | null; saldo: number; documento?: string | null; condicion_iva?: string | null; tipo_documento?: string | null };
const CANALES = ["Local", "Instagram", "WhatsApp", "Web"];

// Un ícono por tipo de medio de pago (el tipo se elige en Tablas → Medios de pago)
const ICONO_MEDIO: Record<string, LucideIcon> = { Efectivo: Banknote, Transferencia: ArrowLeftRight, "Débito": CreditCard, "Crédito": CreditCard, Billetera: Smartphone };
const iconoMedio = (m: MedioCobro & { es_saldo?: boolean | null }): LucideIcon => (m.es_saldo ? Gift : ICONO_MEDIO[m.tipo ?? ""] ?? Wallet);

// Los tres pasos de la caja, con su número (es una secuencia de verdad: primero se arma, después se cobra)
function Paso({ n, titulo, listo, children }: { n: number; titulo: string; listo?: boolean; children?: React.ReactNode }) {
  return (
    <div className="flex w-full items-center gap-2">
      <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${listo ? "bg-ok text-white" : "bg-marca text-white"}`} aria-hidden>{n}</span>
      <h3 className="whitespace-nowrap text-sm font-semibold">{titulo}</h3>
      {children}
    </div>
  );
}

// Cliente, descuento y canal: un botón chico cada uno, en una sola fila; al tocarlo se abre debajo
function Opcion({ icono: Icono, valor, activo, abierto, alAlternar }: { icono: LucideIcon; valor: React.ReactNode; activo: boolean; abierto: boolean; alAlternar: () => void }) {
  return (
    <button type="button" onClick={alAlternar} aria-expanded={abierto}
      className={`inline-flex h-9 max-w-full items-center gap-1.5 rounded-full border px-3 text-sm transition-colors ${abierto ? "border-marca bg-marca-suave text-marca" : activo ? "border-marca/40 bg-white font-medium text-gray-900" : "border-borde bg-white text-gray-700 hover:bg-gray-50"}`}>
      <Icono size={15} strokeWidth={1.8} className="shrink-0" /><span className="truncate">{valor}</span><ChevronDown size={14} className={`shrink-0 transition-transform duration-200 ${abierto ? "rotate-180" : ""}`} />
    </button>
  );
}

export default function PuntoDeVenta({ filas, clientes: clientesBase, medios, cambiaPrecio, descuentoMax, impresion, masVendidos, puedeCrearCliente, facturacion }: {
  facturacion: { modo: "todas" | "elegir"; porDefecto: "fiscal" | "interna"; letra: string; pruebas: boolean; umbral: number } | null;
  filas: FilaStock[]; clientes: Cliente[]; masVendidos: number[]; puedeCrearCliente: boolean; medios: (MedioCobro & { es_saldo?: boolean | null; siempre_factura?: boolean | null })[]; cambiaPrecio: boolean; descuentoMax: number | null;
  impresion: { configurada: boolean; modo: string; puedeConfigurar: boolean };
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [lineas, setLineas] = useState<LineaPago[]>(medios.length ? [{ medio_pago_id: medios[0].id, modo: "monto", valor: 0 }] : []);
  const [multiplo, setMultiplo] = useState<number | null>(null);
  const [recibido, setRecibido] = useState("");
  const [canal, setCanal] = useState("Local");
  const [nuevos, setNuevos] = useState<Cliente[]>([]);   // clientes creados desde esta caja (la lista de la página no se vuelve a leer)
  const clientes = useMemo(() => [...nuevos, ...clientesBase], [nuevos, clientesBase]);
  const [altaCliente, setAltaCliente] = useState(false);
  const [altaNombre, setAltaNombre] = useState("");
  const [altaTelefono, setAltaTelefono] = useState("");
  const [altaError, setAltaError] = useState("");
  const altaFiscal = useRef<HTMLDivElement>(null);
  const [creando, setCreando] = useState(false);
  const [referencias, setReferencias] = useState<Record<number, string>>({});   // n.º de cupón / operación por medio de pago
  const [clienteId, setClienteId] = useState<number | null>(null);
  const [buscaCliente, setBuscaCliente] = useState("");
  const [descuento, setDescuento] = useState(0);
  const [autorizado, setAutorizado] = useState<{ monto: number; quien: string } | null>(null);   // descuento sobre el tope autorizado con el PIN de un encargado
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [validandoPin, setValidandoPin] = useState(false);
  const [abierto, setAbierto] = useState<"cliente" | "descuento" | "canal" | null>(null);
  const [panel, setPanel] = useState(false);
  const [cambio, setCambio] = useState<string | null>(null);   // el panel de cambio o devolución (con lo que se escaneó)   // en el celular: el cobro a pantalla completa
  const [estado, accion, cargando] = useActionState(registrarVenta, {});
  // Con ARCA activa: «Factura» o «Comprobante interno» (si el local deja elegir; si no, siempre factura)
  const [elegido, setFacturar] = useState(facturacion ? facturacion.modo === "todas" || facturacion.porDefecto === "fiscal" : false);
  const cliente = clientes.find((c) => c.id === clienteId) ?? null;
  // La letra que sale: con un cliente inscripto o monotributista con CUIT, A (si el local es inscripto)
  const letra = facturacion ? letraPara(facturacion.letra, cliente) : "";
  const formulario = useRef<HTMLFormElement>(null);
  // «Saldo a favor» solo aparece si el cliente elegido tiene saldo (o si ya se eligió)
  const mediosVisibles = medios.filter((m) => !m.es_saldo || (cliente?.saldo ?? 0) > 0 || lineas.some((l) => l.medio_pago_id === m.id));

  const agregar = (f: FilaStock) => setItems((prev) => {
    const ya = prev.find((i) => i.variante_id === f.variante_id);
    if (ya) return prev.map((i) => i.variante_id === f.variante_id ? { ...i, cantidad: Math.min(i.cantidad + 1, f.stock) } : i);
    return [...prev, { ...f, cantidad: 1, precio: Number(f.precio_venta) }];
  });
  const cambiar = (id: number, campo: "cantidad" | "precio", valor: number) => setItems((prev) => prev.map((i) => i.variante_id === id ? { ...i, [campo]: valor } : i));
  const quitar = (id: number) => setItems((prev) => prev.filter((i) => i.variante_id !== id));
  const enVenta = useMemo(() => new Map(items.map((i) => [i.variante_id, i.cantidad])), [items]);
  const unidades = items.reduce((s, i) => s + i.cantidad, 0);

  // Promociones: las calcula la base (las mismas que va a aplicar registrar_venta)
  const [ultima, setCot] = useState<CotizacionMostrador | null>(null);
  const clave = JSON.stringify(items.map((i) => [i.variante_id, i.cantidad, i.precio]));
  useEffect(() => {
    if (!items.length) return;
    let vigente = true;
    const t = setTimeout(async () => { const r = await cotizarMostrador(items.map((i) => ({ variante_id: i.variante_id, cantidad: i.cantidad, precio_unitario: i.precio }))); if (vigente) setCot(r); }, 200);
    return () => { vigente = false; clearTimeout(t); };
  }, [clave]); // eslint-disable-line react-hooks/exhaustive-deps
  const cot = items.length ? ultima : null;
  const promoDe = (id: number) => (cot?.renglones ?? []).filter((r) => r.variante_id === id && r.descuento_promo > 0);

  const subtotal = items.reduce((s, i) => s + i.cantidad * i.precio, 0);
  const promos = cot?.descuento_promociones ?? 0;
  const acumulable = (cot?.renglones ?? []).reduce((s, r) => s + (r.acumula ? r.total : 0), 0);
  const factor = cot && subtotal - promos > 0 ? acumulable / (subtotal - promos) : 1;
  const conPromos = Math.max(subtotal - promos, 0);
  const neto = Math.max(conPromos - descuento, 0);
  const topeDescuento = descuentoMax === null ? null : Math.floor((conPromos * descuentoMax) / 100);
  const autorizadoOk = !!autorizado && descuento <= autorizado.monto;
  const pasaTope = topeDescuento !== null && descuento > topeDescuento && !autorizadoOk;

  const cobro = calcularCobro(neto, factor, lineas, medios, multiplo);
  const sinRedondeo = calcularCobro(neto, factor, lineas, medios, null);
  const efectivo = cobro.iEfectivo >= 0 ? cobro.lineas[cobro.iEfectivo] : null;
  const opciones = cobro.iEfectivo >= 0 ? opcionesRedondeo(sinRedondeo.lineas[cobro.iEfectivo].cobra) : [];
  const dividido = lineas.length > 1;
  const usaSaldo = cobro.lineas.some((l) => medios.find((m) => m.id === l.medio_pago_id)?.es_saldo);
  const montoRecibido = Number(recibido.replace(/\./g, "").replace(",", ".")) || 0;

  // Un medio «siempre con factura» (Tablas → Medios de pago) en el cobro: va con factura, sin opción (la base también lo hace cumplir)
  const medioObliga = facturacion ? medios.find((m) => m.siempre_factura && cobro.lineas.some((l) => l.medio_pago_id === m.id)) ?? null : null;
  const facturar = elegido || !!medioObliga;
  const sinDni = facturar && !!facturacion && cobro.total >= facturacion.umbral && !(/^\d{7,8}$/.test((cliente?.documento ?? "").replace(/\D/g, "")) || cuitValido(cliente?.documento));
  // Por qué no se puede confirmar (se dice, no solo se apaga el botón)
  const falta = !items.length ? "Agregá al menos un producto"
    : pasaTope ? `Tu descuento máximo es ${pesos(topeDescuento ?? 0)}: para más, pedíselo a un encargado`
    : descuento > conPromos ? "El descuento es mayor que el total"
    : cobro.excedido ? "Las partes del pago suman más que el total"
    : usaSaldo && !cliente ? "Para cobrar con saldo a favor, elegí el cliente"
    : !lineas.length ? "No hay medios de pago para el mostrador (se cargan en Tablas)"
    // Desde el umbral de la norma, ARCA pide identificar al consumidor final: se avisa antes de cobrar (si no, la factura sale rechazada)
    : sinDni ? `Para facturar ${pesos(facturacion!.umbral)} o más, ARCA pide el DNI: elegí el cliente (con su DNI cargado) o cobrá sin factura` : null;

  // Atajos para la compu de la caja: F2 va al buscador, F9 confirma la venta
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "F2") { e.preventDefault(); document.querySelector<HTMLInputElement>('input[aria-label^="Buscar modelo"]')?.focus(); }
      if (e.key === "F9") { e.preventDefault(); formulario.current?.requestSubmit(); }
      if (e.key === "F6") { e.preventDefault(); setCambio(""); }
      // F4: con factura / sin factura (solo si el local deja elegir)
      if (e.key === "F4" && facturacion?.modo === "elegir") { e.preventDefault(); setFacturar((x) => !x); }
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [facturacion?.modo]);

  // Con tarjeta, transferencia o billetera se puede anotar el número de cupón / operación (opcional; la base lo guarda en el pago)
  const pideReferencia = (m: MedioCobro & { es_saldo?: boolean | null }) => !m.es_saldo && !!m.tipo && m.tipo !== "Efectivo";
  const textoReferencia = (m: MedioCobro) => (m.tipo === "Transferencia" ? "N.º de operación" : m.tipo === "Billetera" ? "N.º de operación" : "N.º de cupón");
  const pagosConReferencia = pagosParaLaBase(cobro.lineas).map((p) => {
    const r = (referencias[p.medio_pago_id] ?? "").trim();
    return r ? { ...p, referencia: r } : p;
  });
  const venta = JSON.stringify({
    items: items.map((i) => ({ variante_id: i.variante_id, cantidad: i.cantidad, precio_unitario: i.precio })),
    pagos: pagosConReferencia, canal, cliente_id: cliente?.id ?? null, descuento,
  });

  const elegirMedio = (i: number, id: number) => { setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, medio_pago_id: id } : l))); setRecibido(""); };
  const dividir = () => {
    const otro = medios.find((m) => m.id !== lineas[0]?.medio_pago_id && !m.es_saldo) ?? medios[0];
    setLineas((ls) => [ls[0], { medio_pago_id: otro.id, modo: "pct", valor: 50 }]);
  };
  // Atajo 70 / 30: la segunda línea se queda con su parte y la primera completa
  const repartir = (parte: number) => setLineas((ls) => (ls.length < 2 ? ls : [ls[0], { ...ls[1], modo: "pct", valor: parte }, ...ls.slice(2)]));
  const clientesFiltrados = useMemo(() => {
    const q = buscaCliente.trim().toLowerCase();
    if (!q) return clientes.slice(0, 6);
    return clientes.filter((c) => c.nombre.toLowerCase().includes(q) || (c.telefono ?? "").replace(/\D/g, "").includes(q.replace(/\D/g, "") || "~")).slice(0, 6);
  }, [buscaCliente, clientes]);

  const pedirAutorizacion = async () => {
    setValidandoPin(true); setPinError("");
    const r = await autorizarDescuento(pin, descuento);
    setValidandoPin(false);
    if (!r.ok) { setPinError(r.error ?? "No se pudo autorizar"); return; }
    setAutorizado({ monto: descuento, quien: r.autoriza ?? "un encargado" }); setPin("");
  };
  const crearCliente = async () => {
    setCreando(true); setAltaError("");
    // Los datos para facturar del alta (si se completaron): se leen del bloque, que no es un formulario aparte (está dentro del de la venta)
    const fiscal = Object.fromEntries([...(altaFiscal.current?.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[name]") ?? [])].map((x) => [x.name, x.value]));
    const r = await crearClienteRapido(altaNombre, altaTelefono, fiscal);
    setCreando(false);
    if (r.error || !r.cliente) { setAltaError(r.error ?? "No se pudo crear el cliente"); return; }
    setNuevos((n) => [{ ...r.cliente!, saldo: 0 }, ...n]);
    setClienteId(r.cliente.id); setAltaCliente(false); setAltaNombre(""); setAltaTelefono(""); setBuscaCliente(""); setAbierto(null);
  };

  const porcentajesDescuento = [5, 10, 15, 20].filter((p) => descuentoMax === null || p <= descuentoMax);

  return (
    <div className="pantalla-completa pb-24 lg:pb-0">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(24rem,28rem)] lg:items-start 2xl:grid-cols-[minmax(0,1fr)_32rem]">
        <section className="min-w-0 space-y-3">
      {!impresion.configurada && impresion.modo !== "manual" && (
            <div role="alert" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm">
              <span className="flex items-start gap-2"><CircleAlert size={18} className="mt-0.5 shrink-0 text-error" />
                <span><b className="text-error">Falta configurar la impresión de comprobantes.</b> Se puede vender, pero no imprimir el comprobante hasta configurarla.</span></span>
              {impresion.puedeConfigurar
                ? <Link href="/admin/impresion?seccion=comprobantes" className="boton-sec ml-auto min-h-10"><Printer size={16} strokeWidth={1.8} /> Configurar ahora</Link>
                : <span className="ml-auto text-texto-2">Avisale al encargado.</span>}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-2xl font-bold">Nueva venta</h1>
            <span className="flex flex-wrap gap-2">
            <Link href="/admin/ventas?periodo=hoy&mias=1" className="boton-sec min-h-10 whitespace-nowrap" title="Lo que vendiste hoy: reimprimir, mandar o anular">
              <ReceiptText size={16} strokeWidth={1.8} /> Mis ventas de hoy</Link>
            <button type="button" onClick={() => setCambio("")} className="boton-sec min-h-10 whitespace-nowrap" title="Cambio o devolución (F6). También: escaneá el ticket del cliente">
              <ArrowLeftRight size={16} strokeWidth={1.8} /> Cambio o devolución <kbd className="ml-1 hidden rounded border border-borde bg-white px-1 text-[11px] font-sans text-texto-2 lg:inline">F6</kbd></button>
            </span>
          </div>
          {cambio !== null && <CambioRapido inicial={cambio} alCerrar={() => setCambio(null)} />}
          <Paso n={1} titulo="Agregá lo que se lleva" listo={items.length > 0}>
            <span className="ml-auto hidden whitespace-nowrap text-xs text-texto-2 xl:inline"><kbd className="rounded border border-borde bg-white px-1 font-sans">F2</kbd> buscar · <kbd className="rounded border border-borde bg-white px-1 font-sans">F9</kbd> confirmar{facturacion?.modo === "elegir" && <> · <kbd className="rounded border border-borde bg-white px-1 font-sans">F4</kbd> factura</>}</span>
          </Paso>
          <SelectorVariantes filas={filas} alElegir={agregar} soloConStock caja enVenta={enVenta} masVendidos={masVendidos} alComprobante={(n) => setCambio(n)} />
        </section>

        <form ref={formulario} action={accion} aria-label="Venta y cobro"
          className={`${panel ? "fixed inset-0 z-30 flex flex-col overflow-y-auto bg-fondo p-4" : "hidden"} lg:sticky lg:top-8 lg:z-auto lg:flex lg:h-[calc(100vh-4rem)] lg:flex-col lg:overflow-hidden lg:p-0`}>
          <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-borde bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-borde px-4 py-3">
              <ShoppingBag size={18} strokeWidth={1.8} className="text-texto-2" />
              <h2 className="font-semibold">Venta</h2>
              {unidades > 0 && <span className="rounded-full bg-marca-suave px-2 py-0.5 text-xs font-semibold text-marca">{unidades} {unidades === 1 ? "prenda" : "prendas"}</span>}
              {items.length > 0 && <button type="button" onClick={() => { setItems([]); setDescuento(0); setMultiplo(null); setRecibido(""); }} className="ml-auto rounded-md px-2 py-1 text-xs font-medium text-texto-2 hover:bg-gray-100 hover:text-error">Vaciar</button>}
              <button type="button" onClick={() => setPanel(false)} className="grid h-10 w-10 place-items-center rounded-md text-texto-2 hover:bg-gray-100 lg:hidden" aria-label="Volver a los productos"><X size={20} /></button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {/* Lo que se lleva */}
              {items.length === 0 ? (
                <div className="space-y-3 px-4 py-6 text-sm text-texto-2">
                  <p className="text-center font-medium text-gray-700">Todavía no hay nada en la venta</p>
                  <ul className="space-y-2">
                    <li className="flex gap-2.5"><ScanBarcode size={18} strokeWidth={1.8} className="mt-0.5 shrink-0 text-marca" /><span><b className="text-gray-800">Con lector:</b> pasá la prenda por el lector y se suma sola. No hace falta tocar nada.</span></li>
                    <li className="flex gap-2.5"><ShoppingBag size={18} strokeWidth={1.8} className="mt-0.5 shrink-0 text-marca" /><span><b className="text-gray-800">Sin lector:</b> buscá por nombre o tocá el producto, y después el talle.</span></li>
                  </ul>
                </div>
              ) : (
                <ul className="max-h-[38vh] divide-y divide-gray-100 overflow-y-auto px-4 lg:max-h-[30vh] 2xl:max-h-[40vh]">
                  {items.map((i) => (
                    <li key={i.variante_id} className="py-2">
                      <div className="flex items-baseline gap-2">
                        <p className="min-w-0 flex-1 truncate font-semibold leading-snug" title={i.nombre}>{i.nombre}</p>
                        <span className="shrink-0 font-semibold tabular-nums">{pesos(i.cantidad * i.precio)}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-texto-2">
                        <div className="flex items-center rounded-md border border-borde" role="group" aria-label={`Cantidad de ${i.nombre}`}>
                          <button type="button" onClick={() => (i.cantidad > 1 ? cambiar(i.variante_id, "cantidad", i.cantidad - 1) : quitar(i.variante_id))} className="grid h-7 w-7 place-items-center text-gray-600 hover:bg-gray-50" aria-label={i.cantidad > 1 ? "Una menos" : "Quitar"}><Minus size={13} strokeWidth={2.2} /></button>
                          <span className="min-w-6 text-center text-sm font-bold tabular-nums text-gray-900" aria-live="polite">{i.cantidad}</span>
                          <button type="button" onClick={() => cambiar(i.variante_id, "cantidad", Math.min(i.cantidad + 1, i.stock))} disabled={i.cantidad >= i.stock} className="grid h-7 w-7 place-items-center text-gray-600 hover:bg-gray-50 disabled:opacity-30" aria-label="Una más" title={i.cantidad >= i.stock ? `Hay ${i.stock} disponibles` : "Una más"}><Plus size={13} strokeWidth={2.2} /></button>
                        </div>
                        <span className="tabular-nums">×</span>
                        {cambiaPrecio
                          ? <input type="number" inputMode="numeric" min={0} value={i.precio} onChange={(e) => cambiar(i.variante_id, "precio", Math.max(0, Number(e.target.value)))} className="h-7 w-20 rounded-md border border-borde px-1.5 text-xs tabular-nums text-gray-900" aria-label={`Precio por unidad de ${i.nombre}`} title="Precio por unidad (lo podés cambiar)" />
                          : <span className="tabular-nums text-gray-900">{pesos(i.precio)}</span>}
                        <span className="min-w-0 truncate text-gray-700">· Talle {i.talle} · {i.color}</span>
                        <button type="button" onClick={() => quitar(i.variante_id)} className="ml-auto grid h-7 w-7 shrink-0 place-items-center rounded-md text-gray-500 hover:bg-red-50 hover:text-error" aria-label={`Quitar ${i.nombre} talle ${i.talle}`}><Trash2 size={15} strokeWidth={1.8} /></button>
                      </div>
                      {promoDe(i.variante_id).map((r) => <p key={r.promocion} className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-ok"><BadgePercent size={12} /> {r.promocion}: −{pesos(r.descuento_promo)}</p>)}
                    </li>
                  ))}
                </ul>
              )}

              {/* Cliente, descuento y canal: una fila de botones chicos (la mayoría de las ventas no los usa) */}
              <div className="space-y-2 border-t border-borde px-4 py-3">
                <div className="flex flex-wrap gap-1.5">
                  <Opcion icono={User} activo={!!cliente} abierto={abierto === "cliente"} alAlternar={() => setAbierto(abierto === "cliente" ? null : "cliente")} valor={cliente ? cliente.nombre : "Cliente"} />
                  <Opcion icono={BadgePercent} activo={descuento > 0} abierto={abierto === "descuento"} alAlternar={() => setAbierto(abierto === "descuento" ? null : "descuento")} valor={descuento > 0 ? `Descuento −${pesos(descuento)}` : "Descuento"} />
                  <Opcion icono={ShoppingBag} activo={canal !== "Local"} abierto={abierto === "canal"} alAlternar={() => setAbierto(abierto === "canal" ? null : "canal")} valor={canal === "Local" ? "En el local" : `Por ${canal}`} />
                </div>
                {abierto === "cliente" && <div>
                  {cliente ? (
                    <div className="flex items-center justify-between gap-2 rounded-lg bg-marca-suave px-3 py-2 text-sm">
                      <span><b>{cliente.nombre}</b>{cliente.saldo > 0 && <span className="block text-xs font-semibold text-ok">Tiene {pesos(cliente.saldo)} de saldo a favor: cobralo con «Saldo a favor».</span>}
                        {facturacion && <span className="block text-xs text-texto-2">Le sale Factura <b>{letra}</b>{letra !== "A" && facturacion.letra === "B" ? <> · <Link href={`/admin/clientes/${cliente.id}?editar=datos`} target="_blank" className="font-semibold text-marca underline">¿Es inscripto? Cargá su CUIT</Link></> : null}</span>}</span>
                      <button type="button" onClick={() => setClienteId(null)} className="text-xs font-semibold text-marca underline">Quitar</button>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <input value={buscaCliente} onChange={(e) => setBuscaCliente(e.target.value)} placeholder="Buscar por nombre o teléfono" className="campo" aria-label="Buscar cliente" />
                      <ul className="max-h-48 overflow-y-auto">
                        {clientesFiltrados.map((c) => (
                          <li key={c.id}><button type="button" onClick={() => { setClienteId(c.id); setBuscaCliente(""); setAbierto(null); }} className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-gray-50">
                            <span>{c.nombre}{c.telefono && <span className="text-texto-2"> · {c.telefono}</span>}</span>{c.saldo > 0 && <span className="text-xs font-semibold text-ok">saldo {pesos(c.saldo)}</span>}</button></li>
                        ))}
                        {clientesFiltrados.length === 0 && <li className="px-2 py-2 text-sm text-texto-2">No hay clientes con «{buscaCliente}».</li>}
                      </ul>
                      {puedeCrearCliente && !altaCliente && (
                        <button type="button" onClick={() => {
                          const q = buscaCliente.trim();
                          if (/^[\d\s+()-]+$/.test(q) && q) setAltaTelefono(q); else if (q) setAltaNombre(q);
                          setAltaCliente(true); setAltaError("");
                        }} className="inline-flex items-center gap-1.5 text-sm font-medium text-marca"><UserPlus size={15} strokeWidth={1.8} /> Es un cliente nuevo</button>
                      )}
                      {altaCliente && (
                        <div className="space-y-2 rounded-lg border border-borde p-3">
                          <p className="text-sm font-semibold">Cliente nuevo</p>
                          <input value={altaNombre} onChange={(e) => setAltaNombre(e.target.value)} placeholder="Nombre y apellido *" className="campo" aria-label="Nombre del cliente nuevo" autoFocus />
                          <input value={altaTelefono} onChange={(e) => setAltaTelefono(e.target.value)} placeholder="Teléfono (para avisarle o mandarle el comprobante)" inputMode="tel" className="campo" aria-label="Teléfono del cliente nuevo" />
                          {facturacion && <div ref={altaFiscal}><DatosFiscales compacto letraLocal={facturacion.letra} /></div>}
                          {altaError && <p role="alert" className="text-sm font-medium text-error">{altaError}</p>}
                          <div className="flex gap-2">
                            <button type="button" onClick={crearCliente} disabled={creando || !altaNombre.trim()} className="boton min-h-10 flex-1">{creando ? "Guardando…" : "Guardar y usar"}</button>
                            <button type="button" onClick={() => { setAltaCliente(false); setAltaError(""); }} className="boton-sec min-h-10" disabled={creando}>Cancelar</button>
                          </div>
                          <p className="text-xs text-texto-2">El resto de los datos se completa después en Clientes.</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>}
                {abierto === "descuento" && <div>
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {porcentajesDescuento.map((p) => {
                        const monto = Math.floor((conPromos * p) / 100);
                        return <button key={p} type="button" onClick={() => setDescuento(monto)} className={`h-9 rounded-full border px-3 text-sm font-medium ${descuento === monto && monto > 0 ? "border-marca bg-marca text-white" : "border-borde bg-white hover:bg-gray-50"}`}>{p} %</button>;
                      })}
                      {descuento > 0 && <button type="button" onClick={() => setDescuento(0)} className="h-9 rounded-full px-3 text-sm text-texto-2 underline">Sacar</button>}
                    </div>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-texto-2">$</span>
                      <input type="number" inputMode="numeric" min={0} value={descuento || ""} placeholder="Otro monto" onChange={(e) => setDescuento(Math.max(0, Number(e.target.value)))} className={`campo pl-7 ${pasaTope ? "border-error" : ""}`} aria-label="Descuento en pesos" />
                    </div>
                    {topeDescuento !== null && <p className={`text-xs ${pasaTope ? "font-semibold text-error" : "text-texto-2"}`}>Tu tope es {descuentoMax} % ({pesos(topeDescuento)}){pasaTope ? ": para más, pedí la autorización de un encargado con su PIN" : ""}</p>}
                    {topeDescuento !== null && descuento > topeDescuento && autorizadoOk && autorizado && (
                      <p className="flex items-center gap-1.5 rounded-lg bg-green-50 px-3 py-2 text-sm font-medium text-ok"><ShieldCheck size={16} /> Autorizado por {autorizado.quien} hasta {pesos(autorizado.monto)}</p>
                    )}
                    {pasaTope && (
                      <div className="space-y-1.5 rounded-lg border border-borde p-3">
                        <label htmlFor="pin-encargado" className="flex items-center gap-1.5 text-xs font-semibold text-texto-2"><KeyRound size={14} /> PIN del encargado</label>
                        <div className="flex gap-2">
                          <input id="pin-encargado" type="password" inputMode="numeric" autoComplete="off" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} className="campo h-10 flex-1 tabular-nums tracking-widest" placeholder="••••" />
                          <button type="button" onClick={pedirAutorizacion} disabled={validandoPin || pin.length < 4} className="boton min-h-10">{validandoPin ? "Verificando…" : "Autorizar"}</button>
                        </div>
                        {pinError && <p role="alert" className="text-xs font-medium text-error">{pinError}</p>}
                      </div>
                    )}
                  </div>
                </div>}
                {abierto === "canal" && <div>
                  <div className="flex flex-wrap gap-1.5">
                    {CANALES.map((c) => <button key={c} type="button" onClick={() => { setCanal(c); setAbierto(null); }} className={`h-9 rounded-full border px-3 text-sm font-medium ${canal === c ? "border-marca bg-marca text-white" : "border-borde bg-white hover:bg-gray-50"}`}>{c}</button>)}
                  </div>
                </div>}
              </div>

              {/* Cómo paga */}
              <div className="space-y-3 border-t border-borde px-4 py-4">
                <div className="flex items-center justify-between gap-2">
                  <Paso n={2} titulo="Elegí cómo paga" listo={items.length > 0 && !falta} />
                  {medios.length > 1 && (dividido
                    ? <button type="button" onClick={() => setLineas((ls) => [ls[0]])} className="shrink-0 whitespace-nowrap text-sm font-medium text-marca">Un solo medio</button>
                    : <button type="button" onClick={dividir} className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm font-medium text-marca"><SplitSquareHorizontal size={15} strokeWidth={1.8} /> Dividir el pago</button>)}
                </div>

                {!dividido ? (
                  <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Medio de pago">
                    {mediosVisibles.map((m) => {
                      const sel = lineas[0]?.medio_pago_id === m.id, pct = Number(m.ajuste_pct), Icono = iconoMedio(m);
                      return (
                        <button key={m.id} type="button" role="radio" aria-checked={sel} onClick={() => elegirMedio(0, m.id)}
                          className={`flex min-h-12 flex-col items-start justify-center gap-0.5 rounded-lg border px-2.5 py-1 text-left transition-colors ${sel ? "border-marca bg-marca-suave ring-1 ring-marca" : "border-borde bg-white hover:bg-gray-50"}`}>
                          <span className="flex w-full min-w-0 items-center gap-1.5"><Icono size={16} strokeWidth={sel ? 2.2 : 1.8} className={`shrink-0 ${sel ? "text-marca" : "text-gray-500"}`} />
                          <span className="text-sm font-semibold leading-tight">{m.nombre}</span></span>
                          <span className="min-w-0">
                          <span className="block text-xs tabular-nums text-texto-2">
                            {pct ? <span className={pct < 0 ? "font-semibold text-ok" : "font-semibold text-alerta"}>{porcentaje(pct)} </span> : null}
                            {neto > 0 ? pesos(totalCon(neto, factor, m)) : m.cuotas > 1 ? `${m.cuotas} cuotas` : ""}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {lineas.length === 2 && (
                      <div className="flex flex-wrap items-center gap-1.5 text-sm">
                        <span className="text-texto-2">Repartir:</span>
                        {REPARTOS.map(([a, b]) => {
                          const sel = lineas[1].modo === "pct" && lineas[1].valor === b;
                          return <button key={`${a}-${b}`} type="button" onClick={() => repartir(b)} className={`h-8 rounded-full border px-3 text-sm font-medium tabular-nums ${sel ? "border-marca bg-marca text-white" : "border-borde bg-white hover:bg-gray-50"}`}>{a} / {b}</button>;
                        })}
                      </div>
                    )}
                    {cobro.lineas.map((l, i) => (
                      <div key={i} className="space-y-1.5 rounded-lg border border-borde p-2.5">
                        <div className="flex items-center gap-2">
                          {(() => { const I = iconoMedio(l.medio); return <I size={20} strokeWidth={1.8} className="shrink-0 text-gray-500" aria-hidden />; })()}
                          <select value={l.medio_pago_id} onChange={(e) => elegirMedio(i, Number(e.target.value))} className="campo h-10 min-w-0 flex-1 py-1.5" aria-label={`Medio de pago ${i + 1}`}>
                            {mediosVisibles.map((m) => <option key={m.id} value={m.id}>{m.nombre}{Number(m.ajuste_pct) ? ` (${porcentaje(m.ajuste_pct)})` : ""}</option>)}
                          </select>
                          {i > 0 && <button type="button" onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))} className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-gray-500 hover:bg-red-50 hover:text-error" aria-label="Quitar este medio"><X size={17} /></button>}
                        </div>
                        {i === 0 ? (
                          <p className="text-sm text-texto-2">Lo que falta: <b className="tabular-nums text-gray-900">{pesos(l.base)}</b> <span className="tabular-nums">({Math.round(l.pct)} %)</span></p>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="relative w-24">
                              <input type="number" inputMode="decimal" min={0} max={100} value={l.modo === "pct" ? l.valor : Math.round(l.pct * 10) / 10} aria-label="Porcentaje"
                                onChange={(e) => setLineas((ls) => ls.map((x, j) => (j === i ? { ...x, modo: "pct", valor: Math.max(0, Number(e.target.value)) } : x)))} className="campo h-10 pr-7 text-right tabular-nums" />
                              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-texto-2">%</span>
                            </div>
                            <span className="text-texto-2">=</span>
                            <div className="relative flex-1">
                              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-texto-2">$</span>
                              <input type="number" inputMode="numeric" min={0} value={l.modo === "monto" ? l.valor || "" : Math.round(l.base)} aria-label="Monto"
                                onChange={(e) => setLineas((ls) => ls.map((x, j) => (j === i ? { ...x, modo: "monto", valor: Math.max(0, Number(e.target.value)) } : x)))} className="campo h-10 pl-7 tabular-nums" />
                            </div>
                          </div>
                        )}
                        {l.ajuste !== 0 && l.base > 0 && <p className={`text-xs ${l.ajuste < 0 ? "text-ok" : "text-alerta"}`}>{l.ajuste < 0 ? "Descuento" : "Recargo"} {porcentaje(l.medio.ajuste_pct)}: cobra {pesos(l.cobra + l.redondeo)}{l.medio.cuotas > 1 ? ` en ${l.medio.cuotas} cuotas de ${pesos((l.cobra + l.redondeo) / l.medio.cuotas)}` : ""}</p>}
                      </div>
                    ))}
                    <button type="button" onClick={() => setLineas((ls) => [...ls, { medio_pago_id: (medios.find((m) => !ls.some((l) => l.medio_pago_id === m.id) && !m.es_saldo) ?? medios[0]).id, modo: "monto", valor: 0 }])}
                      className="inline-flex items-center gap-1 text-sm font-medium text-marca"><Plus size={15} /> Sumar otro medio</button>
                  </div>
                )}

                {/* Número de cupón / operación (opcional) para los medios que no son efectivo */}
                {[...new Map(cobro.lineas.filter((l) => l.base > 0 && pideReferencia(l.medio)).map((l) => [l.medio.id, l.medio])).values()].map((m) => (
                  <div key={m.id} className="space-y-1">
                    <label htmlFor={`ref-${m.id}`} className="flex items-center gap-1.5 text-xs font-semibold text-texto-2"><CreditCard size={14} strokeWidth={1.8} /> {textoReferencia(m)} · {m.nombre} <span className="font-normal">(opcional)</span></label>
                    <input id={`ref-${m.id}`} value={referencias[m.id] ?? ""} onChange={(e) => setReferencias((r) => ({ ...r, [m.id]: e.target.value }))} maxLength={40} inputMode="text" autoComplete="off" placeholder="Para encontrar el cobro después" className="campo" />
                  </div>
                ))}

                {/* Efectivo: redondeo y vuelto */}
                {efectivo && neto > 0 && (
                  <div className="space-y-3 rounded-lg bg-gray-50 p-3">
                    {opciones.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-texto-2">Redondear el efectivo (para abajo)</p>
                        <div className="flex flex-wrap gap-1.5">
                          <button type="button" onClick={() => setMultiplo(null)} className={`h-9 rounded-full border px-3 text-sm font-medium tabular-nums ${!cobro.redondeo ? "border-marca bg-marca text-white" : "border-borde bg-white hover:bg-gray-50"}`}>Sin redondear</button>
                          {opciones.map((o) => (
                            <button key={o.multiplo} type="button" onClick={() => setMultiplo(o.multiplo)} className={`h-9 rounded-full border px-3 text-sm font-medium tabular-nums ${cobro.redondeo === o.redondeo ? "border-marca bg-marca text-white" : "border-borde bg-white hover:bg-gray-50"}`}>{pesos(o.queda)}</button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <label htmlFor="recibido" className="flex items-center gap-1.5 text-xs font-semibold text-texto-2"><Banknote size={14} strokeWidth={1.8} /> Con cuánto paga</label>
                      <div className="flex flex-wrap gap-1.5">
                        <button type="button" onClick={() => setRecibido(String(efectivo.cobra))} className="h-9 rounded-full border border-borde bg-white px-3 text-sm font-medium hover:bg-gray-50">Justo</button>
                        {billetesSugeridos(efectivo.cobra).map((b) => <button key={b} type="button" onClick={() => setRecibido(String(b))} className="h-9 rounded-full border border-borde bg-white px-3 text-sm font-medium tabular-nums hover:bg-gray-50">{pesos(b)}</button>)}
                      </div>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-texto-2">$</span>
                        <input id="recibido" type="number" inputMode="numeric" min={0} value={recibido} onChange={(e) => setRecibido(e.target.value)} placeholder="Otro monto" className="campo pl-7 tabular-nums" />
                      </div>
                      {montoRecibido > 0 && montoRecibido < efectivo.cobra && <p className="text-sm font-semibold text-error">Faltan {pesos(efectivo.cobra - montoRecibido)}</p>}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Total y confirmar: siempre a la vista */}
            <div className="space-y-2 border-t border-borde bg-white px-4 py-2.5">
              <dl className="space-y-0.5 text-xs">
                {(promos > 0 || descuento > 0 || cobro.ajustes !== 0 || cobro.redondeo > 0) && <div className="flex justify-between text-texto-2"><dt>Subtotal</dt><dd className="tabular-nums">{pesos(subtotal)}</dd></div>}
                {promos > 0 && <div className="flex justify-between text-ok"><dt>Promociones</dt><dd className="tabular-nums">−{pesos(promos)}</dd></div>}
                {descuento > 0 && <div className="flex justify-between text-ok"><dt>Descuento</dt><dd className="tabular-nums">−{pesos(descuento)}</dd></div>}
                {cobro.ajustes !== 0 && <div className={`flex justify-between ${cobro.ajustes < 0 ? "text-ok" : "text-alerta"}`}><dt>{cobro.ajustes < 0 ? "Descuento" : "Recargo"} por medio de pago</dt><dd className="tabular-nums">{cobro.ajustes < 0 ? "−" : "+"}{pesos(Math.abs(cobro.ajustes))}</dd></div>}
                {cobro.redondeo > 0 && <div className="flex justify-between text-ok"><dt>Redondeo</dt><dd className="tabular-nums">−{pesos(cobro.redondeo)}</dd></div>}
                <div className="flex items-baseline justify-between pt-1 text-sm"><dt className="font-semibold">Total a cobrar</dt><dd className="text-3xl font-bold tabular-nums">{pesos(cobro.total)}</dd></div>
                {efectivo && montoRecibido >= efectivo.cobra && montoRecibido > 0 && (
                  <div className="flex items-baseline justify-between rounded-lg bg-green-50 px-2.5 py-1.5 text-sm">
                    <dt>Paga con <b className="tabular-nums">{pesos(montoRecibido)}</b> · <span className="font-semibold text-ok">vuelto</span></dt>
                    <dd className="text-xl font-bold tabular-nums text-ok">{pesos(vuelto(montoRecibido, efectivo.cobra))}</dd>
                  </div>
                )}
              </dl>
              {facturacion && facturacion.modo === "elegir" && (
                <div role="radiogroup" aria-label="¿Con factura? (F4 cambia)" className="grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1 text-sm">
                  {([[true, `Factura ${letra}`], [false, "Sin factura"]] as const).map(([valor, texto]) => (
                    <button key={texto} type="button" role="radio" aria-checked={facturar === valor} onClick={() => setFacturar(valor)} disabled={!valor && !!medioObliga}
                      className={`flex min-h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${facturar === valor ? "bg-white text-marca shadow-sm" : "text-gray-600 hover:text-gray-900"}`}>
                      {valor ? <FileCheck2 size={15} strokeWidth={facturar === valor ? 2.2 : 1.8} /> : <ReceiptText size={15} strokeWidth={facturar === valor ? 2.2 : 1.8} />}{texto}
                      {valor && facturacion.pruebas && <span className="rounded bg-amber-100 px-1 text-[10px] font-bold uppercase text-alerta" title="ARCA está en pruebas: la factura no tiene validez">prueba</span>}
                    </button>
                  ))}
                </div>
              )}
              {medioObliga && facturacion?.modo === "elegir" && <p className="flex items-center gap-1.5 text-xs text-texto-2"><FileCheck2 size={14} /> Con {medioObliga.nombre} va siempre con factura.</p>}
              {facturacion?.modo === "todas" && <p className="flex items-center gap-1.5 text-xs text-texto-2"><FileCheck2 size={14} /> Sale con Factura {letra}{facturacion.pruebas ? " (pruebas de ARCA)" : ""}</p>}
              {facturar && <input type="hidden" name="factura" value="1" />}
              <input type="hidden" name="venta" value={venta} />
              {efectivo && montoRecibido >= efectivo.cobra && <input type="hidden" name="vuelto" value={vuelto(montoRecibido, efectivo.cobra)} />}
              {estado.error && <p role="alert" className="flex items-start gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-error"><CircleAlert size={16} className="mt-0.5 shrink-0" />{estado.error}</p>}
              <button className="boton min-h-14 w-full text-base" disabled={cargando || !!falta}>
                <span className="grid h-6 w-6 place-items-center rounded-full bg-white/20 text-xs font-bold" aria-hidden>3</span>
                {cargando ? (facturar ? "Registrando y facturando…" : "Registrando…") : (
                  <span className="flex flex-col items-center leading-tight">
                    <span>Confirmar{items.length ? ` · ${pesos(cobro.total)}` : " venta"}</span>
                    {facturacion && <span className="text-xs font-medium opacity-90">{facturar ? `con Factura ${letra}` : "sin factura (comprobante interno)"}</span>}
                  </span>)}
              </button>
              {falta && items.length > 0 && <p className="text-center text-xs text-texto-2">{falta}</p>}
            </div>
          </div>
        </form>
      </div>

      {/* Celular: la venta siempre a mano */}
      {!panel && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-borde bg-white/95 px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur lg:hidden" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
          <div className="mx-auto flex max-w-xl items-center gap-3">
            <div className="min-w-0">
              <p className="text-xs text-texto-2">{unidades ? `${unidades} ${unidades === 1 ? "prenda" : "prendas"}` : "Venta vacía"}</p>
              <p className="text-xl font-bold tabular-nums">{pesos(cobro.total)}</p>
            </div>
            <button type="button" onClick={() => setPanel(true)} disabled={!items.length} className="boton ml-auto min-h-12 px-6 text-base">Cobrar</button>
          </div>
        </div>
      )}
    </div>
  );
}
