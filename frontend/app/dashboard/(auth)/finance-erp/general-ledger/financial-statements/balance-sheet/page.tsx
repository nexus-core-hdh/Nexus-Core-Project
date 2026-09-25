"use client";

import { useState } from "react";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { ReportHeader } from "@/components/finance-erp/report-header";
import { FilterField } from "@/components/finance-erp/list-toolbar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { BRANCHES } from "@/lib/finance-erp/mock/master-data";
import { formatAmount } from "@/lib/finance-erp/utils/format";
import { BALANCE_SHEET_ASSETS, BALANCE_SHEET_LIABILITIES, BALANCE_SHEET_EQUITY } from "@/lib/finance-erp/general-ledger/financial-statements";
import { StatementTable } from "../statement-table";

const ALL = "__all__";

export default function BalanceSheetPage() {
  const [branch, setBranch] = useState(ALL);
  const [comparative, setComparative] = useState(true);

  const totalAssets = BALANCE_SHEET_ASSETS.at(-1)?.current ?? 0;
  const totalLiabEquity = (BALANCE_SHEET_LIABILITIES.at(-1)?.current ?? 0) + (BALANCE_SHEET_EQUITY.at(-1)?.current ?? 0);
  const balanced = Math.abs(totalAssets - totalLiabEquity) < 1;

  return (
    <div className="mx-auto max-w-[1100px] space-y-5 p-6 lg:p-8">
      <LegacyErpBreadcrumb trail={[{ label: "Finance", href: "/dashboard/finance-erp" }, { label: "General Ledger" }, { label: "Financial Statements" }, { label: "Balance Sheet" }]} />
      <ReportHeader title="Balance Sheet" branch={branch === ALL ? "All Branches" : BRANCHES.find((b) => b.id === branch)?.name} period="As at 30 September 2026" />

      <div className="flex flex-wrap items-end gap-4">
        <FilterField label="Branch" className="w-48">
          <Select value={branch} onValueChange={setBranch}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>All Branches</SelectItem>{BRANCHES.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
          </Select>
        </FilterField>
        <label className="flex h-9 items-center gap-2 text-sm"><Switch checked={comparative} onCheckedChange={setComparative} /><Label>Comparative Period</Label></label>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border">
          <div className="border-b bg-muted/30 px-4 py-2 text-sm font-semibold">Assets</div>
          <StatementTable rows={BALANCE_SHEET_ASSETS} showComparative={comparative} priorLabel="Prior Year" />
        </div>
        <div className="space-y-4">
          <div className="rounded-lg border">
            <div className="border-b bg-muted/30 px-4 py-2 text-sm font-semibold">Liabilities</div>
            <StatementTable rows={BALANCE_SHEET_LIABILITIES} showComparative={comparative} priorLabel="Prior Year" />
          </div>
          <div className="rounded-lg border">
            <div className="border-b bg-muted/30 px-4 py-2 text-sm font-semibold">Equity</div>
            <StatementTable rows={BALANCE_SHEET_EQUITY} showComparative={comparative} priorLabel="Prior Year" />
          </div>
        </div>
      </div>

      <div className={`rounded-lg border px-4 py-3 text-sm font-medium ${balanced ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
        Total Assets ({formatAmount(totalAssets)}) {balanced ? "=" : "≠"} Total Liabilities + Equity ({formatAmount(totalLiabEquity)})
        {balanced ? " — Balance Sheet is balanced." : " — out of balance."}
      </div>
    </div>
  );
}
