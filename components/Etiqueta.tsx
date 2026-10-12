"use client";
// Una etiqueta del tamaño real (en milímetros) que dice la plantilla: se ve igual en pantalla y en el papel. Lleva lo que la
// plantilla tenga prendido: tienda, nombre, marca, talle y color, precio y el código de barras (con su número abajo).
import CodigoBarras from "@/components/CodigoBarras";
import { tipoDeCodigo } from "@/lib/codigos";
import { pesos } from "@/lib/formato";
import type { DatoEtiqueta, Plantilla } from "@/lib/etiquetas";

export default function Etiqueta({ t, d }: { t: Plantilla; d: DatoEtiqueta }) {
  const tipo = t.tipo_codigo === "code128" ? "code128" : tipoDeCodigo(d.codigo);
  const pt = t.tamano_texto;
  const corto: React.CSSProperties = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
  return (
    <div style={{ width: `${t.ancho_mm}mm`, height: `${t.alto_mm}mm`, boxSizing: "border-box", padding: "0.8mm 1.4mm", overflow: "hidden", display: "flex", flexDirection: "column",
      justifyContent: "space-between", gap: "0.3mm", background: "#fff", color: "#000", fontFamily: "Arial, Helvetica, sans-serif", fontSize: `${pt}pt`, lineHeight: 1.1 }}>
      <div style={{ minHeight: 0 }}>
        {t.mostrar_tienda && <div style={{ ...corto, fontSize: `${pt * 0.85}pt`, letterSpacing: "0.1em", textTransform: "uppercase" }}>{d.tienda}</div>}
        {t.mostrar_nombre && <div style={{ fontWeight: 700, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{d.nombre}</div>}
        {t.mostrar_marca && d.marca && <div style={{ ...corto, fontSize: `${pt * 0.9}pt` }}>{d.marca}</div>}
      </div>
      {(t.mostrar_talle_color || t.mostrar_precio) && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1mm" }}>
          <span style={{ ...corto, minWidth: 0 }}>{t.mostrar_talle_color ? `Talle ${d.talle} · ${d.color}` : ""}</span>
          {t.mostrar_precio && <span style={{ fontWeight: 800, fontSize: `${t.tamano_precio}pt`, whiteSpace: "nowrap" }}>{pesos(d.precio)}</span>}
        </div>
      )}
      <div>
        <div style={{ padding: "0 1mm" }}><CodigoBarras codigo={d.codigo} tipo={tipo} alto={`${t.alto_codigo_mm}mm`} /></div>
        {t.mostrar_codigo && <div style={{ textAlign: "center", fontFamily: "ui-monospace, Menlo, monospace", fontSize: `${pt * 0.85}pt`, letterSpacing: "0.06em" }}>{d.codigo}</div>}
      </div>
    </div>
  );
}
