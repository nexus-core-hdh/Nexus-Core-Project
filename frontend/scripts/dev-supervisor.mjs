#!/usr/bin/env node
// Runs `next dev` and recovers it automatically when — and only when — there is strong evidence the
// process itself has failed, so long dev sessions don't need manual restarts:
//
//   * memory: the whole `next dev` process tree stays above DEV_SUPERVISOR_MAX_MEMORY_MB for
//     DEV_SUPERVISOR_SAMPLES consecutive samples, or the machine is nearly out of RAM while the
//     tree holds a large share of it. (Turbopack's heap is also capped in next.config.ts; this is
//     the backstop.)
//   * worker failure: Next logs "Jest worker encountered N child process exceptions". Jest is NOT
//     involved — that is Next's bundled jest-worker, which forks a child per dynamic-route request
//     in dev; the fork dies when the machine is out of memory.
//   * crash: `next dev` exits with an error on its own (not Ctrl+C).
//
// Compile errors never trigger anything: they don't exit the process or grow memory unboundedly.
// Before every (re)start .next/dev is trimmed if oversized (trim-dev-cache.mjs); two crashes in a row
// during startup clear it unconditionally (stale/corrupt cache). Restarts are rate-limited, and each
// one writes the recent output + memory history to .next/dev-supervisor/*.log.
//
// Environment (all optional):
//   DEV_SUPERVISOR=0                  run plain `next dev` with no monitoring.
//   DEV_SUPERVISOR_MAX_MEMORY_MB      tree memory ceiling. Default 45% of RAM, clamped 4..24 GB.
//   DEV_SUPERVISOR_INTERVAL_S         seconds between memory samples. Default 30.
//   DEV_SUPERVISOR_SAMPLES            consecutive high samples before restarting. Default 3.
//   DEV_SUPERVISOR_MAX_RESTARTS       automatic restarts allowed per 30 minutes. Default 3.
// Extra CLI args are passed to `next dev` (e.g. `npm run dev -- -p 3001`).
import { execFile, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { trimDevCache } from "./trim-dev-cache.mjs";

const FRONTEND = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOG_DIR = path.join(FRONTEND, ".next", "dev-supervisor");
const NEXT_BIN = createRequire(path.join(FRONTEND, "package.json")).resolve("next/dist/bin/next");
const ARGS = process.argv.slice(2);
const IS_WIN = process.platform === "win32";
const MB = 1024 ** 2;
const GB = 1024 ** 3;

const envNumber = (name, fallback) => {
  const v = Number(process.env[name]);
  return process.env[name] && Number.isFinite(v) && v > 0 ? v : fallback;
};
const TOTAL = os.totalmem();
const MAX_TREE_BYTES = envNumber("DEV_SUPERVISOR_MAX_MEMORY_MB", 0) * MB || Math.min(24 * GB, Math.max(4 * GB, TOTAL * 0.45));
const INTERVAL_MS = envNumber("DEV_SUPERVISOR_INTERVAL_S", 30) * 1000;
const SAMPLES = envNumber("DEV_SUPERVISOR_SAMPLES", 3);
const MAX_RESTARTS = envNumber("DEV_SUPERVISOR_MAX_RESTARTS", 3);
const RESTART_WINDOW_MS = 30 * 60 * 1000;
const STARTUP_GRACE_MS = 60 * 1000;
const WORKER_FAILURE = /child process exceptions, exceeding retry limit/;
const PORT = (() => {
  const i = ARGS.findIndex((a) => a === "-p" || a === "--port");
  return Number(i >= 0 ? ARGS[i + 1] : process.env.PORT) || 3000;
})();

const log = (msg) => console.log(`[dev-supervisor] ${msg}`);
const fmt = (bytes) => `${(bytes / GB).toFixed(1)}GB`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- plain mode -----------------------------------------------------------------------------
if (process.env.DEV_SUPERVISOR === "0") {
  const r = spawnSync(process.execPath, [NEXT_BIN, "dev", ...ARGS], { cwd: FRONTEND, stdio: "inherit" });
  process.exit(r.status ?? 1);
}

// --- process-tree memory --------------------------------------------------------------------
function listProcesses() {
  return new Promise((resolve) => {
    const done = (err, out) => {
      if (err) return resolve(null);
      const rows = [];
      for (const line of out.split(/\r?\n/)) {
        const [pid, ppid, mem] = line.trim().split(/[\s,]+/).map(Number);
        if (pid) rows.push({ pid, ppid, bytes: IS_WIN ? mem : mem * 1024 });
      }
      resolve(rows);
    };
    if (IS_WIN) {
      const cmd = 'Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,WorkingSetSize | ForEach-Object { "$($_.ProcessId),$($_.ParentProcessId),$($_.WorkingSetSize)" }';
      execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", cmd], { timeout: 20000, windowsHide: true, maxBuffer: 8 * MB }, done);
    } else {
      execFile("ps", ["-A", "-o", "pid=,ppid=,rss="], { timeout: 20000, maxBuffer: 8 * MB }, done);
    }
  });
}

async function treeMemory(rootPid) {
  const rows = await listProcesses();
  if (!rows) return null;
  const children = new Map();
  for (const r of rows) (children.get(r.ppid) ?? children.set(r.ppid, []).get(r.ppid)).push(r);
  let total = 0;
  const stack = rows.filter((r) => r.pid === rootPid);
  const seen = new Set();
  while (stack.length) {
    const p = stack.pop();
    if (seen.has(p.pid)) continue;
    seen.add(p.pid);
    total += p.bytes;
    stack.push(...(children.get(p.pid) ?? []));
  }
  return seen.size ? total : null;
}

// --- child lifecycle ------------------------------------------------------------------------
let child = null;
let startedAt = 0;
let ready = false;
let stopping = false; // user asked us to exit
let restarting = false; // we are deliberately replacing the child
let highSamples = 0;
let startupFailures = 0;
let monitoringDisabled = false;
const restartTimes = [];
const outputTail = [];
const memoryHistory = [];

const remember = (line) => {
  outputTail.push(line);
  if (outputTail.length > 300) outputTail.shift();
};

function pipe(stream, target) {
  let partial = "";
  stream.on("data", (chunk) => {
    target.write(chunk);
    const lines = (partial + chunk.toString()).split(/\r?\n/);
    partial = lines.pop();
    for (const line of lines) {
      remember(line);
      if (!ready && /Ready in/.test(line)) {
        ready = true;
        startupFailures = 0;
      }
      if (WORKER_FAILURE.test(line)) void recover("worker-failure", "Next's route worker process crashed (usually the machine ran out of memory)");
    }
  });
}

async function start() {
  const { cleanup } = await trimDevCache({ force: startupFailures >= 2, reason: "next dev failed to start twice — clearing possibly stale cache" });
  void cleanup;
  ready = false;
  highSamples = 0;
  startedAt = Date.now();
  const env = { ...process.env };
  if (process.stdout.isTTY && !env.NO_COLOR) env.FORCE_COLOR ??= "1";
  child = spawn(process.execPath, [NEXT_BIN, "dev", ...ARGS], {
    cwd: FRONTEND,
    env,
    stdio: ["inherit", "pipe", "pipe"],
    detached: !IS_WIN, // own process group on POSIX so the whole tree can be signalled
    windowsHide: true,
  });
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  const me = child;
  me.on("exit", (code, signal) => void onExit(me, code, signal));
}

const killedOnPurpose = new WeakSet();
function killTree(proc) {
  if (!proc || proc.exitCode !== null || proc.signalCode !== null) return Promise.resolve();
  killedOnPurpose.add(proc);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (!IS_WIN) try { process.kill(-proc.pid, "SIGKILL"); } catch {}
      resolve();
    }, 8000);
    proc.once("exit", () => (clearTimeout(timer), resolve()));
    if (IS_WIN) spawnSync("taskkill", ["/PID", String(proc.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    else try { process.kill(-proc.pid, "SIGTERM"); } catch {}
  });
}

