// Cada tipo de sección de la portada. Son componentes de servidor: el movimiento es CSS
// (ver "PORTADA" en globals.css) y lo único con JavaScript es el Carrusel.
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Asterisk, Clock, MapPin, MessageCircle } from "lucide-react";
import { enlaceFiltro, type Contenido, type Seccion } from "@/lib/inicio";
import TarjetaProducto, { type Modelo } from "../TarjetaProducto";
import Carrusel from "./Carrusel";

export type ModeloInicio = Modelo & { genero: string | null; linea: string | null; creado: string };
export type Contacto = { whatsapp: string | null; direccion_retiro: string | null; horario: string | null; instagram: string | null };

const titular = "font-extrabold leading-[0.95] tracking-[-0.045em]";
const h2 = `text-[clamp(2rem,5vw,3.6rem)] ${titular}`;

// Botón que lleva a otra página o a otro sitio (los links externos abren aparte)
function Boton({ href, children, variante = "lleno" }: { href: string; children: React.ReactNode; variante?: "lleno" | "blanco" | "borde-blanco" }) {
  const clases = {
    lleno: "boton",
    blanco: "inline-flex min-h-12 items-center gap-2 rounded-sm bg-white px-6 text-[0.95rem] font-bold text-marca transition hover:bg-marca-suave",
    "borde-blanco": "inline-flex min-h-12 items-center gap-2 rounded-sm border border-white/60 px-6 text-[0.95rem] font-bold text-white transition hover:bg-white/10",
  }[variante];
  const externo = /^https?:/.test(href);
  return externo
    ? <a href={href} target="_blank" rel="noopener" className={`group ${clases}`}>{children}</a>
    : <Link href={href} className={`group ${clases}`}>{children}</Link>;
}
const Flecha = () => <ArrowRight size={19} className="transition-transform group-hover:translate-x-1 motion-reduce:transition-none" aria-hidden />;

// Título que entra palabra por palabra
function TituloAnimado({ texto, className }: { texto: string; className: string }) {
  return (
    <h1 className={className} aria-label={texto}>
      {texto.split(/\s+/).map((p, i) => <span key={i} aria-hidden><span className="palabra" style={{ "--i": i } as React.CSSProperties}>{p}</span>{" "}</span>)}
    </h1>
  );
}

// Encabezado de sección: título a la izquierda, link "ver todo" a la derecha
function Encabezado({ s, oscuro = false }: { s: Seccion; oscuro?: boolean }) {
  if (!s.titulo && !s.boton_texto) return null;
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3" data-revelar>
      <div className="max-w-2xl space-y-3">
        {s.titulo && <h2 className={h2}>{s.titulo}</h2>}
        {s.bajada && <p className={`text-lg ${oscuro ? "text-white/75" : "text-texto-2"}`}>{s.bajada}</p>}
      </div>
      {s.boton_texto && s.boton_enlace && (
        <Link href={s.boton_enlace} className="group inline-flex min-h-11 shrink-0 items-center gap-1.5 font-bold underline decoration-2 underline-offset-[6px]">
          {s.boton_texto}<ArrowUpRight size={18} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden /></Link>
      )}
    </div>
  );
}

