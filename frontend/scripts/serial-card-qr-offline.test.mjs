// Serial Card offline QR (format NXSC/2): exactly ONE QR per label holding the card's complete
// data snapshot as compact, lossless text. Verified with two standard decoders — jsQR on QR
// images rendered the way a label printer prints them (54 mm, 203 / 300 dpi) and then degraded
// the way a phone camera captures them (downsampling, defocus blur, rotation, faded ink, mild
// sensor noise; a 5-frame burst stands in for a live scanner), and ZXing (@zxing/library) on an
// ideal render (content check: its finder search misses larger codes even in clean synthetic
// images). A simulation, not a real-phone test.
//   Run: npm run test:serial-card-qr
import assert from "node:assert/strict";
import { register } from "node:module";
import { describe, it } from "node:test";

register("./workspace-test-loader.mjs", import.meta.url);
const q = await import("@/lib/legacy-erp/serial-card-qr-text");
const { qrMatrix, qrSvg, serialNoFromQr } = await import("@/lib/legacy-erp/qr");
const L = await import("@/components/legacy-erp/serial-card-labels");
const { serialCardLabelsHtml } = L;
const { printRaster, decodeZXingIdeal, scanAtDistance, minFitDistance } = await import("./qr-capture-sim.mjs");

const PRINTED = "2026-10-14";

// ── Cards ────────────────────────────────────────────────────────────────────────────────────
const recipeLine = (code, name, pct, extra = {}) => ({ yarnInventoryId: 1, yarnCode: code, yarnName: name, percentage: pct, process: null, variant1: null, variant2: null, explanation: null, wastePct: 2, dyeWastagePct: 0, ...extra });
/** The example card from the requirement (sparse: most roll fields empty). */
const exampleCard = {
  id: 8, RecId: 8, SerialCode: "00000008", workOrderNo: "W/O-000211", styleNumber: "SC-2026-8606", styleName: "new test",
  inventoryCode: "FABRIC-00007", inventoryName: "FLAT KNIT RIB 1X1 | 320 GSM | WASH | 97% CTN 3% ploy | 16/1 pc/-/-/-",
  fabricComposition: "97% CTN 3% ploy", fabricGsm: "320", fabricWidth: null, fabricWeight: null, colorCode: "DARK DENIM", colorName: "DARK DENIM",
  variantCode: null, variantName: null, Width: 20, Weight: 852, Quantity: 20, unitCode: "KG", receiptNo: "OPS-6", PartyNo: "211",
  ManufacturingDate: null, ExpirationDate: null, ShelfLife: null, currentAccountCode: null, currentAccountName: null, qualityTypeName: null,
  resourceCode: null, ProducerSerialCode: null, Explanation: null, QuantityMT: null, Quantity3: null, RawWidth: null, RawWeight: null,
  RawLength: null, ProductLength: null, WeightM2: null, WeightMt: null, Pus: null, Fine: null, PieceCount: null,
  yarnRecipe: { status: "ok", message: null, source: "common", bomLineColorCardId: null, lines: [
    recipeLine("YARN-00008", "70-DNR LYCRA", 9.94), recipeLine("YARN-00004", "16/1 pc", 38.84), recipeLine("YARN-00003", "30/1 combed", 51.22),
  ] },
};
/** Every field filled (realistic lengths, Turkish characters, a multi-line note), 6 recipe rows. */
const fullCard = {
  ...exampleCard, SerialCode: "AF000123", fabricWidth: 180, fabricWeight: 320.5, variantCode: "VAR-0012", variantName: "Heather Grey Melange",
  colorName: "Lacivert Çizgili", ManufacturingDate: "2026-10-12T00:00:00.000Z", ExpirationDate: "2027-10-12T00:00:00.000Z", ShelfLife: 365,
  currentAccountCode: "120.01.0045", currentAccountName: "Örme Kumaş Tekstil San. Ltd. Şti.", qualityTypeName: "1st Quality A", resourceCode: "KNIT-M-07",
  ProducerSerialCode: "MFG-2026-000123", Explanation: "Edge curl right selvedge;\nQC shift B ok",
  QuantityMT: 19.85, Quantity3: 1, RawWidth: 182, RawWeight: 21.4, RawLength: 66.2, ProductLength: 64.8, WeightM2: 0.32, WeightMt: 0.31, Pus: 30, Fine: 28, PieceCount: 1,
  yarnRecipe: { status: "ok", message: null, source: "color", bomLineColorCardId: "c1", lines: Array.from({ length: 6 }, (_, i) =>
    recipeLine(`YARN-0001${i}`, "30/1 Combed Compact Cotton", 16.6667, { process: "DYED", variant1: "Navy", variant2: `Lot ${i}`, wastePct: 2.5, dyeWastagePct: 1.25 })) },
};
/** Realistic worst case: 120-character fabric name, long names everywhere, 8 recipe rows with every cell filled. */
const worstCard = {
  ...fullCard, SerialCode: "WORST-0000000000001", styleName: "Mens Slim Fit Polo Shirt Pique Summer Collection 2026",
  inventoryName: "SINGLE JERSEY LYCRA | 180 GSM | OPEN WIDTH | WASHED SILICONE SOFT | 92% COTTON 8% ELASTANE | 30/1 CB + 20D | COMPACT".slice(0, 120),
  fabricComposition: "92% Cotton 8% Elastane", currentAccountName: "Örme Kumaş Tekstil Sanayi ve Ticaret Limited Şirketi",
  Explanation: "Edge curl right selvedge; shade B; approved QC shift B",
  yarnRecipe: { status: "ok", message: null, source: "color", bomLineColorCardId: "c1", lines: Array.from({ length: 8 }, (_, i) =>
    recipeLine(`YARN-0002${i}`, "30/1 Combed Compact Ring Spun Cotton Org", 12.5, { process: "DYED+WASH", variant1: "Navy Blue", variant2: `Lot 2026-${i}`, wastePct: 2.5, dyeWastagePct: 1.25, explanation: "Main yarn" })) },
};
/** Values that collide with the format's own syntax. */
const trickyCard = {
  ...exampleCard, SerialCode: "A\\B #C", styleName: "Line one\nLine two\r\nLine three", inventoryName: "Ends with backslash \\",
  colorCode: "=", colorName: "=", variantCode: "V1", variantName: "=", PartyNo: "Key: value", Explanation: "\\n is not a newline",
  yarnRecipe: { status: "ok", message: null, source: null, lines: [recipeLine("Y|1", "pipe | and \\ backslash", 0, { process: "", variant2: "|", wastePct: 0, dyeWastagePct: 0 })] },
};
const cards = [["example", exampleCard], ["full", fullCard], ["worst", worstCard], ["tricky", trickyCard], ["empty", { RecId: 1, SerialCode: "EMPTY-1" }]];
const qrOf = (card) => q.serialCardQr(card, { printedOn: PRINTED });

