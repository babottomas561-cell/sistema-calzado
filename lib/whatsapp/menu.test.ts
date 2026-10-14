import test from "node:test";
import assert from "node:assert/strict";
import { botonesDespuesDelModelo, botonesLineas, listaDeModelos, listaModelos, listaRubros, menuPrincipal, pideComprar, pideMenu, POR_PAGINA, recorta } from "./menu.ts";

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
  const fm = (listaModelos("Camisa", modelos) as unknown as Lista).action.sections[0].rows;
  assert.equal(fm.length, 10, "8 modelos + «Ver más» + «Otros rubros»");
  assert.equal(fm[0].id, "p:1");
  assert.equal(fm[POR_PAGINA].id, "r:Camisa|1", "«Ver más» lleva a la página siguiente");
  const f3 = (listaModelos("Camisa", modelos, 3) as unknown as Lista).action.sections[0].rows;
  assert.equal(f3[0].id, "p:25");
  assert.deepEqual(f3.map((f) => f.id), ["p:25", "p:26", "p:27", "p:28", "p:29", "p:30", "m:cat"], "la última página no ofrece «Ver más»");
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

test("el menú principal ofrece Novedades y Promociones solo si hay", () => {
  const ids = (m: unknown) => (m as Lista).action.sections[0].rows.map((f) => f.id);
  assert.deepEqual(ids(menuPrincipal("X")), ["m:cat", "m:comprar", "m:pedido", "m:info", "m:humano"]);
  assert.deepEqual(ids(menuPrincipal("X", { novedades: true, promos: true })), ["m:cat", "m:comprar", "m:nuevo", "m:promo", "m:pedido", "m:info", "m:humano"]);
});

test("una lista de novedades o promos con etiqueta cumple los límites", () => {
  const m = listaDeModelos("c", "Ver", Array.from({ length: 15 }, (_, i) => ({ id: i, nombre: "Camisa Regular Fit Estructura Oxford", marca: "Zara", precio: "$ 119.990", extra: "2x1 en toda la tienda" })), "Promociones") as unknown as Lista;
  const filas = m.action.sections[0].rows;
  assert.equal(filas.length, 10);
  assert.ok(filas.every((f) => f.title.length <= 24 && (f.description ?? "").length <= 72));
});

test("quien quiere comprar o hacer un pedido va al camino de la cuenta; una consulta, no", () => {
  for (const t of ["quiero comprar", "Quiero hacer un pedido", "cómo compro?", "dónde puedo comprar esto", "me gustaría reservar una campera", "lo compro", "hacer el pedido", "quiero comprar la camisa rayas"]) assert.equal(pideComprar(t), true, t);
  for (const t of ["¿qué camisas tienen?", "dónde está mi pedido 0001-00000001", "hola", "tienen jeans en talle 42?", "cuánto sale el envío", "cómo pago"]) assert.equal(pideComprar(t), false, t);
});
