"use client";

import { useState } from "react";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { ReportHeader } from "@/components/finance-erp/report-header";
import { FilterField } from "@/components/finance-erp/list-toolbar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { BRANCHES } from "@/lib/finance-erp/mock/master-data";
import { PROFIT_AND_LOSS } from "@/lib/finance-erp/general-ledger/financial-statements";
import { StatementTable } from "../statement-table";

const ALL = "__all__";

export default function ProfitAndLossPage() {
  const [branch, setBranch] = useState(ALL);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [comparative, setComparative] = useState(true);

  return (
    <div className="mx-auto max-w-[1100px] space-y-5 p-6 lg:p-8">
      <LegacyErpBreadcrumb trail={[{ label: "Finance", href: "/dashboard/finance-erp" }, { label: "General Ledger" }, { label: "Financial Statements" }, { label: "Profit & Loss" }]} />
      <ReportHeader title="Profit & Loss Statement" branch={branch === ALL ? "All Branches" : BRANCHES.find((b) => b.id === branch)?.name} period="September 2026" />

      <div className="flex flex-wrap items-end gap-4">
        <FilterField label="Branch" className="w-48">
          <Select value={branch} onValueChange={setBranch}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>All Branches</SelectItem>{BRANCHES.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
          </Select>
        </FilterField>
        <FilterField label="From Date"><Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 text-sm" /></FilterField>
        <FilterField label="To Date"><Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 text-sm" /></FilterField>
        <label className="flex h-9 items-center gap-2 text-sm"><Switch checked={comparative} onCheckedChange={setComparative} /><Label>Comparative Period</Label></label>
      </div>

      <div className="rounded-lg border">
        <StatementTable rows={PROFIT_AND_LOSS} showComparative={comparative} priorLabel="Prior Month" />
      </div>
    </div>
  );
}
