// Dev API proxy (lib/dev-api-proxy.ts, app/api/v1/[...path]/route.ts) against a real local HTTP
// server standing in for the NestJS backend: connection refused -> 503 (GETs retried briefly, other
// methods never), genuine backend statuses and bodies pass through unchanged, recovery once the
// backend listens again.
//   Run: npm run test:dev-api-proxy
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import http from "node:http";
import { register } from "node:module";
import { after, describe, it } from "node:test";

register("./workspace-test-loader.mjs", import.meta.url);
const { proxyToBackend, connectionErrorCode, BACKEND_UNAVAILABLE, BACKEND_CONNECTION_LOST } = await import("@/lib/dev-api-proxy");

const src = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const servers = [];
after(() => servers.forEach((s) => s.close()));

/** A backend on a random port; `handler(req, res, body)`. */
async function backend(handler, port = 0) {
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => handler(req, res, Buffer.concat(chunks).toString("utf8")));
  });
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  servers.push(server);
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}
/** A port with nothing listening on it. */
async function closedPort() {
  const s = http.createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const port = s.address().port;
  await new Promise((r) => s.close(r));
  return port;
}
const json = (res, status, body, headers = {}) => {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", ...headers });
  res.end(JSON.stringify(body));
};
/** fetch that counts attempts. */
const counting = () => {
  const f = (...a) => (f.calls++, fetch(...a));
  f.calls = 0;
  return f;
};
const req = (path, init) => new Request(`http://localhost:3000${path}`, init);
const quiet = { log: () => {}, sleep: async () => {} };

describe("backend not reachable", () => {
  it("GET: retried a bounded number of times, then 503 BACKEND_UNAVAILABLE with Retry-After (not a bare 500)", async () => {
    const f = counting();
    const res = await proxyToBackend(req("/api/v1/settings"), { backendUrl: `http://127.0.0.1:${await closedPort()}`, fetchImpl: f, retryDelaysMs: [1, 1], ...quiet });
    assert.equal(res.status, 503);
    assert.equal(res.headers.get("retry-after"), "3");
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.errors.code, BACKEND_UNAVAILABLE);
    assert.equal(body.errors.cause, "ECONNREFUSED");
    assert.match(body.message, /temporarily unavailable/);
    assert.equal(f.calls, 3, "1 attempt + 2 retries, then gives up");
  });

  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    it(`${method}: never retried — 503 after a single attempt`, async () => {
      const f = counting();
      const res = await proxyToBackend(req("/api/v1/items", { method, body: method === "DELETE" ? undefined : "{}" }), { backendUrl: `http://127.0.0.1:${await closedPort()}`, fetchImpl: f, retryDelaysMs: [1, 1], ...quiet });
      assert.equal(res.status, 503);
      assert.equal(f.calls, 1);
    });
  }

  it("recovers: a GET issued while the backend restarts succeeds once it listens again", async () => {
    const port = await closedPort();
    const f = counting();
    const res = await proxyToBackend(req("/api/v1/settings"), {
      backendUrl: `http://127.0.0.1:${port}`, fetchImpl: f, retryDelaysMs: [1, 1, 1], log: () => {},
      // The backend finishes restarting during the first wait.
      sleep: async () => { if (f.calls === 1) await backend((_q, r) => json(r, 200, { success: true, data: { ok: 1 } }), port); },
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { success: true, data: { ok: 1 } });
    assert.equal(f.calls, 2);
  });

  it("connection dropped mid-request: 502 BACKEND_CONNECTION_LOST, POST not retried", async () => {
    const { url } = await backend((q) => q.socket.destroy());
    const f = counting();
    const res = await proxyToBackend(req("/api/v1/receipts", { method: "POST", body: "{}" }), { backendUrl: url, fetchImpl: f, retryDelaysMs: [1, 1], ...quiet });
    assert.equal(res.status, 502);
    assert.equal((await res.json()).errors.code, BACKEND_CONNECTION_LOST);
    assert.equal(f.calls, 1);
  });
});

