"use client";
// Tarjetas de Configuración por sección, con buscador rápido, filtros por categoría y estado de cada parte.
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  BadgePercent,
  BookText,
  Camera,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleDot,
  CreditCard,
  FileText,
  Filter,
  Globe,
  History,
  KeyRound,
  Landmark,
  Layers,
  LockKeyhole,
  Mail,
  MessageCircle,
  Package,
  Plug,
  Printer,
  Receipt,
  RotateCcw,
  ScanBarcode,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sliders,
  Sparkles,
  Store,
  Tag,
  Truck,
  UserCheck,
  UserRound,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";

type Entrada = {
  titulo: string;
  descripcion: string;
  href: string;
  seccion: string;
  palabras: string;
  listo: boolean | null;
  nota: string | null;
};

const ICONO_SECCION: Record<string, LucideIcon> = {
  Negocio: Store,
  "Equipo y permisos": ShieldCheck,
  "Ventas y caja": Receipt,
  Catálogo: Package,
  "Tienda online": ShoppingBag,
  Integraciones: Plug,
  Contabilidad: BookText,
  "Mi cuenta": UserRound,
};

function obtenerIconoItem(href: string, seccion: string): LucideIcon {
  if (href.startsWith("/admin/tienda/legales")) return FileText;
  if (href.startsWith("/admin/tienda")) return Store;
  if (href.startsWith("/admin/equipo/modulos")) return Sliders;
  if (href.startsWith("/admin/equipo/cuentas")) return UserCheck;
  if (href.startsWith("/admin/equipo/bitacora")) return History;
  if (href.startsWith("/admin/equipo")) return Users;
  if (href.startsWith("/admin/impresion")) return Printer;
  if (href.includes("t=medios")) return CreditCard;
  if (href.includes("t=rubros") || href === "/admin/tablas") return Layers;
  if (href.startsWith("/admin/etiquetas")) return ScanBarcode;
  if (href.startsWith("/admin/precios")) return Tag;
  if (href.startsWith("/admin/promociones")) return BadgePercent;
  if (href.startsWith("/admin/integraciones/envios")) return Truck;
  if (href.startsWith("/admin/integraciones/mercadopago")) return CreditCard;
  if (href.startsWith("/admin/integraciones/whatsapp")) return MessageCircle;
  if (href.startsWith("/admin/integraciones/ia")) return Sparkles;
  if (href.startsWith("/admin/integraciones/instagram")) return Camera;
  if (href.startsWith("/admin/integraciones/correo")) return Mail;
  if (href.startsWith("/admin/integraciones/dominio")) return Globe;
  if (href.startsWith("/admin/integraciones/arca")) return Landmark;
  if (href.startsWith("/admin/contabilidad")) return BookText;
  if (href.startsWith("/admin/gastos")) return Wallet;
  if (href.startsWith("/admin/mi-cuenta")) return LockKeyhole;
  if (href.startsWith("/nueva-clave")) return KeyRound;
  return ICONO_SECCION[seccion] ?? Store;
}

