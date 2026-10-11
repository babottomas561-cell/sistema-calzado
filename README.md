# Mi Calzado — gestión + tienda online

Sistema para un negocio de calzado, pensado para usar **desde el celular**:

- **Panel** (`/admin`): vender en el local (con descuentos/recargos por medio de pago), cargar
  facturas de compra por curva, stock por talle y color, pedidos, clientes (CRM) y seguimientos,
  proveedores con su lista de precios, y las tablas (rubros, marcas, talles, colores, medios de pago).
- **Tienda** (`/`): catálogo, registro de clientes, carrito, pedidos y seguimiento del pedido.

Hecho con Next.js + Supabase (base de datos Postgres con usuarios) y publicado en Vercel.
Todo gratis para empezar.

> Si trabajás con una IA (Claude Code, Cursor, Gemini, Codex…), pedile que lea **`CLAUDE.md`**
> (o `AGENTS.md`) antes de tocar nada: ahí están las reglas del sistema.

---

## 1. Probarlo en tu compu

Necesitás [Node.js 20+](https://nodejs.org) y [Docker Desktop](https://www.docker.com/products/docker-desktop/) abierto.

```bash
npm install
```

```bash
npm run db:start
```

La primera vez tarda unos minutos. Al terminar muestra la `API URL` y la `Publishable key`:
copiá `.env.example` como `.env.local` y pegalas ahí. Después:

```bash
npm run db:reset
```

```bash
npm run dev
```

Abrí http://localhost:3000. Usuarios de prueba (solo existen en tu compu):

| usuario | contraseña | entra a |
|---|---|---|
| `admin@demo.local` | `demo1234` | el panel (`/admin`) |
| `cliente@demo.local` | `demo1234` | la tienda como cliente |

## 2. Publicarlo (Supabase + Vercel)

**Base de datos — [supabase.com](https://supabase.com)**

1. Creá un proyecto (región São Paulo). Guardá la contraseña de la base en un lugar seguro.
2. Subí la estructura de la base (las tablas, no los datos de prueba):
   ```bash
   npx supabase login
   ```
   ```bash
   npx supabase link --project-ref TU-PROJECT-REF
   ```
   ```bash
   npx supabase db push
   ```
3. En **Authentication → URL Configuration** poné como *Site URL* la dirección que te dé Vercel
   (paso siguiente), para que los mails de confirmación lleven a tu tienda.

**Sitio — [vercel.com](https://vercel.com)**

1. Subí esta carpeta a un repositorio de GitHub e importalo en Vercel.
2. En *Environment Variables* cargá `NEXT_PUBLIC_SUPABASE_URL` y
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Supabase → Project Settings → API Keys).
3. *Deploy*.

**Tu usuario de administrador**

1. Registrate en tu tienda (`/registro`) con tu email.
2. En Supabase → *SQL Editor*, ejecutá (con tu email):
   ```sql
   update perfiles set rol = 'staff'
   where id = (select id from auth.users where email = 'tu@email.com');
   delete from clientes where usuario_id = (select id from auth.users where email = 'tu@email.com');
   ```
3. Volvé a ingresar: ya entrás al panel.

**Primeros pasos en el panel**

1. **Tablas**: revisá los medios de pago (vienen sin descuentos: poné los tuyos, por ejemplo
   efectivo −10 %), y cargá tus rubros, marcas, colores y talles.
2. **Proveedores**: dá de alta a quienes te venden.
3. **Compras → Cargar factura de compra**: cargá tu primera factura (el stock sale de ahí). Si un
   modelo no existe, lo creás desde la misma pantalla.
4. **Productos**: subí las fotos (desde el celular podés sacarlas en el momento; la de la estrella es
   la principal), completá descripción y precio de venta, y tildá *Publicado en la tienda*.

## 3. Cómo está hecho

- [docs/MODELO.md](docs/MODELO.md) — las tablas, cómo se relacionan y por qué.
- [CLAUDE.md](CLAUDE.md) — reglas para trabajar en el código (para vos y para la IA).
- `supabase/migrations/` — la base de datos completa, en SQL.

```bash
npm run revisar
```

Corre los chequeos de tipos, el lint y el build; tiene que pasar antes de publicar un cambio.
