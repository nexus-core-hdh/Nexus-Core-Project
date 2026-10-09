// useGridColumns column-order reconciliation (hooks/use-grid-columns.ts → mergeDeclaredOrder), driven
// the way the Packing List detail grid uses it: the grid mounts before the Work Order has loaded
// (no size columns yet), then the Order's sizes arrive as new declared columns.
//   Run: npm run test:grid-columns
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { describe, it } from "node:test";

register("./workspace-test-loader.mjs", import.meta.url);
const { mergeDeclaredOrder } = await import("@/hooks/use-grid-columns");

// Packing List's reorderable columns, as packing-lists/page.tsx declares them around the sizes.
const BEFORE = ["styleWeight", "packageWeight"];
const AFTER = ["inBox", "total", "netWeight", "totalPackageWeight", "grossWeight"];
const FIXED = ["startBox", "endBox", "orderLine", "color"];
const declared = (sizes) => [...BEFORE, ...sizes.map((s) => `size:${s}`), ...AFTER];
// What useGridColumns renders: fixed columns, then the effective order minus hidden, limited to declared columns.
const rendered = (order, sizes, hidden = new Set()) => {
  const known = new Set([...FIXED, ...declared(sizes)]);
  return [...FIXED, ...mergeDeclaredOrder(order, declared(sizes)).filter((k) => !hidden.has(k))].filter((k) => known.has(k));
};
const sizeCols = (cols) => cols.filter((k) => k.startsWith("size:")).map((k) => k.slice(5));
const MOUNT_ORDER = declared([]); // columnOrder state seeded at mount, before any Work Order

describe("Packing List detail grid size columns", () => {
  it("sizes that arrive after mount are rendered — after Package Weight, before In Box Qty, in Order sequence", () => {
    const sizes = ["6Y", "10Y", "XXS", "XS", "S", "M"];
    assert.deepEqual(rendered(MOUNT_ORDER, sizes), [
      ...FIXED, "styleWeight", "packageWeight",
      "size:6Y", "size:10Y", "size:XXS", "size:XS", "size:S", "size:M",
      "inBox", "total", "netWeight", "totalPackageWeight", "grossWeight",
    ]);
  });

  for (const sizes of [["S", "M"], ["6Y", "10Y", "XXS", "XS", "S", "M"], ["XL", "XS", "M"], ["04Y", "02Y", "05Y"]]) {
    it(`detail-grid sizes === summary sizes (count, labels, order): ${sizes.join(" ")}`, () => {
      assert.deepEqual(sizeCols(rendered(MOUNT_ORDER, sizes)), sizes);
    });
  }

  it("changing the Work Order swaps the size columns — none inherited from the previous Order", () => {
    assert.deepEqual(sizeCols(rendered(MOUNT_ORDER, ["03M", "06M", "09M"])), ["03M", "06M", "09M"]);
    assert.deepEqual(sizeCols(rendered(MOUNT_ORDER, ["S", "M", "L", "XL"])), ["S", "M", "L", "XL"]);
  });

  it("a restored saved layout (sanitized without sizes) still shows every size, and keeps the user's own reordering", () => {
    const saved = ["styleWeight", "total", "inBox", "packageWeight", "netWeight", "totalPackageWeight", "grossWeight"];
    assert.deepEqual(rendered(saved, ["S", "M"]).slice(4), ["styleWeight", "total", "inBox", "packageWeight", "size:S", "size:M", "netWeight", "totalPackageWeight", "grossWeight"]);
  });

  it("a size the user hid stays hidden; new sizes still appear", () => {
    const hidden = new Set(["size:XS"]);
    assert.deepEqual(sizeCols(rendered(MOUNT_ORDER, ["XS", "S", "M"], hidden)), ["S", "M"]);
  });

  it("no duplicate columns", () => {
    const cols = rendered([...MOUNT_ORDER, "size:S"], ["S", "M"]);
    assert.equal(new Set(cols).size, cols.length);
  });
});

describe("grids with a static column set are unchanged", () => {
  it("returns the very same order when nothing is missing", () => {
    const order = ["a", "c", "b"];
    assert.equal(mergeDeclaredOrder(order, ["a", "b", "c"]), order);
  });
  it("a declared column with no known predecessor goes first", () => {
    assert.deepEqual(mergeDeclaredOrder(["b", "c"], ["a", "b", "c"]), ["a", "b", "c"]);
  });
});

describe("Packing List page wiring", () => {
  const src = readFileSync(new URL("../app/dashboard/(auth)/legacy-erp/packing-lists/page.tsx", import.meta.url), "utf8");
  it("grid columns, row cells, totals and the summary all read the ONE `sizes` array", () => {
    assert.match(src, /const sizes = ctx\?\.sizes \?\? \[\];/);
    assert.match(src, /\.\.\.sizes\.map\(\(s\) => \(\{ key: sizeCol\(s\)/, "grid columns");
    assert.match(src, /packingTotals\(lines\.map\(asCalcLine\), sizes\)/, "totals");
    assert.match(src, /\{sizes\.map\(\(s\) => <th key=\{s\}/, "summary columns");
    assert.match(src, /line\.quantities\[size\]/, "row cells read quantities by size code");
  });
  it("column widths fall back to each column's declared default (never undefined for late columns)", () => {
    assert.match(src, /<col key=\{c\.key\} style=\{\{ width: gridColumns\.getWidth\(c\.key\) \}\} \/>/);
    assert.doesNotMatch(src, /gridColumns\.colWidths\[/);
  });
});
