---
name: agregar-pantalla
description: Agregar una pantalla nueva al panel (/admin) o a la tienda, siguiendo el patrón de la casa (página de servidor que lee, componente cliente que interactúa, Server Action que escribe).
---

# Agregar una pantalla

## El patrón

```
app/admin/cosa/
  page.tsx       servidor: lee con crearCliente() y pasa datos al componente
  Formulario.tsx "use client": estado, useActionState(accion, {})
  acciones.ts    "use server": valida, escribe (o llama a una función de la base), revalidatePath
```

1. **Leer la doc de Next de esta versión** antes de usar una API: `node_modules/next/dist/docs/`.
   `params` y `searchParams` son Promises (`const { id } = await params`).
2. **Leer** en `page.tsx` con `const supabase = await crearCliente()` (de `@/lib/supabase/server`).
   Pedí columnas explícitas, no `*`, y usá los tipos generados (`lib/database.types.ts`).
3. **Escribir** en una Server Action que devuelva `{ error?: string; ok?: string }`.
   Si toca stock o plata, **llamá a la función de la base** (`supabase.rpc("registrar_venta", { p_… })`),
   no hagas `insert`/`update` sueltos.
4. Mostrá el error tal cual viene (la base ya los manda en castellano).
5. Si es del panel, agregala al menú en `components/Menu.tsx` (grupo que corresponda, ícono de
   `lucide-react`).

## Estilo

- Clases de `app/globals.css`: `tarjeta`, `boton`, `boton-sec`, `campo`, `etiqueta`, `tabla`, `chip`.
- **Íconos de `lucide-react`, nunca emojis.** Tamaño 15-18.
- Para volver: `<Volver href="/admin/cosa">Cosas</Volver>`.
- Importes con `pesos()`, porcentajes con `porcentaje()`, fechas con `fecha()` / `fechaHora()`.
- Pensado para celular primero: grillas `sm:` / `lg:`, nada que dependa del hover.
- Lo que sea una tabla (marca, talle, color, medio de pago…) se **elige de un desplegable**, no se escribe.

## Probar

```bash
npm run revisar
```

Abrila en el navegador como equipo (`admin@demo.local`) y, si la ve el público, como cliente
(`cliente@demo.local`) y sin sesión.
