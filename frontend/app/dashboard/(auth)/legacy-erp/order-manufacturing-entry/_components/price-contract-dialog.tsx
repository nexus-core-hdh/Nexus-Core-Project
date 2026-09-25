"use client";

// Price Contract — the minimum real flow over SM_ServicePriceList (linked to this Work Order's Style
// Info line via its own WorkOrderItemId column). No Price Contract screen existed before; see
// order-manufacturing.service.ts's listPriceContracts/savePriceContracts. Everything shown here is
// read from / saved to the DB — Save re-reads the persisted rows.

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { EditableGridInput } from "@/components/ui/editable-grid-input";
import { MasterAutocompleteField, type MasterOption } from "@/components/legacy-erp/master-autocomplete-field";
import { legacyErpApi } from "@/lib/nexuscore-api";
import { normalizeNonNegative } from "@/lib/numeric-guards";

interface Row {
  key: string; id: number | null;
  factoryId: number | null; factoryCode: string; factoryName: string;
  price: string; forexId: number | null; forexCode: string; quantity: string;
  startDate: string; endDate: string; explanation: string;
}

let seq = 0;
const blank = (): Row => ({ key: `n${++seq}`, id: null, factoryId: null, factoryCode: "", factoryName: "", price: "", forexId: null, forexCode: "", quantity: "", startDate: "", endDate: "", explanation: "" });
const fromServer = (r: any): Row => ({
  key: `s${r.id}`, id: r.id, factoryId: r.factoryId, factoryCode: r.factoryCode || "", factoryName: r.factoryName || "",
  price: r.price == null ? "" : String(r.price), forexId: r.forexId, forexCode: r.forexCode || "", quantity: r.quantity == null ? "" : String(r.quantity),
  startDate: r.startDate || "", endDate: r.endDate || "", explanation: r.explanation || "",
});

