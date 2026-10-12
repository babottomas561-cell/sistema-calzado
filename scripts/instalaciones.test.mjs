// Pruebas de las partes puras del script de instalaciones. Se corren con `npm run test:unidades`.
import test from "node:test";
import assert from "node:assert/strict";
import { armarSqlAlta, etiquetaDelDia, fichaNueva, generarClave, migracionesAtrasadas, sqlLiteral, ultimaEtiqueta, validarSlug } from "./lib/instalaciones.mjs";

test("el slug se valida", () => {
  assert.equal(validarSlug("mi-local"), null);
  assert.equal(validarSlug("tienda-2"), null);
  assert.notEqual(validarSlug("Mi Local"), null);
  assert.notEqual(validarSlug("ab"), null);
  assert.notEqual(validarSlug("-local"), null);
  assert.notEqual(validarSlug("mi--local"), null);
  assert.notEqual(validarSlug("admin"), null, "los nombres reservados no se usan");
  assert.notEqual(validarSlug(undefined), null);
});

test("las claves generadas son largas, distintas y sin caracteres que se confunden", () => {
  const a = generarClave(), b = generarClave();
  assert.equal(a.length, 20);
  assert.notEqual(a, b);
  assert.match(a, /^[A-HJ-NP-Za-km-z2-9]+$/);
});

test("un literal de SQL duplica las comillas y no deja pasar caracteres nulos", () => {
  assert.equal(sqlLiteral("O'Brien"), "'O''Brien'");
  assert.equal(sqlLiteral("'; drop table x; --"), "'''; drop table x; --'");
  assert.throws(() => sqlLiteral("a\u0000b"));
});

test("las etiquetas de versión", () => {
  assert.equal(etiquetaDelDia([], new Date(2026, 9, 13)), "v2026.10.13");
  assert.equal(etiquetaDelDia(["v2026.10.13"], new Date(2026, 9, 13)), "v2026.10.13-2");
  assert.equal(etiquetaDelDia(["v2026.10.13", "v2026.10.13-2"], new Date(2026, 9, 13)), "v2026.10.13-3");
  assert.equal(ultimaEtiqueta(["v2026.10.13", "v2026.10.13-2", "v2026.09.30", "basura"]), "v2026.10.13-2");
  assert.equal(ultimaEtiqueta(["nada"]), null);
});

test("el SQL del alta escapa los datos y solo carga la conexión técnica si se pide", () => {
  const base = { nombre: "Casa d'Elena", nombreDueno: "Elena", email: "Elena@Correo.com", clave: "Abc'123", url: "https://casa.vercel.app" };
  const sin = armarSqlAlta(base);
  assert.match(sin, /nombre = 'Casa d''Elena'/);
  assert.match(sin, /alta_admin\('Elena@Correo\.com', 'Elena', 'Abc''123'\)/);
  assert.doesNotMatch(sin, /vercel_token|cuentas_aplicar/);
  const con = armarSqlAlta({ ...base, conexion: { vercelToken: "vt", vercelProyecto: "casa", vercelEquipo: "equipo", supabaseToken: "st", supabaseRef: "abcdefghijklmnopqrst" } });
  assert.match(con, /vercel_token = 'vt'/);
  assert.match(con, /supabase_ref = 'abcdefghijklmnopqrst'/);
  assert.match(con, /cuentas_aplicar\(\)/);
});

test("la ficha de una instalación no lleva secretos", () => {
  const f = fichaNueva({ slug: "casa", nombre: "Casa", ref: "abcdefghijklmnopqrst", region: "sa-east-1", proyecto: "casa", equipo: "equipo", url: "https://casa.vercel.app", version: "v2026.10.13", migracion: "20261013300000", hoy: new Date(2026, 9, 13) });
  assert.equal(f.alta, "2026-10-13");
  assert.equal(f.estado, "en_alta");
  assert.doesNotMatch(JSON.stringify(f), /token|password|clave/i);
});

test("qué migraciones le faltan a una instalación", () => {
  assert.deepEqual(migracionesAtrasadas(["1", "2"], ["1", "2", "3", "4"]), ["3", "4"]);
  assert.deepEqual(migracionesAtrasadas(["1", "2", "3"], ["1", "2", "3"]), []);
});
