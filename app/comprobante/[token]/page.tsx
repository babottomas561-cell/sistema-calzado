// El comprobante que recibe el cliente por WhatsApp o mail. No hace falta ingresar: el link es largo y al azar (el local puede invalidarlo).
// Se ve cómodo en el celular y, al guardarlo como PDF, sale en una hoja A4 prolija. Nunca lleva costos ni notas internas.
import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Comprobante from "@/components/Comprobante";
import { crearCliente } from "@/lib/supabase/server";
import { leerComprobante } from "@/lib/comprobante";
import BotonPDF from "./BotonPDF";

// Una sola lectura por visita (cada una cuenta como una vista del link): la página y su título comparten esta
const leer = cache(async (token: string) => {
  const supabase = await crearCliente();
  const { data, error } = await supabase.rpc("comprobante_publico", { p_token: token });
  return error ? null : leerComprobante(data);
});

// El link lleva el secreto: que no se filtre a otros sitios (el logo) por el «referer» y que ningún buscador lo guarde
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const c = await leer((await params).token);
  return { title: c ? `${c.titulo} ${c.numero} · ${c.emisor.nombre}` : "Comprobante", robots: { index: false, follow: false }, referrer: "no-referrer" };
}

export default async function ComprobantePublico({ params }: { params: Promise<{ token: string }> }) {
  const c = await leer((await params).token);
  if (!c) notFound();
  return (
    <main className="min-h-screen px-4 py-6 print:p-0">
      <style>{"@page{size:A4;margin:0}"}</style>
      <div className="mx-auto max-w-sm space-y-4 print:hidden">
        <div className="overflow-hidden rounded-2xl border border-borde bg-white shadow-sm"><Comprobante c={c} formato="pantalla" /></div>
        <BotonPDF />
        <p className="text-center text-xs text-texto-2">Este comprobante es un resumen de tu compra. Guardalo o compartilo cuando quieras.</p>
      </div>
      <div className="hidden print:block"><Comprobante c={c} formato="a4" /></div>
    </main>
  );
}
