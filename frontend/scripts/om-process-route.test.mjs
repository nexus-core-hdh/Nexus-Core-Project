// Order Manufacturing Entry — the Process dropdown from the Work Order's Route (lib/legacy-erp/process-options.ts).
//   Run: npm run test:om-process-route
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { describe, it } from "node:test";

register("./workspace-test-loader.mjs", import.meta.url);
const { processOptions, filterProcesses } = await import("@/lib/legacy-erp/process-options");

const page = readFileSync(new URL("../app/[company]/(auth)/legacy-erp/order-manufacturing-entry/page.tsx", import.meta.url), "utf8");
const api = readFileSync(new URL("../lib/nexuscore-api.ts", import.meta.url), "utf8");

// What GET /legacy-erp/order-manufacturing/processes returns for the live STANDARD ROUTE once SEWING is linked.
const rp = (code, name, legacy, problem) => ({ routeProcess: { id: `pc-${code}`, code, name }, legacy, problem });
const sewing = { id: 1, code: "12", name: "Sewing" };
const STANDARD = {
  restricted: true, reason: null, route: { id: "r", code: "03", name: "STANDARD ROUTE" },
  processes: [sewing],
  routeProcesses: [rp("01", "KNITTING", null, "not-linked"), rp("03", "SEWING", sewing, null), rp("02", "GARMENT DYEING", null, "not-linked"), rp("08", "PRINTING", null, "not-linked"), rp("07", "PACKING", null, "not-linked")],
  diagnostics: ["01 KNITTING", "02 GARMENT DYEING", "08 PRINTING", "07 PACKING"].map((p) => `Route process ${p} has no linked legacy process (MA_Process) — it cannot be recorded here until its Process Card is linked to one.`),
};

describe("Process options", () => {
  it("a Route: all five of its processes, in route order — none dropped", () => {
    const o = processOptions(STANDARD);
    assert.deepEqual(o.map((x) => x.name), [
      "01 KNITTING", "12 Sewing", "02 GARMENT DYEING", "08 PRINTING", "07 PACKING",
    ], "each process name once");
  });
  it("the linked one is the legacy process an entry stores (03 SEWING → id of 12 Sewing); the others explain why not", () => {
    const o = processOptions(STANDARD);
    assert.deepEqual([o[1].id, o[1].unavailable], [1, undefined]);
    assert.equal(o[0].unavailable, "Not linked", "a short reason on the row");
    assert.match(o[0].unavailableDetail, /01 KNITTING has no linked legacy process/, "the full explanation, for the tooltip");
    assert.equal(new Set(o.map((x) => x.id)).size, 5, "distinct option ids");
  });
  it("typed search covers route and legacy codes / names", () => {
    assert.deepEqual(processOptions(STANDARD, "sew").map((x) => x.name), ["12 Sewing"]);
    assert.deepEqual(processOptions(STANDARD, "03").map((x) => x.name), ["12 Sewing"], "by the route code too");
    assert.deepEqual(processOptions(STANDARD, "pack").map((x) => x.name), ["07 PACKING"]);
  });
  it("no Route: every process, unchanged", () => {
    const all = { restricted: false, reason: "no-route", route: null, processes: [{ id: 2, code: "05", name: "Cutting" }, sewing], routeProcesses: [], diagnostics: [] };
    assert.deepEqual(processOptions(all).map((x) => [x.id, x.name]), [[2, "05 Cutting"], [1, "12 Sewing"]]);
    assert.deepEqual(filterProcesses(all.processes, "05").map((p) => p.name), ["Cutting"]);
  });
});

