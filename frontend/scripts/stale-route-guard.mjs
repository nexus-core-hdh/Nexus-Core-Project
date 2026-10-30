// Stale route table guard for `next dev` (wired in by dev-supervisor.mjs; tested by
// stale-route-guard.test.mjs).
//
// The failure: `next dev` keeps its own table of app routes, rebuilt from its file watcher's snapshot of
// app/ on every file event. Those rebuilds are not serialised (each reads the snapshot, awaits, then
// overwrites the table), so a rebuild that started from an incomplete snapshot can finish last. At boot
// the first snapshot often holds only the top-level pages (app/[company]/(auth)/<module>/page.tsx), so
// a table can be left knowing only one-level routes: every nested page and record page answers
// "404 Page not found" while its page.tsx is on disk, until some file event rebuilds it. Observed
// 2026-10-29 (Next's trace: nested requests went straight to /_not-found, never trying the page) for
// ~4.5 hours; one file event brought every route back.
//
// The guard:
//   * rebuilds the table once shortly after each boot (cheap; covers the boot-time race), and
//   * watches next dev's request log: a 404 for a path that a page on disk serves means the table is
//     stale (unknown paths, guest/reserved paths and pages that call notFound() are left alone) — it
//     rebuilds the table, and asks for a restart only if those 404s continue after the rebuild.
// A rebuild = adding then removing a marker file in app/: a file event that makes Next recompute its
// routes from the watcher's current snapshot. It never reloads open browsers.
import fs from "node:fs";
import path from "node:path";

/** Marker file the guard adds and removes in app/ (gitignored; any leftover is removed on start). */
export const MARKER_PREFIX = ".route-table-refresh";

