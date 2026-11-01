// Browser harness for scripts/invoice-list.browser.test.mjs: mounts the REAL invoice list screen
// (app/[company]/(auth)/legacy-erp/receipt-invoices-list/page.tsx — all 18 invoice types) against an
// in-memory invoices API (see the test's STUBS). window.__open(params) remounts it with those search
// params, like clicking another Legacy ERP → Invoices menu entry.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import ReceiptInvoiceListPage from "@/app/[company]/(auth)/legacy-erp/receipt-invoices-list/page";

const w = window as any;

function App() {
  const [mounted, setMounted] = useState(1);
  w.__open = (params: Record<string, string>) => {
    w.__params = params;
    setMounted(0);
    setTimeout(() => setMounted((n) => n + 1), 30);
  };
  return <div id="screen">{mounted > 0 && <ReceiptInvoiceListPage key={mounted} />}</div>;
}

createRoot(document.getElementById("root")!).render(<App />);
