"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { legacyErpApi } from "@/lib/nexuscore-api";
import { useWorkspaceStore } from "@/lib/store/workspace-store";
import { useWorkspaceLookupStore } from "@/lib/store/workspace-lookup-store";
import { useWorkspaceTabContext } from "@/components/layout/workspace/workspace-tab-context";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Search, RefreshCw, Plus, Check, X, Pencil, Trash2, Eye, ArrowUp, ArrowDown,
  ChevronsUpDown, ListTree, SearchX, XCircle, MousePointerClick,
} from "lucide-react";

export interface MasterLookupRow {
  id: number;
  code: string;
  name: string;
  active: boolean | number | null;
}

type SortKey = "code" | "name";

interface Props {
  /** Config key from legacy-master-lookup.service.ts's TABLES map (e.g. "fabric"). */
  masterKey: string;
  /** Screen title — falls back to a title-cased version of masterKey if the meta call fails. */
  title?: string;
  /** "lookup" when opened from a field (F2 / search icon) to pick a value; "manage" otherwise. */
  mode: "manage" | "lookup";
  /** Present only in lookup mode — identifies which caller field's return-store slot to resolve. */
  requestId?: string;
  /** Present only in lookup mode — the href to reactivate once a value is returned or the user cancels. */
  returnTab?: string;
}

function SortableHead({
  children, sortKey, activeKey, dir, onSort,
}: {
  children: React.ReactNode; sortKey: SortKey; activeKey: SortKey; dir: "asc" | "desc"; onSort: (k: SortKey) => void;
}) {
  const active = activeKey === sortKey;
  return (
    <TableHead
      className="h-10 cursor-pointer select-none text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80 transition-colors hover:text-foreground"
      onClick={() => onSort(sortKey)}
    >
      <span className="group inline-flex items-center gap-1">
        {children}
        {active ? (
          dir === "asc" ? <ArrowUp className="h-3 w-3 text-foreground" /> : <ArrowDown className="h-3 w-3 text-foreground" />
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-40" />
        )}
      </span>
    </TableHead>
  );
}

/**
 * The reusable ERP "Master Lookup" screen — Fab Type Master today, and (per its own
 * `TABLES` config in legacy-master-lookup.service.ts) any future simple Code/Name master
 * (Brand, Color, GSM, Composition, Finish, Weave, Construction, Season, Supplier Type,
 * Customer Type, ...) with zero new frontend code — just a new `masterKey` config entry
 * server-side and a nav link here with a different `key` query param.
 *
 * Always a real Workspace tab (rendered by the static `/legacy-erp/master-lookup` route,
 * see that page.tsx) — never a modal/dialog, in either mode.
 */
