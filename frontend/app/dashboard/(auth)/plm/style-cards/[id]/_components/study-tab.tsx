"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { ListOrdered, Plus, Save, Trash2 } from "lucide-react";
import { plmApi } from "@/lib/nexuscore-api";
import { getCurrentUser } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { GridInput, uid, num } from "./grid-input";
import { useGridColumns } from "@/hooks/use-grid-columns";
import { ManageColumnsModal } from "@/components/shared/manage-columns-modal";

type StudyLine = { id: string; processCardId: string; sequence: number; standardTime: number; resourceCardId: string; employeeCardId: string; notes: string };

// ---- Column resize/reorder/hide/persist — shared across every grid via useGridColumns,
// same pattern as bom-tab.tsx. storageKey "styleCardStudyGrid" is net-new (this tab never had
// column customization before).
type ColKey = "sequence" | "processCardId" | "standardTime" | "resourceCardId" | "employeeCardId" | "notes";
type ColumnDef = { key: ColKey; label: string; align?: "left" | "right" };
const COLUMNS: ColumnDef[] = [
  { key: "sequence", label: "Seq", align: "right" },
  { key: "processCardId", label: "Process" },
  { key: "standardTime", label: "Standard Time", align: "right" },
  { key: "resourceCardId", label: "Resource" },
  { key: "employeeCardId", label: "Employee" },
  { key: "notes", label: "Notes" },
];
const COLUMN_BY_KEY = new Map(COLUMNS.map((c) => [c.key, c]));
// Process identifies the line and always stays first & visible.
const FIXED_COLS: ColKey[] = ["processCardId"];
const DEFAULT_WIDTHS: Record<ColKey, number> = { sequence: 70, processCardId: 180, standardTime: 130, resourceCardId: 160, employeeCardId: 160, notes: 160 };
const MIN_WIDTHS: Record<ColKey, number> = { sequence: 60, processCardId: 140, standardTime: 100, resourceCardId: 120, employeeCardId: 120, notes: 120 };
const DEL_W = 40;

