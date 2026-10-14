# Instalaciones: un sistema, varios clientes

Cada local tiene **su propia instalación**: su base en Supabase (sus datos, aislados de los demás) y su sitio en
Vercel. Todas corren **el mismo código**: no hay copias del repositorio por cliente (CLAUDE.md, regla 18). Lo que
cambia entre clientes es la **configuración** (nombre, logo, color, medios de pago, dominio…), que el dueño
edita desde su panel.

```
            GitHub (este repositorio)
   main ──► piloto (mi-calzado)        se despliega solo; acá se prueba todo
   v2026.10.13 ──► cliente A, cliente B …   se llevan a mano, con un comando, cuando el piloto la aprobó
```

## Conceptos

| | |
|---|---|
| **Versión** | Una etiqueta de Git: `v2026.10.13` (o `-2` si hay más de una el mismo día). Es un punto exacto del código y de las migraciones. |
| **Piloto** | La instalación que usa `main`: cada push se publica solo. Sirve para probar antes de tocar a los clientes. |
| **Cliente** | Una instalación «manual»: solo cambia cuando vos la actualizás a una versión. Puede quedar atrás un tiempo. |
| **Ficha** | `instalaciones/<slug>.json`: qué versión tiene, su proyecto de Supabase y de Vercel. **Sin secretos.** |

## Lo que necesitás (una vez)

- **Supabase** (supabase.com): una organización y un token personal (*Account → Access Tokens*) → `SUPABASE_ACCESS_TOKEN`.
  El ID de la organización → `SUPABASE_ORG_ID` (o `--org`).
- **Vercel** (vercel.com): un equipo y un token (*Account Settings → Tokens*, con alcance al equipo) → `VERCEL_TOKEN`.
  El nombre del equipo → `VERCEL_SCOPE` (o `--equipo`).
- El repositorio conectado a GitHub y las CLI de Supabase, Vercel y Git funcionando en tu compu.

Cargá los tokens en la terminal **sin dejarlos escritos en ningún archivo**:

```bash
read -s SUPABASE_ACCESS_TOKEN; export SUPABASE_ACCESS_TOKEN
```
```bash
read -s VERCEL_TOKEN; export VERCEL_TOKEN
```

## Costos (que conviene tener claros antes del primer cliente)

- **Supabase**: el plan gratuito permite 2 proyectos activos por organización y **pausa los proyectos con poca actividad**; no
  tiene copias de seguridad. Un cliente real necesita el plan **Pro** (cada proyecto adicional suma un costo mensual de
  cómputo). Es el costo principal por cliente.
- **Vercel**: el plan Hobby es de **uso personal, no comercial**. Dar el sistema como servicio a otros comercios pide el plan **Pro**.
- **Dominio**: lo paga el cliente (queda a su nombre) y **Resend** para los mails (hay plan gratis suficiente para un local).

## Dar de alta un cliente

1. **Probá la versión en el piloto** y etiquetala:
   ```bash
   npm run instalaciones -- etiquetar
   ```
   Corre los chequeos, crea `vAAAA.MM.DD` y la sube a GitHub (pide confirmación).
2. **Simulacro** (no crea nada, muestra todo lo que haría):
   ```bash
   npm run instalaciones -- alta --slug mi-local --nombre "Mi Local" --email dueno@correo.com --dry-run
   ```
3. **De verdad** (pide confirmar el costo):
   ```bash
   npm run instalaciones -- alta --slug mi-local --nombre "Mi Local" --email dueno@correo.com
   ```
   El script: crea el proyecto de Supabase → espera que esté listo → aplica **todas las migraciones** → crea el sitio en
   Vercel con sus variables → lo publica → configura la dirección de ingreso → deja al dueño como **Administrador** (con una
   clave que se muestra **una sola vez**) → guarda la ficha.
   Con `--sin-conexion-tecnica` no carga tus tokens en la base del cliente (ver «Seguridad»).
