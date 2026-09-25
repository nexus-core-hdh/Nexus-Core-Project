"use client";

import { useEffect, useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { ReportHeader } from "@/components/finance-erp/report-header";
import { SummaryCards, type SummaryCardItem } from "@/components/finance-erp/summary-cards";
import { FilterField } from "@/components/finance-erp/list-toolbar";
import { formatAmount } from "@/lib/finance-erp/utils/format";
import { buildDepreciationSchedule, assetOptionsForFilter, type DepreciationScheduleRow } from "@/lib/finance-erp/fixed-assets/depreciation-schedule";
import { LineChart } from "lucide-react";

const ALL = "__all__";

export default function DepreciationSchedulePage() {
  const [granularity, setGranularity] = useState<"monthly" | "yearly">("monthly");
  const [assetFilter, setAssetFilter] = useState(ALL);
  const [rows, setRows] = useState<DepreciationScheduleRow[]>([]);
  const assetOptions = useMemo(() => assetOptionsForFilter(), []);

  const refresh = () => setRows(buildDepreciationSchedule(granularity, assetFilter === ALL ? undefined : assetFilter));
  useEffect(() => { refresh(); }, [granularity, assetFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalDepreciation = rows.reduce((sum, r) => sum + r.depreciation, 0);

  const summary: SummaryCardItem[] = [
    { label: `Total Depreciation (${granularity})`, value: totalDepreciation, tone: "warning" },
    { label: "Rows in Schedule", value: rows.length, isCurrency: false },
    { label: "Assets Covered", value: assetFilter === ALL ? assetOptions.length : 1, isCurrency: false },
  ];

  return (
    <div className="mx-auto max-w-[1700px] space-y-5 p-6 lg:p-8">
      <LegacyErpBreadcrumb trail={[{ label: "Finance", href: "/dashboard/finance-erp" }, { label: "Depreciation Schedule" }]} />
      <ReportHeader
        title="Depreciation Schedule"
        period={granularity === "monthly" ? "Last 12 Months" : "Last 12 Years"}
        onRefresh={refresh}
        extra={
          <Tabs value={granularity} onValueChange={(v) => setGranularity(v as "monthly" | "yearly")}>
            <TabsList>
              <TabsTrigger value="monthly">Monthly</TabsTrigger>
              <TabsTrigger value="yearly">Yearly</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <FilterField label="Asset" className="sm:col-span-1">
          <Select value={assetFilter} onValueChange={setAssetFilter}>
            <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All Assets</SelectItem>
              {assetOptions.map((a) => <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </FilterField>
      </div>

      <SummaryCards items={summary} />

      <div className="overflow-hidden rounded-lg border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted hover:bg-muted">
                <TableHead>Asset</TableHead>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Opening Value</TableHead>
                <TableHead className="text-right">Depreciation</TableHead>
                <TableHead className="text-right">Accumulated Depreciation</TableHead>
                <TableHead className="text-right">Closing Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground"><LineChart className="mx-auto mb-2 h-6 w-6 opacity-40" />No depreciation activity for the selected filters.</TableCell></TableRow>
              ) : rows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="text-sm">{r.assetName}</TableCell>
                  <TableCell className="text-sm">{r.period}</TableCell>
                  <TableCell className="text-right text-sm">{formatAmount(r.openingValue)}</TableCell>
                  <TableCell className="text-right text-sm text-orange-600 dark:text-orange-400">{formatAmount(r.depreciation)}</TableCell>
                  <TableCell className="text-right text-sm">{formatAmount(r.accumulatedDepreciation)}</TableCell>
                  <TableCell className="text-right text-sm font-medium">{formatAmount(r.closingValue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