describe("the screen uses them", () => {
  // The screen's Process field lives in _components/process-field.tsx (also mounted by the real-browser
  // test, scripts/om-process-field.browser.test.mjs).
  const field = readFileSync(new URL("../app/[company]/(auth)/legacy-erp/order-manufacturing-entry/_components/process-field.tsx", import.meta.url), "utf8");
  it("the screen renders ProcessField with the Work Order, its context process and pick / clear handlers", () => {
    assert.match(page, /<ProcessField\s+workOrderId=\{workOrderId\}\s+process=\{ctx\?\.process \?\? null\}\s+onPick=\{pickProcess\}/);
    assert.match(page, /const pickProcess = \(id: number\) => \{ setProcessId\(id\); load\(workOrderId, id\); \};/);
  });
  it("with an Order: options from the Work Order's processes, fetched on every open; without: the master lookup", () => {
    assert.match(field, /if \(workOrderId\) return processOptions\(await legacyErpApi\.orderManufacturing\.processes\(workOrderId\), term\);/);
    assert.match(field, /legacyErpApi\.lookupTable\("process", term\)/);
    assert.match(api, /\/legacy-erp\/order-manufacturing\/processes\?workOrderId=\$\{workOrderId\}/);
  });
  it("opening the field lists every option: the chosen process's own text is not a search term", () => {
    assert.match(field, /const term = t\.trim\(\) === shown \? "" : t;/);
  });
  it("an unavailable process that ever reaches onSelect explains and keeps the current selection", () => {
    assert.match(field, /if \(o\.unavailable\) \{ toast\.error\(o\.unavailableDetail \?\? o\.unavailable\); return; \}/);
  });
});

describe("Process Card screen: Legacy Process selector", () => {
  const pc = readFileSync(new URL("../app/[company]/(auth)/plm/general-definitions/process-cards/page.tsx", import.meta.url), "utf8");
  it("lists the legacy Process master (the Order Manufacturing dropdown's source) with a Not linked choice", () => {
    assert.match(pc, /legacyErpApi\.lookupTable\("process"\)/);
    assert.match(pc, /<SelectItem value="__none__">— Not linked —<\/SelectItem>/);
  });
  it("loads, shows and saves the link (blank → null)", () => {
    assert.match(pc, /legacyProcessId: r\.legacyProcessId != null \? String\(r\.legacyProcessId\) : ''/);
    assert.match(pc, /legacyProcessId: form\.legacyProcessId \? Number\(form\.legacyProcessId\) : null/);
    assert.match(pc, /key: 'legacyProcessId', label: 'Legacy Process'/);
  });
});

// ── W/O-000212 regression: the dropdown "went empty" ────────────────────────────────────────────────
// The five options were computed (above) but the shared autocomplete treated an unlinked Route
// process like any other option: it started highlighted on 01 KNITTING, Enter/Tab or a click
// "chose" it, the page refused it with a toast, the field closed and reset to empty — a focused,
// blank box with no list (the screenshot). Unlinked processes are now listed but disabled.
const { createElement } = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const { MasterOptionList, firstSelectable, stepHighlight, commitCandidate, exactMatch } = await import("@/components/legacy-erp/master-option-list");

