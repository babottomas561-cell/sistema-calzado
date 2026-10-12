import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Modelo clásico: cada página se arma al pedirla (todo depende del usuario logueado).
  // Ver CLAUDE.md antes de activar cacheComponents.
  cacheComponents: false,
  // La guía de integraciones se lee de docs/ al abrirla: que el archivo viaje con el deploy
  outputFileTracingIncludes: { "/admin/integraciones/guia": ["./docs/WHATSAPP.md"] },
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
