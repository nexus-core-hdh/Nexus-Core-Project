// Isolated tests for the dev-supervisor restart state machine. No real processes, ports or waits:
// children are fakes and time is a fake clock.   Run: npm run test:dev-supervisor
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, it } from "node:test";
import {
  classifyExit,
  createSupervisor,
  describeExit,
  normalizeExitCode,
  STATES,
  STATUS_CONTROL_C_EXIT,
  STATUS_DLL_INIT_FAILED,
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

  it("7-11. retries after exactly 15s, 30s, 60s, then stops with no 4th attempt", async () => {
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
    assert.ok(h.has("frontend could not be recovered after 3 attempts"));
    assert.ok(h.has("automatic restart stopped"));
    assert.equal(h.sup.state, STATES.FAILED);
    assert.deepEqual(h.exits, [1]);
    const total = h.children.length;
    await h.clock.advance(60 * 60_000);
    assert.equal(h.children.length, total, "no 4th automatic retry");
    assert.equal(total, 4); // original + 3 retries
    assert.ok(h.prepareCalls.every((c) => c.force === false), "start failures never clear the cache");
  });

  it("12. a healthy restart resets the failure counter", async () => {
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
    assert.ok(h.has("failure counter reset"));
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
    assert.ok(h.has("Giving up after repeated failures"));
    assert.deepEqual(h.exits, [1]);
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
