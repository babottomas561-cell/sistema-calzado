// La firma digital que pide ARCA para entrar a sus servicios (WSAA): generar la llave y el pedido de certificado (CSR), firmar el pedido de acceso
// (TRA) en formato CMS y leer el certificado que da ARCA. La base no puede firmar con RSA: lo hace la ruta /api/arca/firma con estas funciones.
// No guarda nada ni sabe ningún secreto: firma con la llave que le mandan. Sin «@/»: lo prueba Node directo (lib/arca/firma.test.ts).
import { generateKeyPairSync } from "node:crypto";
import forge from "node-forge";

// CUIT: 11 cifras y dígito verificador (pesos 5 4 3 2 7 6 5 4 3 2)
export const soloCifras = (cuit: string) => cuit.replace(/\D/g, "");
export function cuitValido(cuit: string): boolean {
  const c = soloCifras(cuit);
  if (!/^\d{11}$/.test(c)) return false;
  const suma = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2].reduce((s, p, i) => s + p * Number(c[i]), 0);
  const dv = 11 - (suma % 11);
  return (dv === 11 ? 0 : dv === 10 ? 9 : dv) === Number(c[10]);
}

// Llave RSA de 2048 bits y el pedido de certificado con los datos que pide ARCA: país, razón social, un alias y «CUIT nnnnnnnnnnn»
export function generarPedido({ cuit, razonSocial, alias }: { cuit: string; razonSocial: string; alias: string }): { clave: string; csr: string } {
  const c = soloCifras(cuit);
  if (!cuitValido(c)) throw new Error("El CUIT no es válido");
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs1", format: "pem" },
  });
  const csr = forge.pki.createCertificationRequest();
  csr.publicKey = forge.pki.publicKeyFromPem(publicKey);
  csr.setSubject([
    { name: "countryName", value: "AR" },
    { name: "organizationName", value: razonSocial.slice(0, 64) },
    { name: "commonName", value: alias.replace(/[^A-Za-z0-9]/g, "").slice(0, 30) || "sistema" },
    { name: "serialNumber", value: `CUIT ${c}` },
  ]);
  csr.sign(forge.pki.privateKeyFromPem(privateKey), forge.md.sha256.create());
  return { clave: privateKey, csr: forge.pki.certificationRequestToPem(csr) };
}

// El TRA firmado: CMS (PKCS#7) con el contenido adentro, SHA-256, en base64. Es lo que va en loginCms de WSAA.
export function firmarTRA({ clave, certificado, contenido }: { clave: string; certificado: string; contenido: string }): string {
  const cert = forge.pki.certificateFromPem(certificado);
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(contenido, "utf8");
  p7.addCertificate(cert);
  p7.addSigner({
    key: forge.pki.privateKeyFromPem(clave), certificate: cert, digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() as unknown as string },
    ],
  });
  p7.sign();
  return forge.util.encode64(forge.asn1.toDer(p7.toAsn1()).getBytes());
}

// Qué dice el certificado: de qué CUIT es, quién lo emitió (el de pruebas de ARCA o el de producción), hasta cuándo vale y si es de esta llave
export function leerCertificado({ certificado, clave }: { certificado: string; clave?: string | null }) {
  const cert = forge.pki.certificateFromPem(certificado);
  const serie = String(cert.subject.getField({ type: "2.5.4.5" })?.value ?? "");
  const emisor = String(cert.issuer.getField("CN")?.value ?? "");
  let coincide: boolean | null = null;
  if (clave) {
    const privada = forge.pki.privateKeyFromPem(clave) as forge.pki.rsa.PrivateKey;
    coincide = (cert.publicKey as forge.pki.rsa.PublicKey).n.equals(privada.n);
  }
  return {
    cuit: soloCifras(serie) || null, emisor, sujeto: String(cert.subject.getField("CN")?.value ?? ""),
    desde: cert.validity.notBefore.toISOString(), hasta: cert.validity.notAfter.toISOString(), coincide,
    // ARCA firma los de prueba con una autoridad que dice «Test» en el nombre (verificar con un certificado real de cada ambiente)
    ambiente: /test|homo/i.test(emisor) ? "homologacion" : "produccion",
  };
}
