// Node module hooks for workspace-record-tabs.test.mjs: resolves the app's `@/` alias, transpiles
// .ts/.tsx with the project's own TypeScript, and stubs the few imports that need a browser/Next
// runtime (the settings API, next/navigation, the generated page registry).
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const FRONTEND_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const STUBS = {
  // Tests set globalThis.__workspaceSettings to simulate what the backend has persisted.
  "@/lib/api": `export const settingsApi = { getCurrentSettings: async () => globalThis.__workspaceSettings ?? {}, updateCurrentSettings: async () => ({}) };
    // screen-search.test.mjs: the live GET /menu-items response and the permission batch check.
    export const menuItemsApi = { getMenuItems: async () => (globalThis.__menuItemsCalls = (globalThis.__menuItemsCalls ?? 0) + 1, globalThis.__menuItems ?? []) };
    export const permissionSettingsApi = { checkResourcePermissionsBatch: async (paths) => ({ permissions: Object.fromEntries(paths.map((p) => [p, true])) }) };`,
  "@/lib/auth": "export const getCurrentUser = () => globalThis.__currentUser ?? null;",
  // Same shape transformMenuItem produces (title/href/isComing/items); icons are irrelevant here.
  "@/components/layout/sidebar/nav-main": `export const transformMenuItem = (i) => ({ title: i.title, href: i.href, isComing: !!i.isComing, isNew: !!i.isNew, ...(i.items?.length ? { items: i.items.map(transformMenuItem) } : {}) });
    export const mergeAdministrationExtras = (g) => g;`,
  "@/lib/finance-erp/nav": "export const mergeFinanceErpModule = (g) => g;",
  // lib/app-navigation (company-slug aware) wraps next/navigation's router too; the tests never navigate.
  "next/navigation": "export const usePathname = () => null; export const useSearchParams = () => new URLSearchParams(); export const useParams = () => ({}); export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, back() {}, forward() {}, refresh() {} }); export const redirect = () => {}; export const notFound = () => {};",
  // Same shape as the real generated file; record routes mirror real app routes.
  "./registry.generated": `export const GENERATED_WORKSPACE_MODULES = [
    { path: "/plm/style-cards", Component: () => null },
    { path: "/plm/costing-sheets", Component: () => null },
    { path: "/legacy-erp/inventory-cards-list", Component: () => null },
    { path: "/legacy-erp/inventory-receipts", Component: () => null },
    { path: "/legacy-erp/inventory-receipts-list", Component: () => null },
    { path: "/legacy-erp/purchase-orders", Component: () => null },
    { path: "/legacy-erp/purchase-orders-list", Component: () => null },
    { path: "/legacy-erp/work-orders", Component: () => null },
    { path: "/legacy-erp/work-orders-list", Component: () => null },
    { path: "/legacy-erp/cutting-card/entry", Component: () => null },
    { path: "/finance-erp/payable/purchase-orders", Component: () => null },
    { path: "/finance-erp/payable/purchase-orders-list", Component: () => null },
    { path: "/legacy-erp/packing-lists", Component: () => null },
    { path: "/legacy-erp/packing-lists-list", Component: () => null },
    { path: "/crm/deals/dashboards/create", Component: () => null },
  ];
  export const GENERATED_RECORD_ROUTES = [
    "/crm/deals/dashboards/[id]/edit",
    "/plm/costing-sheets/[id]",
    "/plm/style-cards/[id]",
  ];`,
};

function probe(base) {
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (existsSync(candidate) && !candidate.endsWith(path.sep)) return candidate;
  }
  return null;
}

export async function resolve(specifier, context, next) {
  if (STUBS[specifier]) return { url: `stub:${specifier}`, shortCircuit: true };
  if (specifier.startsWith("@/")) {
    const file = probe(path.join(FRONTEND_ROOT, specifier.slice(2)));
    if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
  }
  if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
    const file = probe(path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier));
    if (file && /\.tsx?$/.test(file)) return { url: pathToFileURL(file).href, shortCircuit: true };
  }
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (url.startsWith("stub:")) return { format: "module", source: STUBS[url.slice(5)], shortCircuit: true };
  if (/\.tsx?$/.test(url)) {
    const source = readFileSync(fileURLToPath(url), "utf8");
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    });
    return { format: "module", source: outputText, shortCircuit: true };
  }
  return next(url, context);
}
