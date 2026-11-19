#!/usr/bin/env node
// Instalaciones: dar de alta un cliente nuevo, actualizarlo a una versión y ver cómo está cada uno.
//
// Cada local tiene SU instalación (su base en Supabase y su sitio en Vercel) con el MISMO código: una versión es una
// etiqueta de Git (v2026.10.13). Acá no hay copias del repositorio por cliente (CLAUDE.md, regla 18).
//
//   npm run instalaciones -- ayuda
//
// Este script es del que instala (necesita sus cuentas de Supabase y Vercel); nunca corre dentro de la tienda.
// Lo que crea o cambia algo admite --dry-run (simulacro: muestra qué haría, sin tocar nada).
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  armarSqlAlta, armarSqlConexion, emailValido, etiquetaDelDia, fichaNueva, generarClave, migracionesAtrasadas, ultimaEtiqueta, validarSlug,
} from "./lib/instalaciones.mjs";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR_FICHAS = join(RAIZ, "instalaciones");

const { values: a, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    slug: { type: "string" }, nombre: { type: "string" }, email: { type: "string" }, "nombre-dueno": { type: "string" },
    version: { type: "string" }, region: { type: "string", default: "sa-east-1" }, size: { type: "string" },
    org: { type: "string" }, equipo: { type: "string" }, "sin-conexion-tecnica": { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false }, yes: { type: "boolean", default: false },
    "sin-revisar": { type: "boolean", default: false },
  },
});
const SIMULACRO = a["dry-run"];
const SECRETOS = new Set();   // lo que nunca debe aparecer en pantalla (tokens, claves)

// ── Utilidades ────────────────────────────────────────────────────────
const out = (t = "") => console.log(t);
const paso = (n, t) => out(`\n[${n}] ${t}`);
const limpiar = (t) => [...SECRETOS].reduce((s, x) => (x ? s.split(x).join("***") : s), String(t ?? "")).trim();
const salir = (msg, codigo = 1) => { console.error(`\nError: ${limpiar(msg)}`); process.exit(codigo); };

// Ejecuta un programa. En simulacro, lo que cambia algo solo se muestra (lectura:true corre igual).
function correr(cmd, args, op = {}) {
  const texto = limpiar([cmd, ...args].join(" "));
  if (SIMULACRO && !op.lectura) { out(`   [simulacro] ${texto}`); return { stdout: "", stderr: "", status: 0, simulado: true }; }
  const r = spawnSync(cmd, args, { cwd: op.cwd ?? RAIZ, env: { ...process.env, ...op.env }, input: op.entrada, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (r.error) throw new Error(`No se pudo ejecutar «${cmd}»: ${r.error.message}`);
  if (r.status !== 0 && !op.tolerar) throw new Error(`Falló: ${texto}\n${limpiar(r.stderr || r.stdout)}`);
  return r;
}
// El git a usar: el del sistema y, si no anda (licencia de Xcode sin aceptar), el de las Command Line Tools
const GIT = (() => {
  const candidatos = [process.env.GIT_BIN, "git", "/Library/Developer/CommandLineTools/usr/bin/git"].filter(Boolean);
  return candidatos.find((g) => spawnSync(g, ["--version"], { encoding: "utf8" }).status === 0) ?? "git";
})();
const git = (args, op = {}) => correr(GIT, args, op);
// Para subir (push) sin pedir clave: que GitHub CLI haga de credencial si está
const credencialGh = spawnSync("gh", ["--version"], { encoding: "utf8" }).status === 0 ? ["-c", "credential.helper=!gh auth git-credential"] : [];
const supabase = (args, op = {}) => correr("npx", ["supabase", ...args], op);
const vercel = (args, op = {}) => correr("vercel", args, op);

// La CLI a veces imprime un aviso antes del JSON: se toma desde la primera llave
function json(texto) {
  const i = String(texto).search(/[[{]/);
  if (i < 0) throw new Error(`No se pudo leer la respuesta: ${limpiar(String(texto).slice(0, 200))}`);
  return JSON.parse(String(texto).slice(i));
}

async function confirmar(pregunta) {
  if (a.yes || SIMULACRO) return true;
  if (!process.stdin.isTTY) salir("Hace falta confirmar y no hay una terminal interactiva: agregá --yes para seguir sin preguntar.");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const r = (await rl.question(`${pregunta} (s/N) `)).trim().toLowerCase();
  rl.close();
  return r === "s" || r === "si" || r === "sí" || r === "y";
}
const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));
async function reintentar(fn, { veces = 6, cada = 15000, que = "" } = {}) {
  for (let i = 1; ; i++) {
    try { return fn(); } catch (e) {
      if (i >= veces || SIMULACRO) throw e;
      out(`   ${que || "Falló"}; reintento ${i}/${veces - 1} en ${cada / 1000}s…`);
      await dormir(cada);
    }
  }
}

// ── Fichas de instalaciones (sin secretos) ────────────────────────────
function fichas() {
  if (!existsSync(DIR_FICHAS)) return [];
  return readdirSync(DIR_FICHAS).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(DIR_FICHAS, f), "utf8")));
}
const fichaDe = (slug) => fichas().find((f) => f.slug === slug);
function guardarFicha(f) {
  if (SIMULACRO) { out(`   [simulacro] se escribiría instalaciones/${f.slug}.json`); return; }
  mkdirSync(DIR_FICHAS, { recursive: true });
  writeFileSync(join(DIR_FICHAS, `${f.slug}.json`), JSON.stringify(f, null, 2) + "\n");
}

