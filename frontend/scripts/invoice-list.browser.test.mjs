// Invoice lists (Legacy ERP → Invoices → <type>) in a REAL browser (headless Chrome/Edge, real mouse
// input; see browser-harness.mjs). Mounts the real list screen (receipt-invoices-list/page.tsx, shared
// by all 18 invoice types) against an in-memory invoices API that pages, searches and sorts like the
// backend (invoice.service.ts list). Checks, for every one of the 18 types: its own title, record count
// and saved invoices (never another type's); the columns; Create New → a blank invoice of that type;
// double-click / ⋮ View / Edit → that saved invoice; Open Inventory Receipt; Delete (confirmed,
// disabled on approved invoices); search, refresh, sorting, pagination and the empty state.
// Customize Worklist (shared useWorklist / WorklistBar / WorklistDesignModal, per-user saved worklists in
// UserSettings.tablePreferences — the stub keeps them in window.__prefs like the backend would): the bar
// on every type; designing a worklist through the real Design dialog, saving it, its columns showing the
// rows' saved values; leaving and reopening restores it; each type keeps its own worklists; search, sort,
// row opening and the row menu keep working on a custom worklist.
//   Run: npm run test:invoice-list-browser
import assert from "node:assert/strict";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { bundle, findBrowser, openPage } from "./browser-harness.mjs";

const FRONTEND = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const TYPES = [
  [2, "Purchase Receipt"], [122, "Purchase Return"], [16, "Counting Stock Receipt"], [101, "Counting Stockovers Receipt"],
  [17, "Warehouse Transfer Receipt"], [11, "Outside Process Receive Receipt"], [12, "Outside Process Return Receipt"],
  [134, "Outside Process Sent Receipt"], [133, "Outside Process Sent Return Receipt"], [140, "Manufacture Send Receipt"],
  [40, "Manufacture Return Receipt"], [10, "Outside Manufacture Receipt"], [132, "Special Purpose (Outflow) Receipt"],
  [18, "Special Purpose (Inflow) Receipt"], [22, "Service Purchase Receipt"], [139, "Service Purchase Return Receipt"],
  [120, "Wholesale Receipt"], [3, "Return Wholesale Receipt"],
];

// One invoice per type (id 1000+type), plus 23 more Purchase Receipt invoices for paging / sorting / search.
const inv = (id, type, n, extra = {}) => ({
  id, receiptType: type, receiptNo: `INV${type}-${String(n).padStart(8, "0")}`, receiptDate: "2026-08-23",
  documentNo: `DOC-${type}-${n}`, currentAccountId: 7, currentAccountCode: "CS-001", currentAccountName: "zain industries",
  inventoryReceiptId: 5000 + id, inventoryReceiptNo: `R${type}-${n}`, grandTotal: 100 * n, isApproved: 0, ...extra,
});
const DB = { invoices: [] };
for (const [type] of TYPES) DB.invoices.push(inv(1000 + type, type, 1));
for (let n = 2; n <= 24; n++) DB.invoices.push(inv(2000 + n, 2, n, n === 3 ? { isApproved: 1, currentAccountName: "Bhanero Textile" } : {}));

// The "invoice" worklist field source (worklist-fields.service.ts → invoice.service.ts INVOICE_WORKLIST_COLUMNS).
const INVOICE_FIELDS = ["ReceiptNo", "ReceiptDate", "DocumentNo", "CurrentAccountId", "InWarehouseId", "InventoryReceiptId", "Explanation", "SpecialCode",
  "CustomerOrderNo", "EximInvoiceNo", "IsEximReceipt", "SubTotal", "VatAmount", "GrandTotal", "IsApproved", "ApprovedAt", "ApprovedBy"];

