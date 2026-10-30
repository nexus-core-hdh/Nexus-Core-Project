// Order Manufacturing Entry — the Order matrix's Manage Columns in a REAL browser (headless Chrome/Edge,
// real mouse input; see browser-harness.mjs). Mounts the screen's own OrderMatrix with the shared
// useGridColumns hook and ManageColumnsModal (storageKey "omEntryGrid"); real sessionStorage, the
// settings API ("Save Permanently") in memory. Sent, A Quality, B Quality, Received, Return and
// Balance can each be hidden and shown again; every value stays exactly as the read model gives it.
//   Run: npm run test:om-matrix-browser
import assert from "node:assert/strict";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { bundle, findBrowser, openPage } from "./browser-harness.mjs";

const FRONTEND = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// W/O-000212-shaped read model: DARK DENIM as in the screen (process 08 Printing), plus a second color
// with B Quality and Return so every managed column carries a value.
const qty = (t) => ({ order: 0, willBeCut: 0, cutting: 0, sent: 0, received: 0, returned: 0, balance: 0, ...t });
const CTX = {
  materialColumns: [
    { key: "m1", lineType: "Fabric", label: "FLAT KNIT RIB 1X1 | 320 GSM", mainFabric: true },
    { key: "m2", lineType: "Trim", label: "sweeing thread 50/3", mainFabric: false },
  ],
  qualityColumns: [{ id: 1, code: "A", name: "A Quality" }, { id: 2, code: "B", name: "B Quality" }],
  rows: [
    { color: "DARK DENIM", cells: { m1: { code: "DARK DENIM", name: "DARK DENIM", hex: "#5B7F3A" } }, bySize: {}, byQuality: { 1: 259 },
      totals: qty({ order: 3000, willBeCut: 3154, sent: 809, received: 259, balance: 2741 }) },
    { color: "BLACK", cells: { m1: { code: "BLACK", name: "BLACK", hex: null } }, bySize: {}, byQuality: { 1: 600, 2: 100 },
      totals: qty({ order: 1200, willBeCut: 1260, cutting: 1250, sent: 1000, received: 700, returned: 50, balance: 450 }) },
  ],
};

const STUBS = {
  // useGridColumns' "Save Permanently" store (UserSettings.tablePreferences), in memory; writes recorded.
  "@/lib/api": `exports.settingsApi = {
    getCurrentSettings: async () => ({ tablePreferences: JSON.parse(JSON.stringify(window.__prefs || {})) }),
    updateCurrentSettings: async (v) => { (window.__prefWrites = window.__prefWrites || []).push(v); window.__prefs = Object.assign({}, window.__prefs, v.tablePreferences); return {}; },
  };`,
  next: "module.exports = {};",
};

const MANAGED = ["Sent", "A Quality", "B Quality", "Received", "Return", "Balance"];
const ALWAYS = ["FLAT KNIT RIB 1X1 | 320 GSM", "sweeing thread 50/3", "Order", "Will be Cut", "Cutting"];
// Expected cell text per row and column — the read model formatted like the screen (blank for 0).
const EXPECTED = {
  "DARK DENIM": { Order: "3,000.00", "Will be Cut": "3,154.00", Cutting: "", Sent: "809.00", "A Quality": "259.00", "B Quality": "", Received: "259.00", Return: "", Balance: "2,741.00" },
  BLACK: { Order: "1,200.00", "Will be Cut": "1,260.00", Cutting: "1,250.00", Sent: "1,000.00", "A Quality": "600.00", "B Quality": "100.00", Received: "700.00", Return: "50.00", Balance: "450.00" },
};

// The grid as rendered: header labels and, per row, header -> cell text.
const READ_GRID = `(() => {
  const table = document.querySelector('#matrix table');
  if (!table) return null;
  const headers = [...table.querySelectorAll('thead th')].slice(1).map((th) => th.textContent.trim());
  const rows = [...table.querySelectorAll('tbody tr')].map((tr) => {
    const cells = [...tr.querySelectorAll('td')].slice(1).map((td) => td.textContent.trim());
    return Object.fromEntries(headers.map((h, i) => [h, cells[i]]));
  });
  return { headers, rows };
})()`;

const browser = findBrowser();
let page;

