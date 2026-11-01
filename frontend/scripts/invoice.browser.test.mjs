// Invoice screens (legacy IM_Invoice + linked Inventory Receipt) in a REAL browser (headless
// Chrome/Edge, real mouse/keyboard; see browser-harness.mjs). Mounts the real screen with the REAL
// receipt line grid against an in-memory invoice / receipt API that follows the backend's rules
// (one invoice per receipt, Current Account / Warehouse defaulting from the receipt, totals from the
// receipt's lines, approval lock). Checks the reference layout (tabs; General Info, Integration,
// Current Account Info, Warehouse Info; grid columns; bottom totals 23 × 51,000 at 18%), creating an
// invoice by picking a receipt, the Subcontract Order (type 3) lookup saved on the receipt, Detail /
// Export fields saved and restored on reopening, Approve locking the header and the lines,
// Unapprove, and the per-type title, for Purchase Receipt and Outside Process Receive.
//   Run: npm run test:invoice-browser
import assert from "node:assert/strict";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { bundle, findBrowser, openPage } from "./browser-harness.mjs";

const FRONTEND = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const receipt = (id, type, no, extra = {}) => ({
  id, receiptType: type, receiptNo: no, receiptDate: "2026-04-27T00:00:00.000Z", shipmentDate: "2026-01-29T00:00:00.000Z", documentNo: "340-B",
  currentAccountId: 36, inWarehouseId: 3, isApproved: 0, scriptId: null, scriptReceiptNo: null, ...extra,
});
const LINE = { id: 501, inventoryId: 71, quantity: 23, grossQuantity: null, unitPrice: 51000, vatRate: 18, vatIncluded: 0, itemTotal: 1173000, netItemTotal: 1384140, unitId: null };
// The 18 invoice types (lib/legacy-erp/receipt-types.ts) — each invoices its own receipt type.
const TYPES = [[2, "Purchase Receipt"], [122, "Purchase Return"], [16, "Counting Stock Receipt"], [101, "Counting Stockovers Receipt"],
  [17, "Warehouse Transfer Receipt"], [11, "Outside Process Receive Receipt"], [12, "Outside Process Return Receipt"], [134, "Outside Process Sent Receipt"],
  [133, "Outside Process Sent Return Receipt"], [140, "Manufacture Send Receipt"], [40, "Manufacture Return Receipt"], [10, "Outside Manufacture Receipt"],
  [132, "Special Purpose (Outflow) Receipt"], [18, "Special Purpose (Inflow) Receipt"], [22, "Service Purchase Receipt"], [139, "Service Purchase Return Receipt"],
  [120, "Wholesale Receipt"], [3, "Return Wholesale Receipt"]];
// One saved receipt with a line per type (ids 1000+), each with its own header values, plus a
// type-2 receipt without lines (1100), which is never offered. Account 36 = Bhanero, 37 = Zain:
// IR-A2 (36, two lines) is combined with R2-1000 into one invoice; IR-B1 / OPR-B1 are Zain's.
const typedReceipts = Object.fromEntries(TYPES.map(([t], i) => [1000 + i, receipt(1000 + i, t, `R${t}-${1000 + i}`, { documentNo: `DOC-${t}`, explanation: `Explanation ${t}`, specialCode: `SC${t}`, plateNumber: `PL-${t}`, driverName: `Driver ${t}` })]));
const LINE2 = { ...LINE, id: 601, inventoryId: 72, quantity: 10, unitPrice: 1000, vatRate: 0, itemTotal: 10000, netItemTotal: 10000 };
const DB = {
  receipts: { 83: receipt(83, 2, "00000083"), 84: receipt(84, 11, "OPR-84"), ...typedReceipts, 1100: receipt(1100, 2, "IR-NOLINES"),
    1200: receipt(1200, 2, "IR-A2", { documentNo: "DOC-A2" }), 1201: receipt(1201, 2, "IR-B1", { currentAccountId: 37, documentNo: "DOC-B1" }),
    1202: receipt(1202, 11, "OPR-B1", { currentAccountId: 37 }) },
  lines: { 83: [LINE], 84: [{ ...LINE, id: 502 }], ...Object.fromEntries(Object.keys(typedReceipts).map((id) => [id, [{ ...LINE, id: 5000 + Number(id) }]])),
    1200: [{ ...LINE, id: 6001 }, LINE2], 1201: [{ ...LINE, id: 6002 }], 1202: [{ ...LINE, id: 6003 }] },
  labels: Object.fromEntries(TYPES),
  invoices: {},
  nextInvoice: 1,
  orders: [{ id: 183, receiptNo: "00000183", receiptDate: "2026-04-01", documentNo: "SO-DOC", currentAccountId: 36 }],
};