// ── Versiones (etiquetas de Git) ──────────────────────────────────────
const etiquetas = () => git(["tag", "--list", "v*"], { lectura: true }).stdout.split("\n").map((t) => t.trim()).filter(Boolean);
function versionAUsar() {
  const v = a.version ?? ultimaEtiqueta(etiquetas());
  if (!v) salir("Todavía no hay ninguna versión (etiqueta de Git). Creá una con: npm run instalaciones -- etiquetar");
  if (!etiquetas().includes(v)) salir(`No existe la versión «${v}». Las que hay: ${etiquetas().join(", ") || "ninguna"}`);
  return v;
}
// Baja el código de esa versión a una carpeta temporal (sin .git ni node_modules): así se despliega exactamente lo etiquetado
function exportar(version, destino) {
  const tar = spawnSync(GIT, ["archive", "--format=tar", version], { cwd: RAIZ, maxBuffer: 512 * 1024 * 1024 });
  if (tar.status !== 0) throw new Error(`No se pudo exportar la versión ${version}: ${limpiar(tar.stderr?.toString())}`);
  const x = spawnSync("tar", ["-x", "-C", destino], { input: tar.stdout });
  if (x.status !== 0) throw new Error("No se pudo descomprimir la versión");
}
const migracionesDeLaVersion = (carpeta) => readdirSync(join(carpeta, "supabase", "migrations")).filter((f) => f.endsWith(".sql")).map((f) => f.split("_")[0]).sort();

function exigirTokens() {
  const falta = ["SUPABASE_ACCESS_TOKEN", "VERCEL_TOKEN"].filter((v) => !process.env[v]);
  if (falta.length && SIMULACRO) { out(`   (Simulacro sin ${falta.join(" ni ")}: para hacerlo de verdad hacen falta.)`); return; }
  if (falta.length) salir(`Faltan variables de entorno: ${falta.join(", ")}.\n  Se crean en supabase.com → Account → Access Tokens y en vercel.com → Account Settings → Tokens (del equipo del local).\n  Cargalas en la terminal sin dejarlas escritas, por ejemplo:  read -s SUPABASE_ACCESS_TOKEN; export SUPABASE_ACCESS_TOKEN`);
  for (const v of ["SUPABASE_ACCESS_TOKEN", "VERCEL_TOKEN"]) if (process.env[v]) SECRETOS.add(process.env[v]);
}
const equipoVercel = () => a.equipo ?? process.env.VERCEL_SCOPE ?? fichas().find((f) => f.vercel?.equipo)?.vercel.equipo ?? salir("Falta el equipo de Vercel: --equipo NOMBRE (o la variable VERCEL_SCOPE)");

