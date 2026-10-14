import test from "node:test";
import assert from "node:assert/strict";
import { terminosDeBusqueda } from "./busqueda.ts";

test("los plurales pasan a singular", () => {
  assert.deepEqual(terminosDeBusqueda("camisas"), ["camisa"]);
  assert.deepEqual(terminosDeBusqueda("camperas"), ["campera"]);
  assert.deepEqual(terminosDeBusqueda("zapatillas negras"), ["zapatilla", "negra"]);
  assert.deepEqual(terminosDeBusqueda("sweaters", "buzos"), ["sweater", "buzo"]);
});
test("sin tildes ni signos, y sin repetir", () => {
  assert.deepEqual(terminosDeBusqueda("¿Pantalón?", "pantalones"), ["pantalon"]);
});
test("sin nada concreto no hay términos", () => {
  assert.deepEqual(terminosDeBusqueda(undefined, "", " "), []);
});
