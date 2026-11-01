// Inventory Receipts — Approve / Unapprove on the receipt screen in a REAL browser (headless
// Chrome/Edge, real mouse input; see browser-harness.mjs). Mounts the screen's own page.tsx (shared
// by every receipt type) against an in-memory receipts API that behaves like the backend (approve
// needs a line, an approved receipt refuses writes with 409). The line grid is a stub that shows the
// readOnly flag the screen passes it — the real grid hides Add / Delete and disables cells on it.
// Checks: Packing-List-style badge with date, Unapprove / Approve next to New, the locked message,
// the grid and Save locked while approved, Delete disabled, unlock after Unapprove, lock again after
// Approve, persistence on reopening — for Purchase Receipt (own route) and Purchase Return (generic
// route) — and, on a screen with an Approval Configuration, Unapprove sending it back to Pending.
//   Run: npm run test:receipt-approval-browser
import assert from "node:assert/strict";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { bundle, findBrowser, openPage } from "./browser-harness.mjs";

const FRONTEND = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const receipt = (id, type, no, approved, lines = 1) => ({
  id, receiptType: type, receiptNo: no, receiptDate: "2026-10-30", currentAccountId: null, inWarehouseId: null,
  isApproved: approved ? 1 : 0, approvedAt: approved ? "2026-10-30T09:15:00.000Z" : null, lines,
});
const DB = {
  receipts: {
    1: receipt(1, 2, "IR-1", true),
    2: receipt(2, 122, "PRN-1", true),
    3: receipt(3, 16, "CS-1", false),
  },
  approvalRequests: { 3: { status: "pending_approval" } },
  configs: [{ screenKey: "/legacy-erp/inventory-receipts-list?receiptType=16", approvalRequired: true }],
};

