export interface WorkspaceModule {
  /** The route this module owns, and its stable tab identity — a screen can
   *  be pointed at different records (e.g. ?id=5) without losing its tab, since
   *  the tab key is this fixed base path, not the full href with query params. */
  path: string;
  Component: React.ComponentType;
}

// The Workspace framework doesn't hand-register screens. `GENERATED_WORKSPACE_MODULES`
// is produced by scripts/generate-workspace-registry.mjs, which walks the real
// Next.js file-based router (app/dashboard/(auth)/**/page.tsx) — the same
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
import { GENERATED_WORKSPACE_MODULES } from "./registry.generated";

export const WORKSPACE_MODULES: WorkspaceModule[] = GENERATED_WORKSPACE_MODULES;

const MODULES_BY_PATH = new Map(WORKSPACE_MODULES.map((m) => [m.path, m]));

/** Resolves the workspace module that owns a given pathname (ignoring query string), if any. Also doubles as the by-key lookup, since a tab's key is always its module's path — tolerant of a
 *  `path?param=value` composite key too (see MULTI_KEY_ROUTES/resolveTabKey below), which is why
 *  the `?`-suffix is stripped before the lookup even though ordinary keys never contain one. */
export function findWorkspaceModule(pathname: string): WorkspaceModule | undefined {
  return MODULES_BY_PATH.get(pathname.split("?")[0]);
}

export function isWorkspaceRoute(pathname: string): boolean {
  return MODULES_BY_PATH.has(pathname.split("?")[0]);
}

// Opt-in only: every route not listed here keeps the default one-tab-per-path behavior
// (resolveTabKey returns the path unchanged) exactly as before. A route listed here gets one
// independently-open tab per distinct value of the named query param, instead of one shared tab
// slot for the whole route (which is what every other multi-variant screen, e.g. the 18-type
// Inventory Receipts screen, still uses — that one deliberately reuses a single tab).
const MULTI_KEY_ROUTES: Record<string, string> = {
  "/dashboard/legacy-erp/fabric-yarn-requirements": "type",
};

/** Computes a tab's key for a given module path + the href being opened. Returns `pathname`
 *  unchanged for every route not in MULTI_KEY_ROUTES (byte-identical to the old `mod.path`
 *  behavior) — only an opted-in route gets a `path?param=value` composite key so two values of
 *  that param can be open as two separate tabs at once. */
export function resolveTabKey(pathname: string, href: string): string {
  const param = MULTI_KEY_ROUTES[pathname];
  if (!param) return pathname;
  const query = href.split("?")[1] ?? "";
  const value = new URLSearchParams(query).get(param);
  return value ? `${pathname}?${param}=${value}` : pathname;
}
