# Correo, paso a paso

Para que el cliente reciba el mail de **confirmar su cuenta**, el de **cambiar la contraseña** y los **comprobantes por mail**, con el nombre de tu tienda.

> **Por qué hace falta.** El correo de prueba que trae Supabase solo manda mails a las personas del equipo del proyecto
> y con un tope muy bajo por hora. Sin un servidor de correo propio, los clientes **no reciben nada**.

## Elegí una opción

| Opción | Necesita dominio | Gratis | Desde qué dirección salen |
|---|---|---|---|
| **Con el dominio de mi tienda** (Resend) | Sí | 3.000 por mes | `no-responder@mitienda.com.ar` — lo más profesional |
| **Con el Gmail del local** | No | unos 500 por día | `milocal@gmail.com` |
| **Otro servidor** (Brevo, SendGrid, tu hosting…) | Depende del servicio | Depende | la que verifiques en ese servicio |

¿No tenés dominio? Usá **Gmail**: es la que mejor llega sin dominio, porque el mail lo firma Google. Cuando tengas dominio,
cambiás de opción en la misma pantalla y listo.

---

## Opción A — Con el Gmail del local

1. Entrá a **myaccount.google.com/security** con el Gmail del local y activá la **verificación en dos pasos**
   (sin eso, Google no deja crear la clave del paso 2).
2. Entrá a **myaccount.google.com/apppasswords**, escribí un nombre (por ejemplo «Sistema») y tocá **Crear**.
   Google te muestra **16 letras**: esa es la *contraseña de aplicación*. No es la contraseña de siempre, y sirve solo para mandar mails.
3. En **Integraciones → Correo** elegí **Con el Gmail del local**, escribí el Gmail y pegá las 16 letras (con o sin espacios).
4. **Guardar y aplicar**.

> Si Google dice que la opción no está disponible: la cuenta es de una empresa (Google Workspace) y el administrador la apagó,
> o falta la verificación en dos pasos. Si algún día cambiás la contraseña de Google, las contraseñas de aplicación se borran: creá una nueva.

## Opción B — Con el dominio de mi tienda (Resend)

1. Entrá a **resend.com** y creá la cuenta con tu email.
2. **Domains → Add Domain** y escribí tu dominio (por ejemplo `mitienda.com.ar`). Resend te muestra unos registros DNS (TXT y MX):
   cargalos donde compraste el dominio, igual que en *Dominio propio*. Esperá a que diga **Verified** (minutos a unas horas).
3. **API Keys → Create API Key**, con permiso **Sending access**. Copiala ahora: Resend no la vuelve a mostrar.
4. En **Integraciones → Correo** elegí **Con el dominio de mi tienda**, pegá la clave y escribí una dirección de tu dominio
   (por ejemplo `no-responder@mitienda.com.ar`).
5. **Guardar y aplicar**.

## Opción C — Otro servidor

Cualquier servicio que te dé un servidor SMTP: cargás servidor, puerto (465 o 587), usuario, contraseña y la dirección «desde».
Muchos servicios piden **verificar esa dirección o su dominio** antes de dejarte mandar; si no podés, usá Gmail.

---

## Probar

Tocá **Mandarme un mail de prueba**. Te llega a tu propio email un mail de «cambiar contraseña» (no hace falta usarlo).
Si llega bien y con el nombre de tu tienda, los clientes también lo van a recibir. Si no llega, mirá en spam.

Para probar los comprobantes: abrí una venta → **Enviar → Mail** y mandátelo a vos.

> Si dice *Falta una configuración del instalador*: la carga una vez quien instaló el sistema (no se ve en el panel). Avisale.

## Cómo funciona por dentro (para quien instala)

- **Confirmar cuenta y cambiar contraseña** los manda Supabase con el servidor que elegiste (la base se lo pasa por su API).
- **Comprobantes**: con Resend, la base le habla directo a su API. Con Gmail u otro servidor, la base no sabe hablar SMTP: le pide
  a la ruta `/api/correo/enviar` de la app que lo mande. Cada pedido va **firmado** por la base y la ruta le pregunta a la base si la
  firma es buena antes de mandar nada (`correo_verificar`); la ruta no guarda ni conoce ningún secreto. La clave del correo vive en
  `integraciones`, que nadie puede leer.
- Al guardar, si la instalación todavía no tiene dirección del sitio, queda la de Vercel (`algo.vercel.app`): sin ella la base no
  encuentra la ruta ni puede armar el link del comprobante. Si después conectás un dominio propio, pasa a ser ese.

## Qué ve el cliente

- **Se registra** → «Revisá tu email» (con botón para reenviar y para corregir el email).
- **Toca el link** → queda confirmado, con la sesión abierta, y entra a *Mi cuenta*. El link sirve una sola vez y
  se puede abrir desde otro dispositivo que donde se registró.
- **Olvidó la contraseña** → *Olvidé mi contraseña* en la pantalla de ingreso.

## Cuentas

En **Equipo → Cuentas e invitaciones** elegís si la confirmación de email es obligatoria (lo recomendado), qué datos
pide el formulario, las reglas de la contraseña, los dominios de email permitidos o bloqueados y los términos.
Sin correo conectado y con la confirmación activa, el panel muestra un cartel de advertencia.
