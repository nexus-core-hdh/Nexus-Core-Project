// Packing List — several box rows in one Packing List, in a REAL browser (headless Chrome/Edge, real
// mouse and keyboard input; see browser-harness.mjs). Mounts the screen's own page.tsx against an
// in-memory Packing List API (STUBS below): Add Box (also from View mode), entering From/To, Color,
// weights and size quantities on each row, the Total row and the Summary following every add / edit /
// remove, the overlap warning blocking Save, saving every row and getting them back on reopening,
// an approved list staying locked, and Manage Columns still hiding / showing size columns.
//   Run: npm run test:packing-list-browser
import assert from "node:assert/strict";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { bundle, findBrowser, openPage } from "./browser-harness.mjs";

const FRONTEND = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// W/O-000213-shaped Order (the screenshot): six sizes; two colors so each row picks its own.
const SIZES = ["8Y", "10Y", "XXS", "XS", "S", "M"];
const DB = {
  ctx: {
    workOrder: { id: 246, workOrderNo: "W/O-000213", customerOrderNo: null, currentAccountId: null, factoryId: null, styleCardId: null },
    orderLine: { id: 900, itemOrderNo: 1, customerOrderNo: null },
    sizes: SIZES, colors: ["MIXED GRAY R-5", "NAVY"], extraCuttingPercent: 5,
  },
  order: { "8Y": 0, "10Y": 167, XXS: 454, XS: 686, S: 454, M: 40 },
  willBeCut: { "8Y": 0, "10Y": 176, XXS: 477, XS: 721, S: 477, M: 42 },
  cut: {},
  headers: {
    1: { packagingNo: "PL-00001", workOrderId: 246, workOrderNo: "W/O-000213", isApproved: false, styleWeight: "12", packagingWeight: "43" },
    2: { packagingNo: "PL-00002", workOrderId: 246, workOrderNo: "W/O-000213", isApproved: true, approvedAt: "2026-10-07", styleWeight: "12", packagingWeight: "43" },
  },
  // Each list starts with the one box of the screenshot: 1–1, MIXED GRAY R-5, 21 / 44 / 55 / 6.
  lines: Object.fromEntries([1, 2].map((id) => [id, [{
    id: id * 100, startBox: 1, endBox: 1, color: "MIXED GRAY R-5", styleWeight: "12", packageWeight: "43",
    quantities: { "8Y": 21, "10Y": 44, XXS: 55, XS: 6, S: 0, M: 0 }, otherQuantities: {},
  }]])),
  nextLineId: 1000,
};

