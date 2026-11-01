// Browser harness for scripts/inventory-receipt-approval.browser.test.mjs: mounts the REAL Inventory
// Receipt screen (app/[company]/(auth)/legacy-erp/inventory-receipts/page.tsx — every receipt type)
// against an in-memory receipts API (see the test's STUBS). window.__open(params) unmounts it and opens
// it again with those search params, like reopening the receipt from its list.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import InventoryReceiptPage from "@/app/[company]/(auth)/legacy-erp/inventory-receipts/page";

const w = window as any;

function App() {
  const [mounted, setMounted] = useState(1);
  w.__open = (params: Record<string, string>) => {
    w.__params = params;
    setMounted(0);
    setTimeout(() => setMounted((n) => n + 1), 30);
  };
  return <div id="screen">{mounted > 0 && <InventoryReceiptPage key={mounted} />}</div>;
}

createRoot(document.getElementById("root")!).render(<App />);
