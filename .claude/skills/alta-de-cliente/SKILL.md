---
name: alta-de-cliente
description: Dar de alta a un cliente nuevo (su base en Supabase + su sitio en Vercel con el mismo código), actualizarlo a una versión o ver cómo está cada instalación. Usar cuando el usuario quiera sumar un local, actualizar a un cliente o preguntar en qué versión está cada uno.
---

# Alta y actualización de clientes

Cada cliente = **una instalación propia** (su Supabase y su Vercel) con **el mismo código**, identificado por una versión
(etiqueta de Git). **Nunca** crees una copia del repositorio para un cliente (CLAUDE.md, regla 18). El manual completo, con
costos y seguridad, está en [docs/INSTALACIONES.md](../../../docs/INSTALACIONES.md): leelo antes de empezar.

Todo se hace con `npm run instalaciones -- <comando>` (script `scripts/instalaciones.mjs`).

## Antes de tocar nada

1. **Pedí permiso explícito** para crear cosas en las cuentas del usuario: un alta crea un proyecto de Supabase (puede
   tener costo) y uno de Vercel. Decile qué se va a crear y cuánto puede costar (ver «Costos» del manual).
2. Verificá que estén `SUPABASE_ACCESS_TOKEN` y `VERCEL_TOKEN` en el entorno. **No se los pidas por chat ni los escribas en
   ningún archivo**: que los cargue él con `read -s` (comandos en el manual). Si los pega en el chat, no los repitas.
3. **Probá primero con `--dry-run`**: muestra lo que haría sin crear nada.
4. El piloto (`canal: "main"`) no se actualiza con este script: se publica con la skill `publicar`.

## Alta

```bash
npm run instalaciones -- etiquetar                  # si todavía no hay una versión aprobada en el piloto
npm run instalaciones -- alta --slug SLUG --nombre "Nombre del local" --email dueno@correo.com --dry-run
npm run instalaciones -- alta --slug SLUG --nombre "Nombre del local" --email dueno@correo.com
```

- `etiquetar` exige árbol limpio y que lo local esté subido (`origin/main`): una versión es un punto exacto del código.
- El alta imprime **una sola vez** la clave del dueño: pasásela al usuario en el chat y no la guardes en archivos ni en la memoria.
- Después del alta: commitear `instalaciones/SLUG.json` y recorrer el checklist del manual (correo, legales, identidad, dominio…).
- Si se corta, la ficha queda como `en_alta` con lo ya creado: revisá Supabase y Vercel antes de repetir, no crees un segundo proyecto.

## Actualizar o volver atrás

```bash
npm run instalaciones -- actualizar --slug SLUG --version vAAAA.MM.DD --dry-run
npm run instalaciones -- actualizar --slug SLUG --version vAAAA.MM.DD
```

Primero la base (migraciones) y después el código. Volver a una versión vieja deja el código viejo con la base nueva: solo
anda si las migraciones fueron compatibles hacia atrás. **Siempre piloto primero y de a un cliente.**

## Ver el estado

```bash
npm run instalaciones -- lista      # las fichas
npm run instalaciones -- estado     # sitio, migraciones que faltan, versión
```

## Nunca

- Imprimir, pegar en el chat o guardar tokens, claves de la base o la `service_role`. (Ojo: `supabase projects api-keys`
  **imprime la `service_role` heredada** sin enmascararla: no lo corras a la vista.)
- Correr `seed.sql` en una instalación real.
- Editar a mano la base de un cliente: todo cambio va en una migración (skill `cambiar-base-de-datos`) y se lleva con una versión.
