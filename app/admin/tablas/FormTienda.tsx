"use client";
// Datos de la tienda: a qué WhatsApp llegan los pedidos web, dónde se retira y el horario.
import { useActionState } from "react";
import { CircleCheck } from "lucide-react";
import { guardarTienda } from "./acciones";

type Tienda = { nombre: string; whatsapp: string | null; direccion_retiro: string | null; horario: string | null };

export default function FormTienda({ tienda }: { tienda: Tienda }) {
  const [estado, accion, cargando] = useActionState(guardarTienda, {});
  return (
    <form action={accion} className="max-w-xl space-y-4 px-5 py-4">
      <div><label className="etiqueta">Nombre de la tienda</label><input name="nombre" defaultValue={tienda.nombre} className="campo" /></div>
      <div><label className="etiqueta">WhatsApp para los pedidos</label>
        <input name="whatsapp" type="tel" defaultValue={tienda.whatsapp ?? ""} placeholder="549 381 555-1234" className="campo" />
        <p className="mt-0.5 text-[11px] text-texto-2">Con el 54, el 9 y el código de área. Al confirmar un pedido en la tienda, el cliente lo manda a este número con todo el detalle.</p></div>
      <div><label className="etiqueta">Dirección para retirar</label><input name="direccion_retiro" defaultValue={tienda.direccion_retiro ?? ""} placeholder="Av. Mate de Luna 1234, San Miguel de Tucumán" className="campo" /></div>
      <div><label className="etiqueta">Horario</label><input name="horario" defaultValue={tienda.horario ?? ""} placeholder="Lun a sáb de 9 a 13 y de 17 a 21" className="campo" /></div>
      {estado.error && <p className="text-sm text-error">{estado.error}</p>}
      {estado.ok && <p className="flex items-center gap-1.5 text-sm text-ok"><CircleCheck size={16} /> {estado.ok}</p>}
      <button className="boton" disabled={cargando}>Guardar</button>
    </form>
  );
}
