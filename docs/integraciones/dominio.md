# Dominio propio, paso a paso

Para que la tienda se vea en tu propia dirección (por ejemplo `mitienda.com.ar`) en vez de la de Vercel.
La tienda queda en el dominio y el panel en `mitienda.com.ar/admin`. `www.mitienda.com.ar` lleva solo al principal.

## Paso 1 — Comprar el dominio

El dominio tiene que quedar **a nombre del comercio** (no de quien instala el sistema): es de ellos y se lo llevan si cambian de proveedor.

- **`.com.ar`** (recomendado para un local de Argentina): se compra en **nic.ar** con la **clave fiscal de AFIP**
  (nivel 2 o más) del titular, por *Trámites a Distancia*. Buscá el nombre → **Registrar dominio** → pagá (es anual).
- **`.com`**: en cualquier registrador (Cloudflare, Namecheap, GoDaddy, DonWeb…).
- Si el nombre está libre en los dos, conviene comprar ambos y usar uno como principal.

## Paso 2 — Agregarlo en el panel

1. **Integraciones → Dominio → 1. Tu dominio**: escribí `mitienda.com.ar` (sin https ni www) → **Agregar**.
2. Aparecen dos: `mitienda.com.ar` y `www.mitienda.com.ar`, cada uno con los **registros a cargar** (tipo, nombre y
   valor, con botón para copiar).

## Paso 3 — Cargar los registros

Los registros se cargan en la **zona DNS** del dominio, que no siempre está donde lo compraste. Tocá **Comprobar en
internet** en cada dominio: el sistema mira dónde está hoy, te muestra los pasos de ese proveedor y te dice, registro
por registro, si ya está bien. Los tres casos más comunes:

**A. Compraste un `.com.ar` en NIC.ar** (el caso más común)

NIC.ar **no deja cargar registros**: solo decide a qué servidores de nombres apunta el dominio («delegar»). Por eso
hace falta un servicio de DNS, y el más simple es **Cloudflare (gratis)**:

1. Creá una cuenta en **cloudflare.com** → **Add a site** → escribí tu dominio → plan **Free**.
2. Cloudflare te muestra **dos servidores de nombres** (por ejemplo `ana.ns.cloudflare.com` y `bob.ns.cloudflare.com`).
3. En NIC.ar → **Mis dominios** → tu dominio → **Delegar** → reemplazá los servidores por esos dos. Tarda de minutos a unas horas.
4. En Cloudflare → **DNS → Records → Add record**: cargá los registros del panel, uno por uno. En los de tipo A y CNAME
   dejá la nube en **gris («DNS only»)**: con la naranja (proxy) el certificado no se emite.

**B. Compraste el dominio en otro lugar** (GoDaddy, Namecheap, DonWeb, Hostinger, Wix…)

Entrá al panel de ese proveedor, buscá **DNS** / **Zona DNS** / **Administrar DNS** y cargá cada registro tal cual:

- **A**, nombre `@` → el valor que muestra el panel (suele ser `76.76.21.21`).
- **CNAME**, nombre `www` → el valor que muestra el panel (suele ser `cname.vercel-dns.com`).
- **TXT** (solo si aparece) → nombre y valor tal cual: sirve para demostrar que el dominio es tuyo.
- Si ya hay un registro del mismo tipo y nombre (los de «página en construcción» o parking), **cambialo**: no agregues otro al lado.

**C. El dominio ya lo usa otra cosa** (mails de la empresa, una página vieja)

**No cambies los servidores de nombres**: perderías el sitio o el correo que hoy funciona. Dejá todo como está y agregá solo
los registros del panel en la zona DNS donde están hoy.

Los cambios pueden tardar **de minutos a unas horas**. El panel se revisa solo cada 10 minutos; también podés tocar
**Revisar ahora**.

## Paso 4 — Usarlo como principal

Cuando `mitienda.com.ar` diga **«Listo (con https)»**, tocá **Usar como principal**. El sistema:
- pasa la tienda a la dirección nueva (la de Vercel sigue andando);
- actualiza Supabase: los mails de confirmación y el ingreso llevan al dominio nuevo;
- actualiza la dirección que usa Mercado Pago para avisar los pagos y volver a la tienda.

**A mano, una sola vez:** en Meta (WhatsApp) cambiá la URL del webhook por la nueva (Integraciones → WhatsApp → punto
1, botón copiar) y en Mercado Pago → Webhooks, la URL de notificaciones (Integraciones → Mercado Pago).

## Conexión técnica (la hace una vez quien instaló el sistema)

El dueño no necesita entrar a Vercel ni a Supabase. Quien instaló el sistema carga, una sola vez, en
**Integraciones → Dominio → Conexión técnica**:
- **Token de Vercel**: vercel.com → Account Settings → **Tokens** → Create, con alcance limitado al equipo del local.
  Además: el **nombre del proyecto** y el **equipo** (su id `team_…` o su slug).
- **Token de Supabase**: supabase.com → Account → **Access Tokens** → Generate. Y el **ref** del proyecto (lo que va
  antes de `.supabase.co`).

Quedan guardados en la base y nadie los puede volver a leer.

## Si algo falla

| qué pasa | qué revisar |
|---|---|
| «Ese dominio ya está usado en otro proyecto de Vercel» | Está conectado a otra cuenta: hay que quitarlo de ahí primero. |
| Hace horas que dice «Esperando los registros» | Que estén cargados exactamente como dice el panel (nombre `@` o `www`, sin el dominio repetido) y en la zona DNS que está activa (la del lugar al que delegaste). |
| «Comprobar en internet» dice que hoy el nombre apunta a otra dirección | Hay un registro viejo (de un hosting o de una página «en construcción»): cambialo por el del panel en vez de agregar otro. |
| El dominio «no responde en internet» | Si es un `.ar`: falta delegarlo en NIC.ar (Mis dominios → Delegar). Si no, revisá que esté activo y vigente. |
| El certificado (https) no se emite | Con Cloudflare, la nube de los registros A y CNAME tiene que estar en gris (DNS only). |
| «La conexión con el hosting no anda» | El token de Vercel venció o es de otra cuenta: generá uno nuevo y cargalo en Conexión técnica. |
| El mail de confirmación lleva a la dirección vieja | Pasa con los mails enviados antes del cambio. Si siguen así, revisá el token de Supabase y volvé a tocar «Usar como principal». |
