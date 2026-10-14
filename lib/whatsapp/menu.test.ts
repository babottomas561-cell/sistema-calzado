import test from "node:test";
import assert from "node:assert/strict";
import { botonesDespuesDelModelo, botonesLineas, listaModelos, listaRubros, menuPrincipal, pideMenu, recorta } from "./menu.ts";

type Lista = { action: { button: string; sections: { rows: { id: string; title: string; description?: string }[] }[] }; body: { text: string } };

test("un saludo o «menú» abre el menú, una consulta no", () => {
  for (const t of ["Hola", "hola!", "Buenas tardes", "menú", "Menu", "opciones", "buen día"]) assert.equal(pideMenu(t), true, t);
  for (const t of ["hola, tienen camperas?", "¿Qué camisas tienen?", "quiero el talle 42", "", "gracias"]) assert.equal(pideMenu(t), false, t);
});

test("el menú principal cumple los límites de Meta", () => {
  const m = menuPrincipal("Mi Tienda") as unknown as Lista;
  const filas = m.action.sections[0].rows;
  assert.ok(filas.length <= 10);
  assert.ok(m.action.button.length <= 20);
  for (const f of filas) { assert.ok(f.title.length <= 24, f.title); assert.ok((f.description ?? "").length <= 72, f.title); assert.ok(f.id.length <= 200); }
});

test("las listas largas se recortan a 10 filas y los títulos a 24 caracteres", () => {
  const rubros = Array.from({ length: 14 }, (_, i) => ({ nombre: `Rubro con un nombre larguísimo número ${i}`, modelos: i }));
  const filas = (listaRubros("Ropa", rubros) as unknown as Lista).action.sections[0].rows;
  assert.equal(filas.length, 10, "9 rubros + volver");
  assert.ok(filas.every((f) => f.title.length <= 24));
  assert.equal(filas.at(-1)?.id, "m:cat");
  const modelos = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, nombre: `Modelo ${i + 1}`, marca: "Zara", precio: "$ 119.990" }));
  const fm = (listaModelos("Camisa", modelos, true) as unknown as Lista).action.sections[0].rows;
  assert.equal(fm.length, 10);
  assert.equal(fm[0].id, "p:1");
});

test("los botones son 3 como máximo, con título de hasta 20", () => {
  const b = botonesDespuesDelModelo("Pantalón") as unknown as { action: { buttons: { reply: { id: string; title: string } }[] } };
  assert.ok(b.action.buttons.length <= 3);
  assert.ok(b.action.buttons.every((x) => x.reply.title.length <= 20));
  assert.equal(((botonesLineas(["Calzado", "Ropa", "Accesorios"])) as unknown as { action: { buttons: unknown[] } }).action.buttons.length, 3);
});

test("recorta no deja texto de más", () => {
  assert.equal(recorta("corto", 10), "corto");
  assert.ok(recorta("x".repeat(40), 24).length <= 24);
});
