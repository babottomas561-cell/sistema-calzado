import { test } from "node:test";
import assert from "node:assert/strict";
import { diaYHora, rangoAnioAnterior, rangoAnterior, rangoDe } from "./informes.ts";

test("el mismo período del año pasado", () => {
  assert.deepEqual(rangoAnioAnterior({ desde: "2026-07-01", hasta: "2026-07-31" }), { desde: "2025-07-01", hasta: "2025-07-31" });
  assert.deepEqual(rangoAnioAnterior({ desde: "2026-01-01", hasta: "2026-10-13" }), { desde: "2025-01-01", hasta: "2025-10-13" });
});

test("el 29 de febrero pasa al 28 del año anterior", () => {
  assert.equal(rangoAnioAnterior({ desde: "2028-02-01", hasta: "2028-02-29" }).hasta, "2027-02-28");
});

test("el período anterior de un mes son los mismos días del mes anterior", () => {
  const r = rangoDe("mes", "2026-10-13");
  assert.deepEqual(rangoAnterior("mes", r), { desde: "2026-09-01", hasta: "2026-09-13" });
});

test("día y hora en hora argentina (UTC−3)", () => {
  // 2026-10-13 es martes. 02:30 UTC = 23:30 del lunes 12 en Argentina
  assert.deepEqual(diaYHora("2026-10-13T02:30:00Z"), { dia: 0, hora: 23 });
  assert.deepEqual(diaYHora("2026-10-13T15:05:00Z"), { dia: 1, hora: 12 });
  // el domingo es el último día; medianoche es la hora 0 (no 24)
  assert.deepEqual(diaYHora("2026-10-18T03:00:00Z"), { dia: 6, hora: 0 });
});
