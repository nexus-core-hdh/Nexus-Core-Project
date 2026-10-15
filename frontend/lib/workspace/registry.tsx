export interface WorkspaceModule {
  /** The route this module owns, and its stable tab identity — a screen can
   *  be pointed at different records (e.g. ?id=5) without losing its tab, since
   *  the tab key is this fixed base path, not the full href with query params. */
  path: string;
  Component: React.ComponentType;
}

// The Workspace framework doesn't hand-register screens. `GENERATED_WORKSPACE_MODULES`
// is produced by scripts/generate-workspace-registry.mjs, which walks the real
// Next.js file-based router (app/[company]/(auth)/**/page.tsx) — the same
// "routing configuration" the App Router itself uses — and runs automatically
// before `next dev`/`next build` (see package.json). Adding a new screen means
// adding its page.tsx and a nav entry; nothing here needs to change.
//
// One structural exception: pages that export `generateMetadata` (a
// Server-Component-only API) can't be mounted through a client-side
// `next/dynamic` import — Next.js's RSC compiler rejects it outright, since
// that export must never reach client code. The generator skips those; they
// keep working as normal Next.js pages, just without a Workspace tab. In this
// codebase that's mostly the demo/template pages (Academy, Mail, Kanban, ...)
// carried over from the starter kit, not the ERP's own business screens.
import { GENERATED_RECORD_ROUTES, GENERATED_WORKSPACE_MODULES } from "./registry.generated";

export const WORKSPACE_MODULES: WorkspaceModule[] = GENERATED_WORKSPACE_MODULES;

// Record (dynamic-segment) routes, e.g. /dashboard/plm/style-cards/[id]. Not mountable by the stack
// (see the generator), so they render as ordinary Next.js pages — but each opened record still gets
// its own tab, keyed by its concrete pathname (record identity included), so navigating to another
// screen keeps it in the tab bar to come back to.
const RECORD_ROUTE_PATTERNS = GENERATED_RECORD_ROUTES.map((pattern) => ({
  pattern,
  // Route paths here are only [a-z0-9-/] plus `[param]` segments, so swapping each segment for a capture group is enough.
  regex: new RegExp("^" + pattern.replace(/\[[^/\]]+\]/g, "([^/]+)") + "$"),
}));

/** The record route pattern a pathname belongs to (ignoring query string) — undefined for static
 *  workspace modules (those always win) and for anything else. */
export function findRecordRoute(pathname: string): string | undefined {
  const path = pathname.split("?")[0];
  if (MODULES_BY_PATH.has(path)) return undefined;
  return RECORD_ROUTE_PATTERNS.find((r) => r.regex.test(path))?.pattern;
}

/** True for a record route opened on its create form (`.../new`, `.../create`) rather than an existing record. */
export function isNewRecordPath(pathname: string): boolean {
  const pattern = findRecordRoute(pathname);
  if (!pattern) return false;
  const values = RECORD_ROUTE_PATTERNS.find((r) => r.pattern === pattern)!.regex.exec(pathname.split("?")[0])!.slice(1);
  return values.some((v) => v === "new" || v === "create");
}

const MODULES_BY_PATH = new Map(WORKSPACE_MODULES.map((m) => [m.path, m]));

/** Resolves the workspace module that owns a given pathname (ignoring query string), if any. Also doubles as the by-key lookup, since a tab's key is always its module's path, or a
 *  `path?param=value` composite key for a record (see resolveTabKey below), which is why
 *  the `?`-suffix is stripped before the lookup. */
export function findWorkspaceModule(pathname: string): WorkspaceModule | undefined {
  return MODULES_BY_PATH.get(pathname.split("?")[0]);
}

export function isWorkspaceRoute(pathname: string): boolean {
  return MODULES_BY_PATH.has(pathname.split("?")[0]);
}

// The query param that carries a record's identity on a form screen (`?id=6&mode=view` — the
// list+form convention every Legacy/Finance ERP document screen follows). Every distinct value is its
// own tab, so IR-6, IR-7 and IR-8 stay open side by side; other params (mode, receiptType, inner-tab
// state, ...) only ride along on the tab's href. A route without it (a list screen, a create form)
// keeps one tab per path.
const RECORD_ID_PARAM = "id";

// Routes whose tab identity is a param other than `id` (it replaces `id` for that route). Same rule
// — one independently-open tab per distinct value — for screens whose identity isn't a record id.
const MULTI_KEY_ROUTES: Record<string, string> = {
  "/legacy-erp/fabric-yarn-requirements": "type",
  // Each Production Color gets its own open Cutting Entry tab, matching "each color must have its
  // own independent Cutting context". The Cutting Card MAIN screen (search + color matrix, no color
  // param yet) carries no such param — one shared tab reused across whichever Work Order is searched.
  "/legacy-erp/cutting-card/entry": "color",
  // One open tab per (Order, Process, mode, Color) — `k` is built by Order Manufacturing Entry's buttons.
  "/legacy-erp/order-manufacturing-entry/entry": "k",
  // Every user-defined report (PLM, Legacy ERP, Docket Management) is its own screen (its own menu entry and its own tab), and
  // each report being edited in the designer gets its own tab too.
  "/plm/reports/view": "id",
  "/plm/reports/designer": "id",
  "/legacy-erp/reports/view": "id",
  "/legacy-erp/reports/designer": "id",
  "/dockets/reports/view": "id",
  "/dockets/reports/designer": "id",
};

/** Computes a tab's key for a given module path + the href being opened: `path?id=<value>` when the
 *  href names a record (or `path?<param>=<value>` for a MULTI_KEY_ROUTES route), else `pathname`.
 *  Only the identity param is part of the key, so transient params never split a record into two tabs. */
export function resolveTabKey(pathname: string, href: string): string {
  const param = MULTI_KEY_ROUTES[pathname] ?? RECORD_ID_PARAM;
  const query = href.split("?")[1] ?? "";
  const value = new URLSearchParams(query).get(param);
  return value ? `${pathname}?${param}=${value}` : pathname;
}

/** The canonical tab key for any href — a workspace module's (resolveTabKey) or a record route's
 *  (its pathname) — or undefined for a route the workspace doesn't track. */
export function tabKeyForHref(href: string): string | undefined {
  const [pathname] = href.split("?");
  if (findWorkspaceModule(pathname)) return resolveTabKey(pathname, href);
  if (findRecordRoute(pathname)) return pathname;
  return undefined;
}

/** True when an href opens a create form — `?mode=create|new` on a form screen, or a record route's `/new`. */
export function isCreateHref(href: string): boolean {
  const [pathname, query = ""] = href.split("?");
  const mode = new URLSearchParams(query).get("mode")?.toLowerCase();
  return mode === "create" || mode === "new" || isNewRecordPath(pathname);
}

/** `href` re-pointed at record `id` — a create form's href becomes the saved record's edit href. */
export function withRecordId(href: string, id: string): string {
  const [pathname, query = ""] = href.split("?");
  const params = new URLSearchParams(query);
  params.set(RECORD_ID_PARAM, id);
  const mode = params.get("mode")?.toLowerCase();
  if (mode === "create" || mode === "new") params.set("mode", "edit");
  return `${pathname}?${params.toString()}`;
}