export function PriceContractDialog({ workOrderId, workOrderNo, onClose }: { workOrderId: number; workOrderNo: string; onClose: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [deleted, setDeleted] = useState<number[]>([]);
  const [lockReason, setLockReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const apply = (d: any) => {
    setRows([...(d.rows || []).map(fromServer), blank()]);
    setDeleted([]);
    setLockReason(d.lockReason ?? null);
  };
  useEffect(() => {
    (legacyErpApi.orderManufacturing.listPriceContracts(workOrderId) as Promise<any>)
      .then(apply).catch((e: any) => toast.error(e.message || "Failed to load Price Contract")).finally(() => setLoading(false));
  }, [workOrderId]);

  const patch = (key: string, p: Partial<Row>) =>
    setRows((rs) => {
      const next = rs.map((r) => (r.key === key ? { ...r, ...p } : r));
      return next[next.length - 1].key === key ? [...next, blank()] : next; // keep one trailing blank row
    });

  const save = async () => {
    setSaving(true);
    try {
      const d = await legacyErpApi.orderManufacturing.savePriceContracts({
        workOrderId, deletedIds: deleted,
        rows: rows.map((r) => ({ id: r.id, factoryId: r.factoryId, price: r.price === "" ? null : Number(r.price), forexId: r.forexId, quantity: r.quantity === "" ? null : Number(r.quantity), startDate: r.startDate || null, endDate: r.endDate || null, explanation: r.explanation })),
      });
      apply(d);
      toast.success("Price Contract saved");
    } catch (e: any) {
      toast.error(e.message || "Failed to save Price Contract");
    } finally {
      setSaving(false);
    }
  };

  const th = "border border-border/70 bg-muted px-1.5 h-7 text-[10.5px] font-semibold text-muted-foreground text-left whitespace-nowrap";
  const td = "border border-border/50 p-0";
  const cell = "h-7 w-full bg-transparent px-1.5 text-[11.5px] outline-none focus:bg-accent/50";
  const ro = !!lockReason;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl gap-2 p-3">
        <DialogHeader><DialogTitle className="text-sm">Price Contract — {workOrderNo}</DialogTitle></DialogHeader>
        {lockReason && <p className="rounded-sm border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-400">{lockReason} Read-only.</p>}
        <div className="max-h-[50vh] overflow-auto rounded-sm border border-border/70">
          <table className="w-full min-w-[820px] border-collapse">
            <thead>
              <tr>
                <th className={th} style={{ width: 130 }}>Factory</th><th className={th} style={{ width: 150 }}>Factory Name</th>
                <th className={th} style={{ width: 90 }}>Price</th><th className={th} style={{ width: 90 }}>Currency</th>
                <th className={th} style={{ width: 80 }}>Quantity</th><th className={th} style={{ width: 120 }}>Start Date</th>
                <th className={th} style={{ width: 120 }}>End Date</th><th className={th}>Explanation</th><th className={th} style={{ width: 28 }} />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="p-2 text-muted-foreground">Loading…</td></tr>
              ) : rows.map((r) => (
                <tr key={r.key}>
                  <td className={td}>
                    <MasterAutocompleteField
                      label="Factory" compact masterKey="currentAccount" displayValue={r.factoryCode}
                      fetchOptions={(t) => legacyErpApi.accounts.list(t) as Promise<any[]>}
                      onSelect={(o: MasterOption) => patch(r.key, { factoryId: Number(o.id), factoryCode: o.code || "", factoryName: o.name })}
                      onClear={() => patch(r.key, { factoryId: null, factoryCode: "", factoryName: "" })}
                    />
                  </td>
                  <td className={td}><span className="flex h-7 items-center truncate px-1.5 text-muted-foreground">{r.factoryName}</span></td>
                  <td className={td}><EditableGridInput type="number" align="right" nonNegative disabled={ro} className={cell} value={r.price} onChange={(v) => patch(r.key, { price: v === "" ? "" : String(normalizeNonNegative(v)) })} /></td>
                  <td className={td}>
                    <MasterAutocompleteField
                      label="Currency" compact masterKey="forex" displayValue={r.forexCode}
                      fetchOptions={async (t) => ((await legacyErpApi.lookupTable("forex", t)) as any[]).map((f) => ({ id: f.id, code: f.code, name: f.code || f.name }))}
                      onSelect={(o: MasterOption) => patch(r.key, { forexId: Number(o.id), forexCode: o.code || o.name })}
                      onClear={() => patch(r.key, { forexId: null, forexCode: "" })}
                    />
                  </td>
                  <td className={td}><EditableGridInput type="number" align="right" nonNegative disabled={ro} className={cell} value={r.quantity} onChange={(v) => patch(r.key, { quantity: v === "" ? "" : String(normalizeNonNegative(v)) })} /></td>
                  <td className={td}><input type="date" disabled={ro} className={cell} value={r.startDate} onChange={(e) => patch(r.key, { startDate: e.target.value })} /></td>
                  <td className={td}><input type="date" disabled={ro} className={cell} value={r.endDate} onChange={(e) => patch(r.key, { endDate: e.target.value })} /></td>
                  <td className={td}><input disabled={ro} className={cell} value={r.explanation} onChange={(e) => patch(r.key, { explanation: e.target.value })} /></td>
                  <td className={`${td} text-center`}>
                    {(r.id != null || r.factoryId != null || r.price !== "" || r.explanation) && (
                      <Button variant="ghost" size="icon" className="h-6 w-6" disabled={ro} onClick={() => { if (r.id != null) setDeleted((d) => [...d, r.id!]); setRows((rs) => rs.filter((x) => x.key !== r.key)); }}>
                        <Trash2 className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <DialogFooter className="items-center gap-1.5 sm:justify-between">
          <span className="text-[10.5px] text-muted-foreground">Price contracts are per Order + Factory (SM_ServicePriceList has no Process column). Removed rows are deleted on Save.</span>
          <div className="flex gap-1.5">
            <Button size="sm" className="h-7 text-[11.5px]" disabled={saving || loading || ro} onClick={save}>{saving ? "Saving…" : "Save"}</Button>
            <Button size="sm" variant="outline" className="h-7 text-[11.5px]" onClick={onClose}>Close</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
