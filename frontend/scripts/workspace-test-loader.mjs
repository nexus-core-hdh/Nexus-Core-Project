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
  "@/lib/api": "export const settingsApi = { getCurrentSettings: async () => globalThis.__workspaceSettings ?? {}, updateCurrentSettings: async () => ({}) };",
  "next/navigation": "export const usePathname = () => null; export const useSearchParams = () => new URLSearchParams();",
  // Same shape as the real generated file; record routes mirror real app routes.
  "./registry.generated": `export const GENERATED_WORKSPACE_MODULES = [
    { path: "/dashboard/plm/style-cards", Component: () => null },
    { path: "/dashboard/plm/costing-sheets", Component: () => null },
    { path: "/dashboard/legacy-erp/inventory-cards-list", Component: () => null },
    { path: "/dashboard/legacy-erp/inventory-receipts", Component: () => null },
    { path: "/dashboard/legacy-erp/inventory-receipts-list", Component: () => null },
    { path: "/dashboard/legacy-erp/purchase-orders", Component: () => null },
    { path: "/dashboard/legacy-erp/purchase-orders-list", Component: () => null },
    { path: "/dashboard/legacy-erp/work-orders", Component: () => null },
    { path: "/dashboard/legacy-erp/work-orders-list", Component: () => null },
    { path: "/dashboard/legacy-erp/cutting-card/entry", Component: () => null },
    { path: "/dashboard/finance-erp/payable/purchase-orders", Component: () => null },
    { path: "/dashboard/finance-erp/payable/purchase-orders-list", Component: () => null },
    { path: "/dashboard/crm/deals/dashboards/create", Component: () => null },
  ];
  export const GENERATED_RECORD_ROUTES = [
    "/dashboard/crm/deals/dashboards/[id]/edit",
    "/dashboard/plm/costing-sheets/[id]",
    "/dashboard/plm/style-cards/[id]",
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
