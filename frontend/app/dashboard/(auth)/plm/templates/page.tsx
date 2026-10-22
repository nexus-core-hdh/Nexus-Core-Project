"use client";

// PLM Template screen — redesigned to match the legacy ERP reference screenshot (dense "No" +
// General header, grouped-by-Sample-Type Detail grid). Reuses the existing PlmTemplate backend
// module end to end (plmApi.templates / plm-definitions.service.ts); the only change below the
// data layer was extending PlmTemplate with the header FKs the reference needs and adding a real
// PlmTemplateLine detail table — no new module, no duplicate CRUD. See schema.prisma's "PLM —
// Templates" section and plm-definitions.service.ts's own "PLM Templates" section for the data
// model this screen is bound to.
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { plmApi } from "@/lib/nexuscore-api";
import { customerApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";
import { LookupField } from "@/components/legacy-erp/lookup-field";
import { LookupDialog } from "@/components/legacy-erp/lookup-dialog";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Plus, Trash2, Save, FilePlus2, Copy, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface LineRow {
  clientId: string;
  __rowId: string | null;
  previousOrderNo: string;
  sampleTypeId: string;
  activityTypeId: string;
  mandatory: boolean;
  selectSampleType: boolean;
  duration: string;
  resourceEmployeeId: string;
  quantity: string;
  explanation: string;
  specialCode: string;
  inUse: boolean;
}

const uid = () => Math.random().toString(36).slice(2, 10);
const emptyLine = (): LineRow => ({
  clientId: uid(), __rowId: null, previousOrderNo: "", sampleTypeId: "", activityTypeId: "",
  mandatory: false, selectSampleType: false, duration: "", resourceEmployeeId: "",
  quantity: "", explanation: "", specialCode: "", inUse: true,
});

const emptyHeader = {
  id: "", code: "", name: "", description: "", isActive: true,
  departmentId: "", customerId: "", styleCardId: "", styleGroup: "", brand: "", styleDepartmentId: "", styleSpecialCode: "",
};

function HField({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={cn("space-y-0.5", wide && "col-span-2")}>
      <Label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

const inCls = "h-7 text-[13px]";
const CELL = "border-r border-b border-border px-1.5 py-0.5 text-[12px]";
const HEAD = "sticky top-0 z-10 border-r border-b border-border px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted whitespace-nowrap";

export default function PlmTemplateScreen() {
  const [header, setHeader] = useState<any>(emptyHeader);
  const [customerLabel, setCustomerLabel] = useState("");
  const [styleLabel, setStyleLabel] = useState("");
  const [lines, setLines] = useState<LineRow[]>(() => [emptyLine()]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmDeleteRow, setConfirmDeleteRow] = useState<string | null>(null);
  const [noLookupOpen, setNoLookupOpen] = useState(false);

  const [departments, setDepartments] = useState<any[]>([]);
  const [sampleTypes, setSampleTypes] = useState<any[]>([]);
  const [activityTypes, setActivityTypes] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [deps, st, at, emp] = await Promise.all([
          plmApi.departments.list(), plmApi.sampleTypes.list(), plmApi.activityTypes.list(), plmApi.employees.list(),
        ]);
        setDepartments(Array.isArray(deps) ? deps : (deps as any)?.data || []);
        setSampleTypes(Array.isArray(st) ? st : (st as any)?.data || []);
        setActivityTypes(Array.isArray(at) ? at : (at as any)?.data || []);
        setEmployees(Array.isArray(emp) ? emp : (emp as any)?.data || []);
      } catch (e: any) {
        toast.error(e.message || "Failed to load lookups");
      }
    })();
  }, []);

  const sampleTypeById = useMemo(() => new Map(sampleTypes.map((s) => [s.id, s])), [sampleTypes]);
  const activityTypeById = useMemo(() => new Map(activityTypes.map((a) => [a.id, a])), [activityTypes]);
  const employeeById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  const hydrateFromRecord = (t: any) => {
    setHeader({
      id: t.id, code: t.code || "", name: t.name || "", description: t.description || "", isActive: t.isActive ?? true,
      departmentId: t.departmentId || "", customerId: t.customerId || "", styleCardId: t.styleCardId || "",
      styleGroup: t.styleGroup || "", brand: t.brand || "", styleDepartmentId: t.styleDepartmentId || "", styleSpecialCode: t.styleSpecialCode || "",
    });
    setCustomerLabel(t.customer?.name || "");
    setStyleLabel(t.styleCard ? `${t.styleCard.styleNumber} — ${t.styleCard.title}` : "");
    const ls = Array.isArray(t.lines) ? t.lines : [];
    setLines(ls.length ? ls.map((l: any) => ({
      clientId: uid(), __rowId: l.id,
      previousOrderNo: l.previousOrderNo || "", sampleTypeId: l.sampleTypeId || "", activityTypeId: l.activityTypeId || "",
      mandatory: !!l.mandatory, selectSampleType: !!l.selectSampleType,
      duration: l.duration != null ? String(l.duration) : "", resourceEmployeeId: l.resourceEmployeeId || "",
      quantity: l.quantity != null ? String(l.quantity) : "", explanation: l.explanation || "", specialCode: l.specialCode || "", inUse: l.inUse ?? true,
    })) : [emptyLine()]);
  };

  const openTemplate = async (id: string) => {
    setLoading(true);
    try {
      const t = await plmApi.templates.get(id);
      hydrateFromRecord(t);
    } catch (e: any) {
      toast.error(e.message || "Failed to load template");
    } finally {
      setLoading(false);
    }
  };

  const startNew = () => {
    setHeader(emptyHeader);
    setCustomerLabel("");
    setStyleLabel("");
    setLines([emptyLine()]);
  };

  const set = (patch: any) => setHeader((h: any) => ({ ...h, ...patch }));

  const addRow = () => setLines((prev) => [...prev, emptyLine()]);
  const removeRow = (clientId: string) => setLines((prev) => prev.filter((r) => r.clientId !== clientId));
  const updateRow = (clientId: string, patch: Partial<LineRow>) =>
    setLines((prev) => prev.map((r) => (r.clientId === clientId ? { ...r, ...patch } : r)));

  const isBlank = (r: LineRow) => !r.sampleTypeId && !r.activityTypeId && !r.previousOrderNo && !r.explanation;

  const save = async () => {
    if (!header.code.trim()) return toast.error("No (Template Code) is required");
    if (!header.name.trim()) return toast.error("Name required");
    setSaving(true);
    try {
      const user = getCurrentUser();
      const payload = {
        code: header.code.trim(),
        name: header.name.trim(),
        description: header.description || null,
        isActive: header.isActive,
        departmentId: header.departmentId || null,
        customerId: header.customerId || null,
        styleCardId: header.styleCardId || null,
        styleGroup: header.styleGroup || null,
        brand: header.brand || null,
        styleDepartmentId: header.styleDepartmentId || null,
        styleSpecialCode: header.styleSpecialCode || null,
        // Required-but-unused-by-this-screen legacy fields on the generic template registry —
        // defaulted rather than dropped, so the column's NOT NULL constraint stays satisfied.
        type: "style-card",
        structure: {},
        branchId: user?.branchId,
      };
      let id = header.id;
      if (id) {
        await plmApi.templates.update(id, payload);
      } else {
        const created: any = await plmApi.templates.create(payload);
        id = created.id;
      }
      const realLines = lines.filter((r) => !isBlank(r));
      const linesPayload = realLines.map((r, i) => ({
        sequence: i,
        previousOrderNo: r.previousOrderNo || null,
        sampleTypeId: r.sampleTypeId || null,
        activityTypeId: r.activityTypeId || null,
        mandatory: r.mandatory,
        selectSampleType: r.selectSampleType,
        duration: r.duration === "" ? null : Number(r.duration),
        resourceEmployeeId: r.resourceEmployeeId || null,
        quantity: r.quantity === "" ? null : Number(r.quantity),
        explanation: r.explanation || null,
        specialCode: r.specialCode || null,
        inUse: r.inUse,
      }));
      await plmApi.templates.upsertLines(id, linesPayload);
      toast.success("Saved");
      await openTemplate(id);
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const duplicate = async () => {
    if (!header.id) return;
    try {
      const copy: any = await plmApi.templates.duplicate(header.id);
      toast.success("Duplicated");
      await openTemplate(copy.id);
    } catch (e: any) {
      toast.error(e.message || "Failed to duplicate");
    }
  };

  const remove = async () => {
    if (!header.id) return;
    try {
      await plmApi.templates.delete(header.id);
      toast.success("Deleted");
      startNew();
    } catch (e: any) {
      toast.error(e.message || "Failed to delete");
    }
  };

  // Visual grouping by Sample Type — consecutive rows sharing the same sampleTypeId only show
  // the Sample Type / Sample Type Explanation values on the group's first row, matching the
  // reference screenshot. Reuses the existing per-line sampleTypeId, no separate group entity.
  const groupStarts = useMemo(() => {
    const starts = new Set<string>();
    let lastType: string | null = null;
    for (const r of lines) {
      if (r.sampleTypeId && r.sampleTypeId !== lastType) { starts.add(r.clientId); lastType = r.sampleTypeId; }
      else if (!r.sampleTypeId) lastType = null;
    }
    return starts;
  }, [lines]);

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col overflow-hidden bg-background text-sm">
      {/* No / top bar */}
      <div className="flex items-center gap-3 border-b bg-card px-3 py-2">
        <div className="w-72 space-y-0.5">
          <Label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">No</Label>
          <InputGroup className="h-7 cursor-text">
            <InputGroupInput
              value={header.code}
              onChange={(e) => set({ code: e.target.value })}
              placeholder="e.g. TAO NEW Merchandising"
              className="text-[13px]"
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton size="icon-xs" aria-label="Find template" onClick={() => setNoLookupOpen(true)}>
                <Search className="h-3.5 w-3.5" />
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          <LookupDialog
            open={noLookupOpen}
            onOpenChange={setNoLookupOpen}
            title="PLM Template"
            fetchOptions={(t) => plmApi.templates.list({}).then((r: any) => (Array.isArray(r) ? r : r?.data || []).filter((x: any) =>
              !t || x.code?.toLowerCase().includes(t.toLowerCase()) || x.name?.toLowerCase().includes(t.toLowerCase())))}
            getLabel={(o: any) => `${o.code || "(no code)"} — ${o.name}`}
            getValue={(o: any) => o.id}
            onSelect={(o: any) => openTemplate(o.id)}
          />
        </div>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={startNew}><FilePlus2 className="h-3.5 w-3.5 mr-1.5" />New</Button>
        <Button variant="outline" size="sm" onClick={duplicate} disabled={!header.id}><Copy className="h-3.5 w-3.5 mr-1.5" />Duplicate</Button>
        <Button variant="outline" size="sm" className="text-destructive" onClick={remove} disabled={!header.id}><Trash2 className="h-3.5 w-3.5 mr-1.5" />Delete</Button>
        <Button size="sm" onClick={save} disabled={saving || loading}><Save className="h-3.5 w-3.5 mr-1.5" />{saving ? "Saving..." : "Save"}</Button>
      </div>

      {/* General */}
      <div className="border-b bg-card px-3 py-2">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">General</p>
        <div className="grid grid-cols-6 gap-x-3 gap-y-1.5">
          <HField label="Explanation" wide>
            <Input className={inCls} value={header.name} onChange={(e) => set({ name: e.target.value })} placeholder="Template name" />
          </HField>
          <HField label="Department">
            <Select value={header.departmentId || "none"} onValueChange={(v) => set({ departmentId: v === "none" ? "" : v })}>
              <SelectTrigger className={inCls}><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent><SelectItem value="none">—</SelectItem>{departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.code} — {d.name}</SelectItem>)}</SelectContent>
            </Select>
          </HField>
          <HField label="Customer">
            <LookupField
              label="" displayValue={customerLabel}
              fetchOptions={(t) => customerApi.getCustomers({ search: t }).then((r: any) => (Array.isArray(r) ? r : r?.data || []))}
              getLabel={(o: any) => o.name} getValue={(o: any) => o.id}
              onSelect={(o: any) => { set({ customerId: String(o.id) }); setCustomerLabel(o.name); }}
            />
          </HField>
          <HField label="Style">
            <LookupField
              label="" displayValue={styleLabel}
              fetchOptions={(t) => plmApi.styleCards.list({ search: t }).then((r: any) => r?.data || [])}
              getLabel={(o: any) => `${o.styleNumber} — ${o.title}`} getValue={(o: any) => o.id}
              onSelect={(o: any) => { set({ styleCardId: String(o.id) }); setStyleLabel(`${o.styleNumber} — ${o.title}`); }}
            />
          </HField>
          <HField label="Style Group">
            <Input className={inCls} value={header.styleGroup} onChange={(e) => set({ styleGroup: e.target.value })} />
          </HField>
          <HField label="Brand">
            <Input className={inCls} value={header.brand} onChange={(e) => set({ brand: e.target.value })} />
          </HField>
          <HField label="Style Department">
            <Select value={header.styleDepartmentId || "none"} onValueChange={(v) => set({ styleDepartmentId: v === "none" ? "" : v })}>
              <SelectTrigger className={inCls}><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent><SelectItem value="none">—</SelectItem>{departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.code} — {d.name}</SelectItem>)}</SelectContent>
            </Select>
          </HField>
          <HField label="Style Special Code">
            <Input className={inCls} value={header.styleSpecialCode} onChange={(e) => set({ styleSpecialCode: e.target.value })} />
          </HField>
          <div className="flex items-end gap-1.5 pb-0.5">
            <Switch checked={header.isActive} onCheckedChange={(v) => set({ isActive: v })} />
            <Label className="text-[11px]">In Use</Label>
          </div>
        </div>
      </div>

      {/* Detail */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Detail</span>
          <Button variant="outline" size="sm" className="h-6 text-[11px]" onClick={addRow}><Plus className="h-3 w-3 mr-1" />Add Row</Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-max min-w-full border-collapse text-left">
            <thead>
              <tr>
                <th className={cn(HEAD, "w-14 text-right")}>Item</th>
                <th className={cn(HEAD, "w-24")}>Prev Order No</th>
                <th className={cn(HEAD, "w-16")}>Sample Type</th>
                <th className={cn(HEAD, "w-40")}>Sample Type Explanation</th>
                <th className={cn(HEAD, "w-28")}>Process</th>
                <th className={cn(HEAD, "w-56")}>Activity Explanation</th>
                <th className={cn(HEAD, "w-16 text-center")}>Mandatory</th>
                <th className={cn(HEAD, "w-16 text-center")}>Select Sample Type</th>
                <th className={cn(HEAD, "w-16 text-right")}>Duration</th>
                <th className={cn(HEAD, "w-20")}>Resource</th>
                <th className={cn(HEAD, "w-44")}>Resource Explanation</th>
                <th className={cn(HEAD, "w-20 text-right")}>Quantity</th>
                <th className={cn(HEAD, "w-32")}>Explanation</th>
                <th className={cn(HEAD, "w-24")}>Special Code</th>
                <th className={cn(HEAD, "w-14 text-center")}>In Use</th>
                <th className={cn(HEAD, "w-8")} />
              </tr>
            </thead>
            <tbody>
              {lines.map((r, idx) => {
                const showGroup = groupStarts.has(r.clientId);
                const sampleType = sampleTypeById.get(r.sampleTypeId);
                const activityType = activityTypeById.get(r.activityTypeId);
                const resourceEmp = employeeById.get(r.resourceEmployeeId);
                return (
                  <tr key={r.clientId} className={cn("group hover:bg-primary/5", showGroup && "bg-muted/20")}>
                    <td className={cn(CELL, "text-right tabular-nums text-muted-foreground")}>{idx + 1}</td>
                    <td className={CELL}>
                      <Input className={cn(inCls, "border-0 shadow-none px-1")} value={r.previousOrderNo} onChange={(e) => updateRow(r.clientId, { previousOrderNo: e.target.value })} />
                    </td>
                    <td className={CELL}>
                      <Select value={r.sampleTypeId || "none"} onValueChange={(v) => updateRow(r.clientId, { sampleTypeId: v === "none" ? "" : v })}>
                        <SelectTrigger className={cn(inCls, "border-0 shadow-none px-1", !showGroup && "text-transparent")}><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent><SelectItem value="none">—</SelectItem>{sampleTypes.map((s) => <SelectItem key={s.id} value={s.id}>{s.code}</SelectItem>)}</SelectContent>
                      </Select>
                    </td>
                    <td className={cn(CELL, "truncate text-muted-foreground")}>{showGroup ? (sampleType?.name || sampleType?.description || "") : ""}</td>
                    <td className={cn(CELL, "truncate text-muted-foreground")} title={activityType?.process ? `${activityType.process.code}-${activityType.process.name}` : ""}>
                      {activityType?.process ? `${activityType.process.code}-${activityType.process.name}` : "—"}
                    </td>
                    <td className={CELL}>
                      <Select value={r.activityTypeId || "none"} onValueChange={(v) => updateRow(r.clientId, { activityTypeId: v === "none" ? "" : v })}>
                        <SelectTrigger className={cn(inCls, "border-0 shadow-none px-1")}><SelectValue placeholder="Select activity..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">—</SelectItem>
                          {activityTypes.map((a) => <SelectItem key={a.id} value={a.id}>{a.code}-{a.explanation || a.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className={cn(CELL, "text-center")}>
                      <Switch className="scale-75" checked={r.mandatory} onCheckedChange={(v) => updateRow(r.clientId, { mandatory: v })} />
                    </td>
                    <td className={cn(CELL, "text-center")}>
                      <Switch className="scale-75" checked={r.selectSampleType} onCheckedChange={(v) => updateRow(r.clientId, { selectSampleType: v })} />
                    </td>
                    <td className={CELL}>
                      <Input type="number" className={cn(inCls, "border-0 shadow-none px-1 text-right tabular-nums")} value={r.duration} onChange={(e) => updateRow(r.clientId, { duration: e.target.value })} />
                    </td>
                    <td className={CELL}>
                      <Select value={r.resourceEmployeeId || "none"} onValueChange={(v) => updateRow(r.clientId, { resourceEmployeeId: v === "none" ? "" : v })}>
                        <SelectTrigger className={cn(inCls, "border-0 shadow-none px-1")}><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent><SelectItem value="none">—</SelectItem>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.employeeNumber}</SelectItem>)}</SelectContent>
                      </Select>
                    </td>
                    <td className={cn(CELL, "truncate text-muted-foreground")}>{resourceEmp?.name || ""}</td>
                    <td className={CELL}>
                      <Input type="number" className={cn(inCls, "border-0 shadow-none px-1 text-right tabular-nums")} value={r.quantity} onChange={(e) => updateRow(r.clientId, { quantity: e.target.value })} />
                    </td>
                    <td className={CELL}>
                      <Input className={cn(inCls, "border-0 shadow-none px-1")} value={r.explanation} onChange={(e) => updateRow(r.clientId, { explanation: e.target.value })} />
                    </td>
                    <td className={CELL}>
                      <Input className={cn(inCls, "border-0 shadow-none px-1")} value={r.specialCode} onChange={(e) => updateRow(r.clientId, { specialCode: e.target.value })} />
                    </td>
                    <td className={cn(CELL, "text-center")}>
                      <Switch className="scale-75" checked={r.inUse} onCheckedChange={(v) => updateRow(r.clientId, { inUse: v })} />
                    </td>
                    <td className={cn(CELL, "px-0.5")}>
                      <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => setConfirmDeleteRow(r.clientId)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <AlertDialog open={!!confirmDeleteRow} onOpenChange={(o) => !o && setConfirmDeleteRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete line</AlertDialogTitle>
            <AlertDialogDescription>Remove this detail row? This takes effect when you Save.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => { if (confirmDeleteRow) removeRow(confirmDeleteRow); setConfirmDeleteRow(null); }}>Yes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