// ── Tests ────────────────────────────────────────────────────────────────────────────────────
describe("NXSC/2 — one QR, complete and lossless", () => {
  it("decoding the QR text returns exactly the source snapshot: every field, the recipe status/source/message and every row and cell", () => {
    for (const [name, card] of cards) {
      const { text, snapshot } = qrOf(card);
      assert.deepEqual(q.decodeSerialCardQr(text), snapshot, name);
    }
  });

  it("the snapshot carries every field of the format and the card's actual values", () => {
    const s = qrOf(fullCard).snapshot;
    assert.equal(q.SNAPSHOT_FIELDS.length, 39);
    for (const [key] of q.SNAPSHOT_FIELDS) assert.ok(key in s, key);
    assert.equal(s.serialNo, "AF000123");
    assert.equal(s.inventoryName, fullCard.inventoryName);
    assert.equal(s.currentAccountName, "Örme Kumaş Tekstil San. Ltd. Şti.");
    assert.equal(s.Explanation, "Edge curl right selvedge;\nQC shift B ok", "line break kept, not folded");
    assert.equal(s.ManufacturingDate, "2026-10-12");
    assert.equal(s.WeightM2, 0.32);
    assert.equal(s.recipe.source, "color");
    assert.equal(s.recipe.lines.length, 6);
    assert.deepEqual(s.recipe.lines[5], { yarnCode: "YARN-00015", yarnName: "30/1 Combed Compact Cotton", process: "DYED", variant1: "Navy", variant2: "Lot 5", percentage: 16.6667, wastePct: 2.5, dyeWastagePct: 1.25, explanation: null });
  });

  it("values that look like the format's syntax survive (\\, line breaks, |, =, ': ')", () => {
    const d = q.decodeSerialCardQr(qrOf(trickyCard).text);
    assert.equal(d.serialNo, "A\\B #C");
    assert.equal(d.styleName, "Line one\nLine two\r\nLine three");
    assert.equal(d.inventoryName, "Ends with backslash \\");
    assert.equal(d.colorCode, "=");
    assert.equal(d.colorName, "=");
    assert.equal(d.variantName, "=", "a real '=' is not read as 'same as the code'");
    assert.equal(d.PartyNo, "Key: value");
    assert.equal(d.Explanation, "\\n is not a newline");
    assert.deepEqual(d.recipe.lines[0], { yarnCode: "Y|1", yarnName: "pipe | and \\ backslash", process: null, variant1: null, variant2: "|", percentage: 0, wastePct: 0, dyeWastagePct: 0, explanation: null });
    assert.equal(d.recipe.source, null);
  });

  it("a missing recipe keeps its status and explanation; a recipe not loaded is marked unavailable", () => {
    const msg = "This serial card is not linked to a Work Order, so there is no BOM to take a Yarn Recipe from.";
    const t = qrOf({ ...exampleCard, yarnRecipe: { status: "no-work-order", message: msg, source: null, lines: [] } }).text;
    assert.ok(t.includes(`Recipe: no-work-order\nRecipe Note: ${msg}`));
    assert.deepEqual(q.decodeSerialCardQr(t).recipe, { status: "no-work-order", source: null, message: msg, lines: [] });
    assert.deepEqual(q.decodeSerialCardQr(qrOf({ ...exampleCard, yarnRecipe: undefined }).text).recipe, { status: "unavailable", source: null, message: null, lines: [] });
  });

  it("the example card's QR text: labelled lines a scanner shows directly; no URL, no JSON, no secrets", () => {
    const { text } = qrOf(exampleCard);
    assert.equal(text, [
      "SERIAL CARD: 00000008", "NXSC/2 2026-10-14", "WO: W/O-000211", "Style: SC-2026-8606", "Style Name: new test", "Fabric: FABRIC-00007",
      `Fabric Name: ${exampleCard.inventoryName}`, "Comp: 97% CTN 3% ploy", "GSM: 320", "Color: DARK DENIM", "Color Name: =",
      "Width: 20", "Grams: 852", "Qty: 20", "Unit: KG", "Receipt: OPS-6", "Party: 211", "Recipe: ok common",
      "Y: YARN-00008|70-DNR LYCRA||||9.94|2|0", "Y: YARN-00004|16/1 pc||||38.84|2|0", "Y: YARN-00003|30/1 combed||||51.22|2|0",
    ].join("\n"));
    for (const [, card] of cards) assert.doesNotMatch(qrOf(card).text, /https?:\/\/|\{"|password|token|bearer/i);
  });

  it("the ERP scan box reads the QR (whole, first line only, or with line breaks dropped); earlier labels still read", () => {
    const t = qrOf(exampleCard).text;
    assert.equal(serialNoFromQr(t), "00000008");
    assert.equal(serialNoFromQr("SERIAL CARD: 00000008"), "00000008", "keyboard-wedge first line");
    assert.equal(serialNoFromQr(t.replace(/\n/g, "")), "00000008", "input box dropped the line breaks");
    assert.equal(serialNoFromQr(qrOf(trickyCard).text), "A\\B #C");
    assert.equal(serialNoFromQr("SERIAL CARD: 00000008 (2/3)\n-- ROLL (cont.) --"), "00000008", "NXSC/1 test labels");
    assert.equal(serialNoFromQr("http://erp.example.com/s/00000008"), "00000008", "link labels");
  });
});

describe("Label — one QR per card; label stock sized to the payload", () => {
  const sizeOf = (id) => L.LABEL_SIZES.find((s) => s.id === id);

  it("auto picks the smallest stock whose QR modules print >= the target; one stock per print job", () => {
    assert.equal(L.planLabelSize([qrOf(exampleCard)]).size.id, "100x60");
    assert.equal(L.planLabelSize([qrOf(fullCard)]).size.id, "100x150");
    assert.equal(L.planLabelSize([qrOf(worstCard)]).size.id, "100x150");
    assert.equal(L.planLabelSize([qrOf(exampleCard), qrOf(fullCard)]).size.id, "100x150", "the densest card decides the job's stock");
    for (const c of [exampleCard, fullCard, worstCard]) {
      const plan = L.planLabelSize([qrOf(c)]);
      assert.deepEqual(plan.belowTarget, [], c.SerialCode);
      assert.ok(L.moduleMm(qrOf(c), plan.size) >= L.TARGET_MODULE_MM);
    }
  });

  it("a chosen stock that cannot meet the target is flagged (and the print dialog is not opened automatically)", () => {
    const plan = L.planLabelSize([qrOf(worstCard)], "100x60");
    assert.equal(plan.size.id, "100x60");
    assert.deepEqual(plan.belowTarget, [{ serialNo: worstCard.SerialCode, moduleMm: 0.32, version: 36 }]);
    const html = serialCardLabelsHtml([worstCard], { printedOn: PRINTED, size: "100x60" });
    assert.match(html, /<div class="warn">On 100 × 60 mm labels the QR modules of 1 card\(s\) print smaller than 0\.5 mm \(WORST-0000000000001: 0\.32 mm\)[^<]*Choose a taller label/);
    assert.doesNotMatch(html, /window\.print\(\)/);
    assert.match(serialCardLabelsHtml([exampleCard], { printedOn: PRINTED }), /window\.print\(\)/, "auto-prints when nothing is flagged");
    assert.match(html, /@media print \{ \.toolbar \{ display: none; \} \}/, "toolbar and warning stay off the paper");
  });

  for (const id of ["100x60", "100x100", "100x150"]) {
    it(`${id}: page size, QR rendered at the stock's QR size, nothing overlapping the QR`, () => {
      const s = sizeOf(id);
      const html = serialCardLabelsHtml([exampleCard, worstCard], { printedOn: PRINTED, size: id });
      assert.match(html, new RegExp(`@page \\{ size: ${s.widthMm}mm ${s.heightMm}mm; margin: 0; \\}`));
      assert.match(html, new RegExp(`\\.qr svg \\{ display: block; width: ${s.qrMm}mm; height: ${s.qrMm}mm; \\}`));
      assert.equal((html.match(/<section class="label /g) ?? []).length, 2);
      assert.equal((html.match(/<svg /g) ?? []).length, 2, "one QR per label");
      // The QR is drawn from the matrix as vectors (viewBox = modules), never a scaled bitmap.
      const m = qrOf(worstCard).matrix;
      assert.ok(html.includes(`viewBox="0 0 ${m.size + 8} ${m.size + 8}"`));
      // Geometry: padding + details + gap + QR fit the label exactly, so text cannot run into the QR.
      if (s.layout === "side") {
        assert.ok(s.qrMm + 2 * 3 <= s.heightMm);
        assert.ok(s.widthMm - 2 * 3 - s.qrMm - 2.5 >= 30, "room for the details column");
        assert.match(html, /\.side \.info \{ flex: 1; \}/);
      } else {
        const head = L.stackedHeadMm(s);
        assert.ok(head >= 18, `details band ${head} mm`);
        assert.equal(3 + head + 2.5 + s.qrMm + 3, s.heightMm);
        assert.ok(s.qrMm <= s.widthMm - 2 * 3);
        assert.match(html, new RegExp(`\\.stacked \\.info \\{ flex: 0 0 ${head}mm; height: ${head}mm; width: 100%; \\}`));
      }
      assert.match(html, /\.info \{ min-width: 0; overflow: hidden;/, "details are clipped inside their own box");
      for (const c of [exampleCard, worstCard]) {
        assert.ok(html.includes(`<div class="serial">${c.SerialCode}</div>`), "Serial No printed");
        assert.ok(html.includes(qrSvg(qrOf(c).text, [q.LABEL_QR_LEVEL])), "QR = the card's complete snapshot");
      }
      for (const k of ["Order No", "Style", "Fabric", "Width / GSM", "Color", "Quantity", "Receipt No"]) assert.ok(html.includes(`<span class="k">${k}</span>`), k);
    });
  }

  it("no continuation labels or messaging; no server address; reprint identical", () => {
    const all = cards.map(([, c]) => c);
    const html = serialCardLabelsHtml(all, PRINTED);
    assert.equal((html.match(/<section /g) ?? []).length, all.length);
    assert.equal((html.match(/<svg /g) ?? []).length, all.length);
    assert.doesNotMatch(html, /continu|QR \d+ of \d+|scan every QR|\(\d+\/\d+\)/i);
    assert.doesNotMatch(html, /localhost|QR_PUBLIC_BASE_URL|\/s\//);
    assert.equal(serialCardLabelsHtml([exampleCard], PRINTED), serialCardLabelsHtml([exampleCard], PRINTED));
  });
});

describe("Decoding — standard libraries, simulated prints and phone scans at a distance", () => {
  const decodedSnapshot = (text) => q.decodeSerialCardQr(text);
  // 12 captures per card: 203 / 300 dpi x three practical distances (nearest at which the whole QR
  // fits the frame, from 120 mm, up to 200 mm) x light / heavy defocus blur.
  const distances = (qrMm) => {
    const d0 = Math.max(120, minFitDistance(qrMm));
    return [d0, Math.round((d0 + 200) / 2), 200];
  };
  const results = [];

  for (const [name, card] of [["example", exampleCard], ["full", fullCard], ["worst", worstCard], ["tricky", trickyCard]]) {
    it(`${name}: on its auto label, ZXing and 12/12 jsQR scans decode the one QR to the exact source snapshot`, () => {
      const { text, matrix, snapshot, bytes } = qrOf(card);
      assert.deepEqual(decodedSnapshot(decodeZXingIdeal(matrix)), snapshot, "ZXing");
      const { size } = L.planLabelSize([qrOf(card)]);
      const caps = [];
      for (const dpi of [203, 300]) {
        const print = printRaster(matrix, dpi, size.qrMm);
        for (const d of distances(size.qrMm)) for (const blur of [0.8, 1.4]) caps.push({ dpi, d, blur, frame: scanAtDistance(print, size.qrMm, d, text, { blur }) });
      }
      const ok = caps.filter((c) => c.frame > 0).length;
      results.push({ card: name, bytes, qr: `v${matrix.version} ${matrix.size}x${matrix.size} ${matrix.level}`, label: `${size.widthMm}x${size.heightMm} mm`,
        qrMm: size.qrMm, moduleMm: +L.moduleMm({ matrix }, size).toFixed(3), distancesMm: distances(size.qrMm).join("/"), scans: `${ok}/${caps.length}` });
      assert.equal(ok, caps.length, JSON.stringify(caps.filter((c) => !c.frame)));
    });
  }

  it("reports label, QR size, module size and decode results per card (plus 250 mm and the other stocks, for comparison)", () => {
    const extra = [];
    for (const [name, card] of [["full", fullCard], ["worst", worstCard]]) {
      const { text, matrix } = qrOf(card);
      for (const s of L.LABEL_SIZES) {
        let ok = 0, n = 0;
        for (const dpi of [203, 300]) {
          const print = printRaster(matrix, dpi, s.qrMm);
          for (const d of [...distances(s.qrMm), 250]) for (const blur of [0.8, 1.4]) { n++; if (scanAtDistance(print, s.qrMm, d, text, { blur })) ok++; }
        }
        extra.push({ card: name, label: s.id, qrMm: s.qrMm, moduleMm: +L.moduleMm({ matrix }, s).toFixed(3), distancesMm: [...distances(s.qrMm), 250].join("/"), scans: `${ok}/${n}` });
      }
    }
    console.table(results);
    console.table(extra);
  });

  // A real GET /legacy-erp/serial-cards/labels row, saved by the backend test:
  //   (nexuscore-backend) SERIAL_CARD_LABEL_FIXTURE=<file> npm run test:serial-cards
  //   (frontend)          SERIAL_CARD_LABEL_FIXTURE=<file> npm run test:serial-card-qr
  it("a real labels API response: one QR that decodes to its exact snapshot", { skip: !process.env.SERIAL_CARD_LABEL_FIXTURE && "set SERIAL_CARD_LABEL_FIXTURE" }, async () => {
    const { readFileSync } = await import("node:fs");
    const card = JSON.parse(readFileSync(process.env.SERIAL_CARD_LABEL_FIXTURE, "utf8"));
    const { text, matrix, snapshot, bytes } = qrOf(card);
    assert.equal(snapshot.recipe.lines.length, card.yarnRecipe.lines.length);
    assert.deepEqual(decodedSnapshot(decodeZXingIdeal(matrix)), snapshot);
    const { size } = L.planLabelSize([qrOf(card)]);
    assert.ok(scanAtDistance(printRaster(matrix, 203, size.qrMm), size.qrMm, 150, text) > 0);
    console.log(`real API card ${card.SerialCode}: ${bytes} B, v${matrix.version} ${matrix.level}, label ${size.id}, module ${L.moduleMm({ matrix }, size).toFixed(3)} mm`);
  });

  it("text beyond any QR's capacity is refused, never cut", () => {
    assert.throws(() => qrMatrix("x".repeat(3000), ["M"]), /too large/);
  });
});
