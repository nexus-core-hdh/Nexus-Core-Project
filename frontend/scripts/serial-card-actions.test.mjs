// Serial Cards: QR labels (a link to the card's scan page), the full-row update mapper (Update /
// Copy Column never wipe fields the form doesn't show), and the page's selection-aware wiring.
//   Run: npm run test:serial-card-actions
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { describe, it } from "node:test";

register("./workspace-test-loader.mjs", import.meta.url);
const { qrMatrix, qrSvg, utf8ByteString, serialNoFromQr, isLocalQrLink } = await import("@/lib/legacy-erp/qr");
const { safeNextPath } = await import("@/lib/safe-next");
const { serialCardToUpdateItem } = await import("@/lib/legacy-erp/serial-card-update");
const { serialCardLabelsHtml } = await import("@/components/legacy-erp/serial-card-labels");
const { serialCardQr } = await import("@/lib/legacy-erp/serial-card-qr-text");

const React = (await import("react")).default;
const { renderToStaticMarkup } = await import("react-dom/server");

const src = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

// A label's QR text as the backend builds it (serialCardQrUrl): a short link to the card's page.
const link = (serialNo, base = "https://erp.example.com") => `${base}/s/${encodeURIComponent(serialNo)}`;

describe("QR Code (qrcode-generator, UTF-8 byte mode)", () => {
  it("UTF-8 encodes before handing bytes to the encoder (special characters survive)", () => {
    const s = utf8ByteString("ü€汉");
    assert.deepEqual([...s].map((c) => c.charCodeAt(0)), [...new TextEncoder().encode("ü€汉")]);
    assert.ok([...s].every((c) => c.charCodeAt(0) <= 255));
  });

  it("a label link is a small QR with high error correction (easy to scan, tolerant of wear)", () => {
    const m = qrMatrix(link("00000042"));
    assert.equal(m.level, "Q");
    assert.ok(m.version <= 4, `version ${m.version}`);
    assert.equal(m.size, 17 + 4 * m.version);
    for (const [r, c] of [[0, 0], [0, m.size - 7], [m.size - 7, 0]]) {
      assert.ok(m.isDark(r, c) && m.isDark(r + 6, c + 6) && !m.isDark(r + 1, c + 1) && m.isDark(r + 3, c + 3), "finder pattern");
    }
  });

  it("falls back to lower error correction for long text, then refuses text too large for any QR", () => {
    assert.equal(qrMatrix("x".repeat(2500)).level, "L");
    assert.throws(() => qrMatrix("x".repeat(3000)), /too large for a QR Code/);
    assert.throws(() => qrMatrix(""), /Nothing to encode/);
  });

  it("SVG: square, 4-module quiet zone, deterministic, distinct per card", () => {
    const svg = qrSvg(link("00000042"));
    const m = qrMatrix(link("00000042"));
    assert.match(svg, new RegExp(`viewBox="0 0 ${m.size + 8} ${m.size + 8}"`));
    assert.equal(qrSvg(link("00000042")), svg);
    assert.notEqual(qrSvg(link("00000043")), svg);
  });

  it("the ERP scan box reads the new label link and older JSON labels; other text is not a QR", () => {
    assert.equal(serialNoFromQr(link("00000042")), "00000042");
    assert.equal(serialNoFromQr(`${link("A/B #C")}`), "A/B #C", "encoded Serial No decoded");
    assert.equal(serialNoFromQr('{"schema":"nexuscore.serial-card/1","serialNo":"00000017"}'), "00000017", "older JSON label");
    assert.equal(serialNoFromQr("https://example.com/other"), null);
    assert.equal(serialNoFromQr("00000042"), null);
    assert.equal(serialNoFromQr("{not json"), null);
  });

  it("flags links a phone can't open", () => {
    assert.equal(isLocalQrLink("http://localhost:3000/s/1"), true);
    assert.equal(isLocalQrLink("http://127.0.0.1:3000/s/1"), true);
    assert.equal(isLocalQrLink("http://192.168.0.28:3000/s/1"), false);
    assert.equal(isLocalQrLink("https://erp.example.com/s/1"), false);
  });
});

