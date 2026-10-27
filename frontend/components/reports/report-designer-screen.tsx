"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "@/lib/app-navigation";
import {
  ArrowDown, ArrowUp, Calendar, Check, ChevronDown, ChevronRight, ChevronsUpDown, Database, ExternalLink, Eye, FileBarChart2, Hash, Link2,
  Lock, Plus, Save, Search, Sigma, ToggleLeft, Trash2, TriangleAlert, Type, X,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ModuleHeader } from "@/components/legacy-erp/module-header";
import { FieldLabel, FormTextField } from "@/components/forms/form-field";
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
  type ReportFieldGroup,
  type ReportFieldType,
  type ReportFilterDef,
  type ReportResult,
  type ReportSourceField,
  type ReportSourceInfo,
} from "@/lib/nexuscore-api";
import { FilterValueInput, OPERATOR_LABELS, ReportResultTable, ReportSections, VALUELESS_OPERATORS } from "./report-shared";
import { SectionColumnsEditor } from "./section-columns-editor";

const MAX_SORTS = 3;
const TYPE_ICON: Record<ReportFieldType, typeof Type> = { string: Type, number: Hash, date: Calendar, boolean: ToggleLeft };

const emptyForm = (dataSource = ""): ReportDefinitionInput => ({ name: "", description: "", dataSource, columns: [], filters: [], sorting: [] });
const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

/** Loading state of a database table source's fields. */
type FieldsStatus = { state: "idle" | "loading" | "ready" } | { state: "error" | "denied"; message: string };

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

