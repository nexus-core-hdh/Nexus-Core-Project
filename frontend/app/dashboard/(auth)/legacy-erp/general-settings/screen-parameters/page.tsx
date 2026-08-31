"use client";

import { useEffect, useMemo, useState } from "react";
import { PlmCrudTable, type Column } from "@/app/dashboard/(auth)/plm/_components/plm-crud-table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { screenParametersApi } from "@/lib/nexuscore-api";
import { useGlobalScreenSearch } from "@/hooks/use-global-screen-search";
import { DecimalParametersTab } from "./_components/decimal-parameters-tab";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ChevronRight, ChevronsUpDown, SlidersHorizontal, ListFilter } from "lucide-react";

// Settings -> Screen Parameters. Screen keys come from the same live menu tree the sidebar and
// the Ctrl+K Global Screen Search already use (useGlobalScreenSearch / MenuItem, permission-
// filtered, app-wide) — deliberately NOT a second screen registry; see hooks/use-global-screen-
// search.ts and lib/search/screen-index.ts. Parameter rows are managed via the new, centralized
// ScreenParameter table (one table for every screen, isolated by the screenKey+paramKey unique
// constraint) — see nexuscore-backend/src/modules/general-settings/. Writes rely on the
// backend's existing RolesGuard + @Permissions('general-settings','manage-screen-parameters') to
// reject unauthorized users (same "backend is authoritative, frontend just shows the resulting
// toast on failure" convention already used by the sibling Approval Configuration screen — see
// its own comment for why there's no client-side permission-list mechanism to reuse instead).

interface ParamRow {
  id: string;
  screenKey: string;
  paramKey: string;
  name: string;
  description: string | null;
  type: "boolean" | "text" | "number" | "select";
  value: string | null;
  options: string[] | null;
  isActive: boolean;
}

const PARAM_TYPES: { value: ParamRow["type"]; label: string }[] = [
  { value: "boolean", label: "Boolean" },
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "select", label: "Select / Dropdown" },
];

const emptyForm = {
  paramKey: "", name: "", description: "", type: "text" as ParamRow["type"],
  value: "", optionsText: "", isActive: true,
};

function ValueBadge({ row }: { row: ParamRow }) {
  if (row.value == null || row.value === "") return <span className="text-muted-foreground">—</span>;
  if (row.type === "boolean") return <Badge variant="outline">{row.value === "true" ? "Yes" : "No"}</Badge>;
  return <span className="font-mono text-xs">{row.value}</span>;
}

