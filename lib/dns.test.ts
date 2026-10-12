// Pruebas de lo que no necesita internet: reconocer el proveedor, armar nombres y el diagnóstico con un DNS de mentira.
// Se corren con `npm run test:unidades` (Node ejecuta TypeScript directo).
import test from "node:test";
import assert from "node:assert/strict";
import { diagnosticar, nombreCompleto, type Resolvedor } from "./dns.ts";
import { detectarProveedor, guiaDe, nombreCorto } from "./dns-guias.ts";

test("reconoce el proveedor por sus servidores de nombres", () => {
  assert.equal(detectarProveedor(["ada.ns.cloudflare.com.", "bob.ns.cloudflare.com."]), "cloudflare");
  assert.equal(detectarProveedor(["ns57.domaincontrol.com"]), "godaddy");
  assert.equal(detectarProveedor(["dns1.registrar-servers.com"]), "namecheap");
  assert.equal(detectarProveedor(["ns1.vercel-dns.com"]), "vercel");
  assert.equal(detectarProveedor(["ns1.algo-raro.net"]), null);
  assert.equal(detectarProveedor([]), null);
  assert.equal(guiaDe(null).id, "otro", "sin proveedor conocido, la guía es la general");
});

test("arma los nombres que pide el panel", () => {
  assert.equal(nombreCompleto("@", "mitienda.com.ar"), "mitienda.com.ar");
  assert.equal(nombreCompleto("www", "mitienda.com.ar"), "www.mitienda.com.ar");
  assert.equal(nombreCompleto("_vercel.mitienda.com.ar", "mitienda.com.ar"), "_vercel.mitienda.com.ar");
  assert.equal(nombreCorto("_vercel.mitienda.com.ar", "mitienda.com.ar"), "_vercel");
  assert.equal(nombreCorto("mitienda.com.ar", "www.mitienda.com.ar"), "@");
  assert.equal(nombreCorto("www", "mitienda.com.ar"), "www");
});

const resolvedor = (datos: Partial<Record<string, unknown>>): Resolvedor => {
  const pedir = (k: string) => async (nombre: string) => {
    const v = datos[`${k}:${nombre}`];
    if (v === undefined) throw Object.assign(new Error("ENODATA"), { code: "ENODATA" });
    return v;
  };
  return { resolveNs: pedir("NS"), resolve4: pedir("A"), resolve6: pedir("AAAA"), resolveCname: pedir("CNAME"), resolveTxt: pedir("TXT") } as unknown as Resolvedor;
};

test("el diagnóstico dice qué registros están y cuáles faltan", async () => {
  const r = resolvedor({
    "NS:mitienda.com.ar": ["ada.ns.cloudflare.com"],
    "A:mitienda.com.ar": ["76.76.21.21"],
    "CNAME:www.mitienda.com.ar": ["cname.vercel-dns.com."],
    "TXT:_vercel.mitienda.com.ar": [["vc-domain-verify=abc"], ["otra cosa"]],
  });
  const d = await diagnosticar("www.mitienda.com.ar", [
    { tipo: "A", nombre: "@", valor: "76.76.21.21" },
    { tipo: "CNAME", nombre: "www", valor: "cname.vercel-dns.com" },
    { tipo: "TXT", nombre: "_vercel.mitienda.com.ar", valor: "vc-domain-verify=abc" },
    { tipo: "TXT", nombre: "_vercel.mitienda.com.ar", valor: "vc-domain-verify=otro" },
  ], r);
  assert.equal(d.dominio, "mitienda.com.ar");
  assert.equal(d.proveedor, "cloudflare");
  assert.deepEqual(d.chequeos.map((c) => c.ok), [true, true, true, false]);
  assert.equal(d.sinDelegar, false);
});

test("un registro con otro valor muestra qué hay hoy", async () => {
  const d = await diagnosticar("mitienda.com.ar", [{ tipo: "A", nombre: "@", valor: "76.76.21.21" }], resolvedor({
    "NS:mitienda.com.ar": ["ns1.donweb.com"], "A:mitienda.com.ar": ["200.1.2.3"],
  }));
  assert.equal(d.chequeos[0].ok, false);
  assert.deepEqual(d.chequeos[0].hoy, ["200.1.2.3"]);
  assert.equal(d.proveedor, "donweb");
});

test("un dominio sin servidores de nombres figura como sin delegar", async () => {
  const d = await diagnosticar("mitienda.com.ar", [{ tipo: "A", nombre: "@", valor: "76.76.21.21" }], resolvedor({}));
  assert.equal(d.sinDelegar, true);
  assert.equal(d.proveedor, null);
  assert.equal(d.chequeos[0].ok, false);
  assert.deepEqual(d.chequeos[0].hoy, []);
});