describe("Safe login return path (?next=)", () => {
  it("accepts same-origin paths only", () => {
    assert.equal(safeNextPath("/s/00000042"), "/s/00000042");
    assert.equal(safeNextPath("/s/A%2FB%20%23C"), "/s/A%2FB%20%23C");
    for (const bad of ["https://evil.example", "//evil.example/x", "/\\evil.example", "javascript:alert(1)", "s/1", "", null]) {
      assert.equal(safeNextPath(bad), null, String(bad));
    }
  });
});

describe("serialCardToUpdateItem — a complete row for SerialCardService.update()", () => {
  const card = {
    RecId: 9, Explanation: "e", PartyNo: "P1", QualityTypeId: 2, ResourceId: 3, EmployeeId: 4, CurrentAccountId: 5,
    ProducerSerialCode: "M1", ManufacturingDate: "2026-01-02T00:00:00.000Z", ExpirationDate: "2027-01-02T00:00:00.000Z", ShelfLife: 12,
    Quantity: "10.5", QuantityMT: 2, Quantity3: 3, Width: 150, Weight: 200, RawWidth: 1, RawWeight: 2, RawLength: 3,
    ProductLength: 4, WeightM2: 5, WeightMt: 6, Pus: 7, Fine: 8, PieceCount: 9,
  };

  it("maps every field the backend writes — including the ones the Update form doesn't show", () => {
    const item = serialCardToUpdateItem(card);
    assert.deepEqual(item, {
      id: 9, explanation: "e", partyNo: "P1", qualityTypeId: 2, resourceId: 3, employeeId: 4, currentAccountId: 5,
      producerSerialCode: "M1", manufacturingDate: "2026-01-02T00:00:00.000Z", expirationDate: "2027-01-02T00:00:00.000Z", shelfLife: 12,
      quantity: 10.5, quantityMT: 2, quantity3: 3, width: 150, weight: 200, rawWidth: 1, rawWeight: 2, rawLength: 3,
      productLength: 4, weightM2: 5, weightMt: 6, pus: 7, fine: 8, pieceCount: 9,
    });
    const svc = readFileSync(new URL("../../nexuscore-backend/src/modules/legacy-erp/serial-card.service.ts", import.meta.url), "utf8");
    const fields = svc.slice(svc.indexOf("export interface SerialCardFieldDefaults"), svc.indexOf("}", svc.indexOf("export interface SerialCardFieldDefaults")));
    for (const [, name] of fields.matchAll(/^\s+(\w+)\?:/gm)) assert.ok(name in item, `backend field ${name} mapped`);
  });

  it("blank / missing values become null", () => {
    const item = serialCardToUpdateItem({ RecId: 1, Quantity: "", Width: undefined });
    assert.equal(item.quantity, null);
    assert.equal(item.width, null);
    assert.equal(item.currentAccountId, null);
  });

  it("the Update dialog builds on the card, so hidden fields survive a save", () => {
    const dlg = src("components/legacy-erp/serial-card-edit-dialog.tsx");
    assert.match(dlg, /serialCardToUpdateItem\(\{ \.\.\.card, \.\.\.form, RecId: card\.RecId \}\)/);
  });
});