4. **Entregale al dueño** la dirección, su email y la clave. Que la cambie en el panel (*Cambiar contraseña*, abajo del menú).
5. **Commiteá la ficha**: `git add instalaciones/mi-local.json`.
6. **Checklist del cliente** (cada uno desde su panel, sin tocar Vercel ni Supabase):

   - [ ] Integraciones → **Correo**: conectar Resend (sin esto los clientes de la tienda no reciben el mail de confirmación).
   - [ ] Tienda online → **Legales**: datos del comercio y publicar términos y privacidad (con revisión de un abogado).
   - [ ] Tienda online → **Identidad**: logo y color.
   - [ ] Integraciones → **Dominio**: su dominio propio (manual en `docs/integraciones/dominio.md`).
   - [ ] Tablas: medios de pago, rubros, marcas, talles. Productos y stock.
   - [ ] Opcional: WhatsApp, Instagram, Mercado Pago, envíos.

## Actualizar un cliente

```bash
npm run instalaciones -- actualizar --slug mi-local --version v2026.10.20
```

Muestra las migraciones pendientes, pide confirmación, las aplica y publica el código de esa versión. **Orden fijo: primero
la base, después el código** (al revés, la app nueva buscaría columnas que no existen).

- **Volver atrás**: `actualizar --version <la anterior>`. Vuelve el código; **las migraciones no se deshacen**. Por eso
  cada migración tiene que dejar andando al código de la versión anterior (agregar, no sacar ni renombrar de golpe).
- **Piloto primero, siempre**: una versión llega a los clientes después de verificarla en el piloto, y de a uno.
- `npm run instalaciones -- estado` muestra, por instalación, si el sitio responde y qué migraciones le faltan.
  El panel de cada una muestra su versión abajo del menú.

## Seguridad: los tokens viven en la base de cada cliente

Para que el dueño pueda configurar su **dominio**, su **correo** y sus **cuentas** sin entrar a Vercel ni a Supabase, el alta
guarda tus tokens en la tabla `integraciones` de su base (regla 16: **nadie puede leerlos**, ni siquiera el dueño; solo los
usan funciones de la base). Es la decisión de «una instalación por cliente». El costo: si alguna vez una base se vulnerara, esos
tokens darían acceso a tus cuentas de Supabase y Vercel (que abarcan a todos tus clientes).

Cómo se reduce:
- Un token de Vercel **con alcance al equipo** (no de toda tu cuenta) y rotarlos cada tanto.
- `--sin-conexion-tecnica` para un cliente: entonces el dominio y el correo los cargás vos desde acá.
- La solución de fondo es una **plataforma central** que guarde los tokens afuera de las bases de los clientes. Está pensada
  para después de validar el producto (regla 18).

## Si algo falla

| qué pasa | qué hacer |
|---|---|
| El alta se corta | La ficha queda en `estado: "en_alta"` con lo que ya se creó (proyecto de Supabase / de Vercel). Revisá esos paneles y borrá lo que sobre antes de repetir. |
| «La base no se activó a tiempo» | Supabase a veces tarda: mirá el proyecto en supabase.com y, cuando esté activo, completá a mano desde el paso de migraciones. |
| «Falló al aplicar las migraciones» | Corré `npx supabase db push --dry-run` en una copia del código de esa versión para ver cuál falla. |
| Vercel no deja crear más proyectos | El plan Hobby tiene tope y es de uso personal: hace falta Pro. |


## Cargar la conexión técnica en una instalación que ya existe

El alta la carga sola. Para el piloto (que se hizo antes) o si hay que cambiar un token:

```bash
read -s SUPABASE_ACCESS_TOKEN; export SUPABASE_ACCESS_TOKEN    # supabase.com → Account → Access Tokens
read -s VERCEL_TOKEN; export VERCEL_TOKEN                      # vercel.com → Account Settings → Tokens (con alcance al equipo)
npm run instalaciones -- conexion --slug mi-calzado
```

Comprueba que los dos tokens sirvan para ese proyecto antes de guardarlos, y no los muestra. Con la conexión cargada, el panel puede conectar el dominio
(Integraciones → Dominio) y aplicarle a Supabase el correo (Integraciones → Correo → «Guardar y aplicar»).

El dueño **no ve** esta conexión en su panel (se sacó el formulario de Integraciones → Dominio): se carga siempre con `alta` o con `conexion`.