// ── Comandos ──────────────────────────────────────────────────────────
const AYUDA = `Instalaciones (un cliente = una base de Supabase + un sitio de Vercel, con el mismo código)

  npm run instalaciones -- lista
      Las instalaciones registradas (instalaciones/*.json).
  npm run instalaciones -- estado [--slug X]
      Cómo está cada una: si el sitio responde, qué migraciones le faltan.
  npm run instalaciones -- etiquetar [--version vAAAA.MM.DD] [--sin-revisar]
      Crea la etiqueta de una versión nueva (corre los chequeos antes). Una instalación solo se alta o se actualiza a una etiqueta.
  npm run instalaciones -- alta --slug mi-local --nombre "Mi Local" --email dueno@correo.com [--nombre-dueno "Nombre"]
        [--version vX] [--region sa-east-1] [--size micro] [--sin-conexion-tecnica] [--dry-run] [--yes]
      Crea la base, aplica las migraciones, publica el sitio y deja al dueño como Administrador.
  npm run instalaciones -- conexion --slug mi-local [--dry-run]
      Carga (o renueva) en esa instalación la conexión técnica: los tokens de Vercel y Supabase que usa el panel para el dominio y el correo.
      Comprueba que los tokens sirvan antes de guardarlos y no los muestra.
  npm run instalaciones -- actualizar --slug mi-local [--version vX] [--dry-run] [--yes]
      Aplica las migraciones de esa versión y publica su código (sirve también para volver a una versión anterior).

Necesita SUPABASE_ACCESS_TOKEN y VERCEL_TOKEN en el entorno (y SUPABASE_ORG_ID o --org, VERCEL_SCOPE o --equipo).
Con --dry-run no crea ni cambia nada: muestra lo que haría.`;

function lista() {
  const f = fichas();
  if (!f.length) return out("No hay instalaciones registradas todavía.");
  for (const x of f) out(`${x.slug.padEnd(20)} ${x.estado.padEnd(10)} ${String(x.canal).padEnd(7)} ${String(x.version ?? "-").padEnd(16)} ${x.url ?? ""}`);
}

async function estado() {
  const todas = fichas().filter((f) => !a.slug || f.slug === a.slug);
  if (!todas.length) return out("No hay instalaciones que mostrar.");
  const delRepo = readdirSync(join(RAIZ, "supabase", "migrations")).filter((f) => f.endsWith(".sql")).map((f) => f.split("_")[0]).sort();
  for (const f of todas) {
    let web = "?";
    try { const r = await fetch(f.url, { redirect: "manual", signal: AbortSignal.timeout(10000) }); web = `${r.status}`; } catch { web = "no responde"; }
    let base = "?";
    if (f.supabase?.ref) {
      const r = supabase(["db", "query", "--linked", "--project-ref", f.supabase.ref, "select version from supabase_migrations.schema_migrations order by version", "-o", "json"], { lectura: true, tolerar: true });
      if (r.status === 0) {
        try { const faltan = migracionesAtrasadas(json(r.stdout).rows.map((x) => x.version), delRepo); base = faltan.length ? `atrasada: faltan ${faltan.length}` : "al día"; } catch { /* queda «?» */ }
      }
    }
    out(`${f.slug.padEnd(20)} sitio ${web.padEnd(11)} base ${base.padEnd(20)} versión ${f.version ?? "-"} (${f.estado}, canal ${f.canal})`);
  }
}

async function etiquetar() {
  const existentes = etiquetas();
  const version = a.version ?? etiquetaDelDia(existentes);
  if (existentes.includes(version)) salir(`La versión ${version} ya existe.`);
  if (!/^v\d{4}\.\d{2}\.\d{2}(-\d+)?$/.test(version)) salir("La versión se escribe vAAAA.MM.DD (o vAAAA.MM.DD-2 si hay más de una en el día).");
  if (git(["status", "--porcelain"], { lectura: true }).stdout.trim()) salir("Hay cambios sin commitear: commiteá antes de etiquetar (una versión es un punto exacto del código).");
  git([...credencialGh, "fetch", "origin", "main", "--quiet"], { lectura: true, tolerar: true });
  const head = git(["rev-parse", "HEAD"], { lectura: true }).stdout.trim();
  const remoto = git(["rev-parse", "origin/main"], { lectura: true, tolerar: true }).stdout.trim();
  if (remoto && head !== remoto) salir("Lo que está en tu compu no coincide con origin/main: subí los cambios (push) antes de etiquetar.");
  if (!a["sin-revisar"]) { paso(1, "Chequeos (tipos, lint, pruebas y build)"); correr("npm", ["run", "revisar"], { lectura: true }); }
  paso(2, `Etiqueta ${version} en ${head.slice(0, 7)}`);
  if (!(await confirmar("¿Crearla y subirla a GitHub?"))) return out("Cancelado.");
  git(["tag", "-a", version, "-m", `Versión ${version}`, head]);
  git([...credencialGh, "push", "origin", version], { env: { GIT_TERMINAL_PROMPT: "0" } });
  out(`\nListo: ${version}. Para llevarla a un cliente: npm run instalaciones -- actualizar --slug SU-SLUG --version ${version}`);
}

