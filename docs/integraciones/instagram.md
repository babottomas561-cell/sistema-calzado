# Instagram, paso a paso

Para mostrar las **últimas publicaciones de tu Instagram** en la portada de la tienda, con un botón para que te sigan.
Se conecta con la API oficial de Meta y con tu propia cuenta. **No cuesta nada.**

> **Condición: tu Instagram tiene que ser una cuenta profesional** (Business o de Creador). Con una cuenta personal
> no se puede conectar: el panel lo detecta y te lo avisa. Pasarla a profesional es gratis y se hace en un minuto.
> No hace falta tener una página de Facebook.

## Antes de empezar

1. **Cuenta profesional.** En Instagram: Perfil → ☰ → *Configuración y actividad* → *Tipo de cuenta y herramientas* →
   *Cambiar a cuenta profesional* → elegí **Negocio** (Business) o **Creador**. Si ya lo es, ahí mismo lo ves.
2. **Cuenta pública.** Lo que mostramos es lo que cualquiera ve en tu perfil.
3. **Una app de Meta.** Si ya hiciste la de **WhatsApp**, usá esa misma: solo le sumás el producto Instagram.
   Si no tenés ninguna, creala en el paso 1.

## Paso 1 — La app de Meta

1. Entrá a **developers.facebook.com** con tu cuenta de Facebook → **Mis apps**.
2. Si todavía no tenés una: **Crear app** → tipo **Empresa (Business)**. Si ya tenés la de WhatsApp, abrila.
3. En el menú de la izquierda buscá **Instagram** (si no está: *Agregar productos* → **Instagram** → *Configurar*).

## Paso 2 — Generar el token

1. Dentro de la app: **Instagram → API setup with Instagram business login** (la configuración de la API con inicio de
   sesión de Instagram).
2. En «Generate access tokens» aparece tu cuenta de Instagram. Si no aparece, tocá **Add account** (agregar cuenta) e ingresá
   con tu usuario de Instagram; el nombre exacto del botón puede variar un poco.
3. Tocá **Generate token** al lado de tu cuenta, iniciá sesión en Instagram si te lo pide y aceptá.
4. **Copiá el token**: es una cadena larga que empieza con `IGAA…`. Dura 60 días y el sistema lo renueva solo.

> No hace falta mandar la app a revisión de Meta: para mostrar las fotos de tu propia cuenta alcanza con el acceso estándar.

## Paso 3 — Pegarlo en el panel

1. **Integraciones → Instagram → Token de Instagram**: pegá el token y tocá **Conectar Instagram**.
2. Si todo está bien, dice *Instagram conectado: @tucuenta* y copia tus últimas publicaciones.
   - **«La cuenta … no es profesional»**: pasala a Business o Creador (ver arriba) y generá el token de nuevo.
   - **«El token no es válido o venció»**: generá uno nuevo y pegalo completo, sin espacios.
3. El token queda guardado en la base y **nadie puede volver a leerlo**, ni siquiera desde el panel.

## Paso 4 — Mostrarlas en la portada

1. **Tienda online → Agregar sección → Instagram**.
2. **Editar**: elegí cuántas publicaciones (4, 6, 8 o 12), el título y el texto del botón.
   Si dejás vacío **«Lleva a»**, el botón va a tu Instagram.
3. Con las flechas la subís o bajás; con el ojo la ocultás sin borrarla.

## Lo que pasa solo

- **Cada 3 horas** se copian tus últimas publicaciones. Si publicás algo y querés verlo ya: **Integraciones → Instagram →
  Actualizar ahora**.
- **El token se renueva solo** antes de vencer. Si alguna vez no se puede (por ejemplo, si cambiaste la contraseña de
  Instagram o le sacaste el acceso a la app), el panel te avisa: generá un token nuevo (pasos 2 y 3).
- Si borrás una publicación en Instagram, deja de verse en la tienda en la próxima actualización.

## Preguntas

- **¿Puedo esconder una foto?** Sí: en *Integraciones → Instagram → Publicaciones copiadas*, con el ojo. Sigue en tu
  Instagram; solo deja de verse en la tienda.
- **¿Se muestran las historias?** No, solo las publicaciones y los reels (con su miniatura).
- **¿Es lo mismo que la conexión de WhatsApp?** Se parece (las dos son de Meta, se generan en el mismo sitio y se pegan en
  el panel), pero son conexiones distintas con su propio token. Pueden convivir en la misma app de Meta.
- **¿Si una foto no carga?** Los links de las fotos de Instagram duran pocos días; por eso se refrescan cada 3 horas.
  Tocá *Actualizar ahora*.