const STUBS = {
  // The Packing List API in memory — getLines / saveLines / summary behave like the backend's
  // (rows sorted by From (Box), new rows get ids, overlapping ranges refused, summary from the
  // same calc module). Every saveLines payload is recorded in window.__calls.
  "@/lib/nexuscore-api": `
    const calc = require("@/lib/legacy-erp/packing-list-calc");
    const db = () => window.__db;
    const out = (v) => new Promise((r) => setTimeout(() => r(JSON.parse(JSON.stringify(v))), 5));
    const calls = () => (window.__calls = window.__calls || []);
    exports.legacyErpApi = {
      packingLists: {
        get: (id) => out({ ...db().headers[id], id }),
        previewNextCode: () => out({ code: "PL-00003" }),
        workOrderContext: () => out(db().ctx),
        update: (id, d) => { calls().push(["update", id]); Object.assign(db().headers[id], d); return out(db().headers[id]); },
        getLines: (id) => out({ sizes: db().ctx.sizes, lines: db().lines[id] || [] }),
        saveLines: (id, lines) => {
          calls().push(["saveLines", id, JSON.parse(JSON.stringify(lines))]);
          if (calc.overlappingBoxRanges(lines).length) return Promise.reject(new Error("overlap (server)"));
          db().lines[id] = lines.map((l) => ({ ...l, id: l.id ?? db().nextLineId++, otherQuantities: {} })).sort((a, b) => a.startBox - b.startBox);
          return out({ sizes: db().ctx.sizes, lines: db().lines[id] });
        },
        summary: (id) => {
          const sizes = db().ctx.sizes;
          const t = calc.packingTotals((db().lines[id] || []).map((l) => ({ ...l, sizes: l.quantities })), sizes);
          const shipped = calc.isShippedPackingList(db().headers[id]) ? t.bySize : {};
          return out({ ...calc.sizeSummary(sizes, { order: db().order, willBeCut: db().willBeCut, cut: db().cut, packed: t.bySize, shipped }), weights: t });
        },
        approve: (id) => { db().headers[id].isApproved = true; return out({}); },
        unapprove: (id) => { db().headers[id].isApproved = false; return out({}); },
      },
      accounts: { get: async () => ({}), list: async () => [] },
      receipts: () => ({ list: async () => ({ data: [], total: 0 }) }),
    };
    exports.plmApi = { styleCards: { get: async () => ({ styleNumber: "SC-2026-8609", title: "gulraiz", attachments: [] }) } };
    exports.fetchAllPages = async () => [];
  `,
  "@/lib/api": `exports.settingsApi = {
    getCurrentSettings: async () => ({ tablePreferences: JSON.parse(JSON.stringify(window.__prefs || {})) }),
    updateCurrentSettings: async (v) => { window.__prefs = Object.assign({}, window.__prefs, v.tablePreferences); return {}; },
  };`,
  "@/lib/app-navigation": `exports.useRouter = () => ({ push: (u) => { window.__pushed = u; }, replace() {}, back() {} }); exports.usePathname = () => "/legacy-erp/packing-lists";`,
  "@/hooks/use-workspace-search-params": `exports.useWorkspaceSearchParams = () => { const p = window.__params || {}; return { get: (k) => (p[k] ?? null) }; };`,
  "@/hooks/use-workspace-dirty": `exports.useWorkspaceDirty = () => {};`,
  "@/hooks/use-workspace-tab-title": `exports.useWorkspaceRecordLabel = () => {}; exports.useWorkspaceTabTitle = () => {};`,
  "@/hooks/use-workspace-record-id": `exports.useWorkspaceRecordId = () => {};`,
  "@/hooks/use-decimal-parameters": `const api = { round: (v) => Number(v), format: (v) => String(v), ensureLoaded: () => {}, refresh: () => {}, loaded: true, loading: false };
    exports.useDecimalParameters = () => api;`,
  "@/components/legacy-erp/master-autocomplete-field": `exports.MasterAutocompleteField = () => null;`,
  "@/components/legacy-erp/work-orders-lookup": `exports.WorkOrdersLookupDialog = () => null;`,
  "@/components/legacy-erp/entity-list-lookup-dialog": `exports.EntityListLookupDialog = () => null;`,
  sonner: `const t = (kind) => (m) => (window.__toasts = window.__toasts || []).push([kind, String(m)]);
    exports.toast = { success: t("success"), error: t("error"), info: t("info"), warning: t("warning") }; exports.Toaster = () => null;`,
};

// The detail grid as rendered: headers, each box row (header -> input value / text), the Total row.
const READ_GRID = `(() => {
  const table = [...document.querySelectorAll('#screen table')].find((t) => t.querySelector('thead th') && t.querySelector('tfoot, tbody input'));
  if (!table) return null;
  const headers = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim()).filter(Boolean);
  const read = (td) => { const i = td.querySelector('input'); if (i) return i.value; const c = td.querySelector('[role=combobox]'); return (c ? c.textContent : td.textContent).trim(); };
  const rows = [...table.querySelectorAll('tbody tr')].filter((tr) => tr.querySelector('input'))
    .map((tr) => Object.fromEntries(headers.map((h, i) => [h, read(tr.children[i])])));
  const f = table.querySelector('tfoot tr');
  const total = f ? Object.fromEntries(headers.map((h, i) => [h, f.children[i].textContent.trim()])) : null;
  return { headers, rows, total };
})()`;
const READ_SUMMARY = (label) => `(() => {
  const t = [...document.querySelectorAll('#screen table')].find((x) => x.textContent.includes('Grand Total'));
  const heads = [...t.querySelectorAll('thead th')].map((th) => th.textContent.trim());
  const tr = [...t.querySelectorAll('tbody tr')].find((r) => r.children[0].textContent.trim() === ${JSON.stringify(label)});
  return Object.fromEntries(heads.map((h, i) => [h || 'label', tr.children[i].textContent.trim()]).slice(1));
})()`;