/** Searchable data source picker: ready-made sources first, then every database table by module. */
function SourcePicker({ sources, value, onChange }: { sources: ReportSourceInfo[]; value: string; onChange: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  const current = sources.find((s) => s.key === value);
  const groups = useMemo(() => {
    const map = new Map<string, ReportSourceInfo[]>();
    for (const s of sources) {
      const g = s.group ?? "Data Sources";
      map.set(g, [...(map.get(g) ?? []), s]);
    }
    return Array.from(map.entries());
  }, [sources]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="h-9 w-full justify-between font-normal">
          <span className="flex min-w-0 items-center gap-2 truncate">
            {current?.dynamic && <Database className="h-3.5 w-3.5 shrink-0 opacity-60" />}
            <span className="truncate">{current?.label ?? "Choose a data source"}</span>
            {current?.table && <span className="truncate font-mono text-[11px] text-muted-foreground">{current.table}</span>}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(32rem,calc(100vw-2rem))] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search data sources or table names..." />
          <CommandList className="max-h-96">
            <CommandEmpty>No data source matches.</CommandEmpty>
            {groups.map(([group, items]) => (
              <CommandGroup key={group} heading={group}>
                {items.map((s) => (
                  <CommandItem key={s.key} value={`${s.label} ${s.table ?? ""} ${group} ${s.key}`} onSelect={() => { onChange(s.key); setOpen(false); }}>
                    <Check className={cn("h-3.5 w-3.5", s.key === value ? "opacity-100" : "opacity-0")} />
                    <span className="truncate">{s.label}</span>
                    {s.table && <span className="ml-auto truncate font-mono text-[11px] text-muted-foreground">{s.table}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Searchable field picker grouped by table (base table first, then related tables). */
function FieldSelect({ fields, value, onChange, className }: { fields: ReportSourceField[]; value: string; onChange: (key: string) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const current = fields.find((f) => f.key === value);
  const groups = useMemo(() => {
    const map = new Map<string, ReportSourceField[]>();
    for (const f of fields) map.set(f.group, [...(map.get(f.group) ?? []), f]);
    return Array.from(map.entries());
  }, [fields]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className={cn("h-9 w-full justify-between font-normal", className)}>
          <span className="min-w-0 truncate text-left">
            {current ? <>{current.label}<span className="ml-1.5 text-[11px] text-muted-foreground">{current.group}</span></> : <span className="text-muted-foreground">Choose a field</span>}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(28rem,calc(100vw-2rem))] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search fields..." />
          <CommandList className="max-h-80">
            <CommandEmpty>No field matches.</CommandEmpty>
            {groups.map(([group, items]) => (
              <CommandGroup key={group} heading={group}>
                {items.map((f) => (
                  <CommandItem key={f.key} value={`${f.label} ${group} ${f.column ?? ""} ${f.key}`} onSelect={() => { onChange(f.key); setOpen(false); }}>
                    <Check className={cn("h-3.5 w-3.5", f.key === value ? "opacity-100" : "opacity-0")} />
                    <span className="truncate">{f.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Ready-made sources declare their fields with a group name: show them as groups too. */
function groupsOfStaticFields(fields: ReportSourceField[]): ReportFieldGroup[] {
  const map = new Map<string, ReportSourceField[]>();
  for (const f of fields) map.set(f.group, [...(map.get(f.group) ?? []), f]);
  return Array.from(map.entries()).map(([label, items], i) => ({
    id: `static:${label}`, label, table: "", relation: i === 0 ? "base" : "to-one", depth: i === 0 ? 0 : 1, via: null, fields: items, expandable: false,
  }));
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
  // Document sections whose own column editor is open.
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<ReportResult | null>(null);
  const [previewing, setPreviewing] = useState(false);

  // Database table sources: field groups loaded from the backend, more on demand.
  const [tableGroups, setTableGroups] = useState<ReportFieldGroup[]>([]);
  const [fieldsStatus, setFieldsStatus] = useState<FieldsStatus>({ state: "idle" });
  const [loadingPath, setLoadingPath] = useState<string | null>(null);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  // Saved columns from deeper links than are loaded yet, and those that no longer exist.
  const [resolvedFields, setResolvedFields] = useState<ReportSourceField[]>([]);
  const [staleFields, setStaleFields] = useState<{ key: string; reason: string }[]>([]);
  const requestedKeys = useRef(new Set<string>());

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
  const isTable = !!source?.dynamic;

  // A table source's fields come from the database schema: load the base table and its direct links.
  useEffect(() => {
    setTableGroups([]);
    setResolvedFields([]);
    setStaleFields([]);
    requestedKeys.current = new Set();
    if (!isTable || !form.dataSource) { setFieldsStatus({ state: "idle" }); return; }
    let cancelled = false;
    setFieldsStatus({ state: "loading" });
    reportApi.sourceFields(form.dataSource)
      .then(({ groups }) => {
        if (cancelled) return;
        setTableGroups(groups);
        setOpenGroups(new Set([groups[0]?.id ?? ""]));
        setFieldsStatus({ state: "ready" });
      })
      .catch((e: any) => {
        if (cancelled) return;
        setFieldsStatus(e.status === 403
          ? { state: "denied", message: `You need permission to view ${ui.label} reports to browse table fields.` }
          : { state: "error", message: e.message || "Could not load the fields of this table" });
      });
    return () => { cancelled = true; };
  }, [isTable, form.dataSource, reportApi, ui.label]);

  const fieldGroups = useMemo<ReportFieldGroup[]>(() => {
    if (!isTable) return groupsOfStaticFields(source?.fields ?? []);
    const loaded = new Set(tableGroups.flatMap((g) => g.fields.map((f) => f.key)));
    const extra = resolvedFields.filter((f) => !loaded.has(f.key));
    if (!extra.length) return tableGroups;
    // Saved fields of links not loaded yet: shown under their own table heading until loaded.
    const map = new Map<string, ReportSourceField[]>();
    for (const f of extra) map.set(f.group, [...(map.get(f.group) ?? []), f]);
    return [
      ...tableGroups,
      ...Array.from(map.entries()).map(([label, items]): ReportFieldGroup => ({
        id: `saved:${label}`, label, table: items[0].table ?? "", relation: items[0].relation ?? "to-one", depth: 1, via: null, fields: items, expandable: false,
      })),
    ];
  }, [isTable, source, tableGroups, resolvedFields]);

  const fields = useMemo(() => fieldGroups.flatMap((g) => g.fields), [fieldGroups]);
  const fieldByKey = useMemo(() => new Map(fields.map((f) => [f.key, f])), [fields]);
  const groupByField = useMemo(() => new Map(fieldGroups.flatMap((g) => g.fields.map((f) => [f.key, g] as const))), [fieldGroups]);
  const selected = useMemo(() => new Set(form.columns.map((c) => c.field)), [form.columns]);
  const filterableFields = useMemo(() => fields.filter((f) => f.filterable), [fields]);
  // Calculated fields (line amounts, ...) can be shown and totalled but not sorted on.
  const sortableFields = useMemo(() => fields.filter((f) => f.sortable), [fields]);

  // Fields a saved report uses that are not loaded yet: resolve them (or learn they no longer exist).
  useEffect(() => {
    if (!isTable || fieldsStatus.state !== "ready") return;
    const used = [...form.columns, ...form.filters, ...form.sorting].map((x) => x.field);
    // Each key is asked for once per source, so an unresolvable one never loops.
    const unknown = Array.from(new Set(used)).filter((k) => !fieldByKey.has(k) && !requestedKeys.current.has(k));
    if (!unknown.length) return;
    unknown.forEach((k) => requestedKeys.current.add(k));
    reportApi.resolveFields(form.dataSource, unknown)
      .then((r) => {
        setResolvedFields((prev) => [...prev, ...r.fields]);
        if (r.missing.length) setStaleFields((prev) => [...prev, ...r.missing]);
      })
      .catch(() => undefined);
  }, [isTable, fieldsStatus.state, form.columns, form.filters, form.sorting, form.dataSource, fieldByKey, reportApi]);

  const visibleGroups = useMemo(() => {
    const q = fieldSearch.trim().toLowerCase();
    if (!q) return fieldGroups.map((g) => ({ group: g, items: g.fields }));
    return fieldGroups
      .map((g) => ({
        group: g,
        items: g.fields.filter((f) => [f.label, g.label, g.table, f.column ?? ""].some((s) => s.toLowerCase().includes(q))),
      }))
      .filter((x) => x.items.length > 0);
  }, [fieldGroups, fieldSearch]);

  /** Loads what lies behind a group: the tables one link further, or a to-many group's totals. */
  const expandGroup = async (group: ReportFieldGroup) => {
    if (!group.expandable || loadingPath) return;
    setLoadingPath(group.id);
    try {
      const { groups } = await reportApi.sourceFields(form.dataSource, group.id);
      setTableGroups((prev) => {
        const at = prev.findIndex((g) => g.id === group.id);
        if (group.relation === "to-many") return prev.map((g, i) => (i === at ? groups[0] ?? { ...g, expandable: false } : g));
        // Linked tables go right after their parent group (and anything already loaded under it).
        let end = at + 1;
        while (end < prev.length && prev[end].id.startsWith(`${group.id}/`)) end++;
        const known = new Set(prev.map((g) => g.id));
        const added = groups.filter((g) => !known.has(g.id));
        return [...prev.slice(0, at), { ...prev[at], expandable: false }, ...prev.slice(at + 1, end), ...added, ...prev.slice(end)];
      });
      if (group.relation === "to-many") setOpenGroups((s) => new Set(s).add(group.id));
      if (!groups.length && group.relation !== "to-many") toast.info(`${group.label} has no further linked tables to add.`);
    } catch (e: any) {
      toast.error(e.message || "Could not load the linked tables");
    } finally {
      setLoadingPath(null);
    }
  };
  const toggleGroup = (gid: string) => setOpenGroups((s) => { const n = new Set(s); if (n.has(gid)) n.delete(gid); else n.add(gid); return n; });

  /** Distinct FK links the selected columns use (table sources), shown so ambiguous joins are visible. */
  const selectedLinks = useMemo(() => {
    const links = new Map<string, { label: string; via: string; relation: string }>();
    for (const c of form.columns) {
      const g = groupByField.get(c.field);
      if (g?.via) links.set(g.id, { label: g.label, via: g.via, relation: g.relation });
    }
    return Array.from(links.values());
  }, [form.columns, groupByField]);

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
  const removeStale = () => {
    const stale = new Set(staleFields.map((s) => s.key));
    set({
      columns: form.columns.filter((c) => !stale.has(c.field)),
      filters: form.filters.filter((f) => !stale.has(f.field)),
      sorting: form.sorting.filter((s) => !stale.has(s.field)),
    });
    setStaleFields([]);
  };

  // ── Filters ──
  // A field may allow only some operators (e.g. the Order Form's Work Order: "=" only).
  const operatorsOf = (field: ReportSourceField) => field.operators ?? catalog?.operators[field.type] ?? [];
  const addFilter = () => {
    const field = filterableFields[0];
    if (!field || !catalog) return;
    set({ filters: [...form.filters, { id: newId(), field: field.key, operator: operatorsOf(field)[0] }] });
  };
  const updateFilter = (i: number, patch: Partial<ReportFilterDef>) =>
    set({ filters: form.filters.map((f, idx) => (idx === i ? { ...f, ...patch } : f)) });
  const changeFilterField = (i: number, key: string) => {
    const field = fieldByKey.get(key);
    if (!field || !catalog) return;
    // A new field may have a different type: restart its condition and value.
    set({ filters: form.filters.map((f, idx) => (idx === i ? { id: f.id, field: key, operator: operatorsOf(field)[0], prompt: f.prompt } : f)) });
  };

  // ── Data source ──
  const changeSource = (key: string) => {
    if (key === form.dataSource) return;
    const hadSelections = form.columns.length || form.filters.length || form.sorting.length;
    set({ dataSource: key, columns: [], filters: [], sorting: [] });
    setPreview(null);
    setFieldSearch("");
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
        const createdSource = catalog?.sources.find((s) => s.key === created.dataSource);
        toast.success(createdSource?.dynamic
          ? `Report "${created.name}" created — it's now in the ${ui.label} menu`
          : `Report "${created.name}" created — it's now in the ${ui.label} menu under ${createdSource?.label ?? ""} Reports`);
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
  const searching = !!fieldSearch.trim();

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
          <div className="space-y-2">
            <FieldLabel>Data Source</FieldLabel>
            <SourcePicker sources={catalog.sources} value={form.dataSource} onChange={changeSource} />
          </div>
          <div className="hidden md:block" />
          <div className="space-y-2 md:col-span-3">
            <FieldLabel>Description</FieldLabel>
            <Textarea rows={2} value={form.description ?? ""} onChange={(e) => set({ description: e.target.value })} placeholder="What this report shows (optional)" />
          </div>
        </FormGrid>
        {source && <p className="text-xs text-muted-foreground">{source.description}</p>}
        {catalog.tableSourcesError && <p className="text-xs text-amber-700 dark:text-amber-400">{catalog.tableSourcesError}</p>}
        {!source && form.dataSource && (
          <p className="text-xs text-destructive">This report&apos;s data source ({form.dataSource}) is no longer available. Choose another data source.</p>
        )}
      </Section>

      <Section
        title="Columns"
        description={source?.document
          ? "Choose the sections to print and their order. Rename a section to change its printed title."
          : isTable
          ? "Fields of the table and of the tables its foreign keys link to. Tables that refer to it (one-to-many) offer counts and totals, so each record stays one row. Expand a table to load the tables linked to it."
          : "Choose fields from the data source and its related tables. Rename a column, reorder it, or total it."}
      >
        {staleFields.length > 0 && (
          <div className="flex flex-wrap items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{staleFields.length} field{staleFields.length === 1 ? "" : "s"} of this report no longer exist in the database schema:</p>
              <ul className="mt-1 list-disc pl-4">
                {staleFields.map((s) => <li key={s.key} className="break-all"><span className="font-mono">{s.key}</span> — {s.reason}</li>)}
              </ul>
            </div>
            <Button variant="outline" size="sm" className="h-7" onClick={removeStale}>Remove them</Button>
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <div className="space-y-2 lg:col-span-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={fieldSearch} onChange={(e) => setFieldSearch(e.target.value)} placeholder={isTable ? "Search fields in all loaded tables" : "Search fields"} className="h-9 pl-8" />
            </div>
            <div className="max-h-[30rem] space-y-1 overflow-y-auto rounded-md border p-2">
              {isTable && fieldsStatus.state === "loading" && (
                <div className="space-y-2 p-2">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
              )}
              {(fieldsStatus.state === "error" || fieldsStatus.state === "denied") && (
                <div className="flex flex-col items-center gap-2 px-2 py-6 text-center text-xs text-muted-foreground">
                  {fieldsStatus.state === "denied" ? <Lock className="h-4 w-4" /> : <TriangleAlert className="h-4 w-4 text-destructive" />}
                  <p>{fieldsStatus.message}</p>
                </div>
              )}
              {fieldsStatus.state !== "loading" && fieldsStatus.state !== "error" && fieldsStatus.state !== "denied" && visibleGroups.length === 0 && (
                <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                  {searching ? (isTable ? "No fields match in the loaded tables. Expand a linked table to search further." : "No fields match.") : "This data source has no reportable fields."}
                </p>
              )}
              {visibleGroups.map(({ group, items }) => {
                const open = searching || openGroups.has(group.id) || !isTable;
                const loading = loadingPath === group.id;
                return (
                  <div key={group.id} className={cn(isTable && group.depth > 1 && "ml-3 border-l pl-2")}>
                    <button
                      type="button"
                      onClick={() => isTable && toggleGroup(group.id)}
                      className={cn("flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left", isTable && "hover:bg-accent")}
                      aria-expanded={open}
                    >
                      {isTable && (open ? <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" />)}
                      {group.relation === "to-many" ? <Sigma className="h-3 w-3 shrink-0 opacity-60" /> : group.depth > 0 && isTable ? <Link2 className="h-3 w-3 shrink-0 opacity-60" /> : null}
                      <span className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground" title={group.label}>{group.label}</span>
                      {isTable && group.relation === "to-many" && <Badge variant="outline" className="h-4 px-1 text-[10px] font-normal">one-to-many</Badge>}
                      {isTable && <span className="text-[10px] tabular-nums text-muted-foreground">{items.length}</span>}
                    </button>
                    {open && (
                      <div className="pb-1">
                        {isTable && group.via && <p className="truncate px-2 pb-1 font-mono text-[10px] text-muted-foreground" title={group.via}>{group.via}</p>}
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
                              {isTable && f.column && <span className="max-w-[40%] truncate font-mono text-[10px] text-muted-foreground">{f.column}</span>}
                              {on ? <Check className="h-3.5 w-3.5 shrink-0" /> : <Plus className="h-3.5 w-3.5 shrink-0 opacity-40" />}
                            </button>
                          );
                        })}
                        {isTable && group.expandable && !searching && (
                          <Button variant="ghost" size="sm" className="mt-0.5 h-7 w-full justify-start text-xs text-muted-foreground" disabled={!!loadingPath} onClick={() => expandGroup(group)}>
                            {loading ? <Spinner className="mr-2 h-3.5 w-3.5" /> : <Plus className="mr-2 h-3.5 w-3.5" />}
                            {group.relation === "to-many" ? "Show totals and date ranges" : `Add tables linked to ${group.label.split(" › ").pop()}`}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
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
                  const stale = staleFields.find((s) => s.key === c.field);
                  if (!field) {
                    return (
                      <div key={c.field} className="flex items-center gap-2 rounded-md border border-dashed px-2 py-1.5 text-xs text-muted-foreground">
                        <span className="w-5 text-right tabular-nums">{i + 1}</span>
                        <span className="min-w-0 flex-1 truncate">{stale ? <span className="text-destructive">No longer available: <span className="font-mono">{c.field}</span></span> : "Loading field..."}</span>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleColumn(c.field)} aria-label="Remove column"><X className="h-3.5 w-3.5" /></Button>
                      </div>
                    );
                  }
                  const sectionOpen = !!field.sectionColumns && openSections.has(c.field);
                  return (
                    <div key={c.field} className="space-y-1.5 rounded-md border px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-5 text-right text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <Input value={c.label ?? ""} placeholder={field.label} onChange={(e) => updateColumn(i, { label: e.target.value })} className="h-8 text-sm" />
                        <p className="mt-0.5 truncate px-1 text-[11px] text-muted-foreground" title={field.table ? `${field.table}.${field.column ?? field.label}` : undefined}>
                          {field.group} · {field.label}
                          {field.table && field.column && <span className="ml-1.5 font-mono">({field.table}.{field.column})</span>}
                        </p>
                      </div>
                      {field.type === "number" && (
                        <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs">
                          <Checkbox checked={!!c.total} onCheckedChange={(v) => updateColumn(i, { total: !!v })} />Total
                        </label>
                      )}
                      {field.sectionColumns && (
                        <Button
                          variant={sectionOpen ? "secondary" : "outline"} size="sm" className="h-7 shrink-0 text-xs"
                          onClick={() => setOpenSections((cur) => { const n = new Set(cur); if (n.has(c.field)) n.delete(c.field); else n.add(c.field); return n; })}
                          aria-expanded={sectionOpen}
                          title="Choose this section's columns, labels, widths, alignment and decimals"
                        >
                          {sectionOpen ? <ChevronDown className="mr-1 h-3.5 w-3.5" /> : <ChevronRight className="mr-1 h-3.5 w-3.5" />}
                          Columns{c.sectionColumns ? ` (${c.sectionColumns.filter((x) => !x.hidden).length})` : ""}
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7" disabled={i === 0} onClick={() => moveColumn(i, -1)} aria-label="Move up"><ArrowUp className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" disabled={i === form.columns.length - 1} onClick={() => moveColumn(i, 1)} aria-label="Move down"><ArrowDown className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleColumn(c.field)} aria-label="Remove column"><X className="h-3.5 w-3.5" /></Button>
                    </div>
                    {sectionOpen && field.sectionColumns && (
                      <SectionColumnsEditor
                        defs={field.sectionColumns}
                        value={c.sectionColumns}
                        onChange={(next) => updateColumn(i, { sectionColumns: next })}
                      />
                    )}
                    </div>
                  );
                })}
              </div>
            )}
            {isTable && selectedLinks.length > 0 && (
              <div className="space-y-1 rounded-md border bg-muted/30 p-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Linked tables used</p>
                {selectedLinks.map((l) => (
                  <div key={l.via + l.label} className="flex flex-wrap items-baseline gap-x-2 text-xs">
                    <span className="font-medium">{l.label}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{l.via}</span>
                    <span className="text-[10px] text-muted-foreground">{l.relation === "to-many" ? "counted / totalled per row" : "one matching row, empty if missing"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Section>

      <Section
        title="Filters"
        description="Limit which records are included. “Ask when running” leaves the value to be entered each time the report is opened."
        actions={<Button variant="outline" size="sm" onClick={addFilter} disabled={!filterableFields.length}><Plus className="mr-2 h-3.5 w-3.5" />Add Filter</Button>}
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
                      {operatorsOf(field).map((op) => <SelectItem key={op} value={op}>{OPERATOR_LABELS[op] ?? op}</SelectItem>)}
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
                    <FilterValueInput type={field.type} value={f.value ?? ""} onChange={(v) => updateFilter(i, { value: v })} lookup={field.lookup} options={field.options} />
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

      {!source?.document && (
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
      )}

      <Section title="Preview" description="The first 50 rows with the current settings. “Ask when running” filters are not applied in the preview.">
        {preview?.notice ? (
          <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">{preview.notice} “Ask when running” filters are not applied in the preview — set a fixed Work Order to preview.</p>
        ) : preview?.sections ? (
          <ReportSections sections={preview.sections} />
        ) : preview ? (
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
