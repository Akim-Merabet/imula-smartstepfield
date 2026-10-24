import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Paquets du monorepo publiés en TypeScript source.
  transpilePackages: ["@imula/backup-core", "@imula/db", "@imula/flow-core", "@imula/formula", "@imula/forms-core"],
  // App entièrement authentifiée : rendu dynamique par requête (pas de Cache Components).
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  experimental: {
    serverActions: { bodySizeLimit: "50mb" },
  },
};

export default withNextIntl(nextConfig);
