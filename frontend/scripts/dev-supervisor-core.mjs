// Restart state machine for dev-supervisor.mjs. Everything that touches the OS (spawning, killing,
// ports, the dev cache, clocks, randomness) is injected, so the whole lifecycle is testable with
// fakes (dev-supervisor.test.mjs).
//
// One child "run" exists at a time. Every run ends exactly once (spawn failure, exit, or deliberate
// stop), and at most one restart workflow — a single timer slot or a single in-flight start — exists
// at any moment. Outcomes of an ended run:
//
//   start failure  spawn itself failed, or the process died with a Windows process-start status
//                  (0xC0000142 STATUS_DLL_INIT_FAILED) — possibly transient, so retried with
//                  exponential backoff (15s / 30s / 60s, ±jitter). Never touches the dev cache.
//   crash          any other unexpected exit (including a worker crash) — short backoff, shared
//                  restart budget, cache clear after repeated startup crashes.
//   clean/Ctrl+C   exit 0 or an interrupt — the supervisor exits too, no restart.
//
// When a fast retry budget is used up the supervisor does NOT exit (which used to leave localhost
// down until someone noticed): it enters RECOVERING and keeps retrying slowly (2 min, doubling to a
// 10 min cap, ±jitter) until a start succeeds or the user presses Ctrl+C.
//
// A run counts as ready once Next prints its ready line AND the port accepts connections. The
// failure counters (and RECOVERING) are only reset after the run has then stayed up for
// `healthyResetMs` — a process that prints "Ready" and dies a minute later does not wipe the history.

export const STATES = Object.freeze({
  IDLE: "IDLE",
  STARTING: "STARTING",
  RUNNING: "RUNNING",
  STOPPING: "STOPPING",
  WAITING_TO_RESTART: "WAITING_TO_RESTART",
  RECOVERING: "RECOVERING", // fast retries exhausted — slow retries continue until success or Ctrl+C
  FAILED: "FAILED", // only reached through an explicit stop; no automatic path leads here
  SHUTTING_DOWN: "SHUTTING_DOWN",
});
const S = STATES;

export const STATUS_DLL_INIT_FAILED = 0xc0000142;
export const STATUS_CONTROL_C_EXIT = 0xc000013a;
const START_FAILURE_CODES = new Set([STATUS_DLL_INIT_FAILED]);
const STATUS_NAMES = new Map([
  [STATUS_DLL_INIT_FAILED, "STATUS_DLL_INIT_FAILED"],
  [STATUS_CONTROL_C_EXIT, "STATUS_CONTROL_C_EXIT"],
  [0xc0000005, "STATUS_ACCESS_VIOLATION"],
  [0xc0000409, "STATUS_STACK_BUFFER_OVERRUN"],
]);

/**
 * Exit code as a number, or null when it is not a usable code. Windows NTSTATUS values are sometimes
 * reported signed (-1073741502) or as hex text ("0xC0000142"); both normalize to the unsigned value.
 * Small negatives are libuv errnos from a failed spawn and are kept as they are.
 */
export function normalizeExitCode(code) {
  let v = code;
  if (typeof v === "bigint") v = Number(v);
  if (typeof v === "string") {
    const s = v.trim();
    if (/^0x[0-9a-f]{1,8}$/i.test(s)) v = parseInt(s, 16);
    else if (/^-?\d+$/.test(s)) v = Number(s);
    else return null;
  }
  if (!Number.isSafeInteger(v) || v < -0x80000000 || v > 0xffffffff) return null;
  return v < -0xffff ? v >>> 0 : v;
}

export function describeExit(code, signal) {
  const v = normalizeExitCode(code);
  if (v === null) return signal ? `signal ${signal}` : `unknown (${String(code)})`;
  if (v <= 0xffff) return String(v);
  const hex = `0x${v.toString(16).toUpperCase().padStart(8, "0")}`;
  return STATUS_NAMES.has(v) ? `${hex} (${STATUS_NAMES.get(v)})` : hex;
}

