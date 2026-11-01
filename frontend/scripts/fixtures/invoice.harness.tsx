// Browser harness for scripts/invoice.browser.test.mjs: mounts the REAL Invoice screen
// (app/[company]/(auth)/legacy-erp/receipt-invoices/page.tsx) with the real receipt line grid,
// against an in-memory invoice / receipt API (see the test's STUBS). window.__open(params) unmounts
// it and opens it again with those search params, like reopening the screen.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import InvoicePage from "@/app/[company]/(auth)/legacy-erp/receipt-invoices/page";

const w = window as any;

function App() {
  const [mounted, setMounted] = useState(1);
  w.__open = (params: Record<string, string>) => {
    w.__params = params;
    setMounted(0);
    setTimeout(() => setMounted((n) => n + 1), 30);
  };
  return <div id="screen">{mounted > 0 && <InvoicePage key={mounted} />}</div>;
}

createRoot(document.getElementById("root")!).render(<App />);
