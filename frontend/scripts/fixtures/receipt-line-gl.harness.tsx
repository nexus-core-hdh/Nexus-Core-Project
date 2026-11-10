// Browser harness for scripts/receipt-line-gl.browser.test.mjs: mounts the REAL Inventory Receipt line
// grid (inventory-receipt-line-grid.tsx — shared by every receipt type and, read-only, by Receipt
// Invoices) for one saved receipt, against an in-memory lines API passed as the grid's `api` prop.
// window.__open({ readOnly }) remounts it (like reopening the receipt, or viewing it on an invoice).
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { InventoryReceiptLineGrid } from "@/app/[company]/(auth)/legacy-erp/inventory-receipts/_components/inventory-receipt-line-grid";

const w = window as any;
const clone = (v: any) => JSON.parse(JSON.stringify(v));
const out = (v: any) => new Promise((r) => setTimeout(() => r(clone(v)), 5));
const log = (c: any) => (w.__calls = w.__calls || []).push(clone(c));
const glOf = (id: number | null) => (w.__db.gl as any[]).find((g) => g.id === id) || null;
// As inventory-receipt.service.ts: lines come back with glAccountId/glAccountCode/glAccountName.
const view = (l: any) => { const g = glOf(l.glAccountId); return { ...l, glAccountCode: g?.accountCode ?? null, glAccountName: g?.accountName ?? null }; };

const api = {
  listItems: (id: number) => { log(["listItems", id]); return out(w.__db.lines.map(view)); },
  createItem: (_id: number, d: any) => { log(["createItem", d]); return out(view({ id: 999, ...d })); },
  updateItem: (_id: number, itemId: number, d: any) => {
    log(["updateItem", itemId, { glAccountId: d.glAccountId }]);
    const l = w.__db.lines.find((x: any) => x.id === itemId);
    if ("glAccountId" in d) l.glAccountId = d.glAccountId;
    return out(view(l));
  },
  removeItem: () => out({ message: "Deleted" }),
};

function App() {
  const [state, setState] = useState<{ n: number; readOnly: boolean }>({ n: 1, readOnly: false });
  w.__open = (params: { readOnly?: boolean } = {}) => {
    setState({ n: 0, readOnly: false });
    setTimeout(() => setState((s) => ({ n: s.n + 1 || 1, readOnly: !!params.readOnly })), 30);
  };
  return <div id="screen">{state.n > 0 && <InventoryReceiptLineGrid key={state.n} inventoryReceiptId={1} readOnly={state.readOnly} api={api} />}</div>;
}

createRoot(document.getElementById("root")!).render(<App />);
