// Dónde está el dominio y cómo cargar los registros ahí. Lo usa el diagnóstico de Integraciones → Dominio.
// Es solo contenido (sin código de servidor): se detecta el proveedor por sus servidores de nombres (NS) y se muestran
// los pasos de ese proveedor. Los menús de cada proveedor cambian de vez en cuando: los pasos dicen qué buscar, no
// dónde hacer clic al píxel.

export type Guia = { id: string; nombre: string; pasos: string[]; avisos?: string[] };

// Qué trae cada proveedor en sus servidores de nombres (en minúscula)
const PATRONES: [string, RegExp][] = [
  ["cloudflare", /\.ns\.cloudflare\.com$/],
  ["godaddy", /\.domaincontrol\.com$/],
  ["namecheap", /\.registrar-servers\.com$/],
  ["hostinger", /(dns-parking\.com|\.hostinger\.)/],
  ["donweb", /donweb/],
  ["wix", /\.wixdns\.net$/],
  ["squarespace", /(squarespacedns\.com|googledomains\.com)$/],
  ["vercel", /\.vercel-dns\.com$/],
  ["route53", /awsdns-/],
  ["ovh", /\.ovh\.net$/],
  ["ionos", /\.ui-dns\.(com|de|org|biz)$/],
];

export function detectarProveedor(nameservers: string[]): string | null {
  const ns = nameservers.map((n) => n.toLowerCase().replace(/\.$/, ""));
  for (const [id, re] of PATRONES) if (ns.some((n) => re.test(n))) return id;
  return null;
}

const REGLA_REGISTROS = [
  "Cargá cada registro tal cual lo muestra el panel: el tipo (A, CNAME, TXT), el nombre y el valor.",
  "Si ya hay un registro del mismo tipo y nombre, **cambialo** en vez de agregar otro.",
];

