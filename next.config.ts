import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Modelo clásico: cada página se arma al pedirla (todo depende del usuario logueado).
  // Ver CLAUDE.md antes de activar cacheComponents.
  cacheComponents: false,
  // pdfkit lee sus fuentes de su propia carpeta: que no se empaquete adentro del código
  serverExternalPackages: ["pdfkit"],
  // Los manuales de las integraciones se leen de docs/integraciones/ al abrir cada pantalla: que el archivo viaje con el deploy
  outputFileTracingIncludes: { "/admin/integraciones/*": ["./docs/integraciones/*.md"] },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
