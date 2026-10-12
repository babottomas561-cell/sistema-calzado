// Qué versión del sistema está publicada en esta instalación. Las instalaciones de clientes se publican con
// `npm run instalaciones` y llevan la etiqueta (v2026.10.13); el piloto se despliega solo desde Git (main@abc1234).
export function versionSistema(): string {
  const etiqueta = process.env.NEXT_PUBLIC_VERSION;
  if (etiqueta) return etiqueta;
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  return sha ? `main@${sha.slice(0, 7)}` : "local";
}
