// Browser harness for scripts/chart-of-accounts.browser.test.mjs: mounts the REAL Chart of Accounts
// screen (app/[company]/(auth)/finance-erp/general-ledger/chart-of-accounts/page.tsx) against an
// in-memory GL accounts API (see the test's STUBS). window.__open(params) remounts it with those
// search params (e.g. { mode: "lookup", requestId: "r1" } — opened from a Current Account GL field).
import { useState } from "react";
import { createRoot } from "react-dom/client";
import ChartOfAccountsPage from "@/app/[company]/(auth)/finance-erp/general-ledger/chart-of-accounts/page";

const w = window as any;

function App() {
  const [mounted, setMounted] = useState(1);
  w.__open = (params: Record<string, string>) => {
    w.__params = params;
    setMounted(0);
    setTimeout(() => setMounted((n) => n + 1), 30);
  };
  return <div id="screen" style={{ height: "100vh" }}>{mounted > 0 && <ChartOfAccountsPage key={mounted} />}</div>;
}

createRoot(document.getElementById("root")!).render(<App />);
