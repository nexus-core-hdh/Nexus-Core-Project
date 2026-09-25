"use client";

import { useEffect, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { GitBranch, Plus, Pencil, Trash2, ArrowRight } from "lucide-react";

import { ModuleHeader } from "@/components/legacy-erp/module-header";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { DataTable } from "@/components/shared/data-table/data-table";
import { StatusBadge } from "@/components/finance-erp/status-badge";
import { ConfirmDialog } from "@/components/finance-erp/confirm-dialog";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { FormSelectField } from "@/components/forms/form-field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { StatusFilter } from "../_components/status-filter";
import {
  approvalWorkflowsApi, APPROVAL_DOCUMENT_TYPES, APPROVER_OPTIONS, type ApprovalWorkflow, type ApprovalLevel,
} from "@/lib/finance-erp/settings/approval-workflows";
import { makeId } from "@/lib/finance-erp/mock/create-store";
import { formatAmount } from "@/lib/finance-erp/utils/format";

const EMPTY_LEVEL: ApprovalLevel = { level: 1, approver: APPROVER_OPTIONS[0], minAmount: 0, maxAmount: 0 };
const EMPTY: ApprovalWorkflow = { id: "", documentType: "Purchase Order", levels: [EMPTY_LEVEL], status: "Active" };

export default function ApprovalWorkflowsPage() {
  const [rows, setRows] = useState<ApprovalWorkflow[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ApprovalWorkflow>(EMPTY);
  const [deleteTarget, setDeleteTarget] = useState<ApprovalWorkflow | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => approvalWorkflowsApi.list().then(setRows);
  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing({ ...EMPTY, id: makeId("wf"), levels: [{ ...EMPTY_LEVEL }] }); setDialogOpen(true); };
  const openEdit = (r: ApprovalWorkflow) => { setEditing(r); setDialogOpen(true); };

  const addLevel = () => setEditing((e) => ({ ...e, levels: [...e.levels, { level: e.levels.length + 1, approver: APPROVER_OPTIONS[0], minAmount: 0, maxAmount: 0 }] }));
  const removeLevel = (i: number) => setEditing((e) => ({ ...e, levels: e.levels.filter((_, idx) => idx !== i).map((l, idx) => ({ ...l, level: idx + 1 })) }));
  const patchLevel = (i: number, patch: Partial<ApprovalLevel>) => setEditing((e) => ({ ...e, levels: e.levels.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) }));

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      for (const l of editing.levels) {
        if (l.minAmount < 0 || l.maxAmount < 0) return toast.error(`Level ${l.level}: amounts cannot be negative.`);
        if (l.maxAmount > 0 && l.minAmount > l.maxAmount) return toast.error(`Level ${l.level}: Min Amount cannot exceed Max Amount.`);
      }
      const exists = rows.some((r) => r.id === editing.id);
      if (exists) await approvalWorkflowsApi.update(editing.id, editing);
      else await approvalWorkflowsApi.create(editing);
      toast.success(exists ? "Workflow updated" : "Workflow created");
      setDialogOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed to save workflow");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    await approvalWorkflowsApi.remove(deleteTarget.id);
    toast.success("Workflow removed");
    load();
  };

  const columns: ColumnDef<ApprovalWorkflow>[] = [
    { accessorKey: "documentType", header: "Document Type", cell: ({ row }) => <span className="font-medium">{row.original.documentType}</span> },
    {
      id: "chain", header: "Approval Chain",
      cell: ({ row }) => (
        <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          {row.original.levels.map((l, i) => (
            <span key={i} className="flex items-center gap-1">
              <span className="rounded bg-muted px-1.5 py-0.5 text-foreground">{l.approver.split(" (")[0]}</span>
              {i < row.original.levels.length - 1 && <ArrowRight className="h-3 w-3" />}
            </span>
          ))}
        </div>
      ),
    },
    { accessorKey: "status", header: "Status", filterFn: "equalsString", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    {
      id: "actions", enableHiding: false, size: 90,
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit workflow" aria-label="Edit workflow" onClick={() => openEdit(row.original)}><Pencil className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Delete workflow" aria-label="Delete workflow" onClick={() => setDeleteTarget(row.original)}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-6 lg:p-8">
      <LegacyErpBreadcrumb trail={[{ label: "Finance", href: "/dashboard/finance-erp" }, { label: "Finance Settings" }, { label: "Approval Workflows" }]} />
      <ModuleHeader
        icon={GitBranch}
        title="Approval Workflows"
        subtitle="Multi-level approval chains per document type, e.g. Finance Officer → Finance Manager → CFO"
        actions={<Button size="sm" onClick={openCreate}><Plus className="h-3.5 w-3.5 mr-1.5" />Add Workflow</Button>}
      />
      <DataTable
        columns={columns} data={rows} storageKey="financeApprovalWorkflowsGrid" searchColumn="documentType" searchPlaceholder="Search document types..."
        toolbarExtra={(table) => <StatusFilter table={table} options={["Active", "Inactive"]} />}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent dismissOnOutside dismissOnEscape className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{rows.some((r) => r.id === editing.id) ? "Edit Approval Workflow" : "Add Approval Workflow"}</DialogTitle>
            <DialogDescription>Define the approval chain and amount ranges for each level.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <FormSelectField
              label="Document Type" value={editing.documentType} onChange={(v) => setEditing({ ...editing, documentType: v as ApprovalWorkflow["documentType"] })}
              options={APPROVAL_DOCUMENT_TYPES.map((d) => ({ value: d, label: d }))}
            />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Approval Levels</span>
                <Button type="button" variant="outline" size="sm" onClick={addLevel}><Plus className="h-3.5 w-3.5 mr-1" />Add Level</Button>
              </div>
              {editing.levels.map((level, i) => (
                <div key={i} className="grid grid-cols-1 gap-2 rounded-md border p-2.5 sm:grid-cols-[3rem_1fr_1fr_1fr_2rem]">
                  <div className="flex items-center justify-center rounded bg-muted text-xs font-semibold">L{level.level}</div>
                  <Select value={level.approver} onValueChange={(v) => patchLevel(i, { approver: v })}>
                    <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {APPROVER_OPTIONS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input type="number" placeholder="Min Amount" value={level.minAmount} onChange={(e) => patchLevel(i, { minAmount: Number(e.target.value) || 0 })} className="h-9" />
                  <Input type="number" placeholder="Max Amount" value={level.maxAmount} onChange={(e) => patchLevel(i, { maxAmount: Number(e.target.value) || 0 })} className="h-9" />
                  <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-destructive" title="Remove level" aria-label="Remove level" disabled={editing.levels.length <= 1} onClick={() => removeLevel(i)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                {editing.levels.map((l) => `${formatAmount(l.minAmount)} - ${formatAmount(l.maxAmount)} → ${l.approver.split(" (")[0]}`).join(" · ")}
              </p>
            </div>
            <FormSelectField
              label="Status" value={editing.status} onChange={(v) => setEditing({ ...editing, status: v as "Active" | "Inactive" })}
              options={[{ value: "Active", label: "Active" }, { value: "Inactive", label: "Inactive" }]}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete workflow?"
        description={`This will permanently remove the "${deleteTarget?.documentType ?? ""}" approval workflow.`}
        confirmLabel="Delete"
        onConfirm={remove}
      />
    </div>
  );
}