/** @returns {"start-failure" | "interrupted" | "clean" | "crash"} */
export function classifyExit({ code, signal, spawned }) {
  if (!spawned) return "start-failure"; // no usable process ever existed
  const v = normalizeExitCode(code);
  if (v !== null && START_FAILURE_CODES.has(v)) return "start-failure";
  if (signal === "SIGINT" || signal === "SIGTERM" || v === 130 || v === STATUS_CONTROL_C_EXIT) return "interrupted";
  return v === 0 ? "clean" : "crash";
}

/** `ms` ± `ratio` (random() = 0.5 gives exactly `ms`). */
export function withJitter(ms, ratio, random = Math.random) {
  if (!ratio) return ms;
  return Math.max(0, Math.round(ms * (1 + ratio * (2 * random() - 1))));
}

/**
 * Memory decision for the `next dev` process tree, with hysteresis. One observation per sample:
 *  - "high" = the tree is above `limitBytes`, or the machine is nearly out of RAM
 *    (free < `lowFreeBytes`) while the tree holds at least `lowFreeTreeRatio` of the limit;
 *  - `samplesRequired` consecutive high samples → "restart" (then the count starts again);
 *  - a sample that is no longer high but still above `clearRatio` of the limit neither counts nor
 *    resets ("watch"), so a tree hovering at the threshold cannot flip in and out of the countdown;
 *  - only a sample clearly below (≤ clearRatio, and not low on RAM) resets the count.
 */
export function createMemoryGuard({ limitBytes, samplesRequired = 3, lowFreeBytes = 0, lowFreeTreeRatio = 0.5, clearRatio = 0.9 }) {
  let high = 0;
  return {
    get highSamples() {
      return high;
    },
    reset() {
      high = 0;
    },
    /** @returns {{ status: "ok" | "watch" | "restart", reason: string, highSamples: number }} */
    observe({ treeBytes, freeBytes }) {
      const overLimit = treeBytes > limitBytes;
      const lowRam = freeBytes < lowFreeBytes && treeBytes > limitBytes * lowFreeTreeRatio;
      if (overLimit || lowRam) {
        high++;
        const reason = overLimit ? "over-limit" : "low-system-memory";
        if (high >= samplesRequired) {
          const n = high;
          high = 0;
          return { status: "restart", reason, highSamples: n };
        }
        return { status: "watch", reason, highSamples: high };
      }
      if (high > 0 && treeBytes > limitBytes * clearRatio) return { status: "watch", reason: "near-limit", highSamples: high };
      high = 0;
      return { status: "ok", reason: "", highSamples: 0 };
    },
  };
}

/**
 * @param {object} o
 * @param {() => import("node:child_process").ChildProcess} o.spawnChild may throw
 * @param {(run: object) => Promise<void>} o.stopTree stop the run's process tree (graceful, then forced) and any leftovers
 * @param {() => Promise<boolean>} o.portFree
 * @param {() => Promise<boolean>} o.probeReady
 * @param {(opts: {force: boolean, reason?: string}) => Promise<unknown>} o.prepareStart dev-cache check before a start
 * @param {() => Promise<{pid: number, ours: boolean, detail: string} | null>} [o.describePortOwner]
 *        who holds the port; `ours` only when it is verifiably a leftover of a previous run of THIS supervisor
 * @param {(owner: object) => Promise<void>} [o.stopPortOwner] only ever called for an owner with `ours: true`
 */
