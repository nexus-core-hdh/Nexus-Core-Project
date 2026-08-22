"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { legacyErpApi } from "@/lib/nexuscore-api";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ChevronsRight, Plus, Search, Trash2, X } from "lucide-react";
import { humanizeColumn } from "@/lib/legacy-erp/humanize";
import {
  STANDARD_WORKLIST_ID, fieldKey,
  type Worklist, type WorklistField, type WorklistSource,
} from "@/lib/legacy-erp/worklist-types";

interface SourceFieldsMeta {
  source: WorklistSource;
  label: string;
  fields: string[];
}

interface WorklistDesignModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  worklists: Worklist[];
  activeWorklistId: string;
  /** The worklist source matching the page's current table dropdown, if any — drives "Standard =>". */
  activeTableSource?: WorklistSource;
  onSave: (next: Worklist[]) => Promise<void> | void;
  /** Optional scope passed straight to worklistFields.list()/resolve() so the left tree only
   * offers this screen's own source(s) — omit for the multi-source Receipt & Master Data screens. */
  primaryScope?: string;
  /** Short noun phrase describing the grid, used in the header copy, e.g. "the Yarn Cards List grid". */
  gridLabel?: string;
}

// Worklist Design — a left tree of the fixed master/list sources (fields fetched once from
// worklist-fields.service.ts), center Add/Remove/Up/Down controls, right ordered selected-
// fields panel tagged with source, top worklist list management, bottom OK/Cancel. Nothing here
// is persisted until OK (draftWorklists is a local copy — same draft-then-commit pattern as
// purchase-order-line-grid.tsx's Column Manager modal). Shared by every Legacy ERP list screen
// that offers Customize Worklist — see receipt-master-data/page.tsx for the original reference
// usage this was extracted from.
export function WorklistDesignModal({
  open, onOpenChange, worklists, activeWorklistId, activeTableSource, onSave, primaryScope, gridLabel = "the grid",
}: WorklistDesignModalProps) {
  const [sourceFields, setSourceFields] = useState<SourceFieldsMeta[]>([]);
  const [loadingFields, setLoadingFields] = useState(false);
  const [draftWorklists, setDraftWorklists] = useState<Worklist[]>([]);
  const [activeId, setActiveId] = useState<string>(STANDARD_WORKLIST_ID);
  const [highlighted, setHighlighted] = useState<WorklistField | null>(null);
  const [selectedRightIndex, setSelectedRightIndex] = useState<number | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [treeSearch, setTreeSearch] = useState("");

  // Re-seed the draft from the parent's real state every time the modal opens — deliberately
  // NOT re-run on every worklists/activeWorklistId change, so in-progress edits aren't clobbered
  // by unrelated parent re-renders while the modal is open.
  useEffect(() => {
    if (!open) return;
    setLoadingFields(true);
    legacyErpApi.worklistFields.list(primaryScope)
      .then((data: any) => setSourceFields(Array.isArray(data) ? data : []))
      .catch((e: any) => toast.error(e?.message || "Failed to load worklist field metadata"))
      .finally(() => setLoadingFields(false));
    setDraftWorklists(worklists.map((w) => ({ ...w, fields: w.fields.map((f) => ({ ...f })) })));
    setActiveId(activeWorklistId || STANDARD_WORKLIST_ID);
    setHighlighted(null);
    setSelectedRightIndex(null);
    setPendingDeleteId(null);
    setTreeSearch("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const activeDraft = useMemo(
    () => draftWorklists.find((w) => w.id === activeId) ?? null,
    [draftWorklists, activeId],
  );

  const sourceLabel = useMemo(() => {
    const map = new Map<string, string>();
    sourceFields.forEach((sf) => map.set(sf.source, sf.label.replace(/\s+List$/, "")));
    return map;
  }, [sourceFields]);

  const updateActiveDraft = (fn: (w: Worklist) => Worklist) => {
    setDraftWorklists((prev) => prev.map((w) => (w.id === activeId ? fn(w) : w)));
  };

  const handleAddList = () => {
    const id = crypto.randomUUID();
    setDraftWorklists((prev) => [...prev, { id, name: "", fields: [] }]);
    setActiveId(id);
    setHighlighted(null);
    setSelectedRightIndex(null);
  };

  const confirmDelete = () => {
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    if (!id) return;
    setDraftWorklists((prev) => prev.filter((w) => w.id !== id));
    setActiveId(STANDARD_WORKLIST_ID);
    setSelectedRightIndex(null);
  };

  const handleAdd = (field: WorklistField | null) => {
    if (!activeDraft || !field) return;
    updateActiveDraft((w) => {
      if (w.fields.some((f) => f.source === field.source && f.key === field.key)) return w; // no duplicates
      return { ...w, fields: [...w.fields, { source: field.source, key: field.key, label: field.label }] };
    });
  };

  const isFieldSelected = (source: WorklistSource, key: string) =>
    activeDraft?.fields.some((f) => f.source === source && f.key === key) ?? false;

  const removeFieldAt = (i: number) => {
    if (!activeDraft) return;
    updateActiveDraft((w) => ({ ...w, fields: w.fields.filter((_, idx) => idx !== i) }));
    setSelectedRightIndex((prev) => {
      if (prev === null) return prev;
      if (prev === i) return null;
      return prev > i ? prev - 1 : prev;
    });
  };

  // Available Sources checkbox toggle — checked adds the field (assigning the next order
  // number), unchecked removes it from Selected Fields immediately, keeping both panels in sync.
  const toggleField = (field: WorklistField) => {
    if (!activeDraft) return;
    const idx = activeDraft.fields.findIndex((f) => f.source === field.source && f.key === field.key);
    if (idx === -1) handleAdd(field);
    else removeFieldAt(idx);
  };

  const handleStandardArrow = () => {
    if (!activeDraft || !activeTableSource) return;
    const sf = sourceFields.find((s) => s.source === activeTableSource);
    if (!sf) return;
    updateActiveDraft((w) => {
      const existing = new Set(w.fields.filter((f) => f.source === activeTableSource).map((f) => f.key));
      const additions = sf.fields
        .filter((k) => !existing.has(k))
        .map((k): WorklistField => ({ source: activeTableSource, key: k, label: humanizeColumn(k) }));
      return { ...w, fields: [...w.fields, ...additions] };
    });
  };

  const handleRemove = () => {
    if (selectedRightIndex === null) return;
    removeFieldAt(selectedRightIndex);
  };

  const handleMove = (dir: -1 | 1) => {
    if (!activeDraft || selectedRightIndex === null) return;
    const newIndex = selectedRightIndex + dir;
    if (newIndex < 0 || newIndex >= activeDraft.fields.length) return;
    updateActiveDraft((w) => {
      const fields = [...w.fields];
      [fields[selectedRightIndex], fields[newIndex]] = [fields[newIndex], fields[selectedRightIndex]];
      return { ...w, fields };
    });
    setSelectedRightIndex(newIndex);
  };

  const handleOk = async () => {
    const seen = new Set<string>();
    for (const w of draftWorklists) {
      const trimmed = w.name.trim();
      if (!trimmed) {
        toast.error("Every custom worklist needs a name.");
        setActiveId(w.id);
        return;
      }
      const lower = trimmed.toLowerCase();
      if (seen.has(lower)) {
        toast.error(`Worklist name "${trimmed}" is used more than once.`);
        setActiveId(w.id);
        return;
      }
      seen.add(lower);
    }
    setSaving(true);
    try {
      await onSave(draftWorklists.map((w) => ({ ...w, name: w.name.trim() })));
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to save worklist");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        {/* Large centered ERP workspace — NOT a tiny dialog, NOT edge-to-edge fullscreen.
            Keeps DialogContent's default centering (top-1/2 left-1/2 + translate, rounded,
            border, shadow, bg) and only overrides size via cn()'s tailwind-merge, same
            override technique already used elsewhere in this file. min()/vw-based sizing keeps
            the panel responsive across 1366x768 / 1440x900 / 1920x1080 without media queries. */}
        <DialogContent
          showCloseIcon
          className="flex h-[min(92vh,850px)] w-[min(95vw,1500px)] max-h-[calc(100vh-2rem)] flex-col gap-0 p-0"
        >
          <DialogHeader className="shrink-0 border-b border-border px-6 py-4">
            <DialogTitle>Worklist Design</DialogTitle>
            <DialogDescription>
              Choose which fields appear in {gridLabel}, from any of the sources below.
            </DialogDescription>
          </DialogHeader>

          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-6 py-3">
            <Select value={activeId} onValueChange={(v) => { setActiveId(v); setHighlighted(null); setSelectedRightIndex(null); }}>
              <SelectTrigger className="h-8 w-56 text-[13px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={STANDARD_WORKLIST_ID}>Standard</SelectItem>
                {draftWorklists.map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.name || "Untitled Worklist"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={activeDraft?.name ?? ""}
              onChange={(e) => activeDraft && updateActiveDraft((w) => ({ ...w, name: e.target.value }))}
              disabled={!activeDraft}
              placeholder={activeDraft ? "Worklist name" : "Standard (immutable)"}
              className="h-8 min-w-40 flex-1 text-[13px]"
            />
            <Button variant="outline" size="sm" onClick={handleAddList}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />Add List
            </Button>
            <Button
              variant="outline" size="sm" disabled={!activeDraft}
              onClick={() => activeDraft && setPendingDeleteId(activeDraft.id)}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />Delete List
            </Button>
          </div>

          <div className="flex min-h-0 flex-1 overflow-hidden">
            {/* Left: Available Sources & Fields — checkbox per field mirrors Selected Fields state.
                ~33% width, leaving the Selected Fields panel the larger, dominant share. */}
            <div className="flex w-[33%] shrink-0 flex-col overflow-hidden border-r border-border">
              <div className="shrink-0 px-4 py-2.5">
                <h3 className="text-[12.5px] font-semibold text-foreground">Available Sources &amp; Fields</h3>
                <InputGroup className="mt-2 h-8">
                  <InputGroupAddon>
                    <Search className="h-3.5 w-3.5 text-muted-foreground" />
                  </InputGroupAddon>
                  <InputGroupInput
                    value={treeSearch}
                    onChange={(e) => setTreeSearch(e.target.value)}
                    placeholder="Search fields..."
                    aria-label="Search available fields"
                    className="text-[12.5px]"
                  />
                </InputGroup>
              </div>
              <div className="flex-1 overflow-y-auto px-3 pb-3">
                {loadingFields ? (
                  <p className="px-3 py-6 text-center text-[12.5px] text-muted-foreground">Loading fields...</p>
                ) : (
                  <Accordion type="multiple" className="w-full">
                    {sourceFields.map((sf) => {
                      const visibleFields = sf.fields.filter((key) =>
                        !treeSearch.trim() || humanizeColumn(key).toLowerCase().includes(treeSearch.trim().toLowerCase()) || key.toLowerCase().includes(treeSearch.trim().toLowerCase()),
                      );
                      if (treeSearch.trim() && visibleFields.length === 0) return null;
                      return (
                        <AccordionItem key={sf.source} value={sf.source}>
                          <AccordionTrigger className="px-2 py-2 text-[13px] font-medium">{sf.label}</AccordionTrigger>
                          <AccordionContent className="px-1 pb-2">
                            <div className="space-y-0.5">
                              {visibleFields.map((key) => {
                                const label = humanizeColumn(key);
                                const selected = isFieldSelected(sf.source, key);
                                const isHighlighted = highlighted?.source === sf.source && highlighted.key === key;
                                return (
                                  <div
                                    key={key}
                                    className={cn(
                                      "flex items-center gap-2 rounded px-2 py-1",
                                      isHighlighted ? "bg-primary/10" : "hover:bg-muted/60",
                                    )}
                                  >
                                    <Checkbox
                                      checked={selected}
                                      disabled={!activeDraft}
                                      onCheckedChange={() => { setHighlighted({ source: sf.source, key, label }); toggleField({ source: sf.source, key, label }); }}
                                      aria-label={`${selected ? "Remove" : "Add"} ${label}`}
                                    />
                                    <button
                                      type="button"
                                      disabled={!activeDraft}
                                      onClick={() => setHighlighted({ source: sf.source, key, label })}
                                      onDoubleClick={() => handleAdd({ source: sf.source, key, label })}
                                      className="flex-1 truncate text-left text-[12.5px] disabled:opacity-50"
                                    >
                                      {label}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                )}
              </div>
            </div>

            {/* Center: compact vertical toolbar (120px — top of the spec's 100-120px range,
                sized so the longest label+icon button, "Standard", doesn't clip) —
                deliberately narrow so it never competes with the two field panels for space. */}
            <div className="flex w-[120px] shrink-0 flex-col items-stretch justify-center gap-2 border-r border-border px-2">
              <Button
                variant="outline" size="sm" disabled={!activeDraft || !activeTableSource}
                onClick={handleStandardArrow} title="Add every field of the currently selected table"
              >
                Standard <ChevronsRight className="h-3.5 w-3.5 ml-1" />
              </Button>
              <Button variant="outline" size="sm" disabled={!activeDraft || !highlighted} onClick={() => handleAdd(highlighted)}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />Add
              </Button>
              <Button variant="outline" size="sm" disabled={!activeDraft || selectedRightIndex === null} onClick={handleRemove}>
                <X className="h-3.5 w-3.5 mr-1.5" />Discard
              </Button>
              <Button
                variant="outline" size="sm"
                disabled={!activeDraft || selectedRightIndex === null || selectedRightIndex === 0}
                onClick={() => handleMove(-1)}
              >
                <ArrowUp className="h-3.5 w-3.5 mr-1.5" />Up
              </Button>
              <Button
                variant="outline" size="sm"
                disabled={!activeDraft || selectedRightIndex === null || selectedRightIndex === (activeDraft?.fields.length ?? 0) - 1}
                onClick={() => handleMove(1)}
              >
                <ArrowDown className="h-3.5 w-3.5 mr-1.5" />Down
              </Button>
            </div>

            {/* Right: Selected Fields — substantially wider, table form, source+field never truncated */}
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
              <div className="flex shrink-0 items-baseline justify-between px-6 py-2.5">
                <h3 className="text-[12.5px] font-semibold text-foreground">
                  Selected Fields ({activeDraft?.fields.length ?? 0})
                </h3>
                <span className="text-[11px] text-muted-foreground">Total: {activeDraft?.fields.length ?? 0} fields</span>
              </div>
              <div className="flex-1 overflow-y-auto px-6 pb-4">
                {!activeDraft ? (
                  <p className="p-4 text-[12.5px] text-muted-foreground">
                    Standard shows the grid&rsquo;s normal default columns. Select or create a custom worklist to choose fields.
                  </p>
                ) : activeDraft.fields.length === 0 ? (
                  <p className="p-4 text-[12.5px] text-muted-foreground">No fields selected yet — check a field on the left, or select it and click Add.</p>
                ) : (
                  <div className="overflow-hidden rounded-md border border-border">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-muted/40">
                        <TableRow className="hover:bg-muted/40">
                          <TableHead className="h-9 w-10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">#</TableHead>
                          <TableHead className="h-9 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Field Name</TableHead>
                          <TableHead className="h-9 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Source</TableHead>
                          <TableHead className="h-9 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Field</TableHead>
                          <TableHead className="h-9 w-10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {activeDraft.fields.map((f, i) => (
                          <TableRow
                            key={fieldKey(f)}
                            onClick={() => setSelectedRightIndex(i)}
                            className={cn("cursor-pointer", selectedRightIndex === i ? "bg-primary/10 hover:bg-primary/10" : "hover:bg-muted/40")}
                          >
                            <TableCell className="py-2 text-[12.5px] text-muted-foreground">{i + 1}</TableCell>
                            <TableCell className="py-2 text-[12.5px] font-medium">{f.label}</TableCell>
                            <TableCell className="py-2 text-[12.5px] text-muted-foreground">{sourceLabel.get(f.source) ?? f.source}</TableCell>
                            <TableCell className="py-2 text-[12.5px] font-mono text-muted-foreground">{f.key}</TableCell>
                            <TableCell className="py-2">
                              <Button
                                variant="ghost" size="icon" className="h-6 w-6"
                                onClick={(e) => { e.stopPropagation(); removeFieldAt(i); }}
                                aria-label={`Remove ${f.label}`}
                              >
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="shrink-0 flex-row items-center justify-end gap-2 border-t border-border px-6 py-3">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button size="sm" onClick={handleOk} disabled={saving}>{saving ? "Saving..." : "OK"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingDeleteId} onOpenChange={(o) => !o && setPendingDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Worklist</AlertDialogTitle>
            <AlertDialogDescription>
              Delete &ldquo;{draftWorklists.find((w) => w.id === pendingDeleteId)?.name || "this worklist"}&rdquo;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={confirmDelete}>Yes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
