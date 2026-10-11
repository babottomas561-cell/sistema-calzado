import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Modelo clásico: cada página se arma al pedirla (todo depende del usuario logueado).
  // Ver CLAUDE.md antes de activar cacheComponents.
  cacheComponents: false,
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
