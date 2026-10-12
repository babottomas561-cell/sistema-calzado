// Tienda online: cómo se ve la portada (secciones en orden, cada una editable) y los datos de la
// tienda (nombre, avisos, Instagram, WhatsApp, local). Lo ve quien tiene el permiso "Tienda online".
import Link from "next/link";
import { ExternalLink, Scale } from "lucide-react";
import { crearCliente } from "@/lib/supabase/server";
import { exigir } from "@/lib/exigir";
import { leerContenido, type Seccion, type Tipo } from "@/lib/inicio";
import FormTienda from "./FormTienda";
import IconoTienda from "./IconoTienda";
import IdentidadTienda from "./IdentidadTienda";
import ListaSecciones from "./ListaSecciones";

export default async function TiendaOnline() {
  await exigir("tienda.editar");
  const supabase = await crearCliente();
  const [{ data: secciones }, { data: tienda }, { data: catalogo }] = await Promise.all([
    supabase.from("inicio_secciones").select("id, tipo, orden, visible, titulo, bajada, boton_texto, boton_enlace, imagen_url, imagen_ruta, contenido").order("orden").order("id"),
    supabase.from("configuracion_tienda").select("icono_url, logo_url, logo_oscuro_url, color_marca, nombre, avisos, aviso_enlace, instagram, whatsapp, direccion_retiro, horario, dias_retiro, dias_cambio, dias_saldo").single(),
    supabase.from("v_catalogo").select("producto_id, nombre, marca, categoria, genero, linea, imagen_url"),
  ]);
  const lista = (secciones ?? []).map((s) => ({ ...s, tipo: s.tipo as Tipo, contenido: leerContenido(s.tipo as Tipo, s.contenido) })) as Seccion[];

  // Opciones para "a dónde lleva" y para elegir productos a mano: lo que hay publicado
  const filas = catalogo ?? [];
  const unicos = (xs: (string | null)[]) => [...new Set(xs.filter(Boolean))].sort((a, b) => a!.localeCompare(b!)) as string[];
  const productos = [...new Map(filas.map((f) => [f.producto_id, { id: f.producto_id!, nombre: f.nombre!, marca: f.marca, imagen: f.imagen_url }])).values()]
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  const opciones = { generos: unicos(filas.map((f) => f.genero)), lineas: unicos(filas.map((f) => f.linea)), rubros: unicos(filas.map((f) => f.categoria)), productos };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-bold">Tienda online</h1>
          <p className="text-sm text-texto-2">La portada de la tienda, armada por secciones. Los cambios se ven al instante.</p></div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/tienda/legales" className="boton-sec"><Scale size={16} strokeWidth={1.8} /> Legales</Link>
          <a href="/" target="_blank" className="boton-sec"><ExternalLink size={16} /> Ver la tienda</a>
        </div>
      </div>

      <section className="space-y-3">
        <div><h2 className="font-semibold">Portada</h2>
          <p className="text-sm text-texto-2">En este orden, de arriba hacia abajo. Con el ojo la ocultás sin borrarla.</p></div>
        <ListaSecciones secciones={lista} opciones={opciones} />
      </section>

      {tienda && (
        <section className="space-y-4 overflow-hidden rounded-xl border border-borde bg-white p-5 shadow-sm">
          <div><h2 className="font-semibold">Identidad</h2><p className="text-sm text-texto-2">El logo y el color de tu marca: se ven en la tienda, en el panel y en los mails.</p></div>
          <IdentidadTienda logo={tienda.logo_url} logoOscuro={tienda.logo_oscuro_url} color={tienda.color_marca} />
        </section>
      )}

      <section className="overflow-hidden rounded-xl border border-borde bg-white shadow-sm">
        <div className="border-b border-borde px-5 py-4"><h2 className="font-semibold">Datos de la tienda</h2>
          <p className="text-sm text-texto-2">Nombre, avisos, redes y lo que ve el cliente al hacer un pedido.</p></div>
        {tienda && <div className="border-b border-borde px-5 py-4"><p className="etiqueta">Ícono de la pestaña</p><IconoTienda url={tienda.icono_url} nombre={tienda.nombre} /></div>}
        {tienda && <FormTienda tienda={tienda} />}
      </section>
    </div>
  );
}
