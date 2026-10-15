import type { NextConfig } from "next";

// Un ERP es casi todo dinámico (depende del usuario), así que no usamos Cache Components.
const nextConfig: NextConfig = {
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