describe("W/O-000212: unlinked Route processes are shown disabled, never chosen", () => {
  const options = processOptions(STANDARD);

  it("renders all five in route order; the four unlinked ones disabled with their reason, Sewing selectable", () => {
    const html = renderToStaticMarkup(createElement(MasterOptionList, { options, highlight: firstSelectable(options), onChoose: () => {} }));
    const rows = [...html.matchAll(/<(button|div)[^>]*role="option"[^>]*>(.*?)<\/(button|div)>/g)];
    assert.equal(rows.length, 5);
    assert.deepEqual(rows.map((m) => m[1]), ["div", "button", "div", "div", "div"], "only 12 Sewing is a clickable button");
    assert.equal((html.match(/aria-disabled="true"/g) || []).length, 4);
    assert.ok(html.indexOf("01 KNITTING") < html.indexOf("12 Sewing") && html.indexOf("12 Sewing") < html.indexOf("02 GARMENT DYEING")
      && html.indexOf("02 GARMENT DYEING") < html.indexOf("08 PRINTING") && html.indexOf("08 PRINTING") < html.indexOf("07 PACKING"), "route order");
    // Compact: the visible row is the name once plus a short tag; the full reason is only on hover.
    const visible = rows.map((m) => m[2].replace(/<[^>]+>/g, ""));
    assert.deepEqual(visible, ["01 KNITTINGNot linked", "12 Sewing", "02 GARMENT DYEINGNot linked", "08 PRINTINGNot linked", "07 PACKINGNot linked"]);
    assert.match(html, /title="Route process 02 GARMENT DYEING has no linked legacy process \(MA_Process\) — it cannot be recorded here until its Process Card is linked to one\."/);
    assert.match(html, /cursor-not-allowed/);
  });

  it("the list opens highlighted on the first selectable option (12 Sewing), not on unlinked 01 KNITTING", () => {
    assert.equal(firstSelectable(options), 1);
    assert.equal(firstSelectable(processOptions(STANDARD, "pack")), -1, "nothing selectable: nothing highlighted");
  });

  it("Enter / Tab never commit an unlinked process — the old highlight (0) now commits nothing", () => {
    assert.equal(commitCandidate(options, 0, ""), undefined);
    assert.equal(commitCandidate(options, 1, "")?.id, 1, "Sewing commits");
    assert.equal(commitCandidate(options, -1, ""), undefined);
    assert.equal(exactMatch(options, "02 GARMENT DYEING"), undefined, "typing an unlinked name exactly binds nothing");
    assert.equal(exactMatch(options, "12 sewing")?.id, 1);
  });

  it("Arrow keys skip unlinked processes", () => {
    assert.equal(stepHighlight(options, 1, 1), 1, "nothing selectable below Sewing: stays");
    assert.equal(stepHighlight(options, 1, -1), 1, "nothing selectable above Sewing: stays");
    const twoLinked = [...options, { id: 9, code: "15", name: "15 Ironing" }];
    assert.equal(stepHighlight(twoLinked, 1, 1), 5, "jumps over GARMENT DYEING / PRINTING / PACKING");
    assert.equal(stepHighlight(twoLinked, 5, -1), 1);
  });

  it("an unlinked option keeps the same id while typing (stable while the list filters)", () => {
    const dyeing = (t) => processOptions(STANDARD, t).find((o) => o.code === "02").id;
    assert.equal(dyeing(""), dyeing("dye"));
  });

  it("other screens are unaffected: options without `unavailable` all render as buttons and commit as before", () => {
    const plain = [{ id: 1, name: "A" }, { id: 2, name: "B" }];
    const html = renderToStaticMarkup(createElement(MasterOptionList, { options: plain, highlight: 0, onChoose: () => {} }));
    assert.equal((html.match(/<button/g) || []).length, 2);
    assert.equal(firstSelectable(plain), 0);
    assert.equal(commitCandidate(plain, 1, "")?.id, 2);
  });

  it("the field uses these rules (highlight start, arrows, Enter/Tab, blur exact match, list)", () => {
    const field = readFileSync(new URL("../components/legacy-erp/master-autocomplete-field.tsx", import.meta.url), "utf8");
    assert.match(field, /setHighlight\(firstSelectable\(list\)\)/);
    assert.match(field, /stepHighlight\(options, h, 1\)/);
    assert.equal((field.match(/commitCandidate\(options, highlight, query\)/g) || []).length, 2, "Enter and Tab");
    assert.match(field, /exactMatch\(options, query\)/);
    assert.match(field, /<MasterOptionList /);
  });
});

describe("Route order is saved by the Route Card screen", () => {
  const rc = readFileSync(new URL("../app/[company]/(auth)/plm/general-definitions/route-cards/[id]/page.tsx", import.meta.url), "utf8");
  it("each saved line carries its grid position as `sequence` (live STANDARD ROUTE had every line at 0)", () => {
    assert.match(rc, /let sequence = 0;/);
    assert.match(rc, /sequence: sequence\+\+,\s*\n\s*processId: line\.processId/);
    assert.ok(rc.indexOf("if (!line.processId) continue;") < rc.indexOf("sequence: sequence++"), "blank rows are skipped before numbering");
  });
});
