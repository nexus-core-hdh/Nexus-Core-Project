// Order Manufacturing Entry — the Process field in a REAL browser (headless Chrome/Edge, real mouse and
// keyboard input via the DevTools protocol; see browser-harness.mjs). Mounts the screen's own
// ProcessField (_components/process-field.tsx → MasterAutocompleteField) fed the live
// GET /legacy-erp/order-manufacturing/processes response for W/O-000212 (STANDARD ROUTE).
//
// Reproduces the reported failure: clicking 02 GARMENT DYEING (no linked legacy process) toasted
// "Route process 02 GARMENT DYEING has no linked legacy process ...", closed the list and emptied the
// field — and clicking the still-focused, empty field never opened the list again.
//   Run: npm run test:om-process-browser
//   Against the code before the fix (shows the failure): OM_PROCESS_BASE=<git rev> npm run test:om-process-browser
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { bundle, findBrowser, openPage } from "./browser-harness.mjs";

const FRONTEND = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.OM_PROCESS_BASE; // e.g. HEAD — run the same steps against older sources

// GET /legacy-erp/order-manufacturing/processes?workOrderId=239 as the live backend returned it
// (2026-10-29; only 03 SEWING is linked, to legacy 12 Sewing).
const not = (code, name) => `Route process ${code} ${name} has no linked legacy process (MA_Process) — it cannot be recorded here until its Process Card is linked to one.`;
const WO_212 = {
  restricted: true, reason: null, route: { id: "f9fd5d56-94b6-4b42-bed0-d66b295aff20", code: "03", name: "STANDARD ROUTE" },
  processes: [{ id: 1, code: "12", name: "Sewing" }],
  routeProcesses: [
    { routeProcess: { id: "ce1a16f5-2ec6-4e16-b1c8-c5b167658e68", code: "01", name: "KNITTING" }, legacy: null, problem: "not-linked" },
    { routeProcess: { id: "d3fc5729-dc88-4dc3-947a-afa9f8e8e8bb", code: "03", name: "SEWING" }, legacy: { id: 1, code: "12", name: "Sewing" }, problem: null },
    { routeProcess: { id: "c934b021-3f3b-4a67-b465-58820d015ecb", code: "02", name: "GARMENT DYEING" }, legacy: null, problem: "not-linked" },
    { routeProcess: { id: "cb3e9cc8-0300-46f1-8ce4-a07b13ae2f25", code: "08", name: "PRINTING" }, legacy: null, problem: "not-linked" },
    { routeProcess: { id: "5a7133cf-0a01-466f-9616-0ba26d4ca6bf", code: "07", name: "PACKING" }, legacy: null, problem: "not-linked" },
  ],
  diagnostics: [not("01", "KNITTING"), not("02", "GARMENT DYEING"), not("08", "PRINTING"), not("07", "PACKING")],
};
const MASTER = [{ id: 2, code: "05", name: "Cutting" }, { id: 3, code: "15", name: "Ironing" }, { id: 1, code: "12", name: "Sewing" }];
const NO_ROUTE = { restricted: false, reason: "no-route", route: null, processes: MASTER, routeProcesses: [], diagnostics: [] };
const FIXTURES = { processes: { 239: WO_212, 500: NO_ROUTE }, master: MASTER };

const STUBS = {
  // The only network module: answers from window.__fixtures and records every call.
  "@/lib/nexuscore-api": `exports.legacyErpApi = {
    orderManufacturing: { processes: async (wo) => { (window.__apiCalls = window.__apiCalls || []).push(wo); return JSON.parse(JSON.stringify(window.__fixtures.processes[wo])); } },
    lookupTable: async (key, t) => window.__fixtures.master.filter((p) => !t || (p.code + " " + p.name).toLowerCase().includes(String(t).toLowerCase())),
  };`,
  // F2 opens the full-screen Master Lookup tab in the app; counted here.
  "@/hooks/use-master-lookup-field": "exports.useMasterLookupField = () => ({ openFullScreen() { window.__f2 = (window.__f2 || 0) + 1; } });",
  // Only FieldLabel / spanClass are used (not in compact mode); the real module pulls in date pickers etc.
  "@/components/forms/form-field": "exports.FieldLabel = () => null; exports.spanClass = () => '';",
  next: "module.exports = {};",
};

const overrides = {};
if (BASE) {
  for (const rel of ["components/legacy-erp/master-autocomplete-field.tsx", "lib/legacy-erp/process-options.ts"]) {
    overrides[path.join(FRONTEND, rel)] = execFileSync("git", ["show", `${BASE}:frontend/${rel}`], { cwd: FRONTEND, encoding: "utf8" });
  }
}

// DOM helpers (evaluated in the page).
const INPUT = `document.querySelector('#process-field input')`;
const OPTIONS = `[...document.querySelectorAll('#process-field [role=option], #process-field .absolute button')]`;
const state = `(() => {
  const input = ${INPUT};
  const opts = ${OPTIONS};
  return {
    value: input.value, focused: document.activeElement === input,
    options: opts.map((o) => ({ text: o.textContent, title: o.getAttribute('title') || '', disabled: o.getAttribute('aria-disabled') === 'true', tag: o.tagName })),
    toasts: [...document.querySelectorAll('[data-sonner-toast]')].map((t) => t.textContent),
    picks: window.__picks.slice(), apiCalls: (window.__apiCalls || []).slice(),
  };
})()`;
const optionNamed = (text) => `${OPTIONS}.find((o) => o.textContent.includes(${JSON.stringify(text)}))`;
const ROUTE_ORDER = ["01 KNITTING", "12 Sewing", "02 GARMENT DYEING", "08 PRINTING", "07 PACKING"];

const browser = findBrowser();
let page;

