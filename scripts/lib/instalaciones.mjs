// Partes puras del script de instalaciones (sin red, sin disco): validaciones, claves y el SQL del alta.
// Se prueban en scripts/instalaciones.test.mjs.
import { randomBytes } from "node:crypto";

const RESERVADOS = new Set(["admin", "api", "www", "app", "test", "demo", "piloto", "main", "estable"]);

// Un nombre corto para el proyecto y el registro: minúsculas, números y guiones (3 a 40)
export function validarSlug(s) {
  if (typeof s !== "string" || !/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(s)) return "El slug va en minúsculas, con números y guiones (de 3 a 40 letras), por ejemplo «mi-local»";
  if (/--/.test(s)) return "El slug no puede tener dos guiones seguidos";
  if (RESERVADOS.has(s)) return `«${s}» está reservado: elegí otro`;
  return null;
}

export const emailValido = (e) => typeof e === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

// Una clave para entregar una vez: 20 letras y números sin los que se confunden (0/O, 1/l/I)
export function generarClave(largo = 20) {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(largo);
  return Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join("");
}

// Un texto como literal de SQL (comillas simples duplicadas). Rechaza lo que no debería viajar nunca en un literal.
export function sqlLiteral(texto) {
  const s = String(texto ?? "");
  if (s.includes("\u0000")) throw new Error("Hay un carácter inválido en un dato");
  return `'${s.replace(/'/g, "''")}'`;
}

// Etiqueta de versión del día: v2026.10.13, y si ya existe v2026.10.13-2, -3…
export function etiquetaDelDia(existentes, hoy = new Date()) {
  const base = `v${hoy.getFullYear()}.${String(hoy.getMonth() + 1).padStart(2, "0")}.${String(hoy.getDate()).padStart(2, "0")}`;
  if (!existentes.includes(base)) return base;
  let n = 2;
  while (existentes.includes(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

// La más nueva de una lista de etiquetas vAAAA.MM.DD[-n]
export function ultimaEtiqueta(etiquetas) {
  const clave = (t) => { const m = /^v(\d{4})\.(\d{2})\.(\d{2})(?:-(\d+))?$/.exec(t); return m ? Number(m[1]) * 1e8 + Number(m[2]) * 1e6 + Number(m[3]) * 1e4 + Number(m[4] ?? 1) : -1; };
  return etiquetas.filter((t) => clave(t) > 0).sort((a, b) => clave(b) - clave(a))[0] ?? null;
}

// El SQL que deja lista una instalación recién migrada: nombre de la tienda, dirección, (opcional) conexión técnica y el
// primer administrador. Es lo que hacía a mano el README (registrarse + UPDATE), pero sin pasar por el mail de confirmación.
export function armarSqlAlta({ nombre, nombreDueno, email, clave, url, conexion }) {
  const L = sqlLiteral;
  const partes = [
    "-- Alta de una instalación nueva. Se corre una sola vez (lo genera scripts/instalaciones.mjs).",
    "create extension if not exists pgcrypto with schema extensions;",
    `update public.configuracion_tienda set nombre = ${L(nombre)};`,
    `update public.integraciones set sitio_url = ${L(url)} where unica;`,
  ];
  if (conexion) {
    partes.push(`update public.integraciones set vercel_token = ${L(conexion.vercelToken)}, vercel_proyecto = ${L(conexion.vercelProyecto)},`,
      `  vercel_equipo = ${conexion.vercelEquipo ? L(conexion.vercelEquipo) : "null"}, supabase_token = ${L(conexion.supabaseToken)}, supabase_ref = ${L(conexion.supabaseRef)} where unica;`);
  }
  partes.push(
    "create function pg_temp.alta_admin(p_email text, p_nombre text, p_clave text) returns uuid language plpgsql as $f$",
    "declare v_id uuid := gen_random_uuid();",
    "begin",
    "  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,",
    "                          created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)",
    "  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', lower(p_email),",
    "          extensions.crypt(p_clave, extensions.gen_salt('bf')), now(), '{\"provider\":\"email\",\"providers\":[\"email\"]}',",
    "          jsonb_build_object('nombre', p_nombre), now(), now(), '', '', '', '');",
    "  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)",
    "  values (gen_random_uuid(), v_id, v_id::text, jsonb_build_object('sub', v_id::text, 'email', lower(p_email)), 'email', now(), now(), now());",
    "  update public.perfiles set rol = 'staff', rol_id = (select id from public.roles where todos), nombre = p_nombre where id = v_id;",
    "  delete from public.clientes where usuario_id = v_id;",
    "  return v_id;",
    "end $f$;",
    `select pg_temp.alta_admin(${L(email)}, ${L(nombreDueno)}, ${L(clave)}) as administrador;`,
  );
  if (conexion) {
    partes.push("-- Con la conexión técnica cargada, se le pasa a Supabase Auth la confirmación de email, la contraseña y los mails con el nombre de la tienda",
      "select set_config('request.jwt.claims', json_build_object('sub', (select id from auth.users where lower(email) = " + L(email.toLowerCase()) + "), 'role', 'authenticated')::text, false);",
      "select public.cuentas_aplicar();");
  }
  return partes.join("\n") + "\n";
}

// La ficha de una instalación (sin secretos): va en instalaciones/<slug>.json
export function fichaNueva({ slug, nombre, ref, region, proyecto, equipo, url, version, migracion, estado = "en_alta", hoy = new Date() }) {
  return {
    slug, nombre, estado, canal: "manual",
    supabase: { ref, region }, vercel: { proyecto, equipo }, url, dominio: null,
    version, migracion, alta: hoy.toISOString().slice(0, 10), actualizada: hoy.toISOString().slice(0, 10), notas: "",
  };
}

// Cuántas migraciones le faltan a una instalación respecto de la última del repositorio
export function migracionesAtrasadas(aplicadas, delRepo) {
  const tiene = new Set(aplicadas);
  return delRepo.filter((v) => !tiene.has(v));
}