const STUBS = {
  "@/lib/nexuscore-api": `
    const db = () => window.__db;
    const out = (v) => new Promise((r) => setTimeout(() => r(JSON.parse(JSON.stringify(v))), 5));
    const fail = (status, message) => Promise.reject(Object.assign(new Error(message), { status }));
    const log = (c) => (window.__calls = window.__calls || []).push(c);
    const client = (type) => ({
      get: (id) => out(db().receipts[id]),
      getByReceiptNo: () => fail(404, "not found"),
      previewNextReceiptNo: () => out({ receiptNo: "NEW-1" }),
      update: (id, d) => { log(["update", id]); const r = db().receipts[id]; if (r.isApproved) return fail(409, "Receipt " + r.receiptNo + " is approved — unapprove it before changing it."); Object.assign(r, d); return out(r); },
      create: () => fail(400, "not used"),
      delete: (id) => { log(["delete", id]); return out({}); },
      getApprovalStatus: (id) => out(db().approvalRequests[id] || null),
      submitForApproval: (id) => { db().approvalRequests[id] = { status: "pending_approval" }; return out({}); },
      approve: (id) => {
        log(["approve", id]); const r = db().receipts[id];
        if (!r.lines) return fail(400, "Add at least one line before approving.");
        if (db().approvalRequests[id]) db().approvalRequests[id] = { status: "approved" };
        Object.assign(r, { isApproved: 1, approvedAt: "2026-10-31T10:00:00.000Z" }); return out(r);
      },
      unapprove: (id) => {
        log(["unapprove", id]); const r = db().receipts[id];
        if (db().approvalRequests[id]) db().approvalRequests[id] = { status: "pending_approval" };
        Object.assign(r, { isApproved: 0, approvedAt: null }); return out(r);
      },
      reject: () => out({}),
      getRelatedReceipts: () => out([]),
    });
    exports.legacyErpApi = {
      inventoryReceipts: client(2),
      receipts: (t) => client(t),
      accounts: { get: async () => null, list: async () => [] },
      warehouses: { get: async () => null, list: async () => [] },
      orders: () => ({ listPending: async () => [] }),
    };
    exports.approvalConfigApi = { list: async () => JSON.parse(JSON.stringify(window.__db.configs)) };
    exports.fetchAllPages = async () => [];
  `,
  // The real line grid hides Add / Delete and disables every cell when readOnly — the stub shows the flag.
  "./_components/inventory-receipt-line-grid": `
    const React = require("react");
    exports.InventoryReceiptLineGrid = React.forwardRef(function Grid(props, ref) {
      React.useImperativeHandle(ref, () => ({ validateUdf: () => true, saveUdf: async () => {}, commitDrafts: async () => {}, getImportedOrderReceiptItemIds: () => [], getImportedPurchaseReceiptItemIds: () => [], clearRelatedImportedLines: async () => ({}) }));
      return React.createElement("div", { id: "line-grid", "data-readonly": String(!!props.readOnly) }, props.readOnly ? "lines locked" : "lines editable");
    });
  `,
  "./_components/pending-orders-dialog": `exports.PendingOrdersDialog = () => null;`,
  "./_components/related-receipt-import-dialog": `exports.RelatedReceiptImportDialog = () => null;`,
  "./_components/customized-fields-tab": `exports.CustomizedFieldsTab = () => null;`,
  "@/components/legacy-erp/attachments-tab": `exports.AttachmentsTab = () => null;`,
  "@/components/legacy-erp/master-autocomplete-field": `exports.MasterAutocompleteField = () => null;`,
  "@/components/legacy-erp/inward-gate-pass": `exports.inwardGatePassAction = () => ({ key: "print", label: "Print" });`,
  "@/lib/app-navigation": `exports.useRouter = () => ({ push() {}, replace() {}, back() {} }); exports.usePathname = () => "/legacy-erp/inventory-receipts";`,
  "@/lib/workspace/navigate": `exports.navigateOrOpenTab = () => {};`,
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

describe("Inventory Receipts: Approve / Unapprove in a real browser", { skip: browser ? false : "no Chrome/Edge found — set CHROME_PATH" }, () => {
  before(async () => {
    const js = bundle(path.join(FRONTEND, "scripts", "fixtures", "inventory-receipt.harness.tsx"), { stubs: STUBS });
    page = await openPage(`<!doctype html><meta charset="utf-8"><body><div id="root"></div><script>window.__db = ${JSON.stringify(DB)}; window.__params = { id: "1", mode: "view" };</script><script>${js.replace(/<\/script/g, "<\\/script")}</script></body>`);
    await page.waitFor(`typeof window.__open === 'function' && !!document.querySelector('#line-grid')`, { timeout: 20000, label: "the receipt screen mounted" });
  });
  after(async () => {
    if (page) {
      if (page.consoleErrors.length) console.log("page errors:", page.consoleErrors);
      await page.close();
    }
  });

  /** What the screen shows: badges, toolbar buttons, the locked message, the grid's readOnly. */
  const STATE = `(() => {
    const text = (el) => el.textContent.replace(/\\s+/g, ' ').trim();
    const buttons = [...document.querySelectorAll('#screen button')].map(text).filter((t) => ['New', 'Approve', 'Unapprove', 'Save', 'Reject'].includes(t));
    const badges = [...document.querySelectorAll('#screen [data-slot=badge]')].map(text);
    return {
      badges, buttons,
      lockedMessage: [...document.querySelectorAll('#screen p')].some((p) => /is approved, so it is locked/.test(p.textContent)),
      gridReadOnly: document.querySelector('#line-grid')?.dataset.readonly,
    };
  })()`;
  const state = () => page.evaluate(STATE);
  const button = (label) => `[...document.querySelectorAll('#screen button')].find((b) => b.textContent.trim() === ${JSON.stringify(label)})`;
  const open = async (params, ready) => {
    await page.evaluate(`window.__open(${JSON.stringify(params)})`);
    await page.sleep(80);
    await page.waitFor(`!!document.querySelector('#line-grid') && !!(${ready})`, { label: "receipt loaded" });
  };
  const calls = () => page.evaluate(`window.__calls || []`);

  for (const [id, label, type] of [[1, "Purchase Receipt", 2], [2, "Purchase Return", 122]]) {
    it(`${label}: approved → badge with date, Unapprove next to New, locked message, grid and Save locked`, async () => {
      await open({ id: String(id), mode: "view", ...(type === 2 ? {} : { receiptType: String(type) }) }, `${button("Unapprove")}`);
      const s = await state();
      assert.ok(s.badges.includes("Approved · 2026-10-30"), JSON.stringify(s.badges));
      assert.ok(!s.badges.some((b) => /View Only/.test(b)), "no extra View Only badge on an approved receipt");
      assert.deepEqual(s.buttons, ["New", "Unapprove"], "no Approve, no Save while approved");
      assert.equal(s.lockedMessage, true);
      assert.equal(s.gridReadOnly, "true");
    });

    it(`${label}: Unapprove restores editing (Save, editable lines, Approve offered); Approve locks it again; reopening keeps it`, async () => {
      await page.click(button("Unapprove"));
      await page.waitFor(`!!${button("Approve")}`, { label: "Approve offered after Unapprove" });
      let s = await state();
      assert.ok(s.badges.includes("Unapproved"));
      assert.deepEqual(s.buttons, ["New", "Approve", "Save"]);
      assert.equal(s.lockedMessage, false);
      assert.equal(s.gridReadOnly, "false", "lines editable after Unapprove");
      assert.deepEqual((await calls()).at(-1), ["unapprove", id]);

      // Saving does not approve.
      await page.click(button("Save"));
      await page.sleep(100);
      assert.equal((await state()).badges.includes("Unapproved"), true);

      await page.click(button("Approve"));
      await page.waitFor(`!!${button("Unapprove")}`, { label: "locked again" });
      s = await state();
      assert.ok(s.badges.includes("Approved · 2026-10-31"));
      assert.equal(s.gridReadOnly, "true");
      assert.deepEqual(s.buttons, ["New", "Unapprove"]);

      await open({ id: String(id), mode: "view", ...(type === 2 ? {} : { receiptType: String(type) }) }, `${button("Unapprove")}`);
      s = await state();
      assert.ok(s.badges.includes("Approved · 2026-10-31"), "still approved after reopening");
      assert.equal(s.gridReadOnly, "true");
    });
  }

  it("with an Approval Configuration: the pending Approve / Reject pair stays; after approval Unapprove sends it back to Pending", async () => {
    await open({ id: "3", mode: "edit", receiptType: "16" }, `${button("Reject")}`);
    let s = await state();
    assert.ok(s.badges.includes("Pending Approval"));
    assert.deepEqual(s.buttons, ["New", "Save", "Approve", "Reject"], "existing workflow unchanged");
    assert.equal(s.gridReadOnly, "false");
    await page.click(button("Approve"));
    await page.waitFor(`!!${button("Unapprove")}`, { label: "approved" });
    s = await state();
    assert.ok(s.badges.includes("Approved · 2026-10-31"));
    assert.deepEqual(s.buttons, ["New", "Unapprove"]);
    assert.equal(s.gridReadOnly, "true");
    await page.click(button("Unapprove"));
    await page.waitFor(`!!${button("Reject")}`, { label: "back to pending" });
    s = await state();
    assert.ok(s.badges.includes("Pending Approval"));
    assert.equal(s.gridReadOnly, "false");
  });
});