async function alta() {
  const slug = a.slug, nombre = a.nombre?.trim(), email = a.email?.trim().toLowerCase();
  const errSlug = validarSlug(slug);
  if (errSlug) salir(errSlug);
  if (!nombre) salir("Falta --nombre (el nombre del negocio, como lo ve el cliente en la tienda)");
  if (!emailValido(email)) salir("Falta --email del dueño (con el que va a ingresar al panel)");
  if (fichaDe(slug)) salir(`Ya hay una instalación «${slug}» en instalaciones/.`);
  exigirTokens();
  const version = versionAUsar();
  const equipo = equipoVercel();
  let org = a.org ?? process.env.SUPABASE_ORG_ID;
  if (!org) {
    const orgs = json(supabase(["orgs", "list", "-o", "json"], { lectura: true }).stdout);
    const lista_ = orgs.organizations ?? orgs;
    if (lista_.length === 1) org = lista_[0].id; else salir("Hay más de una organización de Supabase: elegí una con --org ID (o SUPABASE_ORG_ID).");
  }
  const claveDb = generarClave(28), claveDueno = generarClave(16);
  SECRETOS.add(claveDb); SECRETOS.add(claveDueno);

  out(`Alta de «${nombre}» (${slug}) con la versión ${version}`);
  out(`  Base:  proyecto nuevo de Supabase en ${a.region}${a.size ? ` (${a.size})` : ""}`);
  out(`  Sitio: proyecto «${slug}» en Vercel (equipo ${equipo})`);
  out(`  Dueño: ${email} (Administrador)`);
  out("\n  Ojo con el costo: el plan gratuito de Supabase permite 2 proyectos activos y los gratuitos se pausan por inactividad;");
  out("  para un cliente real conviene el plan Pro. Vercel Hobby es para uso personal: un servicio a clientes pide Pro.");
  if (!(await confirmar("\n¿Crear todo esto?"))) return out("Cancelado: no se creó nada.");

  const carpeta = mkdtempSync(join(tmpdir(), `alta-${slug}-`));
  const archivoSql = join(carpeta, "alta.sql");
  try {
    paso(1, `Código de la versión ${version}`);
    exportar(version, carpeta);
    const migraciones = migracionesDeLaVersion(carpeta);
    out(`   ${migraciones.length} migraciones; la última es ${migraciones.at(-1)}`);

    paso(2, "Proyecto de Supabase");
    const crear = supabase(["projects", "create", slug, "--org-id", org, "--db-password", claveDb, "--region", a.region, ...(a.size ? ["--size", a.size] : []), "-o", "json"],
      { env: { SUPABASE_ACCESS_TOKEN: process.env.SUPABASE_ACCESS_TOKEN } });
    let ref = "xxxxxxxxxxxxxxxxxxxx";
    if (!SIMULACRO) {
      try { const p = json(crear.stdout); ref = p.ref ?? p.id; } catch { ref = null; }
      if (!/^[a-z]{20}$/.test(ref ?? "")) {   // la CLI contestó otra cosa: se lo busca por nombre
        const creados = json(supabase(["projects", "list", "-o", "json"], { lectura: true }).stdout).projects.filter((x) => x.name === slug);
        ref = creados.sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)))[0]?.ref;
      }
    }
    if (!/^[a-z]{20}$/.test(ref ?? "")) throw new Error("Supabase no devolvió el identificador del proyecto");
    out(`   Proyecto ${ref}`);
    const ficha = fichaNueva({ slug, nombre, ref, region: a.region, proyecto: slug, equipo, url: null, version, migracion: null });
    guardarFicha(ficha);   // desde acá queda registrado como «en_alta»: si algo falla, se sabe qué quedó creado

    paso(3, "Esperando que la base esté lista (unos minutos)");
    if (!SIMULACRO) {
      for (let i = 0; ; i++) {
        const p = json(supabase(["projects", "list", "-o", "json"], { lectura: true }).stdout).projects.find((x) => x.ref === ref);
        if (p?.status === "ACTIVE_HEALTHY") break;
        if (i > 90) throw new Error(`La base no se activó a tiempo (estado: ${p?.status ?? "desconocido"}). Mirá el proyecto en supabase.com.`);
        await dormir(10000);
      }
    }

    paso(4, "Migraciones (la estructura completa de la base)");
    const entornoDb = { SUPABASE_DB_PASSWORD: claveDb };
    await reintentar(() => supabase(["link", "--project-ref", ref, "--workdir", carpeta], { env: entornoDb }), { que: "La base todavía no acepta conexiones" });
    await reintentar(() => supabase(["db", "push", "--workdir", carpeta, "--linked", "--yes"], { env: entornoDb }), { veces: 3, que: "Falló al aplicar las migraciones" });

    paso(5, "Claves públicas de la base");
    let urlBase = `https://${ref}.supabase.co`, clavePublica = "sb_publishable_simulada";
    if (!SIMULACRO) {
      const claves = json(supabase(["projects", "api-keys", "--project-ref", ref, "-o", "json"], { lectura: true }).stdout);
      const pub = claves.find((k) => k.type === "publishable") ?? claves.find((k) => k.name === "anon");
      if (!pub?.api_key) throw new Error("No se encontró la clave pública (publishable) del proyecto");
      clavePublica = pub.api_key;
      for (const k of claves) if (k.api_key && k.type !== "publishable" && k.name !== "anon") SECRETOS.add(k.api_key);   // por las dudas: nunca en pantalla
    }

    paso(6, "Sitio en Vercel");
    const opV = { cwd: carpeta };
    vercel(["project", "add", slug, "--scope", equipo], { ...opV, tolerar: true });   // si ya existía, sigue
    vercel(["link", "--yes", "--project", slug, "--scope", equipo, "--cwd", carpeta], opV);
    for (const [k, v] of [["NEXT_PUBLIC_SUPABASE_URL", urlBase], ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", clavePublica]]) {
      vercel(["env", "add", k, "production", "--value", v, "--yes", "--no-sensitive", "--cwd", carpeta, "--scope", equipo], opV);
    }
    vercel(["deploy", "--prod", "--yes", "--cwd", carpeta, "--scope", equipo, "-m", `version=${version}`, "-m", `instalacion=${slug}`,
      "-b", `NEXT_PUBLIC_VERSION=${version}`, "-e", `NEXT_PUBLIC_VERSION=${version}`], opV);
    let url = `https://${slug}.vercel.app`;
    if (!SIMULACRO) {
      // La dirección de producción real (si «slug.vercel.app» estaba tomada, Vercel le suma algo)
      const r = await fetch(`https://api.vercel.com/v9/projects/${slug}?${equipo.startsWith("team_") ? "teamId" : "slug"}=${equipo}`, { headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` } });
      if (r.ok) { const p = await r.json(); const alias = p.targets?.production?.alias?.find((x) => x.endsWith(".vercel.app")) ?? p.alias?.find?.((x) => x.domain?.endsWith(".vercel.app"))?.domain; if (alias) url = `https://${alias}`; }
    }
    out(`   Dirección: ${url}`);

    paso(7, "Dirección del sitio en Supabase (mails de ingreso)");
    if (SIMULACRO) out(`   [simulacro] PATCH https://api.supabase.com/v1/projects/${ref}/config/auth {site_url, uri_allow_list}`);
    else {
      const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
        method: "PATCH", headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ site_url: url, uri_allow_list: `${url}/**` }),
      });
      if (!r.ok) throw new Error(`Supabase no aceptó la dirección del sitio (${r.status}): ${limpiar(await r.text())}`);
    }

    paso(8, "Datos iniciales: nombre de la tienda y dueño como Administrador");
    const conexion = a["sin-conexion-tecnica"] ? null
      : { vercelToken: process.env.VERCEL_TOKEN, vercelProyecto: slug, vercelEquipo: equipo, supabaseToken: process.env.SUPABASE_ACCESS_TOKEN, supabaseRef: ref };
    const sql = armarSqlAlta({ nombre, nombreDueno: a["nombre-dueno"]?.trim() || nombre, email, clave: claveDueno, url, conexion });
    if (SIMULACRO) out("   [simulacro] se ejecutaría el SQL de alta (nombre, dirección, conexión técnica y administrador)");
    else {
      writeFileSync(archivoSql, sql); chmodSync(archivoSql, 0o600);
      supabase(["db", "query", "--workdir", carpeta, "--linked", "--file", archivoSql], { env: entornoDb });
    }

    paso(9, "Ficha de la instalación");
    guardarFicha({ ...ficha, estado: "activa", url, version, migracion: migraciones.at(-1), actualizada: new Date().toISOString().slice(0, 10) });

    if (SIMULACRO) out("\n✔ Simulacro terminado: no se creó ni se cambió nada. Sin --dry-run, lo hace de verdad.");
    else out(`\n✔ Listo: «${nombre}» está en ${url}`);
    out("\n  Datos para el dueño (se muestran UNA vez; que cambie la clave en Mi cuenta → Cambiar contraseña):");
    out(`    Panel:  ${url}/admin`);
    out(`    Email:  ${email}`);
    out(`    Clave:  ${SIMULACRO ? "(se genera al correrlo de verdad)" : claveDueno}`);
    out("\n  Falta, en el panel del cliente:");
    out("    1. Equipo → Cuentas e invitaciones, y Integraciones → Correo: conectar Resend (sin esto los clientes no reciben el mail de confirmación).");
    out("    2. Tienda online → Legales: datos del comercio y publicar términos y privacidad (con revisión de un abogado).");
    out("    3. Integraciones → Dominio: el dominio propio, cuando lo tengan.");
    out(`    4. Guardar copia de la ficha instalaciones/${slug}.json (no se sube al repo: es público)`);
  } catch (e) {
    out(`\n✖ El alta se cortó. Lo que ya quedó creado figura en instalaciones/${slug}.json (estado «en_alta»): revisalo en Supabase y Vercel antes de repetir.`);
    throw e;
  } finally {
    rmSync(carpeta, { recursive: true, force: true });   // acá estaba el SQL con la clave del dueño
  }
}

