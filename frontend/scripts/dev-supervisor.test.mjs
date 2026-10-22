// Isolated tests for the dev-supervisor restart state machine. No real processes, ports or waits:
// children are fakes and time is a fake clock.   Run: npm run test:dev-supervisor
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { PassThrough } from "node:stream";
import { describe, it } from "node:test";
import {
  classifyExit,
  createMemoryGuard,
  createSupervisor,
  describeExit,
  normalizeExitCode,
  STATES,
  STATUS_CONTROL_C_EXIT,
  STATUS_DLL_INIT_FAILED,
  withJitter,
} from "./dev-supervisor-core.mjs";

const DLL_INIT_FAILED = 3221225794; // how Node reports 0xC0000142 on Windows
const flush = async () => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
};

function fakeClock() {
  let now = 0;
  let seq = 0;
  const timers = new Map();
  return {
    now: () => now,
    setTimeout: (fn, ms) => (timers.set(++seq, { at: now + ms, fn }), seq),
    clearTimeout: (id) => timers.delete(id),
    pendingDelays: () => [...timers.values()].map((t) => t.at - now).sort((a, b) => a - b),
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        await flush();
        const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = end;
      await flush();
    },
  };
}

class FakeChild extends EventEmitter {
  constructor(pid) {
    super();
    this.pid = pid;
    this.exitCode = null;
    this.signalCode = null;
    this.stdout = new PassThrough();
    this.stderr = new PassThrough();
  }
  exit(code, signal = null) {
    if (this.exitCode !== null || this.signalCode !== null) return;
    this.exitCode = signal ? null : code;
    this.signalCode = signal;
    this.emit("exit", code, signal);
    this.emit("close", code, signal);
  }
  ready() {
    this.stdout.write(" ✓ Ready in 1.9s\n");
  }
}

const sink = () => ({ text: "", write(c) { this.text += String(c); return true; } });

function harness(opts = {}) {
  const h = {
    clock: fakeClock(),
    logs: [],
    exits: [],
    children: [],
    stopCalls: [],
    prepareCalls: [],
    incidents: [],
    portIsFree: true,
    probeOk: true,
    killWorks: true,
    stdout: sink(),
    stderr: sink(),
    overlaps: 0,
    spawnImpl: null,
    portOwner: null, // what describePortOwner reports while the port is taken
    portOwnerStops: [],
  };
  h.spawnImpl = () => {
    if (h.children.some((c) => c.pid && c.exitCode === null && c.signalCode === null)) h.overlaps++;
    const c = new FakeChild(1000 + h.children.length);
    h.children.push(c);
    return c;
  };
  h.sup = createSupervisor({
    label: "frontend",
    port: 3000,
    clock: h.clock,
    spawnChild: () => h.spawnImpl(),
    stopTree: async (run) => {
      h.stopCalls.push(run.pid);
      if (h.killWorks && run.proc?.pid && run.proc.exitCode === null && run.proc.signalCode === null) run.proc.exit(null, "SIGTERM");
    },
    portFree: async () => h.portIsFree,
    describePortOwner: async () => (typeof h.portOwner === "function" ? h.portOwner() : h.portOwner),
    stopPortOwner: async (owner) => {
      h.portOwnerStops.push(owner.pid);
      h.portIsFree = true;
    },
    random: () => 0.5, // no jitter unless a test asks for it
    probeReady: async () => (typeof h.probeOk === "function" ? h.probeOk() : h.probeOk),
    prepareStart: async (o) => void h.prepareCalls.push(o),
    writeIncident: (kind) => (h.incidents.push(kind), `.next/dev-supervisor/${kind}.log`),
    log: (m) => h.logs.push(m),
    exit: (code) => h.exits.push(code),
    stdout: h.stdout,
    stderr: h.stderr,
    workerFailurePattern: /child process exceptions, exceeding retry limit/,
    ...opts,
  });
  h.last = () => h.children.at(-1);
  h.has = (text) => h.logs.some((l) => l.includes(text));
  h.count = (text) => h.logs.filter((l) => l.includes(text)).length;
  h.startReady = async () => {
    h.sup.start();
    await flush();
    h.last().ready();
    await flush();
    assert.equal(h.sup.state, STATES.RUNNING);
  };
  return h;
}

