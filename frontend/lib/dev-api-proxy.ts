// Development-only same-origin API proxy (`next dev` -> the local NestJS backend), used by
// app/api/v1/[...path]/route.ts. Replaces the plain `rewrites` rule, which answered every backend
// connection failure (e.g. ECONNREFUSED while Nest watch mode restarts the API after a save) with a
// bare "Internal Server Error" 500 — indistinguishable from a genuine backend 500.
//
//   Backend answered          -> its status, headers and body pass through unchanged (401/400/500…).
//   Connection refused        -> GET/HEAD/OPTIONS retried briefly (nothing reached the backend, so a
//                                retry cannot repeat work); then 503 BACKEND_UNAVAILABLE + Retry-After.
//                                Other methods are never retried: 503 straight away.
//   Connection lost mid-call  -> 502 BACKEND_CONNECTION_LOST, never retried (the backend may already
//                                have processed the request).
// Error bodies use the API's own envelope ({ success: false, message, errors: { code } }), so the
// existing client error handling shows the message.
// Request headers are forwarded like the old rewrite did (Host rewritten to the backend, plus
// x-forwarded-host) — no x-forwarded-for is added, so per-IP throttling sees what it saw before.

export const BACKEND_UNAVAILABLE = "BACKEND_UNAVAILABLE";
export const BACKEND_CONNECTION_LOST = "BACKEND_CONNECTION_LOST";
export const BACKEND_PROXY_ERROR = "BACKEND_PROXY_ERROR";

const IDEMPOTENT = new Set(["GET", "HEAD", "OPTIONS"]);
// Nothing was sent to the backend: no server listening / host unreachable.
const NOT_CONNECTED = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "EHOSTUNREACH", "ENETUNREACH", "EADDRNOTAVAIL", "UND_ERR_CONNECT_TIMEOUT"]);
// The connection broke after the request may have been delivered.
const CONNECTION_LOST = new Set(["ECONNRESET", "EPIPE", "UND_ERR_SOCKET", "UND_ERR_CLOSED"]);
const HOP_BY_HOP_REQUEST = ["connection", "keep-alive", "proxy-authorization", "proxy-connection", "te", "trailer", "transfer-encoding", "upgrade", "host", "content-length"];
// fetch() already decoded the body, so the encoding/length headers no longer describe it.
const STRIP_RESPONSE = ["connection", "keep-alive", "transfer-encoding", "content-encoding", "content-length"];

export const DEFAULT_RETRY_DELAYS_MS = [500, 1000, 2000];
export const RETRY_AFTER_SECONDS = 3;

/** The socket-level error code of a failed fetch (undici wraps it in `cause`, sometimes an AggregateError). */
export function connectionErrorCode(err: unknown): string | null {
  const seen = new Set<unknown>();
  const queue: unknown[] = [err];
  while (queue.length) {
    const e = queue.shift() as any;
    if (!e || typeof e !== "object" || seen.has(e)) continue;
    seen.add(e);
    if (typeof e.code === "string" && (NOT_CONNECTED.has(e.code) || CONNECTION_LOST.has(e.code))) return e.code;
    if (e.cause) queue.push(e.cause);
    if (Array.isArray(e.errors)) queue.push(...e.errors);
  }
  return null;
}

export interface ProxyOptions {
  backendUrl: string;
  fetchImpl?: typeof fetch;
  retryDelaysMs?: number[];
  sleep?: (ms: number) => Promise<void>;
  log?: (message: string) => void;
}

function errorResponse(status: number, code: string, message: string, request: Request, cause: string | null) {
  const url = new URL(request.url);
  const headers = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  if (status === 503) headers.set("retry-after", String(RETRY_AFTER_SECONDS));
  return new Response(
    JSON.stringify({ success: false, message, errors: { code, cause }, meta: { path: url.pathname, method: request.method, timestamp: new Date().toISOString() } }),
    { status, headers },
  );
}

// One console line per outage instead of a stack dump per request.
let lastLogAt = 0;
const defaultLog = (message: string) => {
  const now = Date.now();
  if (now - lastLogAt < 5000) return;
  lastLogAt = now;
  console.warn(message);
};

export async function proxyToBackend(request: Request, options: ProxyOptions): Promise<Response> {
  const { backendUrl, fetchImpl = fetch, retryDelaysMs = DEFAULT_RETRY_DELAYS_MS, log = defaultLog } = options;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const incoming = new URL(request.url);
  const target = `${backendUrl.replace(/\/$/, "")}${incoming.pathname}${incoming.search}`;
  const method = request.method.toUpperCase();

  const headers = new Headers(request.headers);
  for (const h of HOP_BY_HOP_REQUEST) headers.delete(h);
  headers.set("x-forwarded-host", request.headers.get("host") ?? incoming.host);
  // Buffered (dev only, bodies are capped at 10MB by the API) so Content-Length is exact.
  const body = method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();

  const retries = IDEMPOTENT.has(method) ? retryDelaysMs : [];
  for (let attempt = 0; ; attempt++) {
    let upstream: Response;
    try {
      upstream = await fetchImpl(target, { method, headers, body, redirect: "manual", signal: request.signal, cache: "no-store" });
    } catch (err) {
      if (request.signal?.aborted) throw err; // the browser went away; nothing to answer
      const code = connectionErrorCode(err);
      if (code && NOT_CONNECTED.has(code)) {
        if (attempt < retries.length) {
          await sleep(retries[attempt]);
          continue;
        }
        log(`[dev-api-proxy] backend ${backendUrl} not reachable (${code}) — answering 503 until it is back`);
        return errorResponse(503, BACKEND_UNAVAILABLE, "The NexusCore API is temporarily unavailable (it may be restarting). Please try again in a few seconds.", request, code);
      }
      if (code && CONNECTION_LOST.has(code)) {
        log(`[dev-api-proxy] connection to ${backendUrl} lost during ${method} ${incoming.pathname} (${code})`);
        return errorResponse(502, BACKEND_CONNECTION_LOST, "The connection to the NexusCore API was interrupted. Check whether the action was completed before trying again.", request, code);
      }
      log(`[dev-api-proxy] ${method} ${incoming.pathname} failed: ${(err as Error)?.message ?? String(err)}`);
      return errorResponse(502, BACKEND_PROXY_ERROR, "The NexusCore API could not be reached.", request, null);
    }

    const responseHeaders = new Headers(upstream.headers);
    for (const h of STRIP_RESPONSE) responseHeaders.delete(h);
    const noBody = method === "HEAD" || upstream.status === 204 || upstream.status === 304;
    return new Response(noBody ? null : upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders });
  }
}
