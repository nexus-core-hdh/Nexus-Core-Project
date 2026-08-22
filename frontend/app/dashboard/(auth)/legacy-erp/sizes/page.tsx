"use client";

import { useEffect, useRef, useState } from "react";
import { Save, FilePlus2, Search, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

import { legacyErpApi } from "@/lib/nexuscore-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MasterDetailLayout, MasterListPanel, DetailEditorPanel } from "@/components/shared/master-detail";
import { GridSection, FormRow, FieldCell, controlClass } from "@/components/legacy-erp/unit-item-detail-grid";
import { useWorkspaceSearchParams } from "@/hooks/use-workspace-search-params";
import { useWorkspaceDirty } from "@/hooks/use-workspace-dirty";

// ---------------------------------------------------------------------------
// The Size detail/editor screen — same Master-Detail ERP workspace pattern as
// unit-sets/page.tsx (MA_SizeSet is the header, MA_SizeSetItem the detail rows — see
// size-set.service.ts's own comment on the DB mapping), reusing the identical
// GridSection/FormRow/FieldCell property-grid and MasterDetailLayout/MasterListPanel/
// DetailEditorPanel shell. The one structural addition versus Unit Set is wrapping General
// info + the Detail rows split inside Tabs (General/Detail), per this screen's own reference
// spec — everything inside each tab is still the same reused building blocks.
//
// Code/Name — plain manually-typed text (same Input-per-field convention as every other field
// on this form), persisted directly on MA_SizeSetItem's own SpecialCode/ColorCode columns —
// see size-set.service.ts's own comment for why those two (not a MA_SizeSetParameter FK) back
// Code/Name now. Order By is NOT user-editable here: it's auto-assigned (max existing + 1) the
// moment a new detail row is started (see startNewDetailRow below) and rendered as a plain
// read-only display, matching the reference spec's "Order must never require user input."
// ---------------------------------------------------------------------------

interface SizeSetRow {
  id: number;
  code: string;
  name: string;
}

interface SizeSetForm {
  code: string;
  name: string;
  explanation: string;
  specialCode: string;
  accessCode: string;
  inUse: boolean;
}

const emptySetForm: SizeSetForm = { code: "", name: "", explanation: "", specialCode: "", accessCode: "", inUse: true };

interface SizeSetItem {
  id: number;
  sizeSetId: number;
  code: string | null;
  name: string | null;
  explanation: string | null;
  value: string | null;
  orderBy: number | null;
  inUse: boolean | number | null;
}

interface SizeItemForm {
  code: string;
  name: string;
  explanation: string;
  value: string;
  orderBy: string;
  inUse: boolean;
}

const emptyItemForm: SizeItemForm = { code: "", name: "", explanation: "", value: "", orderBy: "", inUse: true };

const toItemForm = (item: SizeSetItem): SizeItemForm => ({
  code: item.code ?? "",
  name: item.name ?? "",
  explanation: item.explanation ?? "",
  value: item.value ?? "",
  orderBy: item.orderBy != null ? String(item.orderBy) : "",
  inUse: !!item.inUse,
});

const normalize = (s: string) => s.trim().toLowerCase();
const disabledDisplayClass = "flex h-full w-full items-center rounded-sm border border-input/40 bg-muted/30 px-2 text-xs text-muted-foreground";

export default function SizeDetailPage() {
  const searchParams = useWorkspaceSearchParams();
  const initialMode = (searchParams.get("mode") as "view" | "edit" | "create" | null) || "create";
  const initialId = searchParams.get("id");

  const [codeInput, setCodeInput] = useState("");
  const [searching, setSearching] = useState(false);
  const [sizeSetId, setSizeSetId] = useState<number | null>(null);
  const [form, setForm] = useState<SizeSetForm>(emptySetForm);
  const [mode, setMode] = useState<"view" | "edit" | "create">(initialMode);
  const [saving, setSaving] = useState(false);
  const readOnly = mode === "view";
  const lastSavedRef = useRef<SizeSetForm>(emptySetForm);

  const [allSets, setAllSets] = useState<SizeSetRow[]>([]);
  const [items, setItems] = useState<SizeSetItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | "new" | null>(null);
  const [itemForm, setItemForm] = useState<SizeItemForm>(emptyItemForm);
  const [itemSaving, setItemSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"general" | "detail">("general");

  const [pendingSelect, setPendingSelect] = useState<SizeSetItem | { isNew: true } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SizeSetItem | null>(null);

  const itemLastSavedRef = useRef<SizeItemForm | null>(null);

  const loadItems = async (setId: number) => {
    setItemsLoading(true);
    try {
      const data = await legacyErpApi.sizeSets.listItems(setId);
      setItems(Array.isArray(data) ? data : []);
    } finally {
      setItemsLoading(false);
    }
  };

  const loadLookupData = async () => {
    try {
      const sets = await legacyErpApi.sizeSets.list();
      setAllSets(Array.isArray(sets) ? sets : []);
    } catch {
      setAllSets([]);
    }
  };

  const loadSet = async (id: number, targetMode: "view" | "edit") => {
    const r: any = await legacyErpApi.sizeSets.get(id);
    const f = { ...emptySetForm, ...r };
    setForm(f);
    lastSavedRef.current = f;
    setSizeSetId(r.id);
    setCodeInput(r.code);
    setMode(targetMode);
    setSelectedId(null);
    setItemForm(emptyItemForm);
    itemLastSavedRef.current = null;
    setActiveTab("general");
    await loadItems(r.id);
  };

  // Shows the code the next Save will get, before Save is ever pressed — a preview only (see
  // size-set.controller.ts's next-code route). Mirrors yarn-cards/page.tsx's own
  // loadPreviewCode; Code is never user-editable here.
  const loadPreviewCode = async () => {
    try {
      const r: any = await legacyErpApi.sizeSets.previewNextCode();
      setForm((p) => ({ ...p, code: r.code }));
      lastSavedRef.current = { ...lastSavedRef.current, code: r.code };
    } catch {
      // Non-critical — Save still generates the real code even if this preview fails to load.
    }
  };

  useEffect(() => {
    if (!initialId) return;
    loadSet(Number(initialId), initialMode === "view" ? "view" : "edit").catch((e: any) => {
      toast.error(e.message || "Could not load size");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (initialId) return;
    loadPreviewCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { loadLookupData(); }, []);

  const setField = (k: keyof SizeSetForm, v: any) => setForm((p) => ({ ...p, [k]: v }));
  const setItemField = (k: keyof SizeItemForm, v: any) => setItemForm((p) => ({ ...p, [k]: v }));

  const isDirty = !readOnly && JSON.stringify(form) !== JSON.stringify(lastSavedRef.current);
  const isItemDirty = itemLastSavedRef.current !== null && JSON.stringify(itemForm) !== JSON.stringify(itemLastSavedRef.current);

  useWorkspaceDirty(isDirty || isItemDirty, async () => { await save(); });

  const searchByName = async () => {
    if (!codeInput.trim()) return;
    setSearching(true);
    try {
      const r: any = await legacyErpApi.sizeSets.list(codeInput.trim());
      const list = Array.isArray(r) ? r : [];
      if (!list.length) throw new Error("No size found with that name or code");
      await loadSet(list[0].id, "edit");
      toast.success("Loaded");
    } catch {
      toast.error("No size found with that name or code");
    } finally {
      setSearching(false);
    }
  };

  const validateSetForm = (): string | null => {
    const name = form.name.trim();
    if (!name) return "Name is required";
    const dup = allSets.find((s) => s.id !== sizeSetId && normalize(s.name) === normalize(name));
    if (dup) return "A size with this Name already exists";
    return null;
  };

  const save = async () => {
    const error = validateSetForm();
    if (error) return toast.error(error);
    setSaving(true);
    try {
      if (sizeSetId) {
        const r: any = await legacyErpApi.sizeSets.update(sizeSetId, form);
        const f = { ...emptySetForm, ...r };
        setForm(f);
        lastSavedRef.current = f;
        toast.success("Updated");
      } else {
        const r: any = await legacyErpApi.sizeSets.create(form);
        const f = { ...emptySetForm, ...r };
        setForm(f);
        lastSavedRef.current = f;
        setSizeSetId(r.id);
        setCodeInput(r.code);
        setMode("edit");
        toast.success("Created");
      }
      loadLookupData();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const newRecord = () => {
    setCodeInput("");
    setSizeSetId(null);
    setForm(emptySetForm);
    lastSavedRef.current = emptySetForm;
    setMode("create");
    setItems([]);
    setSelectedId(null);
    setItemForm(emptyItemForm);
    itemLastSavedRef.current = null;
    setActiveTab("general");
    loadPreviewCode();
  };

  const refresh = () => {
    if (sizeSetId) {
      loadSet(sizeSetId, mode === "view" ? "view" : "edit").then(() => toast.success("Refreshed"));
    } else {
      newRecord();
    }
    loadLookupData();
  };

  const selectItem = (item: SizeSetItem) => {
    setSelectedId(item.id);
    setItemForm(toItemForm(item));
    itemLastSavedRef.current = toItemForm(item);
  };

  const requestSelect = (item: SizeSetItem) => {
    if (isItemDirty) { setPendingSelect(item); return; }
    selectItem(item);
  };

  // Order By is never user-entered — it's the next free sequence number among this size's
  // CURRENT (non-deleted) detail rows: max(existing orderBy) + 1, or 1 for the very first row.
  // Deleting a row frees its number for reuse by the next Add Row (no gap-filling requested,
  // just "no duplicates among live rows" — recomputing from `items`, which only ever holds
  // live rows, already guarantees that).
  const nextOrderBy = () => (items.length ? Math.max(...items.map((i) => i.orderBy ?? 0)) + 1 : 1);

  // Single seeding point for a brand-new, not-yet-saved detail row — stamps its Order By
  // immediately (per spec: "prefer assigning the order immediately when the row is created")
  // so the row already shows its sequence number before the user types anything. Used by both
  // Add Row and the "discard changes, start a new row anyway" dialog action so the two paths
  // can never seed a new row differently.
  const startNewDetailRow = () => {
    const seeded: SizeItemForm = { ...emptyItemForm, orderBy: String(nextOrderBy()) };
    setSelectedId("new");
    setItemForm(seeded);
    itemLastSavedRef.current = seeded;
  };

  const handleAddDetailRow = () => {
    if (isItemDirty) { setPendingSelect({ isNew: true }); return; }
    startNewDetailRow();
  };

  // Defensive fallback per spec ("if a newly added row somehow has no order, calculate max
  // current order + 1") — Order By is already seeded by startNewDetailRow above, so this only
  // ever fires if that seeding didn't happen for some reason; it never overwrites an order a
  // row already has (existing rows loaded via selectItem always carry their own saved value).
  const ensureOrderAssigned = () => {
    setItemForm((p) => (p.orderBy === "" ? { ...p, orderBy: String(nextOrderBy()) } : p));
  };

  const validateItemForm = (): string | null => {
    const code = itemForm.code.trim();
    const name = itemForm.name.trim();
    if (!code || !name) return "Code and Name are required";
    const dup = items.find((i) => i.id !== selectedId && normalize(i.code || "") === normalize(code));
    if (dup) return "This Code has already been added to this size";
    if (itemForm.orderBy !== "" && Number.isNaN(Number(itemForm.orderBy))) return "Order By must be a number";
    return null;
  };

  const handleSaveDetailRow = async () => {
    if (!sizeSetId || selectedId == null) return;
    const error = validateItemForm();
    if (error) return toast.error(error);
    setItemSaving(true);
    try {
      const payload = {
        code: itemForm.code.trim(),
        name: itemForm.name.trim(),
        explanation: itemForm.explanation.trim() || undefined,
        value: itemForm.value.trim() || undefined,
        orderBy: itemForm.orderBy === "" ? undefined : Number(itemForm.orderBy),
        inUse: itemForm.inUse,
      };
      const saved = selectedId === "new"
        ? await legacyErpApi.sizeSets.createItem(sizeSetId, payload)
        : await legacyErpApi.sizeSets.updateItem(sizeSetId, selectedId, payload);

      const data = await legacyErpApi.sizeSets.listItems(sizeSetId);
      const list = Array.isArray(data) ? data : [];
      setItems(list);
      const persisted = list.find((i: SizeSetItem) => i.id === saved.id) ?? saved;
      setSelectedId(persisted.id);
      setItemForm(toItemForm(persisted));
      itemLastSavedRef.current = toItemForm(persisted);
      toast.success(selectedId === "new" ? "Detail row created" : "Detail row saved");
    } catch (error: any) {
      toast.error(error?.message || "Failed to save detail row");
    } finally {
      setItemSaving(false);
    }
  };

  const handleDeleteDetailRow = async () => {
    if (!sizeSetId || !pendingDelete) return;
    try {
      await legacyErpApi.sizeSets.removeItem(sizeSetId, pendingDelete.id);
      toast.success("Detail row deleted");
      await loadItems(sizeSetId);
      setSelectedId(null);
      setItemForm(emptyItemForm);
      itemLastSavedRef.current = null;
    } catch (error: any) {
      toast.error(error?.message || "Failed to delete detail row");
    } finally {
      setPendingDelete(null);
    }
  };

  return (
    <div className="mx-auto flex h-[var(--content-full-height)] max-w-[1600px] flex-col gap-3 p-4">
      {/* Toolbar — no icon box, no breadcrumb, no badges: a plain compact bar, matching Unit Set */}
      <div className="flex shrink-0 items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2">
        <span className="text-sm font-bold uppercase tracking-wide text-foreground/80">
          {sizeSetId ? `Size — ${form.code}` : "Size — New"}
          {readOnly && <span className="ml-2 font-normal normal-case text-muted-foreground">(View Only)</span>}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <InputGroup className="h-7 w-56 shrink-0">
            <InputGroupAddon>
              <Search className="h-3 w-3 text-muted-foreground" />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Find by name or code..."
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchByName()}
              className="text-xs"
            />
          </InputGroup>
          <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={refresh} disabled={searching} title="Refresh">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={newRecord}>
            <FilePlus2 className="h-3.5 w-3.5" />New
          </Button>
          {!readOnly && (
            <Button size="sm" className="h-7 gap-1 text-xs" onClick={save} disabled={saving}>
              <Save className="h-3.5 w-3.5" />{saving ? "Saving..." : "Save"}
            </Button>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "general" | "detail")} className="min-h-0 flex-1 gap-3">
        <TabsList className="w-fit shrink-0">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="detail">
            Detail
            {items.length > 0 && <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[11px] font-normal">{items.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-0 min-h-0 flex-1 overflow-y-auto">
          <fieldset disabled={readOnly} className="contents">
            <GridSection title="Size Information">
              <div className="divide-y">
                <FormRow>
                  {/* Code is read-only everywhere: server-generated on Save (SZ-001, ...) and
                      never user-editable, matching yarn-cards/page.tsx's own Code field. */}
                  <FieldCell label="Code">
                    <div className={disabledDisplayClass} title="Generated automatically">{form.code || "Generating..."}</div>
                  </FieldCell>
                  <FieldCell label="Name">
                    <Input value={form.name} onChange={(e) => setField("name", e.target.value)} className={controlClass} />
                  </FieldCell>
                  <FieldCell label="In Use">
                    <div className="flex h-full items-center">
                      <Switch checked={form.inUse} onCheckedChange={(v) => setField("inUse", v)} />
                    </div>
                  </FieldCell>
                </FormRow>
                <FormRow>
                  <FieldCell label="Access Code">
                    <Input value={form.accessCode} onChange={(e) => setField("accessCode", e.target.value)} className={controlClass} />
                  </FieldCell>
                  <FieldCell label="Special Code">
                    <Input value={form.specialCode} onChange={(e) => setField("specialCode", e.target.value)} className={controlClass} />
                  </FieldCell>
                  <FieldCell label="Explanation">
                    <Input value={form.explanation} onChange={(e) => setField("explanation", e.target.value)} className={controlClass} />
                  </FieldCell>
                </FormRow>
              </div>
            </GridSection>
          </fieldset>
        </TabsContent>

        <TabsContent value="detail" className="mt-0 flex min-h-0 flex-1 flex-col">
          <MasterDetailLayout
            persistenceKey="legacy-erp.sizes"
            defaultLeftSize={34}
            minLeftSize={28}
            maxLeftSize={48}
            left={
              <MasterListPanel<SizeSetItem>
                title={
                  <span className="flex items-center gap-1.5">
                    Detail Rows
                    <Badge variant="secondary" className="h-5 px-1.5 text-[11px] font-normal">{items.length}</Badge>
                  </span>
                }
                items={items}
                selectedId={selectedId === "new" ? "new" : selectedId}
                onSelect={requestSelect}
                getId={(item) => item.id}
                getLabel={(item) => item.name || item.code || "(unnamed)"}
                getSubLabel={(item) => item.code || undefined}
                loading={itemsLoading}
                emptyMessage="No detail rows have been added yet."
                onAdd={!readOnly ? handleAddDetailRow : undefined}
                addDisabled={!sizeSetId}
                onDelete={!readOnly ? (item) => setPendingDelete(item) : undefined}
                onRefresh={() => { if (sizeSetId) loadItems(sizeSetId); }}
                addLabel="Add Row"
                deleteLabel="Delete Row"
                searchPlaceholder="Search detail rows..."
              />
            }
            right={
              <DetailEditorPanel
                isEmpty={selectedId == null}
                actions={
                  selectedId != null && !readOnly ? (
                    <Button size="sm" className="h-7 gap-1 text-xs" onClick={handleSaveDetailRow} disabled={itemSaving || !isItemDirty}>
                      <Save className="h-3.5 w-3.5" />
                      {itemSaving ? "Saving..." : "Save"}
                    </Button>
                  ) : undefined
                }
              >
                <fieldset disabled={readOnly} className="contents">
                  <GridSection title="Detail Row">
                    <div className="divide-y">
                      <FormRow>
                        <FieldCell label="Code">
                          <Input
                            value={itemForm.code}
                            onChange={(e) => { setItemField("code", e.target.value); ensureOrderAssigned(); }}
                            className={controlClass}
                          />
                        </FieldCell>
                        <FieldCell label="Name" span={2}>
                          <Input
                            value={itemForm.name}
                            onChange={(e) => { setItemField("name", e.target.value); ensureOrderAssigned(); }}
                            className={controlClass}
                          />
                        </FieldCell>
                      </FormRow>
                      <FormRow>
                        <FieldCell label="Value">
                          <Input value={itemForm.value} onChange={(e) => setItemField("value", e.target.value)} className={controlClass} />
                        </FieldCell>
                        <FieldCell label="Order By">
                          <div className={disabledDisplayClass} title="Assigned automatically">{itemForm.orderBy || "—"}</div>
                        </FieldCell>
                        <FieldCell label="In Use">
                          <div className="flex h-full items-center">
                            <Switch checked={itemForm.inUse} onCheckedChange={(v) => setItemField("inUse", v)} />
                          </div>
                        </FieldCell>
                      </FormRow>
                      <FormRow>
                        <FieldCell label="Explanation" span={3}>
                          <Input value={itemForm.explanation} onChange={(e) => setItemField("explanation", e.target.value)} className={controlClass} />
                        </FieldCell>
                      </FormRow>
                    </div>
                  </GridSection>
                </fieldset>
              </DetailEditorPanel>
            }
          />
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!pendingSelect} onOpenChange={(open) => !open && setPendingSelect(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>You have unsaved changes to this detail row. Switching will discard them.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingSelect(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingSelect && "isNew" in pendingSelect) {
                  startNewDetailRow();
                } else if (pendingSelect) {
                  selectItem(pendingSelect);
                }
                setPendingSelect(null);
              }}
            >
              Discard Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Detail Row</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete &ldquo;{pendingDelete?.name || pendingDelete?.code}&rdquo;? This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={handleDeleteDetailRow}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
