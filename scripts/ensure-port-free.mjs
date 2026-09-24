#!/usr/bin/env node
// Guard for dev scripts: refuse to start a second dev server/watcher when the port is already in
// use. A duplicate `nest start --watch` / `next dev` fights the first one over the same dist/.next
// output (corrupted generated files, EADDRINUSE crash loops, doubled RAM use). Fails fast with a
// clear message instead of letting the second copy start and misbehave.
// Usage: node ../scripts/ensure-port-free.mjs <port> [label]
import net from "node:net";

const port = Number(process.argv[2]);
const label = process.argv[3] || `port ${port}`;
if (!Number.isInteger(port)) {
  console.error("usage: ensure-port-free.mjs <port> [label]");
  process.exit(2);
}

const socket = net.connect({ port, host: "127.0.0.1" });
socket.setTimeout(1000);
socket.once("connect", () => {
  socket.destroy();
  console.error(`\n[dev-guard] ${label} is already in use — a dev server is already running there.`);
  console.error("[dev-guard] Not starting a duplicate. Stop the existing process first (or just use it).\n");
  process.exit(1);
});
const free = () => {
  socket.destroy();
  process.exit(0);
};
socket.once("error", free);
socket.once("timeout", free);
