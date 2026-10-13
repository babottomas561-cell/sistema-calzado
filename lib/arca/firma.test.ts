// Pruebas de la firma para ARCA: el CSR lleva el CUIT, el certificado se reconoce como de esa llave y la firma CMS se puede verificar
// con la llave pública (lo mismo que hace ARCA). Se simula a ARCA con una autoridad inventada (npm run test:unidades).
import test from "node:test";
import assert from "node:assert/strict";
import { createHash, verify } from "node:crypto";
import forge from "node-forge";
import { cuitValido, firmarTRA, generarPedido, leerCertificado } from "./firma.ts";

const CUIT = "20123456786";

// Una «ARCA de mentira» que firma el pedido y devuelve un certificado
function emitir(csrPem: string, emisor = "Computadores Test"): string {
  const csr = forge.pki.certificationRequestFromPem(csrPem);
  const ca = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = csr.publicKey as forge.pki.PublicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 2 * 365 * 86400000);
  cert.setSubject(csr.subject.attributes);
  cert.setIssuer([{ name: "commonName", value: emisor }, { name: "countryName", value: "AR" }]);
  cert.sign(ca.privateKey, forge.md.sha256.create());
  return forge.pki.certificateToPem(cert);
}

test("el CUIT se controla con su dígito verificador", () => {
  assert.equal(cuitValido("20-12345678-6"), true);
  assert.equal(cuitValido("20-12345678-9"), false);
  assert.equal(cuitValido("30-71234567-1"), cuitValido("30712345671"));
  assert.equal(cuitValido("123"), false);
  assert.throws(() => generarPedido({ cuit: "20-12345678-9", razonSocial: "X", alias: "x" }), /CUIT no es válido/);
});

test("el pedido de certificado lleva el CUIT, la razón social y está firmado", () => {
  const { clave, csr } = generarPedido({ cuit: "20-12345678-6", razonSocial: "Mi Local S.R.L.", alias: "Sistema caja" });
  assert.match(clave, /BEGIN RSA PRIVATE KEY/);
  const pedido = forge.pki.certificationRequestFromPem(csr);
  assert.equal(pedido.verify(), true, "el CSR está firmado con su llave");
  assert.equal(pedido.subject.getField({ type: "2.5.4.5" })?.value, `CUIT ${CUIT}`);
  assert.equal(pedido.subject.getField("O")?.value, "Mi Local S.R.L.");
  assert.equal(pedido.subject.getField("CN")?.value, "Sistemacaja", "el alias sin espacios ni símbolos");
});

test("el certificado se reconoce como de esa llave, con su CUIT, vencimiento y ambiente", () => {
  const { clave, csr } = generarPedido({ cuit: CUIT, razonSocial: "Mi Local", alias: "caja" });
  const cert = emitir(csr);
  const datos = leerCertificado({ certificado: cert, clave });
  assert.equal(datos.cuit, CUIT);
  assert.equal(datos.coincide, true);
  assert.equal(datos.ambiente, "homologacion");
  assert.ok(new Date(datos.hasta) > new Date(), "vence en el futuro");
  const otra = generarPedido({ cuit: CUIT, razonSocial: "Mi Local", alias: "caja" });
  assert.equal(leerCertificado({ certificado: cert, clave: otra.clave }).coincide, false, "con otra llave no coincide");
  assert.equal(leerCertificado({ certificado: emitir(csr, "Computadores") }).ambiente, "produccion");
});

test("la firma CMS del TRA se verifica con la llave pública (como hace ARCA)", () => {
  const { clave, csr } = generarPedido({ cuit: CUIT, razonSocial: "Mi Local", alias: "caja" });
  const cert = emitir(csr);
  const tra = '<?xml version="1.0" encoding="UTF-8"?><loginTicketRequest version="1.0"><header><uniqueId>1</uniqueId></header><service>wsfe</service></loginTicketRequest>';
  const cms = firmarTRA({ clave, certificado: cert, contenido: tra });

  // ContentInfo → SignedData: el contenido va adentro y el SignerInfo firma los atributos (que incluyen el hash del contenido)
  const raiz = forge.asn1.fromDer(forge.util.decode64(cms));
  const firmado = (raiz.value[1] as forge.asn1.Asn1).value[0] as forge.asn1.Asn1;
  const partes = firmado.value as forge.asn1.Asn1[];
  const contenido = ((partes[2].value[1] as forge.asn1.Asn1).value[0] as forge.asn1.Asn1).value as string;
  assert.equal(forge.util.decodeUtf8(contenido), tra, "el TRA va adentro de la firma");
  const firmantes = partes[partes.length - 1].value as forge.asn1.Asn1[];
  const firmante = firmantes[0].value as forge.asn1.Asn1[];
  const atributos = firmante.find((p) => p.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC && p.type === 0)!;
  const firma = Buffer.from(firmante[firmante.length - 1].value as string, "binary");
  // Se firma el DER de los atributos como SET (etiqueta 0x31)
  const der = Buffer.from(forge.asn1.toDer(forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SET, true, atributos.value as forge.asn1.Asn1[])).getBytes(), "binary");
  const publica = forge.pki.publicKeyToPem(forge.pki.certificateFromPem(cert).publicKey);
  assert.equal(verify("sha256", der, publica, firma), true, "la firma es válida");
  // Y el hash del contenido está entre los atributos firmados
  const hash = createHash("sha256").update(tra, "utf8").digest("binary");
  assert.ok(forge.asn1.toDer(atributos).getBytes().includes(hash), "el hash del TRA está firmado");
});
