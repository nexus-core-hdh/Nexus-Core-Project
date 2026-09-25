"use client";

import { useEffect, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { Building, Plus, Pencil, Trash2, Save, Eye } from "lucide-react";

import { ModuleHeader } from "@/components/legacy-erp/module-header";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { DataTable } from "@/components/shared/data-table/data-table";
import { StatusBadge } from "@/components/finance-erp/status-badge";
import { ConfirmDialog } from "@/components/finance-erp/confirm-dialog";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { FormTextField, FormSelectField } from "@/components/forms/form-field";

import { StatusFilter } from "../_components/status-filter";
import type { Branch, Currency } from "@/lib/finance-erp/mock/master-data";
import { CURRENCIES } from "@/lib/finance-erp/mock/master-data";
import { companyProfileApi, FISCAL_YEAR_OPTIONS, DEFAULT_COMPANY_PROFILE, type CompanyProfile } from "@/lib/finance-erp/settings/company-profile";
import { assertNotDuplicate } from "@/lib/finance-erp/utils/validation";
import { makeId } from "@/lib/finance-erp/mock/create-store";

const EMPTY_BRANCH: Branch = { id: "", code: "", name: "", address: "", manager: "", status: "Active" };

export default function CompanyProfilePage() {
  const [profile, setProfile] = useState<CompanyProfile>(DEFAULT_COMPANY_PROFILE);
  const [savingProfile, setSavingProfile] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewing, setViewing] = useState<Branch | null>(null);
  const [editing, setEditing] = useState<Branch>(EMPTY_BRANCH);
  const [deleteTarget, setDeleteTarget] = useState<Branch | null>(null);
  const [savingBranch, setSavingBranch] = useState(false);

  const loadBranches = () => companyProfileApi.getBranches().then(setBranches);
  useEffect(() => {
    companyProfileApi.getProfile().then(setProfile);
    loadBranches();
  }, []);

  const saveProfile = async () => {
    if (!profile.companyName.trim()) return toast.error("Company Name is required.");
    if (!profile.email.trim()) return toast.error("Email is required.");
    setSavingProfile(true);
    try {
      const saved = await companyProfileApi.updateProfile(profile);
      setProfile(saved);
      toast.success("Company profile saved");
    } finally {
      setSavingProfile(false);
    }
  };

  const openCreate = () => { setEditing({ ...EMPTY_BRANCH, id: makeId("br") }); setDialogOpen(true); };
  const openEdit = (b: Branch) => { setEditing(b); setDialogOpen(true); };

  const saveBranch = async () => {
    if (savingBranch) return;
    setSavingBranch(true);
    try {
      if (!editing.code.trim() || !editing.name.trim()) return toast.error("Branch Code and Name are required.");
      const existing = branches;
      const exists = existing.some((b) => b.id === editing.id);
      assertNotDuplicate(existing, "code", editing.code, "Branch code", "id", exists ? editing.id : undefined);
      if (exists) await companyProfileApi.updateBranch(editing.id, editing);
      else await companyProfileApi.createBranch(editing);
      toast.success(exists ? "Branch updated" : "Branch created");
      setDialogOpen(false);
      loadBranches();
    } catch (e: any) {
      toast.error(e.message || "Failed to save branch");
    } finally {
      setSavingBranch(false);
    }
  };

  const deleteBranch = async () => {
    if (!deleteTarget) return;
    await companyProfileApi.deleteBranch(deleteTarget.id);
    toast.success("Branch removed");
    loadBranches();
  };

  const columns: ColumnDef<Branch>[] = [
    { accessorKey: "code", header: "Branch Code", cell: ({ row }) => <span className="font-mono text-xs">{row.original.code}</span> },
    { accessorKey: "name", header: "Branch Name", cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
    { accessorKey: "manager", header: "Manager" },
    { accessorKey: "address", header: "Address" },
    { accessorKey: "status", header: "Status", filterFn: "equalsString", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    {
      id: "actions", enableHiding: false, size: 120,
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" title="View branch" aria-label="View branch" onClick={() => setViewing(row.original)}><Eye className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit branch" aria-label="Edit branch" onClick={() => openEdit(row.original)}><Pencil className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Delete branch" aria-label="Delete branch" onClick={() => setDeleteTarget(row.original)}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-6 lg:p-8">
      <LegacyErpBreadcrumb trail={[{ label: "Finance", href: "/dashboard/finance-erp" }, { label: "Finance Settings" }, { label: "Company Profile / Multi-Branch" }]} />
      <ModuleHeader icon={Building} title="Company Profile / Multi-Branch" subtitle="Company identity and branch network configuration" />

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Company Profile</TabsTrigger>
          <TabsTrigger value="branches">Branches</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardContent className="grid grid-cols-1 gap-4 pt-6 sm:grid-cols-2">
              <FormTextField label="Company Name" value={profile.companyName} onChange={(v) => setProfile({ ...profile, companyName: v })} span="wide" />
              <FormTextField label="Registration Number" value={profile.registrationNumber} onChange={(v) => setProfile({ ...profile, registrationNumber: v })} />
              <FormTextField label="Tax Number" value={profile.taxNumber} onChange={(v) => setProfile({ ...profile, taxNumber: v })} />
              <FormTextField label="Address" value={profile.address} onChange={(v) => setProfile({ ...profile, address: v })} span="wide" />
              <FormTextField label="Phone" value={profile.phone} onChange={(v) => setProfile({ ...profile, phone: v })} />
              <FormTextField label="Email" type="email" value={profile.email} onChange={(v) => setProfile({ ...profile, email: v })} />
              <FormSelectField
                label="Currency" value={profile.currency} onChange={(v) => setProfile({ ...profile, currency: v })}
                options={CURRENCIES.map((c: Currency) => ({ value: c.code, label: `${c.code} - ${c.name}` }))}
              />
              <FormSelectField
                label="Fiscal Year" value={profile.fiscalYear} onChange={(v) => setProfile({ ...profile, fiscalYear: v })}
                options={FISCAL_YEAR_OPTIONS.map((o) => ({ value: o, label: o }))}
              />
              <div className="sm:col-span-2">
                <Button size="sm" onClick={saveProfile} disabled={savingProfile}><Save className="h-3.5 w-3.5 mr-1.5" />Save</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="branches" className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={openCreate}><Plus className="h-3.5 w-3.5 mr-1.5" />Add Branch</Button>
          </div>
          <DataTable
            columns={columns} data={branches} storageKey="financeBranchesGrid" searchColumn="name" searchPlaceholder="Search branches..."
            toolbarExtra={(table) => <StatusFilter table={table} options={["Active", "Inactive"]} />}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent dismissOnOutside dismissOnEscape>
          <DialogHeader>
            <DialogTitle>{branches.some((b) => b.id === editing.id) ? "Edit Branch" : "Add Branch"}</DialogTitle>
            <DialogDescription>Branch code must be unique.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormTextField label="Branch Code" value={editing.code} onChange={(v) => setEditing({ ...editing, code: v })} />
            <FormTextField label="Branch Name" value={editing.name} onChange={(v) => setEditing({ ...editing, name: v })} />
            <FormTextField label="Address" value={editing.address} onChange={(v) => setEditing({ ...editing, address: v })} span="wide" />
            <FormTextField label="Manager" value={editing.manager} onChange={(v) => setEditing({ ...editing, manager: v })} />
            <FormSelectField
              label="Status" value={editing.status} onChange={(v) => setEditing({ ...editing, status: v as "Active" | "Inactive" })}
              options={[{ value: "Active", label: "Active" }, { value: "Inactive", label: "Inactive" }]}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveBranch} disabled={savingBranch}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent dismissOnOutside dismissOnEscape>
          <DialogHeader>
            <DialogTitle>{viewing?.name}</DialogTitle>
            <DialogDescription>Branch details</DialogDescription>
          </DialogHeader>
          {viewing && (
            <div className="space-y-2 text-sm">
              <div><span className="text-muted-foreground">Code:</span> <span className="font-mono">{viewing.code}</span></div>
              <div><span className="text-muted-foreground">Address:</span> {viewing.address}</div>
              <div><span className="text-muted-foreground">Manager:</span> {viewing.manager}</div>
              <div><span className="text-muted-foreground">Status:</span> <StatusBadge status={viewing.status} /></div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete branch?"
        description={`This will permanently remove ${deleteTarget?.name ?? "this branch"}.`}
        confirmLabel="Delete"
        onConfirm={deleteBranch}
      />
    </div>
  );
}
