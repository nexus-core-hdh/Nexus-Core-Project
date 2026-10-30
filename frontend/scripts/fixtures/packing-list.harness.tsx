// Browser harness for scripts/packing-list.browser.test.mjs: mounts the REAL Packing List screen
// (app/[company]/(auth)/legacy-erp/packing-lists/page.tsx) — its grid, Add Box, totals row, Summary,
// useGridColumns + ManageColumnsModal — against an in-memory Packing List API (window.__db, see the
// test's STUBS). window.__open(id) unmounts the screen and opens record `id` again, like closing the
// tab and reopening the Packing List from its list.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import PackingListPage from "@/app/[company]/(auth)/legacy-erp/packing-lists/page";

const w = window as any;

function App() {
  const [mounted, setMounted] = useState(1);
  w.__open = (id: number | null, mode?: string) => {
    w.__params = { ...(id ? { id: String(id) } : {}), ...(mode ? { mode } : {}) };
    setMounted(0);
    setTimeout(() => setMounted((n) => n + 1), 30);
  };
  return <div id="screen">{mounted > 0 && <PackingListPage key={mounted} />}</div>;
}

createRoot(document.getElementById("root")!).render(<App />);
