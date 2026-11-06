import type { NextConfig } from "next";

// SEG-18: cabeceras de seguridad para todas las páginas. La política de contenido (CSP) solo
// permite cargar código, estilos e imágenes de Convive mismo; nadie puede mostrar Convive dentro
// de otra página (protege de clics engañosos). Next.js necesita 'unsafe-inline' sin nonces.
const desarrollo = process.env.NODE_ENV === "development";
// La barra de comentarios de Vercel solo aparece en las vistas previas (Preview).
const vistaPrevia = process.env.VERCEL_ENV === "preview";
const vercelLive = vistaPrevia ? " https://vercel.live" : "";

const politicaContenido = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${desarrollo ? " 'unsafe-eval'" : ""}${vercelLive}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' blob: data:${vistaPrevia ? " https://vercel.live https://vercel.com" : ""}`,
  `font-src 'self' data:${vercelLive}`,
  `connect-src 'self'${vistaPrevia ? " https://vercel.live wss://ws-us3.pusher.com" : ""}`,
  `frame-src 'self'${vercelLive}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(desarrollo ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const cabecerasSeguridad = [
  { key: "Content-Security-Policy", value: politicaContenido },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Convive no usa cámara, micrófono ni ubicación.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

// Un ERP es casi todo dinámico (depende del usuario), así que no usamos Cache Components.
const nextConfig: NextConfig = {
  // No anunciar qué tecnología usa el sitio.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: cabecerasSeguridad }];
  },
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