describe("backend answered: passed through unchanged", () => {
  it("a genuine backend 500 stays a 500 with the API's own body (distinguishable from 503), not retried", async () => {
    const body = { success: false, message: "Something broke", errors: null, meta: { path: "/api/v1/x" } };
    const { url } = await backend((_q, r) => json(r, 500, body));
    const f = counting();
    const res = await proxyToBackend(req("/api/v1/x"), { backendUrl: url, fetchImpl: f, ...quiet });
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), body);
    assert.equal(f.calls, 1);
  });

  it("401 and 400 keep their status, body and headers (including several Set-Cookie)", async () => {
    const { url } = await backend((q, r) => q.url.startsWith("/api/v1/settings")
      ? json(r, 401, { success: false, message: "Authentication required" }, { "set-cookie": ["a=1; Path=/", "b=2; Path=/"], "x-request-id": "rid-1" })
      : json(r, 400, { success: false, message: "Validation failed", errors: { code: "BRANCH_REQUIRED" } }));
    const unauth = await proxyToBackend(req("/api/v1/settings"), { backendUrl: url, ...quiet });
    assert.equal(unauth.status, 401);
    assert.equal((await unauth.json()).message, "Authentication required");
    assert.deepEqual(unauth.headers.getSetCookie(), ["a=1; Path=/", "b=2; Path=/"]);
    assert.equal(unauth.headers.get("x-request-id"), "rid-1");
    const invalid = await proxyToBackend(req("/api/v1/plm/costing-sheets"), { backendUrl: url, ...quiet });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).errors.code, "BRANCH_REQUIRED");
  });

  it("forwards method, path, query, body and headers like the old rewrite (Host -> backend, x-forwarded-host added)", async () => {
    let seen;
    const { url } = await backend((q, r, body) => { seen = { method: q.method, url: q.url, body, headers: q.headers }; r.writeHead(204); r.end(); });
    const res = await proxyToBackend(
      req("/api/v1/work-orders/5/requirements/save?type=yarn&x=%20y", { method: "POST", body: '{"a":1}', headers: { authorization: "Bearer t", "content-type": "application/json" } }),
      { backendUrl: `${url}/`, ...quiet },
    );
    assert.equal(res.status, 204);
    assert.equal(seen.method, "POST");
    assert.equal(seen.url, "/api/v1/work-orders/5/requirements/save?type=yarn&x=%20y");
    assert.equal(seen.body, '{"a":1}');
    assert.equal(seen.headers.authorization, "Bearer t");
    assert.equal(seen.headers["content-type"], "application/json");
    assert.equal(seen.headers.host, new URL(url).host);
    assert.equal(seen.headers["x-forwarded-host"], "localhost:3000");
    assert.equal(seen.headers["x-forwarded-for"], undefined, "no client IP added: throttling sees what it saw before");
  });

  it("redirects are passed to the browser, not followed", async () => {
    const { url } = await backend((_q, r) => { r.writeHead(302, { location: "/elsewhere" }); r.end(); });
    const res = await proxyToBackend(req("/api/v1/files/1"), { backendUrl: url, ...quiet });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "/elsewhere");
  });
});

describe("wiring", () => {
  it("unwraps undici's nested error causes", () => {
    const err = new TypeError("fetch failed", { cause: new AggregateError([Object.assign(new Error("x"), { code: "ECONNREFUSED" })]) });
    assert.equal(connectionErrorCode(err), "ECONNREFUSED");
    assert.equal(connectionErrorCode(new Error("other")), null);
  });

  it("the route proxies only under next dev; the old rewrite is gone; the API client flags 503 as temporary", () => {
    const route = src("app/api/v1/[...path]/route.ts");
    assert.match(route, /if \(process\.env\.NODE_ENV !== "development"\)/);
    assert.match(route, /handle as GET, handle as HEAD, handle as POST, handle as PUT, handle as PATCH, handle as DELETE, handle as OPTIONS/);
    assert.doesNotMatch(src("next.config.ts"), /rewrites:/);
    assert.match(src("lib/nexuscore-api.ts"), /if \(\[502, 503, 504\]\.includes\(res\.status\)\) \(error as any\)\.isNetworkError = true;/);
  });
});
