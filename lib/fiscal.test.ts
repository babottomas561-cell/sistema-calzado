// Pruebas de los datos fiscales (npm run test:unidades).
import test from "node:test";
import assert from "node:assert/strict";
import { cuitValido, formatoCuit, letraPara } from "./fiscal.ts";

test("CUIT con su dígito verificador", () => {
  assert.equal(cuitValido("20-12345678-6"), true);
  assert.equal(cuitValido("20123456786"), true);
  assert.equal(cuitValido("20-12345678-0"), false);
  assert.equal(cuitValido("123"), false);
  assert.equal(formatoCuit("20123456786"), "20-12345678-6");
});

test("la letra según el local y el cliente", () => {
  assert.equal(letraPara("B", null), "B");
  assert.equal(letraPara("B", { condicion_iva: "responsable_inscripto", tipo_documento: "CUIT", documento: "20123456786" }), "A");
  assert.equal(letraPara("B", { condicion_iva: "monotributo", tipo_documento: "CUIT", documento: "20-12345678-6" }), "A");
  assert.equal(letraPara("B", { condicion_iva: "exento", tipo_documento: "CUIT", documento: "20123456786" }), "B");
  assert.equal(letraPara("B", { condicion_iva: "consumidor_final", tipo_documento: "DNI", documento: "30123456" }), "B");
  assert.equal(letraPara("C", { condicion_iva: "responsable_inscripto", tipo_documento: "CUIT", documento: "20123456786" }), "C");
});