const portFree = () =>
  new Promise((resolve) => {
    const s = net.connect({ port: PORT, host: "127.0.0.1" });
    s.once("connect", () => (s.destroy(), resolve(false)));
    s.once("error", () => resolve(true));
  });

function writeIncident(kind, detail) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const file = path.join(LOG_DIR, `${new Date().toISOString().replace(/[:.]/g, "-")}-${kind}.log`);
    const body = [
      `reason: ${kind} — ${detail}`,
      `uptime: ${Math.round((Date.now() - startedAt) / 1000)}s, ready: ${ready}`,
      `system RAM: ${fmt(TOTAL)} total, ${fmt(os.freemem())} free; tree limit ${fmt(MAX_TREE_BYTES)}`,
      "",
      "memory samples (time, next dev tree):",
      ...memoryHistory.map(([t, b]) => `  ${new Date(t).toISOString()}  ${fmt(b)}`),
      "",
      "last output:",
      ...outputTail,
    ].join("\n");
    fs.writeFileSync(file, body);
    const logs = fs.readdirSync(LOG_DIR).filter((f) => f.endsWith(".log")).sort();
    for (const old of logs.slice(0, -20)) fs.rmSync(path.join(LOG_DIR, old), { force: true });
    return path.relative(FRONTEND, file);
  } catch {
    return null;
  }
}

