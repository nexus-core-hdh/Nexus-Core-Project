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
//   * process-start failure: spawning fails, or the new process dies with 0xC0000142
//     (STATUS_DLL_INIT_FAILED — Windows could not initialise it). Possibly transient, so it is
//     retried after 15s, 30s and 60s, then given up. Never clears the cache.
//
// The restart state machine lives in dev-supervisor-core.mjs (tested by dev-supervisor.test.mjs);
// this file wires it to the real processes, ports and cache.
//
// Compile errors never trigger anything: they don't exit the process or grow memory unboundedly.
// Before every (re)start .next/dev is trimmed if oversized (trim-dev-cache.mjs); two crashes in a row
// during startup clear it unconditionally (stale/corrupt cache). A start is only considered healthy
// once Next prints "Ready in" and the port accepts connections. A new `next dev` is never started
// while the previous one (or a leftover child of it) still runs or the port is still taken.
// Restarts are rate-limited, and each one writes the recent output + memory history to
// .next/dev-supervisor/*.log.
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
import { createSupervisor, STATES } from "./dev-supervisor-core.mjs";
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
const GRACEFUL_STOP_MS = 5000;
const FORCED_STOP_MS = 8000;
const SHUTDOWN_HARD_LIMIT_MS = 25000;
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

// --- process table --------------------------------------------------------------------------
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

// --- stopping a run's process tree ----------------------------------------------------------
const isRunning = (proc) => !!proc && proc.exitCode === null && proc.signalCode === null;

const waitExit = (proc, ms) =>
  new Promise((resolve) => {
    if (!isRunning(proc)) return resolve(true);
    const timer = setTimeout(() => resolve(!isRunning(proc)), ms);
    proc.once("exit", () => (clearTimeout(timer), resolve(true)));
  });

const taskkill = (pid, force) =>
  spawnSync("taskkill", ["/PID", String(pid), "/T", ...(force ? ["/F"] : [])], { stdio: "ignore", windowsHide: true });

const signalGroup = (pid, sig) => {
  try {
    process.kill(-pid, sig);
    return true;
  } catch {
    return false; // group already gone
  }
};

// Graceful first, forced after a timeout. Only ever targets this run's own process tree.
async function stopTree(run) {
  const { proc, pid } = run;
  if (!Number.isInteger(pid)) return; // never spawned
  if (isRunning(proc)) {
    if (IS_WIN) {
      // A console child without a window usually refuses a non-forced taskkill; then go straight to /F.
      const polite = taskkill(pid, false);
      if (polite.status !== 0 || !(await waitExit(proc, GRACEFUL_STOP_MS))) {
        taskkill(pid, true);
        await waitExit(proc, FORCED_STOP_MS);
      }
    } else if (signalGroup(pid, "SIGTERM") && !(await waitExit(proc, GRACEFUL_STOP_MS))) {
      signalGroup(pid, "SIGKILL");
      await waitExit(proc, FORCED_STOP_MS);
    }
  } else if (!IS_WIN && signalGroup(pid, "SIGTERM")) {
    // The group leader is gone but members survived (own process group, see `detached`).
    await sleep(2000);
    signalGroup(pid, "SIGKILL");
  }
  if (IS_WIN) await stopWindowsLeftovers(run);
}

// Next spawns this on exit on purpose to send its telemetry; it exits by itself and holds no port.
const BENIGN_LEFTOVER = /next[\\/]dist[\\/]telemetry[\\/]detached-flush\.js/;

// Direct children of `pid` as { pid, startMs, cmd }, or null if listing failed.
function listChildren(pid) {
  const cmd =
    `Get-CimInstance Win32_Process -Filter "ParentProcessId=${Number(pid)}" | ForEach-Object { ` +
    "$c = if ($_.CreationDate) { ([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds() } else { 0 }; " +
    '"$($_.ProcessId)|$c|$($_.CommandLine)" }';
  return new Promise((resolve) => {
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", cmd], { timeout: 20000, windowsHide: true, maxBuffer: 8 * MB }, (err, out) => {
      if (err) return resolve(null);
      const rows = [];
      for (const line of out.split(/\r?\n/)) {
        const [p, start, ...rest] = line.split("|");
        if (Number(p)) rows.push({ pid: Number(p), startMs: Number(start) || 0, cmd: rest.join("|") });
      }
      resolve(rows);
    });
  });
}

// Windows does not re-parent orphans, so children of a `next dev` that already died still list it
// as their parent. Only processes created during that run's lifetime qualify, which rules out
// unrelated processes that happen to reuse the dead PID later.
async function stopWindowsLeftovers(run) {
  const rows = await listChildren(run.pid);
  if (!rows) {
    log("could not list processes to check for leftovers of the previous next dev — relying on the port check");
    return;
  }
  const from = run.startedAt - 5000;
  const to = (run.endedAt ?? Date.now()) + 1000;
  const leftovers = rows.filter((r) => r.pid !== run.pid && r.startMs >= from && r.startMs <= to && !BENIGN_LEFTOVER.test(r.cmd));
  for (const r of leftovers) {
    log(`stopping leftover process ${r.pid} of the previous next dev (pid ${run.pid})`);
    taskkill(r.pid, true);
  }
}

