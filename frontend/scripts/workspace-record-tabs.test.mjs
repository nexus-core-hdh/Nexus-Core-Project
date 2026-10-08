// Headless tests for Workspace record tabs (dynamic `[id]` routes): the real workspace store,
// registry, record-route sync and tab-title resolver, driven the way the sidebar/search
// (navigateOrOpenTab), list-row links / deep links (useRecordTabSync) and the tab bar do.
//   Run: npm run test:workspace-tabs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { beforeEach, describe, it } from "node:test";

register("./workspace-test-loader.mjs", import.meta.url);

const { useWorkspaceStore } = await import("@/lib/store/workspace-store");
const { findRecordRoute, isNewRecordPath } = await import("@/lib/workspace/registry");
const { navigateOrOpenTab } = await import("@/lib/workspace/navigate");
const { syncRecordRouteTab } = await import("@/hooks/use-record-tab-sync");
const { resolveWorkspaceTabTitle } = await import("@/lib/workspace/resolve-tab-title");

await new Promise((done) =>
  useWorkspaceStore.persist.hasHydrated() ? done() : useWorkspaceStore.persist.onFinishHydration(done)
);

const STYLE_LIST = "/dashboard/plm/style-cards";
const STYLE_A = "/dashboard/plm/style-cards/0b6c1c8e-aaaa-4c1e-9f51-000000000001";
const STYLE_B = "/dashboard/plm/style-cards/0b6c1c8e-bbbb-4c1e-9f51-000000000002";
const COSTING = "/dashboard/plm/costing-sheets/77";
const INVENTORY = "/dashboard/legacy-erp/inventory-cards-list";

// What the browser URL does in response: navigateOrOpenTab/goTo call router.replace, then the
// layout's useRecordTabSync sees the new route.
const urls = [];
const router = { push: (href) => urls.push(href), replace: (href) => urls.push(href) };
const land = (href) => {
  const [pathname, query = ""] = href.split("?");
  syncRecordRouteTab(pathname, query);
};
const openFromMenu = (href) => {
  navigateOrOpenTab(router, href);
  land(href);
};
// The tab bar's goTo: activate, then route to the tab's own href.
const clickTab = (key) => {
  const tab = useWorkspaceStore.getState().tabs.find((t) => t.key === key);
  assert.ok(tab, `tab ${key} should exist`);
  useWorkspaceStore.getState().activateTab(key);
  router.replace(tab.href);
  land(tab.href);
};
const keys = () => useWorkspaceStore.getState().tabs.map((t) => t.key);
const active = () => useWorkspaceStore.getState().activeKey;
const tabOf = (key) => useWorkspaceStore.getState().tabs.find((t) => t.key === key);

beforeEach(() => {
  useWorkspaceStore.setState({ tabs: [], activeKey: null });
  urls.length = 0;
});

describe("record route detection", () => {
  it("matches record routes by pattern, never a static module or unrelated route", () => {
    assert.equal(findRecordRoute(STYLE_A), "/dashboard/plm/style-cards/[id]");
    assert.equal(findRecordRoute(`${STYLE_A}?tab=bom`), "/dashboard/plm/style-cards/[id]");
    assert.equal(findRecordRoute("/dashboard/crm/deals/dashboards/9/edit"), "/dashboard/crm/deals/dashboards/[id]/edit");
    assert.equal(findRecordRoute(STYLE_LIST), undefined);
    assert.equal(findRecordRoute("/dashboard/crm/deals/dashboards/create"), undefined);
    assert.equal(findRecordRoute(`${STYLE_A}/extra`), undefined);
    assert.equal(findRecordRoute("/dashboard/default"), undefined);
  });

  it("recognises create forms", () => {
    assert.equal(isNewRecordPath(`${STYLE_LIST}/new`), true);
    assert.equal(isNewRecordPath(STYLE_A), false);
    assert.equal(isNewRecordPath(STYLE_LIST), false);
  });

  it("the real generated registry lists record routes and still excludes them from mountable modules", () => {
    const generated = readFileSync(new URL("../lib/workspace/registry.generated.ts", import.meta.url), "utf8");
    const [modules, records] = generated.split("GENERATED_RECORD_ROUTES");
    assert.ok(records.includes('"/dashboard/plm/style-cards/[id]"'));
    assert.ok(records.includes('"/dashboard/plm/costing-sheets/[id]"'));
    assert.ok(!/path: "[^"]*\[/.test(modules), "no dynamic route may be registered as a mountable module");
    assert.ok(modules.includes('path: "/dashboard/plm/style-cards"'));
  });
});

describe("A. Style Card survives navigating to another screen", () => {
  it("list -> record -> other screen -> back to the same record", () => {
    openFromMenu(STYLE_LIST);
    land(STYLE_A); // list row <Link>
    openFromMenu(INVENTORY);
    assert.deepEqual(keys(), [STYLE_LIST, STYLE_A, INVENTORY]);
    assert.equal(active(), INVENTORY);

    clickTab(STYLE_A);
    assert.equal(active(), STYLE_A);
    assert.equal(urls.at(-1), STYLE_A, "returns straight to the record, not the list");
    assert.deepEqual(keys(), [STYLE_LIST, STYLE_A, INVENTORY]);
  });
});