const STUBS = {
  "@/lib/nexuscore-api": `
    const db = () => window.__db;
    const clone = (v) => JSON.parse(JSON.stringify(v));
    const out = (v) => new Promise((r) => setTimeout(() => r(clone(v)), 5));
    const fail = (status, message) => Promise.reject(Object.assign(new Error(message), { status }));
    const log = (c) => (window.__calls = window.__calls || []).push(clone(c));
    const anything = () => new Proxy(function () { return Promise.resolve([]); }, { get: (t, k) => (k === "then" ? undefined : anything()) });
    const loose = (target) => new Proxy(target, { get: (t, k) => (k in t ? t[k] : typeof k === "string" ? anything() : undefined) });
    const ACC = { 36: ["S-0036", "Bhanero Textile Mills Limited"], 37: ["S-0037", "Zain Industries"] };
    const sum = (id) => (db().lines[id] || []).reduce((a, l) => ({ sub: a.sub + l.itemTotal, grand: a.grand + l.netItemTotal }), { sub: 0, grand: 0 });
    // As invoice.service.ts: an invoice covers inventoryReceiptIds (first = inventoryReceiptId).
    const idsOf = (inv) => (inv.inventoryReceiptIds && inv.inventoryReceiptIds.length ? inv.inventoryReceiptIds : [inv.inventoryReceiptId]).map(Number);
    const view = (inv) => {
      const r = db().receipts[inv.inventoryReceiptId] || {};
      const ids = idsOf(inv);
      const t = ids.reduce((a, id) => { const s = sum(id); return { sub: a.sub + s.sub, grand: a.grand + s.grand }; }, { sub: 0, grand: 0 });
      const acc = ACC[inv.currentAccountId] || ACC[36];
      return { ...inv, currentAccountCode: acc[0], currentAccountName: acc[1], warehouseCode: "03", warehouseName: "Yarn Store",
        inventoryReceiptNo: ids.map((id) => db().receipts[id].receiptNo).join(", "), shipmentDate: r.shipmentDate, receiptDocumentNo: r.documentNo, receiptApproved: r.isApproved, orderId: r.scriptId, orderNo: r.scriptReceiptNo,
        receipts: ids.map((id) => ({ id, receiptNo: db().receipts[id].receiptNo, lines: (db().lines[id] || []).length, currentAccountId: db().receipts[id].currentAccountId })),
        inventoryReceiptIds: ids, subTotal: t.sub, vatAmount: t.grand - t.sub, grandTotal: t.grand };
    };
    const invoiceOf = (receiptId) => Object.values(db().invoices).find((v) => idsOf(v).includes(Number(receiptId)));
    const receiptClient = () => loose({
      get: (id) => out(db().receipts[id]),
      listItems: (id) => out(db().lines[id] || []),
      update: (id, d) => {
        log(["receipt.update", id, d]); const r = db().receipts[id];
        if (r.isApproved) return fail(409, "approved");
        if ("scriptId" in d) { r.scriptId = d.scriptId; r.scriptReceiptNo = (db().orders.find((o) => o.id === d.scriptId) || {}).receiptNo || null; }
        return out(r);
      },
    });
    const invoiceClient = (type) => loose({
      list: () => out({ rows: Object.values(db().invoices).filter((v) => v.receiptType === type).map(view), total: 0 }),
      get: (id) => out(view(db().invoices[id])),
      previewNextCode: () => out({ code: "INV" + type + "-" + String(db().nextInvoice).padStart(8, "0") }),
      receiptCandidates: (search, invoiceId, paging, accountId) => {
        log(["receiptCandidates", type, accountId || null]);
        const rows = Object.values(db().receipts).filter((r) => r.receiptType === type && !invoiceOf(r.id) && (!accountId || r.currentAccountId === accountId))
          .map((r) => ({ ...r, currentAccountName: ACC[r.currentAccountId][1] }));
        return out({ rows, total: rows.length });
      },
      // Create New's Source Receipt — as invoice.service.ts: the type(s) the invoice type invoices
      // (its own; window.__sourceTypes overrides it to exercise a multi-type invoice), that type's
      // receipts with lines, an already-invoiced one carrying its invoice.
      sourceReceiptTypes: () => out(((window.__sourceTypes || {})[type] || [type]).map((t) => ({ receiptType: t, label: db().labels[t] }))),
      sourceReceipts: (sourceType, search, paging, accountId) => {
        log(["sourceReceipts", type, sourceType, search || "", accountId || null]);
        const valid = (window.__sourceTypes || {})[type] || [type];
        if (!valid.includes(sourceType)) return fail(400, "not a source type");
        const s = (search || "").toLowerCase();
        const rows = Object.values(db().receipts)
          .filter((r) => r.receiptType === sourceType && (db().lines[r.id] || []).length && (!accountId || r.currentAccountId === accountId)
            && (!s || [r.receiptNo, r.documentNo].some((x) => String(x || "").toLowerCase().includes(s))))
          .map((r) => { const inv = invoiceOf(r.id); return { ...r, currentAccountName: ACC[r.currentAccountId][1], lines: db().lines[r.id].length, grandTotal: sum(r.id).grand, invoiceId: inv ? inv.id : null, invoiceNo: inv ? inv.receiptNo : null }; });
        return out({ rows, total: rows.length });
      },
      sourceReceipt: (id) => {
        log(["sourceReceipt", type, id]);
        const r = db().receipts[id];
        if (!r || !((window.__sourceTypes || {})[type] || [type]).includes(r.receiptType)) return fail(400, "Receipt is not of this type");
        const inv = invoiceOf(id);
        return out({ id: r.id, receiptType: r.receiptType, receiptNo: r.receiptNo, receiptDate: r.receiptDate, documentNo: r.documentNo,
          currentAccountId: r.currentAccountId, currentAccountCode: ACC[r.currentAccountId][0], currentAccountName: ACC[r.currentAccountId][1],
          inWarehouseId: r.inWarehouseId, warehouseCode: "03", warehouseName: "Yarn Store", explanation: r.explanation || null, specialCode: r.specialCode || null,
          eximInvoiceNo: null, customerOrderNo: null, isEximReceipt: 0, shipmentDate: r.shipmentDate, vehicleNo: r.plateNumber || null, driverName: r.driverName || null,
          isApproved: r.isApproved, orderId: r.scriptId, orderNo: r.scriptReceiptNo, lines: (db().lines[id] || []).length, invoiceId: inv ? inv.id : null, invoiceNo: inv ? inv.receiptNo : null });
      },
      create: (d) => {
        log(["invoice.create", type, d]);
        const ids = idsOf(d);
        const taken = ids.find((x) => invoiceOf(x));
        if (taken) return fail(409, "Inventory Receipt " + taken + " is already on invoice " + invoiceOf(taken).receiptNo);
        if (new Set(ids.map((x) => db().receipts[x].currentAccountId)).size > 1) return fail(400, "Receipts of different Current Accounts can't be on one invoice");
        const id = db().nextInvoice++;
        db().invoices[id] = { id, receiptType: type, receiptNo: "INV" + type + "-" + String(id).padStart(8, "0"), isApproved: 0, approvedAt: null, ...d, inventoryReceiptId: ids[0], inventoryReceiptIds: ids };
        return out(view(db().invoices[id]));
      },
      update: (id, d) => { log(["invoice.update", id, d]); const v = db().invoices[id]; if (v.isApproved) return fail(409, "approved"); Object.assign(v, d); return out(view(v)); },
      approve: (id) => { Object.assign(db().invoices[id], { isApproved: 1, approvedAt: "2026-10-31T00:00:00.000Z" }); return out(view(db().invoices[id])); },
      unapprove: (id) => { Object.assign(db().invoices[id], { isApproved: 0, approvedAt: null }); return out(view(db().invoices[id])); },
      listAttachments: () => out([]),
    });
    exports.legacyErpApi = loose({
      inventoryReceipts: receiptClient(),
      receipts: () => receiptClient(),
      invoices: (type) => invoiceClient(type),
      orders: (type) => loose({ list: () => { log(["orders.list", type]); return out({ rows: db().orders, total: db().orders.length }); } }),
      accounts: loose({ get: (id) => out(ACC[id] ? { id, currentAccountCode: ACC[id][0], currentAccountName: ACC[id][1] } : null), list: () => out([]) }),
      warehouses: loose({ get: (id) => out(id === 3 ? { id: 3, warehouseCode: "03", warehouseName: "Yarn Store" } : null), list: () => out([]) }),
      inventoryCards: loose({ list: () => out({ rows: [{ id: 71, inventoryCode: "YRN-071", inventoryName: "30/1 CVC R", stockOnHand: 3.2 }], total: 1 }) }),
      lookupTableGet: () => Promise.resolve(null),
    });
    exports.plmApi = loose({});
    exports.approvalConfigApi = { list: async () => [] };
    exports.fetchAllPages = async (fetchPage) => { const r = await fetchPage({ page: 1, pageSize: 500 }); return (r && r.rows) || []; };
  `,
  "@/lib/api": `exports.settingsApi = { getCurrentSettings: async () => ({ tablePreferences: {} }), updateCurrentSettings: async () => ({}) };`,
  "@/lib/auth": `exports.getCurrentUser = () => ({ id: "u1", name: "Tester" });`,
  "@/hooks/use-grid-udf": `exports.isUdfColumnKey = () => false;
    exports.useGridUdf = () => ({ fields: [], columnDefs: [], fieldForColumn: () => undefined, valueOf: () => undefined, setValue() {}, isMissing: () => false, dirty: false, validate: () => true, save: async () => true });`,
  "@/components/legacy-erp/attachments-tab": `exports.AttachmentsTab = () => null;`,
  "@/components/legacy-erp/master-autocomplete-field": `const React = require("react");
    // Stands in for the account / warehouse autocomplete: window.__selectMaster[key](option) is what
    // choosing an option in it calls (its onSelect).
    exports.MasterAutocompleteField = (p) => { (window.__selectMaster = window.__selectMaster || {})[p.masterKey] = p.onSelect;
      return React.createElement("input", { "data-master": p.masterKey, readOnly: true, value: p.displayValue || "" }); };`,
  "@/lib/app-navigation": `exports.useRouter = () => ({ push() {}, replace() {}, back() {} }); exports.usePathname = () => "/legacy-erp/receipt-invoices";`,
  "@/lib/workspace/navigate": `exports.navigateOrOpenTab = () => {};`,
  "@/lib/store/workspace-store": `exports.useWorkspaceStore = (sel) => sel({ closeTab: (k) => { window.__closed = k; } });`,
  "@/components/layout/workspace/workspace-tab-context": `exports.useWorkspaceTabContext = () => ({ tabKey: "/legacy-erp/receipt-invoices?receiptType=" + ((window.__params || {}).receiptType || "2") });`,
  "@/lib/company-path": `exports.currentAppPath = () => "/legacy-erp/receipt-invoices";`,
  "@/hooks/use-workspace-search-params": `exports.useWorkspaceSearchParams = () => { const p = window.__params || {}; return { get: (k) => (p[k] ?? null) }; };`,
  "@/hooks/use-workspace-dirty": `exports.useWorkspaceDirty = () => {};`,
  "@/hooks/use-workspace-tab-title": `exports.useWorkspaceTabTitle = (t) => { window.__tabTitle = t; }; exports.useWorkspaceRecordLabel = () => {};`,
  "@/hooks/use-workspace-record-id": `exports.useWorkspaceRecordId = () => {};`,
  "@/hooks/use-decimal-parameters": `const api = { round: (v) => Math.round(Number(v) * 1e4) / 1e4, format: (v) => String(v), ensureLoaded: () => {}, refresh: () => {}, loaded: true, loading: false };
    exports.useDecimalParameters = () => api;`,
  sonner: `const t = (kind) => (m) => (window.__toasts = window.__toasts || []).push([kind, String(m)]);
    const toast = Object.assign(t("default"), { success: t("success"), error: t("error"), info: t("info"), warning: t("warning"), message: t("message") });
    exports.toast = toast; exports.Toaster = () => null;`,
};

