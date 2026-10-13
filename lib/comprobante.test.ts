// Pruebas de los comprobantes: el mensaje de WhatsApp y la lectura del JSON (npm run test:unidades).
import test from "node:test";
import assert from "node:assert/strict";
import { comprobanteDeEjemplo, cssDePagina, importeRenglon, leerComprobante, mensajeWhatsApp, totalDe, type Comprobante } from "./comprobante.ts";

const base = {
  tipo: "venta", titulo: "Comprobante de venta", numero: "0001-00000007", fecha: "2026-10-13T15:00:00Z", anulada: false, cliente: "María González", atendio: "Caro",
  renglones: [{ detalle: "Camisa", marca: null, variante: "Talle M · Blanco", cantidad: 1, precio: 1000, promocion: null, descuento: 0, subtotal: 1000 }],
  totales: [{ rotulo: "Subtotal", monto: 1000 }, { rotulo: "Total", monto: 900, fuerte: true }], pagos: [], saldo: 0,
  emisor: { nombre: "Mi Local", logo_url: null, razon_social: null, cuit: null, condicion_iva: null, domicilio: null, telefono: null, email: null, local: null },
  config: { formato: "ticket80", logo: true, datos_legales: true, qr: true, barras: true, copias: 1, modo: "opcional", configurado: true, letra: "normal", encabezado: null, mostrar_cliente: true, mostrar_vendedor: true, mostrar_marca: true }, leyenda: null, pie: null,
} as unknown as Comprobante;

test("el mensaje de WhatsApp lleva el nombre, el total y el link", () => {
  const t = mensajeWhatsApp(base, "https://milocal.com.ar/comprobante/abc", (n) => `$ ${n}`);
  assert.match(t, /^¡Hola María! Te paso tu comprobante \*0001-00000007\* de Mi Local\./);
  assert.match(t, /Total: \*\$ 900\*/);
  assert.match(t, /https:\/\/milocal\.com\.ar\/comprobante\/abc/);
  assert.equal(totalDe(base), 900);
  assert.match(mensajeWhatsApp({ ...base, tipo: "devolucion", cliente: null }, "x", (n) => `$ ${n}`), /^¡Hola! Te paso el comprobante de tu devolución/);
});

test("se lee el JSON de la base sin romperse si falta algo", () => {
  assert.equal(leerComprobante(null), null);
  assert.equal(leerComprobante({ numero: "1" }), null, "sin renglones ni emisor no es un comprobante");
  const c = leerComprobante({ ...base, config: { ...base.config, formato: "raro", copias: 99 }, pagos: undefined });
  assert.equal(c?.config.formato, "ticket80", "un formato desconocido vuelve al ticket de 80");
  assert.equal(c?.config.copias, 5, "las copias se acotan");
  assert.deepEqual(c?.pagos, []);
});

test("el tamaño de página: el ticket pide el alto justo y la hoja A4 su tamaño", () => {
  assert.equal(cssDePagina("a4"), "@page{size:A4;margin:0}");
  assert.equal(cssDePagina("ticket80", 123.2), "@page{size:80mm 126mm;margin:0}", "redondea para arriba y deja 2 mm de aire");
  assert.equal(cssDePagina("ticket58", 10), "@page{size:58mm 40mm;margin:0}", "nunca menos de 40 mm");
  assert.equal(cssDePagina("ticket80"), "@page{size:80mm 152mm;margin:0}", "sin medir todavía, un alto razonable");
});

test("lo que se ve en el renglón suma lo que dice el subtotal", () => {
  const ej = comprobanteDeEjemplo(base.emisor, base.config, { leyenda: null, pie: null });
  const suma = ej.renglones.reduce((s, r) => s + importeRenglon(r), 0);
  assert.equal(suma, ej.totales[0].monto, "el subtotal es la suma de los importes de lista");
  const neto = ej.totales.reduce((s, t) => s + (t.fuerte ? 0 : t.monto), 0);
  assert.equal(neto, ej.totales.find((t) => t.fuerte)!.monto, "y el total es el subtotal con sus descuentos");
  assert.equal(importeRenglon({ ...ej.renglones[0], precio: null, subtotal: 777 }), 777, "una devolución muestra lo devuelto");
});