// --- ports ----------------------------------------------------------------------------------
const connects = () =>
  new Promise((resolve) => {
    const s = net.connect({ port: PORT, host: "127.0.0.1" });
    s.setTimeout(2000);
    s.once("connect", () => (s.destroy(), resolve(true)));
    s.once("error", () => resolve(false));
    s.once("timeout", () => (s.destroy(), resolve(null)));
  });
const portFree = async () => (await connects()) === false; // a hung connect counts as taken
const probeReady = async () => (await connects()) === true;

// --- incidents ------------------------------------------------------------------------------
const outputTail = [];
const memoryHistory = [];

function writeIncident(kind, detail) {
  try {
    const run = supervisor.current;
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const file = path.join(LOG_DIR, `${new Date().toISOString().replace(/[:.]/g, "-")}-${kind}.log`);
    const body = [
      `reason: ${kind} — ${detail}`,
      `uptime: ${run ? Math.round(((run.endedAt ?? Date.now()) - run.startedAt) / 1000) : 0}s, ready: ${!!run?.ready}`,
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
  } catch (err) {
    log(`could not write incident log: ${err.message}`);
    return null;
  }
}

// --- supervisor -----------------------------------------------------------------------------
const supervisor = createSupervisor({
  label: "next dev",
  port: PORT,
  spawnChild: () => {
    const env = { ...process.env };
    if (process.stdout.isTTY && !env.NO_COLOR) env.FORCE_COLOR ??= "1";
    return spawn(process.execPath, [NEXT_BIN, "dev", ...ARGS], {
      cwd: FRONTEND,
      env,
      stdio: ["inherit", "pipe", "pipe"],
      detached: !IS_WIN, // own process group on POSIX so the whole tree can be signalled
      windowsHide: true,
    });
  },
  stopTree,
  portFree,
  probeReady,
  prepareStart: async ({ force, reason }) => {
    const { cleanup } = await trimDevCache({ force, reason });
    cleanup.catch((err) => log(`dev cache cleanup failed: ${err.message}`)); // finishes in the background
  },
  writeIncident,
  onOutputLine: (line) => {
    outputTail.push(line);
    if (outputTail.length > 300) outputTail.shift();
  },
  log,
  exit: (code) => process.exit(code),
  stdout: process.stdout,
  stderr: process.stderr,
  workerFailurePattern: WORKER_FAILURE,
  startupGraceMs: STARTUP_GRACE_MS,
  maxRestarts: MAX_RESTARTS,
  restartWindowMs: RESTART_WINDOW_MS,
});

// --- memory monitor -------------------------------------------------------------------------
let highSamples = 0;
let sampledRun = null;
async function sample() {
  const run = supervisor.current;
  if (supervisor.state !== STATES.RUNNING || !run || supervisor.monitoringDisabled) return;
  if (run !== sampledRun) (sampledRun = run), (highSamples = 0);
  const bytes = await treeMemory(run.pid);
  if (bytes == null || supervisor.current !== run || supervisor.state !== STATES.RUNNING) return;
  memoryHistory.push([Date.now(), bytes]);
  if (memoryHistory.length > 60) memoryHistory.shift();

  const lowSystemMemory = os.freemem() < TOTAL * 0.05 && bytes > MAX_TREE_BYTES * 0.5;
  highSamples = bytes > MAX_TREE_BYTES || lowSystemMemory ? highSamples + 1 : 0;
  if (highSamples === 1) log(`next dev is using ${fmt(bytes)} (limit ${fmt(MAX_TREE_BYTES)}, ${fmt(os.freemem())} RAM free) — watching`);
  if (highSamples >= SAMPLES) {
    highSamples = 0;
    supervisor.requestRestart("memory", `next dev stayed at ${fmt(bytes)} for ${SAMPLES} samples (limit ${fmt(MAX_TREE_BYTES)}, ${fmt(os.freemem())} RAM free)`);
  }
}

let sampling = false;
setInterval(async () => {
  if (sampling) return;
  sampling = true;
  try {
    await sample();
  } catch (err) {
    log(`memory sample failed: ${err?.message || err}`);
  } finally {
    sampling = false;
  }
}, INTERVAL_MS).unref();

// --- shutdown & self-protection -------------------------------------------------------------
const onSignal = () => {
  setTimeout(() => {
    log("shutdown is taking too long — exiting");
    process.exit(1);
  }, SHUTDOWN_HARD_LIMIT_MS).unref();
  void supervisor.shutdown(0);
};
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) {
  try {
    process.on(sig, onSignal);
  } catch {}
}
// A bug in the supervisor must not take the running dev server down with it; say so loudly instead.
process.on("unhandledRejection", (err) => log(`internal error (supervisor kept running): ${err?.stack || err}`));
process.on("uncaughtException", (err) => log(`internal error (supervisor kept running): ${err?.stack || err}`));

log(`watching next dev: memory limit ${fmt(MAX_TREE_BYTES)} of ${fmt(TOTAL)} RAM, sampled every ${INTERVAL_MS / 1000}s`);
supervisor.start();
