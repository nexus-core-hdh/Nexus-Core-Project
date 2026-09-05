"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ExternalLink, Save } from "lucide-react";
import { plmApi } from "@/lib/nexuscore-api";

// Link-only tab (the MeasurementChart/lines master is shared/global, never owned by the card) —
// reused wholesale for Sample Card's own independent `measurementChartId` column via the
// optional `sampleCardId` prop.
export function MeasurementChartTab({ styleCardId, sampleCardId, card, onReloadCard }: { styleCardId?: string; sampleCardId?: string; card: any; onReloadCard: () => void }) {
  const [charts, setCharts] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string>(card.measurementChartId || "");
  const [chart, setChart] = useState<any>(card.measurementChart || null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const list = await plmApi.measurementCharts.list();
        setCharts(Array.isArray(list) ? list : (list as any)?.data || []);
      } catch { /* best effort */ }
    })();
  }, []);

  useEffect(() => {
    setSelectedId(card.measurementChartId || "");
    setChart(card.measurementChart || null);
  }, [card]);

  const onSelect = async (id: string) => {
    setSelectedId(id);
    const full = charts.find((c) => c.id === id);
    setChart(full || null);
  };

  const save = async () => {
    setSaving(true);
    try {
      if (sampleCardId) await plmApi.sampleCards.update(sampleCardId, { measurementChartId: selectedId || null });
      else await plmApi.styleCards.update(styleCardId!, { measurementChartId: selectedId || null });
      toast.success("Measurement chart linked");
      onReloadCard();
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const sizes: string[] = Array.isArray(chart?.sizes) ? chart.sizes : [];

  return (
    <div className="space-y-3">
      <div className="rounded-md border p-4 flex items-end gap-3">
        <div className="flex-1 space-y-1">
          <p className="text-xs text-muted-foreground">Linked Measurement Chart</p>
          <Select value={selectedId} onValueChange={onSelect}>
            <SelectTrigger className="h-8 text-sm max-w-md"><SelectValue placeholder="Select a measurement chart" /></SelectTrigger>
            <SelectContent>{charts.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={save} disabled={saving}><Save className="h-4 w-4 mr-1" />{saving ? "Saving..." : "Save"}</Button>
        <Link href="/dashboard/plm/general-definitions/measurement-charts">
          <Button variant="outline" size="sm"><ExternalLink className="h-4 w-4 mr-1" />Manage Charts</Button>
        </Link>
      </div>

      {chart && (
        <div className="rounded-md border">
          <div className="flex items-center gap-2 p-3 border-b">
            <span className="font-medium text-sm">{chart.name}</span>
            <Badge variant="secondary">{chart.lines?.length ?? 0} lines</Badge>
          </div>
          {!chart.lines?.length ? (
            <p className="text-center py-8 text-sm text-muted-foreground">No measurement lines on this chart yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Measurement</TableHead>
                    <TableHead className="text-center">Tolerance</TableHead>
                    {sizes.map((s) => <TableHead key={s} className="text-center">{s}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {chart.lines.map((line: any) => (
                    <TableRow key={line.id}>
                      <TableCell className="font-medium">{line.measurementDefinition?.name || "—"}</TableCell>
                      <TableCell className="text-center">{line.tolerance ?? "—"}</TableCell>
                      {sizes.map((s) => <TableCell key={s} className="text-center">{line.values?.[s] ?? "—"}</TableCell>)}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
