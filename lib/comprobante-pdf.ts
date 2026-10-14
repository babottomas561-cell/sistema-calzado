// El comprobante como PDF (hoja A4), para adjuntarlo a un mail o descargarlo desde el link. Sale del mismo JSON que arma la base (comprobante_publico), así que
// nunca lleva costos ni notas internas. Con factura de ARCA lleva letra, CAE, IVA y el QR de ARCA. Solo servidor (usa pdfkit).
// Las fuentes de un PDF «estándar» no traen todos los símbolos: se cambian los pocos que no existen (el signo menos, el espacio duro).
import PDFDocument from "pdfkit";
import { create } from "qrcode";
import { fechaCompleta, pesos } from "@/lib/formato";
import { esFactura, importeRenglon, numeroDe, tituloDe, type Comprobante } from "@/lib/comprobante";

const limpio = (t: unknown) => String(t ?? "").replace(/−/g, "-").replace(/[  ]/g, " ").replace(/[^\x09\x0a\x0d\x20-\x7e¡-ÿ–—‘’“”•…]/g, "");
const monto = (n: number) => limpio(n < 0 ? `-${pesos(-n)}` : pesos(n));
const fechaCorta = (x: string) => new Date(x.length === 10 ? `${x}T12:00:00` : x).toLocaleDateString("es-AR");
const TIPO_DOC: Record<number, string> = { 80: "CUIT", 86: "CUIL", 96: "DNI", 94: "Pasaporte" };

// El logo del local, si se puede bajar (si no, va el nombre)
async function logo(url: string | null): Promise<Buffer | null> {
  if (!url) return null;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(4000), referrerPolicy: "no-referrer" });
    const tipo = r.headers.get("content-type") ?? "";
    if (!r.ok || !/image\/(png|jpe?g)/.test(tipo)) return null;   // pdfkit lee PNG y JPG
    return Buffer.from(await r.arrayBuffer());
  } catch { return null; }
}