describe("exit code handling", () => {
  it("normalizes signed, unsigned, hex and malformed Windows codes", () => {
    assert.equal(normalizeExitCode(DLL_INIT_FAILED), STATUS_DLL_INIT_FAILED);
    assert.equal(normalizeExitCode(-1073741502), STATUS_DLL_INIT_FAILED);
    assert.equal(normalizeExitCode("0xC0000142"), STATUS_DLL_INIT_FAILED);
    assert.equal(normalizeExitCode("3221225794"), STATUS_DLL_INIT_FAILED);
    assert.equal(normalizeExitCode(-4058), -4058); // libuv errno stays
    assert.equal(normalizeExitCode(1), 1);
    for (const bad of ["garbage", NaN, 1.5, undefined, null, {}, 2 ** 40]) assert.equal(normalizeExitCode(bad), null);
    assert.equal(describeExit(DLL_INIT_FAILED), "0xC0000142 (STATUS_DLL_INIT_FAILED)");
    assert.equal(describeExit(null, "SIGKILL"), "signal SIGKILL");
    assert.equal(describeExit("garbage"), "unknown (garbage)");
  });

  it("classifies start failures, crashes, interrupts and clean exits", () => {
    assert.equal(classifyExit({ code: DLL_INIT_FAILED, spawned: true }), "start-failure");
    assert.equal(classifyExit({ code: -1073741502, spawned: true }), "start-failure");
    assert.equal(classifyExit({ code: -4058, spawned: false }), "start-failure");
    assert.equal(classifyExit({ code: 1, spawned: true }), "crash");
    assert.equal(classifyExit({ code: 0xc0000005, spawned: true }), "crash");
    assert.equal(classifyExit({ code: "garbage", spawned: true }), "crash");
    assert.equal(classifyExit({ code: STATUS_CONTROL_C_EXIT, spawned: true }), "interrupted");
    assert.equal(classifyExit({ code: null, signal: "SIGINT", spawned: true }), "interrupted");
    assert.equal(classifyExit({ code: 0, spawned: true }), "clean");
  });
});