const ANSI = /\x1b\[[0-9;]*m/g;
// ` GET /acme/plm/style-cards/<id>?_rsc=x 404 in 46ms (next.js: 13ms, ...)`
const REQUEST = /^\s*(?:GET|HEAD)\s+(\/\S*)\s+(\d{3})\s+in\b/;

/** `{ pathname, status }` of a page request in next dev's log, or null for any other line. */
export function parseRequest(line) {
  const match = REQUEST.exec(line.replace(ANSI, ""));
  if (!match) return null;
  const pathname = match[1].split(/[?#]/)[0];
  if (pathname.startsWith("/_next/") || pathname.startsWith("/api/") || /\.[a-z0-9]+$/i.test(pathname)) return null;
  return { pathname, status: Number(match[2]) };
}

/** The pathname of a page request next dev answered with 404, or null for any other line. */
export function parse404(line) {
  const request = parseRequest(line);
  return request?.status === 404 ? request.pathname : null;
}

/**
 * The page routes under `routeDir` as URL paths: static ones in `statics`, dynamic (`[id]`) ones as
 * regexes. Route groups `(x)` and parallel-route slots `@x` add no segment; private `_x` and
 * intercepting `(.)x` folders are not routes. Pages that call notFound() are left out — their 404s can
 * be genuine (a missing record).
 */
export function loadAppRoutes(routeDir) {
  const statics = new Set();
  const dynamic = [];
  (function walk(dir, segments) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const name = entry.name;
      if (entry.isDirectory()) {
        if (name.startsWith("_") || /^\(\.+\)/.test(name)) continue;
        const noSegment = /^\(.*\)$/.test(name) || name.startsWith("@");
        walk(path.join(dir, name), noSegment ? segments : [...segments, name]);
      } else if (/^page\.(tsx|ts|jsx|js)$/.test(name)) {
        let source = "";
        try {
          source = fs.readFileSync(path.join(dir, name), "utf8");
        } catch {}
        if (/\bnotFound\s*\(/.test(source)) continue;
        const route = "/" + segments.join("/");
        if (!route.includes("[")) {
          statics.add(route);
          continue;
        }
        const pattern = route
          .split("/")
          .map((s) => (/^\[\[?\.\.\./.test(s) ? ".*" : /^\[.+\]$/.test(s) ? "[^/]+" : s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
          .join("/");
        dynamic.push(new RegExp(`^${pattern}$`));
      }
    }
  })(routeDir, []);
  return { statics, dynamic };
}

/**
 * First URL segments that are never a company slug: root-level routes and route groups' top folders
 * (login, s, shared, error, ...), public/ files and Next's own prefixes. A 404 under one of them is a
 * genuinely unknown URL, not a company page.
 */
export function loadReservedSegments(appDir) {
  const reserved = new Set(["api", "_next"]);
  const add = (dir) => {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {}
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith("_") || e.name.startsWith("[")) continue;
      if (/^\(.*\)$/.test(e.name)) add(path.join(dir, e.name));
      else reserved.add(e.name.toLowerCase());
    }
  };
  add(appDir);
  try {
    for (const name of fs.readdirSync(path.join(appDir, "..", "public"))) reserved.add(name.toLowerCase());
  } catch {}
  return reserved;
}

/** Company pages (app/[company]/(auth)) plus the segments that can never be a company slug. */
export function loadCompanyRoutes(appDir) {
  const companyDir = path.join(appDir, "[company]", "(auth)");
  const routes = loadAppRoutes(companyDir);
  const reserved = loadReservedSegments(appDir);
  // Module names (plm, crm, ...) are app paths, never slugs (lib/company-path.ts reserves them too).
  for (const route of routes.statics) if (route.split("/")[1]) reserved.add(route.split("/")[1].toLowerCase());
  return { ...routes, reserved };
}

/** Whether `/{company}/rest` is served by a company page in `routes`. */
export function isServedByPage(pathname, routes) {
  const company = pathname.split("/")[1] ?? "";
  if (!company || routes.reserved?.has(company.toLowerCase())) return false;
  const rest = pathname.slice(company.length + 1).replace(/\/+$/, "");
  if (!rest) return false; // `/{company}` alone is a redirect, never a page
  return routes.statics.has(rest) || routes.dynamic.some((re) => re.test(rest));
}

/**
 * Decides, line by line, what a stale route table needs. At most one rebuild and one restart request per
 * `escalateWithinMs`, however much 404 traffic there is.
 *
 * @param {object} o
 * @param {() => {statics: Set<string>, dynamic: RegExp[], reserved?: Set<string>}} o.loadRoutes read fresh on every 404 (pages may be added)
 * @param {(pathname: string) => void} o.refresh rebuild next dev's route table
 * @param {(detail: string) => boolean} o.escalate restart next dev; false when the restart was refused (restart limit)
 * @param {(msg: string) => void} o.log
 * @param {() => number} [o.now]
 * @param {number} [o.settleMs] 404s this soon after a rebuild were already in flight — ignored
 * @param {number} [o.escalateWithinMs] a page still 404ing this long after a rebuild escalates; also the quiet period after one
 */
export function createStaleRouteGuard({ loadRoutes, refresh, escalate, log, now = Date.now, settleMs = 5_000, escalateWithinMs = 2 * 60_000 }) {
  let refreshedAt = -Infinity;
  let refreshedPath = null;
  let escalated = false;
  let confirmed = false;

  return {
    /** Feed one line of next dev output. Returns what it did: "refresh" | "escalate" | "recovered" | null. */
    observe(line) {
      const request = parseRequest(line);
      if (!request) return null;
      const since = now() - refreshedAt;
      if (request.status !== 404) {
        if (refreshedPath && !confirmed && !escalated && request.pathname === refreshedPath && since < escalateWithinMs) {
          confirmed = true;
          log(`route table rebuilt: ${request.pathname} now answers ${request.status}`);
          return "recovered";
        }
        return null;
      }
      if (!isServedByPage(request.pathname, loadRoutes())) return null;
      if (since < settleMs) return null;
      if (since < escalateWithinMs) {
        if (escalated) return null; // one restart request per occurrence — never a loop
        escalated = true;
        const accepted = escalate(
          `${request.pathname} still answers 404 ${Math.round(since / 1000)}s after a route table rebuild, although a page on disk serves it`,
        );
        if (!accepted) log(`stale route table persists and the restart was refused (restart limit) — not acting again for ${Math.round(escalateWithinMs / 1000)}s; restart npm run dev if pages keep answering 404`);
        return "escalate";
      }
      refreshedAt = now();
      refreshedPath = request.pathname;
      escalated = false;
      confirmed = false;
      log(`stale route table: ${request.pathname} answered 404 although a page on disk serves it — rebuilding next dev's routes`);
      refresh(request.pathname);
      return "refresh";
    },
    /** A new next dev run: forget the previous run's history. */
    reset() {
      refreshedAt = -Infinity;
      refreshedPath = null;
      escalated = false;
      confirmed = false;
    },
  };
}

/** Adds, then removes, a marker file in `appDir`: two file events that make next dev rebuild its routes. */
export function touchAppDir(appDir, { removeAfterMs = 1500, onError = () => {} } = {}) {
  const marker = path.join(appDir, `${MARKER_PREFIX}-${process.pid}`);
  try {
    fs.writeFileSync(marker, `${new Date().toISOString()}\n`);
  } catch (err) {
    onError(err);
    return;
  }
  setTimeout(() => {
    try {
      fs.rmSync(marker, { force: true });
    } catch (err) {
      onError(err);
    }
  }, removeAfterMs).unref?.();
}

/** Removes markers a previous supervisor left behind (e.g. it was killed between add and remove). */
export function removeLeftoverMarkers(appDir) {
  try {
    for (const name of fs.readdirSync(appDir)) {
      if (name.startsWith(MARKER_PREFIX)) fs.rmSync(path.join(appDir, name), { force: true });
    }
  } catch {}
}

/**
 * Connects the guard to a dev-supervisor (dev-supervisor-core.mjs): returns its onReady/onOutputLine
 * hooks. Restarts go through supervisor.requestRestart, so its restart limit and loop protection apply.
 *
 * @param {object} o
 * @param {{ state: string, current: object | null, requestRestart: (kind: string, detail: string) => boolean }} o.supervisor
 * @param {string} o.runningState the supervisor's RUNNING state
 * @param {string} o.appDir the frontend's app/ directory
 * @param {(msg: string) => void} o.log
 * @param {(kind: string, detail: string) => string | null} o.writeIncident
 * @param {(appDir: string) => void} [o.rebuild] defaults to touchAppDir
 * @param {() => object} [o.loadRoutes] defaults to loadCompanyRoutes(appDir)
 * @param {{ now: () => number, setTimeout: Function }} [o.clock]
 * @param {number} [o.postReadyRebuildMs] delay of the one rebuild after each boot; 0 = none
 * @param {number} [o.incidentEveryMs] at most one rebuild incident file per this period (supervisor.log has every action)
 * @param {number} [o.restartEveryMs] at most one stale-routes restart per this period: when a restart did not
 *        cure it, another one will not either — it is reported instead of disrupting users again
 * @param {boolean} [o.enabled]
 */
export function attachStaleRouteGuard({
  supervisor,
  runningState,
  appDir,
  log,
  writeIncident,
  rebuild = (dir) => touchAppDir(dir, { onError: (err) => log(`could not rebuild next dev's routes: ${err.message}`) }),
  loadRoutes = () => loadCompanyRoutes(appDir),
  clock = { now: Date.now, setTimeout },
  postReadyRebuildMs = 15_000,
  incidentEveryMs = 30 * 60_000,
  restartEveryMs = 30 * 60_000,
  enabled = true,
}) {
  let lastIncidentAt = -Infinity;
  let lastRestartAt = -Infinity;
  const guard = createStaleRouteGuard({
    loadRoutes,
    log,
    now: clock.now,
    refresh: (pathname) => {
      if (clock.now() - lastIncidentAt >= incidentEveryMs) {
        lastIncidentAt = clock.now();
        const routes = loadRoutes();
        const file = writeIncident(
          "stale-routes",
          `next dev answered 404 for ${pathname}, which app/[company]/(auth) serves (${routes.statics.size} static + ${routes.dynamic.length} dynamic company pages on disk); ` +
            `route table rebuild requested. Expect "route table rebuilt: ${pathname} now answers ..." in supervisor.log, or a stale-routes restart if it keeps answering 404. ` +
            `To confirm which layer was stale, look in .next/dev/trace for that request: no ensure-page span for "/[company]/(auth)/..." means next dev's route table did not know the page.`,
        );
        if (file) log(`details: ${file}`);
      }
      rebuild(appDir);
    },
    escalate: (detail) => {
      if (clock.now() - lastRestartAt < restartEveryMs) {
        log(`${detail}. A stale-routes restart ${Math.round((clock.now() - lastRestartAt) / 60_000)} min ago did not cure it — not restarting again; please report this with .next/dev-supervisor/ and .next/dev/trace`);
        return false;
      }
      const accepted = supervisor.requestRestart("stale-routes", detail);
      if (accepted) lastRestartAt = clock.now();
      return accepted;
    },
  });

  return {
    onReady(run) {
      guard.reset();
      if (!enabled || !postReadyRebuildMs) return;
      const timer = clock.setTimeout(() => {
        if (supervisor.current !== run || supervisor.state !== runningState) return;
        log("rebuilding next dev's route table once after boot (guards against a boot-time stale route table)");
        rebuild(appDir);
      }, postReadyRebuildMs);
      timer?.unref?.();
    },
    onOutputLine(line) {
      if (!enabled || supervisor.state !== runningState) return;
      guard.observe(line);
    },
  };
}
