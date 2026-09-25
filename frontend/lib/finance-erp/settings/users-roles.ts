import { createMockStore, makeId } from "@/lib/finance-erp/mock/create-store";
import { EMPLOYEES, BRANCHES } from "@/lib/finance-erp/mock/master-data";

export type FinanceRoleName = "Admin" | "Finance Manager" | "Accountant" | "Finance Officer" | "Viewer";

export interface FinanceUser {
  id: string;
  name: string;
  email: string;
  role: FinanceRoleName;
  branchId: string;
  status: "Active" | "Inactive";
}

export interface FinanceRoleDef {
  name: FinanceRoleName;
  description: string;
}

export const FINANCE_ROLES: FinanceRoleDef[] = [
  { name: "Admin", description: "Full access to every Finance screen and action, including Settings." },
  { name: "Finance Manager", description: "Can view, create, edit, approve and export across all Finance modules." },
  { name: "Accountant", description: "Day-to-day posting and reporting — create/edit and export, no approvals or deletes." },
  { name: "Finance Officer", description: "Can raise and edit transactions for approval; no export or delete rights." },
  { name: "Viewer", description: "Read-only access — dashboards and reports only." },
];

export const PERMISSION_MODULES = [
  "Dashboard", "Inventory Management", "Payable", "Receivable", "Fixed Assets", "General Ledger", "Finance Settings",
] as const;
export type PermissionModule = typeof PERMISSION_MODULES[number];

export const PERMISSION_ACTIONS = ["View", "Create", "Edit", "Delete", "Approve", "Export"] as const;
export type PermissionAction = typeof PERMISSION_ACTIONS[number];

export type PermissionRow = Record<PermissionAction, boolean>;
export type PermissionMatrix = Record<PermissionModule, PermissionRow>;

function rowFor(role: FinanceRoleName): PermissionRow {
  switch (role) {
    case "Admin":
      return { View: true, Create: true, Edit: true, Delete: true, Approve: true, Export: true };
    case "Finance Manager":
      return { View: true, Create: true, Edit: true, Delete: false, Approve: true, Export: true };
    case "Accountant":
      return { View: true, Create: true, Edit: true, Delete: false, Approve: false, Export: true };
    case "Finance Officer":
      return { View: true, Create: true, Edit: true, Delete: false, Approve: false, Export: false };
    case "Viewer":
    default:
      return { View: true, Create: false, Edit: false, Delete: false, Approve: false, Export: false };
  }
}

/** Default permission matrix per role — module rows are identical today (no per-module
 *  overrides seeded), but the shape supports per-module divergence once a real role editor
 *  needs it. This is the Finance module's own lightweight mock permission layer (spec section
 *  16) — local state only, independent of the app's real backend-driven permission system. */
export function defaultMatrixFor(role: FinanceRoleName): PermissionMatrix {
  const row = rowFor(role);
  return PERMISSION_MODULES.reduce((acc, mod) => {
    acc[mod] = { ...row };
    return acc;
  }, {} as PermissionMatrix);
}

const SEED_USERS: FinanceUser[] = [
  { id: makeId("usr"), name: EMPLOYEES[1].name, email: "sana.malik@nexuscore.io", role: "Admin", branchId: BRANCHES[0].id, status: "Active" },
  { id: makeId("usr"), name: EMPLOYEES[0].name, email: "ahmed.raza@nexuscore.io", role: "Finance Manager", branchId: BRANCHES[0].id, status: "Active" },
  { id: makeId("usr"), name: EMPLOYEES[4].name, email: "hina.sheikh@nexuscore.io", role: "Accountant", branchId: BRANCHES[0].id, status: "Active" },
  { id: makeId("usr"), name: EMPLOYEES[2].name, email: "bilal.khan@nexuscore.io", role: "Finance Officer", branchId: BRANCHES[1].id, status: "Active" },
  { id: makeId("usr"), name: EMPLOYEES[3].name, email: "usman.tariq@nexuscore.io", role: "Finance Officer", branchId: BRANCHES[0].id, status: "Active" },
  { id: makeId("usr"), name: EMPLOYEES[5].name, email: "kashif.iqbal@nexuscore.io", role: "Viewer", branchId: BRANCHES[1].id, status: "Active" },
  { id: makeId("usr"), name: EMPLOYEES[6].name, email: "zara.ahmed@nexuscore.io", role: "Viewer", branchId: BRANCHES[0].id, status: "Inactive" },
];

const store = createMockStore<FinanceUser>(SEED_USERS);

export const usersRolesApi = {
  getUsers: () => store.list(),
  createUser: (user: FinanceUser) => store.create(user),
  updateUser: (id: string, patch: Partial<FinanceUser>) => store.update(id, patch),
  deleteUser: (id: string) => store.remove(id),
  snapshot: () => store.snapshot(),
};
