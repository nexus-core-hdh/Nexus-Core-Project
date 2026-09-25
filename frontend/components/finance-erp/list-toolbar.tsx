"use client";

import { Button } from "@/components/ui/button";
import { Download, FileSpreadsheet, Printer, Filter, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/** One filter field: label + control, laid out in a responsive grid — shared across every
 *  Finance listing screen's filter bar (search/status/date range/branch/department/...). */
export function FilterField({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">{label}</label>
      {children}
    </div>
  );
}

/** Card wrapper for a listing screen's filter row, with Apply/Reset actions — spec section 8
 *  ("every listing page should support search / filters / date range / status / branch"). */
export function FilterBar({
  children, onApply, onReset, className,
}: {
  children: React.ReactNode;
  onApply?: () => void;
  onReset?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border bg-muted/10 p-4", className)}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {children}
        {(onApply || onReset) && (
          <div className="flex items-end gap-2">
            {onApply && <Button size="sm" onClick={onApply} className="h-9 flex-1"><Filter className="h-3.5 w-3.5 mr-2" />Apply Filter</Button>}
            {onReset && <Button size="sm" variant="outline" onClick={onReset} className="h-9 flex-1"><RotateCcw className="h-3.5 w-3.5 mr-2" />Clear</Button>}
          </div>
        )}
      </div>
    </div>
  );
}

/** Mock Print/Export buttons (spec section 14) — real export infrastructure isn't built yet, so
 *  these surface a toast instead of producing a file. */
export function ExportPrintBar({ onExportCsv, className }: { onExportCsv?: () => void; className?: string }) {
  const mockExport = (kind: string) => toast.success(`${kind} export started`, { description: "Download will be available once export services are connected." });
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {onExportCsv ? (
        <Button variant="outline" size="sm" onClick={onExportCsv}><Download className="h-3.5 w-3.5 mr-1.5" />CSV</Button>
      ) : (
        <Button variant="outline" size="sm" onClick={() => mockExport("CSV")}><Download className="h-3.5 w-3.5 mr-1.5" />CSV</Button>
      )}
      <Button variant="outline" size="sm" onClick={() => mockExport("Excel")}><FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />Excel</Button>
      <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-3.5 w-3.5 mr-1.5" />Print</Button>
    </div>
  );
}