export function createSupervisor(o) {
  const {
    label = "next dev",
    port,
    spawnChild,
    stopTree,
    portFree,
    probeReady,
    prepareStart = async () => {},
    describePortOwner = async () => null,
    stopPortOwner = async () => {},
    writeIncident = () => null,
    onOutputLine = () => {},
    log,
    exit,
    stdout,
    stderr,
    clock = { now: Date.now, setTimeout, clearTimeout },
    random = Math.random,
    jitterRatio = 0.2,
    readyPattern = /Ready in/,
    workerFailurePattern = null,
    startupGraceMs = 60_000,
    healthyResetMs = 10 * 60_000,
    maxRestarts = 3,
    restartWindowMs = 30 * 60_000,
    startFailureDelaysMs = [15_000, 30_000, 60_000],
    recoveryDelayMs = 2 * 60_000,
    recoveryMaxDelayMs = 10 * 60_000,
    exitGraceMs = 500,
    portWaitMs = 15_000,
    portPollMs = 500,
    readyProbeIntervalMs = 1_000,
    readyProbeAttempts = 60,
  } = o;

  let state = S.IDLE;
  let current = null; // latest run; stays set after it ends so the next start can clean up after it
  let timer = null; // the single pending restart/decision timer
  let runSeq = 0;
  let startFailures = 0; // fast start-failure retries used in the current failure event
  let startupFailures = 0; // early crashes (crash policy)
  let recoveryAttempts = 0; // slow retries made while RECOVERING
  let recovering = false; // a deliberate restart or a failure event is in progress
  let restartsPausedUntil = 0; // deliberate (memory/worker) restarts are paused until then
  const restartTimes = [];

  const shuttingDown = () => state === S.SHUTTING_DOWN || state === S.FAILED;
  const sleep = (ms) => new Promise((r) => clock.setTimeout(r, ms));
  const isAlive = (run) => !!(run && run.spawned && run.proc && run.proc.exitCode === null && run.proc.signalCode === null);
  const at = (ms) => new Date(clock.now() + ms).toISOString();
  const secs = (ms) => `${Math.round(ms / 1000)}s`;

  function setState(next, why) {
    if (state === next) return;
    log(`state ${state} → ${next}${why ? ` (${why})` : ""}`);
    state = next;
  }

  function internalError(context, err) {
    log(`internal error while ${context}: ${err?.stack || err} — supervisor kept running`);
  }

  function cancelTimer() {
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
  }
  function schedule(ms, fn, context) {
    cancelTimer();
    const handle = clock.setTimeout(() => {
      if (timer !== handle) return;
      timer = null;
      try {
        const r = fn();
        if (r && typeof r.catch === "function") r.catch((err) => internalError(context, err));
      } catch (err) {
        internalError(context, err);
      }
    }, ms);
    timer = handle;
  }

  function pruneRestarts() {
    const now = clock.now();
    while (restartTimes.length && now - restartTimes[0] > restartWindowMs) restartTimes.shift();
  }
  function restartAllowed() {
    pruneRestarts();
    return restartTimes.length < maxRestarts;
  }

  // --- output ---------------------------------------------------------------------------------
  function pipe(run, stream, target) {
    let partial = "";
    stream.on("data", (chunk) => {
      try {
        target.write(chunk);
      } catch {}
      const lines = (partial + chunk.toString()).split(/\r?\n/);
      partial = lines.pop().slice(-65536);
      for (const line of lines) {
        try {
          onOutputLine(line);
          inspect(run, line);
        } catch (err) {
          internalError("reading output", err);
        }
      }
    });
    stream.on("error", (err) => log(`${label} output stream error: ${err.message}`));
  }

  function inspect(run, line) {
    if (run !== current || run.settled || run.stopRequested) return; // output from a replaced run
    if (!run.ready && !run.probing && readyPattern.test(line)) startReadyProbe(run);
    if (workerFailurePattern?.test(line)) {
      requestRestart("worker-failure", "Next's route worker process crashed (often the machine was short of memory or could not start a process)");
    }
  }

  // --- readiness ------------------------------------------------------------------------------
  function startReadyProbe(run) {
    run.probing = true;
    let tries = 0;
    const stale = () => run !== current || run.settled || run.stopRequested || state !== S.STARTING;
    const check = async () => {
      run.probeTimer = null;
      if (stale()) return;
      let ok = false;
      try {
        ok = await probeReady();
      } catch (err) {
        log(`readiness check failed: ${err?.message || err}`);
      }
      if (stale()) return;
      if (ok) return markReady(run);
      if (++tries >= readyProbeAttempts) {
        log(`${label} printed its ready line but port ${port} is not accepting connections — not treating it as healthy yet`);
        return;
      }
      run.probeTimer = clock.setTimeout(() => void check().catch((err) => internalError("checking readiness", err)), readyProbeIntervalMs);
    };
    void check().catch((err) => internalError("checking readiness", err));
  }

  function markReady(run) {
    run.ready = true;
    run.readyAt = clock.now();
    cancelTimer();
    setState(S.RUNNING, "ready line seen and port responding");
    log(`${label} became ready (pid ${run.pid}, port ${port} responding)`);
    if (recovering || startFailures > 0 || startupFailures > 0 || recoveryAttempts > 0) {
      log(`restart recovery successful — failure counters reset once it stays healthy for ${secs(healthyResetMs)}`);
    }
    run.healthyTimer = clock.setTimeout(() => {
      run.healthyTimer = null;
      if (run !== current || run.settled || state !== S.RUNNING) return;
      const had = startFailures + startupFailures + recoveryAttempts > 0 || recovering;
      startFailures = 0;
      startupFailures = 0;
      recoveryAttempts = 0;
      recovering = false;
      if (had) log(`${label} healthy for ${secs(healthyResetMs)} — failure counters reset`);
    }, healthyResetMs);
  }

  // --- starting -------------------------------------------------------------------------------
  async function startAttempt({ forceCacheClear = false, retry = false } = {}) {
    cancelTimer();
    if (shuttingDown()) return;
    const prev = current;
    if (prev) {
      clearRunTimers(prev); // a run being replaced can no longer become "healthy"
      if (isAlive(prev)) {
        prev.stopRequested = true;
        setState(S.STOPPING, `stopping pid ${prev.pid}`);
      }
      try {
        await stopTree(prev);
      } catch (err) {
        log(`stopping the previous ${label} failed: ${err?.message || err}`);
      }
      if (shuttingDown()) return;
      if (isAlive(prev)) return startBlocked(`the previous ${label} process (pid ${prev.pid}) is still running`);
    }
    setState(S.STARTING);
    if (!(await waitForPortFree())) {
      if (shuttingDown()) return;
      if (!(await reclaimPort())) {
        if (shuttingDown()) return;
        return startBlocked(`port ${port} is still in use`);
      }
    }
    if (shuttingDown()) return;
    try {
      // A process-start failure is never a cache problem: retries only get the routine size check.
      await prepareStart({ force: forceCacheClear && !retry, reason: `${label} failed to start twice — clearing possibly stale cache` });
    } catch (err) {
      log(`dev cache check failed (${err?.message || err}) — starting anyway`);
    }
    if (shuttingDown()) return;
    spawnRun(retry);
  }

  async function waitForPortFree() {
    for (let waited = 0; ; waited += portPollMs) {
      let free = false;
      try {
        free = await portFree();
      } catch (err) {
        log(`port check failed: ${err?.message || err}`);
      }
      if (free) return true;
      if (waited >= portWaitMs || shuttingDown()) return false;
      await sleep(portPollMs);
    }
  }

  // The port is still taken after waiting. Only a process verifiably left behind by one of this
  // supervisor's own runs is stopped; anything else (another dev server, an unrelated app) is
  // reported and left alone.
  async function reclaimPort() {
    let owner = null;
    try {
      owner = await describePortOwner();
    } catch (err) {
      log(`could not identify the process holding port ${port}: ${err?.message || err}`);
    }
    if (!owner) {
      log(`port ${port} is held by a process that could not be identified — leaving it alone`);
      return false;
    }
    if (!owner.ours) {
      log(`port ${port} is held by pid ${owner.pid} (${owner.detail}), which this supervisor did not start — leaving it alone`);
      return false;
    }
    log(`port ${port} is held by pid ${owner.pid} (${owner.detail}), a leftover of this supervisor's previous ${label} — stopping it`);
    try {
      await stopPortOwner(owner);
    } catch (err) {
      log(`stopping leftover pid ${owner.pid} failed: ${err?.message || err}`);
    }
    if (shuttingDown()) return false;
    return waitForPortFree();
  }

  function spawnRun(retry) {
    const run = { id: ++runSeq, proc: null, pid: undefined, startedAt: clock.now(), endedAt: null, readyAt: null };
    Object.assign(run, { spawned: false, settled: false, ready: false, probing: false, probeTimer: null, healthyTimer: null, stopRequested: false });
    current = run;
    const attempt = state === S.STARTING && recoveryAttempts > 0 && retry
      ? ` (recovery attempt ${recoveryAttempts})`
      : retry ? ` (restart attempt ${startFailures}/${startFailureDelaysMs.length})` : "";
    log(`starting ${label}${attempt}`);
    let proc;
    try {
      proc = spawnChild();
    } catch (err) {
      return runEnded(run, { error: err });
    }
    run.proc = proc;
    run.pid = proc?.pid;
    run.spawned = Number.isInteger(run.pid); // Node only assigns a pid when the OS created the process
    if (!proc || typeof proc.on !== "function") return runEnded(run, { error: new Error("spawn returned no process") });
    if (run.spawned) log(`${label} spawned (pid ${run.pid})`);
    proc.on("error", (err) => {
      if (!run.spawned) runEnded(run, { error: err });
      else log(`${label} process error: ${err?.message || err}`); // e.g. a failed kill; its exit decides
    });
    proc.on("exit", (code, signal) => runEnded(run, { code, signal }));
    if (proc.stdout) pipe(run, proc.stdout, stdout);
    if (proc.stderr) pipe(run, proc.stderr, stderr);
  }

  // --- a run ended ----------------------------------------------------------------------------
  function clearRunTimers(run) {
    if (run.probeTimer !== null) clock.clearTimeout(run.probeTimer);
    if (run.healthyTimer !== null) clock.clearTimeout(run.healthyTimer);
    run.probeTimer = run.healthyTimer = null;
  }

  function runEnded(run, { code = null, signal = null, error = null }) {
    if (run.settled) return; // spawn "error" followed by "exit"/"close" is one failure, not two
    run.settled = true;
    run.endedAt = clock.now();
    clearRunTimers(run);
    if (run !== current || run.stopRequested || shuttingDown()) return; // replaced or stopped on purpose

    const kind = error ? "start-failure" : classifyExit({ code, signal, spawned: run.spawned });
    setState(S.WAITING_TO_RESTART, `pid ${run.pid ?? "-"} ended: ${error ? `spawn error ${error.code || error.message}` : describeExit(code, signal)}`);
    // Short grace so a Ctrl+C that also reached the child is handled as a shutdown, not a crash.
    schedule(exitGraceMs, () => decide(run, kind, { code, signal, error }), "handling a child exit");
  }

  function decide(run, kind, { code, signal, error }) {
    if (state !== S.WAITING_TO_RESTART || run !== current) return;
    if (kind === "clean" || kind === "interrupted") {
      setState(S.SHUTTING_DOWN, kind === "clean" ? "child exited cleanly" : "child was interrupted");
      return exit(normalizeExitCode(code) ?? 0);
    }
    const uptime = run.spawned ? `, uptime ${secs(run.endedAt - run.startedAt)}` : "";
    if (error) {
      log(`${label} could not be started`);
      log(`error: ${[error.code, error.message].filter(Boolean).join(" ")}`);
    } else {
      log(`${label} exited unexpectedly (pid ${run.pid}${uptime})`);
      log(`exit code: ${describeExit(code, signal)}`);
    }
    const detail = error ? `spawn failed (${error.code || error.message})` : `exited with ${describeExit(code, signal)}`;
    recovering = true;
    if (kind === "start-failure") return startFailed(`${label} ${detail}`);
    return crashed(run, `${label} exited unexpectedly (code ${describeExit(code, signal)})`, code);
  }

  function startBlocked(reason) {
    log(`${reason} — not starting a second ${label}`);
    recovering = true;
    startFailed(`${label} could not be started: ${reason}`);
  }

  function startFailed(detail) {
    const file = writeIncident("start-failure", detail);
    log(`restart reason: start-failure — classified as transient process-start failure (${detail})`);
    if (state === S.RECOVERING || recoveryAttempts > 0 || startFailures >= startFailureDelaysMs.length) {
      return enterRecovery(`${label} could not be started after ${startFailures} fast retries`, file);
    }
    startFailures++;
    const delay = withJitter(startFailureDelaysMs[startFailures - 1], jitterRatio, random);
    setState(S.WAITING_TO_RESTART, "start failure");
    log(`restart attempt ${startFailures}/${startFailureDelaysMs.length} scheduled in ${secs(delay)} at ${at(delay)}${file ? ` (details: ${file})` : ""}`);
    schedule(delay, () => startAttempt({ retry: true }), "restarting");
  }

  function crashed(run, detail, code) {
    const early = !run.ready || clock.now() - run.startedAt < startupGraceMs;
    if (early) startupFailures++;
    const file = writeIncident("crash", detail);
    log(`restart reason: crash${early ? " during startup" : ""} — ${detail}`);
    if (state === S.RECOVERING || recoveryAttempts > 0) return enterRecovery(detail, file);
    if (startupFailures > 3 || !restartAllowed()) return enterRecovery(`${detail} — crash restart budget used up`, file);
    restartTimes.push(clock.now());
    const delay = Math.min(10_000, 1000 * 2 ** startupFailures);
    setState(S.WAITING_TO_RESTART, "crash");
    log(`restarting in ${secs(delay)} at ${at(delay)}${file ? ` (details: ${file})` : ""}`);
    schedule(delay, () => startAttempt({ forceCacheClear: startupFailures >= 2 }), "restarting");
  }

  // Fast retries are used up. Keep trying, slowly, instead of exiting and leaving localhost down.
  function enterRecovery(reason, file) {
    recoveryAttempts++;
    const base = Math.min(recoveryMaxDelayMs, recoveryDelayMs * 2 ** (recoveryAttempts - 1));
    const delay = withJitter(base, jitterRatio, random);
    if (state !== S.RECOVERING) {
      log(`${reason}. Fast retries exhausted — automatic recovery continues with slow retries (Ctrl+C stops the supervisor).`);
    }
    setState(S.RECOVERING, reason);
    log(`recovery attempt ${recoveryAttempts} scheduled in ${secs(delay)} at ${at(delay)}${file ? ` (details: ${file})` : ""}`);
    schedule(delay, () => startAttempt({ retry: true }), "recovering");
  }

  // --- public ---------------------------------------------------------------------------------
  /** Deliberate restart of a live but unhealthy child (memory ceiling, worker failure). */
  function requestRestart(kind, detail) {
    const run = current;
    if (!run || run.settled || run.stopRequested || (state !== S.RUNNING && state !== S.STARTING)) return false;
    if (clock.now() < restartsPausedUntil) return false;
    const file = writeIncident(kind, detail);
    if (!restartAllowed()) {
      restartsPausedUntil = restartTimes[0] + restartWindowMs;
      log(`${detail}. Already restarted ${restartTimes.length}x in ${restartWindowMs / 60_000} min — not restarting again until ${new Date(restartsPausedUntil).toISOString()} to avoid a loop.`);
      if (file) log(`Details: ${file}`);
      return false;
    }
    restartTimes.push(clock.now());
    recovering = true;
    run.stopRequested = true;
    setState(S.STOPPING, `restart reason: ${kind}`);
    log(`restart reason: ${kind} — ${detail} — restarting ${label} (pid ${run.pid})${file ? ` (details: ${file})` : ""}`);
    startAttempt().catch((err) => {
      internalError("restarting", err);
      if (!shuttingDown()) startFailed(`${label} restart failed: ${err?.message || err}`);
    });
    return true;
  }

  function start() {
    if (state !== S.IDLE) return;
    startAttempt().catch((err) => {
      internalError("starting", err);
      if (!shuttingDown()) startFailed(`${label} start failed: ${err?.message || err}`);
    });
  }

  async function shutdown(code = 0) {
    if (state === S.SHUTTING_DOWN) return;
    setState(S.SHUTTING_DOWN, "shutdown requested");
    cancelTimer();
    const run = current;
    if (run) {
      run.stopRequested = true;
      clearRunTimers(run);
      try {
        await stopTree(run);
        log(`${label} stopped${run.pid ? ` (pid ${run.pid})` : ""}`);
      } catch (err) {
        log(`stopping ${label} failed: ${err?.message || err}`);
      }
    }
    exit(code);
  }

  return {
    start,
    shutdown,
    requestRestart,
    get state() {
      return state;
    },
    get current() {
      return current;
    },
    get startFailures() {
      return startFailures;
    },
    get startupFailures() {
      return startupFailures;
    },
    get recoveryAttempts() {
      return recoveryAttempts;
    },
    /** Deliberate restarts are paused (restart budget used up) — memory sampling still records. */
    get monitoringDisabled() {
      return clock.now() < restartsPausedUntil;
    },
    hasPendingTimer: () => timer !== null,
  };
}
