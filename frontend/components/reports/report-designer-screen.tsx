"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "@/lib/app-navigation";
import {
  ArrowDown, ArrowUp, Calendar, Check, ExternalLink, Eye, FileBarChart2, Hash, Lock, Plus, Save, Search, ToggleLeft, Trash2, Type, X,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ModuleHeader } from "@/components/legacy-erp/module-header";
import { FieldLabel, FormSelectField, FormTextField } from "@/components/forms/form-field";
import { FormGrid } from "@/components/forms/form-grid";
import { useWorkspaceSearchParams } from "@/hooks/use-workspace-search-params";
import { useWorkspaceTabTitle } from "@/hooks/use-workspace-tab-title";
import { useWorkspaceDirty } from "@/hooks/use-workspace-dirty";
import { useWorkspaceTabContext } from "@/components/layout/workspace/workspace-tab-context";
import { useWorkspaceStore } from "@/lib/store/workspace-store";
import { notifyMenuChanged } from "@/lib/store/screen-index-store";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import {
  REPORT_MODULE_UI,
  reportBuilderApiFor,
  type ReportModuleKey,
  type ReportCatalog,
  type ReportDefinitionInput,
  type ReportFieldType,
  type ReportFilterDef,
  type ReportResult,
  type ReportSourceField,
} from "@/lib/nexuscore-api";
import { FilterValueInput, OPERATOR_LABELS, ReportResultTable, VALUELESS_OPERATORS } from "./report-shared";

const MAX_SORTS = 3;
const TYPE_ICON: Record<ReportFieldType, typeof Type> = { string: Type, number: Hash, date: Calendar, boolean: ToggleLeft };

const emptyForm = (dataSource = ""): ReportDefinitionInput => ({ name: "", description: "", dataSource, columns: [], filters: [], sorting: [] });
const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

