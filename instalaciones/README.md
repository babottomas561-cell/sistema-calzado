# Instalaciones

Una ficha por cliente (`<slug>.json`) con lo que hace falta saber para mantenerlo: su versión, su proyecto de Supabase y su
sitio en Vercel. **Acá no va ningún secreto** (ni tokens, ni claves, ni contraseñas).

- Las crea `npm run instalaciones -- alta …` y las actualiza `npm run instalaciones -- actualizar …`.
- `canal: "main"` es el piloto (se despliega solo desde Git); `"manual"`, los clientes (solo cambian cuando se los actualiza).
- **No se suben al repo** (están en el `.gitignore`, porque el repo es público): quedan solo en esta compu. Hacé copia de respaldo de esta carpeta.
- Cómo se usa todo esto: [docs/INSTALACIONES.md](../docs/INSTALACIONES.md).
