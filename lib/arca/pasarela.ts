// Pasarela hacia ARCA. Sus servidores usan una configuración de seguridad vieja (claves Diffie-Hellman cortas) que OpenSSL 3 rechaza
// («dh key too small» en producción) y la extensión http de Postgres no deja aflojarla. Node sí: con un agente compatible ARCA responde en los
// dos ambientes (probado el 2026-10-13). La base arma el mensaje y decide todo; esto solo lo lleva y trae, y SOLO a las direcciones de ARCA.
import https from "node:https";
import { constants } from "node:crypto";

// Las únicas direcciones a las que se manda algo (no es un proxy abierto)
export const HOSTS_ARCA = ["wsaa.afip.gov.ar", "wsaahomo.afip.gov.ar", "servicios1.afip.gov.ar", "wswhomo.afip.gov.ar"];
export function urlPermitida(url: string): boolean {
  try { const u = new URL(url); return u.protocol === "https:" && HOSTS_ARCA.includes(u.hostname); } catch { return false; }
}

const SSL_OP_IGNORE_UNEXPECTED_EOF = 0x00000080;   // algunos servidores de ARCA cortan sin el aviso de cierre de TLS
const agente = new https.Agent({ ciphers: "DEFAULT@SECLEVEL=1", secureOptions: constants.SSL_OP_LEGACY_SERVER_CONNECT | SSL_OP_IGNORE_UNEXPECTED_EOF, keepAlive: true });
const MAXIMO = 2_000_000;   // una respuesta de ARCA pesa unos pocos KB

export function enviarAArca({ url, soapAction, xml }: { url: string; soapAction: string; xml: string }): Promise<{ status: number; cuerpo: string }> {
  if (!urlPermitida(url)) return Promise.reject(new Error("Esa dirección no es de ARCA"));
  return new Promise((resolver, rechazar) => {
    const pedido = https.request(url, {
      method: "POST", agent: agente, timeout: 35_000,
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: soapAction, "Content-Length": Buffer.byteLength(xml) },
    }, (r) => {
      const partes: Buffer[] = []; let largo = 0;
      r.on("data", (d: Buffer) => { largo += d.length; if (largo > MAXIMO) pedido.destroy(new Error("Respuesta demasiado grande")); else partes.push(d); });
      r.on("end", () => resolver({ status: r.statusCode ?? 0, cuerpo: Buffer.concat(partes).toString("utf8") }));
    });
    pedido.on("timeout", () => pedido.destroy(new Error("ARCA no respondió a tiempo")));
    pedido.on("error", rechazar);
    pedido.end(xml);
  });
}