describe("Label — QR label per card", () => {
  const card = (serialNo, extra = {}) => ({
    RecId: Number(serialNo), SerialCode: serialNo, workOrderNo: "W/O-000211", styleNumber: "SC-2026-8606", styleName: "Polo <Slim> & Co.",
    inventoryCode: "FABRIC-00007", inventoryName: "FLAT KNIT RIB", colorName: "DARK DENIM", variantName: "DARK DENIM",
    Width: 72, Weight: null, fabricGsm: "320", Quantity: 45, unitCode: "KG", receiptNo: "OPS-6", ...extra,
  });

  it("each label: the card's own data QR plus Serial No, Order, Style, Fabric, Width / GSM, Color, Quantity, Receipt", () => {
    const html = serialCardLabelsHtml([card("00000042"), card("00000043")], "2026-10-14");
    assert.equal((html.match(/<section class="label side">/g) ?? []).length, 2, "typical cards: the compact 100 x 60 layout");
    for (const s of ["00000042", "00000043"]) {
      const first = serialCardQr(card(s), { printedOn: "2026-10-14" });
      assert.ok(first.text.startsWith(`SERIAL CARD: ${s}`));
      assert.ok(html.includes(qrSvg(first.text, ["M"])), `QR = card ${s}'s own data`);
    }
    assert.match(html, /<div class="serial">00000042<\/div>/, "Serial No printed beside the QR");
    for (const [k, v] of [["Order No", "W/O-000211"], ["Style", "SC-2026-8606 — Polo &lt;Slim&gt; &amp; Co\\."], ["Fabric", "FABRIC-00007 — FLAT KNIT RIB"], ["Width / GSM", "72 / 320"], ["Color", "DARK DENIM"], ["Quantity", "45 KG"], ["Receipt No", "OPS-6"]]) {
      assert.match(html, new RegExp(`<span class="k">${k}</span><span class="v[^"]*">${v}</span>`), k);
    }
    assert.doesNotMatch(html, /<Slim>/, "escaped");
    assert.match(html, /\.qr svg \{ display: block; width: 54mm; height: 54mm; \}/, "scannable size");
    assert.doesNotMatch(html, /class="warn"|localhost|QR_PUBLIC_BASE_URL/, "no server address involved");
    assert.equal(serialCardLabelsHtml([card("00000042")], "2026-10-14"), serialCardLabelsHtml([card("00000042")], "2026-10-14"), "reprint identical");
  });

  it("prints without any ERP address (a card with an earlier link payload is ignored)", () => {
    const html = serialCardLabelsHtml([card("7", { qrPayload: link("7", "http://localhost:3000") })], "2026-10-14");
    assert.doesNotMatch(html, /localhost|\/s\/7/);
  });
});

