// Borradores de los términos y de la política de privacidad, armados con los datos del comercio y las reglas de la
// tienda (días de cambio, retiro, saldo). Son un PUNTO DE PARTIDA para venta online en Argentina: el dueño los edita
// y conviene que un abogado los revise antes de publicarlos. Cada publicación es una versión nueva e inmutable.
import type { Database } from "@/lib/database.types";

export type DatosLegales = Database["public"]["Tables"]["datos_legales"]["Row"];
export type ReglasTienda = { nombre: string; direccion_retiro: string | null; horario: string | null; dias_retiro: number; dias_cambio: number; dias_saldo: number };
export type TipoDoc = "terminos" | "privacidad";

export const TITULO: Record<TipoDoc, string> = { terminos: "Términos y condiciones", privacidad: "Política de privacidad" };
const x = (v: string | null | undefined) => v?.trim() || "[completar]";

// Qué falta cargar en los datos del comercio para poder publicar (la base pide los mismos cuatro)
export function faltanDatos(d: Pick<DatosLegales, "razon_social" | "cuit" | "domicilio_legal" | "email_contacto">): string[] {
  return [!d.razon_social && "razón social", !d.cuit && "CUIT", !d.domicilio_legal && "domicilio legal", !d.email_contacto && "email de contacto"].filter(Boolean) as string[];
}

export function borrador(tipo: TipoDoc, d: DatosLegales, t: ReglasTienda): string {
  return tipo === "terminos" ? terminos(d, t) : privacidad(d, t);
}

function terminos(d: DatosLegales, t: ReglasTienda): string {
  return `# Términos y condiciones

Estos términos rigen el uso de la tienda online de **${t.nombre}** y las compras que se hagan en ella. Al crear una cuenta o confirmar un pedido, declarás que los leíste y los aceptás.

## 1. Quién vende

- **Razón social:** ${x(d.razon_social)}
- **CUIT:** ${x(d.cuit)}${d.condicion_iva ? `\n- **Condición frente al IVA:** ${d.condicion_iva}` : ""}
- **Domicilio legal:** ${x(d.domicilio_legal)}
- **Contacto:** ${x(d.email_contacto)}${d.telefono_contacto ? ` · ${d.telefono_contacto}` : ""}
${t.direccion_retiro ? `- **Local:** ${t.direccion_retiro}${t.horario ? ` (${t.horario})` : ""}\n` : ""}
## 2. Tu cuenta

- Los datos que cargues tienen que ser verdaderos y estar actualizados.
- Sos responsable de tu contraseña y de lo que se haga con tu cuenta. Si creés que alguien la usó, cambiala y avisanos.
- Podemos suspender cuentas que se usen de forma fraudulenta o que incumplan estos términos.

## 3. Productos y precios

- Los precios están expresados en pesos argentinos e incluyen los impuestos que correspondan al consumidor final.
- Las fotos son ilustrativas: pueden existir pequeñas diferencias de color según la pantalla.
- La disponibilidad se muestra en tiempo real, pero puede cambiar si se vende el mismo producto en el local. Si no podemos entregar un producto, te avisamos y devolvemos lo que hayas pagado.
- Si hay un error evidente en un precio, te lo vamos a informar antes de confirmar la venta y vas a poder elegir si querés seguir con la compra o cancelarla sin costo.

## 4. Medios de pago

- Aceptamos los medios de pago que figuran al confirmar el pedido. Algunos tienen un **descuento** o un **recargo**, que se te muestra antes de confirmar.
- El pago con tarjeta o dinero en cuenta se procesa a través de Mercado Pago, que tiene sus propios términos.
- El total que ves al confirmar es el que se cobra. Las cuotas y sus costos los informa el medio de pago elegido.

## 5. Cómo funciona un pedido

1. Al confirmar, **reservamos** los productos para vos.
2. Te avisamos cuando está confirmado, listo para retirar o enviado, y podés seguirlo desde tu cuenta.
3. Si elegiste retirar y no pasás dentro de los **${t.dias_retiro} días** de que esté listo, el pedido se cancela solo y se libera la mercadería. Si ya lo habías pagado online, te devolvemos el dinero.
4. Podés cancelar tu pedido desde tu cuenta mientras esté pendiente o confirmado.

## 6. Entrega

- **Retiro en el local:** sin costo, en el domicilio y horario indicados.
- **Envío:** el costo depende de la zona y se te informa **antes** de confirmar, aparte del precio de los productos. Los plazos son estimados y dependen del servicio de entrega.
- Revisá el paquete al recibirlo y avisanos enseguida si llegó dañado o incompleto.

## 7. Cambios y devoluciones

- Podés cambiar un producto dentro de los **${t.dias_cambio} días** de la compra, presentando el ticket o el número de pedido, siempre que esté sin uso, limpio y con sus etiquetas.
- Si el cambio es por otro talle o color del mismo artículo, se respeta lo que pagaste aunque el precio haya subido. Si elegís otro artículo, se aplica el precio vigente.
- Las devoluciones se compensan con un **saldo a favor** para tu próxima compra, que vence a los **${t.dias_saldo} días**.
- Si el producto tiene una falla de fabricación, rige la garantía legal (punto 9) y no corre este plazo.

## 8. Derecho de arrepentimiento

En las compras realizadas a distancia por internet podés **revocar la aceptación dentro de los 10 días corridos** contados desde que recibís el producto o desde que se celebró el contrato, lo último que ocurra, sin tener que dar explicaciones (art. 34 de la Ley 24.240 y art. 1110 del Código Civil y Comercial).

- Lo ejercés desde el botón **«Botón de arrepentimiento»** del pie de la tienda. Recibís un código de constancia.
- Los gastos de devolución del producto corren por cuenta del vendedor.
- Te devolvemos el dinero por el mismo medio que usaste para pagar.
- Para que sea posible, el producto tiene que estar en las mismas condiciones en que lo recibiste.

## 9. Garantía legal

Los productos tienen la garantía legal que establece la Ley 24.240 de Defensa del Consumidor (arts. 11 a 18). Si un producto tiene una falla, podés reclamar su reparación, cambio o devolución según corresponda. Presentá el ticket o el número de pedido y el producto en el local, o escribinos.

## 10. Propiedad intelectual

Las marcas, imágenes, textos y diseños de la tienda son de ${x(d.razon_social)} o de sus titulares y no pueden usarse sin autorización.

## 11. Datos personales

El tratamiento de tus datos se explica en la **Política de privacidad**, que forma parte de estos términos.

## 12. Cambios en estos términos

Podemos actualizar estos términos. Cada versión queda registrada con su fecha. Si cambian, te vamos a pedir que aceptes la versión vigente al hacer tu próxima compra. Las compras ya realizadas se rigen por la versión que aceptaste.

## 13. Defensa del consumidor

Ante cualquier reclamo, escribinos primero a ${x(d.email_contacto)} y vamos a responderte lo antes posible. También podés hacer tu reclamo ante la autoridad de aplicación de la Ley de Defensa del Consumidor de tu jurisdicción (${d.defensa_consumidor_url}).

## 14. Ley aplicable y jurisdicción

Estos términos se rigen por las leyes de la República Argentina. Ante cualquier conflicto, podés optar por los tribunales ordinarios de ${x(d.jurisdiccion)} o por los del domicilio real del consumidor.
`;
}

