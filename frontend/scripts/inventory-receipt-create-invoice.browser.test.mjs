// Inventory Receipt → right-click → Create Invoice, in a REAL browser (headless Chrome/Edge, real
// right-click; see browser-harness.mjs). Mounts the screen's own page.tsx (shared by every receipt
// type) against an in-memory API: the receipts client, and an invoices client whose
// createFromReceipt behaves like the backend (existing invoice → created: false; a receipt without
// lines → 400). Checks: the existing menu actions are all still there, in order, with Create Invoice
// added before Delete; clicking it asks THIS receipt's type for THIS receipt's invoice and opens it on
// that type's invoice screen; a repeat opens the existing invoice; an ineligible receipt shows the
// reason and opens nothing; an unsaved receipt can't create one.
//   Run: npm run test:receipt-create-invoice-browser
import assert from "node:assert/strict";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { bundle, findBrowser, openPage } from "./browser-harness.mjs";

const FRONTEND = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const receipt = (id, type, no, lines) => ({ id, receiptType: type, receiptNo: no, receiptDate: "2026-08-23", currentAccountId: null, inWarehouseId: null, isApproved: 0, lines });
const DB = {
  receipts: { 9: receipt(9, 2, "IR-9", 1), 10: receipt(10, 11, "OPR-4", 2), 11: receipt(11, 2, "IR-11", 0) },
  invoices: {}, nextInvoice: 500,
};

const STUBS = {
  "@/lib/nexuscore-api": `
    const db = () => window.__db;
    const out = (v) => new Promise((r) => setTimeout(() => r(JSON.parse(JSON.stringify(v))), 5));
    const fail = (status, message) => Promise.reject(Object.assign(new Error(message), { status }));
    const log = (c) => (window.__calls = window.__calls || []).push(c);
    const client = () => ({
      get: (id) => out(db().receipts[id]),
      getByReceiptNo: () => fail(404, "not found"),
      previewNextReceiptNo: () => out({ receiptNo: "NEW-1" }),
      update: (id, d) => out(Object.assign(db().receipts[id], d)),
      create: () => fail(400, "not used"),
      delete: () => out({}),
      getApprovalStatus: () => out(null),
      approve: () => out({}), unapprove: () => out({}), reject: () => out({}), submitForApproval: () => out({}),
      getRelatedReceipts: () => out([]),
    });
    exports.legacyErpApi = {
      inventoryReceipts: client(),
      receipts: () => client(),
      accounts: { get: async () => null, list: async () => [] },
      warehouses: { get: async () => null, list: async () => [] },
      orders: () => ({ listPending: async () => [] }),
      invoices: (type) => ({
        createFromReceipt: (receiptId) => {
          log(["createFromReceipt", type, receiptId]);
          const r = db().receipts[receiptId];
          if (!r || r.receiptType !== type) return fail(400, "Receipt is not of this type");
          if (!r.lines) return fail(400, "Receipt " + r.receiptNo + " has no lines — add at least one line before creating its invoice.");
          const existing = db().invoices[receiptId];
          if (existing) return out({ created: false, receiptType: type, invoice: existing });
          const inv = { id: db().nextInvoice++, receiptNo: "INV" + type + "-0000000" + receiptId, inventoryReceiptId: receiptId };
          db().invoices[receiptId] = inv;
          return out({ created: true, receiptType: type, invoice: inv });
        },
      }),
    };
    exports.approvalConfigApi = { list: async () => [] };
    exports.fetchAllPages = async () => [];
  `,
  "./_components/inventory-receipt-line-grid": `
    const React = require("react");
    exports.InventoryReceiptLineGrid = React.forwardRef(function Grid(props, ref) {
      React.useImperativeHandle(ref, () => ({ validateUdf: () => true, saveUdf: async () => {}, commitDrafts: async () => {}, getImportedOrderReceiptItemIds: () => [], getImportedPurchaseReceiptItemIds: () => [], clearRelatedImportedLines: async () => ({}) }));
      return React.createElement("div", { id: "line-grid", style: { height: 120 } }, "lines");
    });
  `,
  "./_components/pending-orders-dialog": `exports.PendingOrdersDialog = () => null;`,
  "./_components/related-receipt-import-dialog": `exports.RelatedReceiptImportDialog = () => null;`,
  "./_components/customized-fields-tab": `exports.CustomizedFieldsTab = () => null;`,
  "@/components/legacy-erp/attachments-tab": `exports.AttachmentsTab = () => null;`,
  "@/components/legacy-erp/master-autocomplete-field": `exports.MasterAutocompleteField = () => null;`,
  "@/lib/app-navigation": `exports.useRouter = () => ({ push() {}, replace() {}, back() {} }); exports.usePathname = () => "/legacy-erp/inventory-receipts";`,
  "@/lib/workspace/navigate": `exports.navigateOrOpenTab = (_router, href) => (window.__nav = window.__nav || []).push(href);`,
  "@/hooks/use-workspace-search-params": `exports.useWorkspaceSearchParams = () => { const p = window.__params || {}; return { get: (k) => (p[k] ?? null) }; };`,
  "@/hooks/use-workspace-dirty": `exports.useWorkspaceDirty = () => {};`,
  "@/hooks/use-workspace-tab-title": `exports.useWorkspaceTabTitle = () => {}; exports.useWorkspaceRecordLabel = () => {};`,
  "@/hooks/use-workspace-record-id": `exports.useWorkspaceRecordId = () => {};`,
  "@/hooks/legacy-erp/use-draft-form": `exports.useDraftForm = () => ({ clearDraft: () => {} });`,
  "@/hooks/use-decimal-parameters": `const api = { round: (v) => Number(v), format: (v) => String(v), ensureLoaded: () => {}, refresh: () => {}, loaded: true, loading: false };
    exports.useDecimalParameters = () => api;`,
  "@/lib/api": `exports.settingsApi = { getCurrentSettings: async () => ({}), updateCurrentSettings: async () => ({}) };`,
  sonner: `const t = (kind) => (m) => (window.__toasts = window.__toasts || []).push([kind, String(m)]);
    const toast = Object.assign(t("default"), { success: t("success"), error: t("error"), info: t("info"), warning: t("warning"), message: t("message") });
    exports.toast = toast; exports.Toaster = () => null;`,
};