export const GUIAS: Record<string, Guia> = {
  nic: {
    id: "nic", nombre: "NIC.ar (dominio .ar sin servidores propios)",
    pasos: [
      "NIC.ar **no permite cargar registros**: solo decide qué servidores de nombres usa el dominio (se llama «delegar»). Los registros se cargan en el servicio que elijas como servidor de nombres.",
      "**Opción recomendada, gratis: Cloudflare.** Creá una cuenta en cloudflare.com → «Add a site» → escribí tu dominio → plan **Free**. Cloudflare te muestra dos servidores de nombres (por ejemplo `ana.ns.cloudflare.com`).",
      "En NIC.ar (con tu clave fiscal, por Trámites a Distancia) → Mis dominios → tu dominio → **Delegar** → reemplazá los servidores por los dos de Cloudflare. Puede tardar de minutos a unas horas.",
      "Ya en Cloudflare → DNS → Records → **Add record** y cargá los registros de la tabla. En cada uno dejá la nube en gris («**DNS only**», sin proxy).",
      "Volvé acá y tocá **Comprobar en internet**.",
    ],
    avisos: ["Si tu dominio ya lo usa un hosting o un servicio de mails, **no cambies los servidores** sin copiar antes esos registros: perdés el sitio o el correo."],
  },
  cloudflare: {
    id: "cloudflare", nombre: "Cloudflare",
    pasos: [
      "Entrá a dash.cloudflare.com → tu dominio → **DNS → Records**.",
      ...REGLA_REGISTROS,
      "Tocá **Add record**: elegí el tipo, escribí el nombre (`@` para el dominio solo, `www`, `_vercel`…) y pegá el valor.",
      "En los registros A y CNAME dejá la nube en gris (**DNS only**). Con la nube naranja (proxy) el certificado y la verificación fallan.",
    ],
  },
  godaddy: {
    id: "godaddy", nombre: "GoDaddy",
    pasos: [
      "Entrá a godaddy.com → Mis productos → tu dominio → **DNS** (Administrar zona DNS).",
      ...REGLA_REGISTROS,
      "GoDaddy trae un registro **A «@» con valor «Parked»** (o una IP de GoDaddy) y un **CNAME «www»**: editalos para que digan lo del panel, no agregues uno nuevo al lado.",
      "Si el dominio tiene «reenvío» (forwarding) configurado, sacalo: pisa los registros.",
    ],
  },
  namecheap: {
    id: "namecheap", nombre: "Namecheap",
    pasos: [
      "Entrá a namecheap.com → Domain List → tu dominio → **Manage → Advanced DNS**.",
      ...REGLA_REGISTROS,
      "Borrá el **URL Redirect** y el **CNAME «www» → parkingpage.namecheap.com** que vienen de fábrica, y cargá los del panel con **Add New Record**.",
    ],
  },
  hostinger: {
    id: "hostinger", nombre: "Hostinger",
    pasos: [
      "Entrá a hpanel.hostinger.com → **Dominios** → tu dominio → **DNS / Servidores de nombres**.",
      ...REGLA_REGISTROS,
      "Borrá los registros A y CNAME que apuntan a Hostinger (parking) del mismo nombre antes de cargar los del panel.",
    ],
  },
  donweb: {
    id: "donweb", nombre: "DonWeb",
    pasos: [
      "Entrá al panel de DonWeb → **Dominios** → tu dominio → **Zona DNS** (administrar registros).",
      ...REGLA_REGISTROS,
      "Si el dominio apunta a un hosting de DonWeb, hay un registro A del mismo nombre: reemplazalo por el del panel.",
    ],
  },
  wix: {
    id: "wix", nombre: "Wix",
    pasos: [
      "Entrá a Wix → **Dominios** → tu dominio → **Administrar registros DNS (Advanced)**.",
      ...REGLA_REGISTROS,
      "Wix trae registros A y CNAME que apuntan a Wix: reemplazalos por los del panel.",
    ],
  },
  squarespace: {
    id: "squarespace", nombre: "Squarespace Domains (antes Google Domains)",
    pasos: [
      "Entrá a domains.squarespace.com → tu dominio → **DNS → Custom records**.",
      ...REGLA_REGISTROS,
    ],
  },
  vercel: {
    id: "vercel", nombre: "Servidores de nombres de Vercel",
    pasos: [
      "El dominio ya usa los servidores de nombres de Vercel: no hay nada que cargar, los registros se crean solos.",
      "Si el panel todavía dice «Falta apuntarlo», avisá a quien instaló el sistema: el dominio tiene que estar dado de alta en esa cuenta.",
    ],
  },
  route53: {
    id: "route53", nombre: "Amazon Route 53",
    pasos: ["En la consola de AWS → Route 53 → **Hosted zones** → tu dominio → **Create record**.", ...REGLA_REGISTROS],
  },
  ovh: {
    id: "ovh", nombre: "OVH",
    pasos: ["Entrá a OVH → Nombres de dominio → tu dominio → pestaña **Zona DNS** → **Añadir un registro**.", ...REGLA_REGISTROS],
  },
  ionos: {
    id: "ionos", nombre: "IONOS",
    pasos: ["Entrá a IONOS → Dominios y SSL → tu dominio → **DNS** → **Añadir registro**.", ...REGLA_REGISTROS],
  },
  otro: {
    id: "otro", nombre: "Tu proveedor de dominio",
    pasos: [
      "Entrá al panel del lugar donde compraste el dominio o donde lo administrás, y buscá **DNS**, **Zona DNS** o **Administrar DNS**.",
      ...REGLA_REGISTROS,
      "Algunos paneles piden el nombre completo (`www.mitienda.com.ar`) y otros solo la parte de adelante (`www`); en el dominio solo se usa `@` o se deja vacío.",
      "Si hay registros viejos del mismo tipo y nombre (de un hosting o de una página «en construcción»), borralos o cambialos.",
    ],
  },
};

export const guiaDe = (id: string | null) => GUIAS[id ?? ""] ?? GUIAS.otro;

// «_vercel.mitienda.com.ar» → «_vercel» (casi todos los paneles piden solo la parte de adelante); el dominio solo es «@»
export function nombreCorto(nombre: string, dominio: string): string {
  const apex = dominio.toLowerCase().replace(/^www\./, "");
  const n = nombre.toLowerCase().replace(/\.$/, "");
  if (n === "@" || n === "" || n === apex) return "@";
  return n.endsWith(`.${apex}`) ? n.slice(0, -(apex.length + 1)) : n;
}
