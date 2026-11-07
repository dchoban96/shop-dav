import type { NextConfig } from "next";

/**
 * Cache Components disattivato: il sito non usa "use cache" (tutte le pagine dell'area
 * clienti sono dinamiche) e su Cloudflare, tramite vinext, quella modalità richiederebbe
 * uno storage di cache dedicato. I confini <Suspense> restano e funzionano lo stesso.
 */
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
