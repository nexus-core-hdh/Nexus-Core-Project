"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Save, Plus, Trash2, Search, ListOrdered } from "lucide-react";
import { plmApi, legacyErpApi } from "@/lib/nexuscore-api";
import { getCurrentUser } from "@/lib/auth";
import { AutocompleteTextCell, type AutocompleteOption } from "@/components/legacy-erp/autocomplete-text-cell";
import { CardLookupDialog, type CardLookupRow } from "@/components/legacy-erp/card-lookup-dialog";
import { useGridColumns } from "@/hooks/use-grid-columns";
import { useDecimalParameters } from "@/hooks/use-decimal-parameters";
import { ManageColumnsModal } from "@/components/shared/manage-columns-modal";
import { useWorkspaceRecordLabel } from "@/hooks/use-workspace-tab-title";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { cn } from "@/lib/utils";

const uid = () => Math.random().toString(36).slice(2, 10);
const num = (v: any) => (v === null || v === undefined || v === "" ? 0 : Number(v));

type LineRow = {
  id: string; recId?: string; processId: string | null; processCode: string; processName: string;
  explanation: string; unitPrice: number; forex: string; forexRate: number; forexUnitPrice: number; isActive: boolean;
};
const blankLine = (): LineRow => ({
  id: uid(), processId: null, processCode: "", processName: "", explanation: "",
  unitPrice: 0, forex: "", forexRate: 0, forexUnitPrice: 0, isActive: true,
});

type ColKey = "processCode" | "processName" | "explanation" | "unitPrice" | "forex" | "forexRate" | "forexUnitPrice" | "isActive";
const COLUMNS: { key: ColKey; label: string; align?: "left" | "right" | "center" }[] = [
  { key: "processCode", label: "Process Code" },
  { key: "processName", label: "Process Name" },
  { key: "explanation", label: "Explanation" },
  { key: "unitPrice", label: "Unit Price", align: "right" },
  { key: "forex", label: "Forex" },
  { key: "forexRate", label: "Forex Rate", align: "right" },
  { key: "forexUnitPrice", label: "Forex Unit Price", align: "right" },
  { key: "isActive", label: "In Use", align: "center" },
];
const DEFAULT_WIDTHS: Record<ColKey, number> = {
  processCode: 110, processName: 220, explanation: 200, unitPrice: 100, forex: 90, forexRate: 100, forexUnitPrice: 120, isActive: 80,
};
const MIN_WIDTHS: Record<ColKey, number> = {
  processCode: 80, processName: 140, explanation: 120, unitPrice: 80, forex: 70, forexRate: 80, forexUnitPrice: 90, isActive: 60,
};
const COLUMN_BY_KEY = new Map(COLUMNS.map((c) => [c.key, c]));
const FIXED_COLS: ColKey[] = ["processCode", "processName"];
const DEL_W = 36;

interface RouteLookupRow extends CardLookupRow { raw: any }

