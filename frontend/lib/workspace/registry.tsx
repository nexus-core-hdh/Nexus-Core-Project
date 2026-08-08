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

/** Resolves the workspace module that owns a given pathname (ignoring query string), if any. Also doubles as the by-key lookup, since a tab's key is always its module's path. */
export function findWorkspaceModule(pathname: string): WorkspaceModule | undefined {
  return MODULES_BY_PATH.get(pathname);
}

export function isWorkspaceRoute(pathname: string): boolean {
  return MODULES_BY_PATH.has(pathname);
}
