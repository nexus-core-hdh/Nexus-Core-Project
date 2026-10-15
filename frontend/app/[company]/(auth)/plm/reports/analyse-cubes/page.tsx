"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { plmApi } from "@/lib/nexuscore-api";
import { toast } from "sonner";
import { BarChart3, RefreshCw } from "lucide-react";

const ROW_DIMS = [
  { value: 'status', label: 'Status' },
  { value: 'season', label: 'Season' },
  { value: 'gender', label: 'Gender' },
  { value: 'category', label: 'Category' },
  { value: 'priority', label: 'Priority' },
];
const COL_DIMS = [
  { value: 'status', label: 'Status' },
  { value: 'season', label: 'Season' },
  { value: 'gender', label: 'Gender' },
  { value: 'sampleType', label: 'Sample Type' },
  { value: 'priority', label: 'Priority' },
];
const MEASURES = [
  { value: 'count', label: 'Count' },
  { value: 'totalCost', label: 'Total Cost' },
  { value: 'avgCost', label: 'Avg Cost' },
  { value: 'quantity', label: 'Quantity' },
];

export default function AnalyseCubesPage() {
  const [rowDim, setRowDim] = useState('status');
  const [colDim, setColDim] = useState('season');
  const [measure, setMeasure] = useState('count');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    if (rowDim === colDim) return toast.error("Row and column dimensions must be different");
    setLoading(true);
    try { const r = await plmApi.reports.analyseCubes({ rowDimension: rowDim, colDimension: colDim, measure }); setResult(r); }
    catch (e: any) { toast.error(e.message); } finally { setLoading(false); }
  };

  useEffect(() => { run(); }, []);

  const rows: string[] = result?.rows ?? [];
  const cols: string[] = result?.cols ?? [];
  const matrix: Record<string, Record<string, number>> = result?.matrix ?? {};
  const totals: Record<string, number> = result?.totals ?? {};
  const grandTotal = Object.values(totals).reduce((s: number, v: any) => s + (v || 0), 0);

  const fmt = (v: number) => measure === 'count' || measure === 'quantity' ? v?.toLocaleString() ?? '—' : v != null ? `$${v.toFixed(2)}` : '—';

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-indigo-500" />
        <div><h1 className="text-lg font-semibold">Analyse Cubes</h1><p className="text-xs text-muted-foreground">Pivot analysis across PLM dimensions</p></div>
      </div>

      <div className="flex items-end gap-4 flex-wrap p-4 rounded-lg border bg-muted/30">
        <div className="space-y-1">
          <Label className="text-xs">Row Dimension</Label>
          <Select value={rowDim} onValueChange={setRowDim}>
            <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>{ROW_DIMS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Column Dimension</Label>
          <Select value={colDim} onValueChange={setColDim}>
            <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>{COL_DIMS.filter((d) => d.value !== rowDim).map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Measure</Label>
          <Select value={measure} onValueChange={setMeasure}>
            <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>{MEASURES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Button onClick={run} disabled={loading} size="sm"><RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />Run</Button>
      </div>

      {loading ? <Skeleton className="h-64 w-full" /> : !result ? null : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-bold bg-muted/50 sticky left-0 z-10">{ROW_DIMS.find((d) => d.value === rowDim)?.label}</TableHead>
                {cols.map((c) => <TableHead key={c} className="text-center font-medium">{c || '(none)'}</TableHead>)}
                <TableHead className="text-center font-bold bg-muted/30">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={cols.length + 2} className="text-center py-8 text-muted-foreground">No data available</TableCell></TableRow>
              ) : rows.map((r) => {
                const rowTotal = cols.reduce((s, c) => s + (matrix[r]?.[c] || 0), 0);
                const maxVal = Math.max(...rows.flatMap((rr) => cols.map((c) => matrix[rr]?.[c] || 0)));
                return (
                  <TableRow key={r}>
                    <TableCell className="font-medium sticky left-0 bg-background z-10">{r || '(none)'}</TableCell>
                    {cols.map((c) => {
                      const val = matrix[r]?.[c] || 0;
                      const intensity = maxVal > 0 ? val / maxVal : 0;
                      return (
                        <TableCell key={c} className="text-center relative">
                          <div className="absolute inset-0 bg-blue-100 dark:bg-blue-900/30" style={{ opacity: intensity * 0.6 }} />
                          <span className="relative">{fmt(val)}</span>
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-center font-bold bg-muted/20">{fmt(rowTotal)}</TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="bg-muted/30 font-bold">
                <TableCell className="sticky left-0 bg-muted/30 z-10">Total</TableCell>
                {cols.map((c) => <TableCell key={c} className="text-center">{fmt(totals[c] || 0)}</TableCell>)}
                <TableCell className="text-center">{fmt(grandTotal)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