export default function ScreenParametersPage() {
  const { entries, ensureLoaded } = useGlobalScreenSearch();
  useEffect(() => { ensureLoaded(); }, [ensureLoaded]);

  // This page's own screen (and its "General Settings" sibling) are excluded from the picker —
  // configuring parameters "for" the parameter-configuration screen isn't a meaningful case.
  const pickableEntries = useMemo(
    () => entries.filter((e) => !e.href.startsWith("/dashboard/legacy-erp/general-settings")),
    [entries],
  );
  const groupedEntries = useMemo(() => {
    const byModule = new Map<string, typeof pickableEntries>();
    for (const e of pickableEntries) {
      const list = byModule.get(e.moduleTitle) ?? [];
      list.push(e);
      byModule.set(e.moduleTitle, list);
    }
    return Array.from(byModule.entries());
  }, [pickableEntries]);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [screenKey, setScreenKey] = useState<string | null>(null);
  const selectedScreen = pickableEntries.find((e) => e.href === screenKey) ?? null;

  const [rows, setRows] = useState<ParamRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<typeof emptyForm>(emptyForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async (key: string) => {
    setLoading(true);
    try {
      const r: any = await screenParametersApi.list(key);
      setRows(Array.isArray(r) ? r : []);
    } catch (e: any) {
      toast.error(e.message || "Failed to load parameters");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (screenKey) load(screenKey);
    else setRows([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenKey]);

  const set = (k: keyof typeof emptyForm, v: any) => setForm((p) => ({ ...p, [k]: v }));

  const openAdd = () => { setForm(emptyForm); setEditing(null); setOpen(true); };
  const openEdit = (r: ParamRow) => {
    setForm({
      paramKey: r.paramKey, name: r.name, description: r.description ?? "",
      type: r.type, value: r.value ?? "",
      optionsText: Array.isArray(r.options) ? r.options.join(", ") : "",
      isActive: r.isActive,
    });
    setEditing(r.id);
    setOpen(true);
  };

  const save = async () => {
    if (!screenKey) return;
    if (!form.paramKey.trim() || !form.name.trim()) return toast.error("Key and name are required");
    const options = form.type === "select" ? form.optionsText.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
    if (form.type === "select" && (!options || options.length === 0)) return toast.error("Provide at least one option");
    setSaving(true);
    try {
      if (editing) {
        await screenParametersApi.update(editing, {
          name: form.name.trim(),
          description: form.description.trim() || null,
          type: form.type,
          value: form.value === "" ? null : form.value,
          options,
          isActive: form.isActive,
        });
        toast.success("Parameter updated");
      } else {
        await screenParametersApi.create({
          screenKey,
          paramKey: form.paramKey.trim(),
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          type: form.type,
          value: form.value === "" ? null : form.value,
          options,
          isActive: form.isActive,
        });
        toast.success("Parameter created");
      }
      setOpen(false);
      load(screenKey);
    } catch (e: any) {
      toast.error(e.message || "Failed to save parameter");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row: ParamRow) => {
    const prev = rows;
    setRows((p) => p.map((r) => (r.id === row.id ? { ...r, isActive: !row.isActive } : r)));
    try {
      await screenParametersApi.update(row.id, { isActive: !row.isActive });
    } catch (e: any) {
      setRows(prev);
      toast.error(e.message || "Failed to update parameter");
    }
  };

  const columns: Column<ParamRow>[] = [
    { key: "paramKey", label: "Key", render: (r) => <span className="font-mono text-xs">{r.paramKey}</span> },
    { key: "name", label: "Name" },
    { key: "type", label: "Type", render: (r) => <Badge variant="outline">{PARAM_TYPES.find((t) => t.value === r.type)?.label ?? r.type}</Badge> },
    { key: "value", label: "Value", render: (r) => <ValueBadge row={r} /> },
    {
      key: "isActive", label: "Status",
      render: (r) => (
        <button type="button" onClick={() => toggleActive(r)}>
          <Badge variant={r.isActive ? "default" : "secondary"} className="text-[11px] font-normal">
            {r.isActive ? "Active" : "Inactive"}
          </Badge>
        </button>
      ),
    },
  ];

  const selectedOptions = form.optionsText.split(",").map((s) => s.trim()).filter(Boolean);

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 p-6 lg:p-8">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Legacy ERP</span>
        <ChevronRight className="h-3 w-3" />
        <span>General Settings</span>
        <ChevronRight className="h-3 w-3" />
        <span className="font-medium text-foreground">Screen Parameters</span>
      </div>

      <div className="flex items-center gap-4 border-b pb-6">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10">
          <SlidersHorizontal className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-[22px] font-semibold leading-tight tracking-tight">Screen Parameters</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">Configure independent, typed parameters for any screen across the ERP</p>
        </div>
      </div>

      <Tabs defaultValue="screen" className="w-full gap-5">
        <TabsList>
          <TabsTrigger value="screen">Screen Parameters</TabsTrigger>
          <TabsTrigger value="decimal">Decimal</TabsTrigger>
        </TabsList>

        <TabsContent value="screen" className="space-y-5">
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Screen</Label>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="h-9 w-full max-w-md justify-between text-sm font-normal">
                  <span className="truncate">
                    {selectedScreen ? `${selectedScreen.moduleTitle} — ${selectedScreen.title}` : "Search and select a screen..."}
                  </span>
                  <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[420px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search screens..." />
                  <CommandList>
                    <CommandEmpty>No screens found.</CommandEmpty>
                    {groupedEntries.map(([moduleTitle, items]) => (
                      <CommandGroup key={moduleTitle} heading={moduleTitle}>
                        {items.map((e) => (
                          <CommandItem
                            key={e.href}
                            value={`${e.title} ${e.moduleTitle}`}
                            onSelect={() => { setScreenKey(e.href); setPickerOpen(false); }}
                            className={cn(e.href === screenKey && "bg-accent")}
                          >
                            {e.title}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {selectedScreen && <p className="font-mono text-[11px] text-muted-foreground">{selectedScreen.href}</p>}
          </div>

          {!screenKey ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><ListFilter /></EmptyMedia>
                <EmptyTitle>Select a screen to begin</EmptyTitle>
                <EmptyDescription>Choose a screen above to view and manage its parameters.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <PlmCrudTable
              title=""
              storageKey="screenParameters"
              data={rows}
              loading={loading}
              searchKey="name"
              searchPlaceholder="Search parameters..."
              addLabel="Add Parameter"
              onAdd={openAdd}
              onEdit={openEdit}
              onDelete={async (r) => { await screenParametersApi.delete(r.id); load(screenKey); }}
              emptyMessage="No parameters configured for this screen yet"
              columns={columns}
            />
          )}
        </TabsContent>

        <TabsContent value="decimal">
          <DecimalParametersTab />
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} Parameter</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Key *</Label>
              <Input
                value={form.paramKey}
                disabled={!!editing}
                onChange={(e) => set("paramKey", e.target.value.replace(/\s+/g, "-").toLowerCase())}
                placeholder="e.g. default-page-size"
              />
              {!editing && <p className="mt-1 text-[11px] text-muted-foreground">Stable, machine-readable key — cannot be changed after creation.</p>}
            </div>
            <div><Label>Display Name *</Label><Input value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
            <div><Label>Description</Label><Textarea rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} /></div>
            <div>
              <Label>Type *</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm((p) => ({
                  ...p,
                  type: v as ParamRow["type"],
                  // A fresh type needs a value in its own shape — most importantly boolean,
                  // whose "false" default must be an explicit string, not "" (which save()
                  // treats as no-value and stores as null, i.e. Value would render "—" instead
                  // of "No" for a switch the user never touched).
                  value: v === "boolean" ? "false" : "",
                }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PARAM_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {form.type === "select" && (
              <div>
                <Label>Options (comma-separated) *</Label>
                <Textarea rows={2} value={form.optionsText} onChange={(e) => set("optionsText", e.target.value)} placeholder="e.g. small, medium, large" />
              </div>
            )}

            <div>
              <Label>Value</Label>
              {form.type === "boolean" ? (
                <div className="flex items-center gap-2 pt-1">
                  <Switch checked={form.value === "true"} onCheckedChange={(v) => set("value", v ? "true" : "false")} />
                  <span className="text-sm text-muted-foreground">{form.value === "true" ? "True" : "False"}</span>
                </div>
              ) : form.type === "select" ? (
                <Select value={form.value} onValueChange={(v) => set("value", v)}>
                  <SelectTrigger><SelectValue placeholder="Choose a value" /></SelectTrigger>
                  <SelectContent>
                    {selectedOptions.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input type={form.type === "number" ? "number" : "text"} value={form.value} onChange={(e) => set("value", e.target.value)} />
              )}
            </div>

            <div className="flex items-center gap-2"><Switch checked={form.isActive} onCheckedChange={(v) => set("isActive", v)} /><Label>Active</Label></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
