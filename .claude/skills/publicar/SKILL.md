---
name: publicar
description: Llevar el sistema (o un cambio) de la compu a producción - Supabase en la nube y Vercel. Usar al publicar por primera vez o al subir un cambio de base de datos.
---

# Publicar

## Antes de publicar cualquier cambio

```bash
npm run revisar
```
```bash
npm run db:reset
```
Las dos tienen que pasar limpias.

## Primera vez

Seguí el README, sección 2: proyecto en Supabase → `npx supabase link` → `npx supabase db push`
→ repo en GitHub → proyecto en Vercel con `NEXT_PUBLIC_SUPABASE_URL` y
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` → *Site URL* en Supabase Auth → marcar el usuario dueño como
`staff`.

## Un cambio de base de datos

1. Va en una migración **nueva** (skill `cambiar-base-de-datos`).
2. Ver qué falta aplicar y aplicarlo:
   ```bash
   npx supabase migration list
   ```
   ```bash
   npx supabase db push
   ```
3. Recién después, subir el código (push a GitHub → Vercel publica solo). Al revés, la app nueva
   buscaría columnas que todavía no existen.

## Nunca

- Subir `.env.local` ni poner claves en el código. La app usa solo la *publishable key*; la
  `service_role` **no** va en Vercel.
- Correr `supabase/seed.sql` en producción (son datos de prueba, con usuarios de contraseña conocida).
- `npx supabase db reset --linked`: borra la base de producción.
