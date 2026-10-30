// Browser harness for scripts/om-process-field.browser.test.mjs: mounts the real Order Manufacturing
// Entry Process field (the component the screen renders) the way the screen wires it — choosing a
// process stores it and re-reads the context, which then shows it — with sonner's real Toaster.
// The API module is stubbed with window.__fixtures (the live GET .../processes response).
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { ProcessField } from "@/app/[company]/(auth)/legacy-erp/order-manufacturing-entry/_components/process-field";

type Process = { id: number; code: string | null; name: string | null };
const w = window as any;
w.__picks = [];
w.__clears = 0;

function App() {
  const [workOrderId, setWorkOrderId] = useState<number | null>(239);
  const [process, setProcess] = useState<Process | null>(null);
  w.__setWorkOrder = (id: number | null) => { setWorkOrderId(id); setProcess(null); };
  return (
    <div style={{ padding: 16, width: 640, fontFamily: "sans-serif" }}>
      <input id="order-no" placeholder="Order No" />
      <div id="process-field" style={{ marginTop: 8 }}>
        <ProcessField
          workOrderId={workOrderId}
          process={process}
          onPick={(id) => { w.__picks.push(id); setProcess(w.__fixtures.master.find((p: Process) => p.id === id) ?? null); }}
          onClear={() => { w.__clears++; setProcess(null); }}
        />
      </div>
      <button id="elsewhere" style={{ marginTop: 300 }}>elsewhere</button>
      <Toaster />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
