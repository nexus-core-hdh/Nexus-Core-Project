// Tests for the dev-supervisor's stale route table guard (stale-route-guard.mjs): which 404s mean
// "next dev lost routes that exist on disk", what the guard does about them, and — on the real
// supervisor state machine with fake children and a fake clock — that a simulated stale-route incident
// is recovered without restart loops or incident floods. Company routes are read from the real app/.
//   Run: npm run test:stale-routes
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { createSupervisor, STATES } from "./dev-supervisor-core.mjs";
import {
  attachStaleRouteGuard,
  createStaleRouteGuard,
  isServedByPage,
  loadAppRoutes,
  loadCompanyRoutes,
  MARKER_PREFIX,
  parse404,
  parseRequest,
  removeLeftoverMarkers,
  touchAppDir,
} from "./stale-route-guard.mjs";

const FRONTEND = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP = path.join(FRONTEND, "app");
const ROUTES = loadCompanyRoutes(APP);

// Lines exactly as next dev printed them while its route table was stale (2026-10-29 and 2026-10-27).
const STALE_TODAY = " GET /nexus-core/plm/style-cards 404 in 68ms (next.js: 9ms, proxy.ts: 4ms, application-code: 55ms)";
const STALE_OCT_27 =
  " GET /creative-apparels/plm/style-cards/90533b3b-75ec-40fa-9cb4-4605a6a2d3b6 404 in 46ms (next.js: 13ms, proxy.ts: 5ms, application-code: 28ms)";
const HEALED_TODAY = " GET /nexus-core/plm/style-cards 200 in 4.9s (next.js: 4.8s, proxy.ts: 7ms, application-code: 80ms)";
const GENUINE_404 = " GET /nexus-core/plm/general-definitions/fabric-type-cards 404 in 50ms";

describe("parsing next dev's request log", () => {
  it("reads page requests and their status", () => {
    assert.deepEqual(parseRequest(STALE_TODAY), { pathname: "/nexus-core/plm/style-cards", status: 404 });
    assert.deepEqual(parseRequest(HEALED_TODAY), { pathname: "/nexus-core/plm/style-cards", status: 200 });
    assert.equal(parse404(STALE_OCT_27), "/creative-apparels/plm/style-cards/90533b3b-75ec-40fa-9cb4-4605a6a2d3b6");
    assert.equal(parse404(HEALED_TODAY), null);
  });

  it("strips colour codes and query strings (RSC navigations) and accepts HEAD", () => {
    assert.equal(parse404("\x1b[2m GET\x1b[22m /acme/crm/contacts?_rsc=1x2y \x1b[33m404\x1b[39m in 12ms"), "/acme/crm/contacts");
    assert.equal(parse404(" HEAD /acme/crm/contacts 404 in 3ms"), "/acme/crm/contacts");
  });

  it("ignores the API proxy, Next internals, static files and other output", () => {
    assert.equal(parseRequest(" GET /api/v1/plm/style-cards/1 404 in 8ms"), null);
    assert.equal(parseRequest(" GET /_next/static/chunks/x.js 404 in 8ms"), null);
    assert.equal(parseRequest(" GET /acme/logo.png 404 in 8ms"), null);
    assert.equal(parseRequest("○ Compiling /[company]/crm ..."), null);
  });
});

