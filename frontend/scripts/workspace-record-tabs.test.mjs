// Headless tests for Workspace record tabs — dynamic `[id]` routes and `form?id=` records: the real
// workspace store, registry, route->tab syncs and tab-title resolver, driven the way the
// sidebar/search/list rows/related-record links (navigateOrOpenTab), URL changes (the layout's
// syncModuleRouteTab + useRecordTabSync), the tab bar and form screens (useWorkspaceRecordId) do.
//   Run: npm run test:workspace-tabs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { beforeEach, describe, it } from "node:test";

register("./workspace-test-loader.mjs", import.meta.url);

const { useWorkspaceStore } = await import("@/lib/store/workspace-store");
const { findRecordRoute, isNewRecordPath, resolveTabKey, tabKeyForHref } = await import("@/lib/workspace/registry");
const { navigateOrOpenTab, syncModuleRouteTab } = await import("@/lib/workspace/navigate");
const { syncRecordRouteTab } = await import("@/hooks/use-record-tab-sync");
const { adoptWorkspaceRecordId } = await import("@/hooks/use-workspace-record-id");
const { resolveWorkspaceTabTitle } = await import("@/lib/workspace/resolve-tab-title");

await new Promise((done) =>
  useWorkspaceStore.persist.hasHydrated() ? done() : useWorkspaceStore.persist.onFinishHydration(done)
);

const STYLE_LIST = "/plm/style-cards";
const STYLE_A = "/plm/style-cards/0b6c1c8e-aaaa-4c1e-9f51-000000000001";
const STYLE_B = "/plm/style-cards/0b6c1c8e-bbbb-4c1e-9f51-000000000002";
const COSTING = "/plm/costing-sheets/77";
const INVENTORY = "/legacy-erp/inventory-cards-list";

