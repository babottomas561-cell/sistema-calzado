// El código QR de un link, dibujado en SVG: es vectorial, así sale nítido hasta en un ticket térmico, y se arma al renderizar (sin esperar
// nada del navegador). Lleva la zona en blanco de 4 módulos que pide el estándar para que los celulares lo lean.
import { create } from "qrcode";

export default function CodigoQR({ texto, className = "", style }: { texto: string; className?: string; style?: React.CSSProperties }) {
  let modulos;
  try { modulos = create(texto, { errorCorrectionLevel: "M" }).modules; } catch { return null; }   // más largo de lo que entra en un QR
  const n = modulos.size;
  // Una sola figura: una barra por cada tramo de módulos oscuros seguidos en la fila
  let d = "";
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!modulos.get(y, x)) continue;
      let largo = 1;
      while (x + largo < n && modulos.get(y, x + largo)) largo++;
      d += `M${x} ${y}h${largo}v1h-${largo}z`;
      x += largo;
    }
  }
  const lado = n + 8;
  return (
    <svg viewBox={`-4 -4 ${lado} ${lado}`} role="img" aria-label="Código QR del comprobante digital" shapeRendering="crispEdges" className={className} style={{ display: "block", width: "100%", height: "auto", ...style }}>
      <rect x={-4} y={-4} width={lado} height={lado} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}