export function StudyTab({ styleCardId, card }: { styleCardId: string; card: any; onReloadCard: () => void }) {
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [lines, setLines] = useState<StudyLine[]>([]);
  const [processCards, setProcessCards] = useState<any[]>([]);
  const [resources, setResources] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [tpls, pc, rc, ec] = await Promise.all([
        plmApi.studyTemplates.list({ styleCardId }),
        plmApi.processCards.list().catch(() => ({ data: [] })),
        plmApi.resources.list().catch(() => ({ data: [] })),
        plmApi.employees.list().catch(() => ({ data: [] })),
      ]);
      const list = Array.isArray(tpls) ? tpls : (tpls as any)?.data || [];
      setTemplates(list);
      setProcessCards(Array.isArray(pc) ? pc : (pc as any)?.data || []);
      setResources(Array.isArray(rc) ? rc : (rc as any)?.data || []);
      setEmployees(Array.isArray(ec) ? ec : (ec as any)?.data || []);
      if (list.length && !selectedId) selectTemplate(list[0].id, list);
    } catch (e: any) {
      toast.error(e.message || "Failed to load study templates");
    } finally {
      setLoading(false);
    }
  };

  const selectTemplate = async (id: string, list?: any[]) => {
    setSelectedId(id);
    const tpl = (list || templates).find((t) => t.id === id);
    setLines((tpl?.lines || []).map((l: any) => ({
      id: l.id, processCardId: l.processCardId || "", sequence: l.sequence ?? 0, standardTime: num(l.standardTime),
      resourceCardId: l.resourceCardId || "", employeeCardId: l.employeeCardId || "", notes: l.notes || "",
    })));
  };

  useEffect(() => { load(); }, [styleCardId]);

  const createTemplate = async () => {
    if (!newName.trim()) return toast.error("Name required");
    setCreating(true);
    try {
      const user = getCurrentUser();
      const tpl: any = await plmApi.studyTemplates.create({ name: newName, styleCardId, branchId: user?.branchId });
      toast.success("Study template created");
      setNewName("");
      await load();
      selectTemplate(tpl.id);
    } catch (e: any) {
      toast.error(e.message || "Failed to create template");
    } finally {
      setCreating(false);
    }
  };

  const update = (id: string, patch: Partial<StudyLine>) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const addLine = () => setLines((ls) => [...ls, { id: uid(), processCardId: "", sequence: ls.length + 1, standardTime: 0, resourceCardId: "", employeeCardId: "", notes: "" }]);
  const removeLine = (id: string) => setLines((ls) => ls.filter((l) => l.id !== id));

  const save = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      await plmApi.studyTemplates.upsertLines(selectedId, lines);
      toast.success("Study lines saved");
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed to save lines");
    } finally {
      setSaving(false);
    }
  };

  const gridColumnDefs = useMemo(
    () => COLUMNS.map((c) => ({ key: c.key, label: c.label, defaultWidth: DEFAULT_WIDTHS[c.key], minWidth: MIN_WIDTHS[c.key] })),
    [],
  );
  const gridColumns = useGridColumns<ColKey>({
    storageKey: "styleCardStudyGrid",
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

  const renderCell = (l: StudyLine, key: ColKey) => {
    switch (key) {
      case "sequence":
        return <GridInput type="number" align="right" value={l.sequence} onChange={(v) => update(l.id, { sequence: parseInt(v) || 0 })} />;
      case "processCardId":
        return (
          <select value={l.processCardId} onChange={(e) => update(l.id, { processCardId: e.target.value })} className="h-7 w-full text-xs bg-transparent outline-none rounded focus:bg-accent/50">
            <option value="">Select process</option>
            {processCards.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        );
      case "standardTime":
        return <GridInput type="number" align="right" value={l.standardTime} onChange={(v) => update(l.id, { standardTime: parseFloat(v) || 0 })} />;
      case "resourceCardId":
        return (
          <select value={l.resourceCardId} onChange={(e) => update(l.id, { resourceCardId: e.target.value })} className="h-7 w-full text-xs bg-transparent outline-none rounded focus:bg-accent/50">
            <option value="">—</option>
            {resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        );
      case "employeeCardId":
        return (
          <select value={l.employeeCardId} onChange={(e) => update(l.id, { employeeCardId: e.target.value })} className="h-7 w-full text-xs bg-transparent outline-none rounded focus:bg-accent/50">
            <option value="">—</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        );
      case "notes":
        return <GridInput value={l.notes} onChange={(v) => update(l.id, { notes: v })} />;
      default:
        return null;
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p>;

  return (
    <div className="space-y-3">
      <div className="rounded-md border p-3 flex items-end gap-3">
        {templates.length > 0 && (
          <div className="flex-1 space-y-1">
            <label className="text-xs text-muted-foreground">Study Template</label>
            <Select value={selectedId} onValueChange={(v) => selectTemplate(v)}>
              <SelectTrigger className="h-8 text-sm max-w-md"><SelectValue placeholder="Select template" /></SelectTrigger>
              <SelectContent>{templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}
        <div className="flex-1 space-y-1">
          <label className="text-xs text-muted-foreground">{templates.length ? "New Template Name" : "Create Study Template"}</label>
          <div className="flex gap-1.5">
            <Input className="h-8 text-sm" placeholder="e.g. Sewing Study" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={createTemplate} disabled={creating}><Plus className="h-3.5 w-3.5 mr-1" />Create</Button>
          </div>
        </div>
      </div>

      {selectedId && (
        <div>
          <div className="flex items-center justify-end gap-2 mb-1.5">
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
                          className={cn(
                            "flex h-8 w-full min-w-0 items-center truncate px-2",
                            col.align === "right" ? "justify-end" : "justify-start",
                            !fixed && "cursor-grab active:cursor-grabbing",
                          )}
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
                {lines.map((l) => (
                  <TableRow key={l.id} className="[&>td]:border-r [&>td]:p-0">
                    {displayColumnDefs.map((col) => (
                      <TableCell key={col.key} className={col.key === "processCardId" || col.key === "resourceCardId" || col.key === "employeeCardId" ? "p-1" : undefined}>
                        {renderCell(l, col.key)}
                      </TableCell>
                    ))}
                    <TableCell className="p-0 text-center"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeLine(l.id)}><Trash2 className="h-3.5 w-3.5 text-muted-foreground" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Button variant="outline" size="sm" className="mt-1.5 h-7 text-xs" onClick={addLine}><Plus className="h-3.5 w-3.5 mr-1" />Add Row</Button>
        </div>
      )}

      <ManageColumnsModal
        state={gridColumns.manageColumns}
        fixedColumns={FIXED_COLS}
        columns={gridColumnDefs}
        description="Show, hide and reorder columns. Process is required and always stays first."
      />
    </div>
  );
}
