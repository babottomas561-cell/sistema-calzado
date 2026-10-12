// El ícono de la pestaña: el que cargó el dueño (Tienda online) o, si no hay, la inicial de la tienda sobre el color
// de la marca. Lo piden <link rel="icon"> y el ícono del celular (app/layout.tsx).
import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { crearCliente } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await crearCliente();
  const { data } = await supabase.from("configuracion_tienda").select("nombre, icono_url").single();
  if (data?.icono_url) return NextResponse.redirect(data.icono_url, { status: 307 });
  const inicial = (data?.nombre ?? "M").trim().charAt(0).toUpperCase() || "M";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
        background: "#1d4ed8", color: "white", fontSize: 120, fontWeight: 800, borderRadius: 40 }}>{inicial}</div>
    ),
    { width: 180, height: 180, headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
