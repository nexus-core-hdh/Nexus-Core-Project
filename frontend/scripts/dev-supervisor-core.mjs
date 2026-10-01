// Restart state machine for dev-supervisor.mjs. Everything that touches the OS (spawning, killing,
// ports, the dev cache, clocks) is injected, so the whole lifecycle is testable with fakes
// (dev-supervisor.test.mjs).
//
// One child "run" exists at a time. Every run ends exactly once (spawn failure, exit, or deliberate
// stop), and at most one restart workflow — a single timer slot or a single in-flight start — exists
// at any moment. Outcomes of an ended run:
//
//   start failure  spawn itself failed, or the process died with a Windows process-start status
//                  (0xC0000142 STATUS_DLL_INIT_FAILED) — possibly transient, so retried after
//                  15s / 30s / 60s, then given up. Never touches the dev cache.
//   crash          any other unexpected exit — the supervisor's original crash policy (short backoff,
//                  shared restart budget, cache clear after repeated startup crashes).
//   clean/Ctrl+C   exit 0 or an interrupt — the supervisor exits too, no restart.
//
// A run counts as healthy only once Next prints its ready line AND the port accepts connections;
// only then are the failure counters reset.

export const STATES = Object.freeze({
  IDLE: "IDLE",
  STARTING: "STARTING",
  RUNNING: "RUNNING",
  STOPPING: "STOPPING",
  WAITING_TO_RESTART: "WAITING_TO_RESTART",
  FAILED: "FAILED",
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

/**
 * @param {object} o
 * @param {() => import("node:child_process").ChildProcess} o.spawnChild may throw
 * @param {(run: object) => Promise<void>} o.stopTree stop the run's process tree (graceful, then forced) and any leftovers
 * @param {() => Promise<boolean>} o.portFree
 * @param {() => Promise<boolean>} o.probeReady
 * @param {(opts: {force: boolean, reason?: string}) => Promise<unknown>} o.prepareStart dev-cache check before a start
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
    writeIncident = () => null,
    onOutputLine = () => {},
    log,
    exit,
    stdout,
    stderr,
    clock = { now: Date.now, setTimeout, clearTimeout },
    readyPattern = /Ready in/,
    workerFailurePattern = null,
    startupGraceMs = 60_000,
    maxRestarts = 3,
    restartWindowMs = 30 * 60_000,
    startFailureDelaysMs = [15_000, 30_000, 60_000],
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
  let startFailures = 0; // consecutive start failures in the current failure event
  let startupFailures = 0; // early crashes (original crash policy)
  let recovering = false; // a deliberate restart is in progress
  let monitoringDisabled = false;
  const restartTimes = [];

  const shuttingDown = () => state === S.SHUTTING_DOWN || state === S.FAILED;
  const sleep = (ms) => new Promise((r) => clock.setTimeout(r, ms));
  const isAlive = (run) => !!(run && run.spawned && run.proc && run.proc.exitCode === null && run.proc.signalCode === null);

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

  function restartAllowed() {
    const now = clock.now();
    while (restartTimes.length && now - restartTimes[0] > restartWindowMs) restartTimes.shift();
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
      requestRestart("worker-failure", "Next's route worker process crashed (usually the machine ran out of memory)");
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
    const recovered = startFailures > 0 || startupFailures > 0 || recovering;
    cancelTimer();
    startFailures = 0;
    startupFailures = 0;
    recovering = false;
    state = S.RUNNING;
    log(`${label} became ready (port ${port} responding)`);
    if (recovered) {
      log("restart recovery successful");
      log("failure counter reset");
    }
  }

  // --- starting -------------------------------------------------------------------------------
  async function startAttempt({ forceCacheClear = false, retry = false } = {}) {
    cancelTimer();
    if (shuttingDown()) return;
    const prev = current;
    if (prev) {
      if (isAlive(prev)) {
        prev.stopRequested = true;
        state = S.STOPPING;
      }
      try {
        await stopTree(prev);
      } catch (err) {
        log(`stopping the previous ${label} failed: ${err?.message || err}`);
      }
      if (shuttingDown()) return;
      if (isAlive(prev)) return startBlocked(`the previous ${label} process (pid ${prev.pid}) is still running`);
    }
    state = S.STARTING;
    if (!(await waitForPortFree())) {
      if (shuttingDown()) return;
      return startBlocked(`port ${port} is still in use`);
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

  function spawnRun(retry) {
    const run = { id: ++runSeq, proc: null, pid: undefined, startedAt: clock.now(), endedAt: null };
    Object.assign(run, { spawned: false, settled: false, ready: false, probing: false, probeTimer: null, stopRequested: false });
    current = run;
    log(`starting ${label}${retry ? ` (restart attempt ${startFailures}/${startFailureDelaysMs.length})` : ""}`);
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
    proc.on("error", (err) => {
      if (!run.spawned) runEnded(run, { error: err });
      else log(`${label} process error: ${err?.message || err}`); // e.g. a failed kill; its exit decides
    });
    proc.on("exit", (code, signal) => runEnded(run, { code, signal }));
    if (proc.stdout) pipe(run, proc.stdout, stdout);
    if (proc.stderr) pipe(run, proc.stderr, stderr);
  }

  // --- a run ended ----------------------------------------------------------------------------
  function runEnded(run, { code = null, signal = null, error = null }) {
    if (run.settled) return; // spawn "error" followed by "exit"/"close" is one failure, not two
    run.settled = true;
    run.endedAt = clock.now();
    if (run.probeTimer !== null) clock.clearTimeout(run.probeTimer);
    if (run !== current || run.stopRequested || shuttingDown()) return; // replaced or stopped on purpose

    const kind = error ? "start-failure" : classifyExit({ code, signal, spawned: run.spawned });
    state = S.WAITING_TO_RESTART;
    // Short grace so a Ctrl+C that also reached the child is handled as a shutdown, not a crash.
    schedule(exitGraceMs, () => decide(run, kind, { code, signal, error }), "handling a child exit");
  }

  function decide(run, kind, { code, signal, error }) {
    if (state !== S.WAITING_TO_RESTART || run !== current) return;
    if (kind === "clean" || kind === "interrupted") {
      state = S.SHUTTING_DOWN;
      return exit(normalizeExitCode(code) ?? 0);
    }
    if (error) {
      log(`${label} could not be started`);
      log(`error: ${[error.code, error.message].filter(Boolean).join(" ")}`);
    } else {
      log(`${label} exited unexpectedly`);
      log(`exit code: ${describeExit(code, signal)}`);
    }
    const detail = error ? `spawn failed (${error.code || error.message})` : `exited with ${describeExit(code, signal)}`;
    if (kind === "start-failure") return startFailed(`${label} ${detail}`);
    return crashed(run, `${label} exited unexpectedly (code ${describeExit(code, signal)})`, code);
  }

  function startBlocked(reason) {
    log(`${reason} — not starting a second ${label}`);
    startFailed(`${label} could not be started: ${reason}`);
  }

  function startFailed(detail) {
    const file = writeIncident("start-failure", detail);
    log("classified as transient process-start failure");
    if (startFailures >= startFailureDelaysMs.length) return giveUp(`${label} could not be recovered after ${startFailures} attempts`, file, 1);
    startFailures++;
    const delay = startFailureDelaysMs[startFailures - 1];
    state = S.WAITING_TO_RESTART;
    log(`restart attempt ${startFailures}/${startFailureDelaysMs.length} scheduled in ${delay / 1000}s${file ? ` (details: ${file})` : ""}`);
    schedule(delay, () => startAttempt({ retry: true }), "restarting");
  }

  function crashed(run, detail, code) {
    const early = !run.ready || clock.now() - run.startedAt < startupGraceMs;
    if (early) startupFailures++;
    const file = writeIncident("crash", detail);
    if (startupFailures > 3 || !restartAllowed()) return giveUp(`${detail}. Giving up after repeated failures`, file, normalizeExitCode(code) || 1);
    restartTimes.push(clock.now());
    const delay = Math.min(10_000, 1000 * 2 ** startupFailures);
    state = S.WAITING_TO_RESTART;
    log(`restarting in ${delay / 1000}s${file ? ` (details: ${file})` : ""}`);
    schedule(delay, () => startAttempt({ forceCacheClear: startupFailures >= 2 }), "restarting");
  }

  function giveUp(message, file, code) {
    cancelTimer();
    state = S.FAILED;
    log(message);
    log(`automatic restart stopped${file ? ` — details: ${file}` : ""}. Fix the cause, then start the dev server again.`);
    exit(code);
  }

  // --- public ---------------------------------------------------------------------------------
  /** Deliberate restart of a live but unhealthy child (memory ceiling, worker failure). */
  function requestRestart(kind, detail) {
    const run = current;
    if (!run || run.settled || run.stopRequested || (state !== S.RUNNING && state !== S.STARTING)) return false;
    if (monitoringDisabled) return false;
    const file = writeIncident(kind, detail);
    if (!restartAllowed()) {
      monitoringDisabled = true;
      log(`${detail}. Already restarted ${restartTimes.length}x in ${restartWindowMs / 60_000} min — not restarting again to avoid a loop.`);
      log(`Details: ${file}. Investigate, then restart the dev server yourself.`);
      return false;
    }
    restartTimes.push(clock.now());
    recovering = true;
    run.stopRequested = true;
    state = S.STOPPING;
    log(`${detail} — restarting ${label}${file ? ` (details: ${file})` : ""}`);
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
    state = S.SHUTTING_DOWN;
    cancelTimer();
    const run = current;
    if (run) {
      run.stopRequested = true;
      if (run.probeTimer !== null) clock.clearTimeout(run.probeTimer);
      try {
        await stopTree(run);
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
    get monitoringDisabled() {
      return monitoringDisabled;
    },
    hasPendingTimer: () => timer !== null,
  };
}
