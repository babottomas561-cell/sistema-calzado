"use client";
// Datos de la tienda: el nombre, el aviso de arriba, Instagram y lo que ve el cliente al hacer un pedido
// (a qué WhatsApp llega, dónde se retira y el horario).
import { useActionState } from "react";
import { CircleCheck } from "lucide-react";
import { guardarTienda } from "./acciones";

type Tienda = { nombre: string; aviso: string | null; aviso_enlace: string | null; instagram: string | null; whatsapp: string | null; direccion_retiro: string | null; horario: string | null };

export default function FormTienda({ tienda }: { tienda: Tienda }) {
  const [estado, accion, cargando] = useActionState(guardarTienda, {});
  return (
    <form action={accion} className="grid gap-4 px-5 py-4 sm:grid-cols-2">
      <div><label className="etiqueta">Nombre de la tienda</label><input name="nombre" defaultValue={tienda.nombre} className="campo" /></div>
      <div><label className="etiqueta">Instagram</label>
        <div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-texto-2">@</span>
          <input name="instagram" defaultValue={tienda.instagram ?? ""} placeholder="mitienda" className="campo pl-7" /></div></div>
      <div className="sm:col-span-2"><label className="etiqueta">Aviso de arriba (opcional)</label>
        <div className="grid gap-2 sm:grid-cols-[1fr_12rem]">
          <input name="aviso" defaultValue={tienda.aviso ?? ""} maxLength={120} placeholder="Envío gratis en San Miguel de Tucumán" className="campo" />
          <input name="aviso_enlace" defaultValue={tienda.aviso_enlace ?? ""} placeholder="Link: /tienda (opcional)" className="campo" aria-label="Link del aviso" /></div>
        <p className="mt-0.5 text-[11px] text-texto-2">Una franja fina arriba de todo, en todas las páginas de la tienda. Vacío, no se muestra.</p></div>
      <div><label className="etiqueta">WhatsApp para los pedidos</label>
        <input name="whatsapp" type="tel" defaultValue={tienda.whatsapp ?? ""} placeholder="549 381 555-1234" className="campo" />
        <p className="mt-0.5 text-[11px] text-texto-2">Con el 54, el 9 y el código de área. Al confirmar un pedido, el cliente lo manda a este número.</p></div>
      <div><label className="etiqueta">Horario</label><input name="horario" defaultValue={tienda.horario ?? ""} placeholder="Lun a sáb de 9 a 13 y de 17 a 21" className="campo" /></div>
      <div className="sm:col-span-2"><label className="etiqueta">Dirección para retirar</label><input name="direccion_retiro" defaultValue={tienda.direccion_retiro ?? ""} placeholder="Av. Mate de Luna 1234, San Miguel de Tucumán" className="campo" /></div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button className="boton" disabled={cargando}>Guardar</button>
        {estado.error && <p className="text-sm text-error">{estado.error}</p>}
        {estado.ok && <p className="flex items-center gap-1.5 text-sm text-ok"><CircleCheck size={16} /> {estado.ok}</p>}
      </div>
    </form>
  );
}
