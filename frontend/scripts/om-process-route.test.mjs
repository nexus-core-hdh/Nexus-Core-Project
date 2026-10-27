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
      "01 KNITTING — not linked to a legacy process", "12 Sewing", "02 GARMENT DYEING — not linked to a legacy process",
      "08 PRINTING — not linked to a legacy process", "07 PACKING — not linked to a legacy process",
    ]);
  });
  it("the linked one is the legacy process an entry stores (03 SEWING → id of 12 Sewing); the others explain why not", () => {
    const o = processOptions(STANDARD);
    assert.deepEqual([o[1].id, o[1].unavailable], [1, undefined]);
    assert.match(o[0].unavailable, /01 KNITTING has no linked legacy process/);
    assert.equal(new Set(o.map((x) => x.id)).size, 5, "distinct option ids");
  });
  it("typed search covers route and legacy codes / names", () => {
    assert.deepEqual(processOptions(STANDARD, "sew").map((x) => x.name), ["12 Sewing"]);
    assert.deepEqual(processOptions(STANDARD, "03").map((x) => x.name), ["12 Sewing"], "by the route code too");
    assert.deepEqual(processOptions(STANDARD, "pack").map((x) => x.name), ["07 PACKING — not linked to a legacy process"]);
  });
  it("no Route: every process, unchanged", () => {
    const all = { restricted: false, reason: "no-route", route: null, processes: [{ id: 2, code: "05", name: "Cutting" }, sewing], routeProcesses: [], diagnostics: [] };
    assert.deepEqual(processOptions(all).map((x) => [x.id, x.name]), [[2, "05 Cutting"], [1, "12 Sewing"]]);
    assert.deepEqual(filterProcesses(all.processes, "05").map((p) => p.name), ["Cutting"]);
  });
});

describe("the screen uses them", () => {
  it("with an Order: options from the Work Order's processes, fetched on every open; without: the master lookup", () => {
    assert.match(page, /if \(workOrderId\) return processOptions\(await legacyErpApi\.orderManufacturing\.processes\(workOrderId\), t\);/);
    assert.match(page, /legacyErpApi\.lookupTable\("process", t\)/);
    assert.match(api, /\/legacy-erp\/order-manufacturing\/processes\?workOrderId=\$\{workOrderId\}/);
  });
  it("picking an unavailable process explains and keeps the current selection", () => {
    assert.match(page, /if \(o\.unavailable\) \{ toast\.error\(o\.unavailable\); return; \}/);
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
