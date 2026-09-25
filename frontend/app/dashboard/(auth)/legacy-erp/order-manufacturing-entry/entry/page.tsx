"use client";

// Manufacturing Entry child screen — ONE page serves Manufacturing IN / Manufacturing OUT /
// Sent (Repair) / Received (Repair) via ?mode=in|out|repair-sent|repair-received. Scoped to one
// (Order, Process, Color). Every row is a real MA_WorkOrderProduction entry (+ per-size
// MA_WorkOrderProductionVariant rows); Save sends the grid to PUT /legacy-erp/order-manufacturing/entries
// (insert new / update by id / soft-delete removed) and re-applies the persisted result. The bottom
// summary is the backend read model, so it only changes after a successful Save.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EditableGridInput } from "@/components/ui/editable-grid-input";
import { legacyErpApi } from "@/lib/nexuscore-api";
import { useWorkspaceSearchParams } from "@/hooks/use-workspace-search-params";
import { useWorkspaceTabContext } from "@/components/layout/workspace/workspace-tab-context";
import { useWorkspaceStore } from "@/lib/store/workspace-store";
import { useDecimalParameters } from "@/hooks/use-decimal-parameters";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { normalizeNonNegative } from "@/lib/numeric-guards";
import { MasterAutocompleteField, type MasterOption } from "@/components/legacy-erp/master-autocomplete-field";
import { SizeSummary, OM_CHANGED_EVENT, OM_ROUTE, type GrandTotal, type MaterialColumn, type MaterialCell, type QualityType, type ReadRow } from "../_components/size-summary";

interface ServerEntry {
  id: number; factoryId: number | null; factoryCode: string | null; factoryName: string | null; date: string | null;
  explanation: string | null; additionalInformation: string | null; partyNo: string | null; documentNo: string | null;
  qualityTypeId: number | null; weight: number | null; sizes: Record<string, number>;
}
interface EntryData {
  workOrder: { id: number; workOrderNo: string };
  style: { styleNumber: string; title: string } | null;
  process: { id: number; code: string | null; name: string | null } | null;
  lockReason: string | null;
  modeLabel: string;
  color: string;
  sizes: string[];
  materialColumns: MaterialColumn[];
  colorCells: Record<string, MaterialCell>;
  qualityTypes: QualityType[];
  entries: ServerEntry[];
  summary: { color: ReadRow; grandTotal: GrandTotal };
}
interface Draft {
  key: string; id: number | null;
  factoryId: number | null; factoryCode: string; factoryName: string; date: string;
  explanation: string; additionalInformation: string; partyNo: string; documentNo: string;
  qualityTypeId: number | null; weight: string; sizes: Record<string, string>;
}

let seq = 0;
const today = () => new Date().toISOString().slice(0, 10);

