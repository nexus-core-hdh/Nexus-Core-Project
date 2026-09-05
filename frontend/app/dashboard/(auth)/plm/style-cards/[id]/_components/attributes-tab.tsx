"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { ListOrdered, Plus, Save, Trash2 } from "lucide-react";
import { plmApi } from "@/lib/nexuscore-api";
import { cn } from "@/lib/utils";
import { GridInput, uid } from "./grid-input";
import { useGridColumns } from "@/hooks/use-grid-columns";
import { ManageColumnsModal } from "@/components/shared/manage-columns-modal";

type Row = { id: string; designDetailTypeId: string; description: string; imageUrl: string; notes: string };

// ---- Column resize/reorder/hide/persist — shared across every grid via useGridColumns,
// same pattern as bom-tab.tsx. storageKey "styleCardAttributesGrid" is net-new (this tab never
// had column customization before).
type ColKey = "designDetailTypeId" | "description" | "imageUrl" | "notes";
type ColumnDef = { key: ColKey; label: string };
const COLUMNS: ColumnDef[] = [
  { key: "designDetailTypeId", label: "Detail Type" },
  { key: "description", label: "Description" },
  { key: "imageUrl", label: "Image URL" },
  { key: "notes", label: "Notes" },
];
const COLUMN_BY_KEY = new Map(COLUMNS.map((c) => [c.key, c]));
// Detail Type identifies the row and always stays first & visible.
const FIXED_COLS: ColKey[] = ["designDetailTypeId"];
const DEFAULT_WIDTHS: Record<ColKey, number> = { designDetailTypeId: 180, description: 220, imageUrl: 160, notes: 220 };
const MIN_WIDTHS: Record<ColKey, number> = { designDetailTypeId: 140, description: 160, imageUrl: 120, notes: 160 };
const DEL_W = 40;

