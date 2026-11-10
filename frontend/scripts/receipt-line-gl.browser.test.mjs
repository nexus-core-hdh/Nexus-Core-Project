// Receipt line grid → Account Code / Account Name (IM_ReceiptItem.GLAccountId → GL_Account) in a REAL
// browser (headless Chrome/Edge, real mouse/keyboard input; see browser-harness.mjs). Mounts the real
// line grid (shared by every receipt type, and read-only by Receipt Invoices) against in-memory APIs
// shaped like the backend: lines carry glAccountId/glAccountCode/glAccountName; the Chart of Accounts
// list (legacyErpApi.glAccounts.list) includes an inactive account. Checks: each line shows its own
// account (and a historical inactive one); "—" for none; the typeahead lists only active accounts as
// "Code — Name", searches by code or name, and a pick saves the account RecId and fills both columns;
// unmatched text is refused and nothing is saved; × clears; the search icon opens the Chart of
// Accounts in selection mode and its pick lands on the right line; read-only grids show the account
// but offer no picker. No database is used.
//   Run: npm run test:receipt-line-gl-browser
import assert from "node:assert/strict";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { bundle, findBrowser, openPage } from "./browser-harness.mjs";

const FRONTEND = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const GL = [
  { id: 11, accountCode: "01", accountName: "test", inUse: true },
  { id: 12, accountCode: "02-01", accountName: "Trade Payables", inUse: true },
  { id: 13, accountCode: "03", accountName: "Closed", inUse: false },
];
const line = (id, order, glAccountId) => ({ id, itemOrderNo: order, inventoryId: 71, quantity: 20, unitPrice: 600, explanation: `line ${order}`, glAccountId });
const DB = { gl: GL, lines: [line(1, 1, 11), line(2, 2, null), line(3, 3, 13)] };

const STUBS = {
  "@/lib/nexuscore-api": `
    const out = (v) => new Promise((r) => setTimeout(() => r(JSON.parse(JSON.stringify(v))), 5));
    const log = (c) => (window.__calls = window.__calls || []).push(c);
    const anything = () => new Proxy(function () { return Promise.resolve([]); }, { get: (t, k) => (k === "then" ? undefined : anything()) });
    const loose = (target) => new Proxy(target, { get: (t, k) => (k in t ? t[k] : typeof k === "string" ? anything() : undefined) });
    exports.legacyErpApi = loose({
      glAccounts: { list: () => { log(["glAccounts.list"]); return out(window.__db.gl); } },
      inventoryCards: loose({ list: () => out({ rows: [{ id: 71, inventoryCode: "YRN-071", inventoryName: "30/1 CVC R", stockOnHand: 3.2 }], total: 1 }) }),
    });
    exports.plmApi = loose({});
    exports.fetchAllPages = async (fetchPage) => { const r = await fetchPage({ page: 1, pageSize: 500 }); return (r && r.rows) || []; };
  `,
  "@/lib/api": `exports.settingsApi = { getCurrentSettings: async () => ({ tablePreferences: {} }), updateCurrentSettings: async () => ({}) };`,
  "@/lib/auth": `exports.getCurrentUser = () => ({ id: "u1", name: "Tester" });`,
  "@/hooks/use-grid-udf": `exports.isUdfColumnKey = () => false;
    exports.useGridUdf = () => ({ fields: [], columnDefs: [], fieldForColumn: () => undefined, valueOf: () => undefined, setValue() {}, isMissing: () => false, dirty: false, validate: () => true, save: async () => true });`,
  "@/hooks/use-decimal-parameters": `const api = { round: (v) => Math.round(Number(v) * 1e4) / 1e4, format: (v) => String(v), ensureLoaded: () => {}, refresh: () => {}, loaded: true, loading: false };
    exports.useDecimalParameters = () => api;`,
  // The Chart of Accounts selection hand-off: window.__glReturn(selection) is what the Chart of
  // Accounts tab calls back with when the user picks an account there.
  "@/hooks/use-master-lookup-field": `exports.useMasterLookupField = (key, cb, path) => {
      window.__glReturn = cb;
      return { openFullScreen: () => (window.__calls = window.__calls || []).push(["openFullScreen", key, path]) };
    };`,
  "@/lib/app-navigation": `exports.useRouter = () => ({ push() {}, replace() {}, back() {} }); exports.usePathname = () => "/legacy-erp/inventory-receipts";`,
  "@/lib/workspace/navigate": `exports.navigateOrOpenTab = () => {};`,
  sonner: `const t = (kind) => (m) => (window.__toasts = window.__toasts || []).push([kind, String(m)]);
    const toast = Object.assign(t("default"), { success: t("success"), error: t("error"), info: t("info"), warning: t("warning"), message: t("message") });
    exports.toast = toast; exports.Toaster = () => null;`,
};

