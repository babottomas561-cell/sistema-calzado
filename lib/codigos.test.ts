// Pruebas de los códigos de barras (npm run test:unidades). Los códigos de ejemplo son los de la norma GS1 / Wikipedia.
import test from "node:test";
import assert from "node:assert/strict";
import { claveDeBusqueda, codigoPropio, digitoGs1, esCodigoPropio, gs1Valido, normalizarCodigo, pareceCodigoLeido, tipoDeCodigo, validarCodigo, comoComprobante } from "./codigos.ts";

test("el dígito verificador GS1", () => {
  assert.equal(digitoGs1("400638133393"), 1);      // EAN-13 4006381333931
  assert.equal(digitoGs1("9638507"), 4);           // EAN-8 96385074
  assert.equal(digitoGs1("03600029145"), 2);       // UPC-A 036000291452
  assert.equal(digitoGs1("ABC"), null);
  assert.equal(gs1Valido("4006381333931"), true);
  assert.equal(gs1Valido("4006381333932"), false);
  assert.equal(gs1Valido("96385074"), true);
  assert.equal(gs1Valido("036000291452"), true);
  assert.equal(gs1Valido("12345"), false, "de otro largo no es un GTIN");
});

test("qué códigos se aceptan (como la base)", () => {
  assert.equal(validarCodigo(""), null);
  assert.equal(validarCodigo("  4006381 333931\n"), null, "los espacios y el salto de línea del lector se ignoran");
  assert.match(validarCodigo("4006381333932") ?? "", /dígito verificador/);
  assert.match(validarCodigo("ab") ?? "", /de 4 a 32/);
  assert.match(validarCodigo("ab/cd*ef") ?? "", /Solo letras/);
  assert.equal(validarCodigo("LOTE-2026.A1"), null);
  assert.equal(validarCodigo("123456"), null, "un número de otro largo es un código propio libre");
  assert.equal(normalizarCodigo(" 1 2\t3\n"), "123");
});

test("qué tipo de código es", () => {
  assert.equal(tipoDeCodigo("4006381333931"), "ean13");
  assert.equal(tipoDeCodigo("96385074"), "ean8");
  assert.equal(tipoDeCodigo("036000291452"), "upca");
  assert.equal(tipoDeCodigo("LOTE-2026.A1"), "code128");
  assert.equal(tipoDeCodigo("123456"), "code128");
});

test("un UPC-A y su EAN-13 con cero adelante son el mismo código", () => {
  assert.equal(claveDeBusqueda("036000291452"), claveDeBusqueda("0036000291452"));
  assert.notEqual(claveDeBusqueda("036000291452"), claveDeBusqueda("4006381333931"));
  assert.equal(claveDeBusqueda("zap-0001-42-neg"), claveDeBusqueda("ZAP-0001-42-NEG"), "lo alfanumérico no distingue mayúsculas");
});

test("los códigos propios son EAN-13 válidos que empiezan en 2", () => {
  const c = codigoPropio(1);
  assert.equal(c.length, 13);
  assert.match(c, /^200000000001[0-9]$/);
  assert.equal(esCodigoPropio(c), true);
  assert.equal(esCodigoPropio("4006381333931"), false, "uno de un fabricante no es propio");
  assert.notEqual(codigoPropio(1), codigoPropio(2));
});

test("lo que parece salido de un lector", () => {
  assert.equal(pareceCodigoLeido("4006381333931"), true);
  assert.equal(pareceCodigoLeido("camisa"), false);
  assert.equal(pareceCodigoLeido("12345"), false);
});

test("el número de un ticket o de una factura (para cambios desde la caja)", () => {
  assert.equal(comoComprobante("0001-00000123"), "0001-00000123");
  assert.equal(comoComprobante("0001'00000123"), "0001-00000123");   // lector en inglés con el teclado en castellano
  assert.equal(comoComprobante("B 00003-00000045"), "B00003-00000045");
  assert.equal(comoComprobante("7790001234567"), null);               // un código de producto, no
  assert.equal(comoComprobante("ZAP-0007-42-NEG"), null);              // un SKU, tampoco
});
