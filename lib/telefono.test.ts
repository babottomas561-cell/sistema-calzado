// Pruebas del teléfono para WhatsApp (npm run test:unidades).
import test from "node:test";
import assert from "node:assert/strict";
import { paraWhatsApp } from "./telefono.ts";

test("el teléfono de WhatsApp, escrito de cualquier forma", () => {
  assert.equal(paraWhatsApp("0381 15 555-1234"), "5493815551234", "con 0 y el 15 de celular");
  assert.equal(paraWhatsApp("+54 9 381 555-1234"), "5493815551234", "ya internacional");
  assert.equal(paraWhatsApp("381 5551234"), "5493815551234", "área y número");
  assert.equal(paraWhatsApp("(011) 15-4444-5555"), "5491144445555", "Buenos Aires: área de 2 cifras");
  assert.equal(paraWhatsApp("54 11 4444 5555"), "5491144445555", "con 54 y sin el 9");
  assert.equal(paraWhatsApp("0351 4123456"), "5493514123456");
  assert.equal(paraWhatsApp("+598 99 123 456"), "59899123456", "de otro país: tal cual");
  assert.equal(paraWhatsApp("123"), null, "demasiado corto");
  assert.equal(paraWhatsApp(null), null);
  assert.equal(paraWhatsApp("abc"), null);
});
