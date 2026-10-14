// Sucursales y cajas: la estructura del local y su vínculo con Mercado Pago. Solo con el módulo encendido (Equipo → Módulos).
import Link from "next/link";
import { crearCliente } from "@/lib/supabase/server";
import { exigir } from "@/lib/exigir";
import Sucursales, { type DatosSucursales } from "./Sucursales";

export default async function PaginaSucursales() {
  await exigir("equipo.administrar", "tienda.editar");
  const supabase = await crearCliente();
  const { data: modulo } = await supabase.from("modulos").select("activo").eq("clave", "sucursales").maybeSingle();
  if (modulo && !modulo.activo) {
    return <div className="space-y-2"><h1 className="text-2xl font-bold">Sucursales y cajas</h1>
      <p className="text-texto-2">Esta parte está apagada. Se enciende en <Link href="/admin/equipo/modulos" className="font-medium text-marca">Equipo → Módulos</Link>. Si tenés un solo local, no la necesitás: el cobro con QR se configura en Integraciones → Mercado Pago.</p></div>;
  }
  const { data } = await supabase.rpc("sucursales_estado");
  const datos = data as unknown as DatosSucursales | null;
  return (
    <div className="max-w-4xl space-y-5">
      <div><h1 className="text-2xl font-bold">Sucursales y cajas</h1>
        <p className="text-sm text-texto-2">Cada sucursal tiene su depósito y puede vincularse con una sucursal de Mercado Pago. Cada caja se vincula con una caja de Mercado Pago (su QR) y con un posnet. Cada dispositivo cobra con la caja que le asignes.</p></div>
      {datos ? <Sucursales datos={datos} /> : <p className="text-error">No se pudo leer la configuración.</p>}
    </div>
  );
}
