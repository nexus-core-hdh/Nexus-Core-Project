// Cutting Card modes (lib/legacy-erp/cutting-modes.ts): both modes open the same Cutting Entry
// screen, where each mode opens, Complete Order's one size-wise summary, and that each mode's screen
// keeps its own workspace tab (one per Work Order for Complete Order, one per color for Colour-wise).
//   Run: npm run test:cutting-modes
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { describe, it } from "node:test";

register("./workspace-test-loader.mjs", import.meta.url);

const { CUTTING_MODES, cuttingHref, orderSummaryRows } = await import("@/lib/legacy-erp/cutting-modes");
const { tabKeyForHref } = await import("@/lib/workspace/registry");
const page = (p) => readFileSync(new URL(`../app/[company]/(auth)/legacy-erp/cutting-card/${p}`, import.meta.url), "utf8");

describe("Cutting modes", () => {
  it("offers exactly Colour-wise and Complete Order", () => {
    assert.deepEqual(CUTTING_MODES.map((m) => [m.value, m.label]), [["color", "Colour-wise"], ["order", "Complete Order"]]);
  });

  it("both modes render the same Cutting Entry screen, only the mode differs", () => {
    const screenImport = 'import { CuttingEntryScreen } from "@/components/legacy-erp/cutting-entry-screen";';
    for (const [file, mode] of [["entry/page.tsx", "color"], ["order/page.tsx", "order"]]) {
      const src = page(file);
      assert.ok(src.includes(screenImport), `${file} uses the shared screen`);
      assert.match(src, new RegExp(`return <CuttingEntryScreen mode="${mode}" />;`));
    }
  });

  it("Colour-wise opens Cutting Entry for the color; Complete Order opens it for the whole order", () => {
    assert.equal(cuttingHref("color", 246, "MIXED GRAY R-5"), "/legacy-erp/cutting-card/entry?id=246&color=MIXED%20GRAY%20R-5");
    assert.equal(cuttingHref("order", 246), "/legacy-erp/cutting-card/order?id=246");
  });

  it("each mode keeps its own tab: Complete Order one per Work Order, Colour-wise one per color", () => {
    assert.equal(tabKeyForHref(cuttingHref("order", 246)), "/legacy-erp/cutting-card/order?id=246");
    assert.notEqual(tabKeyForHref(cuttingHref("order", 246)), tabKeyForHref(cuttingHref("order", 247)));
    assert.equal(tabKeyForHref(cuttingHref("color", 246, "RED")), "/legacy-erp/cutting-card/entry?color=RED");
    assert.notEqual(tabKeyForHref(cuttingHref("color", 246, "RED")), tabKeyForHref(cuttingHref("order", 246)), "switching mode never reuses the other mode's tab");
  });
});

describe("Complete Order summary rows", () => {
  it("one row per size, in the server's size order, with the server's consolidated figures", () => {
    const bySize = {
      M: { orderQty: 20, willBeCutQty: 22, cutQty: 30, less: 0, over: 8 },
      S: { orderQty: 15, willBeCutQty: 17, cutQty: 7, less: 10, over: 0 },
    };
    assert.deepEqual(orderSummaryRows(["S", "M", "L"], bySize), [
      { sizeCode: "S", orderQty: 15, willBeCutQty: 17, cutQty: 7, less: 10, over: 0 },
      { sizeCode: "M", orderQty: 20, willBeCutQty: 22, cutQty: 30, less: 0, over: 8 },
      { sizeCode: "L", orderQty: 0, willBeCutQty: 0, cutQty: 0, less: 0, over: 0 },
    ]);
  });
});
