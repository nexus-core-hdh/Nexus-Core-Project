// Current Account card → Customer / Supplier GL Account Code in a REAL browser (headless Chrome/Edge,
// real mouse/keyboard input; see browser-harness.mjs). Mounts the real card against an in-memory API
// that behaves like the backend: accounts.get/update (FI_Account ids), lookupTable("gl-account", term)
// searching active accounts by code OR name (legacy-master-lookup.service.ts search()), and
// lookupTableGet resolving a saved id. Checks: dropdown rows read "Code — Name" (name only when an
// account has no code); search by code and by name; a pick shows "Code — Name" and saves the RecId;
// both fields are independent; reopening the record shows both saved accounts. No database is used.
//   Run: npm run test:current-account-gl-browser
import assert from "node:assert/strict";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { bundle, findBrowser, openPage } from "./browser-harness.mjs";

const FRONTEND = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const DB = {
  account: { id: 1, currentAccountCode: "CS-900", currentAccountName: "Harness Party", currentAccountType: 0, inUse: true, customerGLAccountId: null, supplierGLAccountId: null },
  gl: [
    { id: 11, code: "01", name: "test", active: true },
    { id: 12, code: "02-01", name: "Trade Payables", active: true },
    { id: 13, code: "03", name: "Closed", active: false },
    { id: 14, code: null, name: "No Code Account", active: true },
  ],
};

const STUBS = {
  "@/lib/nexuscore-api": `
    const db = () => window.__db;
    const out = (v) => new Promise((r) => setTimeout(() => r(JSON.parse(JSON.stringify(v))), 5));
    const log = (c) => (window.__calls = window.__calls || []).push(c);
    const opt = (g) => ({ id: g.id, code: g.code, name: g.name });
    exports.legacyErpApi = {
      accounts: {
        get: (id) => { log(["get", id]); return out(db().account); },
        update: (id, d) => {
          log(["update", id, { customerGLAccountId: d.customerGLAccountId, supplierGLAccountId: d.supplierGLAccountId }]);
          const toId = (v) => (v === "" || v == null ? null : Number(v));
          Object.assign(db().account, { customerGLAccountId: toId(d.customerGLAccountId), supplierGLAccountId: toId(d.supplierGLAccountId) });
          return out(db().account);
        },
      },
      lookupTable: (key, term) => {
        log(["lookupTable", key, term || ""]);
        const t = (term || "").toLowerCase();
        return out(db().gl.filter((g) => g.active && (!t || (g.code || "").toLowerCase().includes(t) || g.name.toLowerCase().includes(t))).map(opt));
      },
      lookupTableGet: (key, id) => { log(["lookupTableGet", key, id]); const g = db().gl.find((x) => x.id === id); return out(g ? opt(g) : null); },
    };
  `,
  "@/hooks/legacy-erp/use-draft-form": `exports.useDraftForm = () => ({ clearDraft() {} });`,
  "@/hooks/use-workspace-search-params": `exports.useWorkspaceSearchParams = () => { const p = window.__params || {}; return { get: (k) => (p[k] ?? null) }; };`,
  "@/hooks/use-workspace-record-id": `exports.useWorkspaceRecordId = () => {};`,
  "@/hooks/use-workspace-dirty": `exports.useWorkspaceDirty = () => {};`,
  "@/hooks/use-workspace-tab-title": `exports.useWorkspaceRecordLabel = () => {};`,
  "@/hooks/use-master-lookup-field": `exports.useMasterLookupField = (key, _cb, path) => ({ openFullScreen: () => (window.__calls = window.__calls || []).push(["openFullScreen", key, path]) });`,
  "./_components/satellite-grid-tab": `exports.SatelliteGridTab = () => null;`,
  "./_components/totals-tab": `exports.TotalsTab = () => null;`,
  "./_components/attachments-tab": `exports.AttachmentsTab = () => null;`,
  sonner: `const t = (kind) => (m) => (window.__toasts = window.__toasts || []).push([kind, String(m)]);
    const toast = Object.assign(t("default"), { success: t("success"), error: t("error"), info: t("info"), warning: t("warning"), message: t("message") });
    exports.toast = toast; exports.Toaster = () => null;`,
};

const browser = findBrowser();
let page;

