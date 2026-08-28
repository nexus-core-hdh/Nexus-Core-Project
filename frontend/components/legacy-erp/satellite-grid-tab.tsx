"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { toast } from "sonner";
import { Plus, Trash2, Inbox, ListOrdered } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGridColumns } from "@/hooks/use-grid-columns";
import { ManageColumnsModal } from "@/components/shared/manage-columns-modal";

export interface SatelliteField {
  key: string;
  label: string;
  type?: "text" | "number" | "date" | "checkbox";
}

/** The subset of a card's legacyErpApi client this component needs — legacyErpApi.fabricCards,
 *  .yarnCards and .trimInventoryCards all already satisfy this shape as-is. */
export interface SatelliteApi {
  listTab: (id: number, tab: string) => Promise<any>;
  createTabRow: (id: number, tab: string, d: any) => Promise<any>;
  removeTabRow: (id: number, tab: string, lineId: number) => Promise<any>;
}

interface Props {
  itemId: number;
  tab: string; // matches backend SATELLITES key in yarn-card-satellites.service.ts
  fields: SatelliteField[];
  addLabel?: string;
  readOnly?: boolean;
  /** Which card's API this instance reads/writes through — Fabric Card, Trim Card, ... */
  api: SatelliteApi;
  /** Overrides the column-layout storage key when two UI tabs legitimately share the same
   *  backend `tab` (e.g. a read-only "Warehouse Status" summary and the editable "Warehouse
   *  Parameters" form both read/write IM_ItemWarehouse via tab="warehouse-parameters", but have
   *  different field sets) — without this, both instances would silently share one saved column
   *  layout despite being different grids. Defaults to `tab` (existing behavior) when omitted. */
  columnsKey?: string;
}

