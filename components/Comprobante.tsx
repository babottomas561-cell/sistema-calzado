// El comprobante tal como se imprime o se ve en el celular: ticket de 80 o de 58 mm, hoja A4, o la versión «pantalla» (la del link que
// recibe el cliente). Es solo dibujo: todo lo que muestra viene armado por la base (comprobante_de / comprobante_publico), sin costos ni
// notas internas. Los tamaños van en milímetros y puntos para que el papel salga igual que la vista previa; el negro es negro de verdad
// (las térmicas no tienen grises).
import CodigoBarras from "@/components/CodigoBarras";
import CodigoQR from "@/components/CodigoQR";
import { fechaCompleta, pesos, porcentaje } from "@/lib/formato";
import { esFactura, importeRenglon, LETRAS, numeroDe, tituloDe, type Comprobante as Doc, type FormatoComprobante } from "@/lib/comprobante";

export type Presentacion = FormatoComprobante | "pantalla";

const TIPO_LETRA = "Arial, Helvetica, sans-serif";
const MONO = "ui-monospace, Menlo, Consolas, monospace";
const monto = (n: number) => (n < 0 ? `−${pesos(-n)}` : pesos(n));
const fila: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "2mm" };
const num: React.CSSProperties = { whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };

// Los datos del comercio que van arriba, uno por renglón (solo los que se cargaron)
const datosLegales = (c: Doc) => esFactura(c)
  ? [c.fiscal!.emisor.razon_social, c.fiscal!.emisor.domicilio, c.fiscal!.emisor.cuit && `CUIT ${c.fiscal!.emisor.cuit}`, c.fiscal!.emisor.condicion_iva && `IVA ${c.fiscal!.emisor.condicion_iva}`,
     c.fiscal!.emisor.ingresos_brutos && `Ingresos Brutos ${c.fiscal!.emisor.ingresos_brutos}`,
     c.fiscal!.emisor.inicio_actividades && `Inicio de actividades ${fechaCorta(c.fiscal!.emisor.inicio_actividades)}`].filter((x): x is string => !!x)
  : c.config.datos_legales
  ? [c.emisor.razon_social, c.emisor.cuit && `CUIT ${c.emisor.cuit}`, c.emisor.condicion_iva, c.emisor.domicilio, c.emisor.telefono && `Tel. ${c.emisor.telefono}`].filter((x): x is string => !!x)
  : [];
const detallePago = (p: Doc["pagos"][number]) => [
  p.medio + (Number(p.ajuste_pct) ? ` (${porcentaje(p.ajuste_pct)})` : ""), p.cuotas > 1 ? `${p.cuotas} cuotas de ${pesos(p.monto / p.cuotas)}` : null, p.referencia,
].filter(Boolean).join(" · ");
// El tamaño de letra elegido en Impresión (chica, normal, grande) agranda o achica todo el texto por igual
const tam = (v: string, k: number) => v.replace(/^([\d.]+)/, (n) => String(Math.round(Number(n) * k * 10) / 10));
const variante = (c: Doc, r: Doc["renglones"][number]) => r.variante + (c.config.mostrar_marca && r.marca ? ` · ${r.marca}` : "");
const fechaCorta = (x: string) => new Date(x.length === 10 ? `${x}T12:00:00` : x).toLocaleDateString("es-AR");
// Las líneas fiscales de abajo: transparencia fiscal, CAE y, si se anuló, la nota de crédito
const lineasFiscales = (c: Doc): string[] => {
  const f = c.fiscal;
  if (!f || f.estado !== "autorizada") return [];
  const ivaContenido = f.letra === "B" ? f.iva : f.letra === "C" && f.iva_contenido_en_c === "cero" ? 0 : null;
  return [
    "Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)",
    ...(ivaContenido != null ? [`IVA contenido: ${pesos(ivaContenido)}`] : []),
    `CAE ${f.cae} · Vto. ${f.cae_vence ? fechaCorta(f.cae_vence) : ""}`,
    ...(f.nota_credito?.estado === "autorizada" ? [`Anulada con nota de crédito ${f.nota_credito.letra} ${f.nota_credito.comprobante} (CAE ${f.nota_credito.cae})`] : []),
  ];
};
const TIPO_DOC: Record<number, string> = { 80: "CUIT", 86: "CUIL", 96: "DNI", 94: "Pasaporte" };
const receptor = (c: Doc) => {
  if (!esFactura(c)) return null;
  const f = c.fiscal!;
  if (f.doc_tipo === 99) return "A consumidor final";
  const doc = f.doc_tipo === 80 || f.doc_tipo === 86 ? `${f.doc_nro.slice(0, 2)}-${f.doc_nro.slice(2, 10)}-${f.doc_nro.slice(10)}` : f.doc_nro;
  return [f.receptor, `${TIPO_DOC[f.doc_tipo] ?? "Doc."} ${doc}`, f.condicion_receptor, f.domicilio_receptor || null].filter(Boolean).join(" · ");
};
// Factura A: el neto y el IVA de cada alícuota, discriminados
const discriminado = (c: Doc) => (esFactura(c) && c.fiscal!.letra === "A"
  ? [{ rotulo: "Neto gravado", monto: c.fiscal!.neto }, ...c.fiscal!.detalle_iva.map((d) => ({ rotulo: `IVA ${String(d.alicuota).replace(".", ",")} %`, monto: d.iva }))]
  : []);