// Route Definitions detail — the SAME existing RouteCard/RouteCardLine master this app's own
// Route Cards screen already manages (plmApi.routeCards), restyled into the dense legacy-ERP
// layout the reference screenshot shows. No new table/model — only the presentation and the
// per-record route (this file) are new; the data/API underneath is unchanged.
export default function RouteCardDetailPage() {
  const { id: routeId } = useParams() as { id: string };
  const router = useRouter();
  const isNew = routeId === "new";
  const [recordId, setRecordId] = useState<string | null>(isNew ? null : routeId);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  const [header, setHeader] = useState({ code: "", name: "", accessCode: "", specialCode: "", serviceCode: "", inUse: true });
  const [lines, setLines] = useState<LineRow[]>([]);
  const origLineIds = useRef<Set<string>>(new Set());

  const [processOptions, setProcessOptions] = useState<AutocompleteOption[]>([]);
  const processCacheRef = useRef<Record<string, any>>({});
  const [routeLookupOpen, setRouteLookupOpen] = useState(false);
  const [processLookupRowId, setProcessLookupRowId] = useState<string | null>(null);

  const { round, ensureLoaded: ensureDecimalParamsLoaded } = useDecimalParameters();
  useEffect(() => { ensureDecimalParamsLoaded(); }, [ensureDecimalParamsLoaded]);
  useWorkspaceRecordLabel(recordId ? header.code || undefined : undefined);

  const loadProcesses = async () => {
    const p: any = await plmApi.processCards.list().catch(() => []);
    const list = Array.isArray(p) ? p : [];
    list.forEach((row: any) => { processCacheRef.current[String(row.id)] = row; });
    setProcessOptions(list.map((row: any) => ({ id: String(row.id), code: row.code, name: row.name })));
  };

  const load = async (id: string) => {
    setLoading(true);
    try {
      const r: any = await plmApi.routeCards.get(id);
      setHeader({
        code: r.code || "", name: r.name || "", accessCode: r.accessCode || "",
        specialCode: r.specialCode || "", serviceCode: r.serviceCode || "", inUse: !!r.inUse,
      });
      const loadedLines: LineRow[] = (r.lines || []).map((l: any) => ({
        id: uid(), recId: l.id, processId: l.processId,
        processCode: l.process?.code || "", processName: l.process?.name || "",
        explanation: l.explanation || "", unitPrice: num(l.unitPrice), forex: l.forex || "",
        forexRate: num(l.forexRate), forexUnitPrice: num(l.forexUnitPrice), isActive: !!l.isActive,
      }));
      setLines(loadedLines.length ? loadedLines : [blankLine()]);
      origLineIds.current = new Set(loadedLines.map((l) => l.recId!).filter(Boolean));
      setRecordId(r.id);
    } catch (e: any) {
      toast.error(e.message || "Failed to load route");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadProcesses(); }, []);
  useEffect(() => { if (!isNew) load(routeId); }, [routeId]);

  const set = (key: keyof typeof header, v: any) => setHeader((p) => ({ ...p, [key]: v }));
  const update = (id: string, patch: Partial<LineRow>) => setLines((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRow = () => setLines((rs) => [...rs, blankLine()]);
  const removeRow = (id: string) => setLines((rs) => rs.filter((r) => r.id !== id));

  const applyProcessSelection = (rowId: string, processId: string, code: string, name: string) => {
    update(rowId, { processId, processCode: code, processName: name });
  };

  const save = async () => {
    if (!header.code.trim() || !header.name.trim()) return toast.error("Code and Name are required");
    setSaving(true);
    try {
      let id = recordId;
      const user = getCurrentUser();
      const dto = { ...header, branchId: user?.branchId };
      if (id) {
        await plmApi.routeCards.update(id, dto);
      } else {
        const created: any = await plmApi.routeCards.create(dto);
        id = created.id;
        setRecordId(id);
        router.replace(`/dashboard/plm/general-definitions/route-cards/${id}`);
      }

      // Diff-based save over the EXISTING per-line add/update/delete API (no bulk "upsertLines"
      // endpoint exists, and adding one isn't needed — this reuses what's already there while
      // still guaranteeing repeated Save never duplicates a row: a row keeps its own `recId`
      // once persisted, so it's always routed to updateLine, never addLine, on subsequent saves).
      const stillPresent = new Set<string>();
      for (const line of lines) {
        if (!line.processId) continue; // blank/incomplete row — same "skip, don't block Save" rule as Yarn Recipe's own blank-row handling
        const payload = {
          processId: line.processId, explanation: line.explanation || undefined,
          unitPrice: round(line.unitPrice, "unit-price"), forex: line.forex || undefined,
          forexRate: round(line.forexRate, "forex-rate"), forexUnitPrice: round(line.forexUnitPrice, "forex-unit-price"),
          isActive: line.isActive,
        };
        if (line.recId) {
          await plmApi.routeCards.updateLine(id!, line.recId, payload);
          stillPresent.add(line.recId);
        } else {
          const created: any = await plmApi.routeCards.addLine(id!, payload);
          if (created?.id) stillPresent.add(created.id);
        }
      }
      for (const origId of origLineIds.current) {
        if (!stillPresent.has(origId)) await plmApi.routeCards.deleteLine(id!, origId);
      }

      toast.success("Route saved");
      await load(id!);
    } catch (e: any) {
      toast.error(e.message || "Failed to save route");
    } finally {
      setSaving(false);
    }
  };

  // ── Column manager (Processes grid) — same useGridColumns/ManageColumnsModal every other
  // legacy-erp/BOM grid in this app already uses, screen-specific storageKey.
  const gridColumnDefs = useMemo(
    () => COLUMNS.map((c) => ({ key: c.key, label: c.label, defaultWidth: DEFAULT_WIDTHS[c.key], minWidth: MIN_WIDTHS[c.key] })),
    [],
  );
  const gridColumns = useGridColumns<ColKey>({ storageKey: "routeCardProcessGrid", columns: gridColumnDefs, fixedColumns: FIXED_COLS });
  const displayColumnDefs = useMemo(
    () => gridColumns.displayColumnDefs.map((c) => COLUMN_BY_KEY.get(c.key)!),
    [gridColumns.displayColumnDefs],
  );
  const totalTableWidth = gridColumns.totalWidth(DEL_W);

  const th = "border-r border-border/70 bg-muted/50 px-2 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground/90 h-7 whitespace-nowrap";
  const td = "border-r border-b border-border/50 p-0";
  const cellInput = "h-6 w-full bg-transparent px-1.5 text-[11.5px] outline-none";

  const renderCell = (r: LineRow, key: ColKey) => {
    switch (key) {
      case "processCode":
        return <span className="flex h-6 items-center px-1.5 truncate font-mono text-muted-foreground">{r.processCode || "—"}</span>;
      case "processName":
        return (
          <div className="flex h-full w-full items-stretch">
            <div className="min-w-0 flex-1">
              <AutocompleteTextCell
                value={r.processName}
                options={processOptions}
                placeholder="Type to Search"
                startOpen={false}
                onChange={(v) => update(r.id, { processName: v })}
                onCancel={() => {}}
                onCommit={(finalValue) => update(r.id, finalValue.trim() ? { processName: finalValue } : { processName: "", processId: null, processCode: "" })}
                onSelectOption={(o) => applyProcessSelection(r.id, String(o.id), String(o.code ?? ""), o.name || "")}
              />
            </div>
            <button type="button" title="Browse Processes" onClick={() => setProcessLookupRowId(r.id)}
              className="flex w-6 shrink-0 items-center justify-center border-l text-muted-foreground hover:bg-accent hover:text-foreground">
              <Search className="h-3 w-3" />
            </button>
          </div>
        );
      case "explanation":
        return <input className={cellInput} value={r.explanation} onChange={(e) => update(r.id, { explanation: e.target.value })} />;
      case "unitPrice":
        return <input type="number" className={`${cellInput} text-right font-mono`} value={r.unitPrice} onChange={(e) => update(r.id, { unitPrice: parseFloat(e.target.value) || 0 })} />;
      case "forex":
        return <input className={cellInput} value={r.forex} onChange={(e) => update(r.id, { forex: e.target.value })} />;
      case "forexRate":
        return <input type="number" className={`${cellInput} text-right font-mono`} value={r.forexRate} onChange={(e) => update(r.id, { forexRate: parseFloat(e.target.value) || 0 })} />;
      case "forexUnitPrice":
        return <input type="number" className={`${cellInput} text-right font-mono`} value={r.forexUnitPrice} onChange={(e) => update(r.id, { forexUnitPrice: parseFloat(e.target.value) || 0 })} />;
      case "isActive":
        return <div className="flex h-6 items-center justify-center"><Checkbox checked={r.isActive} onCheckedChange={(v) => update(r.id, { isActive: !!v })} className="h-3.5 w-3.5" /></div>;
      default:
        return null;
    }
  };

  if (loading) return <p className="p-8 text-center text-sm text-muted-foreground">Loading...</p>;

  return (
    <div className="mx-auto max-w-[1400px] space-y-3 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] text-muted-foreground">
            General Definitions ›{" "}
            <button
              type="button"
              onClick={() => navigateOrOpenTab(router, "/dashboard/plm/general-definitions/route-cards")}
              className="hover:text-foreground hover:underline"
            >
              Route Definitions
            </button>
          </p>
          <h1 className="text-[17px] font-semibold leading-tight">{recordId ? `Route Definitions - ${header.code}` : "New Route"}</h1>
        </div>
        <Button size="sm" className="h-7 text-xs" onClick={save} disabled={saving}>
          <Save className="h-3.5 w-3.5 mr-1" />{saving ? "Saving..." : "Save"}
        </Button>
      </div>

      {/* Header — dense two-line layout matching the reference: Code+search+In Use on one row,
          Name/Access Code/Special Code/Service Code stacked below. */}
      <div className="rounded-md border p-3 space-y-2">
        <div className="flex items-end gap-4">
          <div className="w-56 space-y-1">
            <label className="text-[11px] font-semibold text-foreground">Code</label>
            <div className="flex h-8 items-stretch rounded-md border bg-background">
              <input className="h-full flex-1 bg-transparent px-2 text-xs outline-none" value={header.code} onChange={(e) => set("code", e.target.value)} />
              <button type="button" title="Browse Routes" onClick={() => setRouteLookupOpen(true)} className="flex w-7 items-center justify-center border-l text-muted-foreground hover:bg-accent hover:text-foreground">
                <Search className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <label className="mb-2 flex items-center gap-1.5 text-xs">
            <Checkbox checked={header.inUse} onCheckedChange={(v) => set("inUse", !!v)} className="h-3.5 w-3.5" />In Use
          </label>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1 lg:col-span-2">
            <label className="text-[11px] text-muted-foreground">Name</label>
            <input className="h-8 w-full rounded-md border bg-background px-2 text-xs outline-none" value={header.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">Access Code</label>
            <input className="h-8 w-full rounded-md border bg-background px-2 text-xs outline-none" value={header.accessCode} onChange={(e) => set("accessCode", e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">Special Code</label>
            <input className="h-8 w-full rounded-md border bg-background px-2 text-xs outline-none" value={header.specialCode} onChange={(e) => set("specialCode", e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">Service Code</label>
            {/* RouteCard.serviceCode is plain free text (no FK) — the existing legacy `service`
                master (SM_Service, via legacyErpApi.lookupTable) is wired in as pick-assist only,
                same convention as Work Order's own Season field. */}
            <div className="flex h-8 items-stretch rounded-md border bg-background">
              <input className="h-full flex-1 bg-transparent px-2 text-xs outline-none" value={header.serviceCode} onChange={(e) => set("serviceCode", e.target.value)} />
              <ServiceCodeLookupButton onPick={(code) => set("serviceCode", code)} />
            </div>
          </div>
        </div>
      </div>

      {/* Processes */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-primary">Processes</h2>
          <Button variant="outline" size="sm" className="h-6 px-2 text-[11px]" onClick={gridColumns.manageColumns.openModal}>
            <ListOrdered className="h-3 w-3 mr-1" />Manage Columns
          </Button>
        </div>
        <div className="rounded-md border overflow-x-auto">
          <table className="table-fixed border-collapse text-[11.5px]" style={{ width: totalTableWidth, minWidth: "100%" }}>
            <colgroup>
              {displayColumnDefs.map((c) => <col key={c.key} style={{ width: gridColumns.getWidth(c.key) }} />)}
              <col style={{ width: DEL_W }} />
            </colgroup>
            <thead>
              <tr>
                {displayColumnDefs.map((col) => {
                  const fixed = FIXED_COLS.includes(col.key);
                  return (
                    <th key={col.key} className={cn("relative p-0", th, gridColumns.dragOverColumn === col.key && "bg-primary/15")}
                      onDragOver={gridColumns.getHeaderDragProps(col.key).onDragOver} onDrop={gridColumns.getHeaderDragProps(col.key).onDrop}>
                      <span
                        draggable={!fixed}
                        onDragStart={gridColumns.getHeaderDragProps(col.key).onDragStart}
                        onDragEnd={gridColumns.getHeaderDragProps(col.key).onDragEnd}
                        className={cn("flex h-7 w-full items-center truncate px-2", col.align === "right" && "justify-end", col.align === "center" && "justify-center", !fixed && "cursor-grab active:cursor-grabbing")}
                      >
                        {col.label}
                      </span>
                      <div className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary" onMouseDown={gridColumns.startResize(col.key)} onDoubleClick={() => gridColumns.resetWidth(col.key)} />
                    </th>
                  );
                })}
                <th className={th} style={{ width: DEL_W }} />
              </tr>
            </thead>
            <tbody>
              {lines.map((r) => (
                <tr key={r.id}>
                  {displayColumnDefs.map((col) => (
                    <td key={col.key} className={td}>{renderCell(r, col.key)}</td>
                  ))}
                  <td className={`${td} text-center`}>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeRow(r.id)}><Trash2 className="h-3 w-3 text-muted-foreground" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button variant="outline" size="sm" className="h-6 text-[11px]" onClick={addRow}><Plus className="h-3 w-3 mr-1" />Add Process</Button>
      </div>

      <ManageColumnsModal
        state={gridColumns.manageColumns}
        fixedColumns={FIXED_COLS}
        columns={gridColumnDefs}
        description="Show, hide and reorder columns. Process Code and Process Name are required and always stay first."
      />

      <CardLookupDialog<RouteLookupRow>
        open={routeLookupOpen}
        onOpenChange={setRouteLookupOpen}
        title="Select Route"
        fetchOptions={async (search) => {
          const rows: any = await plmApi.routeCards.list({});
          const list = Array.isArray(rows) ? rows : [];
          const term = (search || "").toLowerCase();
          return list
            .filter((c: any) => !term || c.code?.toLowerCase().includes(term) || c.name?.toLowerCase().includes(term))
            .map((c: any): RouteLookupRow => ({ id: c.id, inventoryCode: c.code, inventoryName: c.name, inUse: !!c.inUse, raw: c }));
        }}
        onSelect={(row) => router.push(`/dashboard/plm/general-definitions/route-cards/${row.id}`)}
      />

      {processLookupRowId && (
        <CardLookupDialog<CardLookupRow>
          open={!!processLookupRowId}
          onOpenChange={(open) => !open && setProcessLookupRowId(null)}
          title="Select Process"
          fetchOptions={async (search) => {
            const rows: any = await plmApi.processCards.list();
            const list = Array.isArray(rows) ? rows : [];
            const term = (search || "").toLowerCase();
            return list
              .filter((p: any) => !term || p.code?.toLowerCase().includes(term) || p.name?.toLowerCase().includes(term))
              .map((p: any) => ({ id: p.id, inventoryCode: p.code, inventoryName: p.name, inUse: p.isActive }));
          }}
          onSelect={(row: any) => {
            processCacheRef.current[String(row.id)] = row;
            applyProcessSelection(processLookupRowId, String(row.id), row.inventoryCode || "", row.inventoryName || "");
          }}
        />
      )}
    </div>
  );
}

// Service Code pick-assist — reuses the existing legacy `service` lookup (SM_Service, via
// legacy-master-lookup.service.ts's already-registered TABLES config) purely to help fill the
// free-text serviceCode field; RouteCard.serviceCode has no FK, so nothing is stored but the code
// string itself.
function ServiceCodeLookupButton({ onPick }: { onPick: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" title="Browse Services" onClick={() => setOpen(true)} className="flex w-7 items-center justify-center border-l text-muted-foreground hover:bg-accent hover:text-foreground">
        <Search className="h-3.5 w-3.5" />
      </button>
      <CardLookupDialog<CardLookupRow>
        open={open}
        onOpenChange={setOpen}
        title="Select Service"
        fetchOptions={async (search) => {
          const rows: any = await legacyErpApi.lookupTable("service", search);
          const list = Array.isArray(rows) ? rows : [];
          return list.map((r: any) => ({ id: r.id, inventoryCode: r.code, inventoryName: r.name, inUse: true }));
        }}
        onSelect={(row: any) => onPick(row.inventoryCode || "")}
      />
    </>
  );
}
