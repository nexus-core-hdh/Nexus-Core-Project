#!/usr/bin/env node
// Runs before `next build`. NEXT_PUBLIC_* values are compiled INTO the browser bundle at build time,
// so a build without NEXT_PUBLIC_NEXUSCORE_API_URL would silently ship
// "http://localhost:4000/api/v1" to every customer browser. Fail the build instead.
//
//   NEXT_PUBLIC_NEXUSCORE_API_URL=https://erp.customer.com/api/v1   (API on its own origin), or
//   NEXT_PUBLIC_NEXUSCORE_API_URL=/api/v1                           (same origin via the reverse proxy)
//
// A localhost/loopback URL is refused unless ALLOW_LOCALHOST_API_URL=true (local production tests).
const name = "NEXT_PUBLIC_NEXUSCORE_API_URL";
const value = (process.env[name] || "").trim();
const fail = (msg) => {
  console.error(`\n[build-check] ${msg}\n`);
  process.exit(1);
};

if (!value) {
  fail(`${name} is not set. It is compiled into the browser bundle, so it must be set for every build, e.g.\n  ${name}=/api/v1  (same origin behind the reverse proxy)\n  ${name}=https://erp.example.com/api/v1`);
}
const relative = value.startsWith("/");
if (!relative) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(`${name}="${value}" is neither an absolute http(s) URL nor a path starting with "/".`);
  }
  if (!/^https?:$/.test(url.protocol)) fail(`${name} must use http or https.`);
  const loopback = ["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"].includes(url.hostname);
  if (loopback && process.env.ALLOW_LOCALHOST_API_URL !== "true") {
    fail(`${name}="${value}" points at this machine — customer browsers would call their own computer.\nSet the real server URL, or ALLOW_LOCALHOST_API_URL=true for a local production test.`);
  }
}
console.log(`[build-check] ${name}=${value}`);