const browser = findBrowser();
let page;

describe("Inventory Receipt: right-click → Create Invoice in a real browser", { skip: browser ? false : "no Chrome/Edge found — set CHROME_PATH" }, () => {
  before(async () => {
    const js = bundle(path.join(FRONTEND, "scripts", "fixtures", "inventory-receipt.harness.tsx"), { stubs: STUBS });
    page = await openPage(`<!doctype html><meta charset="utf-8"><body><div id="root"></div><script>window.__db = ${JSON.stringify(DB)}; window.__params = { id: "9", mode: "edit" };</script><script>${js.replace(/<\/script/g, "<\\/script")}</script></body>`);
    await page.waitFor(`typeof window.__open === 'function' && !!document.querySelector('#line-grid')`, { timeout: 20000, label: "the receipt screen mounted" });
  });
  after(async () => {
    if (page) {
      if (page.consoleErrors.length) console.log("page errors:", page.consoleErrors);
      await page.close();
    }
  });

  const open = async (params) => {
    await page.evaluate(`window.__open(${JSON.stringify(params)}); window.__nav = []; window.__toasts = []; window.__calls = [];`);
    await page.sleep(80);
    await page.waitFor(`!!document.querySelector('#line-grid')`, { label: "receipt loaded" });
    await page.sleep(150);
  };
  /** Right-click the receipt (its line area) and read the menu: [label, disabled] in order. */
  const menu = async () => {
    await page.press("Escape");
    await page.click(`document.querySelector('#line-grid')`, { button: "right" });
    await page.waitFor(`document.querySelectorAll('[role=menuitem]').length > 0`, { label: "context menu open" });
    return page.evaluate(`[...document.querySelectorAll('[role=menu] > [role=menuitem]')].map((e) => [e.textContent.replace(/\\s+/g, ' ').trim(), e.getAttribute('aria-disabled') === 'true' || e.hasAttribute('data-disabled')])`);
  };
  const clickItem = (label) => page.click(`[...document.querySelectorAll('[role=menuitem]')].find((e) => e.textContent.trim() === ${JSON.stringify(label)})`);
  const settle = () => page.waitFor(`(window.__nav || []).length > 0 || (window.__toasts || []).some((t) => t[0] === 'error')`, { label: "action finished" });

  it("the existing menu is unchanged, with Create Invoice added just before Delete", async () => {
    await open({ id: "9", mode: "edit" });
    const items = (await menu()).map(([l]) => l);
    assert.deepEqual(items, ["Save", "Print", "Close Order", "Open Order", "Pending Orders", "Create Invoice", "Delete"], JSON.stringify(items));
    await page.press("Escape");
  });

  it("Create Invoice creates this receipt's invoice and opens it on the Purchase Receipt invoice screen", async () => {
    await open({ id: "9", mode: "edit" });
    const items = await menu();
    assert.deepEqual(items.find(([l]) => l === "Create Invoice"), ["Create Invoice", false]);
    await clickItem("Create Invoice");
    await settle();
    assert.deepEqual(await page.evaluate(`window.__calls`), [["createFromReceipt", 2, 9]]);
    assert.deepEqual(await page.evaluate(`window.__nav`), ["/legacy-erp/receipt-invoices?receiptType=2&id=500"]);
    assert.deepEqual(await page.evaluate(`window.__toasts`), [["success", "Invoice INV2-00000009 created"]]);
  });

  it("repeating it opens the existing invoice instead of creating another", async () => {
    await open({ id: "9", mode: "edit" });
    await menu();
    await clickItem("Create Invoice");
    await settle();
    assert.deepEqual(await page.evaluate(`window.__nav`), ["/legacy-erp/receipt-invoices?receiptType=2&id=500"]);
    assert.equal((await page.evaluate(`window.__toasts`))[0][0], "info");
    assert.equal(Object.keys(await page.evaluate(`window.__db.invoices`)).length, 1, "still one invoice");
  });

  it("another receipt type opens its own invoice screen (Outside Process Receive → type 11)", async () => {
    await open({ id: "10", mode: "edit", receiptType: "11" });
    await menu();
    await clickItem("Create Invoice");
    await settle();
    assert.deepEqual(await page.evaluate(`window.__calls`), [["createFromReceipt", 11, 10]]);
    assert.deepEqual(await page.evaluate(`window.__nav`), ["/legacy-erp/receipt-invoices?receiptType=11&id=501"]);
  });

  it("an ineligible receipt shows why and opens nothing", async () => {
    await open({ id: "11", mode: "edit" });
    await menu();
    await clickItem("Create Invoice");
    await settle();
    assert.deepEqual(await page.evaluate(`window.__nav`), []);
    assert.deepEqual(await page.evaluate(`window.__toasts`), [["error", "Receipt IR-11 has no lines — add at least one line before creating its invoice."]]);
  });

  it("a new, unsaved receipt can't create an invoice (item disabled)", async () => {
    await open({ mode: "create" });
    const items = await menu();
    assert.deepEqual(items.find(([l]) => l === "Create Invoice"), ["Create Invoice", true]);
    await page.press("Escape");
  });
});