function privacidad(d: DatosLegales, t: ReglasTienda): string {
  return `# Política de privacidad

**${x(d.razon_social)}** (CUIT ${x(d.cuit)}), titular de la tienda **${t.nombre}**, con domicilio en ${x(d.domicilio_legal)}, es responsable del tratamiento de tus datos personales, conforme a la Ley 25.326 de Protección de los Datos Personales.

## 1. Qué datos recolectamos

- **Los que nos das:** nombre y apellido, email, teléfono, documento, fecha de nacimiento y dirección (según lo que te pida el formulario), y la contraseña (que se guarda cifrada).
- **Los de tu actividad:** pedidos, compras, cambios, devoluciones, saldo a favor y comunicaciones con el local.
- **Los de aceptación:** qué versión de los términos aceptaste y cuándo.
- **Los técnicos:** datos mínimos de navegación necesarios para que la tienda funcione y para mantener tu sesión iniciada.

## 2. Para qué los usamos

- Crear y administrar tu cuenta.
- Procesar, entregar y hacer el seguimiento de tus pedidos, y gestionar cambios, devoluciones y garantías.
- Avisarte sobre el estado de tus pedidos por email o WhatsApp.
- Cumplir obligaciones legales, contables e impositivas.
- Si lo aceptaste, enviarte novedades y promociones. Podés dejar de recibirlas cuando quieras.

## 3. Con quién los compartimos

No vendemos tus datos. Los compartimos solo con quienes necesitamos para prestarte el servicio:

- Proveedores de infraestructura y almacenamiento (hosting y base de datos).
- Mercado Pago, para procesar los pagos online.
- Servicios de mensajería y de envío, para avisarte y entregar tu pedido.
- Servicios de correo electrónico, para los mails de tu cuenta.
- Servicios de inteligencia artificial que ayudan a responder consultas por WhatsApp, sin usarlos para otros fines.
- Autoridades, cuando una norma o una orden judicial lo exija.

Algunos de estos proveedores pueden tener sus servidores fuera de la Argentina. En ese caso, nos aseguramos de que ofrezcan niveles de protección adecuados.

## 4. Cuánto tiempo los guardamos

Mientras tu cuenta esté activa y durante los plazos que exigen las normas contables, impositivas y de defensa del consumidor. Después los eliminamos o los anonimizamos.

## 5. Tus derechos

Podés acceder a tus datos, rectificarlos, actualizarlos o pedir que los suprimamos. El acceso es gratuito a intervalos no inferiores a seis meses, salvo que acredites un interés legítimo (art. 14 de la Ley 25.326). Muchos datos los podés cambiar vos mismo desde **Mi cuenta**. Para el resto, escribinos a **${x(d.email_contacto)}**.

## 6. Seguridad

Aplicamos medidas técnicas y organizativas para proteger tus datos: acceso por roles, comunicaciones cifradas y contraseñas almacenadas de forma cifrada. Ningún sistema es infalible; si detectamos un incidente que te afecte, te vamos a avisar.

## 7. Menores

La tienda no está dirigida a menores de 18 años. Si sos menor, comprá con la compañía de un adulto responsable.

## 8. Autoridad de control

La **Agencia de Acceso a la Información Pública**, en su carácter de Órgano de Control de la Ley 25.326, tiene la atribución de atender las denuncias y reclamos que se interpongan con relación al incumplimiento de las normas sobre protección de datos personales.

## 9. Cambios en esta política

Si la modificamos, publicamos una nueva versión con su fecha. Cada versión queda registrada.
`;
}
