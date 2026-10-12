// Tienda online: cómo se ve la portada (secciones en orden, cada una editable) y los datos de la
// tienda (nombre, avisos, Instagram, WhatsApp, local). Lo ve quien tiene el permiso "Tienda online".
import { ExternalLink } from "lucide-react";
import { crearCliente } from "@/lib/supabase/server";
import { exigir } from "@/lib/exigir";
import { leerContenido, type Seccion, type Tipo } from "@/lib/inicio";
import FormTienda from "./FormTienda";
import ListaSecciones from "./ListaSecciones";

export default async function TiendaOnline() {
  await exigir("tienda.editar");
  const supabase = await crearCliente();
  const [{ data: secciones }, { data: tienda }, { data: catalogo }] = await Promise.all([
    supabase.from("inicio_secciones").select("id, tipo, orden, visible, titulo, bajada, boton_texto, boton_enlace, imagen_url, imagen_ruta, contenido").order("orden").order("id"),
    supabase.from("configuracion_tienda").select("nombre, avisos, aviso_enlace, instagram, whatsapp, direccion_retiro, horario, dias_retiro, dias_cambio, dias_saldo, wa_bot_activo, wa_notificaciones_pedidos").single(),
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
        <a href="/" target="_blank" className="boton-sec"><ExternalLink size={16} /> Ver la tienda</a>
      </div>

      <section className="space-y-3">
        <div><h2 className="font-semibold">Portada</h2>
          <p className="text-sm text-texto-2">En este orden, de arriba hacia abajo. Con el ojo la ocultás sin borrarla.</p></div>
        <ListaSecciones secciones={lista} opciones={opciones} />
      </section>

      <section className="overflow-hidden rounded-xl border border-borde bg-white shadow-sm">
        <div className="border-b border-borde px-5 py-4"><h2 className="font-semibold">Datos de la tienda</h2>
          <p className="text-sm text-texto-2">Nombre, avisos, redes y lo que ve el cliente al hacer un pedido.</p></div>
        {tienda && <FormTienda tienda={tienda} integracion={{
          meta: Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_VERIFY_TOKEN && process.env.WHATSAPP_APP_SECRET),
          gemini: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY),
          webhook: process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}/api/whatsapp` : "/api/whatsapp",
        }} />}
      </section>
    </div>
  );
}