const rotuloAnulado = (c: Doc) => (c.tipo === "presupuesto" ? "PRESUPUESTO ANULADO" : "COMPROBANTE ANULADO");

// ── Ticket (80 mm, 58 mm y la versión del celular) ─────────────────────────
type Escala = { cuerpo: string; chico: string; grande: string; logo: string; qr: string; barras: string; relleno: string; tenue: string; raya: string };
const ESCALAS: Record<"ticket80" | "ticket58" | "pantalla", Escala> = {
  ticket80: { cuerpo: "9pt", chico: "7.5pt", grande: "13pt", logo: "15mm", qr: "28mm", barras: "11mm", relleno: "4mm", tenue: "#000", raya: "#000" },
  ticket58: { cuerpo: "8pt", chico: "6.5pt", grande: "11.5pt", logo: "12mm", qr: "27mm", barras: "10mm", relleno: "5mm", tenue: "#000", raya: "#000" },
  pantalla: { cuerpo: "15px", chico: "12.5px", grande: "24px", logo: "56px", qr: "132px", barras: "52px", relleno: "22px", tenue: "#6b7280", raya: "#c9ced6" },
};

function Ticket({ c, p, url }: { c: Doc; p: "ticket80" | "ticket58" | "pantalla"; url?: string | null }) {
  const k = LETRAS[c.config.letra]?.escala ?? 1;
  const base = ESCALAS[p];
  const e: Escala = { ...base, cuerpo: tam(base.cuerpo, k), chico: tam(base.chico, k), grande: tam(base.grande, k) };
  const em = c.emisor;
  const legales = datosLegales(c);
  const raya: React.CSSProperties = { border: 0, borderTop: `1px dashed ${e.raya}`, margin: "2.4mm 0", height: 0 };
  const centro: React.CSSProperties = { textAlign: "center" };
  return (
    <div style={{ width: "100%", boxSizing: "border-box", padding: p === "pantalla" ? `${e.relleno}` : `3mm ${e.relleno} 7mm`, background: "#fff", color: "#000", fontFamily: TIPO_LETRA, fontSize: e.cuerpo, lineHeight: 1.25 }}>
      {/* quién emite */}
      <div style={centro}>
        {c.config.logo && em.logo_url && <img src={em.logo_url} alt={em.es_icono ? "" : em.nombre} style={{ display: "block", margin: "0 auto", maxHeight: em.es_icono ? `calc(${e.logo} * 0.8)` : e.logo, maxWidth: "100%", objectFit: "contain" }} />}
        {(!c.config.logo || !em.logo_url || em.es_icono) && <div style={{ marginTop: em.es_icono && c.config.logo ? "1mm" : 0, fontSize: e.grande, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.03em" }}>{em.nombre}</div>}
        {c.config.encabezado && <div style={{ marginTop: "1.2mm", fontSize: e.chico }}>{c.config.encabezado}</div>}
        {legales.length > 0 && <div style={{ marginTop: "1.6mm", fontSize: e.chico, color: e.tenue }}>{legales.map((l, i) => <div key={i}>{l}</div>)}</div>}
      </div>
      <hr style={raya} />

      {/* qué es */}
      {esFactura(c) && <div style={{ ...centro, margin: "0 auto 1mm", width: "9mm", height: "9mm", lineHeight: "9mm", border: "0.5mm solid #000", fontSize: e.grande, fontWeight: 800 }}>{c.fiscal!.letra}</div>}
      <div style={{ ...centro, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em" }}>{tituloDe(c)}{esFactura(c) && <span style={{ fontWeight: 400, fontSize: e.chico }}> · Cód. {c.fiscal!.codigo}</span>}</div>
      <div style={{ ...centro, fontFamily: MONO, fontWeight: 700, fontSize: e.grande }}>{numeroDe(c)}</div>
      <div style={{ ...centro, fontSize: e.chico, color: e.tenue }}>{fechaCompleta(c.fecha)}</div>
      {!esFactura(c) && <div style={{ ...centro, margin: "1.4mm auto 0", width: "fit-content", border: `1px solid ${e.raya === "#000" ? "#000" : "#9ca3af"}`, borderRadius: "1mm", padding: "0.4mm 2mm", fontSize: e.chico, fontWeight: 700, letterSpacing: "0.04em" }}>NO VÁLIDO COMO FACTURA</div>}
      {c.fiscal && !esFactura(c) && c.fiscal.estado !== "cancelada" && <div style={{ ...centro, marginTop: "1mm", fontSize: e.chico, fontWeight: 700 }}>FACTURA EN TRÁMITE</div>}
      {esFactura(c) && c.fiscal!.pruebas && <div style={{ ...centro, marginTop: "1mm", fontSize: e.chico, fontWeight: 700 }}>PRUEBA DE ARCA (HOMOLOGACIÓN) · SIN VALIDEZ</div>}
      {c.anulada && <div style={{ ...centro, border: "0.5mm solid #000", padding: "1mm", margin: "2mm 0 0", fontWeight: 800, letterSpacing: "0.08em" }}>{rotuloAnulado(c)}</div>}
      <div style={{ marginTop: "1.6mm", fontSize: e.chico }}>
        {receptor(c) && <div><b>Receptor:</b> {receptor(c)}</div>}
        {c.config.mostrar_cliente && c.cliente && !(esFactura(c) && c.fiscal!.doc_tipo !== 99) && <div><b>Cliente:</b> {c.cliente}</div>}
        {c.origen && <div><b>Por la venta:</b> {c.origen}</div>}
        {c.config.mostrar_vendedor && c.atendio && <div><b>Te atendió:</b> {c.atendio}</div>}
      </div>
      <hr style={raya} />

      {/* qué se llevó */}
      {c.renglones.map((r, i) => (
        <div key={i} style={{ breakInside: "avoid", margin: "1.4mm 0" }}>
          <div style={{ fontWeight: 700 }}>{r.detalle}</div>
          <div style={{ fontSize: e.chico, color: e.tenue }}>{variante(c, r)}</div>
          <div style={fila}><span>{r.cantidad} {r.precio != null ? `× ${pesos(r.precio)}` : r.cantidad === 1 ? "unidad" : "unidades"}</span><span style={num}>{pesos(importeRenglon(r))}</span></div>
          {Number(r.descuento) > 0 && <div style={{ ...fila, fontSize: e.chico }}><span>{r.promocion ?? "Promoción"}</span><span style={num}>−{pesos(r.descuento)}</span></div>}
        </div>
      ))}
      <hr style={raya} />

      {/* cuánto */}
      {c.totales.map((t, i) => t.fuerte
        ? <div key={i} style={{ ...fila, fontSize: e.grande, fontWeight: 800, margin: "0.8mm 0" }}><span>{t.rotulo.toUpperCase()}</span><span style={num}>{monto(t.monto)}</span></div>
        : <div key={i} style={fila}><span>{t.rotulo}</span><span style={num}>{monto(t.monto)}</span></div>)}
      {discriminado(c).length > 0 && <div style={{ marginTop: "1.2mm", paddingTop: "1mm", borderTop: `1px dotted ${e.raya}`, fontSize: e.chico }}>
        {discriminado(c).map((d, i) => <div key={i} style={fila}><span>{d.rotulo}</span><span style={num}>{pesos(d.monto)}</span></div>)}</div>}
      {c.pagos.length > 0 && (
        <>
          <hr style={raya} />
          <div style={{ fontSize: e.chico, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.6mm" }}>Forma de pago</div>
          {c.pagos.map((x, i) => <div key={i} style={fila}><span>{detallePago(x)}</span><span style={num}>{pesos(x.monto)}</span></div>)}
        </>
      )}
      {c.saldo > 0.01 && <div style={{ ...fila, fontWeight: 800, marginTop: "1mm" }}><span>Saldo pendiente</span><span style={num}>{pesos(c.saldo)}</span></div>}
      <hr style={raya} />

      {/* cierre */}
      {lineasFiscales(c).length > 0 && <div style={{ ...centro, fontSize: e.chico, marginBottom: "2mm" }}>{lineasFiscales(c).map((l, i) => <div key={i} style={l.startsWith("CAE") ? { fontWeight: 700, fontFamily: MONO } : undefined}>{l}</div>)}</div>}
      {c.pie && <div style={{ ...centro, fontWeight: 700 }}>{c.pie}</div>}
      {c.leyenda && !esFactura(c) && <div style={{ ...centro, fontSize: e.chico, color: e.tenue, marginTop: "1mm" }}>{c.leyenda}</div>}
      {esFactura(c) && c.fiscal!.qr && (
        <div style={{ ...centro, marginTop: "3mm", breakInside: "avoid" }}>
          <div style={{ width: e.qr, margin: "0 auto" }}><CodigoQR texto={c.fiscal!.qr} /></div>
          <div style={{ fontSize: e.chico, color: e.tenue }}>Comprobante autorizado por ARCA</div>
        </div>
      )}
      {!esFactura(c) && c.config.qr && url && (
        <div style={{ ...centro, marginTop: "3mm", breakInside: "avoid" }}>
          <div style={{ width: e.qr, margin: "0 auto" }}><CodigoQR texto={url} /></div>
          <div style={{ fontSize: e.chico, color: e.tenue }}>Escaneá para ver tu comprobante digital</div>
        </div>
      )}
      {c.config.barras && (
        <div style={{ marginTop: "3mm", breakInside: "avoid" }}>
          <div style={{ padding: "0 2mm" }}><CodigoBarras codigo={c.numero} tipo="code128" alto={e.barras} /></div>
          <div style={{ ...centro, fontFamily: MONO, fontSize: e.chico, letterSpacing: "0.06em" }}>{c.numero}</div>
        </div>
      )}
    </div>
  );
}

// ── Hoja A4 ───────────────────────────────────────────────────────────────
// Va dentro de una tabla con un renglón vacío arriba y otro abajo que el navegador repite en cada hoja: así, si la venta es larga y pasa
// a una segunda hoja, también esa tiene márgenes (la página se pide sin márgenes para que no aparezcan la fecha y la dirección de internet).
function HojaA4({ c, url }: { c: Doc; url?: string | null }) {
  const em = c.emisor;
  const k = LETRAS[c.config.letra]?.escala ?? 1;
  const pt = (n: number) => `${Math.round(n * k * 10) / 10}pt`;
  const legales = datosLegales(c);
  const th: React.CSSProperties = { padding: "1.6mm 0", fontSize: "8pt", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "0.35mm solid #000", textAlign: "right" };
  const td: React.CSSProperties = { padding: "2mm 0", borderBottom: "0.15mm solid #999", verticalAlign: "top", textAlign: "right", ...num };
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff", color: "#000", fontFamily: TIPO_LETRA, fontSize: pt(10), lineHeight: 1.3 }}>
      <thead><tr><td style={{ height: "12mm", padding: 0 }} /></tr></thead>
      <tfoot><tr><td style={{ height: "12mm", padding: 0 }} /></tr></tfoot>
      <tbody><tr><td style={{ padding: "0 15mm", verticalAlign: "top" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10mm", paddingBottom: "4mm", borderBottom: "0.5mm solid #000" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "3mm" }}>
              {c.config.logo && em.logo_url && <img src={em.logo_url} alt={em.es_icono ? "" : em.nombre} style={{ display: "block", maxHeight: em.es_icono ? "14mm" : "20mm", maxWidth: "70mm", objectFit: "contain" }} />}
              {(!c.config.logo || !em.logo_url || em.es_icono) && <div style={{ fontSize: pt(17), fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.03em" }}>{em.nombre}</div>}
            </div>
            {c.config.encabezado && <div style={{ marginTop: "1.5mm", fontSize: pt(9) }}>{c.config.encabezado}</div>}
            {legales.length > 0 && <div style={{ marginTop: "2mm", fontSize: pt(8.5) }}>{legales.map((l, i) => <div key={i}>{l}</div>)}</div>}
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            {esFactura(c) && <div style={{ display: "inline-block", width: "13mm", height: "13mm", lineHeight: "13mm", textAlign: "center", border: "0.6mm solid #000", fontSize: "22pt", fontWeight: 800, marginBottom: "1mm" }}>{c.fiscal!.letra}</div>}
            <div style={{ fontSize: "9pt", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>{tituloDe(c)}{esFactura(c) && <span style={{ fontWeight: 400 }}> · Cód. {c.fiscal!.codigo}</span>}</div>
            <div style={{ fontFamily: MONO, fontSize: "17pt", fontWeight: 700 }}>{numeroDe(c)}</div>
            <div style={{ fontSize: "9pt" }}>{fechaCompleta(c.fecha)}</div>
            {!esFactura(c) && <div style={{ display: "inline-block", marginTop: "1.5mm", border: "0.3mm solid #000", padding: "0.5mm 2mm", fontSize: "7.5pt", fontWeight: 700, letterSpacing: "0.06em" }}>DOCUMENTO NO VÁLIDO COMO FACTURA</div>}
            {c.fiscal && !esFactura(c) && c.fiscal.estado !== "cancelada" && <div style={{ marginTop: "1mm", fontSize: "8pt", fontWeight: 700 }}>FACTURA EN TRÁMITE</div>}
            {esFactura(c) && c.fiscal!.pruebas && <div style={{ marginTop: "1mm", fontSize: "8pt", fontWeight: 700 }}>PRUEBA DE ARCA · SIN VALIDEZ</div>}
          </div>
        </div>
        {c.anulada && <div style={{ textAlign: "center", border: "0.6mm solid #000", padding: "2mm", margin: "4mm 0 0", fontWeight: 800, letterSpacing: "0.12em", fontSize: "12pt" }}>{rotuloAnulado(c)}</div>}

        {(receptor(c) || (c.config.mostrar_cliente && c.cliente) || c.origen || (c.config.mostrar_vendedor && c.atendio)) && (
          <div style={{ display: "flex", justifyContent: "space-between", gap: "8mm", padding: "3.5mm 0", fontSize: pt(9.5) }}>
            <div>{receptor(c) && <div><b>Receptor:</b> {receptor(c)}</div>}{c.config.mostrar_cliente && c.cliente && !(esFactura(c) && c.fiscal!.doc_tipo !== 99) && <div><b>Cliente:</b> {c.cliente}</div>}{c.origen && <div><b>Por la venta:</b> {c.origen}</div>}</div>
            {c.config.mostrar_vendedor && c.atendio && <div><b>Te atendió:</b> {c.atendio}</div>}
          </div>
        )}

        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "3mm" }}>
          <thead><tr><th style={{ ...th, textAlign: "left" }}>Producto</th><th style={th}>Cant.</th><th style={th}>Precio</th><th style={th}>Importe</th></tr></thead>
          <tbody>
            {c.renglones.map((r, i) => (
              <tr key={i} style={{ breakInside: "avoid", pageBreakInside: "avoid" }}>
                <td style={{ ...td, textAlign: "left", whiteSpace: "normal" }}>
                  <div style={{ fontWeight: 700 }}>{r.detalle}</div>
                  <div style={{ fontSize: pt(8.5) }}>{variante(c, r)}</div>
                  {Number(r.descuento) > 0 && <div style={{ fontSize: "8.5pt" }}>{r.promocion ?? "Promoción"}: −{pesos(r.descuento)}</div>}
                </td>
                <td style={td}>{r.cantidad}</td><td style={td}>{r.precio != null ? pesos(r.precio) : ""}</td><td style={{ ...td, fontWeight: 700 }}>{pesos(importeRenglon(r))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10mm", marginTop: "5mm", breakInside: "avoid", pageBreakInside: "avoid" }}>
          <div style={{ flex: 1, fontSize: "9.5pt" }}>
            {c.pagos.length > 0 && (
              <>
                <div style={{ fontSize: "8pt", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "1mm" }}>Forma de pago</div>
                {c.pagos.map((x, i) => <div key={i} style={{ ...fila, maxWidth: "80mm" }}><span>{detallePago(x)}</span><span style={num}>{pesos(x.monto)}</span></div>)}
              </>
            )}
            {c.saldo > 0.01 && <div style={{ ...fila, maxWidth: "80mm", fontWeight: 800, marginTop: "1.5mm" }}><span>Saldo pendiente</span><span style={num}>{pesos(c.saldo)}</span></div>}
          </div>
          <div style={{ width: "80mm", fontSize: "10pt" }}>
            {c.totales.map((t, i) => t.fuerte
              ? <div key={i} style={{ ...fila, marginTop: "1.5mm", paddingTop: "1.5mm", borderTop: "0.5mm solid #000", fontSize: "14pt", fontWeight: 800 }}><span>{t.rotulo}</span><span style={num}>{monto(t.monto)}</span></div>
              : <div key={i} style={{ ...fila, padding: "0.5mm 0" }}><span>{t.rotulo}</span><span style={num}>{monto(t.monto)}</span></div>)}
            {discriminado(c).length > 0 && <div style={{ marginTop: "2mm", paddingTop: "1.5mm", borderTop: "0.2mm solid #999", fontSize: "9pt" }}>
              {discriminado(c).map((d, i) => <div key={i} style={{ ...fila, padding: "0.3mm 0" }}><span>{d.rotulo}</span><span style={num}>{pesos(d.monto)}</span></div>)}</div>}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "8mm", marginTop: "10mm", paddingTop: "4mm", borderTop: "0.3mm solid #000", breakInside: "avoid", pageBreakInside: "avoid" }}>
          <div style={{ flex: 1, fontSize: "8.5pt" }}>
            {lineasFiscales(c).map((l, i) => <div key={i} style={l.startsWith("CAE") ? { fontWeight: 700, fontFamily: MONO, margin: "1mm 0" } : undefined}>{l}</div>)}
            {c.pie && <div style={{ fontSize: "11pt", fontWeight: 700, marginBottom: "1.5mm" }}>{c.pie}</div>}
            {c.leyenda && !esFactura(c) && <div>{c.leyenda}</div>}
            {em.local && <div style={{ marginTop: "1mm" }}>{em.local}</div>}
          </div>
          {c.config.barras && <div style={{ width: "56mm" }}><CodigoBarras codigo={c.numero} tipo="code128" alto="12mm" /><div style={{ textAlign: "center", fontFamily: MONO, fontSize: "8pt", letterSpacing: "0.06em" }}>{c.numero}</div></div>}
          {esFactura(c) && c.fiscal!.qr && <div style={{ width: "27mm", flexShrink: 0 }}><CodigoQR texto={c.fiscal!.qr} /><div style={{ textAlign: "center", fontSize: "6.5pt" }}>Autorizado por ARCA</div></div>}
          {!esFactura(c) && c.config.qr && url && <div style={{ width: "27mm", flexShrink: 0 }}><CodigoQR texto={url} /><div style={{ textAlign: "center", fontSize: "6.5pt" }}>Comprobante digital</div></div>}
        </div>
      </td></tr></tbody>
    </table>
  );
}

export default function Comprobante({ c, formato, url }: { c: Doc; formato: Presentacion; url?: string | null }) {
  return formato === "a4" ? <HojaA4 c={c} url={url} /> : <Ticket c={c} p={formato} url={url} />;
}
