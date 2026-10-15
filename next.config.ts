import type { NextConfig } from "next";

// Un ERP es casi todo dinámico (depende del usuario), así que no usamos Cache Components.
const nextConfig: NextConfig = {
  // pdfkit lee sus fuentes desde node_modules en tiempo de ejecución; no debe empaquetarse.
  serverExternalPackages: ["pdfkit"],
  // Incluir esas fuentes en el despliegue (Vercel solo copia lo que detecta como usado).
  outputFileTracingIncludes: {
    "/**": ["./node_modules/pdfkit/js/data/**"],
  },
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
