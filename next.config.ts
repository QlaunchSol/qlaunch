import type { NextConfig } from "next";
import { baselineDirectives } from "./src/lib/csp";

const nextConfig: NextConfig = {
  // Classic rendering model: pages that read data render per request (force-dynamic).
  // Cache Components would require Suspense around every server fetch; not worth it here.
  cacheComponents: false,
  poweredByHeader: false,
  // Baseline CSP on every response; pages also get the strict nonce policy from src/proxy.ts.
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "Content-Security-Policy", value: [...baselineDirectives(), "upgrade-insecure-requests"].join("; ") }] }];
  },
  // deploy/build.sh builds into .next-build (keeping its cache) and the service runs a copy in .next-live.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Loaded from node_modules at runtime instead of bundled, to keep server
  // builds small on a 1 GB machine. Not pump-sdk: its ESM build only works
  // bundled (it imports a named export from CommonJS @coral-xyz/anchor).
  serverExternalPackages: ["ioredis", "@solana/web3.js", "@solana/spl-token", "bn.js"],
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