describe("supervisor lifecycle", () => {
  it("1. starts the child", async () => {
    const h = harness();
    h.sup.start();
    await flush();
    assert.equal(h.children.length, 1);
    assert.equal(h.sup.state, STATES.STARTING);
    assert.ok(h.has("starting frontend"));
    assert.deepEqual(h.prepareCalls, [{ force: false, reason: h.prepareCalls[0].reason }]);
  });

  it("2. becomes healthy only after the ready line AND a responding port, then stays up", async () => {
    const h = harness();
    h.probeOk = false;
    h.sup.start();
    await flush();
    assert.equal(h.sup.state, STATES.STARTING, "spawned is not healthy");
    h.last().ready();
    await h.clock.advance(3000);
    assert.equal(h.sup.state, STATES.STARTING, "port not answering yet");
    h.probeOk = true;
    await h.clock.advance(1000);
    assert.equal(h.sup.state, STATES.RUNNING);
    assert.ok(h.has("frontend became ready"));
    await h.clock.advance(60 * 60_000);
    assert.equal(h.children.length, 1);
    assert.deepEqual(h.exits, []);
    assert.equal(h.sup.hasPendingTimer(), false);
  });

  it("3. intentional shutdown stops the child and exits 0", async () => {
    const h = harness();
    await h.startReady();
    await h.sup.shutdown();
    assert.deepEqual(h.stopCalls, [1000]);
    assert.deepEqual(h.exits, [0]);
    assert.equal(h.sup.state, STATES.SHUTTING_DOWN);
    await h.clock.advance(10 * 60_000);
    assert.equal(h.children.length, 1);
  });

  it("4 & 19. an ordinary crash uses the crash policy, not the start-failure policy", async () => {
    const h = harness();
    await h.startReady();
    await h.clock.advance(5 * 60_000); // well past the startup grace
    h.last().exit(1);
    await h.clock.advance(500);
    assert.ok(h.has("frontend exited unexpectedly"));
    assert.ok(h.has("exit code: 1"));
    assert.equal(h.has("transient process-start failure"), false);
    assert.ok(h.has("restarting in 1s"));
    assert.deepEqual(h.incidents, ["crash"]);
    await h.clock.advance(1000);
    assert.equal(h.children.length, 2);

    const h2 = harness();
    await h2.startReady();
    await h2.clock.advance(5 * 60_000);
    h2.last().exit(0xc0000005);
    await h2.clock.advance(500);
    assert.equal(h2.has("transient process-start failure"), false);
    assert.ok(h2.has("0xC0000005 (STATUS_ACCESS_VIOLATION)"));
  });

  it("5. detects 0xC0000142 in unsigned and signed form", async () => {
    for (const code of [DLL_INIT_FAILED, -1073741502]) {
      const h = harness();
      await h.startReady();
      h.last().exit(code);
      await h.clock.advance(500);
      assert.ok(h.has("exit code: 0xC0000142 (STATUS_DLL_INIT_FAILED)"));
      assert.ok(h.has("classified as transient process-start failure"));
      assert.ok(h.has("restart attempt 1/3 scheduled in 15s"));
      assert.deepEqual(h.incidents, ["start-failure"]);
    }
  });

  it("6. detects a spawn failure (sync throw, and async error event)", async () => {
    const h = harness();
    h.spawnImpl = () => {
      throw Object.assign(new Error("spawn EAGAIN"), { code: "EAGAIN" });
    };
    h.sup.start();
    await h.clock.advance(500);
    assert.ok(h.has("frontend could not be started"));
    assert.ok(h.has("error: EAGAIN spawn EAGAIN"));
    assert.ok(h.has("restart attempt 1/3 scheduled in 15s"));

    const h2 = harness();
    h2.spawnImpl = () => {
      const c = new FakeChild(undefined); // Node leaves pid undefined when the OS refused
      process.nextTick(() => c.emit("error", Object.assign(new Error("spawn ENOMEM"), { code: "ENOMEM" })));
      return c;
    };
    h2.sup.start();
    await h2.clock.advance(500);
    assert.ok(h2.has("classified as transient process-start failure"));
    assert.ok(h2.has("restart attempt 1/3 scheduled in 15s"));
  });

  it("7-11. retries after exactly 15s, 30s, 60s, then keeps recovering slowly instead of exiting", async () => {
    const h = harness();
    await h.startReady();
    h.last().exit(DLL_INIT_FAILED);
    await h.clock.advance(500);

    const expect = [15_000, 30_000, 60_000];
    for (let i = 0; i < 3; i++) {
      assert.deepEqual(h.clock.pendingDelays(), [expect[i]], `attempt ${i + 1} delay`);
      const before = h.children.length;
      await h.clock.advance(expect[i] - 1);
      assert.equal(h.children.length, before, `no start before ${expect[i]}ms`);
      await h.clock.advance(1);
      assert.equal(h.children.length, before + 1, `start at ${expect[i]}ms`);
      assert.ok(h.has(`restart attempt ${i + 1}/3`));
      assert.deepEqual(h.exits, [], "supervisor still alive between attempts");
      h.last().exit(DLL_INIT_FAILED);
      await h.clock.advance(500);
    }
    assert.equal(h.children.length, 4); // original + 3 fast retries
    assert.ok(h.has("Fast retries exhausted — automatic recovery continues with slow retries"));
    assert.equal(h.sup.state, STATES.RECOVERING);
    assert.deepEqual(h.exits, [], "the supervisor no longer exits and leaves localhost down");
    // Slow retries: 2 min, doubling, capped at 10 min.
    for (const [i, delay] of [120_000, 240_000, 480_000, 600_000, 600_000].entries()) {
      assert.deepEqual(h.clock.pendingDelays(), [delay], `recovery attempt ${i + 1} delay`);
      assert.ok(h.has(`recovery attempt ${i + 1} scheduled in ${delay / 1000}s`));
      const before = h.children.length;
      await h.clock.advance(delay);
      assert.equal(h.children.length, before + 1);
      h.last().exit(DLL_INIT_FAILED);
      await h.clock.advance(500);
    }
    assert.equal(h.overlaps, 0);
    assert.ok(h.prepareCalls.every((c) => c.force === false), "start failures never clear the cache");
  });

  it("12. the failure counter resets only after a sustained healthy run", async () => {
    const h = harness();
    await h.startReady();
    h.last().exit(DLL_INIT_FAILED);
    await h.clock.advance(500 + 15_000);
    h.last().exit(DLL_INIT_FAILED);
    await h.clock.advance(500);
    assert.ok(h.has("restart attempt 2/3 scheduled in 30s"));
    await h.clock.advance(30_000);
    assert.equal(h.sup.startFailures, 2, "spawn alone does not reset the counter");
    h.last().ready();
    await flush();
    assert.equal(h.sup.state, STATES.RUNNING);
    assert.ok(h.has("restart recovery successful"));
    assert.equal(h.sup.startFailures, 2, "printing Ready is not enough");
    await h.clock.advance(10 * 60_000 - 1);
    assert.equal(h.sup.startFailures, 2);
    await h.clock.advance(1);
    assert.ok(h.has("frontend healthy for 600s — failure counters reset"));
    assert.equal(h.sup.startFailures, 0);
    assert.equal(h.sup.hasPendingTimer(), false);

    h.logs.length = 0;
    h.last().exit(DLL_INIT_FAILED);
    await h.clock.advance(500);
    assert.ok(h.has("restart attempt 1/3 scheduled in 15s"), "a new failure event starts again at 15s");
  });

  it("13. simultaneous restart requests produce exactly one restart workflow", async () => {
    const h = harness();
    await h.startReady();
    const a = h.sup.requestRestart("memory", "memory high");
    const b = h.sup.requestRestart("worker-failure", "worker crashed");
    assert.deepEqual([a, b], [true, false]);
    await flush();
    assert.equal(h.children.length, 2);
    assert.deepEqual(h.stopCalls, [1000]);
    assert.equal(h.overlaps, 0);

    // Worker-failure lines repeated in the same output burst also collapse into one restart.
    const h2 = harness();
    await h2.startReady();
    h2.last().stderr.write("Error: Jest worker encountered 2 child process exceptions, exceeding retry limit\n".repeat(3));
    await flush();
    assert.equal(h2.children.length, 2);
    assert.equal(h2.count("restarting frontend"), 1);

    // A request that arrives while an exit is being handled is rejected.
    const h3 = harness();
    await h3.startReady();
    h3.last().exit(DLL_INIT_FAILED);
    assert.equal(h3.sup.requestRestart("memory", "memory high"), false);
    await h3.clock.advance(500);
    assert.equal(h3.sup.requestRestart("memory", "memory high"), false);
    assert.deepEqual(h3.clock.pendingDelays(), [15_000]);
  });

  it("14. spawn error + exit + close for the same child count as one failure", async () => {
    const h = harness();
    h.spawnImpl = () => {
      const c = new FakeChild(undefined);
      process.nextTick(() => {
        c.emit("error", Object.assign(new Error("spawn UNKNOWN"), { code: "UNKNOWN" }));
        c.emit("exit", -4094, null);
        c.emit("close", -4094, null);
      });
      h.children.push(c);
      return c;
    };
    h.sup.start();
    await h.clock.advance(500);
    assert.equal(h.count("restart attempt"), 1);
    assert.deepEqual(h.incidents, ["start-failure"]);
    assert.deepEqual(h.clock.pendingDelays(), [15_000]);

    // The exit event can also arrive long after the error (and after the exit grace period).
    const late = h.children[0];
    late.emit("exit", -4094, null);
    late.emit("close", -4094, null);
    await h.clock.advance(1000);
    assert.equal(h.count("restart attempt"), 1, "late exit for the same child is not a second failure");
    assert.deepEqual(h.clock.pendingDelays(), [14_000]);
  });

  it("15 & 16. shutdown cancels a pending restart; no restart after intentional shutdown", async () => {
    const h = harness();
    await h.startReady();
    h.last().exit(DLL_INIT_FAILED);
    await h.clock.advance(500);
    assert.equal(h.sup.hasPendingTimer(), true);
    await h.sup.shutdown();
    assert.equal(h.sup.hasPendingTimer(), false);
    await h.clock.advance(10 * 60_000);
    assert.equal(h.children.length, 1);
    assert.deepEqual(h.exits, [0]);

    // Ctrl+C reaches the child too: its 0xC000013A exit must not restart anything.
    const h2 = harness();
    await h2.startReady();
    h2.last().exit(STATUS_CONTROL_C_EXIT);
    await h2.sup.shutdown();
    await h2.clock.advance(10 * 60_000);
    assert.equal(h2.children.length, 1);
    assert.deepEqual(h2.exits, [0]);

    // Ctrl+C that only the child saw: the supervisor exits with it, no restart.
    const h3 = harness();
    await h3.startReady();
    h3.last().exit(STATUS_CONTROL_C_EXIT);
    await h3.clock.advance(10 * 60_000);
    assert.equal(h3.children.length, 1);
    assert.deepEqual(h3.exits, [STATUS_CONTROL_C_EXIT]);

    // Shutdown while a start is waiting for the port: nothing is spawned afterwards.
    const h4 = harness();
    h4.portIsFree = false;
    h4.sup.start();
    await h4.clock.advance(1000);
    await h4.sup.shutdown();
    h4.portIsFree = true;
    await h4.clock.advance(10 * 60_000);
    assert.equal(h4.children.length, 0);
  });

  it("17. never starts a new child while the old one or the port is still alive", async () => {
    const h = harness();
    await h.startReady();
    h.killWorks = false;
    h.sup.requestRestart("memory", "memory high");
    await flush();
    assert.equal(h.children.length, 1, "old child survived the stop — no second child");
    assert.ok(h.has("the previous frontend process (pid 1000) is still running — not starting a second frontend"));
    assert.deepEqual(h.clock.pendingDelays(), [15_000]);

    const h2 = harness();
    await h2.startReady();
    h2.last().exit(DLL_INIT_FAILED);
    await h2.clock.advance(500);
    h2.portIsFree = false;
    await h2.clock.advance(15_000 + 15_000);
    assert.equal(h2.children.length, 1, "port still taken — no second child");
    assert.ok(h2.has("port 3000 is still in use — not starting a second frontend"));
    assert.ok(h2.has("restart attempt 2/3 scheduled in 30s"));
    assert.equal(h2.overlaps, 0);
  });

  it("18. child stdout and stderr stay visible, including from a replaced child", async () => {
    const h = harness();
    await h.startReady();
    const old = h.last();
    old.stderr.write("TypeError: boom\n");
    await flush();
    assert.match(h.stderr.text, /TypeError: boom/);
    old.exit(DLL_INIT_FAILED);
    old.stdout.write("late output\n");
    await flush();
    assert.match(h.stdout.text, /late output/);
    old.ready(); // stale ready line from a dead child
    await h.clock.advance(500);
    assert.equal(h.sup.state, STATES.WAITING_TO_RESTART, "stale ready line ignored");
  });

  it("20. the supervisor survives internal failures", async () => {
    const h = harness({
      prepareStart: async () => {
        throw new Error("disk busy");
      },
    });
    h.probeOk = () => {
      throw new Error("probe exploded");
    };
    h.sup.start();
    await flush();
    assert.ok(h.has("dev cache check failed (disk busy) — starting anyway"));
    assert.equal(h.children.length, 1);
    h.last().ready();
    await flush();
    assert.ok(h.has("readiness check failed: probe exploded"));
    h.last().exit("garbage");
    await h.clock.advance(500);
    assert.ok(h.has("exit code: unknown (garbage)"));
    assert.deepEqual(h.exits, []);

    const h2 = harness({
      stopTree: async () => {
        throw new Error("taskkill failed");
      },
    });
    await h2.startReady();
    h2.sup.requestRestart("memory", "memory high");
    await flush();
    assert.ok(h2.has("stopping the previous frontend failed: taskkill failed"));
    assert.deepEqual(h2.exits, []);
  });

  it("normal startup crashes keep the original cache-clear policy", async () => {
    const h = harness();
    h.sup.start();
    await flush();
    h.last().exit(1);
    await h.clock.advance(500);
    assert.ok(h.has("restarting in 2s"));
    await h.clock.advance(2000);
    h.last().exit(1);
    await h.clock.advance(500 + 4000);
    assert.equal(h.prepareCalls.at(-1).force, true, "two startup crashes → clear stale cache");
    h.last().exit(1);
    await h.clock.advance(500 + 8000);
    h.last().exit(1);
    await h.clock.advance(500);
    assert.ok(h.has("crash restart budget used up"));
    assert.equal(h.sup.state, STATES.RECOVERING, "repeated startup crashes keep retrying slowly");
    assert.deepEqual(h.exits, []);
    assert.deepEqual(h.clock.pendingDelays(), [120_000]);
  });

  it("replays the real incident: worker failure → restart → 0xC0000142 x3 → recovered", async () => {
    const h = harness();
    await h.startReady();
    await h.clock.advance(5 * 60 * 60_000);
    h.last().stderr.write("Error: Jest worker encountered 2 child process exceptions, exceeding retry limit\n");
    await flush();
    assert.equal(h.children.length, 2);
    h.last().exit(DLL_INIT_FAILED);
    await h.clock.advance(500 + 15_000);
    h.last().exit(DLL_INIT_FAILED);
    await h.clock.advance(500 + 30_000);
    h.last().ready();
    await flush();
    assert.equal(h.sup.state, STATES.RUNNING);
    assert.ok(h.has("restart recovery successful"));
    assert.equal(h.children.length, 4);
    assert.deepEqual(h.exits, []);
  });
});

