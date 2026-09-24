#!/usr/bin/env node
// Starts backend then frontend dev servers SEQUENTIALLY. Measured on this machine (7.75GB RAM):
// starting `nest start --watch` and `next dev` at the same time made the backend's cold compile
// take ~100s (vs ~13s standalone) and its app boot ~55s (vs ~2s), purely from CPU/RAM contention
// with Turbopack's cold compile. Waiting for the API to listen before launching Next avoids that.
// Both servers keep their normal incremental/watch behaviour; this only orders startup. Each
// workspace's own dev guard (ensure-port-free) still refuses duplicates.
import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BACKEND_PORT = 4000;
const WAIT_MS = 5 * 60 * 1000;

const children = [];
const start = (name, cwd, script) => {
  const child = spawn("npm", ["run", script], { cwd: path.join(ROOT, cwd), stdio: "inherit", shell: true });
  child.on("exit", (code) => {
    if (code) console.error(`[dev-all] ${name} exited with code ${code}`);
  });
  children.push(child);
  return child;
};

const isListening = (port) =>
  new Promise((resolve) => {
    const s = net.connect({ port, host: "127.0.0.1" });
    s.once("connect", () => (s.destroy(), resolve(true)));
    s.once("error", () => resolve(false));
  });

const stopAll = () => {
  for (const c of children) {
    if (!c.pid) continue;
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(c.pid), "/T", "/F"]);
    else c.kill("SIGTERM");
  }
  process.exit(0);
};
process.on("SIGINT", stopAll);
process.on("SIGTERM", stopAll);

const backend = start("backend", "nexuscore-backend", "start:dev");
const deadline = Date.now() + WAIT_MS;
let exited = false;
backend.on("exit", () => (exited = true));
while (!(await isListening(BACKEND_PORT))) {
  if (exited) process.exit(1);
  if (Date.now() > deadline) {
    console.error(`[dev-all] backend did not start listening on ${BACKEND_PORT} within ${WAIT_MS / 1000}s`);
    stopAll();
  }
  await new Promise((r) => setTimeout(r, 2000));
}
console.log(`[dev-all] backend is up on :${BACKEND_PORT} — starting frontend`);
start("frontend", "frontend", "dev");
