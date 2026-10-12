# Correo, paso a paso

Para que el cliente reciba el mail de **confirmar su cuenta** y el de **cambiar la contraseña**, con el nombre de tu tienda.

> **Por qué hace falta.** El correo de prueba que trae Supabase solo manda mails a las personas del equipo del proyecto
> y con un tope muy bajo por hora. Sin un servidor de correo propio, los clientes **no reciben nada**.

Recomendado: **Resend** (gratis hasta 3.000 mails por mes, 100 por día). Sirve cualquier otro servicio con SMTP.

## Paso 1 — Crear la cuenta en Resend

1. Entrá a **resend.com** y creá la cuenta con tu email.
2. **Domains → Add Domain** y escribí tu dominio (por ejemplo `mitienda.com.ar`).
3. Resend te muestra unos registros DNS (tipo TXT y MX). Cargalos donde compraste el dominio, igual que en
   *Dominio propio*. Esperá a que diga **Verified** (minutos a unas horas).

## Paso 2 — Crear la clave

1. **API Keys → Create API Key**, con permiso **Sending access**.
2. Copiala ahora: Resend no la vuelve a mostrar.

## Paso 3 — Cargarla en el panel

En **Integraciones → Correo**:

1. Tocá **Completar para Resend** (carga `smtp.resend.com`, puerto `465` y usuario `resend`).
2. **Contraseña o API key**: pegá la clave del paso 2.
3. **Mail desde el que salen**: una dirección de tu dominio verificado, por ejemplo `no-responder@mitienda.com.ar`.
4. **Nombre que ve el cliente**: lo que aparece como remitente (vacío = el nombre de la tienda).
5. **Guardar y aplicar**. La base le pasa a Supabase el servidor y los textos de los mails (con el nombre y las
   iniciales de tu tienda). No hace falta entrar a Supabase.

> Si dice *Falta la conexión técnica*: es la que carga una vez quien instaló el sistema, en
> **Integraciones → Dominio → Conexión técnica** (token de Supabase y su ref).

## Paso 4 — Probar

Tocá **Mandarme un mail de prueba**. Te llega a tu propio email un mail de «cambiar contraseña» (no hace falta usarlo).
Si llega bien y con el nombre de tu tienda, los clientes también lo van a recibir. Si no llega, mirá en spam y revisá
que el dominio figure como *Verified* en Resend.

## Qué ve el cliente

- **Se registra** → «Revisá tu email» (con botón para reenviar y para corregir el email).
- **Toca el link** → queda confirmado, con la sesión abierta, y entra a *Mi cuenta*. El link sirve una sola vez y
  se puede abrir desde otro dispositivo que donde se registró.
- **Olvidó la contraseña** → *Olvidé mi contraseña* en la pantalla de ingreso.

## Cuentas

En **Equipo → Cuentas e invitaciones** elegís si la confirmación de email es obligatoria (lo recomendado), qué datos
pide el formulario, las reglas de la contraseña, los dominios de email permitidos o bloqueados y los términos.
Sin correo conectado y con la confirmación activa, el panel muestra un cartel de advertencia.