describe(`Process field in a real browser${BASE ? ` (sources from ${BASE})` : ""}`, { skip: browser ? false : "no Chrome/Edge found — set CHROME_PATH" }, () => {
  before(async () => {
    const js = bundle(path.join(FRONTEND, "scripts", "fixtures", "om-process-field.harness.tsx"), { stubs: STUBS, overrides });
    page = await openPage(`<!doctype html><meta charset="utf-8"><body><div id="root"></div><script>window.__fixtures = ${JSON.stringify(FIXTURES)};</script><script>${js.replace(/<\/script/g, "<\\/script")}</script></body>`);
    await page.waitFor(`!!${INPUT}`, { label: "the field rendered" });
  });
  after(async () => {
    if (page) {
      if (page.consoleErrors.length) console.log("page errors:", page.consoleErrors);
      await page.close();
    }
  });

  const s = () => page.evaluate(state);
  const openByClick = async () => {
    await page.click(INPUT);
    await page.waitFor(`${OPTIONS}.length > 0`, { label: "the list opened" });
    await page.sleep(60);
  };

  it("W/O-000212: clicking the empty field lists all five STANDARD ROUTE processes in route order; only 12 Sewing is selectable", async () => {
    await openByClick();
    const st = await s();
    assert.deepEqual(st.apiCalls, [239], "options come from the Work Order's processes endpoint");
    assert.deepEqual(st.options.map((o) => ROUTE_ORDER.find((n) => o.text.includes(n))), ROUTE_ORDER);
    assert.deepEqual(st.options.map((o) => o.disabled), [true, false, true, true, true]);
    // Compact rows: the name once and a short "Not linked" tag; the full reason only on hover.
    assert.deepEqual(st.options.map((o) => o.text), ["01 KNITTINGNot linked", "12 Sewing", "02 GARMENT DYEINGNot linked", "08 PRINTINGNot linked", "07 PACKINGNot linked"]);
    for (const o of st.options.filter((x) => x.disabled)) assert.match(o.title, /has no linked legacy process \(MA_Process\) — it cannot be recorded here until its Process Card is linked to one\./);
    assert.equal(st.focused, true);
  });

  it("THE SCREENSHOT: clicking 02 GARMENT DYEING does not commit it, toast, empty the field or close the list", async () => {
    await page.click(optionNamed("02 GARMENT DYEING"));
    await page.sleep(400);
    const st = await s();
    assert.deepEqual(st.toasts, [], "no error toast");
    assert.deepEqual(st.picks, [], "nothing committed");
    assert.equal(st.value, "", "the field is not changed");
    assert.equal(st.focused, true, "focus stays in the field");
    assert.equal(st.options.length, 5, "the list stays open with all five");
  });

  it("clicking the focused, empty field after the list was closed always opens it again", async () => {
    await page.press("Escape");
    await page.waitFor(`${OPTIONS}.length === 0`, { label: "Escape closed the list" });
    assert.equal((await s()).focused, true);
    await openByClick(); // the click that did nothing before the fix
    assert.equal((await s()).options.length, 5);
  });

  it("keyboard: the list starts on 12 Sewing, arrows skip unlinked processes, Enter commits Sewing", async () => {
    await page.press("ArrowDown");
    await page.press("ArrowUp");
    await page.press("Enter");
    await page.waitFor(`${INPUT}.value === "12 Sewing"`, { label: "Sewing chosen" });
    const st = await s();
    assert.deepEqual(st.picks, [1], "legacy process 1 (12 Sewing) — what the entry stores");
    assert.deepEqual(st.toasts, []);
  });

  it("with a process chosen, clicking the field lists all five again (not just the chosen one)", async () => {
    await openByClick();
    const st = await s();
    assert.equal(st.options.length, 5);
    assert.equal(st.value, "12 Sewing");
  });

  it("typing narrows the list; Enter on only an unlinked match commits nothing; leaving the field keeps the chosen process", async () => {
    await page.evaluate(`(() => { const i = ${INPUT}; i.select(); })()`);
    await page.type("dye");
    await page.waitFor(`${OPTIONS}.length === 1`, { label: "filtered to GARMENT DYEING" });
    await page.press("Enter");
    await page.sleep(200);
    let st = await s();
    assert.deepEqual(st.picks, [1], "nothing new committed");
    assert.deepEqual(st.toasts, []);
    await page.click(`document.querySelector('#elsewhere')`);
    await page.sleep(300);
    st = await s();
    assert.equal(st.value, "12 Sewing", "blur restores the chosen process");
    assert.deepEqual(st.picks, [1]);
  });

  it("changing to a Work Order without a Route lists every process, all selectable; back to W/O-000212 lists its Route again", async () => {
    await page.evaluate(`window.__setWorkOrder(500)`);
    await page.sleep(100);
    await openByClick();
    let st = await s();
    assert.deepEqual(st.options.map((o) => o.text), ["05 Cutting", "15 Ironing", "12 Sewing"]);
    assert.ok(st.options.every((o) => !o.disabled));
    await page.click(optionNamed("15 Ironing"));
    await page.waitFor(`${INPUT}.value === "15 Ironing"`);
    await page.evaluate(`window.__setWorkOrder(239)`);
    await page.click(`document.querySelector('#elsewhere')`);
    await page.sleep(200);
    await openByClick();
    st = await s();
    assert.deepEqual(st.options.map((o) => ROUTE_ORDER.find((n) => o.text.includes(n))), ROUTE_ORDER);
    assert.deepEqual(st.apiCalls.filter((w) => w === 500).length > 0 && st.apiCalls.at(-1), 239, "re-read for the new Work Order");
    assert.deepEqual(st.toasts, []);
  });
});