describe("Scan, detail and Generate dialog", () => {
  const page = src("app/dashboard/(auth)/legacy-erp/serial-cards/page.tsx");
  const dialog = src("components/legacy-erp/serial-card-edit-dialog.tsx");
  const gen = src("components/legacy-erp/generate-serial-cards-dialog.tsx");

  it("scanning a QR (or typing a Serial No) looks the card up and opens its detail", () => {
    assert.match(page, /const code = serialNoFromQr\(scanCode\) \?\? scanCode\.trim\(\);/);
    assert.match(page, /legacyErpApi\.serialCards\.byCode\(code\)/);
    assert.match(page, /setEditTarget\(\{ card: \{ \.\.\.found, id: found\.RecId \}, mode: "view" \}\)/);
    assert.match(page, /if \(e\.key === "Enter"\) \{ e\.preventDefault\(\); void scan\(\); \}/);
  });

  it("every Label button prints from the labels API (page, detail reprint, Generate dialog)", () => {
    assert.match(page, /printSerialCardLabels\(\(\) => legacyErpApi\.serialCards\.labels\(ids\) as Promise<any>\)/);
    assert.match(dialog, /printSerialCardLabels\(\(\) => legacyErpApi\.serialCards\.labels\(\[card\.RecId\]\) as Promise<any>\)/);
    assert.match(gen, /const ids = rows\.map\(\(r\) => r\.RecId\);\s*if \(!\(await printSerialCardLabels\(\(\) => legacyErpApi\.serialCards\.labels\(ids\) as Promise<any>\)\)\)/);
    const api = src("lib/nexuscore-api.ts");
    assert.match(api, /labels: \(ids: number\[\]\) => api\.get\(`\/legacy-erp\/serial-cards\/labels\?ids=\$\{ids\.join\(","\)\}`\)/, "no ERP address needed to print");
    assert.match(api, /byCode: \(code: string\) => api\.get\(`\/legacy-erp\/serial-cards\/by-code\/\$\{encodeURIComponent\(code\.trim\(\)\)\}\?\$\{qrOriginParam\(\)\}`\)/);
    const ctl = readFileSync(new URL("../../nexuscore-backend/src/modules/legacy-erp/serial-card.controller.ts", import.meta.url), "utf8");
    assert.match(ctl, /@Get\('labels'\)/, "GET — read permission, like viewing the list");
  });

  it("the dialog and the phone page share one detail layout (fields + Yarn Recipe + QR)", () => {
    const view = src("components/legacy-erp/serial-card-detail-view.tsx");
    assert.match(dialog, /<SerialCardDetailView\s+card=\{card\} detail=\{detail\} detailError=\{detailError\}/);
    assert.match(src("components/legacy-erp/serial-card-scan-view.tsx"), /<SerialCardDetailView card=\{state\.card\} detail=\{state\.card\} showRollFields showQr=\{false\} \/>/);
    for (const f of ["workOrderNo", "styleNumber", "styleName", "inventoryCode", "inventoryName", "fabricComposition", "fabricGsm", "variantCode", "colorCode", "unitCode", "receiptNo", "currentAccountCode"]) {
      assert.match(view, new RegExp(`info\\.${f}`), f);
    }
    for (const label of ["Quantity", "Width", "Grams", "Party Number", "Product Date"]) assert.match(view, new RegExp(`label="${label}"`), label);
    for (const col of ["Yarn Code", "Yarn Name", "Process", "Variant", "Percentage", "Waste %", "Dye Waste %"]) assert.ok(view.includes(`>${col}</th>`), col);
    assert.match(view, /recipe\?\.message \?\? "No Yarn Recipe available\."/, "missing recipe explained, not invented");
    assert.match(view, /serialCardQr\(detail, \{ printedOn: localToday\(\) \}\)/, "dialog QR = the label's own data text");
    assert.doesNotMatch(view, /continuation|QR Codes —/, "one QR, no continuation labels");
    assert.doesNotMatch(dialog + page + gen + view, /code128|prettyPayload/i);
  });

  describe("scan page rendering (labelled fields + Yarn Recipe table, never JSON or the URL)", async () => {
    const { SerialCardDetailView } = await import("@/components/legacy-erp/serial-card-detail-view");
    const text = (html) => html.replace(/<[^>]+>/g, "\n").replace(/&#x27;|&apos;/g, "'").replace(/&amp;/g, "&").split("\n").map((s) => s.trim()).filter(Boolean);
    // A by-code response shaped like the API's (the example card from the requirement).
    const card = {
      id: 8, RecId: 8, SerialCode: "00000008", qrPayload: "http://localhost:3000/s/00000008",
      workOrderNo: "W/O-000211", styleNumber: "SC-2026-8606", styleName: "new test",
      inventoryCode: "FABRIC-00007", inventoryName: "FLAT KNIT RIB 1X1 | 320 GSM | WASH | 97% CTN 3% ploy | 16/1 pc/-/-/-",
      fabricComposition: "97% CTN 3% ploy", fabricGsm: "320", fabricWidth: null, fabricWeight: null,
      colorCode: "DARK DENIM", colorName: "DARK DENIM", variantCode: null, variantName: null,
      Width: 20, Weight: 852, Quantity: 20, unitCode: "KG", receiptNo: "OPS-6", PartyNo: "211",
      ManufacturingDate: null, ExpirationDate: null, ShelfLife: null, currentAccountCode: null, currentAccountName: null,
      qualityTypeName: null, resourceCode: null, ProducerSerialCode: null, Explanation: null, QuantityMT: null, Quantity3: null,
      RawWidth: null, RawWeight: null, RawLength: null, ProductLength: null, WeightM2: null, WeightMt: null, Pus: null, Fine: null, PieceCount: null,
      warehouseQuantity: 20,
      yarnRecipe: {
        status: "ok", message: null, source: "common", bomLineColorCardId: null,
        lines: [
          { yarnCode: "YARN-00008", yarnName: "70-DNR LYCRA", percentage: 9.94, process: null, variant1: null, variant2: null, explanation: null, wastePct: 2, dyeWastagePct: 0 },
          { yarnCode: "YARN-00004", yarnName: "16/1 pc", percentage: 38.84, process: null, variant1: null, variant2: null, explanation: null, wastePct: 2, dyeWastagePct: 0 },
          { yarnCode: "YARN-00003", yarnName: "30/1 combed", percentage: 51.22, process: null, variant1: null, variant2: null, explanation: null, wastePct: 2, dyeWastagePct: 0 },
        ],
      },
    };
    const render = (c, props = {}) => renderToStaticMarkup(React.createElement(SerialCardDetailView, { card: c, detail: c, showRollFields: true, showQr: false, ...props }));
    const after = (lines, label) => lines[lines.indexOf(label) + 1];

    it("every field is labelled, with the card's values or \"Not specified\"", () => {
      const lines = text(render(card));
      const expected = {
        "Work Order": "W/O-000211", "Style Number": "SC-2026-8606", "Style Name": "new test", "Fabric Code": "FABRIC-00007",
        "Fabric Name": card.inventoryName, "Composition": "97% CTN 3% ploy", "Finish GSM": "320", "Spec Width": "Not specified",
        "Spec Weight": "Not specified", "Color Code/Name": "DARK DENIM", "Variant": "Not specified",
        "Serial Number": "00000008", "Width": "20", "Grams": "852", "Quantity": "20 KG", "Receipt Number": "OPS-6",
        "Product Date": "Not specified", "Expiration Date": "Not specified", "Shelf Life": "Not specified", "Party Number": "211",
        "Man. C/A Code": "Not specified", "Quality Type": "Not specified", "Resource": "Not specified", "Manufacturer Serial": "Not specified",
        "Explanation": "Not specified", "Quantity II": "Not specified", "Quantity III": "Not specified", "Raw Width": "Not specified",
        "Raw Weight": "Not specified", "Raw Length": "Not specified", "Product Length": "Not specified", "M2": "Not specified",
        "Mtul": "Not specified", "Pus": "Not specified", "Fine": "Not specified", "Piece Count": "Not specified",
      };
      for (const [label, value] of Object.entries(expected)) assert.equal(after(lines, label), value, label);
      for (const s of ["Production Details", "Roll Details", "Yarn Recipe"]) assert.ok(lines.includes(s), s);
    });

    it("the Yarn Recipe is a table with % columns; no JSON, no URL, no QR on the scan page", () => {
      const html = render(card);
      const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => text(m[1]));
      assert.deepEqual(rows, [
        ["Yarn Code", "Yarn Name", "Process", "Variant", "Percentage", "Waste %", "Dye Waste %"],
        ["YARN-00008", "70-DNR LYCRA", "—", "—", "9.94%", "2%", "0%"],
        ["YARN-00004", "16/1 pc", "—", "—", "38.84%", "2%", "0%"],
        ["YARN-00003", "30/1 combed", "—", "—", "51.22%", "2%", "0%"],
      ]);
      assert.doesNotMatch(html, /localhost|\/s\/00000008|<svg|\{"|":\s*"/);
      // The ERP dialog shows the label's QR and the exact text a scanner reads — no link.
      const dialogHtml = render(card, { showQr: true });
      assert.match(dialogHtml, /<svg/);
      assert.match(dialogHtml, /QR version 17 \(456 bytes\) · Auto label 100 × 60 mm,\s*QR 54 mm, 0\.58 mm modules/);
      assert.match(dialogHtml, /What a scanner shows[\s\S]*SERIAL CARD: 00000008\nNXSC\/2 /);
      assert.equal((dialogHtml.match(/<svg /g) ?? []).length, 1, "one QR");
      assert.doesNotMatch(dialogHtml, /localhost:3000\/s\//);
    });

    it("a card without a recipe shows the API's explanation instead of a table", () => {
      const msg = "This serial card is not linked to a Work Order, so there is no BOM to take a Yarn Recipe from.";
      const html = render({ ...card, yarnRecipe: { status: "no-work-order", message: msg, source: null, bomLineColorCardId: null, lines: [] } });
      assert.ok(text(html).includes(msg));
      assert.doesNotMatch(html, /<table/);
    });
  });

  it("the scan page requires an ERP login and returns to the card after signing in", () => {
    const route = src("app/s/[serial]/page.tsx");
    assert.match(route, /const token = \(await cookies\(\)\)\.get\("auth_token"\)\?\.value;/);
    assert.match(route, /redirect\(`\/dashboard\/login\/v1\?next=\$\{encodeURIComponent\(`\/s\/\$\{encodeURIComponent\(serialNo\)\}`\)\}`\);/);
    assert.match(route, /robots: \{ index: false, follow: false \}/);
    const scan = src("components/legacy-erp/serial-card-scan-view.tsx");
    assert.match(scan, /legacyErpApi\.serialCards\.byCode\(serialNo\)/, "data from the permission-checked API");
    assert.match(scan, /e\?\.status === 401[\s\S]*document\.cookie = "auth_token=; path=\/; max-age=0; SameSite=Lax";/, "stale session cleared, no redirect loop");
    assert.match(scan, /e\?\.status === 403/);
    const login = src("app/dashboard/(guest)/login/v1/page.tsx");
    assert.equal((login.match(/router\.push\(nextPathFromLocation\(\) \?\? "\/dashboard\/default"\)/g) ?? []).length, 3);
    const proxy = src("proxy.ts");
    assert.match(proxy, /const next = safeNextPath\(request\.nextUrl\.searchParams\.get\('next'\)\);/);
    assert.match(proxy, /if \(pathname\.startsWith\('\/s\/'\) && !token\) \{[\s\S]*login\.searchParams\.set\('next', pathname\);/, "real 307 to login for signed-out scans");
    assert.match(proxy, /'\/s\/:path\*'/);
  });

  it("Generate Serial Cards: no client-side or server-side quantity cap", () => {
    assert.doesNotMatch(gen, /\{\.\.\.disabledActionProps\}>Label</);
    assert.doesNotMatch(gen, /would exceed/);
    const svc = readFileSync(new URL("../../nexuscore-backend/src/modules/legacy-erp/serial-card.service.ts", import.meta.url), "utf8");
    assert.doesNotMatch(svc, /would exceed this receipt line's Quantity/);
  });
});


describe("Serial Cards page — bottom action bar", () => {
  const page = src("app/dashboard/(auth)/legacy-erp/serial-cards/page.tsx");

  it("has every applicable legacy action, and no Form placeholder", () => {
    for (const label of ["Load", "Clear", "Assign to Qty", "Update", "Delete", "Copy Column", "Label", "Detail"]) {
      assert.match(page, new RegExp(`label: "${label}"`), label);
    }
    assert.match(page, /onClick=\{closeScreen\}/);
    assert.doesNotMatch(page, /label: "Form"/);
    assert.doesNotMatch(page, /Not yet implemented/);
  });

  it("acts on the selected cards in list order, with selection-count rules", () => {
    assert.match(page, /const selectedRows = useMemo\(\(\) => rows\.filter\(\(r\) => selectedIds\.has\(r\.RecId\)\), \[rows, selectedIds\]\)/);
    assert.match(page, /key: "update"[^\n]*reason: single \? null : "Select exactly one serial card"/);
    assert.match(page, /key: "detail"[^\n]*reason: single \? null : "Select exactly one serial card"/);
    assert.match(page, /key: "copy"[^\n]*reason: n >= 2 \? null/);
    for (const k of ["assign", "delete", "label"]) assert.match(page, new RegExp(`key: "${k}"[^\\n]*reason: n \\? null`), k);
    assert.match(page, /disabled=\{!!a\.reason \|\| busy\}/);
  });

  it("each action reuses the existing APIs", () => {
    assert.match(page, /key: "load", label: "Load", icon: Download, onClick: find,/);
    assert.match(page, /key: "clear", label: "Clear", icon: RotateCcw, onClick: clear,/);
    assert.match(page, /legacyErpApi\.serialCards\.assignQuantity\(selectedRows\.map\(\(r\) => r\.RecId\)\)/);
    assert.match(page, /for \(const card of deleteTargets\) \{\s*try \{\s*await legacyErpApi\.serialCards\.remove\(card\.RecId\);/);
    assert.match(page, /onClick: \(\) => setDeleteTargets\(selectedRows\)/);
    assert.match(page, /onSelect: \(\) => setDeleteTargets\(\[row\]\)/, "row menu Delete still targets just that row");
    assert.match(page, /selectedRows\.slice\(1\)\.map\(\(r\) => serialCardToUpdateItem\(\{ \.\.\.r, \[copyDef\.key\]: value \}\)\)/);
    assert.match(page, /legacyErpApi\.serialCards\.updateFlat\(items\)/);
    assert.match(page, /const closeScreen = \(\) => closeTab\(tabCtx\?\.tabKey \?\? PATH\);/);
  });

  it("delete confirmation warns about cards that have transactions", () => {
    assert.match(page, /const deleteWithTxn = deleteTargets\?\.filter\(\(r\) => r\.hasTransaction\)\.length \?\? 0;/);
    assert.match(page, /transactions after the receipt/);
  });

  it("the assign-quantity API hits the permission-checked PATCH route", () => {
    assert.match(src("lib/nexuscore-api.ts"), /assignQuantity: \(ids: number\[\]\) => api\.patch\(`\/legacy-erp\/serial-cards\/assign-quantity`, \{ ids \}\)/);
    const ctl = readFileSync(new URL("../../nexuscore-backend/src/modules/legacy-erp/serial-card.controller.ts", import.meta.url), "utf8");
    assert.match(ctl, /@Patch\('assign-quantity'\)/);
  });
});

describe("Generate Serial Cards — fresh session on open", () => {
  const gen = src("components/legacy-erp/generate-serial-cards-dialog.tsx");
  const openEffect = gen.slice(gen.indexOf("// Every open starts a fresh generation session"), gen.indexOf("}, [open, receiptId, itemId]);"));

  it("opening the dialog loads the line context only — never the earlier cards", () => {
    assert.match(openEffect, /void loadContext\(\);/);
    assert.doesNotMatch(openEffect, /loadRows\(/, "no card fetch on open");
    for (const reset of ["setSessionIds([]);", "setRows([]);", "setShowEarlier(false);", "setEarlierRows([]);", "setEdits({});"]) assert.ok(openEffect.includes(reset), reset);
  });

  it("each Produce adds exactly the cards it created to the session grid", () => {
    assert.match(gen, /const created: any = await legacyErpApi\.serialCards\.produce\(receiptId, itemId, \{/);
    assert.match(gen, /const newIds = \(Array\.isArray\(created\) \? created : \[\]\)\.map\(\(c: any\) => Number\(c\.RecId\)\)/);
    assert.match(gen, /const nextIds = \[\.\.\.sessionIds, \.\.\.newIds\.filter/);
    assert.match(gen, /loadRows\(nextIds, showEarlier\)/);
  });

  it("the editable grid holds only session cards; earlier cards are separate and read-only", () => {
    const load = gen.slice(gen.indexOf("const loadRows = async"), gen.indexOf("// Every open starts"));
    assert.match(load, /if \(!ids\.length && !earlier\) \{\s*setRows\(\[\]\);\s*setEarlierRows\(\[\]\);\s*return;/, "nothing fetched for an empty session");
    assert.match(load, /setRows\(all\.filter\(\(r\) => mine\.has\(Number\(r\.RecId\)\)\)\);/);
    assert.match(load, /setEarlierRows\(earlier \? all\.filter\(\(r\) => !mine\.has\(Number\(r\.RecId\)\)\) : \[\]\);/);
    assert.match(load, /if \(resetEdits\) setEdits\(\{\}\);/, "unsaved edits survive another Produce");
    const earlier = gen.slice(gen.indexOf("{/* Earlier cards"), gen.indexOf("{/* Fixed bottom ERP action bar"));
    assert.doesNotMatch(earlier, /<Input|setRowValue|MasterAutocompleteField/, "earlier cards are not editable here");
    assert.match(gen, /Badge variant="outline"[^>]*>New<\/Badge>/);
    assert.match(gen, /● edited/);
  });

  it("Update saves session rows without blanking Expiration Date; List still opens all cards", () => {
    assert.match(gen, /expirationDate: \(v\("expirationDate" as any\) as any\) \?\? null,/);
    assert.match(gen, /loadRows\(sessionIds, showEarlier, true\)/);
    assert.match(gen, /navigateOrOpenTab\(router, `\/dashboard\/legacy-erp\/serial-cards\?receiptItemId=\$\{itemId\}&receiptId=\$\{receiptId\}`\)/);
    assert.match(gen, /const ids = rows\.map\(\(r\) => r\.RecId\);/, "Label prints this session's rolls");
  });
});

describe("Party No column filter", () => {
  const page = src("app/dashboard/(auth)/legacy-erp/serial-cards/page.tsx");

  it("the shared filter hook offers server-supplied options alongside the loaded rows' values", async () => {
    const { useColumnFilters } = await import("@/hooks/use-column-filters");
    let out;
    const Probe = () => { out = useColumnFilters(
      [{ id: 1, p: "211" }, { id: 2, p: null }, { id: 3, p: "" }],
      [{ key: "partyNo", filterable: true, filterValue: (r) => r.p || null, filterOptions: ["305", "211", ""] }, { key: "x", filterable: true, filterValue: () => "a" }],
    ); return null; };
    renderToStaticMarkup(React.createElement(Probe));
    assert.deepEqual(out.selectOptionsByColumn.partyNo, ["211", "305"], "deduped, blanks excluded, other pages' values included");
    assert.deepEqual(out.selectOptionsByColumn.x, ["a"], "columns without filterOptions unchanged");
  });

  it("the Party No header renders the same funnel filter as Inventory Code / Order No / Style No", async () => {
    const { ReportGrid } = await import("@/app/dashboard/(auth)/legacy-erp/fabric-yarn-requirements/_components/report-grid");
    const cols = [
      { key: "inventoryCode", label: "Inventory Code", defaultWidth: 100, render: (r) => r.c, filterable: true, filterValue: (r) => r.c },
      { key: "partyNo", label: "Party No", defaultWidth: 90, render: (r) => r.p, filterable: true, filterValue: (r) => r.p, filterOptions: ["211"] },
      { key: "qualityType", label: "Quality Type", defaultWidth: 90, render: () => "—" },
    ];
    const html = renderToStaticMarkup(React.createElement(ReportGrid, { storageKey: "testSerialCards", columns: cols, rows: [{ id: 1, c: "FABRIC-00007", p: "211" }], emptyLabel: "none" }));
    assert.match(html, /title="Filter Party No"/);
    assert.match(html, /title="Filter Inventory Code"/);
    assert.doesNotMatch(html, /title="Filter Quality Type"/, "non-filterable columns unchanged");
  });

  it("the page declares the filter on the real Party No field and sends it to the query", () => {
    assert.match(page, /key: "partyNo", label: "Party No"[\s\S]{0,200}filterable: true, filterValue: \(r\) => r\.PartyNo\?\.trim\(\) \|\| null, filterOptions: partyNoOptions,/);
    assert.match(page, /partyNo: partyNosRef\.current\.length \? partyNosRef\.current : undefined,/);
    assert.match(page, /setPartyNoOptions\(Array\.isArray\(r\?\.partyNoOptions\) \? r\.partyNoOptions : \[\]\)/);
    assert.match(page, /const next = \[\.\.\.\(f\.partyNo\?\.values \?\? \[\]\)\]\.sort\(\);/);
    assert.match(page, /partyNosRef\.current = next;\s*void load\(appliedFilters, 0\);/, "reloads page 1 keeping the applied search filters");
    assert.match(page, /onColumnFiltersChange=\{onColumnFiltersChange\}/);
    assert.match(src("lib/nexuscore-api.ts"), /if \(Array\.isArray\(v\)\) v\.forEach\(\(x\) => qs\.append\(k, String\(x\)\)\);/, "repeated ?partyNo= params");
    const ctl = readFileSync(new URL("../../nexuscore-backend/src/modules/legacy-erp/serial-card.controller.ts", import.meta.url), "utf8");
    assert.match(ctl, /partyNos: partyNo == null \? undefined : Array\.isArray\(partyNo\) \? partyNo : \[partyNo\],/);
  });

  it("ReportGrid only reports filter changes to callers that opt in", () => {
    const grid = src("app/dashboard/(auth)/legacy-erp/fabric-yarn-requirements/_components/report-grid.tsx");
    assert.match(grid, /useEffect\(\(\) => \{ onFiltersChangeRef\.current\?\.\(columnFilters\); \}, \[columnFilters\]\);/);
    assert.match(grid, /onColumnFiltersChange\?: \(filters: Record<string, ColumnFilterState>\) => void;/);
  });
});