function restartAllowed() {
  const now = Date.now();
  while (restartTimes.length && now - restartTimes[0] > RESTART_WINDOW_MS) restartTimes.shift();
  return restartTimes.length < MAX_RESTARTS;
}

// Deliberate restart of a still-running (but unhealthy) `next dev`.
async function recover(kind, detail) {
  if (stopping || restarting || !child) return;
  const file = writeIncident(kind, detail);
  if (!restartAllowed()) {
    if (!monitoringDisabled) {
      monitoringDisabled = true;
      log(`${detail}. Already restarted ${restartTimes.length}x in 30 min — not restarting again to avoid a loop.`);
      log(`Details: ${file}. Investigate, then restart the dev server yourself.`);
    }
    return;
  }
  restartTimes.push(Date.now());
  restarting = true;
  log(`${detail} — restarting next dev (details: ${file})`);
  await killTree(child);
  for (let i = 0; i < 30 && !(await portFree()); i++) await sleep(500);
  restarting = false;
  if (!stopping) await start();
}

async function onExit(proc, code, signal) {
  if (proc !== child || killedOnPurpose.has(proc)) return;
  await sleep(500); // let a concurrent Ctrl+C reach our own handler first
  if (stopping || restarting || proc !== child) return;
  const interrupted = signal === "SIGINT" || signal === "SIGTERM" || code === 130 || code === 0xc000013a; // 0xC000013A = Windows Ctrl+C
  if (code === 0 || interrupted) process.exit(code ?? 0);

  const early = !ready || Date.now() - startedAt < STARTUP_GRACE_MS;
  if (early) startupFailures++;
  const detail = `next dev exited unexpectedly (code ${code ?? signal})`;
  const file = writeIncident("crash", detail);
  if (startupFailures > 3 || !restartAllowed()) {
    log(`${detail}. Giving up after repeated failures — see ${file}`);
    process.exit(code || 1);
  }
  restartTimes.push(Date.now());
  log(`${detail} — restarting (details: ${file})`);
  await sleep(Math.min(10000, 1000 * 2 ** startupFailures));
  if (!stopping) await start();
}

// --- memory monitor -------------------------------------------------------------------------
async function sample() {
  if (!child || restarting || stopping || monitoringDisabled) return;
  const bytes = await treeMemory(child.pid);
  if (bytes == null) return;
  memoryHistory.push([Date.now(), bytes]);
  if (memoryHistory.length > 60) memoryHistory.shift();

  const lowSystemMemory = os.freemem() < TOTAL * 0.05 && bytes > MAX_TREE_BYTES * 0.5;
  highSamples = bytes > MAX_TREE_BYTES || lowSystemMemory ? highSamples + 1 : 0;
  if (highSamples === 1) log(`next dev is using ${fmt(bytes)} (limit ${fmt(MAX_TREE_BYTES)}, ${fmt(os.freemem())} RAM free) — watching`);
  if (highSamples >= SAMPLES) {
    await recover("memory", `next dev stayed at ${fmt(bytes)} for ${SAMPLES} samples (limit ${fmt(MAX_TREE_BYTES)}, ${fmt(os.freemem())} RAM free)`);
  }
}

let sampling = false;
setInterval(async () => {
  if (sampling) return;
  sampling = true;
  try {
    await sample();
  } finally {
    sampling = false;
  }
}, INTERVAL_MS).unref();

// --- shutdown -------------------------------------------------------------------------------
const shutdown = async () => {
  if (stopping) return;
  stopping = true;
  await killTree(child);
  process.exit(0);
};
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) {
  try { process.on(sig, shutdown); } catch {}
}

log(`watching next dev: memory limit ${fmt(MAX_TREE_BYTES)} of ${fmt(TOTAL)} RAM, sampled every ${INTERVAL_MS / 1000}s`);
await start();