async function actualizar() {
  const f = fichaDe(a.slug);
  if (!f) salir(`No hay una instalación «${a.slug ?? ""}». Las que hay: ${fichas().map((x) => x.slug).join(", ") || "ninguna"}`);
  if (f.canal === "main") salir(`«${f.slug}» es el piloto: se publica solo desde Git (skill «publicar»: migración + push a main). Este comando es para los clientes.`);
  if (f.estado !== "activa") salir(`«${f.slug}» está en estado «${f.estado}»: no se puede actualizar.`);
  exigirTokens();
  const version = versionAUsar();
  const equipo = f.vercel.equipo ?? equipoVercel();
  out(`Actualizar «${f.slug}»: de ${f.version ?? "?"} a ${version}`);
  if (f.version && ultimaEtiqueta([f.version, version]) === f.version && f.version !== version) out("  OJO: es una versión más VIEJA (volver atrás). Las migraciones no se deshacen: el código viejo tiene que andar con la base nueva.");

  const carpeta = mkdtempSync(join(tmpdir(), `act-${f.slug}-`));
  try {
    paso(1, `Código de la versión ${version}`);
    exportar(version, carpeta);
    const migraciones = migracionesDeLaVersion(carpeta);

    paso(2, "Migraciones pendientes");
    supabase(["link", "--project-ref", f.supabase.ref, "--workdir", carpeta], { lectura: true });   // solo escribe la carpeta temporal
    const pendientes = supabase(["db", "push", "--workdir", carpeta, "--linked", "--dry-run"], { lectura: true });
    out(limpiar(pendientes.stdout || pendientes.stderr).split("\n").map((l) => `   ${l}`).join("\n"));
    if (!(await confirmar("¿Aplicarlas y publicar el sitio?"))) return out("Cancelado: no se cambió nada.");
    supabase(["db", "push", "--workdir", carpeta, "--linked", "--yes"]);

    paso(3, "Sitio en Vercel");
    vercel(["link", "--yes", "--project", f.vercel.proyecto, "--scope", equipo, "--cwd", carpeta], { cwd: carpeta });
    vercel(["deploy", "--prod", "--yes", "--cwd", carpeta, "--scope", equipo, "-m", `version=${version}`, "-m", `instalacion=${f.slug}`,
      "-b", `NEXT_PUBLIC_VERSION=${version}`, "-e", `NEXT_PUBLIC_VERSION=${version}`], { cwd: carpeta });

    guardarFicha({ ...f, version, migracion: migraciones.at(-1), actualizada: new Date().toISOString().slice(0, 10) });
    if (SIMULACRO) out("\n✔ Simulacro terminado: no se cambió nada. Sin --dry-run, lo hace de verdad.");
    else out(`\n✔ «${f.slug}» quedó en ${version}. La ficha instalaciones/${f.slug}.json se actualizó (solo en esta compu).`);
  } finally {
    rmSync(carpeta, { recursive: true, force: true });
  }
}

