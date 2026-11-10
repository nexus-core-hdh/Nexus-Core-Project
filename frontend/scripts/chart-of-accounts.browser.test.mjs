// Chart of Accounts (Finance ERP → General Ledger) in a REAL browser (headless Chrome/Edge, real mouse
// input; see browser-harness.mjs). Mounts the real screen against an in-memory GL accounts API that
// behaves like gl-account.service.ts (list sorted by code; create/update; delete refused while the
// account is in use). Checks the grid layout (columns, code-derived indentation, group shading, blank
// balance columns), search / column filters / Status filter, the toolbar, right-click menu and Details
// panel actions (Add, Edit, Activate/Deactivate, Delete with confirmation, cancel, blocked delete), and
// lookup mode (opened from a Current Account GL field): Select / double-click return {id, code, name}.
// No database is used.
//   Run: npm run test:chart-of-accounts-browser
//   Optional: COA_SCREENSHOT=<file.png> also saves a screenshot styled with the last `next build` CSS.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { bundle, findBrowser, openPage } from "./browser-harness.mjs";

const FRONTEND = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const acc = (id, accountCode, accountName, extra = {}) => ({
  id, accountCode, accountName, explanation: null, accountType: null, cdType: null, specialCode: null, accessCode: null, inUse: true, ...extra,
});
const DB = {
  accounts: [
    acc(1, "01", "Equity"),
    acc(2, "01-01", "Capital"),
    acc(3, "01-01-01", "Paid-in Capital", { used: true }),
    acc(4, "01-02", "Reserves", { explanation: "Retained", accountType: 2 }),
    acc(5, "02", "Liabilities"),
    acc(6, "02-01", "Trade Payables"),
    acc(7, "03", "Suspense", { inUse: false }),
    acc(8, "900", "Standalone"),
  ],
};

const STUBS = {
  "@/lib/nexuscore-api": `
    const db = () => window.__db;
    const out = (v) => new Promise((r) => setTimeout(() => r(JSON.parse(JSON.stringify(v))), 5));
    const log = (c) => (window.__calls = window.__calls || []).push(c);
    const view = (r) => { const { used, deleted, ...rest } = r; return rest; };
    exports.legacyErpApi = {
      glAccounts: {
        list: () => { log(["list"]); return out(db().accounts.filter((r) => !r.deleted).sort((a, b) => (a.accountCode < b.accountCode ? -1 : 1)).map(view)); },
        create: (d) => { log(["create", d]); const r = { id: 100 + db().accounts.length, ...d }; db().accounts.push(r); return out(view(r)); },
        update: (id, d) => { log(["update", id, d]); const r = db().accounts.find((x) => x.id === id); Object.assign(r, d); return out(view(r)); },
        delete: (id) => {
          log(["delete", id]);
          const r = db().accounts.find((x) => x.id === id);
          if (r.used) return Promise.reject(new Error("Account " + r.accountCode + " — " + r.accountName + " is in use (Current Account (Customer/Supplier GL)) and cannot be deleted. Deactivate it instead."));
          r.deleted = true; return out({ message: "Deleted" });
        },
      },
    };
  `,
  "@/lib/app-navigation": `exports.useRouter = () => ({ push() {}, replace() {}, back() { (window.__nav = window.__nav || []).push("back"); } });`,
  "@/hooks/use-workspace-search-params": `exports.useWorkspaceSearchParams = () => { const p = window.__params || {}; return { get: (k) => (p[k] ?? null) }; };`,
  "@/lib/store/workspace-store": `const s = { closeTab: (k) => (window.__nav = window.__nav || []).push("close:" + k), activateTab: (k) => (window.__nav = window.__nav || []).push("activate:" + k) };
    exports.useWorkspaceStore = (sel) => sel(s);`,
  "@/lib/store/workspace-lookup-store": `const s = { resolve: (id, sel) => (window.__resolved = window.__resolved || []).push([id, sel]) };
    exports.useWorkspaceLookupStore = (sel) => sel(s);`,
  "@/components/layout/workspace/workspace-tab-context": `exports.useWorkspaceTabContext = () => ({ tabKey: "/finance-erp/general-ledger/chart-of-accounts" });`,
  "@/lib/workspace/navigate": `exports.replaceWorkspaceUrl = (_r, href) => (window.__nav = window.__nav || []).push("url:" + href);`,
  "@/lib/workspace/registry": `exports.resolveTabKey = (p) => p;`,
  sonner: `const t = (kind) => (m) => (window.__toasts = window.__toasts || []).push([kind, String(m)]);
    const toast = Object.assign(t("default"), { success: t("success"), error: t("error"), info: t("info"), warning: t("warning"), message: t("message") });
    exports.toast = toast; exports.Toaster = () => null;`,
};