const browser = findBrowser();
let page;

describe("Receipt line grid GL account in a real browser", { skip: browser ? false : "no Chrome/Edge found — set CHROME_PATH" }, () => {
  // Cell of a line (by its explanation) for a column.
  const cell = (n, col) => `[...document.querySelectorAll('#screen tbody tr')].find((tr) => tr.textContent.includes('line ${n}'))?.querySelector('[data-col="${col}"]')`;
  const cellText = (n, col) => page.evaluate(`(${cell(n, col)})?.textContent.trim()`);
  const cellBox = (n, col) => `(${cell(n, col)})?.closest('[role=gridcell]')`;
  const options = () => page.evaluate(`[...document.querySelectorAll('[role=listbox] [role=option]')].map((o) => o.textContent.trim())`);
  const updates = () => page.evaluate(`(window.__calls || []).filter((c) => c[0] === 'updateItem')`);
  const open = async (params = {}) => {
    await page.evaluate(`window.__db = ${JSON.stringify(DB)}; window.__calls = []; window.__toasts = []; document.querySelector('#screen tbody')?.setAttribute('data-old', '1'); window.__open(${JSON.stringify(params)})`);
    await page.waitFor(`(() => { const tb = document.querySelector('#screen tbody'); return !!tb && !tb.hasAttribute('data-old') && /line 3/.test(tb.textContent); })()`, { timeout: 10000, label: "grid loaded" });
  };

  before(async () => {
    const js = bundle(path.join(FRONTEND, "scripts", "fixtures", "receipt-line-gl.harness.tsx"), { stubs: STUBS });
    page = await openPage(`<!doctype html><meta charset="utf-8"><body><div id="root"></div><script>window.__db = ${JSON.stringify(DB)};</script><script>${js.replace(/<\/script/g, "<\\/script")}</script></body>`);
    await page.waitFor(`typeof window.__open === 'function' && /line 3/.test(document.querySelector('#screen tbody')?.textContent || '')`, { timeout: 20000, label: "grid mounted" });
  });
  after(async () => {
    if (page) {
      if (page.consoleErrors.length) console.log("page errors:", page.consoleErrors);
      await page.close();
    }
  });

  it("each line shows its own GL account (historical inactive one too); none shows empty / —", async () => {
    await open();
    assert.deepEqual([await cellText(1, "accountCode"), await cellText(1, "accountName")], ["01", "test"]);
    assert.deepEqual([await cellText(2, "accountCode"), await cellText(2, "accountName")], ["", "—"]);
    assert.deepEqual([await cellText(3, "accountCode"), await cellText(3, "accountName")], ["03", "Closed"]);
    assert.ok(await page.evaluate(`!!(${cellBox(2, "accountCode")}).querySelector('button[aria-label="Open Chart of Accounts"]')`), "search icon on an editable line");
  });

  it("typeahead lists active accounts as Code — Name, searches by code and name; a pick saves the RecId and fills both columns", async () => {
    await open();
    await page.click(cell(2, "accountCode"));
    await page.waitFor(`document.querySelectorAll('[role=listbox] [role=option]').length > 0`, { label: "options open" });
    assert.deepEqual(await options(), ["01 — test", "02-01 — Trade Payables"], "inactive account not offered");
    await page.type("02-");
    await page.waitFor(`document.querySelectorAll('[role=listbox] [role=option]').length === 1`, { label: "code search" });
    assert.deepEqual(await options(), ["02-01 — Trade Payables"]);
    await page.evaluate(`(() => { const i = document.activeElement; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ''); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await page.type("payab");
    await page.waitFor(`[...document.querySelectorAll('[role=listbox] [role=option]')].map((o) => o.textContent.trim()).join('|') === '02-01 — Trade Payables'`, { label: "name search" });
    await page.click(`[...document.querySelectorAll('[role=listbox] [role=option]')].find((o) => o.textContent.trim() === '02-01 — Trade Payables')`);
    await page.waitFor(`(${cell(2, "accountCode")})?.textContent.trim() === '02-01'`, { label: "code shown" });
    assert.equal(await cellText(2, "accountName"), "Trade Payables");
    await page.waitFor(`(window.__calls || []).some((c) => c[0] === 'updateItem')`, { label: "saved" });
    assert.deepEqual((await updates()).at(-1), ["updateItem", 2, { glAccountId: 12 }]);
    assert.deepEqual([await cellText(1, "accountCode"), await cellText(3, "accountCode")], ["01", "03"], "other lines untouched");
  });

  it("unmatched text is refused: nothing saved, the line keeps its account", async () => {
    await open();
    await page.click(cell(1, "accountCode"));
    await page.waitFor(`document.activeElement && document.activeElement.tagName === 'INPUT'`);
    await page.evaluate(`(() => { const i = document.activeElement; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ''); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await page.type("zzz");
    await page.press("Enter");
    await page.waitFor(`(window.__toasts || []).some((t) => t[0] === 'error')`, { label: "error toast" });
    assert.match((await page.evaluate(`window.__toasts`)).at(-1)[1], /No active GL account matches "zzz"/);
    assert.deepEqual([await cellText(1, "accountCode"), await cellText(1, "accountName")], ["01", "test"]);
    assert.deepEqual(await updates(), []);
  });

  it("× clears the account (saved as null)", async () => {
    await open();
    await page.click(`(${cellBox(1, "accountCode")}).querySelector('button[aria-label="Clear GL Account"]')`);
    await page.waitFor(`(${cell(1, "accountName")})?.textContent.trim() === '—'`, { label: "cleared" });
    assert.equal(await cellText(1, "accountCode"), "");
    await page.waitFor(`(window.__calls || []).some((c) => c[0] === 'updateItem')`);
    assert.deepEqual((await updates()).at(-1), ["updateItem", 1, { glAccountId: null }]);
  });

  it("search icon opens the Chart of Accounts in selection mode; the account picked there lands on that line", async () => {
    await open();
    await page.click(`(${cellBox(2, "accountCode")}).querySelector('button[aria-label="Open Chart of Accounts"]')`);
    assert.deepEqual((await page.evaluate(`window.__calls`)).find((c) => c[0] === "openFullScreen"), ["openFullScreen", "gl-account", "/finance-erp/general-ledger/chart-of-accounts"]);
    assert.equal(await page.evaluate(`document.querySelectorAll('[role=listbox]').length`), 0, "the icon doesn't open the inline typeahead");
    await page.evaluate(`window.__glReturn({ id: 11, code: "01", name: "test" })`);
    await page.waitFor(`(${cell(2, "accountCode")})?.textContent.trim() === '01'`, { label: "picked from Chart of Accounts" });
    assert.equal(await cellText(2, "accountName"), "test");
    await page.waitFor(`(window.__calls || []).some((c) => c[0] === 'updateItem')`);
    assert.deepEqual((await updates()).at(-1), ["updateItem", 2, { glAccountId: 11 }]);
  });

  it("read-only grid (approved receipt / invoice view): accounts shown, no picker, no Chart of Accounts load", async () => {
    await open({ readOnly: true });
    assert.deepEqual([await cellText(1, "accountCode"), await cellText(1, "accountName"), await cellText(2, "accountCode")], ["01", "test", "—"]);
    assert.equal(await page.evaluate(`document.querySelectorAll('#screen button[aria-label="Open Chart of Accounts"]').length`), 0);
    assert.ok(!(await page.evaluate(`window.__calls`)).some((c) => c[0] === "glAccounts.list"));
    await page.click(cell(1, "accountCode"));
    assert.equal(await page.evaluate(`document.querySelectorAll('[role=listbox]').length`), 0);
  });
});
