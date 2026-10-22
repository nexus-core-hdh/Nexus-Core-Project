// Workspace tabs / My Menu survive a temporary /settings failure (API restarting): nothing is written
// back while the saved workspace is not loaded, the load is retried automatically, and once the API
// is back the saved tabs come back merged with tabs opened meanwhile.
//   Run: npm run test:workspace-resilience
import assert from "node:assert/strict";
import { register } from "node:module";
import { describe, it } from "node:test";

register("./workspace-test-loader.mjs", import.meta.url);

const SAVED = {
  tablePreferences: {
    workspace: {
      tabs: [
        { key: "/plm/style-cards", href: "/plm/style-cards", dirty: false },
        { key: "/legacy-erp/work-orders-list", href: "/legacy-erp/work-orders-list", dirty: false },
      ],
      activeKey: "/plm/style-cards",
    },
    myMenu: [{ key: "/legacy-erp/work-orders-list", href: "/legacy-erp/work-orders-list", order: 0 }],
  },
};
const unavailable = () => Object.assign(new Error("The NexusCore API is temporarily unavailable"), { status: 503, isNetworkError: true });

// The first load (at import) fails the way it does while the backend restarts.
globalThis.__workspaceSettings = SAVED;
globalThis.__workspaceSettingsError = unavailable();
globalThis.__workspaceSettingsWrites = [];
const warnings = [];
const originalWarn = console.warn;
console.warn = (...args) => warnings.push(args.join(" "));

const { useWorkspaceStore, WORKSPACE_RELOAD_DELAYS_MS } = await import("@/lib/store/workspace-store");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (cond, ms = 6000) => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error("timed out");
    await sleep(25);
  }
};
const keys = () => useWorkspaceStore.getState().tabs.map((t) => t.key);
const writes = () => globalThis.__workspaceSettingsWrites;

describe("temporary /settings failure", () => {
  it("keeps the session usable but never writes over the saved workspace", async () => {
    await waitFor(() => useWorkspaceStore.persist.hasHydrated());
    WORKSPACE_RELOAD_DELAYS_MS.splice(0, WORKSPACE_RELOAD_DELAYS_MS.length, 300); // faster retries from here on
    // What a page does right after loading: open its own tab, retitle it, pin something.
    useWorkspaceStore.getState().openTab({ key: "/plm/costing-sheets", href: "/plm/costing-sheets" });
    useWorkspaceStore.getState().setTabTitle("/plm/costing-sheets", "Costing Sheets");
    useWorkspaceStore.getState().pin("/plm/costing-sheets", "/plm/costing-sheets");
    assert.deepEqual(keys(), ["/plm/costing-sheets"], "the open tab works while the saved tabs are not loaded");
    await sleep(900); // past the 600ms write debounce
    assert.deepEqual(writes(), [], "no write: it would have replaced the saved tabs and My Menu");
    assert.ok(warnings.some((w) => /Workspace tabs not loaded yet/.test(w)), "logged as a warning, not a console error");
  });

  it("keeps retrying while the API is still unavailable, still without writing", async () => {
    // The first retry was scheduled at import with the real 2s delay; later ones use 300ms.
    await waitFor(() => warnings.filter((w) => /Workspace tabs not loaded yet/.test(w)).length >= 3, 5000);
    assert.deepEqual(writes(), []);
  });

  it("recovers automatically once the API is back: saved tabs and My Menu return, merged with the tab opened meanwhile", async () => {
    globalThis.__workspaceSettingsError = undefined;
    await waitFor(() => keys().includes("/plm/style-cards"));
    assert.deepEqual(keys(), ["/plm/style-cards", "/legacy-erp/work-orders-list", "/plm/costing-sheets"]);
    assert.equal(useWorkspaceStore.getState().activeKey, "/plm/costing-sheets", "the tab for the current page stays active");
    assert.ok(useWorkspaceStore.getState().isPinned("/legacy-erp/work-orders-list"), "saved My Menu restored");
    // The changes held during the outage are written once, on top of the saved workspace.
    await waitFor(() => writes().length > 0, 3000);
    const saved = writes().at(-1).tablePreferences;
    assert.deepEqual(saved.workspace.tabs.map((t) => t.key), ["/plm/style-cards", "/legacy-erp/work-orders-list", "/plm/costing-sheets"]);
    assert.deepEqual(saved.myMenu.map((m) => m.key), ["/legacy-erp/work-orders-list"]);
  });

  it("after recovery, ordinary changes are saved again", async () => {
    const before = writes().length;
    useWorkspaceStore.getState().closeTab("/legacy-erp/work-orders-list");
    await waitFor(() => writes().length > before, 3000);
    assert.deepEqual(writes().at(-1).tablePreferences.workspace.tabs.map((t) => t.key), ["/plm/style-cards", "/plm/costing-sheets"]);
    console.warn = originalWarn;
  });
});
