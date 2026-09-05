"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
import { plmApi } from "@/lib/nexuscore-api";

const fmtDate = (d: any) => (d ? new Date(d).toLocaleDateString() : "—");
const fmt2 = (n: any) => (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Reused wholesale for Sample Card via the optional `sampleCardId` prop — CostingSheet already
// had a nullable styleCardId with no cascade; sampleCardId is a sibling nullable tag the same
// shape. The sheet/lines model and its own full-page editor are unchanged either way.
export function CostTab({ styleCardId, sampleCardId }: { styleCardId?: string; sampleCardId?: string; card: any; onReloadCard: () => void }) {
  const router = useRouter();
  const [sheets, setSheets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const list = sampleCardId ? await plmApi.sampleCards.getCostingSheets(sampleCardId) : await plmApi.styleCards.getCostingSheets(styleCardId!);
      setSheets(Array.isArray(list) ? list : []);
    } catch (e: any) {
      toast.error(e.message || "Failed to load costing sheets");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [styleCardId, sampleCardId]);

  const issue = async () => {
    setIssuing(true);
    try {
      const created: any = sampleCardId ? await plmApi.sampleCards.issueCostingSheet(sampleCardId) : await plmApi.styleCards.issueCostingSheet(styleCardId!);
      router.push(`/dashboard/plm/costing-sheets/${created.id}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to issue costing sheet");
    } finally {
      setIssuing(false);
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p>;

  return (
    <div>
      <div className="flex justify-end mb-2">
        <Button size="sm" onClick={issue} disabled={issuing}>{issuing ? "Issuing..." : `Issue ${sampleCardId ? "Sample" : "Style"} Costing Sheet`}</Button>
      </div>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Costing No</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Forex</TableHead>
              <TableHead className="text-right">Forex Rate</TableHead>
              <TableHead className="text-right">Rate-2</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">Cost Forex-1</TableHead>
              <TableHead className="text-right">Cost Forex-2</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!sheets.length ? (
              <TableRow><TableCell colSpan={11} className="text-center py-6 text-muted-foreground">No costing sheets yet</TableCell></TableRow>
            ) : sheets.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-mono text-xs">{s.costingNo}</TableCell>
                <TableCell>{fmtDate(s.costingDate)}</TableCell>
                <TableCell>{s.category || "—"}</TableCell>
                <TableCell>{s.accountName || "—"}</TableCell>
                <TableCell>{s.foreignCurrency || "—"}</TableCell>
                <TableCell className="text-right font-mono">{fmt2(s.foreignRate)}</TableCell>
                <TableCell className="text-right font-mono">{fmt2(s.secondForeignRate)}</TableCell>
                <TableCell className="text-right font-mono">{fmt2(s.totals?.netPrice)}</TableCell>
                <TableCell className="text-right font-mono">{fmt2(s.totals?.costForex1)}</TableCell>
                <TableCell className="text-right font-mono">{fmt2(s.totals?.costForex2)}</TableCell>
                <TableCell><Link href={`/dashboard/plm/costing-sheets/${s.id}`}><ExternalLink className="h-4 w-4 text-muted-foreground" /></Link></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
