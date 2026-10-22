#!/usr/bin/env node
// Runs `next dev` and recovers it automatically when — and only when — there is strong evidence the
// process itself has failed, so long dev sessions don't need manual restarts:
//
//   * memory: the whole `next dev` process tree stays above DEV_SUPERVISOR_MAX_MEMORY_MB for
//     DEV_SUPERVISOR_SAMPLES consecutive samples, or the machine is nearly out of RAM while the
//     tree holds a large share of it (with hysteresis — see createMemoryGuard). Turbopack's heap is
//     also capped in next.config.ts; this is the backstop.
//   * worker failure: Next logs "Jest worker encountered N child process exceptions". Jest is NOT
//     involved — that is Next's bundled jest-worker, which forks a child per dynamic-route request
//     in dev; the fork dies when the machine is short of memory or cannot start a process.
//   * crash: `next dev` exits with an error on its own (not Ctrl+C).
//   * process-start failure: spawning fails, or the new process dies with 0xC0000142
//     (STATUS_DLL_INIT_FAILED — Windows could not initialise it). Retried after ~15s, ~30s, ~60s
//     (±20% jitter); never clears the cache.
// When those fast retries are used up the supervisor keeps running in RECOVERING and retries every
// 2 min, doubling to 10 min — it no longer exits and leaves localhost down. Ctrl+C stops it.
// Failure counters reset only after a run has stayed healthy for 10 minutes.
//
// The restart state machine lives in dev-supervisor-core.mjs (tested by dev-supervisor.test.mjs);
// this file wires it to the real processes, ports and cache.
//
// Process safety: only this supervisor's own `next dev` tree is ever stopped. A process holding the
// port is stopped only when it was seen inside one of this supervisor's runs (same pid AND same
// creation time); anything else — another dev server, the backend, VS Code, browsers — is reported
// and left alone. The cache is never deleted here except by the existing "two startup crashes in a
// row" rule (trim-dev-cache.mjs); nothing machine-wide is changed.
//
// Logs (.next/dev-supervisor/, bounded): supervisor.log (every supervisor line, timestamped),
// memory.csv (one row per sample: tree size, process count, largest processes, free RAM),
// <time>-<reason>.log incidents (last 20) with recent output, memory history and — for start
// failures — a Windows snapshot (commit charge, process/handle counts, and whether this supervisor
// can start a trivial process at all).
//
// Environment (all optional):
//   DEV_SUPERVISOR=0                  run plain `next dev` with no monitoring.
//   DEV_SUPERVISOR_MAX_MEMORY_MB      tree memory ceiling. Default 45% of RAM, clamped 4..24 GB.
//   DEV_SUPERVISOR_INTERVAL_S         seconds between memory samples. Default 30.
//   DEV_SUPERVISOR_SAMPLES            consecutive high samples before restarting. Default 3.
//   DEV_SUPERVISOR_MAX_RESTARTS       automatic crash/memory/worker restarts per 30 minutes. Default 3.
// Extra CLI args are passed to `next dev` (e.g. `npm run dev -- -p 3001`).
import { execFile, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createMemoryGuard, createSupervisor, describeExit, STATES } from "./dev-supervisor-core.mjs";
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
const LOW_FREE_BYTES = Math.max(TOTAL * 0.05, 0.75 * GB); // "nearly out of RAM"
const INTERVAL_MS = envNumber("DEV_SUPERVISOR_INTERVAL_S", 30) * 1000;
const SAMPLES = envNumber("DEV_SUPERVISOR_SAMPLES", 3);
const MAX_RESTARTS = envNumber("DEV_SUPERVISOR_MAX_RESTARTS", 3);
const RESTART_WINDOW_MS = 30 * 60 * 1000;
const STARTUP_GRACE_MS = 60 * 1000;
const HEALTHY_RESET_MS = 10 * 60 * 1000;
const GRACEFUL_STOP_MS = 5000;
const FORCED_STOP_MS = 8000;
const SHUTDOWN_HARD_LIMIT_MS = 25000;
const MAX_LOG_BYTES = 2 * MB; // supervisor.log / memory.csv rotate to *.1 beyond this
const WORKER_FAILURE = /child process exceptions, exceeding retry limit/;
const PORT = (() => {
  const i = ARGS.findIndex((a) => a === "-p" || a === "--port");
  return Number(i >= 0 ? ARGS[i + 1] : process.env.PORT) || 3000;
})();