function Section({ title, description, actions, children }: { title: string; description?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-md border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** Field picker grouped by table (base table first, then related tables, then counts). */
function FieldSelect({ fields, value, onChange, className }: { fields: ReportSourceField[]; value: string; onChange: (key: string) => void; className?: string }) {
  const groups = useMemo(() => {
    const map = new Map<string, ReportSourceField[]>();
    for (const f of fields) map.set(f.group, [...(map.get(f.group) ?? []), f]);
    return Array.from(map.entries());
  }, [fields]);
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger className={cn("w-full", className)}><SelectValue placeholder="Choose a field" /></SelectTrigger>
      <SelectContent className="max-h-80">
        {groups.map(([group, items]) => (
          <SelectGroup key={group}>
            <SelectLabel>{group}</SelectLabel>
            {items.map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Create or edit a report of a module: data source, columns, filters, sorting, live preview. */
export function ReportDesignerScreen({ module }: { module: ReportModuleKey }) {
  const reportApi = useMemo(() => reportBuilderApiFor(module), [module]);
  const ui = REPORT_MODULE_UI[module];
  const DESIGNER_HREF = (reportId: string) => `${ui.basePath}/designer?id=${reportId}`;
  const VIEW_HREF = (reportId: string) => `${ui.basePath}/view?id=${reportId}`;
  const router = useRouter();
  const id = useWorkspaceSearchParams().get("id");
  const tabCtx = useWorkspaceTabContext();
  const [catalog, setCatalog] = useState<ReportCatalog | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<ReportDefinitionInput>(emptyForm());
  const savedRef = useRef<string>(JSON.stringify(emptyForm()));
  const [fieldSearch, setFieldSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<ReportResult | null>(null);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const cat = await reportApi.catalog();
        setCatalog(cat);
        const initial = id ? await reportApi.get(id) : emptyForm(cat.sources[0]?.key ?? "");
        const next: ReportDefinitionInput = {
          name: initial.name, description: initial.description ?? "", dataSource: initial.dataSource,
          columns: initial.columns ?? [], filters: initial.filters ?? [], sorting: initial.sorting ?? [],
        };
        setForm(next);
        savedRef.current = JSON.stringify(next);
      } catch (e: any) {
        setLoadError(e.status === 404 ? "This report no longer exists." : e.message || "Could not load the report designer");
      }
    })();
  }, [id, reportApi]);

  const source = catalog?.sources.find((s) => s.key === form.dataSource);
  const fields = useMemo(() => source?.fields ?? [], [source]);
  const fieldByKey = useMemo(() => new Map(fields.map((f) => [f.key, f])), [fields]);
  const selected = useMemo(() => new Set(form.columns.map((c) => c.field)), [form.columns]);
  const filterableFields = useMemo(() => fields.filter((f) => f.filterable), [fields]);
  // Calculated fields (line amounts, ...) can be shown and totalled but not sorted on.
  const sortableFields = useMemo(() => fields.filter((f) => f.sortable), [fields]);

  const visibleGroups = useMemo(() => {
    const q = fieldSearch.trim().toLowerCase();
    const map = new Map<string, ReportSourceField[]>();
    for (const f of fields) {
      if (q && !f.label.toLowerCase().includes(q) && !f.group.toLowerCase().includes(q)) continue;
      map.set(f.group, [...(map.get(f.group) ?? []), f]);
    }
    return Array.from(map.entries());
  }, [fields, fieldSearch]);

  const isDirty = JSON.stringify(form) !== savedRef.current;
  const set = (patch: Partial<ReportDefinitionInput>) => setForm((f) => ({ ...f, ...patch }));
  useWorkspaceTabTitle(id ? `Edit Report · ${form.name || "…"}` : "New Report");

  // ── Columns ──
  const toggleColumn = (key: string) =>
    set({ columns: selected.has(key) ? form.columns.filter((c) => c.field !== key) : [...form.columns, { field: key }] });
  const updateColumn = (i: number, patch: Partial<ReportDefinitionInput["columns"][number]>) =>
    set({ columns: form.columns.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) });
  const moveColumn = (i: number, dir: -1 | 1) => {
    const next = [...form.columns];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    set({ columns: next });
  };

  // ── Filters ──
  const addFilter = () => {
    const field = filterableFields[0];
    if (!field || !catalog) return;
    set({ filters: [...form.filters, { id: newId(), field: field.key, operator: catalog.operators[field.type][0] }] });
  };
  const updateFilter = (i: number, patch: Partial<ReportFilterDef>) =>
    set({ filters: form.filters.map((f, idx) => (idx === i ? { ...f, ...patch } : f)) });
  const changeFilterField = (i: number, key: string) => {
    const field = fieldByKey.get(key);
    if (!field || !catalog) return;
    // A new field may have a different type: restart its condition and value.
    set({ filters: form.filters.map((f, idx) => (idx === i ? { id: f.id, field: key, operator: catalog.operators[field.type][0], prompt: f.prompt } : f)) });
  };

  // ── Data source ──
  const changeSource = (key: string) => {
    if (key === form.dataSource) return;
    const hadSelections = form.columns.length || form.filters.length || form.sorting.length;
    set({ dataSource: key, columns: [], filters: [], sorting: [] });
    setPreview(null);
    if (hadSelections) toast.info("Columns, filters and sorting were cleared for the new data source.");
  };

  const runPreview = async () => {
    if (!form.columns.length) { toast.error("Select at least one column to preview"); return; }
    setPreviewing(true);
    try {
      setPreview(await reportApi.preview(form));
    } catch (e: any) {
      toast.error(e.message || "Preview failed");
    } finally {
      setPreviewing(false);
    }
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error("Report name is required"); return; }
    if (!form.columns.length) { toast.error("Select at least one column"); return; }
    setSaving(true);
    try {
      const dto = { ...form, name: form.name.trim(), description: form.description?.trim() || null };
      if (id) {
        await reportApi.update(id, dto);
        savedRef.current = JSON.stringify(form);
        setForm({ ...form });
        toast.success("Report saved");
        notifyMenuChanged();
      } else {
        const created = await reportApi.create(dto);
        savedRef.current = JSON.stringify(form);
        toast.success(`Report "${created.name}" created — it's now in the ${ui.label} menu under ${catalog?.sources.find((s) => s.key === created.dataSource)?.label ?? ""} Reports`);
        notifyMenuChanged();
        // Continue in the saved report's own designer tab and close this "New Report" tab.
        const newTabKey = tabCtx?.tabKey;
        navigateOrOpenTab(router, DESIGNER_HREF(created.id));
        if (newTabKey) useWorkspaceStore.getState().closeTab(newTabKey);
      }
    } catch (e: any) {
      toast.error(e.message || "Could not save the report");
    } finally {
      setSaving(false);
    }
  };
  useWorkspaceDirty(isDirty, save);

  if (loadError) {
    return (
      <Empty className="py-16">
        <EmptyHeader>
          <EmptyMedia variant="icon"><Lock /></EmptyMedia>
          <EmptyTitle>Report unavailable</EmptyTitle>
          <EmptyDescription>{loadError}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  if (!catalog) {
    return <div className="space-y-4 p-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-96 w-full" /></div>;
  }
  const allowed = id ? catalog.capabilities.update : catalog.capabilities.create;
  if (!allowed) {
    return (
      <Empty className="py-16">
        <EmptyHeader>
          <EmptyMedia variant="icon"><Lock /></EmptyMedia>
          <EmptyTitle>No access</EmptyTitle>
          <EmptyDescription>You don&apos;t have permission to {id ? "edit" : "create"} {ui.label} reports.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <ModuleHeader
        icon={FileBarChart2}
        title={id ? form.name || "Edit Report" : "New Report"}
        subtitle={`Pick a data source, choose the columns and filters, then save. The report gets its own ${ui.label} menu entry under its data source's reports section.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {id && (
              <Button variant="outline" size="sm" onClick={() => navigateOrOpenTab(router, VIEW_HREF(id))}>
                <ExternalLink className="mr-2 h-3.5 w-3.5" />Open Report
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={runPreview} disabled={previewing || !catalog.capabilities.view}>
              <Eye className="mr-2 h-3.5 w-3.5" />{previewing ? "Loading..." : "Preview"}
            </Button>
            <Button size="sm" onClick={save} disabled={saving || (!!id && !isDirty)}>
              <Save className="mr-2 h-3.5 w-3.5" />{saving ? "Saving..." : id ? "Save" : "Create Report"}
            </Button>
          </div>
        }
      />

      <Section title="Report">
        <FormGrid>
          <FormTextField label="Name *" value={form.name} onChange={(v) => set({ name: v })} />
          <FormSelectField
            label="Data Source"
            value={form.dataSource}
            onChange={changeSource}
            options={catalog.sources.map((s) => ({ value: s.key, label: s.label }))}
          />
          <div className="hidden md:block" />
          <div className="space-y-2 md:col-span-3">
            <FieldLabel>Description</FieldLabel>
            <Textarea rows={2} value={form.description ?? ""} onChange={(e) => set({ description: e.target.value })} placeholder="What this report shows (optional)" />
          </div>
        </FormGrid>
        {source && <p className="text-xs text-muted-foreground">{source.description}</p>}
      </Section>

      <Section title="Columns" description="Choose fields from the data source and its related tables. Rename a column, reorder it, or total it.">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <div className="space-y-2 lg:col-span-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={fieldSearch} onChange={(e) => setFieldSearch(e.target.value)} placeholder="Search fields" className="h-9 pl-8" />
            </div>
            <div className="max-h-[26rem] space-y-3 overflow-y-auto rounded-md border p-2">
              {visibleGroups.length === 0 && <p className="px-2 py-6 text-center text-xs text-muted-foreground">No fields match.</p>}
              {visibleGroups.map(([group, items]) => (
                <div key={group}>
                  <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group}</p>
                  {items.map((f) => {
                    const Icon = TYPE_ICON[f.type];
                    const on = selected.has(f.key);
                    return (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => toggleColumn(f.key)}
                        className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent", on && "bg-primary/10 text-primary")}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0 opacity-60" />
                        <span className="flex-1 truncate">{f.label}</span>
                        {on ? <Check className="h-3.5 w-3.5 shrink-0" /> : <Plus className="h-3.5 w-3.5 shrink-0 opacity-40" />}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2 lg:col-span-3">
            <p className="text-xs text-muted-foreground">{form.columns.length} selected · shown left to right in this order</p>
            {form.columns.length === 0 ? (
              <div className="flex h-40 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">Click fields on the left to add columns.</div>
            ) : (
              <div className="max-h-[26rem] space-y-1.5 overflow-y-auto">
                {form.columns.map((c, i) => {
                  const field = fieldByKey.get(c.field);
                  if (!field) return null;
                  return (
                    <div key={c.field} className="flex items-center gap-2 rounded-md border px-2 py-1.5">
                      <span className="w-5 text-right text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <Input value={c.label ?? ""} placeholder={field.label} onChange={(e) => updateColumn(i, { label: e.target.value })} className="h-8 text-sm" />
                        <p className="mt-0.5 truncate px-1 text-[11px] text-muted-foreground">{field.group} · {field.label}</p>
                      </div>
                      {field.type === "number" && (
                        <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs">
                          <Checkbox checked={!!c.total} onCheckedChange={(v) => updateColumn(i, { total: !!v })} />Total
                        </label>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7" disabled={i === 0} onClick={() => moveColumn(i, -1)} aria-label="Move up"><ArrowUp className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" disabled={i === form.columns.length - 1} onClick={() => moveColumn(i, 1)} aria-label="Move down"><ArrowDown className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleColumn(c.field)} aria-label="Remove column"><X className="h-3.5 w-3.5" /></Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </Section>

      <Section
        title="Filters"
        description="Limit which records are included. “Ask when running” leaves the value to be entered each time the report is opened."
        actions={<Button variant="outline" size="sm" onClick={addFilter}><Plus className="mr-2 h-3.5 w-3.5" />Add Filter</Button>}
      >
        {form.filters.length === 0 ? (
          <p className="text-sm text-muted-foreground">No filters — the report includes every record.</p>
        ) : (
          <div className="space-y-2">
            {form.filters.map((f, i) => {
              const field = fieldByKey.get(f.field);
              if (!field) return null;
              const needsValue = !VALUELESS_OPERATORS.has(f.operator);
              return (
                <div key={f.id} className="grid grid-cols-1 items-center gap-2 rounded-md border p-2 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,1.6fr)_auto_auto]">
                  <FieldSelect fields={filterableFields} value={f.field} onChange={(k) => changeFilterField(i, k)} />
                  <Select value={f.operator} onValueChange={(op) => updateFilter(i, { operator: op })}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {catalog.operators[field.type].map((op) => <SelectItem key={op} value={op}>{OPERATOR_LABELS[op] ?? op}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {!needsValue ? (
                    <span className="text-xs text-muted-foreground">No value needed</span>
                  ) : f.prompt ? (
                    <span className="text-xs text-muted-foreground">Entered when the report runs</span>
                  ) : f.operator === "between" ? (
                    <div className="flex items-center gap-2">
                      <FilterValueInput type={field.type} value={f.value ?? ""} onChange={(v) => updateFilter(i, { value: v })} placeholder="From" />
                      <span className="text-xs text-muted-foreground">and</span>
                      <FilterValueInput type={field.type} value={f.value2 ?? ""} onChange={(v) => updateFilter(i, { value2: v })} placeholder="To" />
                    </div>
                  ) : (
                    <FilterValueInput type={field.type} value={f.value ?? ""} onChange={(v) => updateFilter(i, { value: v })} />
                  )}
                  <div className="flex items-center gap-2">
                    <Switch id={`prompt-${f.id}`} checked={!!f.prompt} disabled={!needsValue} onCheckedChange={(v) => updateFilter(i, { prompt: v, value: undefined, value2: undefined })} />
                    <Label htmlFor={`prompt-${f.id}`} className="whitespace-nowrap text-xs font-normal">Ask when running</Label>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 justify-self-end" onClick={() => set({ filters: form.filters.filter((_, idx) => idx !== i) })} aria-label="Remove filter">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section
        title="Sorting"
        description={`Order of the rows (up to ${MAX_SORTS} levels). Without sorting, the newest records come first.`}
        actions={
          <Button
            variant="outline"
            size="sm"
            disabled={form.sorting.length >= MAX_SORTS || !sortableFields.length}
            onClick={() => set({ sorting: [...form.sorting, { field: form.columns.find((c) => sortableFields.some((f) => f.key === c.field))?.field ?? sortableFields[0].key, direction: "asc" }] })}
          >
            <Plus className="mr-2 h-3.5 w-3.5" />Add Sort
          </Button>
        }
      >
        {form.sorting.length === 0 ? (
          <p className="text-sm text-muted-foreground">Default order: newest first.</p>
        ) : (
          <div className="space-y-2">
            {form.sorting.map((s, i) => (
              <div key={i} className="grid grid-cols-1 items-center gap-2 rounded-md border p-2 md:grid-cols-[2rem_minmax(0,2fr)_minmax(0,1fr)_auto]">
                <span className="text-xs text-muted-foreground">{i === 0 ? "By" : "Then"}</span>
                <FieldSelect fields={sortableFields} value={s.field} onChange={(k) => set({ sorting: form.sorting.map((x, idx) => (idx === i ? { ...x, field: k } : x)) })} />
                <Select value={s.direction} onValueChange={(d) => set({ sorting: form.sorting.map((x, idx) => (idx === i ? { ...x, direction: d as "asc" | "desc" } : x)) })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asc">Ascending (A→Z, 0→9, oldest first)</SelectItem>
                    <SelectItem value="desc">Descending (Z→A, 9→0, newest first)</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="icon" className="h-8 w-8 justify-self-end" onClick={() => set({ sorting: form.sorting.filter((_, idx) => idx !== i) })} aria-label="Remove sort">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Preview" description="The first 50 rows with the current settings. “Ask when running” filters are not applied in the preview.">
        {preview ? (
          <ReportResultTable result={preview} />
        ) : (
          <div className="flex h-24 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
            Choose Preview to see sample rows.
          </div>
        )}
      </Section>
    </div>
  );
}