const browser = findBrowser();
let page;

describe("Invoice screens in a real browser (real line grid)", { skip: browser ? false : "no Chrome/Edge found — set CHROME_PATH" }, () => {
  before(async () => {
    const js = bundle(path.join(FRONTEND, "scripts", "fixtures", "invoice.harness.tsx"), { stubs: STUBS });
    page = await openPage(`<!doctype html><meta charset="utf-8"><body><div id="root"></div><script>window.__db = ${JSON.stringify(DB)}; window.__params = { receiptType: "2" };</script><script>${js.replace(/<\/script/g, "<\\/script")}</script></body>`);
    await page.waitFor(`typeof window.__open === 'function' && document.querySelector('#inv-no')?.value === 'INV2-00000001'`, { timeout: 20000, label: "new invoice screen" });
  });
  after(async () => {
    if (page) {
      if (page.consoleErrors.length) console.log("page errors:", page.consoleErrors);
      await page.close();
    }
  });

  const txt = (sel) => page.evaluate(`(document.querySelector(${JSON.stringify(sel)})?.textContent ?? '').replace(/\\s+/g, ' ').trim()`);
  const val = (sel) => page.evaluate(`document.querySelector(${JSON.stringify(sel)})?.value ?? null`);
  const button = (label) => `[...document.querySelectorAll('#screen button')].find((b) => b.textContent.trim() === ${JSON.stringify(label)})`;
  const tab = (label) => `[...document.querySelectorAll('#screen [role=tab]')].find((b) => b.textContent.trim() === ${JSON.stringify(label)})`;
  const openTab = async (label) => { await page.click(tab(label)); await page.waitFor(`${tab(label)}.getAttribute('data-state') === 'active'`, { label: `${label} tab` }); };
  const fill = async (sel, value) => { await page.click(`document.querySelector(${JSON.stringify(sel)})`); await page.evaluate(`document.querySelector(${JSON.stringify(sel)}).select()`); await page.type(value); };
  const pickFirst = async (opener) => {
    await page.click(`document.querySelector('[aria-label=${JSON.stringify(opener)}]')`);
    await page.waitFor(`[...document.querySelectorAll('[role=dialog] button')].some((b) => b.textContent.trim() === 'Select')`, { label: `${opener} list` });
    await page.click(`[...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent.trim() === 'Select')`);
    await page.waitFor(`!document.querySelector('[role=dialog]')`, { label: "dialog closed" });
  };
  const gridLoaded = `document.querySelector('[data-total=grandTotal]')?.textContent === '1,384,140.0000'`;
  const calls = (kind) => page.evaluate(`(window.__calls || []).filter((c) => c[0] === ${JSON.stringify(kind)})`);

  it("a new Purchase Receipt invoice: reference tabs and groups; no lines until a receipt is picked", async () => {
    assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('#screen [role=tab]')].map((t) => t.textContent.trim())`), ["General", "Detail", "Export", "Totals", "Attachments"]);
    assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('#screen fieldset legend')].map((l) => l.textContent.trim())`), ["Source Receipt", "General Info", "Current Account Info", "Warehouse Info", "Integration"]);
    const labels = await page.evaluate(`[...document.querySelectorAll('#screen fieldset label')].map((l) => l.textContent.trim())`);
    for (const l of ["Receipt No", "Receipt Date", "Shipment Date", "Document", "Receipt Document", "Current Account", "Warehouse", "Order", "Inventory Receipt"]) assert.ok(labels.includes(l), l);
    assert.equal(await page.evaluate(`!!document.querySelector('[data-testid=no-receipt]')`), true);
    assert.equal(await page.evaluate(`window.__tabTitle`), "New Purchase Receipt Invoice");
  });

  it("picking the Inventory Receipt brings its lines, Shipment Date, Receipt Document, account and warehouse; bottom totals = 23 × 51,000 at 18%", async () => {
    await pickFirst("Search Inventory Receipts");
    await page.waitFor(gridLoaded, { label: "receipt lines loaded" });
    assert.deepEqual([await val("[aria-label='Inventory Receipt']"), await val("#inv-shipment"), await val("#inv-receipt-document")], ["00000083", "2026-01-29", "340-B"]);
    assert.deepEqual([await val("[data-master=currentAccount]"), await txt("[data-testid=current-account-name]"), await val("[data-master=warehouse]"), await txt("[data-testid=warehouse-name]")], ["S-0036", "Bhanero Textile Mills Limited", "03", "Yarn Store"]);
    const heads = await page.evaluate(`[...document.querySelectorAll('.ir-grid thead th')].map((t) => t.textContent.trim()).filter(Boolean)`);
    const order = ["Type", "Code", "Name", "Explanation", "Gross Quantity", "Quantity", "Unit", "Rate", "Price", "Forex", "Forex Price", "VAT (I/E)"].map((h) => heads.indexOf(h));
    assert.ok(order.every((i) => i >= 0) && order.every((v, i, a) => i === 0 || v > a[i - 1]), `grid columns in legacy order: ${heads.join(" | ")}`);
    assert.match(await page.evaluate(`document.querySelector('.ir-grid tbody tr').textContent`), /YRN-071.*30\/1 CVC R/);
    assert.deepEqual([await txt("[data-total=totalQuantity]"), await txt("[data-total=totalGrossQuantity]"), await txt("[data-total=subTotal]"), await txt("[data-total=vatTotal]"), await txt("[data-total=grandTotal]")],
      ["23.0000 (1 Item)", "0.0000", "1,173,000.0000", "211,140.0000", "1,384,140.0000"]);
  });

  it("Order is picked from the Subcontract Orders list (type 3) and Save stores it on the receipt; the invoice is created with its fields", async () => {
    await pickFirst("Search Subcontract Orders");
    assert.deepEqual((await calls("orders.list")).at(-1), ["orders.list", 3]);
    assert.equal(await val("[aria-label=Order]"), "00000183");
    await fill("#inv-document", "INV-DOC");
    await openTab("Detail");
    await fill("#inv-explanation", "April yarn");
    await openTab("Export");
    await fill("#inv-exim", "EXP-55");
    await page.click(`document.querySelector('#inv-is-exim')`);
    await page.click(button("Save"));
    await page.waitFor(`(window.__toasts || []).some((t) => t[1] === 'Invoice created')`, { label: "invoice created" });
    assert.deepEqual((await calls("receipt.update")).at(-1), ["receipt.update", 83, { scriptId: 183 }]);
    const [, , dto] = (await calls("invoice.create")).at(-1);
    assert.deepEqual([dto.inventoryReceiptId, dto.currentAccountId, dto.inWarehouseId, dto.documentNo, dto.explanation, dto.eximInvoiceNo, dto.isEximReceipt], [83, 36, 3, "INV-DOC", "April yarn", "EXP-55", 1]);
    assert.equal(await page.evaluate(`window.__tabTitle`), "Invoice [2-Purchase Receipt] [Unapproved] - INV2-00000001");
  });

  it("reopening the invoice restores every field, the Order and the lines", async () => {
    await page.evaluate(`window.__open({ receiptType: "2", id: "1" })`);
    await page.sleep(80);
    await page.waitFor(`document.querySelector('#inv-no')?.value === 'INV2-00000001' && ${gridLoaded}`, { label: "reopened" });
    assert.deepEqual([await val("#inv-document"), await val("[aria-label=Order]"), await val("[aria-label='Inventory Receipt']")], ["INV-DOC", "00000183", "00000083"]);
    await openTab("Detail");
    assert.equal(await val("#inv-explanation"), "April yarn");
    await openTab("Export");
    assert.deepEqual([await val("#inv-exim"), await page.evaluate(`document.querySelector('#inv-is-exim').checked`)], ["EXP-55", true]);
    await openTab("Totals");
    assert.equal(await page.evaluate(`document.querySelector('[data-totals-tab=grandTotal]').textContent`), "1,384,140.0000");
    await openTab("General");
  });

  it("Approve locks the header and the lines; Unapprove restores editing", async () => {
    await page.click(button("Approve"));
    await page.waitFor(`!!${button("Unapprove")}`, { label: "approved" });
    assert.match(await txt("[data-testid=document-title]"), /\[Approved\] - INV2-00000001/);
    assert.equal(await page.evaluate(`!!${button("Save")} || !!${button("Delete")}`), false);
    const editable = await page.evaluate(`[...document.querySelectorAll('#screen fieldset input:not([readonly]), #screen fieldset button')].filter((e) => !e.matches(':disabled')).map((e) => e.id || e.getAttribute('aria-label'))`);
    assert.deepEqual(editable, [], "header locked");
    assert.equal(await page.evaluate(`document.querySelectorAll('.ir-grid table input:not([disabled])').length + [...document.querySelectorAll('.ir-grid button')].filter((b) => /Add/.test(b.textContent)).length`), 0, "lines locked");
    await page.click(button("Unapprove"));
    await page.waitFor(`!!${button("Save")}`, { label: "reopened for editing" });
    assert.equal(await page.evaluate(`[...document.querySelectorAll('.ir-grid button')].some((b) => /Add/.test(b.textContent))`), true, "Add Row back");
  });

  it("a separate screen per receipt type: Outside Process Receive (11) lists its own receipts and numbers its own invoices", async () => {
    await page.evaluate(`window.__open({ receiptType: "11" })`);
    await page.sleep(80);
    await page.waitFor(`document.querySelector('#inv-no')?.value?.startsWith('INV11-')`, { label: "type 11 screen" });
    await pickFirst("Search Inventory Receipts");
    await page.waitFor(`document.querySelector("[aria-label='Inventory Receipt']").value === 'OPR-84'`, { label: "type 11 receipt" });
    assert.equal(await page.evaluate(`window.__tabTitle`), "New Outside Process Receive Receipt Invoice");
  });

  // ── Create New → Source Receipt (Current Account filter, multi-select, consolidated invoice) ──────
  const openNew = async (type) => {
    await page.evaluate(`window.__open({ receiptType: "${type}" }); window.__toasts = []; window.__calls = [];`);
    await page.sleep(80);
    await page.waitFor(`document.querySelector('#inv-no')?.value?.startsWith('INV${type}-') && !!document.querySelector('[data-testid=source-receipt]')`, { label: `new type ${type} invoice` });
  };
  const ROW = (no) => `document.querySelector('[data-testid=source-receipt-row][data-receipt-no="${no}"]')`;
  const shownRows = () => page.evaluate(`[...document.querySelectorAll('[data-testid=source-receipt-row]')].map((r) => r.dataset.receiptNo)`);
  const chips = () => page.evaluate(`[...document.querySelectorAll('[data-testid=source-receipt-chip]')].map((r) => r.dataset.receiptNo)`);
  const settleList = async () => { await page.sleep(350); await page.waitFor(`document.querySelectorAll('[data-testid=source-receipt-row]').length > 0 || !!document.querySelector('[data-testid=source-receipt-empty]')`, { label: "receipt list" }); };
  /** Open the receipt list (Select / Add Receipts) and return the receipt numbers it shows. */
  const openList = async () => {
    if (!(await page.evaluate(`!!document.querySelector('[data-testid=source-receipt-panel]')`))) await page.click(`document.querySelector('[data-testid=source-receipt-open]')`);
    await settleList();
    return shownRows();
  };
  const tick = async (no) => { await page.click(`${ROW(no)}.querySelector('input[type=checkbox]')`); await page.sleep(60); };
  const addSelected = async () => { await page.click(`document.querySelector('[data-testid=source-receipt-add]')`); };
  const pickReceipts = async (...nos) => { await openList(); for (const no of nos) { await tick(no); await settleList(); } await addSelected(); };
  const selectAccount = (id) => page.evaluate(`window.__selectMaster.currentAccount(${JSON.stringify({ id, code: id === 37 ? "S-0037" : "S-0036", name: id === 37 ? "Zain Industries" : "Bhanero Textile Mills Limited" })})`);
  const sections = () => page.evaluate(`[...document.querySelectorAll('[data-testid=receipt-lines]')].map((s) => s.dataset.receiptNo)`);
  const accountOfRow = (r) => DB.receipts[r].currentAccountId;

  it("all 18 types: Create New fixes the one valid receipt type (no dropdown), lists only that type's receipts with lines, and picking one fills its saved header and lines", async () => {
    for (const [t, label] of TYPES) {
      await openNew(t);
      await page.waitFor(`document.querySelector('[data-testid=source-receipt-type]')?.textContent === ${JSON.stringify(`${t} - ${label}`)}`, { label: `type ${t} source type` });
      assert.equal(await page.evaluate(`!!document.querySelector('[data-testid=source-receipt-type-select]')`), false, `type ${t}: no Receipt Type dropdown`);
      const expected = Object.values(DB.receipts).filter((r) => r.receiptType === t && (DB.lines[r.id] || []).length).map((r) => r.receiptNo).sort();
      assert.deepEqual((await openList()).sort(), expected, `type ${t}: only its own receipts with lines`);
      const r = Object.values(typedReceipts).find((x) => x.receiptType === t);
      await tick(r.receiptNo);
      await addSelected();
      await page.waitFor(`document.querySelector("[aria-label='Inventory Receipt']").value === ${JSON.stringify(r.receiptNo)} && ${gridLoaded}`, { label: `type ${t} receipt picked` });
      assert.deepEqual((await calls("sourceReceipts"))[0].slice(0, 4), ["sourceReceipts", t, t, ""], `type ${t}: asks for its own source type`);
      assert.deepEqual([await val("#inv-document"), await val("#inv-receipt-document"), await val("#inv-date"), await val("#inv-shipment"), await val("#inv-vehicle"), await val("#inv-driver")],
        [`DOC-${t}`, `DOC-${t}`, "2026-04-27", "2026-01-29", `PL-${t}`, `Driver ${t}`], `type ${t}: header`);
      assert.deepEqual([await val("[data-master=currentAccount]"), await val("[data-master=warehouse]"), await chips()], ["S-0036", "03", [r.receiptNo]]);
      assert.deepEqual(await sections(), [r.receiptNo], `type ${t}: the receipt's lines`);
      assert.equal(await page.evaluate(`/YRN-071/.test(document.querySelector('.ir-grid tbody tr').textContent)`), true);
      await openTab("Detail");
      assert.deepEqual([await val("#inv-explanation"), await val("#inv-special")], [`Explanation ${t}`, `SC${t}`]);
      await openTab("General");
    }
  });

  it("the receipt list searches by receipt no and document", async () => {
    await openNew(2);
    await openList();
    await page.click(`document.querySelector('[data-testid=source-receipt-search]')`);
    await page.type("R2-1000");
    await settleList();
    assert.deepEqual(await shownRows(), ["R2-1000"]);
    await page.evaluate(`document.querySelector('[data-testid=source-receipt-search]').select()`);
    await page.type("DOC-A2");
    await page.waitFor(`document.querySelectorAll('[data-testid=source-receipt-row]').length === 1 && !!${ROW("IR-A2")}`, { label: "searched by document" });
    assert.ok((await calls("sourceReceipts")).some((c) => c[3] === "DOC-A2"), "searched on the server");
  });

  it("only the chosen Current Account's receipts are listed (by account id), and switching the account switches the list", async () => {
    await openNew(2);
    await selectAccount(37);
    assert.deepEqual(await openList(), ["IR-B1"], "Zain's only");
    assert.match(await txt("[data-testid=source-receipt-account]"), /Current Account: Zain Industries/);
    assert.equal((await calls("sourceReceipts")).at(-1)[4], 37, "filtered by the account id on the server");
    await selectAccount(36);
    await page.waitFor(`!${ROW("IR-B1")}`, { label: "Bhanero's list" });
    await settleList();
    const rows = await shownRows();
    assert.ok(rows.length && rows.every((no) => accountOfRow(Object.values(DB.receipts).find((r) => r.receiptNo === no).id) === 36), rows.join());
  });

  it("several receipts: checkboxes, Select All, the count and amount, Add Selected, remove before saving; one consolidated invoice is saved and reopens with each receipt's lines", async () => {
    await openNew(2);
    const all = await openList();
    assert.ok(all.includes("IR-B1") && all.includes("R2-1000"), "no account yet: every account's receipts");
    await tick("R2-1000");
    await page.waitFor(`!${ROW("IR-B1")}`, { label: "limited to the first ticked receipt's account" });
    await settleList();
    await tick("IR-A2");
    assert.equal(await txt("[data-testid=source-receipt-count]"), "2 selected · 2,778,280.00");
    // 00000083 is already invoiced (not selectable), so Select All covers the two ticked ones.
    assert.equal(await page.evaluate(`${ROW("00000083")}.querySelector('input').disabled`), true);
    assert.equal(await page.evaluate(`document.querySelector('[data-testid=source-receipt-all]').checked`), true);
    await page.click(`document.querySelector('[data-testid=source-receipt-all]')`);
    assert.equal(await txt("[data-testid=source-receipt-count]"), "0 selected");
    await page.click(`document.querySelector('[data-testid=source-receipt-all]')`);
    assert.equal(await txt("[data-testid=source-receipt-count]"), "2 selected · 2,778,280.00");
    await addSelected();
    await page.waitFor(`document.querySelectorAll('[data-testid=receipt-lines]').length === 2 && document.querySelector('[data-total=grandTotal]')?.textContent === '2,778,280.0000'`, { label: "both receipts' lines" });
    assert.deepEqual(await chips(), ["R2-1000", "IR-A2"]);
    assert.match(await txt("[data-testid=source-receipt-summary]"), /^2 receipts · one consolidated invoice · 2,778,280\.00$/);
    assert.deepEqual(await sections(), ["R2-1000", "IR-A2"]);
    assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('[data-testid=receipt-lines-summary]')].map((s) => s.textContent)`), ["1 line · 1,384,140.0000", "2 lines · 1,394,140.0000"]);
    assert.equal(await val("#inv-document"), "DOC-2", "header from the first receipt");
    // Remove one before saving, then add it back.
    await page.click(`document.querySelector('[aria-label="Remove IR-A2"]')`);
    await page.waitFor(`document.querySelectorAll('[data-testid=receipt-lines]').length === 1 && document.querySelector('[data-total=grandTotal]')?.textContent === '1,384,140.0000'`, { label: "removed" });
    await pickReceipts("IR-A2");
    await page.waitFor(`document.querySelectorAll('[data-testid=receipt-lines]').length === 2`, { label: "added back" });
    await page.click(button("Save"));
    await page.waitFor(`(window.__toasts || []).some((t) => t[1] === 'Invoice created')`, { label: "created" });
    const [, , dto] = (await calls("invoice.create")).at(-1);
    assert.deepEqual([dto.inventoryReceiptIds, dto.inventoryReceiptId, dto.currentAccountId, dto.copyReceiptHeader], [[1000, 1200], 1000, 36, true]);
    const invId = Object.values(await page.evaluate(`window.__db.invoices`)).find((v) => v.inventoryReceiptId === 1000).id;
    await page.evaluate(`window.__open({ receiptType: "2", id: "${invId}" })`);
    await page.sleep(80);
    await page.waitFor(`document.querySelectorAll('[data-testid=receipt-lines]').length === 2 && document.querySelector('[data-total=grandTotal]')?.textContent === '2,778,280.0000'`, { label: "reopened" });
    assert.match(await txt("[data-testid=consolidated-receipts]"), /Consolidated invoice of 2 receipts: R2-1000, IR-A2\./);
    assert.equal(await val("[aria-label='Inventory Receipt']"), "R2-1000, IR-A2");
    assert.equal(await page.evaluate(`document.querySelector('[aria-label="Search Inventory Receipts"]').disabled`), true, "its receipts can't be swapped");
    assert.equal(await page.evaluate(`!!document.querySelector('[data-testid=source-receipt]')`), false);
  });

  it("an already-invoiced receipt can't be ticked; its Open button opens that invoice — no second invoice", async () => {
    await openNew(2);
    await openList();
    assert.equal(await page.evaluate(`${ROW("IR-A2")}.querySelector('input').disabled`), true);
    assert.match(await page.evaluate(`${ROW("IR-A2")}.textContent`), /Invoiced · INV2-\d+ \(open\)/);
    await page.click(`${ROW("IR-A2")}.querySelector('[data-testid=source-receipt-open-invoice]')`);
    await page.waitFor(`!document.querySelector('[data-testid=source-receipt]') && document.querySelectorAll('[data-testid=receipt-lines]').length === 2`, { label: "existing invoice opened" });
    assert.equal((await calls("invoice.create")).length, 0);
    assert.match((await page.evaluate(`window.__toasts`)).find((t) => t[0] === "info")[1], /^Receipt IR-A2 is already on invoice INV2-\d+ — opening it\.$/);
  });

  it("changing the Current Account drops the previous account's receipts", async () => {
    await openNew(2);
    await pickReceipts("IR-B1");
    await page.waitFor(`document.querySelector('[data-master=currentAccount]').value === 'S-0037' && document.querySelectorAll('[data-testid=receipt-lines]').length === 1`, { label: "Zain's receipt" });
    await selectAccount(36);
    await page.waitFor(`!!document.querySelector('[data-testid=no-receipt]')`, { label: "receipts cleared" });
    assert.deepEqual(await chips(), []);
    assert.equal(await val("[aria-label='Inventory Receipt']"), "");
    assert.match((await page.evaluate(`window.__toasts`)).find((t) => t[0] === "info")[1], /Receipts of Zain Industries were removed/);
  });

  it("the Integration → Inventory Receipt list is limited to the invoice's Current Account (the reported zain industries case)", async () => {
    await openNew(11);
    await selectAccount(37);
    await page.click(`document.querySelector('[aria-label="Search Inventory Receipts"]')`);
    await page.waitFor(`[...document.querySelectorAll('[role=dialog] button')].some((b) => b.textContent.trim() === 'Select')`, { label: "receipt lookup" });
    const rows = await page.evaluate(`[...document.querySelectorAll('[role=dialog] tbody tr')].map((tr) => tr.textContent)`);
    assert.equal(rows.length, 1);
    assert.match(rows[0], /OPR-B1.*Zain Industries/);
    assert.deepEqual((await calls("receiptCandidates")).at(-1), ["receiptCandidates", 11, 37]);
    await page.press("Escape");
  });

  it("no eligible receipts: a clear message in the list, and Save is refused", async () => {
    await page.evaluate(`window.__savedLines = window.__db.lines[1017]; window.__db.lines[1017] = [];`); // type 3's only receipt loses its line
    await openNew(3);
    assert.deepEqual(await openList(), []);
    assert.match(await txt("[data-testid=source-receipt-empty]"), /No eligible Return Wholesale Receipts\./);
    assert.equal(await page.evaluate(`document.querySelector('[data-testid=source-receipt-add]').disabled`), true);
    await page.click(button("Save"));
    await page.waitFor(`(window.__toasts || []).some((t) => t[0] === 'error')`, { label: "save refused" });
    assert.equal((await page.evaluate(`window.__toasts`)).find((t) => t[0] === "error")[1], "Select the receipts this invoice is for (Source Receipt → Select Receipts).");
    assert.equal((await calls("invoice.create")).length, 0);
    await page.evaluate(`window.__db.lines[1017] = window.__savedLines;`);
  });

  it("(component behavior only — no invoice type has two source types today) a multi-type invoice shows a Receipt Type dropdown of just those types and lists the chosen type's receipts", async () => {
    await page.evaluate(`window.__sourceTypes = { 2: [2, 11] }`);
    await openNew(2);
    await page.waitFor(`!!document.querySelector('[data-testid=source-receipt-type-select]')`, { label: "dropdown" });
    assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('[data-testid=source-receipt-type-select] option')].map((o) => o.textContent)`),
      ["Select a receipt type...", "2 - Purchase Receipt", "11 - Outside Process Receive Receipt"]);
    assert.equal(await page.evaluate(`document.querySelector('[data-testid=source-receipt-open]').disabled`), true, "pick a type first");
    await page.evaluate(`(() => { const s = document.querySelector('[data-testid=source-receipt-type-select]'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, '11'); s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await page.waitFor(`!document.querySelector('[data-testid=source-receipt-open]').disabled`, { label: "type chosen" });
    assert.deepEqual((await openList()).sort(), ["OPR-84", "OPR-B1", "R11-1005"]);
    await page.evaluate(`window.__sourceTypes = undefined`);
  });
});
