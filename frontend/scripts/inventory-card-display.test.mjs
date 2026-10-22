// Inventory card listings (standard column order, Stock In Hand / Unit separation) and Customized
// Worklist display (readable Unit / Current Account labels and values, saved-worklist reload).
//   Run: npm run test:inventory-card-display
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { describe, it } from "node:test";

register("./workspace-test-loader.mjs", import.meta.url);
const { humanizeColumn, worklistFieldLabel, savedWorklistFieldLabel } = await import("@/lib/legacy-erp/humanize");
const { worklistCellValue } = await import("@/lib/legacy-erp/worklist-types");

const src = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const LISTS = {
  "Yarn Cards": "app/[company]/(auth)/legacy-erp/yarn-cards-list/page.tsx",
  "Fabric Cards": "app/[company]/(auth)/legacy-erp/fabric-cards-list/page.tsx",
  "Trim Cards": "app/[company]/(auth)/legacy-erp/trim-inventory-cards-list/page.tsx",
};

describe("inventory card listings — standard column layout", () => {
  const stock = src("components/legacy-erp/stock-value.tsx");
  const hookBody = stock.slice(stock.indexOf("export function useStockValueColumns"), stock.indexOf("export function StockValueSummary"));

  it("the shared stock columns are Stock In Hand, Unit, Stock Value — in that order", () => {
    const keys = [...hookBody.matchAll(/key: "(\w+)", label: "([^"]+)"/g)].map((m) => `${m[1]}:${m[2]}`);
    assert.deepEqual(keys, ["stockOnHand:Stock In Hand", "stockUnit:Unit", "stockValue:Stock Value"]);
  });

  it("Stock In Hand shows the quantity only; the unit is its own column (a name, never an id)", () => {
    const stockInHand = hookBody.slice(hookBody.indexOf('key: "stockOnHand"'), hookBody.indexOf('key: "stockUnit"'));
    assert.doesNotMatch(stockInHand, /stockUnit/, "no unit appended to the quantity");
    const unit = hookBody.slice(hookBody.indexOf('key: "stockUnit"'), hookBody.indexOf('key: "stockValue"'));
    assert.match(unit, /row\.stockUnit/);
    assert.doesNotMatch(unit, /unitId/i);
  });

  for (const [name, file] of Object.entries(LISTS)) {
    it(`${name}: Code, Name, Special Code, Stock In Hand, Unit, Stock Value, Status, then Actions`, () => {
      const page = src(file);
      const standard = page.slice(page.indexOf("const columns: WorklistTableColumn"), page.indexOf("const getRowActions"));
      const order = [...standard.matchAll(/key: "(\w+)"|\.\.\.stockColumns/g)].map((m) => m[1] ?? "stock");
      assert.deepEqual(order.filter((k) => k !== undefined), ["inventoryCode", "inventoryName", "specialCode", "stock", "status"]);
      assert.match(page, /renderRowActions=/, "actions are the trailing column");
    });
  }

  it("the combined Inventory Card list uses the same stock columns (no separate unit/stock renderers)", () => {
    const view = src("components/legacy-erp/inventory-cards-list-view.tsx");
    assert.match(view, /\.\.\.stockColumns,/);
    assert.doesNotMatch(view, /key: "unit", label: "Unit"/);
    assert.doesNotMatch(view, /key: "stockOnHand", label: "Stock On Hand"/);
  });

  it("card detail screens show Stock In Hand and Unit as separate values", () => {
    const summary = stock.slice(stock.indexOf("export function StockValueSummary"));
    assert.match(summary, /cell\("Stock In Hand", data\.stockOnHand == null \? "—" : format\(data\.stockOnHand, "quantity"\)\)/);
    assert.match(summary, /cell\("Unit", data\.stockUnit \|\| "—"\)/);
    for (const page of ["yarn-cards", "fabric-cards", "trim-inventory-cards"]) {
      assert.match(src(`app/[company]/(auth)/legacy-erp/${page}/page.tsx`), /<StockValueSummary id=\{itemId\}/);
    }
  });
});

describe("Customized Worklist — readable Unit and Current Account", () => {
  it("default labels say what the column shows", () => {
    assert.equal(worklistFieldLabel("UnitId"), "Unit");
    assert.equal(worklistFieldLabel("CurrentAccountId"), "Current Account");
    assert.equal(worklistFieldLabel("InventoryCode"), "Inventory Code", "other fields unchanged");
  });

  it("a saved worklist reloads with readable headers; labels the user typed are kept", () => {
    // Exactly what UserSettings.tablePreferences holds after Save — round-tripped through JSON.
    const saved = JSON.parse(JSON.stringify([{
      id: "w1", name: "Stock view",
      fields: [
        { source: "yarn-card", key: "UnitId", label: humanizeColumn("UnitId") }, // created before this change: "Unit Id"
        { source: "yarn-card", key: "CurrentAccountId", label: worklistFieldLabel("CurrentAccountId") }, // created after
        { source: "yarn-card", key: "UnitId", label: "Base UoM" }, // typed by the user
      ],
    }]));
    assert.deepEqual(saved[0].fields.map(savedWorklistFieldLabel), ["Unit", "Current Account", "Base UoM"]);
  });

  it("client-projected worklists (Work Orders, Packing Lists, Related Receipts) show names, not ids", () => {
    const row = { currentAccountId: 42, currentAccountName: "Acme Ltd", unitId: 7, unitName: "KG", workOrderNo: "WO-1" };
    assert.equal(worklistCellValue(row, "currentAccountId"), "Acme Ltd");
    assert.equal(worklistCellValue(row, "unitId"), "KG");
    assert.equal(worklistCellValue(row, "workOrderNo"), "WO-1");
    assert.equal(worklistCellValue({ currentAccountId: 42 }, "currentAccountId"), 42, "no name available → raw value, nothing hidden");
    assert.equal(row.currentAccountId, 42, "the id stays on the row");
  });
});
