// Firmador y pasarela para ARCA. La base no puede firmar con RSA ni conectarse a los servidores de ARCA (usan una seguridad vieja que su
// extensión http rechaza), así que le pide a esta ruta: generar la llave y el pedido de certificado, firmar el pedido de acceso (TRA), leer un
// certificado y llevar un mensaje a ARCA (solo a sus direcciones). No sabe ningún secreto, no guarda nada y no registra lo que recibe (la llave
// viaja en el pedido, desde la base, por HTTPS). Atacarla no sirve: solo firma con la llave que le mandan y solo habla con ARCA.
import { firmarTRA, generarPedido, leerCertificado } from "@/lib/arca/firma";
import { enviarAArca } from "@/lib/arca/pasarela";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMITE = 64_000;   // un pedido normal pesa unos pocos KB
const error = (texto: string, status = 400) => Response.json({ error: texto }, { status });
const texto = (x: unknown, max = 16_000) => (typeof x === "string" && x.length > 0 && x.length <= max ? x : null);

export async function POST(pedido: Request) {
  const cuerpo = await pedido.text();
  if (cuerpo.length > LIMITE) return error("Pedido demasiado grande", 413);
  let datos: Record<string, unknown>;
  try { datos = JSON.parse(cuerpo); } catch { return error("Pedido inválido"); }
  try {
    switch (datos.accion) {
      case "generar": {
        const cuit = texto(datos.cuit, 20), razonSocial = texto(datos.razon_social, 200), alias = texto(datos.alias, 60) ?? "sistema";
        if (!cuit || !razonSocial) return error("Faltan el CUIT o la razón social");
        return Response.json(generarPedido({ cuit, razonSocial, alias }));
      }
      case "firmar": {
        const clave = texto(datos.clave), certificado = texto(datos.certificado), contenido = texto(datos.contenido, 4_000);
        if (!clave || !certificado || !contenido) return error("Faltan la llave, el certificado o el contenido");
        return Response.json({ firmado: firmarTRA({ clave, certificado, contenido }) });
      }
      case "leer": {
        const certificado = texto(datos.certificado);
        if (!certificado) return error("Falta el certificado");
        return Response.json(leerCertificado({ certificado, clave: texto(datos.clave) }));
      }
      case "enviar": {
        const url = texto(datos.url, 200), soapAction = typeof datos.soap_action === "string" ? datos.soap_action.slice(0, 200) : "", xml = texto(datos.xml, 30_000);
        if (!url || !xml) return error("Faltan la dirección o el mensaje");
        try {
          return Response.json(await enviarAArca({ url, soapAction, xml }));
        } catch (e) {
          // ARCA caído o lento: la base lo anota y reintenta
          return Response.json({ status: 0, cuerpo: "", error: e instanceof Error ? e.message.slice(0, 200) : "Sin conexión con ARCA" });
        }
      }
      default: return error("Acción desconocida");
    }
  } catch (e) {
    // Sin detalles internos: el mensaje es de la librería (certificado mal pegado, llave que no corresponde…)
    return error(e instanceof Error ? e.message.slice(0, 200) : "No se pudo firmar", 422);
  }
}
