// Las migraciones nuevas no pueden tener un UPDATE sin WHERE: Supabase en la nube lo rechaza («UPDATE requires a WHERE clause») aunque la base local no.
// Revisa las posteriores a la corrección 20261026400000 (las anteriores ya están publicadas y no se editan).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const carpeta = new URL("../supabase/migrations/", import.meta.url);
const nuevas = readdirSync(carpeta).filter((f) => f.endsWith(".sql") && f > "20261026400000");

test("ninguna migración nueva tiene un UPDATE sin WHERE", () => {
  const malas = [];
  for (const f of nuevas) {
    const sql = readFileSync(new URL(f, carpeta), "utf8").replace(/--[^\n]*/g, "");
    for (const m of sql.matchAll(/\bupdate\s+(?:public\.)?\w+\s+set\b([^;]*);/gi)) {
      const antes = sql.slice(Math.max(0, m.index - 12), m.index).toLowerCase();
      if (antes.includes("do ")) continue;                       // «on conflict do update set»
      if (!/\bwhere\b/i.test(m[1])) malas.push(`${f}: ${m[0].slice(0, 80)}`);
    }
  }
  assert.deepEqual(malas, [], "UPDATE sin WHERE:\n" + malas.join("\n"));
});
