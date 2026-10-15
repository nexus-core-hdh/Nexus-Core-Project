"use client";

import { useState } from "react";
import { useRouter } from "@/lib/app-navigation";
import { Button } from "@/components/ui/button";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { CostDetailFormBody, DEFAULT_COST_DETAIL, CostDetailValue } from "../_components/cost-detail-dialog";

export default function CostDetailEntryPage() {
  const router = useRouter();
  const [value, setValue] = useState<CostDetailValue>(DEFAULT_COST_DETAIL);
  const [total, setTotal] = useState(0);

  return (
    <div className="max-w-5xl space-y-3 p-4">
      <div className="flex items-center gap-2">
        <h1 className="flex-1 text-lg font-semibold">Cost Detail Entry</h1>
        <Button size="sm" onClick={() => toast.success("Cost detail saved")}><Save className="mr-1 h-4 w-4" />Save</Button>
      </div>

      <div className="overflow-hidden rounded-md border">
        <CostDetailFormBody value={value} setValue={setValue} onTotalChange={setTotal} />
      </div>
    </div>
  );
}