describe("Current Account GL fields in a real browser", { skip: browser ? false : "no Chrome/Edge found — set CHROME_PATH" }, () => {
  const field = (label) => `[...document.querySelectorAll('#screen label')].find((l) => l.textContent.trim() === ${JSON.stringify(label)})?.closest('.space-y-2')?.querySelector('input')`;
  const options = () => page.evaluate(`[...document.querySelectorAll('[role=listbox] button')].map((b) => b.textContent.trim())`);
  const open = async (params) => {
    await page.evaluate(`document.querySelector('#screen input')?.setAttribute('data-old', '1'); window.__calls = []; window.__open(${JSON.stringify(params)})`);
    await page.waitFor(`(() => { const i = document.querySelector('#screen input'); return !!i && !i.hasAttribute('data-old') && (window.__calls || []).some((c) => c[0] === 'get'); })()`, { label: "card loaded" });
  };
  const fieldValue = (label) => page.evaluate(`(${field(label)}).value`);
  const clearAndType = async (label, text) => {
    await page.click(field(label));
    await page.evaluate(`(() => { const el = ${field(label)}; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, ''); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    if (text) await page.type(text);
  };

  before(async () => {
    const js = bundle(path.join(FRONTEND, "scripts", "fixtures", "current-account-gl.harness.tsx"), { stubs: STUBS });
    page = await openPage(`<!doctype html><meta charset="utf-8"><body><div id="root"></div><script>window.__db = ${JSON.stringify(DB)}; window.__params = { id: "1", mode: "edit" };</script><script>${js.replace(/<\/script/g, "<\\/script")}</script></body>`);
    await page.waitFor(`typeof window.__open === 'function' && !!${field("Supplier GL Account Code")}`, { timeout: 20000, label: "card mounted" });
  });
  after(async () => {
    if (page) {
      if (page.consoleErrors.length) console.log("page errors:", page.consoleErrors);
      await page.close();
    }
  });

  it("dropdown rows show Code — Name (name only without a code); inactive accounts are not offered", async () => {
    await open({ id: "1", mode: "edit" });
    await page.click(field("Supplier GL Account Code"));
    await page.waitFor(`document.querySelectorAll('[role=listbox] button').length > 0`, { label: "dropdown open" });
    assert.deepEqual(await options(), ["01 — test", "02-01 — Trade Payables", "No Code Account"]);
  });

  it("search works by account code and by account name", async () => {
    await clearAndType("Supplier GL Account Code", "02-");
    await page.waitFor(`(() => { const o = [...document.querySelectorAll('[role=listbox] button')]; return o.length === 1; })()`, { label: "code search" });
    assert.deepEqual(await options(), ["02-01 — Trade Payables"]);
    await clearAndType("Supplier GL Account Code", "tes");
    await page.waitFor(`(() => { const o = [...document.querySelectorAll('[role=listbox] button')]; return o.length === 1 && /test/.test(o[0].textContent); })()`, { label: "name search" });
    assert.deepEqual(await options(), ["01 — test"]);
  });

  it("picking shows Code — Name in each field independently and saves the account RecId; reopening shows both", async () => {
    await open({ id: "1", mode: "edit" });
    await clearAndType("Customer GL Account Code", "test");
    await page.waitFor(`[...document.querySelectorAll('[role=listbox] button')].some((b) => b.textContent.trim() === '01 — test')`);
    await page.click(`[...document.querySelectorAll('[role=listbox] button')].find((b) => b.textContent.trim() === '01 — test')`);
    await page.waitFor(`(${field("Customer GL Account Code")}).value === '01 — test'`, { label: "customer shows code — name" });
    assert.equal(await fieldValue("Supplier GL Account Code"), "", "supplier untouched");

    await clearAndType("Supplier GL Account Code", "payab");
    await page.waitFor(`[...document.querySelectorAll('[role=listbox] button')].some((b) => b.textContent.trim() === '02-01 — Trade Payables')`);
    await page.click(`[...document.querySelectorAll('[role=listbox] button')].find((b) => b.textContent.trim() === '02-01 — Trade Payables')`);
    await page.waitFor(`(${field("Supplier GL Account Code")}).value === '02-01 — Trade Payables'`, { label: "supplier shows code — name" });
    assert.equal(await fieldValue("Customer GL Account Code"), "01 — test", "customer untouched");

    await page.click(`[...document.querySelectorAll('#screen button')].find((b) => b.textContent.trim() === 'Save')`);
    await page.waitFor(`(window.__calls || []).some((c) => c[0] === 'update')`, { label: "saved" });
    assert.deepEqual((await page.evaluate(`window.__calls`)).find((c) => c[0] === "update"), ["update", 1, { customerGLAccountId: "11", supplierGLAccountId: "12" }]);

    await open({ id: "1", mode: "edit" });
    await page.waitFor(`(${field("Customer GL Account Code")}).value === '01 — test' && (${field("Supplier GL Account Code")}).value === '02-01 — Trade Payables'`, { label: "reopened labels" });
    const gets = (await page.evaluate(`window.__calls`)).filter((c) => c[0] === "lookupTableGet").map((c) => c[2]).sort();
    assert.deepEqual(gets, [11, 12], "labels resolved from the saved ids");
  });

  it("the search icon still opens the Chart of Accounts in selection mode", async () => {
    await page.click(`document.querySelector('#screen button[aria-label="Open Supplier GL Account Code master list"]')`);
    assert.deepEqual((await page.evaluate(`window.__calls`)).filter((c) => c[0] === "openFullScreen").at(-1), ["openFullScreen", "gl-account", "/finance-erp/general-ledger/chart-of-accounts"]);
  });
});