// Generic grid+dialog satellite-tab editor (Warehouse Parameters, Barcode, ...) — shared by
// every IM_Item-based card (Fabric, Trim; Yarn Card keeps its own pre-existing private copy,
// untouched) via the `api` prop instead of a hardcoded legacyErpApi.<card> reference, so
// there's exactly one implementation instead of one per card.
export function SatelliteGridTab({ itemId, tab, fields, addLabel = "Add Row", readOnly = false, api, columnsKey }: Props) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r: any = await api.listTab(itemId, tab);
      setRows(Array.isArray(r) ? r : []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [itemId, tab]);

  const set = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await api.createTabRow(itemId, tab, form);
      toast.success("Added");
      setOpen(false);
      setForm({});
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    try {
      await api.removeTabRow(itemId, tab, id);
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // ---- Column resize/reorder/hide/persist — shared via useGridColumns. `fields` is a runtime
  // prop (this component is reused across every satellite tab with a different column set), so
  // ColKey is plain `string` here instead of a per-file union. storageKey is namespaced by
  // `columnsKey` (defaulting to `tab`, the satellite category e.g. "warehouse-parameters") on
  // top of the base key so different tabs sharing this one generic component never collide in
  // tablePreferences — `columnsKey` exists as a separate override specifically because `tab`
  // alone is NOT always unique: a read-only summary view and an editable form can legitimately
  // share one backend `tab` while needing distinct saved layouts (see the Props doc above). The
  // first field is treated as the row's identifying column and stays pinned first/unhideable,
  // matching every other migrated grid's FIXED_COLS convention.
  const gridColumnDefs = useMemo(
    () => fields.map((f) => ({
      key: f.key,
      label: f.label,
      defaultWidth: f.type === "number" || f.type === "checkbox" ? 100 : 150,
      minWidth: f.type === "number" || f.type === "checkbox" ? 70 : 90,
    })),
    [fields],
  );
  const fieldByKey = useMemo(() => new Map(fields.map((f) => [f.key, f])), [fields]);
  const fixedFieldKeys = useMemo(() => (fields.length ? [fields[0].key] : []), [fields]);
  const gridColumns = useGridColumns<string>({
    storageKey: `cardsSatelliteGrid_${columnsKey ?? tab}`,
    columns: gridColumnDefs,
    fixedColumns: fixedFieldKeys,
  });
  const displayFields = useMemo(
    () => gridColumns.displayColumnDefs.map((c) => fieldByKey.get(c.key)!),
    [gridColumns.displayColumnDefs, fieldByKey],
  );
  const gridRootRef = useRef<HTMLDivElement>(null);
  const DEL_W = 40;
  const totalTableWidth = gridColumns.totalWidth(!readOnly ? DEL_W : 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        {!readOnly && (
          <Button variant="outline" size="sm" onClick={gridColumns.manageColumns.openModal}>
            <ListOrdered className="h-3.5 w-3.5 mr-2" />Manage Columns
          </Button>
        )}
        {!readOnly && (
          <Button size="sm" onClick={() => { setForm({}); setOpen(true); }}>
            <Plus className="h-3.5 w-3.5 mr-2" />{addLabel}
          </Button>
        )}
      </div>
      <div ref={gridRootRef} className="rounded-xl border shadow-sm overflow-hidden">
        <Table className="table-fixed" style={{ width: totalTableWidth, minWidth: "100%" }}>
          <colgroup>
            {displayFields.map((f) => <col key={f.key} style={{ width: gridColumns.getWidth(f.key) }} />)}
            {!readOnly && <col style={{ width: DEL_W }} />}
          </colgroup>
          <TableHeader>
            <TableRow className="border-b bg-muted/40 hover:bg-muted/40">
              {displayFields.map((f) => {
                const fixed = fixedFieldKeys.includes(f.key);
                return (
                  <TableHead
                    key={f.key}
                    className={cn("relative h-10 p-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80", gridColumns.dragOverColumn === f.key && "bg-primary/15")}
                    onDragOver={gridColumns.getHeaderDragProps(f.key).onDragOver}
                    onDrop={gridColumns.getHeaderDragProps(f.key).onDrop}
                  >
                    <span
                      title={f.label}
                      draggable={!fixed}
                      onDragStart={gridColumns.getHeaderDragProps(f.key).onDragStart}
                      onDragEnd={gridColumns.getHeaderDragProps(f.key).onDragEnd}
                      data-col={f.key}
                      className={cn("flex h-10 w-full min-w-0 items-center truncate px-2", !fixed && "cursor-grab active:cursor-grabbing")}
                    >
                      {f.label}
                    </span>
                    <div
                      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary"
                      onMouseDown={gridColumns.startResize(f.key)}
                      onDoubleClick={() => gridColumns.autoFitColumn(f.key, gridRootRef.current)}
                      title="Drag to resize · double-click to auto-fit"
                      aria-hidden="true"
                    />
                  </TableHead>
                );
              })}
              {!readOnly && <TableHead className="w-10 h-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow className="hover:bg-transparent"><TableCell colSpan={displayFields.length + 1} className="py-4"><Skeleton className="h-6 w-full" /></TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={displayFields.length + 1} className="py-8">
                  <Empty>
                    <EmptyHeader>
                      <EmptyMedia variant="icon"><Inbox /></EmptyMedia>
                      <EmptyTitle className="text-sm">No records</EmptyTitle>
                      <EmptyDescription>{readOnly ? "Nothing has been added yet." : `Click "${addLabel}" to add the first one.`}</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </TableCell>
              </TableRow>
            ) : rows.map((row) => (
              <TableRow key={row.id} className="group">
                {displayFields.map((f) => (
                  <TableCell key={f.key} className="py-3">
                    {f.type === "checkbox" ? (
                      row[f.key] ? <span className="text-foreground">Yes</span> : <span className="text-muted-foreground">No</span>
                    ) : (row[f.key] ?? <span className="text-muted-foreground">—</span>)}
                  </TableCell>
                ))}
                {!readOnly && (
                  <TableCell className="py-3">
                    <Button variant="ghost" size="icon" className="opacity-60 group-hover:opacity-100 transition-opacity" onClick={() => remove(row.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ManageColumnsModal
        state={gridColumns.manageColumns}
        fixedColumns={fixedFieldKeys}
        columns={gridColumnDefs}
        description="Show, hide and reorder columns."
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{addLabel}</DialogTitle>
            <DialogDescription>Fill in the fields below and save to add this row.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {fields.map((f) => (
              <div key={f.key} className={f.type === "checkbox" ? "flex items-center gap-2 self-end h-9" : "space-y-2"}>
                {f.type === "checkbox" ? (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Switch checked={!!form[f.key]} onCheckedChange={(v) => set(f.key, v)} />
                    <span className="text-sm">{f.label}</span>
                  </label>
                ) : (
                  <>
                    <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">{f.label}</Label>
                    <Input className="h-9" type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                      value={form[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} />
                  </>
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
