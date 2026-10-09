import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Classic rendering model: pages that read data render per request (force-dynamic).
  // Cache Components would require Suspense around every server fetch; not worth it here.
  cacheComponents: false,
  poweredByHeader: false,
  // Server-only packages with native or dynamic requires stay out of the bundle.
  serverExternalPackages: ["ioredis"],
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