const STUBS = {
  "@/lib/nexuscore-api": `
    exports.__fields = ${JSON.stringify(INVOICE_FIELDS)};
    const db = () => window.__db;
    const out = (v) => new Promise((r) => setTimeout(() => r(JSON.parse(JSON.stringify(v))), 5));
    const log = (c) => (window.__calls = window.__calls || []).push(c);
    exports.legacyErpApi = {
      worklistFields: {
        list: (primary) => { log(["worklistFields", primary]); return out(primary === "receipt-invoice-list" ? [{ source: "invoice", label: "Invoice List", fields: exports.__fields }] : []); },
      },
      invoices: (type) => ({
        list: (term, req) => {
          log(["list", type, term ?? null, req ? req.sortBy + ":" + req.sortDir + ":" + req.page : null]);
          const t = (term || "").toLowerCase();
          let rows = db().invoices.filter((r) => r.receiptType === type && !r.deleted)
            .filter((r) => !t || [r.receiptNo, r.inventoryReceiptNo, r.currentAccountName, r.documentNo].some((v) => String(v).toLowerCase().includes(t)));
          const k = req && req.sortBy || "receiptNo", dir = req && req.sortDir === "asc" ? 1 : -1;
          rows.sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * dir);
          const size = (req && req.pageSize) || 50, page = (req && req.page) || 1;
          return out({ rows: rows.slice((page - 1) * size, page * size), total: rows.length, page, pageSize: size, pageCount: Math.max(1, Math.ceil(rows.length / size)) });
        },
        delete: (id) => { log(["delete", type, id]); const r = db().invoices.find((x) => x.id === id); r.deleted = true; return out({ message: "Deleted" }); },
      }),
    };
  `,
  "@/lib/app-navigation": `exports.useRouter = () => ({ push() {}, replace() {}, back() {} }); exports.usePathname = () => "/legacy-erp/receipt-invoices-list";`,
  "@/lib/workspace/navigate": `exports.navigateOrOpenTab = (_router, href) => (window.__nav = window.__nav || []).push(href);`,
  "@/hooks/use-workspace-search-params": `exports.useWorkspaceSearchParams = () => { const p = window.__params || {}; return { get: (k) => (p[k] ?? null) }; };`,
  // UserSettings.tablePreferences, kept across remounts (like the server) in window.__prefs.
  "@/lib/api": `exports.settingsApi = {
    getCurrentSettings: async () => ({ tablePreferences: JSON.parse(JSON.stringify(window.__prefs || {})) }),
    updateCurrentSettings: async (d) => { window.__prefs = Object.assign(window.__prefs || {}, d.tablePreferences || {}); (window.__calls = window.__calls || []).push(["savePrefs", Object.keys(d.tablePreferences || {})]); return {}; },
  };`,
  sonner: `const t = (kind) => (m) => (window.__toasts = window.__toasts || []).push([kind, String(m)]);
    const toast = Object.assign(t("default"), { success: t("success"), error: t("error"), info: t("info"), warning: t("warning"), message: t("message") });
    exports.toast = toast; exports.Toaster = () => null;`,
};

const browser = findBrowser();
let page;

