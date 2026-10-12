// Pruebas del reparto de etiquetas en páginas (npm run test:unidades).
import test from "node:test";
import assert from "node:assert/strict";
import { cabeEnLaPagina, cssDePagina, expandir, leerPlantilla, medidasDePagina, paginar, sumarFilas, unaPorVariante, type FilaEtiqueta } from "./etiquetas.ts";

const base = { id: 1, nombre: "x", mostrar_tienda: false, mostrar_nombre: true, mostrar_marca: false, mostrar_talle_color: true, mostrar_precio: true, mostrar_codigo: true,
  tamano_texto: 7, tamano_precio: 11, tipo_codigo: "auto", alto_codigo_mm: 9, margen_superior_mm: 0, margen_izquierdo_mm: 0, separacion_h_mm: 0, separacion_v_mm: 0, filas: 1, columnas: 1, pagina: null };
const rollo = leerPlantilla({ ...base, tipo: "rollo", ancho_mm: "50", alto_mm: "30" });                                   // los numeric de la base pueden venir como texto
const rollo2 = leerPlantilla({ ...base, tipo: "rollo", ancho_mm: 40, alto_mm: 25, columnas: 2, separacion_h_mm: 2 });
const hoja = leerPlantilla({ ...base, tipo: "hoja", pagina: "A4", ancho_mm: 70, alto_mm: 37, columnas: 3, filas: 8 });

test("el tamaño de la página: la etiqueta, la fila del rollo o la hoja", () => {
  assert.deepEqual(medidasDePagina(rollo), { ancho: 50, alto: 30 });
  assert.deepEqual(medidasDePagina(rollo2), { ancho: 82, alto: 25 });
  assert.deepEqual(medidasDePagina(hoja), { ancho: 210, alto: 297 });
  assert.equal(cssDePagina(rollo2), "@page { size: 82mm 25mm; margin: 0; }");
});

test("un rollo: una página por etiqueta (o por fila de etiquetas)", () => {
  assert.equal(paginar(rollo, [1, 2, 3]).length, 3);
  const p = paginar(rollo2, [1, 2, 3]);
  assert.equal(p.length, 2, "3 etiquetas de a 2 por fila: 2 páginas");
  assert.deepEqual(p[1].celdas, [3, null], "la última fila queda con un hueco");
  assert.equal(paginar(rollo, [1, 2], 5).length, 2, "en un rollo no se saltea nada");
});

test("una hoja: 24 por hoja y se puede seguir una hoja ya usada", () => {
  const veinticinco = Array.from({ length: 25 }, (_, i) => i + 1);
  const p = paginar(hoja, veinticinco);
  assert.equal(p.length, 2);
  assert.equal(p[0].celdas.length, 24);
  assert.deepEqual(p[1].celdas.slice(0, 2), [25, null]);
  const q = paginar(hoja, [1, 2, 3], 22);
  assert.deepEqual(q[0].celdas.slice(20, 24), [null, null, 1, 2], "empieza en la posición 23");
  assert.deepEqual(q[1].celdas.slice(0, 2), [3, null], "y lo que no entra pasa a la hoja siguiente");
  assert.equal(paginar(hoja, [], 3).length, 0, "sin etiquetas no hay páginas");
  assert.equal(paginar(hoja, [1], 999)[0].celdas.indexOf(1), 23, "una posición de inicio exagerada se acota a la última");
});

test("si la grilla no entra en la hoja, lo dice", () => {
  assert.equal(cabeEnLaPagina(hoja), null);
  assert.match(cabeEnLaPagina({ ...hoja, ancho_mm: 80 }) ?? "", /no entran en la hoja/);
  assert.match(cabeEnLaPagina({ ...rollo, columnas: 5, ancho_mm: 50 }) ?? "", /demasiado ancho/);
  assert.equal(cabeEnLaPagina({ ...hoja, margen_izquierdo_mm: 0.4 }), null, "medio milímetro de tolerancia");
});

test("de las filas con cantidad a etiquetas: lo que no tiene código no se imprime", () => {
  const f = (id: number, codigo: string | null, cantidad: number): FilaEtiqueta & { cantidad: number } => ({
    variante_id: id, producto_id: 1, nombre: "Camisa", marca: null, talle: "M", color: "Blanco", sku: "CAM-1", codigo_barras: codigo, precio_venta: 1000, stock: 3, cantidad });
  const r = expandir([f(1, "2000000000017", 3), f(2, null, 2), f(3, "2000000000024", 0)], "Mi Local");
  assert.equal(r.etiquetas.length, 3);
  assert.equal(r.sinCodigo, 1, "una variante con cantidad y sin código");
  assert.equal(r.etiquetas[0].tienda, "Mi Local");
});

test("sumar un lote a lo que ya hay: lo repetido junta sus cantidades", () => {
  const f = (id: number, cantidad: number) => ({ variante_id: id, producto_id: 1, nombre: "Camisa", marca: null, talle: "M", color: "Blanco", sku: null, codigo_barras: "2000000000017", precio_venta: 1, stock: 1, cantidad });
  const r = sumarFilas([f(1, 2), f(2, 1)], [f(2, 3), f(3, 5), f(1, 999)]);
  assert.equal(r.nuevas, 1);
  assert.equal(r.repetidas, 2);
  assert.deepEqual(r.filas.map((x) => [x.variante_id, x.cantidad]), [[1, 999], [2, 4], [3, 5]]);
});

test("v_stock puede traer una fila por depósito: se deja una por variante con el stock sumado", () => {
  const r = unaPorVariante([{ variante_id: 1, producto_id: 9, nombre: "A", stock: 2, precio_venta: "10" }, { variante_id: 1, producto_id: 9, nombre: "A", stock: 3 }, { variante_id: 2, producto_id: 9, nombre: "A", stock: 1 }]);
  assert.equal(r.length, 2);
  assert.equal(r[0].stock, 5);
  assert.equal(r[0].precio_venta, 10);
});