describe("which 404s are stale routes", () => {
  it("nested ERP list, form and record pages behind any company slug", () => {
    for (const p of [
      "/nexus-core/plm/style-cards",
      "/nexus-core/legacy-erp/work-orders",
      "/nexus-core/crm/contacts",
      "/nexus-core/legacy-erp/order-manufacturing-entry/entry",
      "/creative-apparels/plm/style-cards/90533b3b-75ec-40fa-9cb4-4605a6a2d3b6",
      "/acme/plm/style-cards/new",
      "/acme/default",
    ]) {
      assert.ok(isServedByPage(p, ROUTES), p);
    }
  });

  it("never: unknown pages, `/{company}` alone, or a missing record behind notFound()", () => {
    for (const p of [
      "/acme",
      "/acme/no-such-module",
      "/acme/legacy-erp/work-orders/abc", // work orders are `?id=` forms, not [id] routes
      "/acme/plm/general-definitions/fabric-type-cards", // menu entry without a page
      "/acme/pages/products/does-not-exist", // its page calls notFound() for a missing record
    ]) {
      assert.equal(isServedByPage(p, ROUTES), false, p);
    }
  });

  it("never: a guest/reserved first segment, which is not a company slug", () => {
    // These URLs 404 genuinely; reading `login`/`s`/`shared` as a company would trigger rebuilds and restarts.
    for (const p of ["/login/plm/style-cards", "/LOGIN/plm/style-cards", "/s/plm/style-cards", "/shared/crm/contacts", "/error/legacy-erp/work-orders", "/plm/plm/style-cards"]) {
      assert.equal(isServedByPage(p, ROUTES), false, p);
    }
  });

  it("route folders: groups and @slots add no segment; private, intercepting and notFound() pages are skipped", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "route-tree-"));
    const page = (rel, body = "export default function P() { return null; }") => {
      fs.mkdirSync(path.join(dir, rel), { recursive: true });
      fs.writeFileSync(path.join(dir, rel, "page.tsx"), body);
    };
    try {
      page("(group)/a/b");
      page("@modal/c");
      page("_private/d");
      page("(.)e/f");
      page("g/[id]");
      page("h/[...rest]");
      page("i/[id]", 'import { notFound } from "next/navigation"; export default function P() { notFound(); }');
      const r = loadAppRoutes(dir);
      assert.deepEqual([...r.statics].sort(), ["/a/b", "/c"]);
      const served = (p) => r.statics.has(p) || r.dynamic.some((re) => re.test(p));
      assert.ok(served("/g/42"));
      assert.ok(served("/h/x/y/z"));
      assert.equal(served("/g/42/extra"), false);
      assert.equal(served("/i/42"), false);
      assert.equal(served("/d"), false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

function unit(over = {}) {
  let now = 0;
  const calls = [];
  const logs = [];
  const guard = createStaleRouteGuard({
    loadRoutes: () => ROUTES,
    refresh: (p) => calls.push(`refresh ${p}`),
    escalate: () => (calls.push("escalate"), over.escalateAccepted ?? true),
    log: (m) => logs.push(m),
    now: () => now,
    settleMs: 5_000,
    escalateWithinMs: 120_000,
  });
  return { guard, calls, logs, advance: (ms) => (now += ms) };
}

describe("guard decisions", () => {
  it("a 404 for an existing page rebuilds the route table", () => {
    const { guard, calls } = unit();
    assert.equal(guard.observe(STALE_TODAY), "refresh");
    assert.deepEqual(calls, ["refresh /nexus-core/plm/style-cards"]);
  });

  it("genuine 404s and normal traffic do nothing", () => {
    const { guard, calls } = unit();
    for (const l of [GENUINE_404, " GET /acme/no-such-module 404 in 5ms", " GET /login/plm/style-cards 404 in 5ms", HEALED_TODAY]) guard.observe(l);
    assert.deepEqual(calls, []);
  });

  it("logs the recovery when the same page answers again after the rebuild", () => {
    const { guard, logs, advance } = unit();
    guard.observe(STALE_TODAY);
    advance(3_000);
    assert.equal(guard.observe(HEALED_TODAY), "recovered");
    assert.ok(logs.some((l) => l === "route table rebuilt: /nexus-core/plm/style-cards now answers 200"));
    assert.equal(guard.observe(HEALED_TODAY), null); // once
  });

  it("404s still in flight right after a rebuild are not counted", () => {
    const { guard, calls, advance } = unit();
    guard.observe(STALE_TODAY);
    advance(2_000);
    assert.equal(guard.observe(STALE_OCT_27), null);
    assert.equal(calls.length, 1);
  });

  it("asks for one restart when pages still 404 after a rebuild — then stays quiet for the window", () => {
    const { guard, calls, advance } = unit();
    guard.observe(STALE_TODAY);
    advance(10_000);
    assert.equal(guard.observe(STALE_TODAY), "escalate");
    for (let i = 0; i < 100; i++) (advance(1_000), guard.observe(STALE_TODAY));
    assert.deepEqual(calls, ["refresh /nexus-core/plm/style-cards", "escalate"]);
  });

  it("a refused restart (restart limit) is reported, not retried in a loop", () => {
    const { guard, calls, logs, advance } = unit({ escalateAccepted: false });
    guard.observe(STALE_TODAY);
    advance(10_000);
    guard.observe(STALE_TODAY);
    assert.ok(logs.some((l) => l.includes("restart was refused")));
    // Two hours of a 404 every 2s: at most one rebuild + one restart request per 2-minute window.
    for (let i = 0; i < 3600; i++) (advance(2_000), guard.observe(STALE_TODAY));
    assert.ok(calls.length <= 2 + 2 * Math.ceil((3600 * 2_000) / 120_000), `${calls.length} actions`);
  });

  it("a separate, later occurrence starts with a rebuild again; a new run forgets the old one", () => {
    const { guard, calls, advance } = unit();
    guard.observe(STALE_TODAY);
    advance(30 * 60_000);
    assert.equal(guard.observe(STALE_OCT_27), "refresh");
    advance(10_000);
    guard.reset();
    assert.equal(guard.observe(STALE_TODAY), "refresh");
    assert.equal(calls.filter((c) => c.startsWith("refresh")).length, 3);
  });
});

// --- simulated incidents on the real supervisor state machine ------------------------------------------
function fakeClock() {
  let now = 0;
  let seq = 0;
  const timers = new Map();
  return {
    now: () => now,
    setTimeout: (fn, ms) => (timers.set(++seq, { at: now + ms, fn }), seq),
    clearTimeout: (id) => timers.delete(id),
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
const flush = async () => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
};

class FakeNextDev extends EventEmitter {
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
  print(line) {
    this.stdout.write(line + "\n");
  }
}

function simulated() {
  const h = { clock: fakeClock(), logs: [], incidents: [], rebuilds: 0, children: [] };
  const sink = { write: () => true };
  let guard;
  h.sup = createSupervisor({
    label: "next dev",
    port: 3000,
    clock: h.clock,
    spawnChild: () => {
      const c = new FakeNextDev(1000 + h.children.length);
      h.children.push(c);
      return c;
    },
    stopTree: async (run) => run.proc?.exit(null, "SIGTERM"),
    portFree: async () => true,
    probeReady: async () => true,
    random: () => 0.5,
    writeIncident: (kind, detail) => (h.incidents.push({ kind, detail }), `.next/dev-supervisor/${kind}.log`),
    onOutputLine: (line) => guard.onOutputLine(line),
    onReady: (run) => guard.onReady(run),
    log: (m) => h.logs.push(m),
    exit: () => {},
    stdout: sink,
    stderr: sink,
  });
  guard = attachStaleRouteGuard({
    supervisor: h.sup,
    runningState: STATES.RUNNING,
    appDir: "app",
    log: (m) => h.logs.push(m),
    writeIncident: (kind, detail) => (h.incidents.push({ kind, detail }), `.next/dev-supervisor/${kind}.log`),
    rebuild: () => h.rebuilds++,
    loadRoutes: () => ROUTES,
    clock: h.clock,
  });
  h.child = () => h.children.at(-1);
  h.boot = async () => {
    await flush();
    h.child().print(" ✓ Ready in 1.9s");
    await flush();
    assert.equal(h.sup.state, STATES.RUNNING);
  };
  h.restarts = () => h.logs.filter((l) => l.startsWith("restart reason: stale-routes")).length;
  return h;
}

describe("simulated stale-route incidents (real supervisor, fake next dev)", () => {
  it("rebuilds the route table once after every boot", async () => {
    const h = simulated();
    h.sup.start();
    await h.boot();
    assert.equal(h.rebuilds, 0);
    await h.clock.advance(15_000);
    assert.equal(h.rebuilds, 1);
    assert.ok(h.logs.some((l) => l.includes("once after boot")));
    await h.clock.advance(60 * 60_000);
    assert.equal(h.rebuilds, 1); // not periodic
  });

  it("a stale table is rebuilt on the first 404 and the recovery is logged — no restart", async () => {
    const h = simulated();
    h.sup.start();
    await h.boot();
    await h.clock.advance(20_000);
    h.child().print(STALE_TODAY);
    await flush();
    assert.equal(h.rebuilds, 2);
    assert.equal(h.incidents.filter((i) => i.kind === "stale-routes").length, 1);
    assert.match(h.incidents[0].detail, /\/nexus-core\/plm\/style-cards/);
    await h.clock.advance(3_000);
    h.child().print(HEALED_TODAY);
    await flush();
    assert.ok(h.logs.includes("route table rebuilt: /nexus-core/plm/style-cards now answers 200"));
    assert.equal(h.restarts(), 0);
    assert.equal(h.children.length, 1);
  });

  it("a table that stays stale gets one restart, and the fresh run is healthy", async () => {
    const h = simulated();
    h.sup.start();
    await h.boot();
    await h.clock.advance(20_000);
    h.child().print(STALE_TODAY);
    await h.clock.advance(10_000);
    h.child().print(STALE_TODAY);
    await h.clock.advance(1_000);
    assert.equal(h.restarts(), 1);
    assert.equal(h.children.length, 2);
    await h.boot();
    h.child().print(HEALED_TODAY);
    await h.clock.advance(60 * 60_000);
    assert.equal(h.restarts(), 1);
  });

  it("never loops: a table that stays stale for hours gets at most one restart per 30 minutes", async () => {
    const h = simulated();
    h.sup.start();
    await h.boot();
    // Three hours of a stale page requested every 5s, through every restart.
    for (let t = 0; t < 3 * 60 * 60_000; t += 5_000) {
      if (h.sup.state === STATES.STARTING && h.child().exitCode === null) await h.boot();
      if (h.sup.state === STATES.RUNNING) h.child().print(STALE_OCT_27);
      await h.clock.advance(5_000);
    }
    assert.ok(h.restarts() >= 1 && h.restarts() <= 6, `${h.restarts()} restarts`);
    assert.ok(h.logs.some((l) => l.includes("did not cure it — not restarting again")), "a useless restart is reported, not repeated");
    // At most one restart and one rebuild incident per 30 minutes: the supervisor's last-20 history survives.
    assert.ok(h.incidents.length <= 13, `${h.incidents.length} incident files`);
  });

  it("the supervisor's own restart limit still applies (shared with memory/worker restarts)", async () => {
    const h = simulated();
    h.sup.start();
    await h.boot();
    // Use up the 3-per-30-minutes budget with other deliberate restarts.
    for (let i = 0; i < 3; i++) {
      assert.equal(h.sup.requestRestart("memory", "test"), true);
      await h.clock.advance(1_000);
      await h.boot();
    }
    await h.clock.advance(20_000);
    h.child().print(STALE_TODAY);
    await h.clock.advance(10_000);
    h.child().print(STALE_TODAY);
    await h.clock.advance(1_000);
    assert.equal(h.restarts(), 0);
    assert.ok(h.logs.some((l) => l.includes("restart was refused")));
    assert.equal(h.sup.state, STATES.RUNNING);
  });

  it("genuine 404 traffic never rebuilds or restarts", async () => {
    const h = simulated();
    h.sup.start();
    await h.boot();
    await h.clock.advance(20_000);
    for (let i = 0; i < 500; i++) {
      h.child().print(i % 2 ? GENUINE_404 : " GET /login/plm/style-cards 404 in 4ms");
      await h.clock.advance(1_000);
    }
    assert.equal(h.rebuilds, 1); // only the post-boot one
    assert.equal(h.restarts(), 0);
    assert.equal(h.incidents.length, 0);
  });
});

describe("marker file", () => {
  it("is added and then removed, and leftovers are cleaned up", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "route-guard-"));
    try {
      touchAppDir(dir, { removeAfterMs: 20 });
      assert.equal(fs.readdirSync(dir).filter((n) => n.startsWith(MARKER_PREFIX)).length, 1);
      await new Promise((r) => setTimeout(r, 80));
      assert.deepEqual(fs.readdirSync(dir), []);

      fs.writeFileSync(path.join(dir, `${MARKER_PREFIX}-999`), "");
      fs.writeFileSync(path.join(dir, "page.tsx"), "");
      removeLeftoverMarkers(dir);
      assert.deepEqual(fs.readdirSync(dir), ["page.tsx"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is gitignored and not left in app/", () => {
    assert.match(fs.readFileSync(path.join(FRONTEND, ".gitignore"), "utf8"), /^\/app\/\.route-table-refresh\*$/m);
    assert.deepEqual(fs.readdirSync(APP).filter((n) => n.startsWith(MARKER_PREFIX)), []);
  });
});
