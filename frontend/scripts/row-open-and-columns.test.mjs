// Invoice list Actions column in Manage Columns (required: reorderable, never hidden — also in
// saved layouts) and Item Statement double-click → open the receipt by its id.
//   Run: npm run test:row-open-and-columns
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { describe, it } from "node:test";

register("./workspace-test-loader.mjs", import.meta.url);
const { withoutRequired, sanitizeOrder, sanitizeHidden, mergeDeclaredOrder } = await import("@/hooks/use-grid-columns");
const React = (await import("react")).default;
const { renderToStaticMarkup } = await import("react-dom/server");
const { DataTable } = await import("@/components/shared/data-table/data-table");

const src = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const INVOICE_COLS = ["invoiceNumber", "date", "customer", "dueDate", "total", "paidAmount", "status", "actions"];

describe("required columns (Invoice list Actions)", () => {
  it("a required column is dropped from any hidden set — shown, and never saved as hidden", () => {
    assert.deepEqual([...withoutRequired(new Set(["actions", "paidAmount"]), ["actions"])], ["paidAmount"]);
    assert.deepEqual([...withoutRequired(["date"], [])], ["date"], "grids without required columns unchanged");
  });

  it("a saved layout restores the Actions column's position and can never re-hide it", () => {
    // What tablePreferences could hold: Actions moved second, and (from an older/edited save) hidden.
    const savedOrder = ["invoiceNumber", "actions", "date", "customer", "dueDate", "total", "paidAmount", "status"];
    const restoredOrder = mergeDeclaredOrder(sanitizeOrder(savedOrder, INVOICE_COLS), INVOICE_COLS);
    assert.deepEqual(restoredOrder, savedOrder, "position persists");
    const hidden = withoutRequired(sanitizeHidden(["actions", "paidAmount"], INVOICE_COLS), ["actions"]);
    const shown = restoredOrder.filter((k) => !hidden.has(k));
    assert.ok(shown.includes("actions"), "Actions stays visible");
    assert.ok(!shown.includes("paidAmount"), "other columns still hide normally");
  });

  it("the hook applies the rule when rendering, toggling and saving (session and permanent)", () => {
    const hook = src("hooks/use-grid-columns.ts");
    assert.match(hook, /effectiveOrder\.filter\(\(k\) => !withoutRequired\(hiddenColumns, requiredColumns\)\.has\(k\)\)/);
    assert.match(hook, /if \(!visible && requiredColumns\.includes\(key\)\) return;/);
    assert.match(hook, /const hidden = withoutRequired\(draftHidden, requiredColumns\);/);
    assert.match(hook, /\[permHiddenKey\(storageKey\)\]: Array\.from\(withoutRequired\(modalHidden, requiredColumns\)\)/);
  });

  it("DataTable renders a meta-required column inside the managed set; other pinned columns stay pinned", () => {
    const cols = [
      { id: "select", header: "", enableHiding: false, size: 40, cell: () => "☐" },
      { accessorKey: "invoiceNumber", header: "Invoice #" },
      { accessorKey: "status", header: "Status" },
      { id: "actions", header: "Actions", enableHiding: false, size: 90, minSize: 80, meta: { manageColumns: "required" }, cell: () => React.createElement("span", null, "👁 ✎") },
    ];
    const html = renderToStaticMarkup(React.createElement(DataTable, { columns: cols, data: [{ invoiceNumber: "SI-1", status: "Paid" }], storageKey: "testInvoices" }));
    assert.match(html, /data-col="actions"/, "Actions is a managed (draggable/resizable) column");
    assert.doesNotMatch(html, /data-col="select"/, "the select column is still pinned outside the managed set");
    assert.match(html, /👁 ✎/, "Actions is visible by default with its icons");
    const order = [...html.matchAll(/data-col="(\w+)"/g)].map((m) => m[1]).filter((k, i, a) => a.indexOf(k) === i);
    assert.deepEqual(order, ["invoiceNumber", "status", "actions"], "default position: last");
  });

  it("Manage Columns lists required columns with a locked checkbox and a Required badge", () => {
    const modal = src("components/shared/manage-columns-modal.tsx");
    assert.match(modal, /disabled=\{required\}/);
    assert.match(modal, /\{required && \(/);
    assert.match(src("components/shared/data-table/data-table.tsx"), /requiredColumns=\{requiredIds\}/);
  });

  it("the Sales Invoices Actions column keeps both icons and their behavior, and is required", () => {
    const page = src("app/[company]/(auth)/finance-erp/receivable/sales-invoices-list/page.tsx");
    const actions = page.slice(page.indexOf('id: "actions"'), page.indexOf("];", page.indexOf('id: "actions"')));
    assert.match(actions, /meta: \{ manageColumns: "required" \}/);
    assert.match(actions, /title="View" onClick=\{\(\) => navigateOrOpenTab\(router, `\$\{BASE_HREF\}\?id=\$\{row\.original\.id\}`\)\}/);
    assert.match(actions, /title="Edit" onClick=\{\(\) => navigateOrOpenTab\(router, `\$\{BASE_HREF\}\?id=\$\{row\.original\.id\}`\)\}/);
    assert.match(actions, /minSize: 80/);
  });
});

describe("Item Statement — double-click opens the receipt", () => {
  const page = src("app/[company]/(auth)/legacy-erp/item-statement/page.tsx");

  it("transaction rows open the receipt by its id, with the Inventory Receipts list's route and type param", () => {
    assert.match(page, /onDoubleClick=\{\(\) => openReceipt\(row\)\}/);
    const fn = page.slice(page.indexOf("const openReceipt"), page.indexOf("};", page.indexOf("const openReceipt")));
    assert.match(fn, /if \(!row\?\.receiptId\) return;/);
    assert.match(fn, /navigateOrOpenTab\(router, `\/legacy-erp\/inventory-receipts\?id=\$\{row\.receiptId\}&mode=view\$\{typeParam\}`\)/);
    assert.match(fn, /row\.receiptType !== 2 \? `&receiptType=\$\{row\.receiptType\}` : ""/);
    assert.doesNotMatch(fn, /receiptNo|documentNo/, "never identified by its displayed number");
    const list = src("app/[company]/(auth)/legacy-erp/inventory-receipts-list/page.tsx");
    assert.match(list, /inventory-receipts\?id=\$\{id\}&mode=view\$\{typeParam\}/, "same route as the receipts list");
  });

  it("the statement API now returns each transaction's receipt id", () => {
    const svc = readFileSync(new URL("../../nexuscore-backend/src/modules/legacy-erp/item-statement.service.ts", import.meta.url), "utf8");
    assert.match(svc, /receiptId: row\.receiptId,\s*\n\s*receiptNo: row\.receiptNo,/);
  });

  it("existing receipt grids already open on double-click (unchanged)", () => {
    for (const f of ["inventory-receipts-list", "subcontract-receipts-list", "receipt-master-data"]) {
      assert.match(src(`app/[company]/(auth)/legacy-erp/${f}/page.tsx`), /onRowDoubleClick=/, f);
    }
  });
});