const fmt = (bytes) => `${(bytes / GB).toFixed(1)}GB`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- bounded log files ----------------------------------------------------------------------
function appendBounded(name, text) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const file = path.join(LOG_DIR, name);
    try {
      if (fs.statSync(file).size > MAX_LOG_BYTES) fs.renameSync(file, `${file}.1`); // replaces the older .1
    } catch {}
    fs.appendFileSync(file, text);
  } catch {}
}
const log = (msg) => {
  const line = `[dev-supervisor] ${msg}`;
  console.log(line);
  appendBounded("supervisor.log", `${new Date().toISOString()} pid=${process.pid} ${msg}\n`);
};

// --- plain mode -----------------------------------------------------------------------------
if (process.env.DEV_SUPERVISOR === "0") {
  const r = spawnSync(process.execPath, [NEXT_BIN, "dev", ...ARGS], { cwd: FRONTEND, stdio: "inherit" });
  process.exit(r.status ?? 1);
}

// --- process table --------------------------------------------------------------------------
const powershell = (script, timeout = 20000) =>
  new Promise((resolve) => {
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { timeout, windowsHide: true, maxBuffer: 16 * MB }, (err, out) =>
      resolve(err ? null : out),
    );
  });

// What a process in the next dev tree is, from its command line (memory attribution only).
function roleOf(name, cmd) {
  if (/next[\\/]dist[\\/]bin[\\/]next/.test(cmd)) return "next-dev";
  if (/start-server\.js/.test(cmd)) return "next-server";
  if (/jest-worker|processChild\.js|threadChild\.js/.test(cmd)) return "route-worker";
  if (/detached-flush\.js/.test(cmd)) return "telemetry";
  if (/postcss|tailwind/i.test(cmd)) return "css-worker";
  return name || "process";
}

/** Every process as { pid, ppid, bytes, startMs, role }, or null if the table could not be read. */
async function listProcesses() {
  if (IS_WIN) {
    const out = await powershell(
      "Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,WorkingSetSize,CreationDate,Name,CommandLine | ForEach-Object { " +
        "$c = if ($_.CreationDate) { ([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds() } else { 0 }; " +
        "$l = if ($_.Name -eq 'node.exe' -and $_.CommandLine) { $_.CommandLine.Substring(0, [Math]::Min(300, $_.CommandLine.Length)) } else { '' }; " +
        '"$($_.ProcessId)|$($_.ParentProcessId)|$($_.WorkingSetSize)|$c|$($_.Name)|$l" }',
    );
    if (out == null) return null;
    const rows = [];
    for (const line of out.split(/\r?\n/)) {
      const [pid, ppid, ws, start, name, ...cmd] = line.trim().split("|");
      if (Number(pid)) rows.push({ pid: Number(pid), ppid: Number(ppid), bytes: Number(ws) || 0, startMs: Number(start) || 0, role: roleOf(name, cmd.join("|")) });
    }
    return rows;
  }
  return new Promise((resolve) => {
    execFile("ps", ["-A", "-o", "pid=,ppid=,rss=,comm="], { timeout: 20000, maxBuffer: 8 * MB }, (err, out) => {
      if (err) return resolve(null);
      const rows = [];
      for (const line of out.split(/\r?\n/)) {
        const [pid, ppid, rss, ...name] = line.trim().split(/\s+/);
        if (Number(pid)) rows.push({ pid: Number(pid), ppid: Number(ppid), bytes: Number(rss) * 1024, startMs: 0, role: name.join(" ") });
      }
      resolve(rows);
    });
  });
}

