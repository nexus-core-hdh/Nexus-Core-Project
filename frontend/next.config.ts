import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import os from "os";
import path from "path";

// DEVELOPMENT ONLY (`next dev`). Turbopack's dev server keeps every compiled module in memory with
// no cap by default, so it grows for as long as it runs (it reached ~9.5GB here). With a limit it
// evicts cold entries, re-reading them from its disk cache when needed. Default: 25% of RAM,
// clamped to 3..12GB (16GB -> 4GB, 32GB -> 8GB, 64GB -> 12GB). Override with
// NEXT_TURBOPACK_MEMORY_LIMIT_MB; 0 = no limit. `next build` / `next start` are not affected.
const GB = 1024 ** 3;
const devTurbopackMemoryLimit = () => {
  const env = process.env.NEXT_TURBOPACK_MEMORY_LIMIT_MB;
  if (env !== undefined && env !== "" && Number.isFinite(Number(env))) {
    return Number(env) > 0 ? Math.round(Number(env) * 1024 ** 2) : undefined;
  }
  return Math.round(Math.min(12 * GB, Math.max(3 * GB, os.totalmem() * 0.25)));
};

// Browser-side API endpoints are compiled into the bundle at build time. NEXT_PUBLIC_NEXUSCORE_API_URL
// is the one required setting (enforced by scripts/check-production-env.mjs before `next build`);
// the two older template variables default from it instead of their "localhost:5001" /
// "localhost:3000" code fallbacks, so no build contains a localhost address unless one is set.
function derivedPublicEnv(): Record<string, string> {
  const api = process.env.NEXT_PUBLIC_NEXUSCORE_API_URL?.trim();
  if (!api) return {};
  let apiOrigin = "";
  try {
    apiOrigin = new URL(api).origin; // absolute URL -> its origin; a relative "/api/v1" -> same origin ("")
  } catch {}
  const env: Record<string, string> = {};
  if (!process.env.NEXT_PUBLIC_API_URL) env.NEXT_PUBLIC_API_URL = api;
  if (!process.env.NEXT_PUBLIC_SOCKET_URL) env.NEXT_PUBLIC_SOCKET_URL = apiOrigin;
  return env;
}

const nextConfig: NextConfig = {
  env: derivedPublicEnv(),
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "localhost" },
      { protocol: "https", hostname: "bundui-images.netlify.app" }
    ]
  },
  // Turbopack: pin root to the monorepo root (where hoisted deps like `next` live)
  // and alias CSS packages to this package's node_modules.
  turbopack: {
    root: path.resolve(__dirname, ".."),
    resolveAlias: {
      tailwindcss: path.resolve(__dirname, "node_modules/tailwindcss"),
      "tailwindcss-animate": path.resolve(__dirname, "node_modules/tailwindcss-animate"),
    }
  },
  // Webpack (used by Next.js for SSR/edge compilation even in Turbopack dev mode):
  // ensure CSS package resolution always starts from frontend/node_modules.
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      tailwindcss: path.resolve(__dirname, "node_modules/tailwindcss"),
      "tailwindcss-animate": path.resolve(__dirname, "node_modules/tailwindcss-animate"),
    };
    config.resolve.modules = [
      path.resolve(__dirname, "node_modules"),
      ...(config.resolve.modules || ["node_modules"]),
    ];
    return config;
  },
};

export default function config(phase: string): NextConfig {
  if (phase !== PHASE_DEVELOPMENT_SERVER) return nextConfig;
  // Dev only: with NEXT_PUBLIC_NEXUSCORE_API_URL=/api/v1, `next dev` proxies the API to the local
  // backend (the reverse proxy's job in production), so only :3000 needs exposing and the app works
  // from any host — via app/api/v1/[...path]/route.ts (NEXUSCORE_BACKEND_URL, default
  // http://localhost:4000), which answers 503 while the backend is restarting instead of a bare 500.
  // NEXT_DEV_ALLOWED_ORIGINS lists the extra hosts (LAN/public IPs) it is opened on.
  return {
    ...nextConfig,
    // This machine's own LAN subnet is always allowed as a wildcard ("192.168.0.*" — Next matches
    // "*" against one address segment): the router (DHCP) can hand this PC a new address at any
    // time, even while the dev server keeps running, so the exact address read at startup goes
    // stale. Plus any extra hosts listed in NEXT_DEV_ALLOWED_ORIGINS.
    allowedDevOrigins: [...new Set([
      ...Object.values(os.networkInterfaces()).flat()
        .filter((a): a is os.NetworkInterfaceInfo => !!a && a.family === "IPv4" && !a.internal)
        .map((a) => a.address.replace(/\.\d+$/, ".*")),
      ...(process.env.NEXT_DEV_ALLOWED_ORIGINS || "").split(",").map((h) => h.trim()).filter(Boolean),
    ])],
    experimental: { ...nextConfig.experimental, turbopackMemoryLimit: devTurbopackMemoryLimit() }
  };
}
