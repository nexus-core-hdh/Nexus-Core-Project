"use client";

import { useState } from "react";
import { useRouter } from "@/lib/app-navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { toast } from "sonner";
import { ProfitBreakdownBody } from "../_components/profit-breakdown-dialog";

export default function ProfitBreakdownPage() {
  const router = useRouter();
  const [netPrice, setNetPrice] = useState(1282.3007);
  const [usdRate, setUsdRate] = useState(270);
  const [pct, setPct] = useState(0);

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold flex-1">Costing Profit Breakdowns</h1>
      </div>

      <div className="flex items-center gap-4 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Net Price</span>
          <Input type="number" value={netPrice} onChange={(e) => setNetPrice(parseFloat(e.target.value) || 0)} className="h-8 w-32 text-xs" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Usdollar Rate</span>
          <Input type="number" value={usdRate} onChange={(e) => setUsdRate(parseFloat(e.target.value) || 1)} className="h-8 w-28 text-xs" />
        </div>
      </div>

      <div className="rounded-md border max-w-4xl overflow-hidden">
        <ProfitBreakdownBody netPrice={netPrice} usdRate={usdRate} selectedRate={pct} onSelectRate={setPct} />
        <div className="flex items-center justify-between px-4 py-2 border-t bg-muted/30">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Profit%</span>
            <Input type="number" value={pct} onChange={(e) => setPct(parseFloat(e.target.value) || 0)} className="h-8 w-24 text-xs" />
          </div>
          <Button size="sm" onClick={() => toast.success(`Profit % ${pct} transferred`)}>Transfer</Button>
        </div>
      </div>
    </div>
  );
}