// The app's compiled Tailwind CSS from the last production build (largest CSS chunk), for the optional
// screenshot only — every assertion below is about behaviour/DOM and does not depend on it.
function builtCss() {
  const dir = path.join(FRONTEND, ".next", "static", "chunks");
  try {
    const files = readdirSync(dir).filter((f) => f.endsWith(".css")).map((f) => path.join(dir, f));
    const biggest = files.sort((a, b) => statSync(b).size - statSync(a).size)[0];
    return biggest ? readFileSync(biggest, "utf8") : "";
  } catch { return ""; }
}

const browser = findBrowser();
let page;

describe("Chart of Accounts in a real browser", { skip: browser ? false : "no Chrome/Edge found — set CHROME_PATH" }, () => {
  before(async () => {
    const js = bundle(path.join(FRONTEND, "scripts", "fixtures", "chart-of-accounts.harness.tsx"), { stubs: STUBS });
    const css = process.env.COA_SCREENSHOT ? builtCss() : "";
    page = await openPage(`<!doctype html><meta charset="utf-8"><style>${css}</style><body><div id="root"></div><script>window.__db = ${JSON.stringify(DB)}; window.__params = {};</script><script>${js.replace(/<\/script/g, "<\\/script")}</script></body>`);
    await page.waitFor(`typeof window.__open === 'function' && document.querySelectorAll('#screen tbody tr td.font-mono').length > 0`, { timeout: 20000, label: "the grid loaded" });
  });
  after(async () => {
    if (page) {
      if (page.consoleErrors.length) console.log("page errors:", page.consoleErrors);
      await page.close();
    }
  });

  const text = (e) => `${e}.textContent.replace(/\\s+/g, ' ').trim()`;
  const rows = () => page.evaluate(`[...document.querySelectorAll('#screen tbody tr')].filter((tr) => tr.querySelector('td.font-mono')).map((tr) => {
    const td = [...tr.querySelectorAll('td')];
    return { code: td[1].textContent.trim(), name: td[2].textContent.replace(/\\s+/g, ' ').trim(), indent: td[2].firstElementChild.style.paddingLeft,
      group: /bg-amber-100/.test(tr.className), balances: td.slice(3).map((c) => c.textContent).join('') };
  })`);
  const row = (code) => `[...document.querySelectorAll('#screen tbody tr')].find((tr) => tr.querySelector('td.font-mono')?.textContent.trim() === ${JSON.stringify(code)})`;
  const toolbar = (label) => `[...document.querySelectorAll('#screen button')].find((b) => ${text("b")} === ${JSON.stringify(label)})`;
  // Tags the OLD grid, then waits for a new (untagged) grid with rows — never reuses the old instance.
  const reset = async (params = {}) => {
    await page.evaluate(`document.querySelector('#screen tbody')?.setAttribute('data-old', '1'); window.__db = ${JSON.stringify(DB)}; window.__calls = []; window.__toasts = []; window.__nav = []; window.__resolved = []; window.__open(${JSON.stringify(params)})`);
    await page.waitFor(`(() => { const tb = document.querySelector('#screen tbody'); return !!tb && !tb.hasAttribute('data-old') && tb.querySelectorAll('td.font-mono').length > 0; })()`, { label: "remounted" });
  };
  const setInput = (selector, value) => page.evaluate(`(() => { const el = ${selector}; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);

  it("shows real API rows in a full-width grid: columns, code order, code-derived indentation and group shading, blank balances", async () => {
    assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('#screen thead tr:first-child th')].map((th) => th.textContent.trim()).filter(Boolean)`),
      ["Account Code", "Account Name", "Debit", "Credit", "Balance", "BT"]);
    const r = await rows();
    assert.deepEqual(r.map((x) => x.code), ["01", "01-01", "01-01-01", "01-02", "02", "02-01", "03", "900"]);
    assert.deepEqual(r.map((x) => x.indent), ["0px", "12px", "24px", "12px", "0px", "12px", "0px", "0px"]);
    assert.deepEqual(r.filter((x) => x.group).map((x) => x.code), ["01", "02"], "only top-level accounts that have sub-accounts are shaded");
    assert.ok(r.every((x) => x.balances === ""), "no balance values are invented");
    assert.match(r.find((x) => x.code === "03").name, /^Suspense\s*Inactive$/, "inactive accounts are labelled");
    assert.match(await page.evaluate(`document.querySelector('#screen').textContent`), /8 of 8 accounts/);
    assert.deepEqual(await page.evaluate(`window.__calls`), [["list"]]);
  });

  it("search bar, column filter row and the Filter tab's Status filter narrow the grid", async () => {
    await reset();
    await page.click(`document.querySelector('#screen input[placeholder=Search]')`);
    await page.type("capital");
    assert.deepEqual((await rows()).map((x) => x.code), ["01-01", "01-01-01"]);
    await setInput(`document.querySelector('#screen input[placeholder=Search]')`, "");
    await setInput(`document.querySelector('#screen input[aria-label="Filter by account code"]')`, "02");
    assert.deepEqual((await rows()).map((x) => x.code), ["01-02", "02", "02-01"]);
    await setInput(`document.querySelector('#screen input[aria-label="Filter by account code"]')`, "");
    await setInput(`document.querySelector('#screen input[aria-label="Filter by account name"]')`, "payab");
    assert.deepEqual((await rows()).map((x) => x.code), ["02-01"]);
    await setInput(`document.querySelector('#screen input[aria-label="Filter by account name"]')`, "");
    await page.click(`document.querySelector('#screen button[title=Filter]')`);
    await page.click(`[...document.querySelectorAll('#screen label')].find((l) => l.textContent.trim() === 'inactive')`);
    assert.deepEqual((await rows()).map((x) => x.code), ["03"]);
    await page.click(toolbar("Clear filters"));
    assert.equal((await rows()).length, 8);
  });

  it("toolbar actions need a selected row; Edit saves through the existing update call", async () => {
    await reset();
    assert.equal(await page.evaluate(`(${toolbar("Edit")}).disabled`), true);
    await page.click(row("01-02"));
    assert.equal(await page.evaluate(`(${row("01-02")}).getAttribute('aria-selected')`), "true");
    assert.equal(await page.evaluate(`[...document.querySelectorAll('#screen tbody tr[aria-selected=true]')].length`), 1);
    await page.click(toolbar("Edit"));
    await page.waitFor(`!!document.querySelector('[role=dialog]')`);
    assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('[role=dialog] input')].map((i) => i.value)`), ["01-02", "Reserves", "2", "", "Retained", "", ""]);
    await setInput(`document.querySelectorAll('[role=dialog] input')[1]`, "Reserves and Surplus");
    await page.click(`[...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent.trim() === 'Save Account')`);
    await page.waitFor(`!document.querySelector('[role=dialog]') && /Reserves and Surplus/.test(document.querySelector('#screen tbody').textContent)`);
    const upd = (await page.evaluate(`window.__calls`)).find((c) => c[0] === "update");
    assert.equal(upd[1], 4);
    assert.equal(upd[2].accountName, "Reserves and Surplus");
    assert.equal(upd[2].accountType, 2);
  });

  it("Add creates through the existing create call", async () => {
    await reset();
    await page.click(toolbar("Add"));
    await page.waitFor(`!!document.querySelector('[role=dialog]')`);
    await setInput(`document.querySelectorAll('[role=dialog] input')[0]`, "04");
    await setInput(`document.querySelectorAll('[role=dialog] input')[1]`, "Income");
    await page.click(`[...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent.trim() === 'Save Account')`);
    await page.waitFor(`!!(${row("04")})`);
    const c = (await page.evaluate(`window.__calls`)).find((x) => x[0] === "create");
    assert.deepEqual([c[1].accountCode, c[1].accountName, c[1].inUse], ["04", "Income", true]);
  });

  it("Activate/Deactivate toggles through the existing update call", async () => {
    await reset();
    await page.click(row("900"));
    await page.click(toolbar("Deactivate"));
    await page.waitFor(`/Inactive/.test((${row("900")}).textContent)`);
    assert.deepEqual((await page.evaluate(`window.__calls`)).find((c) => c[0] === "update"), ["update", 8, { inUse: false }]);
    await page.click(toolbar("Activate"));
    await page.waitFor(`!/Inactive/.test((${row("900")}).textContent)`);
  });

  it("Delete: confirmation names the account; No cancels; Yes soft-deletes an unused account; an in-use account is refused", async () => {
    await reset();
    await page.click(row("02-01"));
    await page.click(toolbar("Delete"));
    await page.waitFor(`!!document.querySelector('[role=alertdialog]')`);
    assert.match(await page.evaluate(`document.querySelector('[role=alertdialog]').textContent`), /Delete account 02-01 — Trade Payables\?/);
    await page.click(`[...document.querySelectorAll('[role=alertdialog] button')].find((b) => b.textContent.trim() === 'No')`);
    await page.waitFor(`!document.querySelector('[role=alertdialog]')`);
    assert.ok(!(await page.evaluate(`window.__calls`)).some((c) => c[0] === "delete"), "cancel sends nothing");
    assert.ok(await page.evaluate(`!!(${row("02-01")})`));

    await page.click(toolbar("Delete"));
    await page.waitFor(`!!document.querySelector('[role=alertdialog]')`);
    await page.click(`[...document.querySelectorAll('[role=alertdialog] button')].find((b) => b.textContent.trim() === 'Yes, delete')`);
    await page.waitFor(`!(${row("02-01")})`, { label: "row removed" });
    assert.deepEqual((await page.evaluate(`window.__toasts`)).at(-1), ["success", "Account 02-01 deleted"]);
    assert.equal(await page.evaluate(`(${toolbar("Edit")}).disabled`), true, "selection cleared after delete");
    await page.waitFor(`!document.querySelector('[role=alertdialog]')`, { label: "confirmation closed (incl. exit animation)" });

    await page.click(row("01-01-01"));
    await page.click(toolbar("Delete"));
    await page.waitFor(`!!document.querySelector('[role=alertdialog]')`);
    await page.click(`[...document.querySelectorAll('[role=alertdialog] button')].find((b) => b.textContent.trim() === 'Yes, delete')`);
    await page.waitFor(`(window.__toasts || []).some((t) => t[0] === 'error')`);
    assert.match((await page.evaluate(`window.__toasts`)).at(-1)[1], /is in use .* cannot be deleted/);
    assert.ok(await page.evaluate(`!!(${row("01-01-01")})`), "in-use account stays listed");
  });

  it("right-click menu and the Details panel offer the same actions", async () => {
    await reset();
    await page.click(row("01-02"), { button: "right" });
    await page.waitFor(`!!document.querySelector('[role=menu]')`);
    assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('[role=menu] [role=menuitem]')].map((e) => e.textContent.trim())`), ["Details", "Edit", "Deactivate", "Delete"]);
    await page.click(`[...document.querySelectorAll('[role=menuitem]')].find((e) => e.textContent.trim() === 'Details')`);
    await page.waitFor(`/Account Details/.test(document.querySelector('#screen').textContent)`);
    const details = await page.evaluate(`document.querySelector('#screen').textContent`);
    assert.match(details, /Code01-02/);
    assert.match(details, /ExplanationRetained/);
    await page.click(`document.querySelector('#screen button[title=Utilities]')`);
    assert.match(await page.evaluate(`document.querySelector('#screen').textContent`), /Accounts8Active7Inactive1/);
  });

  it("lookup mode (from a Current Account GL field): Select / double-click return {id, code, name} and close; inactive refused", async () => {
    await reset({ mode: "lookup", requestId: "req-1", returnTab: encodeURIComponent("/legacy-erp/current-accounts?id=5") });
    await page.click(row("03"));
    assert.equal(await page.evaluate(`(${toolbar("Select")}).disabled`), true, "inactive account cannot be selected");
    await page.evaluate(`(${row("03")}).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`);
    assert.deepEqual(await page.evaluate(`window.__resolved`), []);
    assert.deepEqual((await page.evaluate(`window.__toasts`)).at(-1), ["error", "Inactive accounts cannot be selected"]);

    await page.click(row("02-01"));
    await page.click(toolbar("Select"));
    assert.deepEqual(await page.evaluate(`window.__resolved`), [["req-1", { id: 6, code: "02-01", name: "Trade Payables" }]]);
    assert.deepEqual(await page.evaluate(`window.__nav`), ["close:/finance-erp/general-ledger/chart-of-accounts", "activate:/legacy-erp/current-accounts", "url:/legacy-erp/current-accounts?id=5"]);

    await reset({ mode: "lookup", requestId: "req-2" });
    await page.evaluate(`(${row("900")}).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`);
    assert.deepEqual(await page.evaluate(`window.__resolved`), [["req-2", { id: 8, code: "900", name: "Standalone" }]]);
  });

  it("optional screenshot", { skip: process.env.COA_SCREENSHOT ? false : "set COA_SCREENSHOT to save one" }, async () => {
    await reset();
    await page.click(row("01-01"));
    await page.sleep(200);
    await page.screenshot(process.env.COA_SCREENSHOT);
  });
});