/** The run's process tree (root + descendants), or null. */
async function processTree(rootPid) {
  const rows = await listProcesses();
  if (!rows) return null;
  const children = new Map();
  for (const r of rows) (children.get(r.ppid) ?? children.set(r.ppid, []).get(r.ppid)).push(r);
  const tree = [];
  const stack = rows.filter((r) => r.pid === rootPid);
  const seen = new Set();
  while (stack.length) {
    const p = stack.pop();
    if (seen.has(p.pid)) continue;
    seen.add(p.pid);
    tree.push(p);
    stack.push(...(children.get(p.pid) ?? []));
  }
  return tree.length ? tree : null;
}

// --- ownership: which processes this supervisor started --------------------------------------
// pid -> creation time, for every process ever seen inside one of this supervisor's runs. A pid
// alone is not proof (Windows reuses pids); pid + creation time is.
const owned = new Map();
function rememberOwned(procs) {
  for (const p of procs) if (p.startMs) owned.set(p.pid, p.startMs);
  if (owned.size > 2000) for (const k of [...owned.keys()].slice(0, owned.size - 2000)) owned.delete(k);
}
const isOwned = (pid, startMs) => owned.has(pid) && !!startMs && Math.abs(owned.get(pid) - startMs) < 2000;

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
        log(`pid ${pid} did not stop gracefully — forcing its process tree`);
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
async function listChildren(pid) {
  const out = await powershell(
    `Get-CimInstance Win32_Process -Filter "ParentProcessId=${Number(pid)}" | ForEach-Object { ` +
      "$c = if ($_.CreationDate) { ([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds() } else { 0 }; " +
      '"$($_.ProcessId)|$c|$($_.CommandLine)" }',
  );
  if (out == null) return null;
  const rows = [];
  for (const line of out.split(/\r?\n/)) {
    const [p, start, ...rest] = line.split("|");
    if (Number(p)) rows.push({ pid: Number(p), startMs: Number(start) || 0, cmd: rest.join("|") });
  }
  return rows;
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

// Who listens on PORT (this supervisor's port only — never any other port).
async function describePortOwner() {
  if (!IS_WIN) return null; // no safe identification implemented: never stop anything
  const out = await powershell(
    `$c = Get-NetTCPConnection -LocalPort ${PORT} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; ` +
      "if ($c) { $p = Get-CimInstance Win32_Process -Filter \"ProcessId=$($c.OwningProcess)\"; " +
      "$t = if ($p.CreationDate) { ([DateTimeOffset]$p.CreationDate).ToUnixTimeMilliseconds() } else { 0 }; " +
      '"$($c.OwningProcess)|$t|$($p.Name)|$($p.CommandLine)" }',
  );
  const line = out?.trim();
  if (!line) return null;
  const [pid, start, name, ...cmd] = line.split("|");
  const ownerPid = Number(pid);
  if (!ownerPid) return null;
  const ours = ownerPid !== process.pid && isOwned(ownerPid, Number(start));
  const shortCmd = cmd.join("|").slice(0, 160);
  return { pid: ownerPid, ours, detail: `${name || "unknown"}${shortCmd ? `: ${shortCmd}` : ""}` };
}

async function stopPortOwner(owner) {
  if (!owner?.ours) return; // defence in depth: the core never asks for anything else
  taskkill(owner.pid, true);
  await sleep(1000);
}

// --- incidents ------------------------------------------------------------------------------
const outputTail = [];
const memoryHistory = []; // [time, treeBytes, processCount, breakdown]
const INCIDENT = /^\d{4}-\d{2}-\d{2}T.*\.log$/;

function writeIncident(kind, detail) {
  try {
    const run = supervisor.current;
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const file = path.join(LOG_DIR, `${new Date().toISOString().replace(/[:.]/g, "-")}-${kind}.log`);
    const body = [
      `reason: ${kind} — ${detail}`,
      `supervisor state: ${supervisor.state}; child pid: ${run?.pid ?? "-"}; fast start retries used: ${supervisor.startFailures}; recovery attempts: ${supervisor.recoveryAttempts}`,
      `uptime: ${run ? Math.round(((run.endedAt ?? Date.now()) - run.startedAt) / 1000) : 0}s, ready: ${!!run?.ready}`,
      `exit: ${run?.proc ? describeExit(run.proc.exitCode, run.proc.signalCode) : "-"}`,
      `system RAM: ${fmt(TOTAL)} total, ${fmt(os.freemem())} free; tree limit ${fmt(MAX_TREE_BYTES)}; supervisor uptime ${Math.round(process.uptime())}s`,
      "",
      "memory samples (time, next dev tree, processes, largest):",
      ...memoryHistory.map(([t, b, n, top]) => `  ${new Date(t).toISOString()}  ${fmt(b)}  ${n} procs  ${top}`),
      "",
      "last output:",
      ...outputTail,
    ].join("\n");
    fs.writeFileSync(file, body);
    const incidents = fs.readdirSync(LOG_DIR).filter((f) => INCIDENT.test(f)).sort();
    for (const old of incidents.slice(0, -20)) fs.rmSync(path.join(LOG_DIR, old), { force: true });
    if (kind === "start-failure" || kind === "worker-failure") void appendWindowsDiagnostics(file);
    return path.relative(FRONTEND, file);
  } catch (err) {
    log(`could not write incident log: ${err.message}`);
    return null;
  }
}

// Evidence for the next 0xC0000142: was the machine out of commit/physical memory, how many
// processes and handles existed, and could THIS supervisor start any process at all?
async function appendWindowsDiagnostics(file) {
  if (!IS_WIN) return;
  try {
    const probe = spawnSync("cmd.exe", ["/d", "/c", "exit 0"], { windowsHide: true, timeout: 10000 });
    const probeResult = probe.error ? `spawn error ${probe.error.code || probe.error.message}` : `exit ${describeExit(probe.status, probe.signal)}`;
    const out = await powershell(
      "$o = Get-CimInstance Win32_OperatingSystem; $me = Get-Process -Id " + process.pid + "; " +
        '"commit used: $([math]::Round(($o.TotalVirtualMemorySize - $o.FreeVirtualMemory) / 1MB, 1))GB of $([math]::Round($o.TotalVirtualMemorySize / 1MB, 1))GB limit; ' +
        'free physical: $([math]::Round($o.FreePhysicalMemory / 1MB, 1))GB; processes: $($o.NumberOfProcesses); ' +
        'conhost: $(@(Get-Process conhost -ErrorAction SilentlyContinue).Count); node: $(@(Get-Process node -ErrorAction SilentlyContinue).Count); ' +
        'supervisor handles: $($me.HandleCount)"',
    );
    fs.appendFileSync(file, [
      "",
      "windows snapshot:",
      `  ${out?.trim() || "unavailable"}`,
      `  trivial process start from this supervisor (cmd /c exit 0): ${probeResult}`,
      "  (if the trivial start also fails, process creation is failing for this supervisor/session as a whole, not just for next dev)",
      "",
    ].join("\n"));
  } catch {}
}

// --- supervisor -----------------------------------------------------------------------------
const supervisor = createSupervisor({
  label: "next dev",
  port: PORT,
  spawnChild: () => {
    const env = { ...process.env };
    if (process.stdout.isTTY && !env.NO_COLOR) env.FORCE_COLOR ??= "1";
    const child = spawn(process.execPath, [NEXT_BIN, "dev", ...ARGS], {
      cwd: FRONTEND,
      env,
      stdio: ["inherit", "pipe", "pipe"],
      detached: !IS_WIN, // own process group on POSIX so the whole tree can be signalled
      windowsHide: true,
    });
    if (Number.isInteger(child.pid)) owned.set(child.pid, 0); // creation time filled in by the first sample
    return child;
  },
  stopTree,
  portFree,
  probeReady,
  describePortOwner,
  stopPortOwner,
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
  healthyResetMs: HEALTHY_RESET_MS,
  maxRestarts: MAX_RESTARTS,
  restartWindowMs: RESTART_WINDOW_MS,
});

// --- memory monitor -------------------------------------------------------------------------
const guard = createMemoryGuard({ limitBytes: MAX_TREE_BYTES, samplesRequired: SAMPLES, lowFreeBytes: LOW_FREE_BYTES });
let sampledRun = null;

function breakdown(tree) {
  const byRole = new Map();
  for (const p of tree) {
    const e = byRole.get(p.role) ?? { bytes: 0, count: 0 };
    e.bytes += p.bytes;
    e.count++;
    byRole.set(p.role, e);
  }
  return [...byRole.entries()]
    .sort((a, b) => b[1].bytes - a[1].bytes)
    .slice(0, 4)
    .map(([role, e]) => `${role}${e.count > 1 ? `x${e.count}` : ""}=${(e.bytes / MB).toFixed(0)}MB`)
    .join(" ");
}

async function sample() {
  const run = supervisor.current;
  if (supervisor.state !== STATES.RUNNING || !run) return;
  if (run !== sampledRun) (sampledRun = run), guard.reset();
  const tree = await processTree(run.pid);
  if (!tree || supervisor.current !== run || supervisor.state !== STATES.RUNNING) return;
  rememberOwned(tree);
  const bytes = tree.reduce((s, p) => s + p.bytes, 0);
  const free = os.freemem();
  const top = breakdown(tree);
  memoryHistory.push([Date.now(), bytes, tree.length, top]);
  if (memoryHistory.length > 60) memoryHistory.shift();
  appendBounded("memory.csv", `${new Date().toISOString()},${run.pid},${(bytes / MB).toFixed(0)},${tree.length},${(free / MB).toFixed(0)},${top}\n`);

  const verdict = guard.observe({ treeBytes: bytes, freeBytes: free });
  if (verdict.status === "watch" && verdict.highSamples === 1 && verdict.reason !== "near-limit") {
    log(`next dev is using ${fmt(bytes)} (${tree.length} processes: ${top}; limit ${fmt(MAX_TREE_BYTES)}, ${fmt(free)} RAM free) — watching`);
  }
  if (verdict.status === "restart") {
    if (supervisor.monitoringDisabled) return; // restart budget used up; sampling still records
    supervisor.requestRestart(
      "memory",
      `next dev stayed ${verdict.reason === "over-limit" ? "above its limit" : "large while the machine was nearly out of RAM"} for ${verdict.highSamples} samples: ${fmt(bytes)} (${top}; limit ${fmt(MAX_TREE_BYTES)}, ${fmt(free)} RAM free)`,
    );
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
const onSignal = (sig) => {
  log(`${sig} received — stopping next dev`);
  setTimeout(() => {
    log("shutdown is taking too long — exiting");
    process.exit(1);
  }, SHUTDOWN_HARD_LIMIT_MS).unref();
  void supervisor.shutdown(0);
};
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) {
  try {
    process.on(sig, () => onSignal(sig));
  } catch {}
}
process.on("exit", (code) => appendBounded("supervisor.log", `${new Date().toISOString()} pid=${process.pid} supervisor exiting (code ${code})\n`));
// A bug in the supervisor must not take the running dev server down with it; say so loudly instead.
process.on("unhandledRejection", (err) => log(`internal error (supervisor kept running): ${err?.stack || err}`));
process.on("uncaughtException", (err) => log(`internal error (supervisor kept running): ${err?.stack || err}`));

log(
  `watching next dev on port ${PORT}: memory limit ${fmt(MAX_TREE_BYTES)} of ${fmt(TOTAL)} RAM (low-RAM rule below ${fmt(LOW_FREE_BYTES)} free), ` +
    `${SAMPLES} samples every ${INTERVAL_MS / 1000}s; ${MAX_RESTARTS} restarts / 30 min; start-failure retries ~15s/30s/60s then every 2–10 min`,
);
supervisor.start();
