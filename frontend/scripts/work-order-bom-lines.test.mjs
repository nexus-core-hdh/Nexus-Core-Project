// Work Order BOM — Transfer from Style Card as an unsaved edit. Covers the real line <-> row
// mapping BomTab uses (work-order-bom-lines.ts) and the screen wiring that defers persistence to
// the Work Order's Save.   Run: npm run test:bom-transfer
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { describe, it } from "node:test";

register("./workspace-test-loader.mjs", import.meta.url);
const COMPONENTS = "../app/dashboard/(auth)/plm/style-cards/[id]/_components";
const { workOrderLineToBomRow, workOrderRowToRecipeLine } = await import(`${COMPONENTS}/work-order-bom-lines.ts`);

// A line exactly as WorkOrderService.previewBomTransferFromStyleCard returns it.
const transferred = {
  lineType: "fabric", inventoryId: 41, explanation: "Body fabric", variant1: "MAIN FAB", variant2: "NAVY",
  isCutting: 1, isMaster: 1, unitId: 3, quantity: 1.25, price: 4.5, colorCardId: "cc-1", wastage: 6.5,
  uD_Component: "BODY", uD_Dia: "30", uD_Guage: "24", uD_FinishWidth: "72", uD_FinishRoute: "RT-1",
  uD_Revision: "R2", uD_Placement: "FRONT", uD_Remarks: "DYE", notForRequirement: 1, isFixQuantity: 1,
};
const cache = { 41: { inventoryCode: "FAB-41", inventoryName: "Jersey" } };

describe("transferred line → grid row → saved line", () => {
  const row = workOrderLineToBomRow(transferred, cache);
  const saved = workOrderRowToRecipeLine(row);

  it("the grid row shows every transferred value", () => {
    assert.equal(row.lineType, "fabric");
    assert.equal(row.fabricInventoryId, 41);
    assert.equal(row.fabricCode, "FAB-41");
    assert.equal(row.variant, "MAIN FAB");
    assert.equal(row.variant2, "NAVY", "Production Color");
    assert.equal(row.wastePct, 6.5);
    assert.equal(row.notForRequirement, true);
    assert.equal(row.useFixQuantity, true);
    assert.equal(row.willBeCut, true);
    assert.equal(row.mainFabric, true);
  });

  it("saving writes back exactly the transferred line — nothing lost (Material, type, qty, waste, unit, variant, production color, flags, UD fields)", () => {
    const { lineType: _t, ...expected } = transferred;
    const comparable = Object.fromEntries(Object.entries(saved).filter(([, v]) => v !== undefined));
    assert.deepEqual(comparable, expected);
  });

  it("display-only fields never count as an unsaved change (the dirty projection ignores them)", () => {
    const patched = { ...row, unit: "KG", color: "Navy Blue", fabricCode: "X", fabricName: "Y" };
    assert.deepEqual(workOrderRowToRecipeLine(patched), saved);
    assert.notDeepEqual(workOrderRowToRecipeLine({ ...row, quantity: 2 }), saved, "a real edit does");
  });
});

describe("screen wiring", () => {
  const page = readFileSync(new URL("../app/dashboard/(auth)/legacy-erp/work-orders/page.tsx", import.meta.url), "utf8");
  const bomTab = readFileSync(new URL(`${COMPONENTS}/bom-tab.tsx`, import.meta.url), "utf8");
  const api = readFileSync(new URL("../lib/nexuscore-api.ts", import.meta.url), "utf8");

  it("Transfer only reads: no persisting transfer call anywhere", () => {
    assert.doesNotMatch(page, /transferBomFromStyleCard\(/);
    assert.doesNotMatch(api, /transfer-from-style-card/);
    assert.match(api, /previewBomTransferFromStyleCard: [^\n]*\n\s*api\.get\(`\/legacy-erp\/work-orders\/\$\{id\}\/bom\/style-card-transfer/);
    assert.match(page, /previewBomTransferFromStyleCard\(woId, styleCardId\)/);
  });

  it("the transfer goes into BomTab's in-memory rows, and no upsert runs outside save()", () => {
    assert.match(bomTab, /setRows\(\(rs\) => \[\.\.\.rs\.filter\(\(r\) => !types\.includes\(r\.lineType\)\), \.\.\.incoming\]\)/);
    assert.equal((bomTab.match(/workOrders\.upsertBom\(/g) ?? []).length, 1, "the single upsert is in save()");
  });

  it("the Work Order's Save persists the BOM through BomTab's own save(), and BOM changes make the Work Order dirty", () => {
    assert.match(page, /if \(bomDirty && bomSaveRef\.current\) \{\s*if \(!\(await bomSaveRef\.current\(\)\)\) throw new Error/);
    assert.match(page, /const isDirty = !readOnly && \(JSON\.stringify\(header\) !== JSON\.stringify\(lastSaved\) \|\| bomDirty\);/);
    assert.match(page, /transfer: bomTransfer,\s*onDirtyChange: setBomDirty,\s*registerSave: registerBomSave,/);
  });

  it("the BOM tab stays mounted once visited, so an unsaved transfer survives switching tabs", () => {
    assert.match(page, /<TabsContent value="BOM" forceMount className="[^"]*data-\[state=inactive\]:hidden"/);
  });
});
