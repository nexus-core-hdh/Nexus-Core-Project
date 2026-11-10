// Browser harness for scripts/current-account-gl.browser.test.mjs: mounts the REAL Current Account
// card (app/[company]/(auth)/legacy-erp/current-accounts/page.tsx) against an in-memory API (see the
// test's STUBS). window.__open(params) remounts it — like closing and reopening the record.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import CurrentAccountCardPage from "@/app/[company]/(auth)/legacy-erp/current-accounts/page";

const w = window as any;

function App() {
  const [mounted, setMounted] = useState(1);
  w.__open = (params: Record<string, string>) => {
    w.__params = params;
    setMounted(0);
    setTimeout(() => setMounted((n) => n + 1), 30);
  };
  return <div id="screen">{mounted > 0 && <CurrentAccountCardPage key={mounted} />}</div>;
}

createRoot(document.getElementById("root")!).render(<App />);