const normalizar = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export default function Configuracion({ entradas, secciones }: { entradas: Entrada[]; secciones: string[] }) {
  const [q, setQ] = useState("");
  const [seccionActiva, setSeccionActiva] = useState<string>("todas");
  const [soloPendientes, setSoloPendientes] = useState<boolean>(false);

  const texto = normalizar(q.trim());

  // Métricas generales
  const totalAuditables = entradas.filter((e) => e.listo !== null);
  const totalListos = entradas.filter((e) => e.listo === true).length;
  const faltan = entradas.filter((e) => e.listo === false);
  const porcentajeListo = totalAuditables.length ? Math.round((totalListos / totalAuditables.length) * 100) : 100;

  // Filtrado reactivo por texto, sección y estado
  const filtradas = useMemo(() => {
    return entradas.filter((e) => {
      if (seccionActiva !== "todas" && e.seccion !== seccionActiva) return false;
      if (soloPendientes && e.listo !== false) return false;
      if (!texto) return true;
      const bolsa = normalizar(`${e.titulo} ${e.descripcion} ${e.seccion} ${e.palabras}`);
      return texto.split(/\s+/).every((palabra) => bolsa.includes(palabra));
    });
  }, [entradas, texto, seccionActiva, soloPendientes]);

  const resetearFiltros = () => {
    setQ("");
    setSeccionActiva("todas");
    setSoloPendientes(false);
  };

  return (
    <div className="space-y-6">
      {/* Resumen de configuración del local */}
      <div className="overflow-hidden rounded-2xl border border-borde bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-marca-suave text-marca">
                <CheckCircle2 size={18} strokeWidth={2.2} />
              </span>
              <div>
                <h2 className="text-base font-bold">Estado de configuración del local</h2>
                <p className="text-xs text-texto-2">
                  {totalListos} de {totalAuditables.length} partes principales listas ({porcentajeListo}%)
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {faltan.length > 0 ? (
              <button
                type="button"
                onClick={() => setSoloPendientes(!soloPendientes)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  soloPendientes
                    ? "bg-amber-600 text-white"
                    : "border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100"
                }`}
              >
                <CircleAlert size={14} />
                {soloPendientes ? "Viendo pendientes" : `${faltan.length} ${faltan.length === 1 ? "pendiente" : "pendientes"}`}
              </button>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-green-50 px-3 py-1.5 text-xs font-semibold text-ok">
                <CircleCheck size={14} />
                Todo lo esencial está configurado
              </span>
            )}
          </div>
        </div>

        {/* Barra de progreso visual */}
        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full bg-marca transition-all duration-500 ease-out"
            style={{ width: `${porcentajeListo}%` }}
          />
        </div>
      </div>

      {/* Buscador y Controles */}
      <div className="space-y-3">
        <div className="relative max-w-xl">
          <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <span className="sr-only">Buscar en la configuración</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar: logo, impresora, PIN, ARCA, WhatsApp, cuotas…"
            className="campo h-12 pl-11 pr-10 text-base shadow-sm focus:border-marca"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              aria-label="Borrar la búsqueda"
              className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Chips de filtro por sección */}
        <nav aria-label="Filtrar por sección" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 pt-1 md:mx-0 md:px-0">
          <button
            type="button"
            onClick={() => { setSeccionActiva("todas"); setSoloPendientes(false); }}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
              seccionActiva === "todas" && !soloPendientes
                ? "bg-marca text-white shadow-sm"
                : "border border-borde bg-white text-texto-2 hover:border-gray-300 hover:text-gray-900"
            }`}
          >
            Todas ({entradas.length})
          </button>

          {faltan.length > 0 && (
            <button
              type="button"
              onClick={() => setSoloPendientes(!soloPendientes)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                soloPendientes
                  ? "bg-amber-600 text-white shadow-sm"
                  : "border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100"
              }`}
            >
              <CircleAlert size={13} />
              Pendientes ({faltan.length})
            </button>
          )}

          {secciones.map((s) => {
            const cantidad = entradas.filter((e) => e.seccion === s).length;
            if (!cantidad) return null;
            const Icono = ICONO_SECCION[s] ?? Store;
            const activa = seccionActiva === s && !soloPendientes;
            return (
              <button
                key={s}
                type="button"
                onClick={() => { setSeccionActiva(s); setSoloPendientes(false); }}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                  activa
                    ? "bg-marca text-white shadow-sm"
                    : "border border-borde bg-white text-texto-2 hover:border-gray-300 hover:text-gray-900"
                }`}
              >
                <Icono size={13} strokeWidth={1.8} />
                {s} ({cantidad})
              </button>
            );
          })}
        </nav>
      </div>

      {/* Listado de secciones y tarjetas */}
      <div className="space-y-8">
        {secciones.map((s) => {
          const items = filtradas.filter((e) => e.seccion === s);
          if (!items.length) return null;
          const IconoSec = ICONO_SECCION[s] ?? Store;
          return (
            <section key={s} className="space-y-3">
              <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500">
                  <IconoSec size={15} strokeWidth={2} className="text-marca" /> {s}
                </h2>
                <span className="text-xs text-texto-2 font-medium">
                  {items.length} {items.length === 1 ? "opción" : "opciones"}
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {items.map((e) => {
                  const IconoItem = obtenerIconoItem(e.href, e.seccion);
                  return (
                    <Link
                      key={e.href + e.titulo}
                      href={e.href}
                      className="group relative flex items-start gap-3.5 rounded-xl border border-borde bg-white p-4 shadow-sm transition hover:border-marca hover:shadow-md"
                    >
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gray-50 text-gray-600 transition group-hover:bg-marca-suave group-hover:text-marca">
                        <IconoItem size={20} strokeWidth={1.8} />
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-semibold text-gray-900 group-hover:text-marca">{e.titulo}</span>
                          {e.listo === true && (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-ok">
                              <CircleCheck size={12} /> Listo
                            </span>
                          )}
                          {e.listo === false && (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-alerta">
                              <CircleDot size={12} /> Falta
                            </span>
                          )}
                        </div>

                        <p className="mt-0.5 text-xs leading-relaxed text-texto-2">{e.descripcion}</p>

                        {e.nota && (
                          <span className="mt-2 inline-block rounded bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700">
                            {e.nota}
                          </span>
                        )}
                      </div>

                      <ChevronRight
                        size={16}
                        className="shrink-0 self-center text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-marca"
                      />
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}

        {/* Estado vacío cuando ningún filtro coincide */}
        {filtradas.length === 0 && (
          <div className="rounded-2xl border border-dashed border-borde bg-white px-6 py-12 text-center">
            <Filter size={28} className="mx-auto mb-3 text-gray-400" />
            <h3 className="text-base font-semibold text-gray-900">No encontramos opciones para esta búsqueda</h3>
            <p className="mx-auto mt-1 max-w-sm text-sm text-texto-2">
              {q
                ? `No hay coincidencias para «${q}». Probá buscando por otra palabra como «logo», «impresora», «PIN» o «ARCA».`
                : "No hay elementos que coincidan con los filtros seleccionados."}
            </p>
            <button
              type="button"
              onClick={resetearFiltros}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-borde bg-white px-3.5 py-2 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
            >
              <RotateCcw size={14} /> Reestablecer filtros
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