const browser = findBrowser();
let page;

describe("Packing List: several box rows in a real browser", { skip: browser ? false : "no Chrome/Edge found — set CHROME_PATH" }, () => {
  before(async () => {
    const js = bundle(path.join(FRONTEND, "scripts", "fixtures", "packing-list.harness.tsx"), { stubs: STUBS });
    page = await openPage(`<!doctype html><meta charset="utf-8"><body><div id="root"></div><script>window.__db = ${JSON.stringify(DB)}; window.__params = { id: "2" };</script><script>${js.replace(/<\/script/g, "<\\/script")}</script></body>`);
    await waitGrid(1);
  });
  after(async () => {
    if (page) {
      if (page.consoleErrors.length) console.log("page errors:", page.consoleErrors);
      await page.close();
    }
  });

  const grid = () => page.evaluate(READ_GRID);
  async function waitGrid(rows) {
    await page.waitFor(`(() => { const g = ${READ_GRID}; return g && g.rows.length === ${rows}; })()`, { label: `${rows} box row(s) rendered` });
  }
  const button = (text) => `[...document.querySelectorAll('#screen button')].find((b) => b.textContent.trim() === ${JSON.stringify(text)})`;
  const isDisabled = (text) => page.evaluate(`${button(text)}?.disabled ?? null`);
  /** The input of box row `row` (0-based) under column `header`. */
  const input = (row, header) => `(() => { const t = [...document.querySelectorAll('#screen table')].find((x) => x.querySelector('tbody input'));
    const i = [...t.querySelectorAll('thead th')].map((th) => th.textContent.trim()).indexOf(${JSON.stringify(header)});
    return [...t.querySelectorAll('tbody tr')].filter((tr) => tr.querySelector('input'))[${row}].children[i].querySelector('input, [role=combobox], button'); })()`;
  /** Types `value` into a cell like a user: click it, select what is there, type, Tab out. */
  const fill = async (row, header, value) => {
    await page.click(input(row, header));
    await page.evaluate(`${input(row, header)}.select()`);
    if (value === "") await page.press("Backspace"); else await page.type(String(value));
    await page.press("Tab");
    await page.sleep(30);
  };
  const pickColor = async (row, color) => {
    await page.click(input(row, "Color"));
    await page.waitFor(`[...document.querySelectorAll('[role=option]')].some((o) => o.textContent.trim() === ${JSON.stringify(color)})`, { label: "color options open" });
    await page.click(`[...document.querySelectorAll('[role=option]')].find((o) => o.textContent.trim() === ${JSON.stringify(color)})`);
    await page.waitFor(`!document.querySelector('[role=option]')`, { label: "color list closed" });
  };
  const reopen = async (id, rows, mode) => {
    await page.evaluate(`window.__open(${id}, ${JSON.stringify(mode ?? null)})`);
    await page.sleep(100);
    await waitGrid(rows);
    await page.waitFor(`!document.body.textContent.includes('— loading…')`, { label: "summary loaded" });
  };
  const saveLinesCalls = () => page.evaluate(`(window.__calls || []).filter((c) => c[0] === 'saveLines')`);

  it("an approved Packing List (PL-00002, the screenshot) keeps its boxes locked and says how to add more", async () => {
    const g = await grid();
    assert.deepEqual(g.rows.map((r) => [r["From (Box)"], r["To (Box)"], r.Color, r["8Y"], r["10Y"], r.XXS, r.XS]), [["1", "1", "MIXED GRAY R-5", "21", "44", "55", "6"]]);
    assert.equal(await isDisabled("Add Box"), true, "Add Box shown but disabled");
    assert.ok(await page.evaluate(`document.body.textContent.includes('This Packing List is approved, so its boxes are locked')`));
    assert.equal(await page.evaluate(`!!document.querySelector('[data-testid=add-box-inline]')`), false);
  });

  it("from View mode, Add Box switches to Edit and adds the next box with its own Color, weights and size quantities", async () => {
    await reopen(1, 1);
    assert.equal(await isDisabled("Save"), null, "View mode: no Save button yet");
    assert.equal(await isDisabled("Add Box"), false);
    await page.click(button("Add Box"));
    await waitGrid(2);
    assert.equal(await isDisabled("Save"), false, "now in Edit mode, with unsaved changes");
    let g = await grid();
    assert.deepEqual([g.rows[1]["From (Box)"], g.rows[1]["To (Box)"], g.rows[1]["Style Weight"], g.rows[1]["Package Weight"]], ["2", "2", "12", "43"], "next box number; header weights");
    assert.equal(g.rows[1]["Order Line"], "1");

    await pickColor(1, "NAVY");
    await fill(1, "Style Weight", "10");
    await fill(1, "8Y", "5");
    await fill(1, "M", "3");
    g = await grid();
    assert.deepEqual([g.rows[1].Color, g.rows[1]["Style Weight"], g.rows[1]["8Y"], g.rows[1].M, g.rows[1]["In Box Qty"], g.rows[1].Total], ["NAVY", "10", "5", "3", "8", "8"]);
    assert.deepEqual([g.total["8Y"], g.total.M, g.total["To (Box)"], g.total.Total], ["26", "3", "2 boxes", "134"], "Total row over both boxes");
    assert.equal(g.rows[0].Color, "MIXED GRAY R-5", "the first box keeps its color");
  });

  it("the inline Add box adds a third range; a 3-box range multiplies into the Total row and the Summary right away", async () => {
    await page.click(`document.querySelector('[data-testid=add-box-inline]')`);
    await waitGrid(3);
    await pickColor(2, "MIXED GRAY R-5");
    await fill(2, "To (Box)", "5");
    await fill(2, "S", "2");
    const g = await grid();
    assert.deepEqual([g.rows[2]["From (Box)"], g.rows[2]["To (Box)"], g.rows[2]["In Box Qty"], g.rows[2].Total], ["3", "5", "2", "6"]);
    assert.deepEqual([g.total.S, g.total["To (Box)"], g.total.Total], ["6", "5 boxes", "140"]);
    // Net weight = pieces × style weight: 126 × 12 + 8 × 10 + 6 × 12.
    assert.equal(g.total["Net Weight"], (126 * 12 + 8 * 10 + 6 * 12).toFixed(4));
    // The Summary's Packed row follows the unsaved rows; Order stays the Order's.
    const packed = await page.evaluate(READ_SUMMARY("Packed (this list)"));
    assert.deepEqual(packed, { "8Y": "26", "10Y": "44", XXS: "55", XS: "6", S: "6", M: "3", "Grand Total": "140" });
    assert.equal((await page.evaluate(READ_SUMMARY("Order"))).XS, "686");
  });

  it("an overlapping box range is flagged on both rows and blocks Save; fixing it clears the warning", async () => {
    await fill(2, "From (Box)", "2");
    await page.waitFor(`!!document.querySelector('[role=alert]')`, { label: "overlap warning" });
    assert.match(await page.evaluate(`document.querySelector('[role=alert]').textContent`), /Line 2 \(boxes 2–2\) and Line 3 \(boxes 2–5\) overlap/);
    const invalid = await page.evaluate(`[...document.querySelectorAll('#screen input[aria-invalid=true]')].map((i) => i.getAttribute('aria-label') + '=' + i.value)`);
    assert.deepEqual(invalid, ["From (Box)=2", "To (Box)=2", "From (Box)=2", "To (Box)=5"]);
    await page.click(button("Save"));
    await page.sleep(100);
    assert.equal((await saveLinesCalls()).length, 0, "nothing sent to the server");
    assert.match((await page.evaluate(`window.__toasts`)).at(-1)[1], /overlap/);
    await fill(2, "From (Box)", "3");
    await page.waitFor(`!document.querySelector('[role=alert]')`, { label: "warning cleared" });
  });

  it("Save sends every row; reopening the Packing List restores all three boxes, the Total row and the Summary", async () => {
    await page.click(button("Save"));
    await page.waitFor(`(window.__toasts || []).some((t) => t[1] === 'Packing List saved')`, { label: "saved" });
    const [[, id, sent]] = await saveLinesCalls();
    assert.equal(id, 1);
    assert.deepEqual(sent.map((l) => [l.id, l.startBox, l.endBox, l.color, l.styleWeight, l.quantities["8Y"], l.quantities.M, l.quantities.S]), [
      [100, 1, 1, "MIXED GRAY R-5", "12", 21, 0, 0],
      [null, 2, 2, "NAVY", "10", 5, 3, 0],
      [null, 3, 5, "MIXED GRAY R-5", "12", 0, 0, 2],
    ]);
    const before = await grid();
    await reopen(1, 3);
    const after = await grid();
    assert.deepEqual(after.rows, before.rows, "every box row back as entered");
    assert.deepEqual(after.total, before.total);
    assert.deepEqual(await page.evaluate(READ_SUMMARY("Packed (this list)")), { "8Y": "26", "10Y": "44", XXS: "55", XS: "6", S: "6", M: "3", "Grand Total": "140" });
  });

  it("removing a box re-totals at once; after saving, reopening shows the remaining boxes", async () => {
    await page.click(button("Edit"));
    await page.waitFor(`!!${button("Save")}`);
    await page.click(`[...document.querySelectorAll('#screen button[aria-label="Remove line"]')][1]`);
    await waitGrid(2);
    let g = await grid();
    assert.deepEqual(g.rows.map((r) => [r["From (Box)"], r["To (Box)"]]), [["1", "1"], ["3", "5"]]);
    assert.deepEqual([g.total["8Y"], g.total.M, g.total["To (Box)"], g.total.Total], ["21", "0", "4 boxes", "132"]);
    assert.equal((await page.evaluate(READ_SUMMARY("Packed (this list)")))["Grand Total"], "132");
    await page.click(button("Save"));
    await page.waitFor(`(window.__toasts || []).filter((t) => t[1] === 'Packing List saved').length === 2`, { label: "saved again" });
    await reopen(1, 2);
    g = await grid();
    assert.deepEqual(g.rows.map((r) => [r["From (Box)"], r["To (Box)"], r.Color]), [["1", "1", "MIXED GRAY R-5"], ["3", "5", "MIXED GRAY R-5"]]);
    assert.equal(g.total.Total, "132");
  });

  it("Manage Columns still hides and shows a size column; the other totals are unchanged", async () => {
    const checkbox = `document.querySelector('[role=dialog] [aria-label="Show M column"]')`;
    const toggleM = async () => {
      await page.click(button("Manage Columns"));
      await page.waitFor(`!!${checkbox}`, { label: "Manage Columns lists the size M" });
      await page.click(checkbox);
      await page.click(`[...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent.trim() === 'Save for This Session')`);
      await page.waitFor(`!document.querySelector('[role=dialog]')`);
      await page.sleep(60);
    };
    const before = await grid();
    await toggleM();
    let g = await grid();
    assert.ok(!g.headers.includes("M") && g.headers.includes("S"), "M hidden");
    assert.deepEqual([g.total.S, g.total.Total, g.total["To (Box)"]], [before.total.S, before.total.Total, before.total["To (Box)"]]);
    await toggleM();
    g = await grid();
    assert.deepEqual(g.headers, before.headers, "M back in place");
  });
});
