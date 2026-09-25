"use client";

import { Button } from "@/components/ui/button";
import { Printer, Download, FileSpreadsheet, RefreshCw } from "lucide-react";
import { toast } from "sonner";

/** Standard header for every Finance report/statement (spec section 19): title, company/branch/
 *  period context, and Print/Export/Refresh actions. Export/Print are mock actions in this
 *  frontend-only phase — they surface a toast instead of producing a real file. */
export function ReportHeader({
  title, company = "NexusCore Enterprises (Pvt) Ltd", branch, period, onRefresh, extra,
}: {
  title: string;
  company?: string;
  branch?: string;
  period?: string;
  onRefresh?: () => void;
  extra?: React.ReactNode;
}) {
  const mockExport = (kind: string) => toast.success(`${kind} export started`, { description: "This will download the report once export services are connected." });

  return (
    <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">{company}</div>
        <h1 className="mt-0.5 text-xl font-bold tracking-tight">{title}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {branch && <span>Branch: <span className="font-medium text-foreground">{branch}</span></span>}
          {period && <span>Period: <span className="font-medium text-foreground">{period}</span></span>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {extra}
        {onRefresh && (
          <Button variant="outline" size="sm" onClick={onRefresh}><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Refresh</Button>
        )}
        <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-3.5 w-3.5 mr-1.5" />Print</Button>
        <Button variant="outline" size="sm" onClick={() => mockExport("PDF")}><Download className="h-3.5 w-3.5 mr-1.5" />PDF</Button>
        <Button variant="outline" size="sm" onClick={() => mockExport("Excel")}><FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />Excel</Button>
      </div>
    </div>
  );
}