describe("hardened recovery (Oct 12 incident: 46h run, worker crash, 0xC0000142, supervisor stopped)", () => {
  it("backoff delays carry bounded jitter", () => {
    assert.equal(withJitter(15_000, 0.2, () => 0.5), 15_000);
    assert.equal(withJitter(15_000, 0.2, () => 0), 12_000);
    assert.equal(withJitter(15_000, 0.2, () => 1), 18_000);
    assert.equal(withJitter(15_000, 0, () => 0), 15_000);
    const h = harness({ random: () => 0 });
    h.sup.start();
    return (async () => {
      await flush();
      h.last().exit(DLL_INIT_FAILED);
      await h.clock.advance(500);
      assert.deepEqual(h.clock.pendingDelays(), [12_000]);
      assert.ok(h.has("restart attempt 1/3 scheduled in 12s"));
    })();
  });

  it("replays Oct 12: worker crash → 0xC0000142 on every start → slow recovery → success → reset after sustained health", async () => {
    const h = harness();
    await h.startReady();
    await h.clock.advance(46 * 60 * 60_000);
    h.last().stderr.write("Error: Jest worker encountered 2 child process exceptions, exceeding retry limit\n");
    await flush();
    assert.ok(h.has("restart reason: worker-failure"));
    // The old supervisor wrote 4 start-failure incidents (the restart itself + 3 retries) and exited.
    for (let i = 0; i < 4; i++) {
      h.last().exit(DLL_INIT_FAILED);
      await h.clock.advance(500);
      if (i < 3) await h.clock.advance(h.clock.pendingDelays()[0]);
    }
    assert.equal(h.incidents.filter((k) => k === "start-failure").length, 4);
    assert.equal(h.sup.state, STATES.RECOVERING);
    assert.deepEqual(h.exits, []);
    // Windows recovers later; the next slow retry succeeds.
    await h.clock.advance(120_000);
    h.last().ready();
    await flush();
    assert.equal(h.sup.state, STATES.RUNNING);
    assert.ok(h.has("restart recovery successful"));
    assert.equal(h.sup.recoveryAttempts, 1, "not reset on Ready alone");
    await h.clock.advance(10 * 60_000);
    assert.equal(h.sup.recoveryAttempts, 0);
    assert.equal(h.sup.startFailures, 0);
    // A fresh failure event later gets the fast budget again.
    h.logs.length = 0;
    h.last().exit(DLL_INIT_FAILED);
    await h.clock.advance(500);
    assert.ok(h.has("restart attempt 1/3 scheduled in 15s"));
    assert.equal(h.overlaps, 0);
  });

  it("a run that dies soon after Ready keeps its failure history (no rapid restart loop)", async () => {
    const h = harness();
    await h.startReady();
    for (let i = 0; i < 4; i++) {
      h.last().exit(DLL_INIT_FAILED);
      await h.clock.advance(500);
      await h.clock.advance(h.clock.pendingDelays()[0]);
    }
    assert.equal(h.sup.state, STATES.STARTING, "first recovery attempt is starting");
    h.last().ready();
    await flush();
    await h.clock.advance(2 * 60_000); // healthy for 2 min only
    h.last().exit(DLL_INIT_FAILED);
    await h.clock.advance(500);
    assert.equal(h.sup.state, STATES.RECOVERING, "back to slow retries, not a new fast burst");
    assert.deepEqual(h.clock.pendingDelays(), [240_000]);
  });

  it("an application crash is distinguished from a start failure in logs and incidents", async () => {
    const h = harness();
    await h.startReady();
    await h.clock.advance(5 * 60_000);
    h.last().exit(1);
    await h.clock.advance(500);
    assert.ok(h.has("restart reason: crash — frontend exited unexpectedly (code 1)"));
    assert.ok(h.has("frontend exited unexpectedly (pid 1000, uptime 300s)"));
    assert.deepEqual(h.incidents, ["crash"]);
    await h.clock.advance(1000);
    h.last().exit(DLL_INIT_FAILED);
    await h.clock.advance(500);
    assert.ok(h.has("restart reason: start-failure"));
    assert.deepEqual(h.incidents, ["crash", "start-failure"]);
  });

  it("crash budget exhausted → slow recovery, never a burst of restarts", async () => {
    const h = harness();
    await h.startReady();
    for (let i = 0; i < 3; i++) {
      await h.clock.advance(5 * 60_000);
      h.last().ready();
      await flush();
      h.last().exit(1);
      await h.clock.advance(500);
      await h.clock.advance(h.clock.pendingDelays()[0]);
    }
    await h.clock.advance(60_000);
    h.last().ready();
    await flush();
    h.last().exit(1);
    await h.clock.advance(500);
    assert.equal(h.sup.state, STATES.RECOVERING);
    assert.ok(h.has("crash restart budget used up"));
    assert.deepEqual(h.exits, []);
  });

  it("Ctrl+C while recovering cancels the slow retry and exits 0", async () => {
    const h = harness();
    await h.startReady();
    for (let i = 0; i < 4; i++) {
      h.last().exit(DLL_INIT_FAILED);
      await h.clock.advance(500);
      if (i < 3) await h.clock.advance(h.clock.pendingDelays()[0]);
    }
    assert.equal(h.sup.state, STATES.RECOVERING);
    const spawned = h.children.length;
    await h.sup.shutdown(0);
    assert.equal(h.sup.hasPendingTimer(), false);
    await h.clock.advance(60 * 60_000);
    assert.equal(h.children.length, spawned);
    assert.deepEqual(h.exits, [0]);
  });

  it("logs every state transition with its reason", async () => {
    const h = harness();
    await h.startReady();
    h.last().exit(DLL_INIT_FAILED);
    await h.clock.advance(500);
    assert.ok(h.has("state IDLE → STARTING"));
    assert.ok(h.has("state STARTING → RUNNING (ready line seen and port responding)"));
    assert.ok(h.has("state RUNNING → WAITING_TO_RESTART (pid 1000 ended: 0xC0000142 (STATUS_DLL_INIT_FAILED))"));
    assert.ok(h.has("restart attempt 1/3 scheduled in 15s at 1970-01-01T"));
  });

  it("deliberate restarts pause when the budget is used up and resume after the window", async () => {
    const h = harness();
    await h.startReady();
    for (let i = 0; i < 3; i++) {
      assert.equal(h.sup.requestRestart("memory", "memory high"), true);
      await flush();
      h.last().ready();
      await flush();
    }
    assert.equal(h.sup.requestRestart("memory", "memory high"), false);
    assert.equal(h.sup.monitoringDisabled, true);
    assert.ok(h.has("not restarting again until"));
    await h.clock.advance(30 * 60_000 + 1);
    assert.equal(h.sup.monitoringDisabled, false, "paused, not disabled for the rest of the session");
    assert.equal(h.sup.requestRestart("memory", "memory high"), true);
  });
});

