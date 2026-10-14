// Parametrización: qué usa este local, sí o no. Lo que se enciende acá aparece en Configuración con su «cómo»; lo apagado deja de verse (los datos se conservan).
// Solo quien administra el equipo.
import Link from "next/link";
import { exigir } from "@/lib/exigir";
import { GRUPOS_PARAMETROS } from "@/lib/parametrizacion";
import Parametros, { type Modulo } from "./Parametros";

export default async function PaginaParametrizacion() {
  const { supabase } = await exigir("equipo.administrar", "equipo.modulos");
  const { data } = await supabase.from("modulos").select("clave, nombre, fijo, depende, activo");
  const modulos = (data ?? []) as Modulo[];
  const porClave = new Map(modulos.map((m) => [m.clave, m]));
  const conocidos = new Set(GRUPOS_PARAMETROS.flatMap((g) => g.parametros.map((p) => p.clave)));
  const grupos = GRUPOS_PARAMETROS.map((g) => ({
    titulo: g.titulo,
    parametros: g.parametros.flatMap((p) => { const m = porClave.get(p.clave); return m ? [{ ...p, modulo: m }] : []; }),
  })).filter((g) => g.parametros.length);
  const otros = modulos.filter((m) => !conocidos.has(m.clave) && !m.fijo).map((m) => ({ clave: m.clave, descripcion: "", modulo: m }));
  if (otros.length) grupos.push({ titulo: "Otros", parametros: otros });
  return (
    <div className="max-w-2xl space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Parametrización</h1>
        <p className="text-sm text-texto-2">Elegí qué usa este local. Lo que encendés aparece en <Link href="/admin/configuracion" className="font-medium text-marca">Configuración</Link> para configurarlo; lo que apagás deja de verse y no se puede cargar nada nuevo de eso (los datos se conservan).</p>
      </div>
      <Parametros grupos={grupos} />
    </div>
  );
}