describe("B. another record type behaves the same", () => {
  it("costing sheet record is retained across navigation", () => {
    land(COSTING);
    openFromMenu(STYLE_LIST);
    clickTab(COSTING);
    assert.equal(active(), COSTING);
    assert.equal(urls.at(-1), COSTING);
  });
});

describe("C. no duplicates", () => {
  it("reopening an open record activates its tab instead of adding one", () => {
    openFromMenu(STYLE_LIST);
    land(STYLE_A);
    clickTab(STYLE_LIST);
    land(STYLE_A);
    land(STYLE_A);
    assert.deepEqual(keys(), [STYLE_LIST, STYLE_A]);
    assert.equal(active(), STYLE_A);
  });
});

describe("D. multiple records keep their own identity and state", () => {
  it("A and B are separate tabs, each returning to itself with its own query state", () => {
    openFromMenu(STYLE_LIST);
    land(STYLE_A);
    land(`${STYLE_A}?tab=bom`); // in-record sub-state reflected in the URL
    clickTab(STYLE_LIST);
    land(STYLE_B);
    openFromMenu(INVENTORY);
    assert.deepEqual(keys(), [STYLE_LIST, STYLE_A, STYLE_B, INVENTORY]);

    clickTab(STYLE_A);
    assert.equal(urls.at(-1), `${STYLE_A}?tab=bom`);
    clickTab(STYLE_B);
    assert.equal(urls.at(-1), STYLE_B);
    assert.equal(active(), STYLE_B);
  });
});

describe("E. closing", () => {
  it("closing one tab removes only that tab", () => {
    openFromMenu(STYLE_LIST);
    land(STYLE_A);
    land(STYLE_B);
    openFromMenu(INVENTORY);
    useWorkspaceStore.getState().closeTab(STYLE_A);
    assert.deepEqual(keys(), [STYLE_LIST, STYLE_B, INVENTORY]);
    assert.equal(active(), INVENTORY);
  });

  it("closing the active record tab activates its neighbour", () => {
    openFromMenu(STYLE_LIST);
    land(STYLE_A);
    useWorkspaceStore.getState().closeTab(STYLE_A);
    assert.deepEqual(keys(), [STYLE_LIST]);
    assert.equal(active(), STYLE_LIST);
  });

  it("Close All removes every tab, records included", () => {
    openFromMenu(STYLE_LIST);
    land(STYLE_A);
    land(COSTING);
    openFromMenu(INVENTORY);
    useWorkspaceStore.getState().closeTabs(keys());
    assert.deepEqual(keys(), []);
    assert.equal(active(), null);
  });

  it("a closed record reopens as a fresh tab", () => {
    land(STYLE_A);
    useWorkspaceStore.getState().closeTab(STYLE_A);
    land(STYLE_A);
    assert.deepEqual(keys(), [STYLE_A]);
  });
});

describe("F. direct URL / reload", () => {
  it("landing on a record URL with no tabs open creates and activates its tab", () => {
    land(`${STYLE_A}?tab=cost`);
    assert.deepEqual(keys(), [STYLE_A]);
    assert.equal(active(), STYLE_A);
    assert.equal(tabOf(STYLE_A).href, `${STYLE_A}?tab=cost`);
  });

  it("non-record routes are left to the existing workspace logic", () => {
    land(STYLE_LIST);
    land("/dashboard/default");
    assert.deepEqual(keys(), []);
  });
});

describe("create form -> saved record", () => {
  it("the New tab becomes the created record's tab, in place", () => {
    openFromMenu(STYLE_LIST);
    land(`${STYLE_LIST}/new`);
    openFromMenu(INVENTORY);
    clickTab(`${STYLE_LIST}/new`);
    land(STYLE_A); // save -> router.replace(`/style-cards/${id}`)
    assert.deepEqual(keys(), [STYLE_LIST, STYLE_A, INVENTORY]);
    assert.equal(active(), STYLE_A);
  });

  it("opening a record while another screen is active never re-keys a background New tab", () => {
    land(`${STYLE_LIST}/new`);
    openFromMenu(STYLE_LIST);
    land(STYLE_A);
    assert.deepEqual(keys(), [`${STYLE_LIST}/new`, STYLE_LIST, STYLE_A]);
  });
});

describe("tab titles", () => {
  const entryByHref = new Map([[STYLE_LIST, { title: "Style Cards", href: STYLE_LIST }]]);
  it("record tabs borrow the owning list's name, plus the record label once reported", () => {
    assert.equal(resolveWorkspaceTabTitle({ key: STYLE_A, href: STYLE_A }, entryByHref).title, "Style Card");
    assert.equal(
      resolveWorkspaceTabTitle({ key: STYLE_A, href: STYLE_A, recordLabel: "gulraiz" }, entryByHref).title,
      "Style Card [gulraiz]"
    );
    assert.equal(
      resolveWorkspaceTabTitle({ key: `${STYLE_LIST}/new`, href: `${STYLE_LIST}/new` }, entryByHref).title,
      "New Style Card"
    );
    assert.equal(resolveWorkspaceTabTitle({ key: STYLE_LIST, href: STYLE_LIST }, entryByHref).title, "Style Cards");
  });
});