describe("Invoice lists in a real browser (all 18 types)", { skip: browser ? false : "no Chrome/Edge found — set CHROME_PATH" }, () => {
  before(async () => {
    const js = bundle(path.join(FRONTEND, "scripts", "fixtures", "invoice-list.harness.tsx"), { stubs: STUBS });
    page = await openPage(`<!doctype html><meta charset="utf-8"><body><div id="root"></div><script>window.__db = ${JSON.stringify(DB)}; window.__params = { receiptType: "2" };</script><script>${js.replace(/<\/script/g, "<\\/script")}</script></body>`);
    await page.waitFor(`typeof window.__open === 'function' && !!document.querySelector('#screen h1, #screen h2')`, { timeout: 20000, label: "the list mounted" });
  });
  after(async () => {
    if (page) {
      if (page.consoleErrors.length) console.log("page errors:", page.consoleErrors);
      await page.close();
    }
  });

  const VIEW = `(() => {
    const text = (e) => e.textContent.replace(/\\s+/g, ' ').trim();
    const heading = document.querySelector('#screen h1, #screen h2');
    const body = [...document.querySelectorAll('#screen tbody tr')].filter((tr) => tr.querySelectorAll('td').length > 2);
    return {
      title: heading ? text(heading) : null,
      count: [...document.querySelectorAll('#screen [data-slot=badge]')].map(text).find((t) => /record/.test(t)) || null,
      headers: [...document.querySelectorAll('#screen thead th')].map(text).filter(Boolean),
      invoiceNos: body.map((tr) => (tr.textContent.match(/INV\\d+-\\d{8}/) || [null])[0]),
      empty: /No .* invoices yet|Record not found/.test(document.querySelector('#screen').textContent) ? text(document.querySelector('#screen [data-slot=empty-title], #screen .text-lg, #screen h3') || document.body) : null,
      buttons: [...document.querySelectorAll('#screen button')].map(text).filter((t) => t === 'Create New'),
    };
  })()`;
  const view = () => page.evaluate(VIEW);
  const open = async (params) => {
    await page.evaluate(`window.__open(${JSON.stringify(params)}); window.__nav = []; window.__calls = []; window.__toasts = [];`);
    await page.sleep(60);
    await page.waitFor(`(window.__calls || []).length > 0 && !document.querySelector('#screen [data-loading=true]')`, { label: "list loaded" });
    await page.sleep(150);
  };
  const row = (invoiceNo) => `[...document.querySelectorAll('#screen tbody tr')].find((tr) => tr.textContent.includes(${JSON.stringify(invoiceNo)}))`;
  const rowMenu = async (invoiceNo) => {
    await page.press("Escape");
    await page.click(row(invoiceNo), { button: "right" });
    await page.waitFor(`document.querySelectorAll('[role=menuitem]').length > 0`, { label: "row menu open" });
    return page.evaluate(`[...document.querySelectorAll('[role=menu] > [role=menuitem]')].map((e) => [e.textContent.replace(/\\s+/g, ' ').trim(), e.getAttribute('aria-disabled') === 'true' || e.hasAttribute('data-disabled')])`);
  };
  const clickItem = (label) => page.click(`[...document.querySelectorAll('[role=menuitem]')].find((e) => e.textContent.trim() === ${JSON.stringify(label)})`);

  for (const [type, label] of TYPES) {
    it(`${type} - ${label} Invoice: its own list with its saved invoice(s), count, Create New and row opening`, async () => {
      await open({ receiptType: String(type) });
      const v = await view();
      assert.equal(v.title, `${label} Invoices`);
      const expected = type === 2 ? 24 : 1;
      assert.equal(v.count, `${expected} ${expected === 1 ? "record" : "records"}`);
      assert.ok(v.invoiceNos.length > 0 && v.invoiceNos.every((n) => n.startsWith(`INV${type}-`)), `only type ${type}: ${v.invoiceNos}`);
      assert.deepEqual((await page.evaluate(`window.__calls`))[0].slice(0, 2), ["list", type]);
      // Create New → a blank invoice of this type; double-click a row → that saved invoice.
      await page.click(`[...document.querySelectorAll('#screen button')].find((b) => b.textContent.trim() === 'Create New')`);
      await page.evaluate(`(${row(`INV${type}-00000001`)}).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`);
      assert.deepEqual(await page.evaluate(`window.__nav`), [
        `/legacy-erp/receipt-invoices?receiptType=${type}`,
        `/legacy-erp/receipt-invoices?receiptType=${type}&id=${1000 + type}`,
      ]);
    });
  }

  it("Purchase Receipt Invoices: the list columns and the row menu (View, Edit, Open Inventory Receipt, Delete)", async () => {
    await open({ receiptType: "2" });
    const v = await view();
    for (const h of ["Invoice No", "Receipt No", "Invoice Date", "Current Account", "Document", "Status", "Grand Total"]) assert.ok(v.headers.some((x) => x.startsWith(h)), `column ${h}: ${v.headers}`);
    const items = await rowMenu("INV2-00000002");
    assert.deepEqual(items, [["View", false], ["Edit", false], ["Open Inventory Receipt", false], ["Delete", false]]);
    await clickItem("Edit");
    await page.sleep(50);
    await rowMenu("INV2-00000002");
    await clickItem("Open Inventory Receipt");
    await page.sleep(50);
    assert.deepEqual(await page.evaluate(`window.__nav`), ["/legacy-erp/receipt-invoices?receiptType=2&id=2002", "/legacy-erp/inventory-receipts?id=7002&mode=view"]);
  });

  it("an approved invoice can be viewed but not edited or deleted from the list", async () => {
    await open({ receiptType: "2" });
    const items = await rowMenu("INV2-00000003");
    assert.deepEqual(items, [["View", false], ["Edit", true], ["Open Inventory Receipt", false], ["Delete", true]]);
    await page.press("Escape");
  });

  it("Delete asks first, then removes the invoice and reloads with the new count", async () => {
    await open({ receiptType: "2" });
    await rowMenu("INV2-00000024");
    await clickItem("Delete");
    await page.waitFor(`[...document.querySelectorAll('[role=alertdialog] button')].some((b) => b.textContent.trim() === 'Yes')`, { label: "confirm dialog" });
    await page.click(`[...document.querySelectorAll('[role=alertdialog] button')].find((b) => b.textContent.trim() === 'Yes')`);
    await page.waitFor(`(window.__toasts || []).some((t) => t[0] === 'success')`, { label: "deleted" });
    await page.sleep(150);
    assert.deepEqual((await page.evaluate(`window.__calls`)).find((c) => c[0] === "delete"), ["delete", 2, 2024]);
    const v = await view();
    assert.equal(v.count, "23 records");
    assert.equal(v.invoiceNos.includes("INV2-00000024"), false);
  });

  it("search, refresh, sorting and pagination use the server list", async () => {
    await open({ receiptType: "2" });
    await page.click(`document.querySelector('#screen input[placeholder^="Search"]')`);
    await page.type("bhanero");
    await page.press("Enter");
    await page.waitFor(`(window.__calls || []).some((c) => c[2] === 'bhanero')`, { label: "searched" });
    await page.sleep(150);
    let v = await view();
    assert.deepEqual([v.count, v.invoiceNos], ["1 record", ["INV2-00000003"]]);
    await page.click(`document.querySelector('#screen button[aria-label=Refresh]')`);
    await page.sleep(200);
    v = await view();
    assert.equal(v.count, "23 records");
    assert.equal(await page.evaluate(`document.querySelector('#screen input[placeholder^="Search"]').value`), "", "refresh clears the search");
    // Sort: click the Grand Total header → the server is asked for that sort.
    await page.click(`[...document.querySelectorAll('#screen thead th')].find((th) => th.textContent.trim().startsWith('Grand Total')).querySelector('button, [role=button], span') || [...document.querySelectorAll('#screen thead th')].find((th) => th.textContent.trim().startsWith('Grand Total'))`);
    await page.waitFor(`(window.__calls || []).some((c) => String(c[3]).startsWith('grandTotal:'))`, { label: "sorted by Grand Total" });
  });

  it("an empty search shows the empty state with Create New", async () => {
    await open({ receiptType: "2" });
    await page.click(`document.querySelector('#screen input[placeholder^="Search"]')`);
    await page.type("no-such-invoice");
    await page.press("Enter");
    await page.waitFor(`/Record not found/.test(document.querySelector('#screen').textContent)`, { label: "empty state" });
    assert.ok((await view()).buttons.length >= 2, "Create New in the toolbar and in the empty state");
  });

  // ── Customize Worklist ─────────────────────────────────────────────────────────────────────────
  const btn = (label, scope = "#screen") => `[...document.querySelectorAll('${scope} button')].find((b) => b.textContent.trim() === ${JSON.stringify(label)})`;
  const dialog = `document.querySelector('[role=dialog]')`;
  /** Pick a value in a Radix Select whose trigger is the given element. */
  const selectOption = async (trigger, label) => {
    await page.click(trigger);
    await page.waitFor(`[...document.querySelectorAll('[role=option]')].some((o) => o.textContent.trim() === ${JSON.stringify(label)})`, { label: `option ${label}` });
    await page.click(`[...document.querySelectorAll('[role=option]')].find((o) => o.textContent.trim() === ${JSON.stringify(label)})`);
    await page.sleep(150);
  };
  const worklistSelect = `[...document.querySelectorAll('#screen button[role=combobox]')].at(-1)`;
  const headers = () => page.evaluate(`[...document.querySelectorAll('#screen thead th')].map((th) => th.textContent.replace(/\\s+/g, ' ').trim()).filter(Boolean)`);
  const firstRowCells = () => page.evaluate(`(() => { const tr = [...document.querySelectorAll('#screen tbody tr')].find((t) => /INV2-00000001/.test(t.textContent)); return tr ? [...tr.querySelectorAll('td')].map((td) => td.textContent.replace(/\\s+/g, ' ').trim()) : null; })()`);

  it("every invoice type has the Customize Worklist bar (Standard + Design)", async () => {
    for (const [type] of TYPES) {
      await open({ receiptType: String(type) });
      const bar = await page.evaluate(`(() => { const t = document.querySelector('#screen').textContent; return { label: t.includes('Customize Worklist'), design: !!${btn("Design")}, value: (${worklistSelect})?.textContent.trim() }; })()`);
      assert.deepEqual(bar, { label: true, design: true, value: "Standard" }, `type ${type}`);
    }
  });

  it("design a worklist in the Design dialog, save it: the grid shows exactly those fields with the rows' saved values", async () => {
    await page.evaluate(`window.__prefs = {}`);
    await open({ receiptType: "2" });
    await page.click(btn("Design"));
    await page.waitFor(`!!${dialog} && /Invoice/.test(${dialog}.textContent) && !/Loading fields/.test(${dialog}.textContent)`, { label: "design dialog with the invoice fields" });
    assert.deepEqual((await page.evaluate(`window.__calls`)).filter((c) => c[0] === "worklistFields"), [["worklistFields", "receipt-invoice-list"]], "only the invoice field source is requested");
    await page.click(btn("Add List", "[role=dialog]"));
    await page.click(`document.querySelector('[role=dialog] input[placeholder="Worklist name"]')`);
    await page.type("Accounts view");
    // Open the "Invoice" source and tick fields in order.
    await page.click(`[...document.querySelectorAll('[role=dialog] button[aria-expanded]')].find((b) => /^Invoice/.test(b.textContent.trim()))`);
    await page.sleep(200);
    const tick = (label) => page.click(`[...document.querySelectorAll('[role=dialog] [role=checkbox]')].find((cb) => cb.parentElement.textContent.trim() === ${JSON.stringify(label)})`);
    for (const label of ["Receipt No", "Current Account", "Grand Total", "Is Approved"]) { await tick(label); await page.sleep(40); }
    await page.click(btn("OK", "[role=dialog]"));
    await page.waitFor(`!${dialog}`, { label: "dialog closed" });
    await page.sleep(150);
    // Saved for the user, under this type's own key, with the chosen fields in order.
    const saved = await page.evaluate(`window.__prefs.receiptInvoicesListWorklists_2`);
    assert.equal(saved.length, 1);
    assert.equal(saved[0].name, "Accounts view");
    assert.deepEqual(saved[0].fields.map((f) => `${f.source}:${f.key}`), ["invoice:ReceiptNo", "invoice:CurrentAccountId", "invoice:GrandTotal", "invoice:IsApproved"]);
    // Apply it: the columns are the worklist's (invoice wording), the cells the saved values.
    await selectOption(worklistSelect, "Accounts view");
    assert.deepEqual(await headers(), ["Invoice No", "Current Account", "Grand Total", "Status"]);
    const cells = await firstRowCells();
    assert.ok(cells.includes("INV2-00000001") && cells.includes("CS-001 zain industries") && cells.includes("100.00") && cells.includes("Unapproved"), JSON.stringify(cells));
  });

  it("leaving and reopening the list restores the saved worklist; Standard brings the standard columns back", async () => {
    await open({ receiptType: "2" });
    await selectOption(worklistSelect, "Accounts view");
    assert.deepEqual(await headers(), ["Invoice No", "Current Account", "Grand Total", "Status"], "restored from the saved settings");
    await selectOption(worklistSelect, "Standard");
    assert.deepEqual(await headers(), ["Invoice No", "Receipt No", "Invoice Date", "Current Account", "Document", "Status", "Grand Total"]);
  });

  it("each invoice type keeps its own worklists (Purchase Return does not get Purchase Receipt's)", async () => {
    await open({ receiptType: "122" });
    await page.click(worklistSelect);
    await page.waitFor(`document.querySelectorAll('[role=option]').length > 0`, { label: "options" });
    const options = await page.evaluate(`[...document.querySelectorAll('[role=option]')].map((o) => o.textContent.trim())`);
    await page.press("Escape");
    assert.deepEqual(options, ["Standard"]);
    assert.equal((await page.evaluate(`window.__prefs.receiptInvoicesListWorklists_2`)).length, 1, "Purchase Receipt's worklist still saved");
  });

  it("on a custom worklist: sorting by a worklist column, search, opening a row and the row menu still work", async () => {
    await open({ receiptType: "2" });
    await selectOption(worklistSelect, "Accounts view");
    const gt = `[...document.querySelectorAll('#screen thead th')].find((th) => th.textContent.trim().startsWith('Grand Total'))`;
    await page.click(`(${gt}).querySelector('button, [role=button], span') || ${gt}`);
    await page.waitFor(`(window.__calls || []).some((c) => c[0] === 'list' && String(c[3]).startsWith('grandTotal:'))`, { label: "server sort by Grand Total" });
    await page.sleep(150);
    await page.click(`document.querySelector('#screen input[placeholder^="Search"]')`);
    await page.type("bhanero");
    await page.press("Enter");
    await page.waitFor(`(window.__calls || []).some((c) => c[2] === 'bhanero')`, { label: "searched" });
    await page.sleep(150);
    assert.deepEqual(await headers(), ["Invoice No", "Current Account", "Grand Total", "Status"], "still the worklist's columns");
    const rows = await page.evaluate(`[...document.querySelectorAll('#screen tbody tr')].map((tr) => (tr.textContent.match(/INV\\d+-\\d{8}/) || [null])[0]).filter(Boolean)`);
    assert.deepEqual(rows, ["INV2-00000003"]);
    assert.equal((await rowMenu("INV2-00000003")).map(([l]) => l).join(","), "View,Edit,Open Inventory Receipt,Delete");
    await page.press("Escape");
    await page.evaluate(`(${row("INV2-00000003")}).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`);
    assert.deepEqual(await page.evaluate(`window.__nav`), ["/legacy-erp/receipt-invoices?receiptType=2&id=2003"]);
  });
});
