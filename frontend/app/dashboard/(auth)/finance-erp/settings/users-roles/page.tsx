"use client";

import { useEffect, useMemo, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { UsersRound, Plus, Pencil, Trash2, ShieldCheck, Save } from "lucide-react";

import { ModuleHeader } from "@/components/legacy-erp/module-header";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { DataTable } from "@/components/shared/data-table/data-table";
import { StatusBadge } from "@/components/finance-erp/status-badge";
import { ConfirmDialog } from "@/components/finance-erp/confirm-dialog";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { FormTextField, FormSelectField, FieldLabel } from "@/components/forms/form-field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { StatusFilter } from "../_components/status-filter";
import { BRANCHES, branchName } from "@/lib/finance-erp/mock/master-data";
import {
  usersRolesApi, FINANCE_ROLES, PERMISSION_MODULES, PERMISSION_ACTIONS, defaultMatrixFor,
  type FinanceUser, type FinanceRoleName, type PermissionMatrix,
} from "@/lib/finance-erp/settings/users-roles";
import { makeId } from "@/lib/finance-erp/mock/create-store";

const EMPTY_USER: FinanceUser = { id: "", name: "", email: "", role: "Viewer", branchId: BRANCHES[0].id, status: "Active" };

export default function UsersRolesPage() {
  const [users, setUsers] = useState<FinanceUser[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FinanceUser>(EMPTY_USER);
  const [deleteTarget, setDeleteTarget] = useState<FinanceUser | null>(null);
  const [savingUser, setSavingUser] = useState(false);

  const [matrixRole, setMatrixRole] = useState<FinanceRoleName>("Finance Manager");
  const [matrices, setMatrices] = useState<Record<FinanceRoleName, PermissionMatrix>>(() =>
    FINANCE_ROLES.reduce((acc, r) => { acc[r.name] = defaultMatrixFor(r.name); return acc; }, {} as Record<FinanceRoleName, PermissionMatrix>),
  );

  const load = () => {
    setLoading(true);
    usersRolesApi.getUsers().then(setUsers).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    users.forEach((u) => { counts[u.role] = (counts[u.role] ?? 0) + 1; });
    return counts;
  }, [users]);

  const openCreate = () => { setEditing({ ...EMPTY_USER, id: makeId("usr") }); setDialogOpen(true); };
  const openEdit = (u: FinanceUser) => { setEditing(u); setDialogOpen(true); };

  const saveUser = async () => {
    if (savingUser) return;
    setSavingUser(true);
    try {
      if (!editing.name.trim()) return toast.error("Name is required.");
      if (!editing.email.trim()) return toast.error("Email is required.");
      const exists = users.some((u) => u.id === editing.id);
      if (exists) await usersRolesApi.updateUser(editing.id, editing);
      else await usersRolesApi.createUser(editing);
      toast.success(exists ? "User updated" : "User created");
      setDialogOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed to save user");
    } finally {
      setSavingUser(false);
    }
  };

  const deleteUser = async () => {
    if (!deleteTarget) return;
    await usersRolesApi.deleteUser(deleteTarget.id);
    toast.success("User removed");
    load();
  };

  const toggleCell = (mod: (typeof PERMISSION_MODULES)[number], action: (typeof PERMISSION_ACTIONS)[number]) => {
    setMatrices((prev) => ({
      ...prev,
      [matrixRole]: {
        ...prev[matrixRole],
        [mod]: { ...prev[matrixRole][mod], [action]: !prev[matrixRole][mod][action] },
      },
    }));
  };

  const columns: ColumnDef<FinanceUser>[] = [
    { accessorKey: "name", header: "Name", cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
    { accessorKey: "email", header: "Email" },
    { accessorKey: "role", header: "Role", cell: ({ row }) => <StatusBadge status={row.original.role} /> },
    { accessorKey: "branchId", header: "Branch", cell: ({ row }) => branchName(row.original.branchId) },
    { accessorKey: "status", header: "Status", filterFn: "equalsString", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    {
      id: "actions", enableHiding: false, size: 90,
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit user" aria-label="Edit user" onClick={() => openEdit(row.original)}><Pencil className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Delete user" aria-label="Delete user" onClick={() => setDeleteTarget(row.original)}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-6 lg:p-8">
      <LegacyErpBreadcrumb trail={[{ label: "Finance", href: "/dashboard/finance-erp" }, { label: "Finance Settings" }, { label: "Users & Roles" }]} />
      <ModuleHeader icon={UsersRound} title="Users & Roles" subtitle="Manage Finance module users, roles and the role permission matrix" />

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="permissions">Permissions</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={openCreate}><Plus className="h-3.5 w-3.5 mr-1.5" />Add User</Button>
          </div>
          <DataTable
            columns={columns} data={users} storageKey="financeUsersGrid" searchColumn="name" searchPlaceholder="Search users..."
            toolbarExtra={(table) => <StatusFilter table={table} options={["Active", "Inactive"]} />}
          />
        </TabsContent>

        <TabsContent value="roles" className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {FINANCE_ROLES.map((r) => (
              <Card key={r.name}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" />{r.name}</span>
                    <StatusBadge status={`${roleCounts[r.name] ?? 0} users`} className="border-0 bg-muted text-muted-foreground" />
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">{r.description}</CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="permissions" className="space-y-4">
          <div className="flex items-center gap-3">
            <FieldLabel>Role</FieldLabel>
            <Select value={matrixRole} onValueChange={(v) => setMatrixRole(v as FinanceRoleName)}>
              <SelectTrigger className="h-9 w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FINANCE_ROLES.map((r) => <SelectItem key={r.name} value={r.name}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" className="ml-auto" onClick={() => toast.success(`Permissions saved for ${matrixRole}`)}>
              <Save className="h-3.5 w-3.5 mr-1.5" />Save
            </Button>
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="p-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Module</th>
                  {PERMISSION_ACTIONS.map((a) => <th key={a} className="p-2.5 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">{a}</th>)}
                </tr>
              </thead>
              <tbody>
                {PERMISSION_MODULES.map((mod) => (
                  <tr key={mod} className="border-t">
                    <td className="p-2.5 font-medium">{mod}</td>
                    {PERMISSION_ACTIONS.map((action) => (
                      <td key={action} className="p-2.5 text-center">
                        <Checkbox
                          checked={matrices[matrixRole][mod][action]}
                          onCheckedChange={() => toggleCell(mod, action)}
                          disabled={matrixRole === "Admin"}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {matrixRole === "Admin" && <p className="text-xs text-muted-foreground">Admin always has full access and cannot be restricted.</p>}
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent dismissOnOutside dismissOnEscape>
          <DialogHeader>
            <DialogTitle>{users.some((u) => u.id === editing.id) ? "Edit User" : "Add User"}</DialogTitle>
            <DialogDescription>Finance module user — mock data only.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormTextField label="Name" value={editing.name} onChange={(v) => setEditing({ ...editing, name: v })} span="wide" />
            <FormTextField label="Email" type="email" value={editing.email} onChange={(v) => setEditing({ ...editing, email: v })} span="wide" />
            <FormSelectField
              label="Role" value={editing.role} onChange={(v) => setEditing({ ...editing, role: v as FinanceRoleName })}
              options={FINANCE_ROLES.map((r) => ({ value: r.name, label: r.name }))}
            />
            <FormSelectField
              label="Branch" value={editing.branchId} onChange={(v) => setEditing({ ...editing, branchId: v })}
              options={BRANCHES.map((b) => ({ value: b.id, label: b.name }))}
            />
            <FormSelectField
              label="Status" value={editing.status} onChange={(v) => setEditing({ ...editing, status: v as "Active" | "Inactive" })}
              options={[{ value: "Active", label: "Active" }, { value: "Inactive", label: "Inactive" }]}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveUser} disabled={savingUser}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Remove user?"
        description={`This will remove ${deleteTarget?.name ?? "this user"} from the Finance module user list.`}
        confirmLabel="Remove"
        onConfirm={deleteUser}
      />
    </div>
  );
}
