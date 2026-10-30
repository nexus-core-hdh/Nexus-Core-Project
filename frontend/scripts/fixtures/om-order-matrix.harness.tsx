// Browser harness for scripts/om-order-matrix.browser.test.mjs: mounts Order Manufacturing Entry's
// real Order matrix (useGridColumns + ManageColumnsModal) with a W/O-000212-shaped read model
// (window.__ctx). The settings API is stubbed in memory (window.__prefs) — sessionStorage is real.
// window.__remount() unmounts and mounts it again, like closing and reopening the screen.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { OrderMatrix } from "@/app/[company]/(auth)/legacy-erp/order-manufacturing-entry/_components/order-matrix";

const w = window as any;
// The screen's own quantity format (page.tsx: 2 decimals, grouped).
const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function App() {
  const [mounted, setMounted] = useState(1);
  const [color, setColor] = useState<string | null>(w.__ctx.rows[0].color);
  w.__remount = () => { setMounted(0); setTimeout(() => setMounted((n) => n + 1), 30); };
  return (
    <div id="matrix" style={{ display: "flex", flexDirection: "column", height: 400, fontFamily: "sans-serif" }}>
      {mounted > 0 && (
        <OrderMatrix
          key={mounted}
          materialColumns={w.__ctx.materialColumns} qualityColumns={w.__ctx.qualityColumns} rows={w.__ctx.rows}
          selectedColor={color} onSelectColor={setColor} fmt={fmt}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