// The "Attributes" tab the reference doc asks for, built directly on StyleCardDetail — an
// already-existing Prisma model + already-existing backend endpoints
// (plmApi.styleCards.getDetails/addDetail/upsertDetails, see plm-cards.service.ts) that simply
// had no frontend tab rendering them anywhere yet. No new schema, no new backend route — only
// this UI was missing. Sample Card reuses this component wholesale via the optional
// `sampleCardId` prop, backed by its own independent SampleCardDetail table (same global
// DesignDetailType lookup, never linked to Style Card's own rows).
export function AttributesTab({ styleCardId, sampleCardId, card }: { styleCardId?: string; sampleCardId?: string; card: any; onReloadCard: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [types, setTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [details, dts]: [any, any] = await Promise.all([
        sampleCardId ? plmApi.sampleCards.getDetails(sampleCardId) : plmApi.styleCards.getDetails(styleCardId!),
        plmApi.designDetailTypes.list(),
      ]);
      const list = Array.isArray(details) ? details : details?.data || [];
      setRows(list.map((d: any) => ({ id: d.id, designDetailTypeId: d.designDetailTypeId, description: d.description || "", imageUrl: d.imageUrl || "", notes: d.notes || "" })));
      setTypes(Array.isArray(dts) ? dts : dts?.data || []);
    } catch (e: any) {
      toast.error(e.message || "Failed to load attributes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [styleCardId, sampleCardId]);

  const update = (id: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, { id: uid(), designDetailTypeId: types[0]?.id || "", description: "", imageUrl: "", notes: "" }]);
  const removeRow = (id: string) => setRows((rs) => rs.filter((r) => r.id !== id));

  const save = async () => {
    if (rows.some((r) => !r.designDetailTypeId)) return toast.error("Every row needs a Detail Type");
    setSaving(true);
    try {
      const details = rows.map(({ designDetailTypeId, description, imageUrl, notes }) => ({ designDetailTypeId, description, imageUrl, notes }));
      if (sampleCardId) await plmApi.sampleCards.upsertDetails(sampleCardId, details);
      else await plmApi.styleCards.upsertDetails(styleCardId!, details);
      toast.success("Attributes saved");
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed to save attributes");
    } finally {
      setSaving(false);
    }
  };

  const gridColumnDefs = useMemo(
    () => COLUMNS.map((c) => ({ key: c.key, label: c.label, defaultWidth: DEFAULT_WIDTHS[c.key], minWidth: MIN_WIDTHS[c.key] })),
    [],
  );
  const gridColumns = useGridColumns<ColKey>({
    storageKey: sampleCardId ? "sampleCardAttributesGrid" : "styleCardAttributesGrid",
    columns: gridColumnDefs,
    fixedColumns: FIXED_COLS,
  });
  const displayColumnDefs = useMemo(
    () => gridColumns.displayColumnDefs.map((c) => COLUMN_BY_KEY.get(c.key)!),
    [gridColumns.displayColumnDefs],
  );
  const colWidths = gridColumns.colWidths;
  const startResize = gridColumns.startResize;
  const resetColumnWidth = gridColumns.resetWidth;
  const totalTableWidth = gridColumns.totalWidth(DEL_W);

  const renderCell = (r: Row, key: ColKey) => {
    switch (key) {
      case "designDetailTypeId":
        return (
          <select value={r.designDetailTypeId} onChange={(e) => update(r.id, { designDetailTypeId: e.target.value })} className="h-7 w-full text-xs bg-transparent outline-none rounded focus:bg-accent/50">
            <option value="">—</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        );
      case "description":
        return <GridInput value={r.description} onChange={(v) => update(r.id, { description: v })} />;
      case "imageUrl":
        return <GridInput value={r.imageUrl} onChange={(v) => update(r.id, { imageUrl: v })} />;
      case "notes":
        return <GridInput value={r.notes} onChange={(v) => update(r.id, { notes: v })} />;
      default:
        return null;
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground py-8 text-center">Loading attributes...</p>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" className="h-7 px-2.5 text-[13px]" onClick={gridColumns.manageColumns.openModal}>
          <ListOrdered className="h-3.5 w-3.5 mr-1" />Manage Columns
        </Button>
        <Button size="sm" onClick={save} disabled={saving}><Save className="h-4 w-4 mr-1" />{saving ? "Saving..." : "Save"}</Button>
      </div>
      <div className="rounded-md border overflow-x-auto">
        <Table className="table-fixed" style={{ width: totalTableWidth, minWidth: "100%" }}>
          <colgroup>
            {displayColumnDefs.map((col) => <col key={col.key} style={{ width: colWidths[col.key] }} />)}
            <col style={{ width: DEL_W }} />
          </colgroup>
          <TableHeader>
            <TableRow className="[&>th]:border-r [&>th]:text-[11px] [&>th]:h-8 [&>th]:whitespace-nowrap">
              {displayColumnDefs.map((col) => {
                const fixed = FIXED_COLS.includes(col.key);
                return (
                  <TableHead
                    key={col.key}
                    className={cn("relative p-0", gridColumns.dragOverColumn === col.key && "bg-primary/15")}
                    onDragOver={gridColumns.getHeaderDragProps(col.key).onDragOver}
                    onDrop={gridColumns.getHeaderDragProps(col.key).onDrop}
                  >
                    <span
                      title={col.label}
                      draggable={!fixed}
                      onDragStart={gridColumns.getHeaderDragProps(col.key).onDragStart}
                      onDragEnd={gridColumns.getHeaderDragProps(col.key).onDragEnd}
                      className={cn("flex h-8 w-full min-w-0 items-center truncate px-2 justify-start", !fixed && "cursor-grab active:cursor-grabbing")}
                    >
                      {col.label}
                    </span>
                    <div
                      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary"
                      onMouseDown={startResize(col.key)}
                      onDoubleClick={() => resetColumnWidth(col.key)}
                      title="Drag to resize · double-click to reset width"
                      aria-hidden="true"
                    />
                  </TableHead>
                );
              })}
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={displayColumnDefs.length + 1} className="text-center text-sm text-muted-foreground py-8">No attributes yet</TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.id} className="[&>td]:border-r [&>td]:p-0">
                {displayColumnDefs.map((col) => (
                  <TableCell key={col.key} className={col.key === "designDetailTypeId" ? "p-1" : undefined}>
                    {renderCell(r, col.key)}
                  </TableCell>
                ))}
                <TableCell className="p-0 text-center"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeRow(r.id)}><Trash2 className="h-3.5 w-3.5 text-muted-foreground" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addRow}><Plus className="h-3.5 w-3.5 mr-1" />Add Row</Button>

      <ManageColumnsModal
        state={gridColumns.manageColumns}
        fixedColumns={FIXED_COLS}
        columns={gridColumnDefs}
        description="Show, hide and reorder columns. Detail Type is required and always stays first."
      />
    </div>
  );
}