export default function ManufacturingEntryPage() {
  const router = useRouter();
  const sp = useWorkspaceSearchParams();
  const tabCtx = useWorkspaceTabContext();
  const closeTab = useWorkspaceStore((s) => s.closeTab);
  const { round, ensureLoaded } = useDecimalParameters();
  useEffect(() => { ensureLoaded(); }, [ensureLoaded]);
  const fmt = (n: number) => round(n, "quantity").toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const workOrderId = Number(sp.get("id")) || null;
  const processId = Number(sp.get("processId")) || null;
  const color = sp.get("color") || "";
  const mode = sp.get("mode") || "";

  const [data, setData] = useState<EntryData | null>(null);
  const [rows, setRows] = useState<Draft[]>([]);
  const [deleted, setDeleted] = useState<number[]>([]);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const blankRow = useCallback((d: EntryData): Draft => ({
    key: `n${++seq}`, id: null, factoryId: null, factoryCode: "", factoryName: "", date: today(),
    explanation: "", additionalInformation: "", partyNo: "", documentNo: "",
    qualityTypeId: d.qualityTypes[0]?.id ?? null, weight: "", sizes: {},
  }), []);

  const apply = useCallback((d: EntryData) => {
    setData(d);
    setRows([
      ...d.entries.map((e): Draft => ({
        key: `s${e.id}`, id: e.id, factoryId: e.factoryId, factoryCode: e.factoryCode || "", factoryName: e.factoryName || "", date: e.date || "",
        explanation: e.explanation || "", additionalInformation: e.additionalInformation || "", partyNo: e.partyNo || "", documentNo: e.documentNo || "",
        qualityTypeId: e.qualityTypeId, weight: e.weight == null ? "" : String(e.weight),
        sizes: Object.fromEntries(d.sizes.map((s) => [s, e.sizes[s] ? String(e.sizes[s]) : ""])),
      })),
      blankRow(d),
    ]);
    setDeleted([]);
    setDirty(false);
  }, [blankRow]);

  const load = useCallback(async () => {
    if (!workOrderId || !processId || !color || !mode) return;
    setLoading(true);
    try { apply((await legacyErpApi.orderManufacturing.getEntries(workOrderId, processId, color, mode)) as EntryData); }
    catch (e: any) { toast.error(e.message || "Failed to load Manufacturing Entry"); }
    finally { setLoading(false); }
  }, [workOrderId, processId, color, mode, apply]);
  useEffect(() => { load(); }, [load]);

  const patch = (key: string, p: Partial<Draft>) => {
    setDirty(true);
    setRows((rs) => {
      const next = rs.map((r) => (r.key === key ? { ...r, ...p } : r));
      return data && next[next.length - 1].key === key ? [...next, blankRow(data)] : next; // keep a trailing blank row
    });
  };
  const patchSize = (key: string, s: string, v: string) => {
    setDirty(true);
    setRows((rs) => {
      const next = rs.map((r) => (r.key === key ? { ...r, sizes: { ...r.sizes, [s]: v } } : r));
      return data && next[next.length - 1].key === key ? [...next, blankRow(data)] : next;
    });
  };

  const remove = (r: Draft) => {
    if (r.id != null) setDeleted((d) => [...d, r.id!]);
    setRows((rs) => rs.filter((x) => x.key !== r.key));
    setDirty(true);
  };

  const save = async () => {
    if (!data || !workOrderId || !processId || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const res = (await legacyErpApi.orderManufacturing.saveEntries({
        workOrderId, processId, color, mode, deletedIds: deleted,
        rows: rows.map((r) => ({
          id: r.id, factoryId: r.factoryId, date: r.date || null, explanation: r.explanation, additionalInformation: r.additionalInformation,
          partyNo: r.partyNo, documentNo: r.documentNo, qualityTypeId: r.qualityTypeId, weight: r.weight === "" ? null : Number(r.weight),
          sizes: Object.fromEntries(data.sizes.map((s) => [s, Number(r.sizes[s]) || 0])),
        })),
      })) as EntryData;
      apply(res);
      window.dispatchEvent(new CustomEvent(OM_CHANGED_EVENT, { detail: { workOrderId } }));
      toast.success(`${res.modeLabel} saved`);
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const close = () => {
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    closeTab(tabCtx?.tabKey ?? `${OM_ROUTE}/entry`);
    // Back to the parent screen with the same Order/Process/Color context.
    if (workOrderId) navigateOrOpenTab(router, `${OM_ROUTE}?id=${workOrderId}${processId ? `&processId=${processId}` : ""}&color=${encodeURIComponent(color)}`);
  };

  if (!workOrderId || !processId || !color || !mode) {
    return <p className="p-3 text-sm text-muted-foreground">Open this from Order Manufacturing Entry — select an Order, Process and row, then choose Manufacturing IN / OUT / Sent (Repair) / Received (Repair).</p>;
  }

  const ro = !!data?.lockReason;
  const th = "border border-border/70 bg-muted px-1.5 h-8 text-[10.5px] font-semibold text-muted-foreground text-left align-bottom whitespace-nowrap";
  const td = "border border-border/50 p-0";
  const cell = "h-6 w-full bg-transparent px-1.5 text-[11.5px] outline-none focus:bg-accent/50 disabled:opacity-70";
  const contextLine = data
    ? [data.workOrder.workOrderNo, data.style ? `${data.style.styleNumber} - ${data.style.title}` : null, data.color,
        ...data.materialColumns.map((m) => (data.colorCells[m.key]?.code ? `${m.label} [${data.colorCells[m.key].code}]` : null))].filter(Boolean).join(",  ")
    : "";

  return (
    <div className="flex min-h-[calc(100vh-7.5rem)] flex-col text-[11.5px]">
      <div className="bg-foreground px-3 py-1 text-[12px] font-semibold text-background">
        Manufacturing Entry - [{data?.modeLabel ?? mode}] - [{data?.process ? [data.process.code, data.process.name].filter(Boolean).join(" ") : ""}]
      </div>
      <div className="truncate border-b bg-muted/40 px-3 py-1.5 text-[12px] font-semibold">{contextLine}</div>
      {data?.lockReason && <p className="mx-2 mt-1 rounded-sm border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-400">{data.lockReason} Read-only.</p>}

      <div className="min-h-[150px] flex-1 overflow-auto">
        {loading && !data ? <Skeleton className="m-2 h-32" /> : data && (
          <table className="min-w-max border-collapse">
            <thead>
              <tr>
                <th className={th} style={{ width: 96 }}>Factory</th><th className={th} style={{ width: 150 }}>Factory Name</th>
                <th className={th} style={{ width: 112 }}>Date</th><th className={th} style={{ width: 140 }}>Explanation</th>
                <th className={th} style={{ width: 130 }}>Additional Information</th><th className={th} style={{ width: 90 }}>Party No</th>
                <th className={th} style={{ width: 100 }}>Document No</th><th className={th} style={{ width: 110 }}>Type</th>
                {data.sizes.map((s) => <th key={s} className={`${th} text-right`} style={{ width: 62 }}>{s}</th>)}
                <th className={`${th} text-right`} style={{ width: 72 }}>Total</th>
                <th className={`${th} text-right`} style={{ width: 72 }}>Weight</th><th className={th} style={{ width: 26 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const isBlank = i === rows.length - 1 && r.id == null;
                const total = data.sizes.reduce((a, s) => a + (Number(r.sizes[s]) || 0), 0);
                return (
                  <tr key={r.key} className={isBlank ? "italic opacity-80" : "odd:bg-background even:bg-muted/20"}>
                    <td className={td}>
                      <MasterAutocompleteField
                        label="Factory" compact masterKey="currentAccount" displayValue={r.factoryCode}
                        fetchOptions={(t) => legacyErpApi.accounts.list(t) as Promise<any[]>}
                        onSelect={(o: MasterOption) => patch(r.key, { factoryId: Number(o.id), factoryCode: o.code || "", factoryName: o.name })}
                        onClear={() => patch(r.key, { factoryId: null, factoryCode: "", factoryName: "" })}
                      />
                    </td>
                    <td className={td}><span className="flex h-6 items-center truncate px-1.5 text-muted-foreground">{r.factoryName}</span></td>
                    <td className={td}><input type="date" className={cell} disabled={ro} value={r.date} onChange={(e) => patch(r.key, { date: e.target.value })} /></td>
                    <td className={td}><input className={cell} disabled={ro} value={r.explanation} onChange={(e) => patch(r.key, { explanation: e.target.value })} /></td>
                    <td className={td}><input className={cell} disabled={ro} value={r.additionalInformation} onChange={(e) => patch(r.key, { additionalInformation: e.target.value })} /></td>
                    <td className={td}><input className={cell} disabled={ro} value={r.partyNo} onChange={(e) => patch(r.key, { partyNo: e.target.value })} /></td>
                    <td className={td}><input className={cell} disabled={ro} value={r.documentNo} onChange={(e) => patch(r.key, { documentNo: e.target.value })} /></td>
                    <td className={td}>
                      <select className={cell} disabled={ro} value={r.qualityTypeId ?? ""} onChange={(e) => patch(r.key, { qualityTypeId: e.target.value ? Number(e.target.value) : null })}>
                        <option value="" />
                        {data.qualityTypes.map((q) => <option key={q.id} value={q.id}>{q.name || q.code}</option>)}
                      </select>
                    </td>
                    {data.sizes.map((s) => (
                      <td key={s} className={td}>
                        <EditableGridInput type="number" align="right" nonNegative disabled={ro} className={`${cell} text-right font-mono`}
                          value={r.sizes[s] ?? ""} onChange={(v) => patchSize(r.key, s, v === "" ? "" : String(normalizeNonNegative(v)))} />
                      </td>
                    ))}
                    <td className={td}><span className="flex h-6 items-center justify-end px-1.5 font-mono">{total ? fmt(total) : ""}</span></td>
                    <td className={td}>
                      <EditableGridInput type="number" align="right" nonNegative disabled={ro} className={`${cell} text-right font-mono`}
                        value={r.weight} onChange={(v) => patch(r.key, { weight: v === "" ? "" : String(normalizeNonNegative(v)) })} />
                    </td>
                    <td className={`${td} text-center`}>
                      {!isBlank && <Button variant="ghost" size="icon" className="h-5 w-5" disabled={ro} title="Remove (deleted on Save)" onClick={() => remove(r)}><Trash2 className="h-3 w-3 text-muted-foreground" /></Button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {data && (
        <div className="max-h-[38vh] overflow-auto border-t-2 border-primary/40 p-1">
          <SizeSummary sizes={data.sizes} row={data.summary.color} grand={data.summary.grandTotal} fmt={fmt} />
        </div>
      )}

      <div className="flex items-center gap-1.5 border-t p-2">
        <Button size="sm" className="h-7 min-w-24 text-[11.5px]" disabled={!data || ro || saving || (!dirty && !deleted.length)} onClick={save}>{saving ? "Saving…" : "Save"}</Button>
        {dirty && <span className="text-[10.5px] text-amber-600">Unsaved changes</span>}
        <Button size="sm" variant="outline" className="ml-auto h-7 min-w-24 text-[11.5px]" onClick={close}>Close</Button>
      </div>
    </div>
  );
}
