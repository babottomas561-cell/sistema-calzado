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
- [ ] `alter table … enable row level security;` + al menos la política del equipo:
      `create policy "equipo" on public.X for all to authenticated using (es_staff()) with check (es_staff());`
      Si la ve un cliente o el público, una política aparte y lo más acotada posible.
- [ ] Textos que van a un desplegable: índice único sobre `lower(nombre)`.

## Funciones

- Si mueven stock o dinero: `security invoker`, chequean `es_staff()` al principio, validan todo
  y lanzan errores en castellano (`raise exception 'Stock insuficiente…'`): la app los muestra tal cual.
- `security definer` solo si un cliente necesita hacer algo que no puede hacer directo (como
  `crear_pedido`), y entonces valida `auth.uid()` y **no confía en precios que mande el navegador**.
- `grant execute on function … to authenticated;` (por defecto está revocado a todos).

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