// ── Portada ───────────────────────────────────────────────────────────
// "columnas": el texto a la izquierda y tres columnas de fotos del catálogo que suben y bajan solas
// (en el celular, dos tiras que corren de costado). "foto": una foto propia a pantalla completa.
export function Portada({ s, fotos, tienda }: { s: Seccion<"portada">; fotos: ModeloInicio[]; tienda: string }) {
  const titulo = s.titulo || tienda;
  const botones = (claro: boolean) => (
    <div className="entra flex flex-wrap items-center gap-x-6 gap-y-3" style={{ "--d": "0.55s" } as React.CSSProperties}>
      {s.boton_texto && s.boton_enlace && <Boton href={s.boton_enlace} variante={claro ? "blanco" : "lleno"}>{s.boton_texto} <Flecha /></Boton>}
      <a href="#local" className="inline-flex min-h-11 items-center font-bold underline decoration-2 underline-offset-[6px]">Visitá el local</a>
    </div>
  );
  const antetitulo = s.contenido.antetitulo && (
    <p className="entra inline-flex items-center gap-2 text-sm font-bold" style={{ "--d": "0s" } as React.CSSProperties}>
      <span className="h-2 w-2 animate-pulse rounded-full bg-acento motion-reduce:animate-none" aria-hidden />{s.contenido.antetitulo}</p>
  );

  if (s.contenido.estilo === "foto" && s.imagen_url) {
    return (
      <section className="sangrado relative -mt-5 grid min-h-[calc(100svh-4rem)] items-end overflow-hidden bg-marca text-white">
        <img src={s.imagen_url} alt="" fetchPriority="high" className="acerca absolute inset-0 h-full w-full object-cover object-[50%_25%]" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-black/5" aria-hidden />
        <div className="relative mx-auto w-full max-w-7xl space-y-6 px-4 pb-12 pt-32 sm:px-6 md:pb-16">
          {antetitulo}
          <TituloAnimado texto={titulo} className={`max-w-[16ch] text-[clamp(3rem,10vw,8.5rem)] ${titular}`} />
          {s.bajada && <p className="entra max-w-lg text-lg text-white/85" style={{ "--d": "0.4s" } as React.CSSProperties}>{s.bajada}</p>}
          {botones(true)}
        </div>
      </section>
    );
  }

  // Columnas: se reparten las fotos en tres (y se duplican para que la vuelta no se note)
  const cols = [0, 1, 2].map((c) => fotos.filter((_, i) => i % 3 === c));
  const foto = (m: ModeloInicio, i: number, clase: string) => (
    <Link key={`${m.id}-${i}`} href={`/producto/${m.id}`} tabIndex={-1} aria-hidden className={`group relative block shrink-0 overflow-hidden rounded-sm bg-marca-suave ${clase}`}>
      <img src={m.imagen!} alt="" fetchPriority={i < 3 ? "high" : "low"} decoding="async" className="absolute inset-0 h-full w-full object-cover object-top transition-transform duration-700 group-hover:scale-105 motion-reduce:transition-none" />
      {m.etiqueta && <span className="absolute left-2 top-2 rounded-sm bg-acento px-2 py-1 text-[0.7rem] font-bold leading-none text-white">{m.etiqueta}</span>}
    </Link>
  );

  return (
    <section className="-mt-5 grid items-center gap-8 pt-8 md:min-h-[calc(100svh-4rem)] md:grid-cols-[1fr_1.05fr] md:gap-10 md:pt-0">
      <div className="space-y-7">
        {antetitulo}
        <TituloAnimado texto={titulo} className={`text-[clamp(3rem,9vw,7rem)] ${titular}`} />
        {s.bajada && <p className="entra max-w-md text-lg text-texto-2" style={{ "--d": "0.4s" } as React.CSSProperties}>{s.bajada}</p>}
        {botones(false)}
      </div>

      {fotos.length >= 3 && <>
        {/* Compu: tres columnas que suben y bajan */}
        <div className="pausa-hover borde-difuso-y hidden h-[calc(100svh-4rem)] grid-cols-3 gap-4 overflow-hidden md:grid" aria-hidden>
          {cols.map((col, c) => (
            <div key={c} className={`flex flex-col gap-4 ${c === 1 ? "baja" : "sube"}`} style={{ "--dur": `${45 + c * 12}s` } as React.CSSProperties}>
              {[...col, ...col].map((m, i) => foto(m, i, "aspect-[3/4] w-full"))}
            </div>
          ))}
        </div>
        {/* Celular: dos tiras que corren en sentidos opuestos */}
        <div className="sangrado pausa-hover space-y-2.5 overflow-hidden md:hidden" aria-hidden>
          {[fotos.filter((_, i) => i % 2 === 0), fotos.filter((_, i) => i % 2 === 1)].map((fila, f) => (
            <div key={f} className={`flex w-max gap-2.5 ${f ? "corre-inv" : "corre"}`} style={{ "--dur": `${35 + f * 8}s` } as React.CSSProperties}>
              {[...fila, ...fila].map((m, i) => foto(m, i, "h-48 w-36"))}
            </div>
          ))}
        </div>
      </>}
    </section>
  );
}

// ── Cinta que corre ───────────────────────────────────────────────────
export function Cinta({ s, marcas }: { s: Seccion<"cinta">; marcas: string[] }) {
  const items = [...s.contenido.frases, ...(s.contenido.marcas ? marcas : [])];
  if (!items.length) return null;
  // Se repite hasta llenar bien el ancho y después se duplica para la vuelta sin corte
  const tanda = Array.from({ length: Math.max(1, Math.ceil(12 / items.length)) }, () => items).flat();
  return (
    <section aria-label={items.join(", ")} className="sangrado pausa-hover -mt-12 overflow-hidden bg-marca py-4 text-white md:-mt-20 md:py-5">
      <div className="corre flex w-max items-center" style={{ "--dur": `${tanda.length * 3.5}s` } as React.CSSProperties} aria-hidden>
        {[...tanda, ...tanda].map((t, i) => (
          <span key={i} className="flex shrink-0 items-center gap-6 pr-6 text-[clamp(1.1rem,2.4vw,1.6rem)] font-extrabold uppercase tracking-[-0.01em]">
            {t}<Asterisk size={22} strokeWidth={2.4} className="text-acento" />
          </span>
        ))}
      </div>
    </section>
  );
}

