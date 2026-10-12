// Consulta DNS de verdad (solo servidor): qué ve internet hoy para un dominio. Sirve para decirle al dueño, registro por
// registro, qué está bien y qué falta, sin esperar a que Vercel lo revise (cada 10 minutos).
import { promises as dns } from "node:dns";
import { detectarProveedor } from "./dns-guias.ts";

export type Registro = { tipo: string; nombre: string; valor: string };
export type Chequeo = { registro: Registro; ok: boolean; hoy: string[] };
export type Diagnostico = {
  dominio: string;
  proveedor: string | null;        // id de lib/dns-guias.ts, o null si no se reconoce
  servidores: string[];            // los servidores de nombres que tiene hoy
  sinDelegar: boolean;             // el dominio no tiene servidores: en .ar es que falta delegarlo en NIC.ar
  chequeos: Chequeo[];
};

const limpio = (x: string) => x.toLowerCase().replace(/\.$/, "");
// Una consulta que falla (no existe, sin datos, tiempo agotado) es «no hay nada», no un error
async function intentar<T>(fn: () => Promise<T>, vacio: T): Promise<T> {
  try { return await Promise.race([fn(), new Promise<T>((_, no) => setTimeout(() => no(new Error("tiempo")), 6000))]); } catch { return vacio; }
}

// Del nombre que pone el panel («@», «www», «_vercel.mitienda.com.ar») al nombre completo
export function nombreCompleto(nombre: string, dominioBase: string): string {
  const n = limpio(nombre);
  if (n === "@" || n === "") return dominioBase;
  return n === dominioBase || n.endsWith(`.${dominioBase}`) ? n : `${n}.${dominioBase}`;
}

// El dominio «de zona» (sin www) del que se piden los servidores de nombres
const apexDe = (d: string) => limpio(d).replace(/^www\./, "");

// El resolvedor se puede reemplazar (las pruebas no usan internet)
export type Resolvedor = Pick<typeof dns, "resolveNs" | "resolve4" | "resolve6" | "resolveCname" | "resolveTxt">;

export async function diagnosticar(dominio: string, registros: Registro[], r_: Resolvedor = dns): Promise<Diagnostico> {
  const apex = apexDe(dominio);
  const servidores = (await intentar(() => r_.resolveNs(apex), [] as string[])).map(limpio).sort();
  const chequeos: Chequeo[] = [];
  for (const reg of registros) {
    const completo = nombreCompleto(reg.nombre, apex);
    let hoy: string[] = [];
    if (reg.tipo === "A") hoy = await intentar(() => r_.resolve4(completo), [] as string[]);
    else if (reg.tipo === "AAAA") hoy = await intentar(() => r_.resolve6(completo), [] as string[]);
    else if (reg.tipo === "CNAME") hoy = (await intentar(() => r_.resolveCname(completo), [] as string[])).map(limpio);
    else if (reg.tipo === "TXT") hoy = (await intentar(() => r_.resolveTxt(completo), [] as string[][])).map((partes) => partes.join(""));
    const esperado = reg.tipo === "CNAME" ? limpio(reg.valor) : reg.valor;
    chequeos.push({ registro: reg, ok: hoy.includes(esperado), hoy });
  }
  return { dominio: apex, proveedor: detectarProveedor(servidores), servidores, sinDelegar: servidores.length === 0, chequeos };
}
