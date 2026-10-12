// Work Order BOM — Transfer from Style Card (five options) as an unsaved edit. Covers the real
// line <-> row mapping and transfer application BomTab uses (work-order-bom-lines.ts) and the
// screen wiring that defers persistence to the Work Order's Save.   Run: npm run test:bom-transfer
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { describe, it } from "node:test";

register("./workspace-test-loader.mjs", import.meta.url);
const COMPONENTS = "../app/dashboard/(auth)/plm/style-cards/[id]/_components";
const { workOrderLineToBomRow, workOrderRowToRecipeLine, replaceTransferredRows, STYLE_CARD_TRANSFER_OPTIONS } = await import(`${COMPONENTS}/work-order-bom-lines.ts`);

const TYPES = ["fabric", "trim", "ornament", "process"];

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

describe("Transfer from Style Card options", () => {
  it("exactly the five options, in order, each mapped to its transfer type", () => {
    assert.deepEqual(STYLE_CARD_TRANSFER_OPTIONS.map((o) => [o.label, o.lineType ?? "ALL"]), [
      ["Transfer Recipe All Detail", "ALL"],
      ["Transfer Fabric Recipe Detail", "fabric"],
      ["Transfer Trim Recipe Detail", "trim"],
      ["Transfer Ornament Details", "ornament"],
      ["Transfer Process Details", "process"],
    ]);
  });

  // The grid as loaded from the saved BOM: one saved row of every type.
  const savedRows = TYPES.map((lt) => workOrderLineToBomRow({ id: `saved-${lt}`, lineType: lt, explanation: `saved ${lt}` }, {}));
  const toRow = (l) => ({ ...workOrderLineToBomRow(l, {}), id: `new-${l.lineType}` });
  // What the read-only API returns per option: all four types, or only the option's own type.
  const styleLines = Object.fromEntries(TYPES.map((lt) => [lt, [{ explanation: `style ${lt}` }]]));
  const resultFor = (option) => (option.lineType ? { [option.lineType]: styleLines[option.lineType] } : styleLines);
  const byType = (rows) => Object.fromEntries(TYPES.map((lt) => [lt, rows.filter((r) => r.lineType === lt).map((r) => r.explanation)]));

  for (const option of STYLE_CARD_TRANSFER_OPTIONS) {
    it(`"${option.label}" replaces ${option.lineType ? `only the ${option.lineType} rows` : "the rows of every type"}`, () => {
      const rows = byType(replaceTransferredRows(savedRows, resultFor(option), toRow));
      for (const lt of TYPES) {
        const replaced = !option.lineType || option.lineType === lt;
        assert.deepEqual(rows[lt], [replaced ? `style ${lt}` : `saved ${lt}`], lt);
      }
    });
  }

  it("All Detail empties a type the Style Card has no lines for (as the all-types transfer always did)", () => {
    const rows = byType(replaceTransferredRows(savedRows, { ...styleLines, process: [] }, toRow));
    assert.deepEqual(rows.process, []);
    assert.deepEqual(rows.fabric, ["style fabric"]);
  });

  it("does not mutate the rows it was given", () => {
    const before = JSON.stringify(savedRows);
    replaceTransferredRows(savedRows, styleLines, toRow);
    assert.equal(JSON.stringify(savedRows), before);
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
  });

  it("the button opens the five-option menu; each option passes its own type to the read-only transfer", () => {
    assert.match(page, /<DropdownMenuTrigger asChild>\s*<Button[^>]*>\s*<ArrowDownToLine[^>]*\/>Transfer from Style Card/);
    assert.match(page, /\{STYLE_CARD_TRANSFER_OPTIONS\.map\(\(option\) => \(\s*<DropdownMenuItem key=\{option\.key\}[^>]*onSelect=\{\(\) => transferFromStyleCard\(option\)\}>/);
    assert.match(page, /previewBomTransferFromStyleCard\(woId, styleCardId, option\.lineType\)/);
  });

  it("the transfer goes into BomTab's in-memory rows, and no upsert runs outside save()", () => {
    assert.match(bomTab, /setRows\(\(rs\) => replaceTransferredRows\(rs, t\.linesByType, toRow\)\)/);
    assert.equal((bomTab.match(/workOrders\.upsertBom\(/g) ?? []).length, 1, "the single upsert is in save()");
  });

  it("the Work Order's Save persists the BOM through BomTab's own save(), and BOM changes make the Work Order dirty", () => {
    assert.match(page, /if \(bomDirty && bomSaveRef\.current\) \{\s*if \(!\(await bomSaveRef\.current\(\)\)\) throw new Error/);
    assert.match(page, /const isDirty = !readOnly && \(JSON\.stringify\(header\) !== JSON\.stringify\(lastSaved\) \|\| bomDirty \|\| udfDirty\);/);
    assert.match(page, /transfer: bomTransfer,\s*onDirtyChange: setBomDirty,\s*registerSave: registerBomSave,/);
  });

  it("Customized Fields are validated before the Work Order is written and stored by the same Save, before the reload", () => {
    assert.match(page, /const save = async \(\) => \{\s*\/\/[^\n]*\n\s*if \(udfRef\.current && !udfRef\.current\.validate\(\)\) \{ setOuterTab\("Customized Fields"\); return; \}\s*setSaving\(true\);/);
    assert.match(page, /await udfRef\.current\?\.save\(String\(id\)\);[\s\S]*?toast\.success\("Work order saved"\);[\s\S]*?await load\(id!\);/);
    assert.match(page, /<CustomizedFieldsPanel ref=\{udfRef\} entity="WorkOrder" entityId=\{woId \? String\(woId\) : null\} readOnly=\{readOnly\} saveWithDocument onDirtyChange=\{setUdfDirty\} \/>/);
    assert.doesNotMatch(page, /No existing custom-fields structure identified for Work Order/);
  });

  it("the BOM tab stays mounted once visited, so an unsaved transfer survives switching tabs", () => {
    assert.match(page, /<TabsContent value="BOM" forceMount className="[^"]*data-\[state=inactive\]:hidden"/);
  });
});
