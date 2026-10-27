// Style Card Route → Route Code, and its Work Order Style Info display (lib/plm/route-code.ts).
//   Run: npm run test:route-code
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { describe, it } from "node:test";

register("./workspace-test-loader.mjs", import.meta.url);
const { effectiveRouteCode, routeCodeAfterRouteChange } = await import("@/lib/plm/route-code");

const STANDARD = { id: "r1", name: "STANDARD ROUTE", code: "03" };
const WASH = { id: "r2", name: "WASH ROUTE", code: "07" };
const NO_CODE = { id: "r3", name: "NO CODE ROUTE", code: "" };

describe("effective Route Code (Style Card → Work Order)", () => {
  it("a blank saved Route Code (existing records) falls back to the selected Route's master code", () => {
    assert.equal(effectiveRouteCode({ bomRouteCode: null, bomRouteCard: STANDARD }), "03");
    assert.equal(effectiveRouteCode({ bomRouteCode: "  ", bomRouteCard: STANDARD }), "03");
  });
  it("a saved Route Code wins over the Route's code", () => {
    assert.equal(effectiveRouteCode({ bomRouteCode: "R-77", bomRouteCard: STANDARD }), "R-77");
  });
  it("no Route, or a Route without a code: blank — never the Route's name", () => {
    assert.equal(effectiveRouteCode({ bomRouteCode: null, bomRouteCard: null }), "");
    assert.equal(effectiveRouteCode({ bomRouteCode: null, bomRouteCard: NO_CODE }), "");
    assert.equal(effectiveRouteCode(null), "");
  });
});

describe("Route Code when the Route picker changes", () => {
  it("selecting a Route fills a blank Route Code with its code", () => {
    assert.equal(routeCodeAfterRouteChange("", undefined, STANDARD), "03");
  });
  it("changing the Route replaces a code that came from the previous Route", () => {
    assert.equal(routeCodeAfterRouteChange("03", STANDARD, WASH), "07");
  });
  it("a Route Code typed in by hand is kept", () => {
    assert.equal(routeCodeAfterRouteChange("R-77", STANDARD, WASH), "R-77");
  });
  it("clearing the Route clears its code; a Route without a code leaves it blank", () => {
    assert.equal(routeCodeAfterRouteChange("03", STANDARD, undefined), "");
    assert.equal(routeCodeAfterRouteChange("03", STANDARD, NO_CODE), "");
  });
});

describe("the screens use it", () => {
  const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
  const wo = read("../app/[company]/(auth)/legacy-erp/work-orders/page.tsx");
  const bom = read("../app/[company]/(auth)/plm/style-cards/[id]/_components/bom-tab.tsx");
  it("Work Order: create-from-Style, Select Style, Refresh and reopening an existing Work Order all use the effective code", () => {
    assert.ok(!/routeCode:\s*card\.bomRouteCode/.test(wo), "no Route Code taken from the free-text field alone");
    assert.equal((wo.match(/effectiveRouteCode\(card\)/g) ?? []).length, 3, "auto-select, Select Style, Refresh");
    assert.match(wo, /routeCode: effectiveRouteCode\(linkedStyleCard\) \|\| r\.routeCode/, "existing Work Order load");
  });
  it("Style Card: the Route picker applies the rule and the blank Route Code shows the Route's code", () => {
    assert.match(bom, /bomRouteCode: routeCodeAfterRouteChange\(h\.bomRouteCode,/);
    assert.match(bom, /placeholder=\{effectiveRouteCode\(\{ bomRouteCard:/);
  });
});