export function MasterLookupScreen({ masterKey, title, mode, requestId, returnTab }: Props) {
  const router = useRouter();
  const tabCtx = useWorkspaceTabContext();
  const closeTab = useWorkspaceStore((s) => s.closeTab);
  const activateTab = useWorkspaceStore((s) => s.activateTab);
  const resolveLookup = useWorkspaceLookupStore((s) => s.resolve);

  const [label, setLabel] = useState(title ?? masterKey);
  // "Fab Type Master" -> "Fab Type" for singular-entity phrasing ("Delete Fab Type", "No Fab
  // Type records yet", ...) — generic, so it reads correctly for every future master too
  // (e.g. a "Brand Master" config becomes "Delete Brand"), not hand-written for Fab Type.
  const entityLabel = label.replace(/\s+Master$/i, "");
  const [rows, setRows] = useState<MasterLookupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [editForm, setEditForm] = useState({ code: "", name: "" });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MasterLookupRow | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const codeInputRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef(new Map<number, HTMLTableRowElement>());

  const load = async () => {
    setLoading(true);
    try {
      const r: any = await legacyErpApi.masterLookup.list(masterKey);
      setRows(Array.isArray(r) ? r : []);
    } catch (e: any) {
      toast.error(e.message || `Failed to load ${label}`);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    legacyErpApi.masterLookup.meta(masterKey).then((r: any) => r?.label && setLabel(r.label)).catch(() => {});
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masterKey]);

  // Live client-side filtering — "no Save required", instant as you type. Master tables
  // are small reference lists, so filtering the already-loaded set is both simpler and
  // snappier than round-tripping the server on every keystroke.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q ? rows.filter((r) => r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)) : rows;
    const copy = [...base];
    copy.sort((a, b) => {
      const cmp = String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? ""));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, search, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const addRecord = () => {
    setEditingId("new");
    setEditForm({ code: "", name: "" });
    requestAnimationFrame(() => codeInputRef.current?.focus());
  };

  const startEdit = (row: MasterLookupRow) => {
    setEditingId(row.id);
    setEditForm({ code: row.code, name: row.name });
    requestAnimationFrame(() => codeInputRef.current?.focus());
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ code: "", name: "" });
  };

  const commitEdit = async () => {
    const code = editForm.code.trim();
    const name = editForm.name.trim();
    if (!code) return toast.error("Code is required");
    if (!name) return toast.error("Name is required");
    setSaving(true);
    try {
      if (editingId === "new") {
        await legacyErpApi.masterLookup.create(masterKey, { code, name });
        toast.success("Record added");
      } else if (editingId != null) {
        await legacyErpApi.masterLookup.update(masterKey, editingId, { code, name });
        toast.success("Record updated");
      }
      cancelEdit();
      load();
    } catch (e: any) {
      // Case-insensitive Code/Name uniqueness is enforced server-side
      // (legacy-master-lookup.service.ts's assertUnique) — surface its message verbatim.
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  // Activate/Deactivate — same "click the Status badge" interaction General Settings' own
  // Approval Configuration screen already uses for its own isActive toggle. Resends the row's
  // current code/name alongside the flipped flag (legacy-master-lookup.service.ts's update()
  // requires both) so this never has to duplicate that validation client-side.
  const toggleActive = async (row: MasterLookupRow) => {
    setTogglingId(row.id);
    try {
      await legacyErpApi.masterLookup.update(masterKey, row.id, { code: row.code, name: row.name, active: !row.active });
      setRows((p) => p.map((r) => (r.id === row.id ? { ...r, active: !row.active } : r)));
    } catch (e: any) {
      toast.error(e.message || "Failed to update status");
    } finally {
      setTogglingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await legacyErpApi.masterLookup.delete(masterKey, deleteTarget.id);
      toast.success("Record deleted");
      setDeleteTarget(null);
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // --- Lookup mode: return the selected record to whichever field opened this tab --------
  const returnAndClose = (row: MasterLookupRow) => {
    if (mode !== "lookup" || !requestId) return;
    resolveLookup(requestId, { id: row.id, code: row.code, name: row.name });
    closeSelf();
  };

  const closeSelf = () => {
    // Prefer this instance's own real tab key (from the Workspace context every hosted
    // screen gets) over a hardcoded path — falls back to the static route path only when
    // rendered outside the Workspace (a direct link/bookmark, no tab to close).
    closeTab(tabCtx?.tabKey ?? "/dashboard/legacy-erp/master-lookup");
    if (returnTab) {
      const [returnPath] = returnTab.split("?");
      activateTab(returnPath);
      router.replace(returnTab, { scroll: false });
    } else {
      router.back();
    }
  };

  const handleRowKeyDown = (e: React.KeyboardEvent, row: MasterLookupRow, index: number) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = filtered[index + 1];
      if (next) { setSelectedId(next.id); rowRefs.current.get(next.id)?.focus(); }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = filtered[index - 1];
      if (prev) { setSelectedId(prev.id); rowRefs.current.get(prev.id)?.focus(); }
    } else if (e.key === "Enter" && mode === "lookup") {
      e.preventDefault();
      returnAndClose(row);
    }
  };

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-6 lg:p-8">
      <div className="flex flex-col gap-4 border-b pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10">
            <ListTree className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-[22px] font-semibold leading-tight tracking-tight">{label}</h1>
            <div className="mt-0.5 flex items-center gap-2">
              <p className="text-xs text-muted-foreground">
                {mode === "lookup" ? "Double-click or press Enter to select a record" : "Master data"}
              </p>
              {!loading && <Badge variant="secondary" className="h-5 text-[11px] font-normal">{rows.length} {rows.length === 1 ? "record" : "records"}</Badge>}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <InputGroup className="h-9 w-64 shrink-0">
            <InputGroupAddon>
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Search code or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="text-sm"
            />
          </InputGroup>
          <Button variant="outline" size="sm" onClick={load} title="Refresh">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <div className="hidden h-6 w-px bg-border sm:block" />
          <Button size="sm" onClick={addRecord} disabled={editingId !== null}>
            <Plus className="h-3.5 w-3.5 mr-2" />Add Record
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border shadow-sm">
        <div className="max-h-[60vh] overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow className="border-b bg-muted/40 hover:bg-muted/40">
                <SortableHead sortKey="code" activeKey={sortKey} dir={sortDir} onSort={toggleSort}>Code</SortableHead>
                <SortableHead sortKey="name" activeKey={sortKey} dir={sortDir} onSort={toggleSort}>Name</SortableHead>
                <TableHead className="h-10 w-28 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Status</TableHead>
                <TableHead className="h-10 w-36 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>{Array.from({ length: 4 }).map((_, j) => <TableCell key={j} className="py-3"><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                ))
              ) : (
                <>
                  {editingId === "new" && (
                    <TableRow className="bg-primary/5">
                      <TableCell className="py-2">
                        <Input ref={codeInputRef} value={editForm.code} onChange={(e) => setEditForm((p) => ({ ...p, code: e.target.value }))} className="h-8" placeholder="Code" />
                      </TableCell>
                      <TableCell className="py-2">
                        <Input value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} className="h-8" placeholder="Name"
                          onKeyDown={(e) => e.key === "Enter" && commitEdit()} />
                      </TableCell>
                      <TableCell className="py-2"><Badge variant="default" className="text-[11px] font-normal">Active</Badge></TableCell>
                      <TableCell className="py-2 text-right">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={commitEdit} disabled={saving} title="Save"><Check className="h-4 w-4 text-emerald-600" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={cancelEdit} title="Cancel"><X className="h-4 w-4 text-muted-foreground" /></Button>
                      </TableCell>
                    </TableRow>
                  )}

                  {filtered.length === 0 && editingId !== "new" ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={4} className="py-12">
                        <Empty>
                          <EmptyHeader>
                            <EmptyMedia variant="icon">{search ? <SearchX /> : <ListTree />}</EmptyMedia>
                            <EmptyTitle>{search ? "No matching records" : `No ${entityLabel.toLowerCase()} records yet`}</EmptyTitle>
                            <EmptyDescription>{search ? "Try a different search term." : 'Click "Add Record" to create the first one.'}</EmptyDescription>
                          </EmptyHeader>
                          {!search && <EmptyContent><Button size="sm" onClick={addRecord}><Plus className="h-3.5 w-3.5 mr-2" />Add Record</Button></EmptyContent>}
                        </Empty>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((row, index) => {
                      const isEditing = editingId === row.id;
                      const isSelected = selectedId === row.id;
                      const isActive = !!row.active;
                      return (
                        <TableRow
                          key={row.id}
                          ref={(el) => { if (el) rowRefs.current.set(row.id, el); else rowRefs.current.delete(row.id); }}
                          tabIndex={0}
                          onFocus={() => setSelectedId(row.id)}
                          onKeyDown={(e) => handleRowKeyDown(e, row, index)}
                          onDoubleClick={() => returnAndClose(row)}
                          className={cn(
                            "group outline-none even:bg-muted/10",
                            isSelected && "bg-primary/10",
                            mode === "lookup" && "cursor-pointer"
                          )}
                        >
                          {isEditing ? (
                            <>
                              <TableCell className="py-2">
                                <Input ref={codeInputRef} value={editForm.code} onChange={(e) => setEditForm((p) => ({ ...p, code: e.target.value }))} className="h-8" />
                              </TableCell>
                              <TableCell className="py-2">
                                <Input value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} className="h-8"
                                  onKeyDown={(e) => e.key === "Enter" && commitEdit()} />
                              </TableCell>
                              <TableCell className="py-2">
                                <Badge variant={isActive ? "default" : "secondary"} className="text-[11px] font-normal">{isActive ? "Active" : "Inactive"}</Badge>
                              </TableCell>
                              <TableCell className="py-2 text-right">
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={commitEdit} disabled={saving} title="Save"><Check className="h-4 w-4 text-emerald-600" /></Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={cancelEdit} title="Cancel"><X className="h-4 w-4 text-muted-foreground" /></Button>
                              </TableCell>
                            </>
                          ) : (
                            <>
                              <TableCell className="py-3"><span className="rounded-md bg-muted/60 px-2 py-1 font-mono text-xs">{row.code}</span></TableCell>
                              <TableCell className="py-3 font-medium">{row.name}</TableCell>
                              <TableCell className="py-3">
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); toggleActive(row); }}
                                  disabled={togglingId === row.id}
                                  title="Click to toggle Active/Inactive"
                                >
                                  <Badge variant={isActive ? "default" : "secondary"} className="text-[11px] font-normal">{isActive ? "Active" : "Inactive"}</Badge>
                                </button>
                              </TableCell>
                              <TableCell className="py-3 text-right">
                                {/* Maintenance actions (View/Edit/Delete) are ALWAYS present, regardless
                                    of mode — the Maintenance screen keeps full CRUD even when it was
                                    opened as a lookup. Select is ADDITIONAL, shown only in lookup mode,
                                    never a replacement for the others. */}
                                <div className="flex items-center justify-end gap-1">
                                  {mode === "lookup" && (
                                    <Button
                                      size="sm"
                                      className="h-8"
                                      onClick={(e) => { e.stopPropagation(); returnAndClose(row); }}
                                    >
                                      <MousePointerClick className="h-3.5 w-3.5 mr-1.5" />Select
                                    </Button>
                                  )}
                                  <Button variant="ghost" size="icon" className="h-8 w-8 opacity-60 group-hover:opacity-100 transition-opacity" title="View" onClick={(e) => { e.stopPropagation(); setSelectedId(row.id); }}>
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 opacity-60 group-hover:opacity-100 transition-opacity" title="Edit" onClick={(e) => { e.stopPropagation(); startEdit(row); }} disabled={editingId !== null}>
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 opacity-60 group-hover:opacity-100 transition-opacity" title="Delete" onClick={(e) => { e.stopPropagation(); setDeleteTarget(row); }}>
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </div>
                              </TableCell>
                            </>
                          )}
                        </TableRow>
                      );
                    })
                  )}
                </>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t pt-4">
        <Button variant="outline" size="sm" onClick={closeSelf}><XCircle className="h-3.5 w-3.5 mr-2" />Close</Button>
        <Button
          size="sm"
          onClick={commitEdit}
          disabled={editingId === null || saving}
          title={editingId === null ? "Add or edit a row first" : undefined}
        >
          <Check className="h-3.5 w-3.5 mr-2" />{saving ? "Saving..." : "Save"}
        </Button>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {entityLabel}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this {entityLabel}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={confirmDelete}>Yes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