// Carga la conexión técnica en una instalación que ya existe (el piloto, o si se cambió un token). Los tokens se comprueban antes de guardarlos.
async function conexion() {
  const f = fichaDe(a.slug);
  if (!f) salir(`No hay una instalación «${a.slug ?? ""}». Las que hay: ${fichas().map((x) => x.slug).join(", ") || "ninguna"}`);
  if (f.estado !== "activa") salir(`«${f.slug}» está en estado «${f.estado}».`);
  exigirTokens();
  const equipo = f.vercel.equipo ?? equipoVercel();
  out(`Conexión técnica de «${f.slug}» (Supabase ${f.supabase.ref} · Vercel ${f.vercel.proyecto} en ${equipo})`);

  paso(1, "Comprobar que los tokens sirven");
  if (SIMULACRO) out("   [simulacro] GET api.supabase.com/v1/projects/<ref> y api.vercel.com/v9/projects/<proyecto>");
  else {
    const s = await fetch(`https://api.supabase.com/v1/projects/${f.supabase.ref}`, { headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` } });
    if (!s.ok) salir(`El token de Supabase no sirve para ese proyecto (${s.status}). Se crea en supabase.com → Account → Access Tokens.`);
    const v = await fetch(`https://api.vercel.com/v9/projects/${f.vercel.proyecto}?${equipo.startsWith("team_") ? "teamId" : "slug"}=${equipo}`, { headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` } });
    if (!v.ok) salir(`El token de Vercel no sirve para ese proyecto (${v.status}). Se crea en vercel.com → Account Settings → Tokens, con alcance al equipo «${equipo}».`);
    out("   Los dos tokens funcionan.");
  }

  paso(2, "Guardarlos en la base de la instalación");
  const carpeta = mkdtempSync(join(tmpdir(), `con-${f.slug}-`));
  try {
    const sql = armarSqlConexion({ vercelToken: process.env.VERCEL_TOKEN, vercelProyecto: f.vercel.proyecto, vercelEquipo: equipo, supabaseToken: process.env.SUPABASE_ACCESS_TOKEN, supabaseRef: f.supabase.ref });
    if (SIMULACRO) out("   [simulacro] se ejecutaría el UPDATE de integraciones (los tokens no se muestran)");
    else {
      const archivo = join(carpeta, "conexion.sql");
      writeFileSync(archivo, sql); chmodSync(archivo, 0o600);
      supabase(["link", "--project-ref", f.supabase.ref, "--workdir", carpeta], { lectura: true });   // solo escribe la carpeta temporal
      supabase(["db", "query", "--workdir", carpeta, "--linked", "--file", archivo]);
    }
    if (SIMULACRO) out("\n✔ Simulacro terminado: no se cambió nada. Sin --dry-run, lo hace de verdad.");
    else out("\n✔ Listo: en el panel, Integraciones → Dominio ya no dice «Falta la conexión técnica». Después, en Integraciones → Correo tocá «Guardar y aplicar».");
  } finally {
    rmSync(carpeta, { recursive: true, force: true });
  }
}

// ── Entrada ───────────────────────────────────────────────────────────
const comandos = { lista, estado, etiquetar, alta, actualizar, conexion, ayuda: () => out(AYUDA) };
const comando = positionals[0] ?? "ayuda";
if (!comandos[comando]) salir(`No conozco el comando «${comando}».\n\n${AYUDA}`);
try { await comandos[comando](); } catch (e) { salir(e instanceof Error ? e.message : String(e)); }