// ── Accesos ───────────────────────────────────────────────────────────
export function Accesos({ s, tarjetas }: { s: Seccion<"accesos">; tarjetas: (Contenido["accesos"]["tarjetas"][number] & { foto: string | null })[] }) {
  if (!tarjetas.length) return null;
  const cols = tarjetas.length >= 4 ? "md:grid-cols-4" : tarjetas.length === 2 ? "md:grid-cols-2" : "md:grid-cols-3";
  return (
    <section className="space-y-8">
      <Encabezado s={s} />
      {/* Celular: se deslizan de costado. Compu: grilla */}
      <div className={`tira max-md:sangrado flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 sm:px-6 md:grid md:gap-5 md:overflow-visible md:px-0 ${cols}`}>
        {tarjetas.map((t, i) => (
          <Link key={t.titulo} href={enlaceFiltro(t.filtro)} data-revelar="foto" style={{ "--i": i } as React.CSSProperties}
            className="group relative block aspect-[3/4] w-[78%] shrink-0 snap-start scroll-ml-4 overflow-hidden rounded-sm bg-marca sm:w-[45%] md:w-auto">
            {t.foto && <img src={t.foto} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover object-top transition-transform duration-[1.2s] ease-out group-hover:scale-[1.06] motion-reduce:transition-none" />}
            <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" aria-hidden />
            <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-5 text-white md:p-6">
              <span>
                <span className={`block text-[clamp(1.8rem,3.4vw,2.8rem)] ${titular}`}>{t.titulo}</span>
                {t.bajada && <span className="mt-1.5 block text-[0.95rem] text-white/85">{t.bajada}</span>}
              </span>
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white text-marca transition-transform duration-300 group-hover:rotate-45 motion-reduce:transition-none" aria-hidden>
                <ArrowUpRight size={22} /></span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ── Vidriera de productos ─────────────────────────────────────────────
export function Vidriera({ s, modelos }: { s: Seccion<"productos">; modelos: ModeloInicio[] }) {
  if (!modelos.length) return null;
  return (
    <section className="space-y-8">
      <Encabezado s={s} />
      <div data-revelar>
        <Carrusel etiqueta={s.titulo ?? "Productos"}>
          {modelos.map((m) => <div key={m.id} className="w-[46%] shrink-0 sm:w-[31%] lg:w-[23%]"><TarjetaProducto m={m} /></div>)}
        </Carrusel>
      </div>
    </section>
  );
}

// ── Promociones vigentes ──────────────────────────────────────────────
export function Promociones({ s, promos }: { s: Seccion<"promociones">; promos: string[] }) {
  if (!promos.length) return null;
  const tanda = Array.from({ length: Math.max(2, Math.ceil(6 / promos.length)) }, () => promos).flat();
  return (
    <section aria-label="Promociones" className="sangrado overflow-hidden bg-acento py-12 text-white md:py-16">
      <div className="mx-auto mb-8 flex max-w-7xl flex-wrap items-end justify-between gap-4 px-4 sm:px-6" data-revelar>
        <p className="text-sm font-bold uppercase tracking-[0.12em]">{s.titulo ?? "Promociones"}</p>
        {s.boton_texto && s.boton_enlace && <Boton href={s.boton_enlace} variante="blanco">{s.boton_texto} <Flecha /></Boton>}
      </div>
      <div className="pausa-hover" aria-hidden>
        <div className="corre flex w-max items-center" style={{ "--dur": `${tanda.length * 6}s` } as React.CSSProperties}>
          {[...tanda, ...tanda].map((p, i) => (
            <span key={i} className={`flex shrink-0 items-center gap-8 pr-8 text-[clamp(3rem,9vw,7.5rem)] ${titular} ${i % 2 ? "text-transparent [-webkit-text-stroke:2px_white]" : ""}`}>
              {p}<Asterisk size={56} strokeWidth={2.6} className="shrink-0" />
            </span>
          ))}
        </div>
      </div>
      <p className="sr-only">{promos.join(". ")}</p>
    </section>
  );
}

// ── Banner con foto ───────────────────────────────────────────────────
export function Banner({ s }: { s: Seccion<"banner"> }) {
  if (!s.imagen_url) return null;
  const centro = s.contenido.alineacion === "centro";
  return (
    <section className="sangrado relative grid min-h-[80svh] items-end overflow-hidden bg-marca text-white">
      <img src={s.imagen_url} alt="" loading="lazy" decoding="async" className="paralaje absolute inset-0 h-full w-full object-cover object-[50%_25%]" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" aria-hidden />
      <div className={`relative mx-auto w-full max-w-7xl space-y-5 px-4 py-14 sm:px-6 md:py-20 ${centro ? "text-center" : ""}`} data-revelar>
        {s.titulo && <h2 className={`${centro ? "mx-auto" : ""} max-w-[18ch] text-[clamp(2.4rem,7vw,6rem)] ${titular}`}>{s.titulo}</h2>}
        {s.bajada && <p className={`${centro ? "mx-auto" : ""} max-w-lg text-lg text-white/85`}>{s.bajada}</p>}
        {s.boton_texto && s.boton_enlace && <div className={centro ? "flex justify-center" : ""}><Boton href={s.boton_enlace} variante="blanco">{s.boton_texto} <Flecha /></Boton></div>}
      </div>
    </section>
  );
}

// ── Cómo comprar ──────────────────────────────────────────────────────
export function Pasos({ s }: { s: Seccion<"pasos"> }) {
  const pasos = s.contenido.pasos;
  if (!pasos.length) return null;
  return (
    <section className="space-y-10">
      {s.titulo && <h2 className={`max-w-[16ch] ${h2}`} data-revelar>{s.titulo}</h2>}
      <ol className={`grid gap-px overflow-hidden rounded-sm border border-borde bg-borde sm:grid-cols-2 ${pasos.length >= 3 ? "lg:grid-cols-3" : ""}`}>
        {pasos.map((p, i) => (
          <li key={i} className="group flex flex-col gap-10 bg-white p-6 transition-colors duration-500 hover:bg-marca hover:text-white md:min-h-72 md:p-8">
            <span className="text-[clamp(4rem,8vw,6.5rem)] font-extrabold leading-none tracking-[-0.06em] text-acento" data-revelar="numero" style={{ "--i": i } as React.CSSProperties} aria-hidden>
              {String(i + 1).padStart(2, "0")}</span>
            <div className="mt-auto">
              <p className="text-2xl font-extrabold tracking-[-0.03em]">{p.titulo}</p>
              <p className="mt-2 max-w-sm text-texto-2 transition-colors duration-500 group-hover:text-white/75">{p.texto}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ── El local ──────────────────────────────────────────────────────────
// Bloque oscuro con los datos y el nombre de la tienda gigante, cortado por el borde de abajo
export function Local({ s, contacto, tienda }: { s: Seccion<"local">; contacto: Contacto | null; tienda: string }) {
  return (
    <section id="local" aria-labelledby="local-t" className="sangrado -mb-16 scroll-mt-20 overflow-hidden bg-marca text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 pb-6 pt-16 sm:px-6 md:grid-cols-[1.3fr_1fr] md:items-end md:pt-24">
        <div className="space-y-6" data-revelar>
          <h2 id="local-t" className={`max-w-[12ch] text-[clamp(2.4rem,6.5vw,5rem)] ${titular}`}>{s.titulo ?? "Visitanos"}</h2>
          {s.bajada && <p className="max-w-md text-lg text-white/75">{s.bajada}</p>}
          <div className="flex flex-wrap gap-3 pt-1">
            {s.boton_texto && s.boton_enlace && <Boton href={s.boton_enlace} variante="blanco">{s.boton_texto} <Flecha /></Boton>}
            {contacto?.whatsapp && <Boton href={`https://wa.me/${contacto.whatsapp}`} variante="borde-blanco"><MessageCircle size={18} /> WhatsApp</Boton>}
          </div>
        </div>
        <ul className="space-y-5 text-[0.95rem]" data-revelar style={{ "--i": 1 } as React.CSSProperties}>
          {contacto?.direccion_retiro && <li className="flex gap-3 border-t border-white/15 pt-5"><MapPin size={20} className="mt-0.5 shrink-0" /><span><b className="block">Dónde</b><span className="text-white/75">{contacto.direccion_retiro}</span></span></li>}
          {contacto?.horario && <li className="flex gap-3 border-t border-white/15 pt-5"><Clock size={20} className="mt-0.5 shrink-0" /><span><b className="block">Cuándo</b><span className="text-white/75">{contacto.horario}</span></span></li>}
          {!contacto?.direccion_retiro && !contacto?.horario && <li className="text-white/75">Pronto vas a ver acá la dirección y el horario.</li>}
        </ul>
      </div>
      <p aria-hidden className="select-none whitespace-nowrap px-2 text-center text-[clamp(4rem,19vw,17rem)] font-extrabold leading-[0.78] tracking-[-0.07em] text-white/[0.09] translate-y-[14%]" data-revelar>
        {tienda}</p>
    </section>
  );
}