describe("memory guard (sustained threshold with hysteresis)", () => {
  const GBy = 1024 ** 3;
  const g = () => createMemoryGuard({ limitBytes: 7 * GBy, samplesRequired: 3, lowFreeBytes: 0.8 * GBy });
  const plenty = 6 * GBy;

  it("restarts only after N consecutive high samples, then counts again", () => {
    const m = g();
    assert.equal(m.observe({ treeBytes: 7.5 * GBy, freeBytes: plenty }).status, "watch");
    assert.equal(m.observe({ treeBytes: 7.5 * GBy, freeBytes: plenty }).status, "watch");
    const r = m.observe({ treeBytes: 7.5 * GBy, freeBytes: plenty });
    assert.deepEqual([r.status, r.reason, r.highSamples], ["restart", "over-limit", 3]);
    assert.equal(m.highSamples, 0);
  });

  it("a normal build spike below the limit never triggers anything", () => {
    const m = g();
    for (const gb of [1, 3.6, 4.4, 5.3, 6.1, 4.2, 6.6]) assert.equal(m.observe({ treeBytes: gb * GBy, freeBytes: plenty }).status, "ok");
  });

  it("hovering just under the limit neither restarts nor resets the countdown", () => {
    const m = g();
    m.observe({ treeBytes: 7.2 * GBy, freeBytes: plenty });
    m.observe({ treeBytes: 7.2 * GBy, freeBytes: plenty });
    assert.equal(m.observe({ treeBytes: 6.8 * GBy, freeBytes: plenty }).status, "watch"); // above 90%
    assert.equal(m.highSamples, 2);
    assert.equal(m.observe({ treeBytes: 7.2 * GBy, freeBytes: plenty }).status, "restart");
    m.observe({ treeBytes: 7.2 * GBy, freeBytes: plenty });
    assert.equal(m.observe({ treeBytes: 5 * GBy, freeBytes: plenty }).status, "ok"); // clearly below
    assert.equal(m.highSamples, 0);
  });

  it("the Oct 8 case: 6.1GB tree with 0.6GB RAM free counts as low-system-memory", () => {
    const m = g();
    m.observe({ treeBytes: 6.1 * GBy, freeBytes: 0.6 * GBy });
    m.observe({ treeBytes: 6.1 * GBy, freeBytes: 0.6 * GBy });
    const r = m.observe({ treeBytes: 6.1 * GBy, freeBytes: 0.6 * GBy });
    assert.deepEqual([r.status, r.reason], ["restart", "low-system-memory"]);
    // A small tree is not blamed for the machine being low on RAM (e.g. Chrome or tests using it).
    const m2 = g();
    for (let i = 0; i < 5; i++) assert.equal(m2.observe({ treeBytes: 1 * GBy, freeBytes: 0.3 * GBy }).status, "ok");
  });
});