export async function comprobantePdf(c: Comprobante, url: string): Promise<Buffer> {
  const marca = c.config.logo && c.emisor.logo_url && !c.emisor.es_icono ? await logo(c.emisor.logo_url) : null;
  const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: `${tituloDe(c)} ${numeroDe(c)}`, Author: limpio(c.emisor.nombre), Producer: "Sistema para locales" } });
  const trozos: Buffer[] = [];
  doc.on("data", (t: Buffer) => trozos.push(t));
  const fin = new Promise<Buffer>((ok) => doc.on("end", () => ok(Buffer.concat(trozos))));

  const ancho = doc.page.width - 96, izq = 48, der = doc.page.width - 48;
  const f = esFactura(c) ? c.fiscal! : null;
  const negro = "#111827", gris = "#6b7280", linea = "#d1d5db";

  // ── Encabezado: quién emite (izquierda) y qué es (derecha)
  let y = 48;
  if (marca) { try { doc.image(marca, izq, y, { fit: [150, 48] }); } catch { doc.font("Helvetica-Bold").fontSize(18).fillColor(negro).text(limpio(c.emisor.nombre).toUpperCase(), izq, y); } }
  else doc.font("Helvetica-Bold").fontSize(18).fillColor(negro).text(limpio(c.emisor.nombre).toUpperCase(), izq, y, { width: ancho * 0.55 });
  const lineas = f
    ? [f.emisor.razon_social, f.emisor.domicilio, f.emisor.cuit && `CUIT ${f.emisor.cuit}`, f.emisor.condicion_iva && `IVA ${f.emisor.condicion_iva}`, f.emisor.ingresos_brutos && `Ingresos Brutos ${f.emisor.ingresos_brutos}`,
       f.emisor.inicio_actividades && `Inicio de actividades ${fechaCorta(f.emisor.inicio_actividades)}`]
    : c.config.datos_legales ? [c.emisor.razon_social, c.emisor.sucursal && `Sucursal ${c.emisor.sucursal}`, c.emisor.cuit && `CUIT ${c.emisor.cuit}`, c.emisor.condicion_iva, c.emisor.domicilio, c.emisor.telefono && `Tel. ${c.emisor.telefono}`] : [];
  doc.font("Helvetica").fontSize(8.5).fillColor(gris);
  let yIzq = y + (marca ? 54 : 26);
  for (const l of lineas.filter(Boolean)) { doc.text(limpio(l), izq, yIzq, { width: ancho * 0.55 }); yIzq += 11; }

  const xD = izq + ancho * 0.6, aD = ancho * 0.4;
  if (f) { doc.roundedRect(der - 40, y, 40, 40, 4).lineWidth(1.2).stroke(negro); doc.font("Helvetica-Bold").fontSize(24).fillColor(negro).text(f.letra, der - 40, y + 7, { width: 40, align: "center" }); y += 46; }
  doc.font("Helvetica-Bold").fontSize(10).fillColor(gris).text(limpio(tituloDe(c).toUpperCase()) + (f ? `  -  COD. ${f.codigo}` : ""), xD, y, { width: aD, align: "right" });
  doc.font("Courier-Bold").fontSize(16).fillColor(negro).text(limpio(numeroDe(c)), xD, y + 14, { width: aD, align: "right" });
  doc.font("Helvetica").fontSize(9).fillColor(gris).text(limpio(fechaCompleta(c.fecha)), xD, y + 34, { width: aD, align: "right" });
  if (!f) doc.font("Helvetica-Bold").fontSize(7.5).fillColor(negro).text(c.tipo === "presupuesto" ? "PRESUPUESTO - NO VALIDO COMO FACTURA" : "NO VALIDO COMO FACTURA", xD, y + 48, { width: aD, align: "right" });
  if (f?.pruebas) doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#b45309").text("PRUEBA DE ARCA - SIN VALIDEZ", xD, y + 48, { width: aD, align: "right" });
  y = Math.max(yIzq, y + 62) + 8;
  doc.moveTo(izq, y).lineTo(der, y).lineWidth(0.8).strokeColor(negro).stroke(); y += 10;

  // ── Cliente / receptor
  const receptor = f ? (f.doc_tipo === 99 ? "A consumidor final" : [f.receptor, `${TIPO_DOC[f.doc_tipo] ?? "Doc."} ${f.doc_nro}`, f.condicion_receptor, f.domicilio_receptor].filter(Boolean).join("  -  "))
    : c.config.mostrar_cliente ? c.cliente : null;
  if (receptor) { doc.font("Helvetica-Bold").fontSize(9).fillColor(negro).text(f ? "Receptor:" : "Cliente:", izq, y, { continued: true }).font("Helvetica").text(` ${limpio(receptor)}`, { width: ancho }); y = doc.y + 2; }
  if (c.origen) { doc.font("Helvetica").fontSize(9).fillColor(negro).text(`Por la venta: ${limpio(c.origen)}`, izq, y); y = doc.y + 2; }
  if (c.config.mostrar_vendedor && c.atendio) { doc.font("Helvetica").fontSize(9).fillColor(negro).text(`Te atendio: ${limpio(c.atendio)}`, izq, y); y = doc.y + 2; }
  y += 8;

  // ── Detalle
  const colCant = izq + ancho * 0.58, colPrecio = izq + ancho * 0.7, colImp = izq + ancho * 0.85, wNum = ancho * 0.15 - 4;
  const cabecera = (yy: number) => {
    doc.font("Helvetica-Bold").fontSize(8).fillColor(gris);
    doc.text("PRODUCTO", izq, yy); doc.text("CANT.", colCant, yy, { width: wNum, align: "right" }); doc.text("PRECIO", colPrecio, yy, { width: wNum, align: "right" }); doc.text("IMPORTE", colImp, yy, { width: wNum + 4, align: "right" });
    doc.moveTo(izq, yy + 12).lineTo(der, yy + 12).lineWidth(0.6).strokeColor(negro).stroke();
    return yy + 18;
  };
  y = cabecera(y);
  for (const r of c.renglones) {
    if (y > doc.page.height - 190) { doc.addPage(); y = cabecera(48); }
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(negro).text(limpio(r.detalle), izq, y, { width: ancho * 0.55 });
    let h = doc.y;
    doc.font("Helvetica").fontSize(8).fillColor(gris).text(limpio(r.variante + (c.config.mostrar_marca && r.marca ? ` - ${r.marca}` : "")), izq, h, { width: ancho * 0.55 }); h = doc.y;
    if (Number(r.descuento) > 0) { doc.text(limpio(`${r.promocion ?? "Promocion"}: -${pesos(r.descuento).replace(/^-/, "")}`), izq, h, { width: ancho * 0.55 }); h = doc.y; }
    doc.font("Helvetica").fontSize(9.5).fillColor(negro);
    doc.text(String(r.cantidad), colCant, y, { width: wNum, align: "right" });
    if (r.precio != null) doc.text(monto(r.precio), colPrecio, y, { width: wNum, align: "right" });
    doc.font("Helvetica-Bold").text(monto(importeRenglon(r)), colImp, y, { width: wNum + 4, align: "right" });
    y = h + 5;
    doc.moveTo(izq, y - 2).lineTo(der, y - 2).lineWidth(0.3).strokeColor(linea).stroke();
  }
  y += 6;

  // ── Totales (derecha) y forma de pago (izquierda)
  if (y > doc.page.height - 230) { doc.addPage(); y = 48; }
  const yTot = y, xT = izq + ancho * 0.55, wT = ancho * 0.45;
  for (const t of c.totales) {
    if (t.fuerte) { doc.moveTo(xT, y + 1).lineTo(der, y + 1).lineWidth(0.8).strokeColor(negro).stroke(); y += 5; }
    doc.font(t.fuerte ? "Helvetica-Bold" : "Helvetica").fontSize(t.fuerte ? 13 : 9.5).fillColor(t.fuerte ? negro : gris);
    const rotulo = limpio(t.rotulo), alto = doc.heightOfString(rotulo, { width: wT * 0.62 });
    doc.text(rotulo, xT, y, { width: wT * 0.62 }); doc.text(monto(t.monto), xT + wT * 0.62, y, { width: wT * 0.38, align: "right" });
    y += Math.max(t.fuerte ? 20 : 14, alto + 4);
  }
  if (f && f.letra === "A") {
    y += 2; doc.font("Helvetica").fontSize(8.5).fillColor(gris);
    doc.text("Neto gravado", xT, y, { width: wT * 0.55 }); doc.text(monto(f.neto), xT + wT * 0.5, y, { width: wT * 0.5, align: "right" }); y += 12;
    for (const d of f.detalle_iva) { doc.text(`IVA ${String(d.alicuota).replace(".", ",")} %`, xT, y, { width: wT * 0.55 }); doc.text(monto(d.iva), xT + wT * 0.5, y, { width: wT * 0.5, align: "right" }); y += 12; }
  }
  let yPago = yTot;
  if (c.pagos.length) {
    doc.font("Helvetica-Bold").fontSize(8).fillColor(gris).text("FORMA DE PAGO", izq, yPago, { width: ancho * 0.5 }); yPago += 13;
    for (const p of c.pagos) {
      const det = [p.medio, p.cuotas > 1 ? `${p.cuotas} cuotas` : null, p.referencia].filter(Boolean).join(" - ");
      doc.font("Helvetica").fontSize(9).fillColor(negro).text(limpio(det), izq, yPago, { width: ancho * 0.36 }); doc.text(monto(p.monto), izq + ancho * 0.36, yPago, { width: ancho * 0.14, align: "right" });
      yPago = doc.y + 3;
    }
  }
  if (c.saldo > 0.01) { doc.font("Helvetica-Bold").fontSize(9.5).fillColor(negro).text(`Saldo pendiente: ${monto(c.saldo)}`, izq, yPago + 2, { width: ancho * 0.5 }); yPago = doc.y + 2; }
  y = Math.max(y, yPago) + 14;

  // ── Pie: datos fiscales, leyendas y QR
  if (y > doc.page.height - 150) { doc.addPage(); y = 48; }
  doc.moveTo(izq, y).lineTo(der, y).lineWidth(0.5).strokeColor(linea).stroke(); y += 8;
  const textoPie: string[] = [];
  if (f) {
    textoPie.push("Regimen de Transparencia Fiscal al Consumidor (Ley 27.743)");
    if (f.letra === "B" || (f.letra === "C" && f.iva_contenido_en_c === "cero")) textoPie.push(`IVA contenido: ${monto(f.letra === "B" ? f.iva : 0)}`);
    if (f.nota_credito?.estado === "autorizada") textoPie.push(`Anulada con nota de credito ${f.nota_credito.letra} ${f.nota_credito.comprobante}`);
    if (f.asociada) textoPie.push(`Corrige: ${f.asociada}`);
  } else if (c.leyenda) textoPie.push(c.leyenda);
  if (c.pie) textoPie.push(c.pie);
  const wPie = ancho - 96;
  doc.font("Helvetica").fontSize(8.5).fillColor(gris);
  for (const l of textoPie) { doc.text(limpio(l), izq, y, { width: wPie }); y = doc.y + 2; }
  if (f) { doc.font("Courier-Bold").fontSize(10).fillColor(negro).text(`CAE ${f.cae}   Vto. ${f.cae_vence ? fechaCorta(f.cae_vence) : ""}`, izq, y + 4, { width: wPie }); y = doc.y + 2; }
  if (!f && url) { doc.font("Helvetica").fontSize(8).fillColor(gris).text(`Versión digital: ${url}`, izq, y + 4, { width: wPie, link: url }); y = doc.y; }

  // El QR (el de ARCA si es factura; si no, el del link del comprobante), dibujado con los cuadraditos del código
  const textoQr = f?.qr ?? (c.config.qr ? url : null);
  if (textoQr) {
    try {
      const m = create(textoQr, { errorCorrectionLevel: "M" }).modules, n = m.size, lado = 76, px = lado / (n + 4);
      const x0 = der - lado, y0 = doc.y > doc.page.height - 110 ? 48 : Math.max(y - textoPie.length * 12 - 16, yTot + 40);
      doc.save().rect(x0, y0, lado, lado).fill("#ffffff").fillColor("#000000");
      for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (m.get(r, k)) doc.rect(x0 + (k + 2) * px, y0 + (r + 2) * px, px + 0.2, px + 0.2).fill();
      doc.restore().font("Helvetica").fontSize(6.5).fillColor(gris).text(f ? "Autorizado por ARCA" : "Comprobante digital", x0 - 6, y0 + lado + 1, { width: lado + 12, align: "center" });
    } catch { /* un link demasiado largo para un QR: va sin QR */ }
  }

  doc.end();
  return fin;
}
