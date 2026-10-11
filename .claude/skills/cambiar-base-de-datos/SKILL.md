---
name: cambiar-base-de-datos
description: Cambiar el esquema de la base (tabla, columna, función, vista o política nueva) sin romper la seguridad, el stock ni los tipos. Usar siempre que haya que tocar supabase/migrations.
---

# Cambiar la base de datos

## Antes de escribir SQL

1. Leé [docs/MODELO.md](../../../docs/MODELO.md) y la migración inicial: puede que lo que buscás ya exista.
2. **Nunca edites una migración que ya se aplicó en producción.** Creá una nueva:
   ```bash
   npx supabase migration new nombre_corto_del_cambio
   ```

## Checklist de una tabla nueva

- [ ] `id bigint generated always as identity primary key` (nunca un id escrito a mano).
- [ ] Si la gente la va a buscar: `codigo text not null unique check (codigo = upper(codigo))` y el
      trigger `_completar_codigo()` para que se genere solo.
- [ ] FKs con nombre `<tabla_en_singular>_id`, **política de borrado explícita** (`restrict` si
      tiene historia, `cascade` solo si es parte de otra fila) y **un índice por FK**.
- [ ] `alter table … enable row level security;` + políticas **por permiso** (no "el equipo hace todo"):
      `create policy "ve X" on public.X for select to authenticated using (tiene_permiso('…'));`
      `create policy "edita X" on public.X for all to authenticated using (tiene_permiso('…')) with check (tiene_permiso('…'));`
      Si hace falta un permiso nuevo: insertalo en `permisos` (el Administrador lo tiene solo; a los demás
      roles se lo da quien administra el equipo). Si la tabla tiene **costos**, la lectura va con `costos.ver`.
      Si la ve un cliente o el público, una política aparte y lo más acotada posible.
- [ ] Textos que van a un desplegable: índice único sobre `lower(nombre)`.

## Funciones

- Si mueven stock o dinero: `security definer` (las tablas de la operación no tienen políticas de escritura),
  chequean `tiene_permiso('…')` al principio, validan todo
  y lanzan errores en castellano (`raise exception 'Stock insuficiente…'`): la app los muestra tal cual.
- Si la usa un cliente de la tienda (como `crear_pedido`): valida `auth.uid()` y **no confía en
  precios que mande el navegador**.
- Una función nueva nace ejecutable por **cualquiera** (también anon): siempre
  `revoke execute on function … from public, anon;` y `grant execute … to authenticated;`.
  Las internas (`_algo`), revocadas también a `authenticated`.

## Después

```bash
npm run db:reset
```
```bash
npm run db:tipos
```
```bash
npm run revisar
```

Y probá con SQL, dentro de una transacción que termine en `rollback`, como equipo y como cliente:

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);  -- cliente de prueba
select count(*) from la_tabla_nueva;   -- ¿ve lo que tiene que ver y nada más?
rollback;
```

Si tocaste stock, la consulta de consistencia de `CLAUDE.md` tiene que dar 0 filas.
