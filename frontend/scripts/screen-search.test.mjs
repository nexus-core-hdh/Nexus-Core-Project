// Screen search (header "Search screens…" palette + sidebar Module Launcher) — both read the same
// index: lib/store/screen-index-store.ts, built from GET /menu-items (the MenuItem table) by
// lib/search/screen-index.ts. Uses the real flattenMenuTree, the real store and cmdk's own filter.
//   Run: npm run test:screen-search
import assert from "node:assert/strict";
import { register } from "node:module";
import { beforeEach, describe, it } from "node:test";

register("./workspace-test-loader.mjs", import.meta.url);

const { defaultFilter } = await import("cmdk");
const { flattenMenuTree, searchKeywordsFor } = await import("@/lib/search/screen-index");
const { useScreenIndexStore } = await import("@/lib/store/screen-index-store");

const PACKING_HREF = "/legacy-erp/packing-lists-list";
// Shape (and these rows) of the live GET /menu-items response's "Legacy ERP" group.
const legacyGroup = (withPackingList) => ({
  title: "Legacy ERP",
  items: [
    { title: "Work Order", href: "/legacy-erp/work-orders-list" },
    { title: "1 - Purchase Order", href: "/legacy-erp/purchase-orders-list" },
    { title: "Inventory Receipts", href: "#", items: [{ title: "2 - Purchase Receipt", href: "/legacy-erp/inventory-receipts-list?receiptType=2" }] },
    { title: "Order Manufacturing Entry", href: "/legacy-erp/order-manufacturing-entry" },
    ...(withPackingList ? [{ title: "Packing List", href: PACKING_HREF, icon: "Package" }] : []),
  ],
});

// Exactly what global-screen-search.tsx passes to cmdk: value = title, keywords = module + synonyms.
const matches = (entries, term) => entries.filter((e) => defaultFilter(e.title, term, [e.moduleTitle, ...(e.keywords ?? [])]) > 0);

describe("Packing List in the screen search index", () => {
  const entries = flattenMenuTree([legacyGroup(true)]);

  for (const term of ["packing", "packing list", "packaging", "Packing", "PACKAGING"]) {
    it(`"${term}" finds Packing List, opening the list screen`, () => {
      const hits = matches(entries, term);
      assert.deepEqual(hits.map((h) => [h.title, h.href, h.moduleTitle]), [["Packing List", PACKING_HREF, "Legacy ERP"]]);
    });
  }

  it("is listed once (no duplicate entry, route or module)", () => {
    assert.equal(entries.filter((e) => e.href === PACKING_HREF).length, 1);
    assert.equal(entries.filter((e) => e.title === "Packing List").length, 1);
  });

  it('"packaging" only matches through the synonym list (the title alone does not contain it)', () => {
    assert.equal(defaultFilter("Packing List", "packaging", []), 0);
    assert.deepEqual(searchKeywordsFor(PACKING_HREF), ["packing", "packing list", "packaging"]);
  });

  it("other screens keep matching by their own titles, and gain no synonyms", () => {
    assert.deepEqual(matches(entries, "work order").map((h) => h.title), ["Work Order"]);
    assert.deepEqual(matches(entries, "purchase receipt").map((h) => h.title), ["2 - Purchase Receipt"]);
    assert.deepEqual(entries.find((e) => e.title === "Work Order").keywords, []);
  });
});

describe("screen index freshness", () => {
  beforeEach(() => {
    useScreenIndexStore.setState({ entries: [], groups: [], loading: false, hasLoaded: false, rawEntries: [], rawGroups: [], rawLoading: false, rawLoaded: false });
    globalThis.__menuItemsCalls = 0;
  });

  for (const role of ["admin", "user"]) {
    it(`a screen added to the menu after the first load becomes searchable on refresh (${role})`, async () => {
      globalThis.__currentUser = { role, companyId: 1, branchId: null };
      globalThis.__menuItems = [legacyGroup(false)];
      const store = useScreenIndexStore.getState();
      await store.load();
      assert.equal(matches(useScreenIndexStore.getState().entries, "packing").length, 0);

      globalThis.__menuItems = [legacyGroup(true)]; // e.g. the Packing List menu row was added
      await store.load(); // ensureLoaded(): still the cached index
      assert.equal(matches(useScreenIndexStore.getState().entries, "packing").length, 0);

      useScreenIndexStore.getState().invalidate(); // refresh() = invalidate + load
      await useScreenIndexStore.getState().load();
      assert.equal(globalThis.__menuItemsCalls, 2, "the menu was actually re-fetched");
      assert.deepEqual(matches(useScreenIndexStore.getState().entries, "packing").map((h) => h.href), [PACKING_HREF]);
      assert.ok(useScreenIndexStore.getState().groups.find((g) => g.title === "Legacy ERP").items.some((i) => i.href === PACKING_HREF), "Module Launcher tree too");
    });
  }
});
