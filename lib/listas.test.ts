// Pruebas de la cuenta de las listas de precios (las mismas cifras que supabase/tests/database/listas_precios.test.sql). npm run test:unidades
import test from "node:test";
import assert from "node:assert/strict";
import { aplicarLista } from "./listas.ts";

test("−5 % sin redondear", () => assert.equal(aplicarLista(79000, -5, 0), 75050));
test("+10 % redondeado a 100", () => assert.equal(aplicarLista(79000, 10, 100), 86900));
test("redondea al múltiplo más cercano", () => { assert.equal(aplicarLista(1234, 0, 100), 1200); assert.equal(aplicarLista(1250, 0, 100), 1300); });
test("sin ajuste ni redondeo queda igual", () => assert.equal(aplicarLista(15999.99, 0, 0), 15999.99));
test("nunca queda negativo", () => assert.equal(aplicarLista(100, -90, 1000), 0));