describe("Order matrix: Manage Columns in a real browser", { skip: browser ? false : "no Chrome/Edge found — set CHROME_PATH" }, () => {
  before(async () => {
    const js = bundle(path.join(FRONTEND, "scripts", "fixtures", "om-order-matrix.harness.tsx"), { stubs: STUBS });
    page = await openPage(`<!doctype html><meta charset="utf-8"><body><div id="root"></div><script>window.__ctx = ${JSON.stringify(CTX)};</script><script>${js.replace(/<\/script/g, "<\\/script")}</script></body>`);
    await page.waitFor(`!!document.querySelector('#matrix table')`, { label: "the matrix rendered" });
  });
  after(async () => {
    if (page) {
      if (page.consoleErrors.length) console.log("page errors:", page.consoleErrors);
      await page.close();
    }
  });

  const grid = () => page.evaluate(READ_GRID);
  /** Every rendered value equals the read model; returns the visible headers. */
  const assertValues = async (expectedHeaders, label) => {
    const g = await grid();
    assert.deepEqual(g.headers, expectedHeaders, `${label}: columns`);
    for (const row of g.rows) {
      const color = row[ALWAYS[0]];
      for (const h of expectedHeaders.slice(2)) assert.equal(row[h], EXPECTED[color][h], `${label}: ${color} / ${h}`);
    }
  };
  const openModal = async () => {
    await page.click(`[...document.querySelectorAll('#matrix button')].find((b) => b.textContent.includes('Manage Columns'))`);
    await page.waitFor(`!!document.querySelector('[role=dialog]')`, { label: "Manage Columns opened" });
  };
  const modalButton = (text) => `[...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent.trim() === ${JSON.stringify(text)})`;
  const checkbox = (label) => `document.querySelector('[role=dialog] [aria-label=${JSON.stringify(`Show ${label} column`)}]')`;
  const setVisible = async (label, visible) => {
    const on = await page.evaluate(`${checkbox(label)}.getAttribute('aria-checked') === 'true'`);
    if (on !== visible) await page.click(checkbox(label));
    await page.waitFor(`${checkbox(label)}.getAttribute('aria-checked') === ${JSON.stringify(String(visible))}`, { label: `${label} ${visible ? "checked" : "unchecked"}` });
  };
  const saveAndClose = async (text) => {
    await page.click(modalButton(text));
    await page.waitFor(`!document.querySelector('[role=dialog]')`, { label: `${text} closed the modal` });
    await page.sleep(80);
  };

  it("by default every column shows, in the existing order, with the read model's values", async () => {
    await assertValues([...ALWAYS, ...MANAGED], "default");
  });

  it("Manage Columns lists exactly Sent, A Quality, B Quality, Received, Return and Balance, all shown", async () => {
    await openModal();
    const listed = await page.evaluate(`[...document.querySelectorAll('[role=dialog] [aria-label^="Show "]')].map((c) => [c.getAttribute('aria-label').replace(/^Show | column$/g, ''), c.getAttribute('aria-checked')])`);
    assert.deepEqual(listed, MANAGED.map((m) => [m, "true"]));
    await page.click(modalButton("Cancel"));
    await page.waitFor(`!document.querySelector('[role=dialog]')`);
  });

  for (const col of MANAGED) {
    it(`${col}: hiding removes only that column; showing it again puts it back in place — values unchanged`, async () => {
      await openModal();
      await setVisible(col, false);
      await saveAndClose("Save for This Session");
      await assertValues([...ALWAYS, ...MANAGED.filter((m) => m !== col)], `${col} hidden`);
      await openModal();
      await setVisible(col, true);
      await saveAndClose("Save for This Session");
      await assertValues([...ALWAYS, ...MANAGED], `${col} shown again`);
    });
  }

  it("Save for This Session survives reopening the screen in the same tab", async () => {
    await openModal();
    await setVisible("B Quality", false);
    await saveAndClose("Save for This Session");
    assert.deepEqual(JSON.parse(await page.evaluate(`sessionStorage.getItem('omEntryGrid-hidden-columns')`)), ["quality:2"]);
    await page.evaluate(`window.__remount()`);
    await page.sleep(200);
    await page.waitFor(`!!document.querySelector('#matrix table')`);
    await assertValues([...ALWAYS, ...MANAGED.filter((m) => m !== "B Quality")], "after reopening");
  });

  it("Save Permanently stores it in the user's preferences and restores it in a new session", async () => {
    await openModal();
    await setVisible("B Quality", true);
    await setVisible("A Quality", false);
    await setVisible("Return", false);
    await saveAndClose("Save Permanently");
    const prefs = await page.evaluate(`window.__prefs`);
    assert.deepEqual(prefs.omEntryGridHiddenColumns.sort(), ["quality:1", "returned"]);
    assert.deepEqual(prefs.omEntryGridColumnOrder, ["sent", "quality:1", "quality:2", "received", "returned", "balance"], "order unchanged");
    // A new browser session: nothing in sessionStorage, so the layout comes from the saved preferences.
    await page.evaluate(`sessionStorage.clear(); window.__remount()`);
    await page.sleep(300);
    await page.waitFor(`!!document.querySelector('#matrix table')`);
    await assertValues([...ALWAYS, "Sent", "B Quality", "Received", "Balance"], "restored from preferences");
  });

  it("Reset Default shows every column again in the original order", async () => {
    await openModal();
    await page.click(modalButton("Reset Default"));
    await saveAndClose("Save Permanently");
    await assertValues([...ALWAYS, ...MANAGED], "after Reset Default");
    assert.deepEqual(await page.evaluate(`window.__prefs.omEntryGridHiddenColumns`), []);
  });
});