describe("port ownership (port 3000 held after a failed restart)", () => {
  it("a verified leftover of this supervisor is stopped, then the new child starts", async () => {
    const h = harness();
    await h.startReady();
    h.last().exit(DLL_INIT_FAILED);
    await h.clock.advance(500);
    h.portIsFree = false;
    h.portOwner = { pid: 4321, ours: true, detail: "node.exe: next start-server.js" };
    await h.clock.advance(15_000 + 15_000 + 1000);
    assert.deepEqual(h.portOwnerStops, [4321]);
    assert.ok(h.has("a leftover of this supervisor's previous frontend — stopping it"));
    assert.equal(h.children.length, 2);
    assert.equal(h.overlaps, 0);
  });

  it("an unrelated process on the port is never stopped; the supervisor keeps retrying", async () => {
    const h = harness();
    h.portIsFree = false;
    h.portOwner = { pid: 777, ours: false, detail: "node.exe: another next dev" };
    h.sup.start();
    await h.clock.advance(16_000);
    assert.deepEqual(h.portOwnerStops, []);
    assert.ok(h.has("port 3000 is held by pid 777 (node.exe: another next dev), which this supervisor did not start — leaving it alone"));
    assert.equal(h.children.length, 0);
    assert.deepEqual(h.exits, []);
    assert.ok(h.has("restart attempt 1/3 scheduled in 15s"));
    // The other process goes away on its own: the next retry starts normally.
    h.portIsFree = true;
    await h.clock.advance(15_000);
    assert.equal(h.children.length, 1);
  });

  it("an owner that cannot be identified is left alone", async () => {
    const h = harness();
    h.portIsFree = false;
    h.portOwner = () => {
      throw new Error("powershell unavailable");
    };
    h.sup.start();
    await h.clock.advance(16_000);
    assert.deepEqual(h.portOwnerStops, []);
    assert.ok(h.has("could not identify the process holding port 3000"));
    assert.equal(h.children.length, 0);
  });

  it("stop calls only ever target this supervisor's own children", async () => {
    const h = harness();
    await h.startReady();
    h.sup.requestRestart("memory", "memory high");
    await flush();
    h.last().ready();
    await flush();
    await h.sup.shutdown();
    const own = h.children.map((c) => c.pid);
    assert.ok(h.stopCalls.every((pid) => own.includes(pid)), `stopped ${h.stopCalls} of own ${own}`);
  });

  it("the wiring only ever inspects its own port and never names the backend's", () => {
    const src = readFileSync(new URL("./dev-supervisor.mjs", import.meta.url), "utf8");
    assert.match(src, /Get-NetTCPConnection -LocalPort \$\{PORT\}/);
    assert.doesNotMatch(src, /4000/, "the backend port is never referenced");
    assert.match(src, /if \(!owner\?\.ours\) return;/, "stopPortOwner refuses anything not verified as ours");
    assert.match(src, /isOwned\(ownerPid, Number\(start\)\)/, "ownership = pid AND creation time");
    assert.doesNotMatch(src, /rmSync\([^)]*\.next[^)]*recursive/, "no cache deletion besides trim-dev-cache");
  });
});