// What the browser URL does in response: navigateOrOpenTab/goTo call router.replace, then the
// layout's two route syncs (WorkspaceContentStack's + useRecordTabSync) see the new route.
const urls = [];
const router = { push: (href) => urls.push(href), replace: (href) => urls.push(href) };
// lib/workspace/navigate.ts (company-slug URLs) moves the address bar of a workspace route with
// history.replaceState instead of router.replace — a minimal browser so those URL changes land in
// `urls` too. No company slug here (no cookie, none in the path), so the URLs stay app paths.
globalThis.window = {
  location: { pathname: "/", search: "" },
  history: {
    replaceState: (_state, _title, href) => {
      urls.push(href);
      const [pathname, query = ""] = href.split("?");
      globalThis.window.location = { pathname, search: query ? `?${query}` : "" };
    },
  },
};
const land = (href) => {
  const [pathname, query = ""] = href.split("?");
  syncModuleRouteTab(pathname, query);
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
    assert.equal(findRecordRoute(STYLE_A), "/plm/style-cards/[id]");
    assert.equal(findRecordRoute(`${STYLE_A}?tab=bom`), "/plm/style-cards/[id]");
    assert.equal(findRecordRoute("/crm/deals/dashboards/9/edit"), "/crm/deals/dashboards/[id]/edit");
    assert.equal(findRecordRoute(STYLE_LIST), undefined);
    assert.equal(findRecordRoute("/crm/deals/dashboards/create"), undefined);
    assert.equal(findRecordRoute(`${STYLE_A}/extra`), undefined);
    assert.equal(findRecordRoute("/default"), undefined);
  });

  it("recognises create forms", () => {
    assert.equal(isNewRecordPath(`${STYLE_LIST}/new`), true);
    assert.equal(isNewRecordPath(STYLE_A), false);
    assert.equal(isNewRecordPath(STYLE_LIST), false);
  });

  it("the real generated registry lists record routes and still excludes them from mountable modules", () => {
    const generated = readFileSync(new URL("../lib/workspace/registry.generated.ts", import.meta.url), "utf8");
    const [modules, records] = generated.split("GENERATED_RECORD_ROUTES");
    assert.ok(records.includes('"/plm/style-cards/[id]"'));
    assert.ok(records.includes('"/plm/costing-sheets/[id]"'));
    assert.ok(!/path: "[^"]*\[/.test(modules), "no dynamic route may be registered as a mountable module");
    assert.ok(modules.includes('path: "/plm/style-cards"'));
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

  it("a list screen gets one tab; an untracked route gets none", () => {
    land(STYLE_LIST);
    land(STYLE_LIST);
    land("/default");
    assert.deepEqual(keys(), [STYLE_LIST]);
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

// ── Multi-record workspace: `form?id=` records (Legacy/Finance ERP list+form screens) ──────────────
const RECEIPTS = "/legacy-erp/inventory-receipts";
const RECEIPTS_LIST = `${RECEIPTS}-list`;
const POS = "/legacy-erp/purchase-orders";
const WOS = "/legacy-erp/work-orders";
const IR = (id, mode = "view", type = 1) => `${RECEIPTS}?receiptType=${type}&id=${id}&mode=${mode}`;
const IR_KEY = (id) => `${RECEIPTS}?id=${id}`;
const PO = (id) => `${POS}?id=${id}&mode=view`;
const WO = (id) => `${WOS}?id=${id}&mode=edit`;
const reactKeys = () => useWorkspaceStore.getState().tabs.map((t) => t.mount?.key ?? t.key);

describe("record identity in the tab key", () => {
  it("only the identity param is part of the key — mode/type/inner-tab state ride along on the href", () => {
    assert.equal(tabKeyForHref(IR(6)), IR_KEY(6));
    assert.equal(tabKeyForHref(IR(6, "edit", 4)), IR_KEY(6));
    assert.equal(tabKeyForHref(`${IR(6)}&tab=lines`), IR_KEY(6));
    assert.equal(tabKeyForHref(`${RECEIPTS}?mode=create&receiptType=1`), RECEIPTS);
    assert.equal(tabKeyForHref(RECEIPTS_LIST), RECEIPTS_LIST);
    assert.equal(tabKeyForHref(`${STYLE_A}?tab=bom`), STYLE_A);
    assert.equal(tabKeyForHref("/default"), undefined);
  });

  it("routes keyed by another param keep it (and only it)", () => {
    const entry = "/legacy-erp/cutting-card/entry";
    assert.equal(resolveTabKey(entry, `${entry}?id=5&color=red`), `${entry}?color=red`);
  });
});

describe("1. same entity, different records", () => {
  it("IR-6 -> IR-7 -> IR-8 from the list are three tabs", () => {
    openFromMenu(RECEIPTS_LIST);
    openFromMenu(IR(6));
    openFromMenu(IR(7));
    openFromMenu(IR(8));
    assert.deepEqual(keys(), [RECEIPTS_LIST, IR_KEY(6), IR_KEY(7), IR_KEY(8)]);
    assert.equal(active(), IR_KEY(8));
  });

  it("different receipt types of the same table are still separate records", () => {
    openFromMenu(IR(6, "view", 1));
    openFromMenu(IR(4, "view", 7)); // e.g. Purchase Return PRN-4
    assert.deepEqual(keys(), [IR_KEY(6), IR_KEY(4)]);
  });
});

describe("2. different Style Cards", () => {
  it("SC-1 -> SC-2 -> SC-3 are three tabs", () => {
    const sc = (n) => `${STYLE_LIST}/sc-${n}`;
    [1, 2, 3].forEach((n) => land(sc(n)));
    assert.deepEqual(keys(), [sc(1), sc(2), sc(3)]);
  });
});

describe("3. different entities", () => {
  it("Style Card, Receipt, Purchase Order and Work Order all stay open", () => {
    land(STYLE_A);
    openFromMenu(IR(6));
    openFromMenu(PO(101));
    openFromMenu(WO(212));
    assert.deepEqual(keys(), [STYLE_A, IR_KEY(6), `${POS}?id=101`, `${WOS}?id=212`]);
  });
});

describe("4. duplicates", () => {
  it("opening IR-6 again (even in another mode) activates its one tab", () => {
    openFromMenu(IR(6));
    openFromMenu(PO(101));
    openFromMenu(IR(6, "edit"));
    land(IR(6, "edit"));
    assert.deepEqual(keys(), [IR_KEY(6), `${POS}?id=101`]);
    assert.equal(active(), IR_KEY(6));
    assert.equal(tabOf(IR_KEY(6)).href, IR(6, "edit"));
  });
});

describe("5. mixed", () => {
  it("IR-6 -> IR-7 -> SC -> IR-8 -> PO-1 all remain available", () => {
    openFromMenu(IR(6));
    openFromMenu(IR(7));
    land(STYLE_A);
    openFromMenu(IR(8));
    openFromMenu(PO(1));
    assert.deepEqual(keys(), [IR_KEY(6), IR_KEY(7), STYLE_A, IR_KEY(8), `${POS}?id=1`]);
  });
});

describe("6. return to a record", () => {
  it("IR-6 -> IR-7 -> IR-8, click IR-6: lands straight on IR-6", () => {
    [6, 7, 8].forEach((n) => openFromMenu(IR(n)));
    clickTab(IR_KEY(6));
    assert.equal(active(), IR_KEY(6));
    assert.equal(urls.at(-1), IR(6));
    assert.deepEqual(keys(), [IR_KEY(6), IR_KEY(7), IR_KEY(8)]);
  });

  it("Back/Forward to an earlier record URL re-activates its tab, never re-points another", () => {
    [6, 7].forEach((n) => openFromMenu(IR(n)));
    land(IR(6)); // browser Back
    assert.equal(active(), IR_KEY(6));
    assert.equal(tabOf(IR_KEY(7)).href, IR(7));
    land(IR(7)); // Forward
    assert.equal(active(), IR_KEY(7));
    assert.deepEqual(keys(), [IR_KEY(6), IR_KEY(7)]);
  });
});

describe("7/8. close and Close All", () => {
  it("closing IR-7 leaves IR-6 and IR-8", () => {
    [6, 7, 8].forEach((n) => openFromMenu(IR(n)));
    useWorkspaceStore.getState().closeTab(IR_KEY(7));
    assert.deepEqual(keys(), [IR_KEY(6), IR_KEY(8)]);
  });

  it("Close All closes every record and screen tab", () => {
    openFromMenu(RECEIPTS_LIST);
    [6, 7].forEach((n) => openFromMenu(IR(n)));
    land(STYLE_A);
    openFromMenu(PO(1));
    useWorkspaceStore.getState().closeTabs(keys());
    assert.deepEqual(keys(), []);
    assert.equal(active(), null);
  });
});

describe("9. new record -> save", () => {
  it("a form that saves in place (useWorkspaceRecordId) turns its New tab into the record's tab without remounting", () => {
    openFromMenu(RECEIPTS_LIST);
    const createHref = `${RECEIPTS}?mode=create&receiptType=1`;
    openFromMenu(createHref);
    assert.deepEqual(keys(), [RECEIPTS_LIST, RECEIPTS]);
    adoptWorkspaceRecordId(RECEIPTS, null); // blank form: nothing to adopt
    adoptWorkspaceRecordId(RECEIPTS, 9); // first Save -> setReceiptId(9)
    assert.deepEqual(keys(), [RECEIPTS_LIST, IR_KEY(9)]);
    assert.equal(active(), IR_KEY(9));
    assert.equal(tabOf(IR_KEY(9)).href, `${RECEIPTS}?mode=edit&receiptType=1&id=9`);
    assert.deepEqual(tabOf(IR_KEY(9)).mount, { key: RECEIPTS, href: createHref }, "same screen instance — no remount");

    openFromMenu(IR(9)); // reopening the saved record from the list: no duplicate
    assert.deepEqual(keys(), [RECEIPTS_LIST, IR_KEY(9)]);
  });

  it("a second New form alongside a saved one gets its own screen instance", () => {
    const createHref = `${RECEIPTS}?mode=create&receiptType=1`;
    openFromMenu(createHref);
    adoptWorkspaceRecordId(RECEIPTS, 9);
    openFromMenu(createHref);
    assert.deepEqual(keys(), [IR_KEY(9), RECEIPTS]);
    assert.equal(new Set(reactKeys()).size, 2, "distinct React instance keys");
  });

  it("a form that saves by moving its URL (Work Orders) re-keys its New tab in place", () => {
    openFromMenu(`${WOS}?mode=create`);
    land(WO(12)); // save: router.replace(`?id=12&mode=edit`)
    assert.deepEqual(keys(), [`${WOS}?id=12`]);
    assert.equal(tabOf(`${WOS}?id=12`).mount.key, WOS);
    useWorkspaceStore.getState().updateTabHref(WOS, WO(12)); // its later syncTabHref via a stale key: harmless
    assert.deepEqual(keys(), [`${WOS}?id=12`]);
  });

  it("loading another record by code inside a record tab follows it, unless that record has its own tab", () => {
    openFromMenu(IR(6));
    adoptWorkspaceRecordId(IR_KEY(6), 11);
    assert.deepEqual(keys(), [IR_KEY(11)]);
    openFromMenu(IR(12));
    adoptWorkspaceRecordId(IR_KEY(12), 11);
    assert.deepEqual(keys(), [IR_KEY(11), IR_KEY(12)]);
  });
});

describe("10. global search / sidebar", () => {
  it("both open screens through navigateOrOpenTab, the call-in tested above", () => {
    for (const file of ["components/search/global-screen-search.tsx", "components/layout/sidebar/nav-main.tsx"]) {
      assert.match(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), /navigateOrOpenTab\(/, file);
    }
  });
});

describe("11. related records", () => {
  it("opening a receipt from inside a PO keeps the PO and adds the receipt", () => {
    openFromMenu(PO(101));
    navigateOrOpenTab(router, IR(6)); // purchase-orders/page.tsx's own receipt link
    land(IR(6));
    assert.deepEqual(keys(), [`${POS}?id=101`, IR_KEY(6)]);
    assert.equal(active(), IR_KEY(6));
  });

  it("a screen re-pointing its own tab (Work Order copy) re-keys it to the new record", () => {
    openFromMenu(WO(5));
    useWorkspaceStore.getState().updateTabHref(`${WOS}?id=5`, WO(6));
    land(WO(6));
    assert.deepEqual(keys(), [`${WOS}?id=6`]);
    assert.equal(active(), `${WOS}?id=6`);
    assert.equal(tabOf(`${WOS}?id=6`).mount, undefined, "re-pointing remounts, as before");
  });
});

describe("12. query state", () => {
  it("a record's inner-view params are kept on its href and restored on return", () => {
    openFromMenu(`${IR(6)}&tab=lines`);
    openFromMenu(IR(7));
    clickTab(IR_KEY(6));
    assert.equal(urls.at(-1), `${IR(6)}&tab=lines`);
  });
});

describe("13. reload / direct URL", () => {
  it("a record URL opened directly gets its tab", () => {
    land(IR(6, "edit"));
    assert.deepEqual(keys(), [IR_KEY(6)]);
    assert.equal(active(), IR_KEY(6));
  });

  it("reload restores record tabs; tabs saved by older builds (bare-path keys) are re-keyed and de-duplicated", async () => {
    globalThis.__workspaceSettings = {
      tablePreferences: {
        workspace: {
          tabs: [
            { key: RECEIPTS_LIST, href: RECEIPTS_LIST, dirty: false },
            { key: RECEIPTS, href: IR(6), dirty: false },
            { key: IR_KEY(6), href: IR(6), dirty: false },
            { key: STYLE_A, href: STYLE_A, dirty: false, recordLabel: "gulraiz" },
          ],
          activeKey: RECEIPTS,
        },
      },
    };
    await useWorkspaceStore.persist.rehydrate();
    delete globalThis.__workspaceSettings;
    assert.deepEqual(keys(), [RECEIPTS_LIST, IR_KEY(6), STYLE_A]);
    assert.equal(active(), IR_KEY(6));
  });

  it("instance bookkeeping is never persisted", () => {
    openFromMenu(`${RECEIPTS}?mode=create`);
    adoptWorkspaceRecordId(RECEIPTS, 9);
    const persisted = useWorkspaceStore.persist.getOptions().partialize(useWorkspaceStore.getState());
    assert.equal(persisted.tabs[0].mount, undefined);
    assert.equal(persisted.tabs[0].key, IR_KEY(9));
  });
});

describe("14. generated registry", () => {
  it("record forms and their lists are both mountable screens; list routes stay one-tab screens", () => {
    const generated = readFileSync(new URL("../lib/workspace/registry.generated.ts", import.meta.url), "utf8");
    for (const path of [RECEIPTS, RECEIPTS_LIST, POS, `${POS}-list`, WOS, `${WOS}-list`]) {
      assert.ok(generated.includes(`path: "${path}"`), path);
    }
    assert.equal(tabKeyForHref(RECEIPTS_LIST), RECEIPTS_LIST);
  });
});

describe("record tab titles", () => {
  const entryByHref = new Map([[RECEIPTS_LIST, { title: "Inventory Receipts", href: RECEIPTS_LIST }]]);
  it("compose the owning screen's name with the record label; an explicit title still wins", () => {
    assert.equal(resolveWorkspaceTabTitle({ key: IR_KEY(6), href: IR(6) }, entryByHref).title, "Inventory Receipt");
    assert.equal(
      resolveWorkspaceTabTitle({ key: IR_KEY(6), href: IR(6), recordLabel: "IR-6" }, entryByHref).title,
      "Inventory Receipt [IR-6]"
    );
    assert.equal(
      resolveWorkspaceTabTitle({ key: IR_KEY(6), href: IR(6), title: "Purchase Receipt [IR-6]" }, entryByHref).title,
      "Purchase Receipt [IR-6]"
    );
    assert.equal(resolveWorkspaceTabTitle({ key: RECEIPTS_LIST, href: RECEIPTS_LIST }, entryByHref).title, "Inventory Receipts");
  });
});

// ── Complete record titles ─────────────────────────────────────────────────────────────────────
describe("complete record titles", () => {
  const receiptTitle = (type, kind, no) => `Inventory Receipt [${type}-Purchase Receipt] - [${kind}] - ${no}`;
  const entryByHref = new Map([[RECEIPTS_LIST, { title: "Inventory Receipts", href: RECEIPTS_LIST }]]);
  const shown = (key) => resolveWorkspaceTabTitle(tabOf(key), entryByHref).title;

  it("A/B. each receipt keeps its own complete title, byte for byte, as its own tab", () => {
    const records = [
      [595, receiptTitle(1, "Trim", "00000595")],
      [596, receiptTitle(1, "Trim", "00000596")],
      [597, receiptTitle(2, "Fabric", "00000597")],
    ];
    for (const [id, title] of records) {
      openFromMenu(IR(id));
      useWorkspaceStore.getState().setTabTitle(IR_KEY(id), title); // what useWorkspaceTabTitle does
    }
    assert.deepEqual(keys(), records.map(([id]) => IR_KEY(id)));
    for (const [id, title] of records) assert.equal(shown(IR_KEY(id)), title);
  });

  it("C/D. resolved record titles for other entities come through unshortened", () => {
    const longName = "gulraiz — winter capsule collection, kids outerwear, quilted parka with detachable hood";
    land(STYLE_A);
    useWorkspaceStore.getState().setTabRecordLabel(STYLE_A, longName);
    const styleEntries = new Map([[STYLE_LIST, { title: "Style Cards", href: STYLE_LIST }]]);
    assert.equal(resolveWorkspaceTabTitle(tabOf(STYLE_A), styleEntries).title, `Style Card [${longName}]`);
    openFromMenu(WO(212));
    useWorkspaceStore.getState().setTabTitle(`${WOS}?id=212`, "Work Order [WO-000212] - Kids Parka AW26 - 12,500 pcs");
    assert.equal(shown(`${WOS}?id=212`), "Work Order [WO-000212] - Kids Parka AW26 - 12,500 pcs");
  });

  it("F. a title never changes tab identity — reopening the record keeps one tab and its title", () => {
    openFromMenu(IR(595));
    useWorkspaceStore.getState().setTabTitle(IR_KEY(595), receiptTitle(1, "Trim", "00000595"));
    openFromMenu(IR(595, "edit"));
    assert.deepEqual(keys(), [IR_KEY(595)]);
    assert.equal(shown(IR_KEY(595)), receiptTitle(1, "Trim", "00000595"));
  });

  it("G. complete titles are persisted and restored on reload", async () => {
    openFromMenu(IR(595));
    useWorkspaceStore.getState().setTabTitle(IR_KEY(595), receiptTitle(1, "Trim", "00000595"));
    const persisted = useWorkspaceStore.persist.getOptions().partialize(useWorkspaceStore.getState());
    useWorkspaceStore.setState({ tabs: [], activeKey: null });
    globalThis.__workspaceSettings = { tablePreferences: { workspace: { tabs: persisted.tabs, activeKey: persisted.activeKey } } };
    await useWorkspaceStore.persist.rehydrate();
    delete globalThis.__workspaceSettings;
    assert.equal(shown(IR_KEY(595)), receiptTitle(1, "Trim", "00000595"));
  });

  it("E. the tab bar no longer caps tabs at 220px, and every tab exposes its complete title", () => {
    const bar = readFileSync(new URL("../components/layout/workspace/workspace-tab-bar.tsx", import.meta.url), "utf8");
    assert.ok(!bar.includes("max-w-[220px]"), "old 220px cap removed");
    assert.match(bar, /max-w-\[min\(40rem,70vw\)\] shrink-0/, "content-sized, capped, non-shrinking tabs (the strip scrolls)");
    assert.match(bar, /aria-label=\{title\}/, "accessible name is the complete title");
    assert.match(bar, /<span title=\{title\} className="min-w-0 flex-1 truncate">\{title\}<\/span>/, "tooltip carries the complete title");
  });
});

// ── Record names on screens' tabs (useWorkspaceRecordLabel / useWorkspaceTabTitle) ─────────────────
// Menu titles below are the REAL ones the resolver sees: MenuItem rows (read from the DB, read-only)
// and lib/finance-erp/nav.ts's static Finance entries.
describe("record names in tab titles", () => {
  const D = ""; // menu hrefs are slug-free app paths (company-slug URLs)
  const MENU = new Map(
    [
      [`${D}/finance-erp/payable/purchase-orders-list`, "Purchase Order"],
      [`${D}/finance-erp/payable/purchase-invoices-list`, "Purchase Invoice / GRN Matching"],
      [`${D}/finance-erp/payable/vendor-bills-list`, "Vendor Bills"],
      [`${D}/finance-erp/receivable/sales-orders-list`, "Sales Order"],
      [`${D}/finance-erp/inventory/receipt-list`, "Receipt"],
      [`${D}/finance-erp/inventory/issuance-list`, "Issuance"],
      [`${D}/legacy-erp/work-orders-list`, "Work Order"],
      [`${D}/legacy-erp/purchase-orders-list`, "1 - Purchase Order"],
      [`${D}/legacy-erp/current-accounts-list`, "Current Account"],
      [`${D}/plm/costing-sheets`, "Costing Sheets"],
      [`${D}/plm/style-cards`, "Style Cards"],
      [`${D}/plm/sample-cards-list`, "Sample Cards"],
      [`${D}/dockets/order-dockets`, "Order Dockets"],
    ].map(([href, title]) => [href, { title, href }])
  );
  const titleOf = (key, extra = {}) => resolveWorkspaceTabTitle({ key, href: key, ...extra }, MENU).title;
  const recordTab = (path, id, label) => titleOf(`${D}${path}?id=${id}`, { recordLabel: label });

  it("1-6. Finance documents show '{Screen} [number]' from their own menu entry", () => {
    assert.equal(recordTab("/finance-erp/payable/purchase-orders", "a1", "PO-001"), "Purchase Order [PO-001]");
    assert.equal(recordTab("/finance-erp/payable/purchase-invoices", "a2", "INV-001"), "Purchase Invoice / GRN Matching [INV-001]");
    assert.equal(recordTab("/finance-erp/payable/vendor-bills", "a3", "VB-001"), "Vendor Bill [VB-001]");
    assert.equal(recordTab("/finance-erp/receivable/sales-orders", "a4", "SO-001"), "Sales Order [SO-001]");
    assert.equal(recordTab("/finance-erp/inventory/receipt", "a5", "IR-001"), "Receipt [IR-001]");
    assert.equal(recordTab("/finance-erp/inventory/issuance", "a6", "IS-001"), "Issuance [IS-001]");
  });

  it("7-9. Work Order, Cutting Card (no menu entry) and Costing Sheet", () => {
    assert.equal(recordTab("/legacy-erp/work-orders", 212, "WO-000212"), "Work Order [WO-000212]");
    // Cutting Card has no menu entry at all — the resolver's humanized fallback now keeps the label.
    assert.equal(recordTab("/legacy-erp/cutting-card", 212, "WO-000212"), "Cutting Card [WO-000212]");
    assert.equal(titleOf(`${D}/plm/costing-sheets/abc`, { recordLabel: "CS-001" }), "Costing Sheet [CS-001]");
    assert.equal(titleOf(`${D}/dockets/order-dockets/7`, { recordLabel: "AW26 Kids" }), "Order Docket [AW26 Kids]");
  });

  it("10-11. Style Card and Sample Card keep their name-based labels", () => {
    assert.equal(titleOf(`${D}/plm/style-cards/x`, { recordLabel: "gulraiz" }), "Style Card [gulraiz]");
    assert.equal(titleOf(`${D}/plm/sample-cards?id=4`, { recordLabel: "Summer Tee" }), "Sample Card [Summer Tee]");
  });

  it("master data: Code — Name", () => {
    assert.equal(recordTab("/legacy-erp/current-accounts", 53, "S-0053 — Local Market"), "Current Account [S-0053 — Local Market]");
  });

  it("12. long names stay complete (494e69d)", () => {
    const long = "Inventory Receipt [1-Purchase Receipt] [Unapproved] - [Trim] - 00000595";
    assert.equal(titleOf(`${D}/legacy-erp/inventory-receipts?id=595`, { title: long }), long);
  });

  it("13-14. PO-001 and PO-002 are two distinguishable tabs; reopening PO-001 keeps one", () => {
    const PO_F = `${D}/finance-erp/payable/purchase-orders`;
    openFromMenu(`${PO_F}?id=a1`);
    useWorkspaceStore.getState().setTabRecordLabel(`${PO_F}?id=a1`, "PO-001");
    openFromMenu(`${PO_F}?id=a2`);
    useWorkspaceStore.getState().setTabRecordLabel(`${PO_F}?id=a2`, "PO-002");
    openFromMenu(`${PO_F}?id=a1`);
    assert.deepEqual(keys(), [`${PO_F}?id=a1`, `${PO_F}?id=a2`]);
    assert.deepEqual(
      useWorkspaceStore.getState().tabs.map((t) => resolveWorkspaceTabTitle(t, MENU).title),
      ["Purchase Order [PO-001]", "Purchase Order [PO-002]"]
    );
  });

  it("15. New -> Save turns the New tab into the record's titled tab, no duplicate", () => {
    const PO_L = `${D}/legacy-erp/purchase-orders`;
    openFromMenu(`${PO_L}?mode=create`);
    assert.equal(resolveWorkspaceTabTitle(tabOf(PO_L), MENU).title, "New 1 - Purchase Order");
    adoptWorkspaceRecordId(PO_L, 1); // save: setPoId(1)
    useWorkspaceStore.getState().setTabRecordLabel(`${PO_L}?id=1`, "PO-001"); // label hook re-applies on the new key
    assert.deepEqual(keys(), [`${PO_L}?id=1`]);
    assert.equal(resolveWorkspaceTabTitle(tabOf(`${PO_L}?id=1`), MENU).title, "1 - Purchase Order [PO-001]");
  });

  it("16. without a loaded identifier the generic title shows — never 'undefined'/'null'", () => {
    const t = titleOf(`${D}/finance-erp/payable/purchase-orders?id=a9`, { recordLabel: undefined });
    assert.equal(t, "Purchase Order");
    assert.equal(titleOf(`${D}/legacy-erp/cutting-card?id=1`), "Cutting Card");
  });
});

describe("record-name hooks are wired safely in every screen", () => {
  const SCREENS = [
    "finance-erp/payable/purchase-orders", "finance-erp/payable/purchase-invoices", "finance-erp/payable/vendor-bills",
    "finance-erp/payable/vendor-payments", "finance-erp/payable/debit-notes", "finance-erp/receivable/sales-orders",
    "finance-erp/receivable/sales-invoices", "finance-erp/receivable/sales-tax-invoice", "finance-erp/receivable/credit-notes",
    "finance-erp/receivable/customer-receipts", "finance-erp/inventory/receipt", "finance-erp/inventory/issuance",
    "finance-erp/inventory/demand", "finance-erp/general-ledger/journal-entries", "finance-erp/fixed-assets/register",
    "legacy-erp/sizes", "legacy-erp/unit-sets", "legacy-erp/cutting-card", "legacy-erp/cutting-card/entry",
    "legacy-erp/order-manufacturing-entry", "legacy-erp/order-manufacturing-entry/entry", "legacy-erp/item-statement",
    "legacy-erp/current-accounts", "legacy-erp/fabric-cards", "legacy-erp/yarn-cards", "legacy-erp/trim-inventory-cards",
    "plm/costing-sheets/[id]", "plm/orders/[id]", "plm/product-cards/[id]", "plm/mood-boards/[id]",
    "dockets/order-dockets/[id]", "dockets/product-dockets/[id]", "dockets/sample-dockets/[id]", "dockets/style-dockets/[id]",
    "dockets/setup/docket-templates/[id]", "pages/orders/[id]", "pages/custom-entities/[slug]", "crm/settings/pdf-reports/[id]",
    "crm/deals/dashboards/[id]/edit", "crm/settings/auto-numbering/[entity]", "collaboration/documents/editor/[id]",
    "collaboration/documents/board/[id]", "collaboration/documents/presentation/[id]", "collaboration/documents/spreadsheet/[id]",
  ];
  const HOOK = /^  useWorkspace(RecordLabel|TabTitle)\((.*)\);\r?$/;

  it(`each of the ${SCREENS.length} screens calls one title hook unconditionally, before any early return, defaulting to undefined`, () => {
    for (const screen of SCREENS) {
      const src = readFileSync(new URL(`../app/[company]/(auth)/${screen}/page.tsx`, import.meta.url), "utf8").split(/\r?\n/);
      const start = src.findIndex((l) => /^export default (async )?function/.test(l));
      const hooks = src.map((l, i) => (HOOK.test(l) ? i : -1)).filter((i) => i >= 0);
      assert.equal(hooks.length, 1, `${screen}: exactly one top-level title hook`);
      const firstReturn = src.findIndex((l, i) => i > start && /^  (if \(.*\)\s*(return\b|\{$)|return \()/.test(l));
      assert.ok(hooks[0] > start && hooks[0] < firstReturn, `${screen}: hook (line ${hooks[0] + 1}) must precede the first return (line ${firstReturn + 1})`);
      const expr = HOOK.exec(src[hooks[0]])[2];
      assert.match(expr, /undefined\s*\)?$|undefined$/, `${screen}: falls back to undefined, never renders a missing value`);
    }
  });
});

// ── Packing List workspace records ──────────────────────────────────────────────────────────────
describe("Packing List workspace tabs", () => {
  const PL = "/legacy-erp/packing-lists";
  const PL_LIST = `${PL}-list`;
  const PL_KEY = (id) => `${PL}?id=${id}`;
  const entryByHref = new Map([[PL_LIST, { title: "Packing List", href: PL_LIST }]]);

  it("Packing Lists A, B and C are independent tabs; reopening A activates its tab", () => {
    openFromMenu(PL_LIST);
    for (const id of [11, 12, 13]) openFromMenu(`${PL}?id=${id}&mode=view`);
    openFromMenu(`${PL}?id=11&mode=edit`);
    assert.deepEqual(keys(), [PL_LIST, PL_KEY(11), PL_KEY(12), PL_KEY(13)]);
    assert.equal(active(), PL_KEY(11));
    clickTab(PL_KEY(12));
    assert.equal(urls.at(-1), `${PL}?id=12&mode=view`);
  });

  it("a new Packing List becomes its saved record's tab, titled by its number", () => {
    openFromMenu(`${PL}?mode=create`);
    adoptWorkspaceRecordId(PL, 21); // first save -> setId(21)
    useWorkspaceStore.getState().setTabRecordLabel(PL_KEY(21), "PL-00021");
    assert.deepEqual(keys(), [PL_KEY(21)]);
    assert.equal(resolveWorkspaceTabTitle(tabOf(PL_KEY(21)), entryByHref).title, "Packing List [PL-00021]");
  });
});
