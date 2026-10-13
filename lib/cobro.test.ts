// Pruebas de la cuenta del cobro: reparto por monto y por %, redondeo del efectivo, vuelto (npm run test:unidades).
import test from "node:test";
import assert from "node:assert/strict";
import { billetesSugeridos, calcularCobro, opcionesRedondeo, pagosParaLaBase, redondeoA, topeRedondeo, totalCon, vuelto, type MedioCobro } from "./cobro.ts";

const EFE: MedioCobro = { id: 1, nombre: "Efectivo", ajuste_pct: -10, cuotas: 1, tipo: "Efectivo" };
const DEB: MedioCobro = { id: 3, nombre: "Débito", ajuste_pct: 0, cuotas: 1, tipo: "Débito" };
const CR3: MedioCobro = { id: 7, nombre: "Crédito 3 cuotas", ajuste_pct: 15, cuotas: 3, tipo: "Crédito" };
const medios = [EFE, DEB, CR3];

test("un solo medio: cubre todo con su descuento o recargo", () => {
  const c = calcularCobro(96041, 1, [{ medio_pago_id: 1, modo: "monto", valor: 0 }], medios, null);
  assert.equal(c.lineas[0].base, 96041);
  assert.equal(c.lineas[0].ajuste, -9604.1);
  assert.equal(c.total, 86436.9);
  assert.equal(totalCon(96041, 1, CR3), 110447.15);
});

test("dividido por porcentaje: 60 % con tarjeta y el resto en efectivo", () => {
  const c = calcularCobro(100000, 1, [{ medio_pago_id: 1, modo: "monto", valor: 0 }, { medio_pago_id: 7, modo: "pct", valor: 40 }], medios, null);
  assert.equal(c.lineas[1].base, 40000);
  assert.equal(c.lineas[0].base, 60000, "el efectivo completa lo que falta");
  assert.equal(c.lineas[0].cobra, 54000);
  assert.equal(c.lineas[1].cobra, 46000);
  assert.equal(c.total, 100000);
  assert.deepEqual(pagosParaLaBase(c.lineas), [{ medio_pago_id: 7, base: 40000 }, { medio_pago_id: 1 }], "la parte fija va primero y la que completa al final, sin base");
  const otra = calcularCobro(100000, 1, [{ medio_pago_id: 1, modo: "monto", valor: 0 }, { medio_pago_id: 3, modo: "pct", valor: 120 }], medios, null);
  assert.equal(otra.excedido, true, "más del 100 % no se puede");
});

test("redondeo del efectivo: hacia abajo, con tope y solo en efectivo", () => {
  assert.equal(redondeoA(86436.9, 100), 36.9);
  assert.equal(redondeoA(86436.9, 1000), 436.9);
  assert.equal(redondeoA(800, 1000), 0, "nunca deja en cero");
  assert.equal(topeRedondeo(86436.9), 1000);
  assert.equal(topeRedondeo(2000), 100);
  assert.deepEqual(opcionesRedondeo(86436.9).map((o) => o.queda), [86430, 86400, 86000], "por el monto que queda, sin repetir");
  assert.deepEqual(opcionesRedondeo(2030).map((o) => o.queda), [2000]);
  assert.deepEqual(opcionesRedondeo(1890).map((o) => o.queda), [1850, 1800], "en montos chicos no ofrece redondeos de más del 5 %");
  const c = calcularCobro(96041, 1, [{ medio_pago_id: 1, modo: "monto", valor: 0 }], medios, 100);
  assert.equal(c.redondeo, 36.9);
  assert.equal(c.total, 86400, "cobra un número redondo");
  assert.deepEqual(pagosParaLaBase(c.lineas), [{ medio_pago_id: 1, redondeo: 36.9 }]);
  const conDebito = calcularCobro(96041, 1, [{ medio_pago_id: 3, modo: "monto", valor: 0 }], medios, 100);
  assert.equal(conDebito.redondeo, 0, "con débito no se redondea");
  const mixto = calcularCobro(100000, 1, [{ medio_pago_id: 3, modo: "monto", valor: 0 }, { medio_pago_id: 1, modo: "pct", valor: 33.33 }], medios, 100);
  assert.equal(mixto.iEfectivo, 1, "se redondea la parte en efectivo aunque no sea la primera");
  assert.equal(mixto.lineas[1].cobra % 100, 0);
});

test("el vuelto y los billetes", () => {
  assert.equal(vuelto(100000, 86400), 13600);
  assert.deepEqual(billetesSugeridos(86400), [87000, 88000, 90000, 100000]);
  assert.deepEqual(billetesSugeridos(0), []);
});
