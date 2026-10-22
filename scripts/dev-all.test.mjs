// dev-all.mjs: backend availability reporting (fake probe + clock) and launcher wiring.
//   Run: npm run test:dev-all
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import http from "node:http";
import { describe, it } from "node:test";
import { createBackendMonitor, httpProbe } from "./dev-all-core.mjs";

function harness(slowAfterMs = 60_000) {
  let up = true;
  let t = 0;
  const logs = [];
  const monitor = createBackendMonitor({ probe: async () => up, log: (m) => logs.push(m), now: () => t, slowAfterMs });
  return { monitor, logs, setUp: (v) => (up = v), advance: (ms) => (t += ms) };
}

describe("backend availability monitor", () => {
  it("is silent while the backend stays up", async () => {
    const h = harness();
    for (let i = 0; i < 5; i++) await h.monitor.check();
    assert.deepEqual(h.logs, []);
    assert.equal(h.monitor.state, "up");
  });

  it("reports a restart once when it goes down and once when it is back, with the downtime", async () => {
    const h = harness();
    await h.monitor.check();
    h.setUp(false);
    for (let i = 0; i < 4; i++) { h.advance(2000); await h.monitor.check(); }
    h.setUp(true);
    h.advance(1500);
    await h.monitor.check();
    assert.equal(h.logs.length, 2);
    assert.match(h.logs[0], /backend :4000 stopped answering .* 503 "temporarily unavailable"/);
    assert.match(h.logs[1], /backend :4000 is back \(down 7\.5s\)/);
  });

  it("warns once when the backend stays down too long, without restarting anything", async () => {
    const h = harness(60_000);
    await h.monitor.check();
    h.setUp(false);
    for (let i = 0; i < 40; i++) { h.advance(2000); await h.monitor.check(); }
    const slow = h.logs.filter((l) => /still down after/.test(l));
    assert.equal(slow.length, 1);
    assert.match(slow[0], /still down after 60s — look above for a compile error or crash/);
    assert.equal(h.logs.length, 2);
  });

  it("a probe that throws counts as down", async () => {
    const logs = [];
    const m = createBackendMonitor({ probe: async () => { throw new Error("boom"); }, log: (x) => logs.push(x) });
    assert.equal(await m.check(), "down");
    assert.equal(logs.length, 1);
  });

  it("httpProbe: any HTTP answer is up (even 404 from an API without the health route), refused is down", async () => {
    const server = http.createServer((_q, r) => { r.writeHead(404); r.end(); });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const url = `http://127.0.0.1:${server.address().port}/api/v1/health`;
    assert.equal(await httpProbe(url)(), true);
    await new Promise((r) => server.close(r));
    assert.equal(await httpProbe(url, 500)(), false);
  });
});

describe("launcher wiring", () => {
  const src = readFileSync(new URL("./dev-all.mjs", import.meta.url), "utf8");
  it("stops both servers on Ctrl+C, closed console and Ctrl+Break, only once", () => {
    assert.match(src, /for \(const signal of \["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"\]\) process\.on\(signal, stopAll\);/);
    assert.match(src, /if \(stopping\) return;\s+stopping = true;/);
    assert.match(src, /spawnSync\("taskkill", \["\/pid", String\(c\.pid\), "\/T", "\/F"\]\)/);
  });
  it("monitors the API's health route and never restarts on its own", () => {
    assert.match(src, /httpProbe\(`http:\/\/127\.0\.0\.1:\$\{BACKEND_PORT\}\/api\/v1\/health`\)/);
    assert.doesNotMatch(src.slice(src.indexOf("const monitor")), /start\(/);
  });
  it("duplicate servers are refused by each workspace's port guard", () => {
    const be = JSON.parse(readFileSync(new URL("../nexuscore-backend/package.json", import.meta.url), "utf8"));
    const fe = JSON.parse(readFileSync(new URL("../frontend/package.json", import.meta.url), "utf8"));
    assert.match(be.scripts["prestart:dev"], /ensure-port-free\.mjs 4000/);
    assert.match(fe.scripts.predev, /ensure-port-free\.mjs 3000/);
  });
});
