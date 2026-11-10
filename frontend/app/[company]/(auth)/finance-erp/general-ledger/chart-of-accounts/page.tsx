"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Pencil, Power, Trash2, Search, FolderTree, MousePointerClick, XCircle, TriangleAlert, RefreshCw, Eye, Filter, Play } from "lucide-react";
import { RowContextMenu, type RowAction } from "@/components/legacy-erp/row-actions";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/finance-erp/status-badge";
import { FormTextField, FormSelectField } from "@/components/forms/form-field";
import { cn } from "@/lib/utils";
import { legacyErpApi } from "@/lib/nexuscore-api";
import { useRouter } from "@/lib/app-navigation";
import { useWorkspaceSearchParams } from "@/hooks/use-workspace-search-params";
import { useWorkspaceStore } from "@/lib/store/workspace-store";
import { useWorkspaceLookupStore } from "@/lib/store/workspace-lookup-store";
import { useWorkspaceTabContext } from "@/components/layout/workspace/workspace-tab-context";
import { replaceWorkspaceUrl } from "@/lib/workspace/navigate";
import { resolveTabKey } from "@/lib/workspace/registry";

// Chart of Accounts — real records from the legacy GL_Account table (legacyErpApi.glAccounts).
// GL_Account has no parent column (so the list is flat, ordered by code) and no documented meaning
// for AccountType / CDType (so they are plain numbers). Delete is a server-enforced soft delete,
// refused while any ERP record references the account (deactivate it instead). Opened with ?mode=lookup from a
// GL account picker (Current Account card), it also returns the chosen account to that field.
const CHART_OF_ACCOUNTS_PATH = "/finance-erp/general-ledger/chart-of-accounts";

interface GlAccount {
  id: number;
  accountCode: string;
  accountName: string;
  explanation: string | null;
  accountType: number | null;
  cdType: number | null;
  specialCode: string | null;
  accessCode: string | null;
  inUse: boolean;
}

type AccountForm = {
  accountCode: string; accountName: string; explanation: string; accountType: string; cdType: string;
  specialCode: string; accessCode: string; status: "Active" | "Inactive";
};

const EMPTY_FORM: AccountForm = {
  accountCode: "", accountName: "", explanation: "", accountType: "", cdType: "", specialCode: "", accessCode: "", status: "Active",
};

// GL_Account column limits (varchar lengths / smallint range) — same limits the API validates.
const MAX_LEN: Partial<Record<keyof AccountForm, [number, string]>> = {
  accountCode: [25, "Account Code"], accountName: [250, "Account Name"], explanation: [100, "Explanation"],
  specialCode: [15, "Special Code"], accessCode: [15, "Access Code"],
};

function validate(form: AccountForm): string | null {
  if (!form.accountCode.trim()) return "Account Code is required";
  if (!form.accountName.trim()) return "Account Name is required";
  for (const [key, [max, label]] of Object.entries(MAX_LEN) as [keyof AccountForm, [number, string]][]) {
    if (form[key].trim().length > max) return `${label} must be at most ${max} characters`;
  }
  for (const [key, label] of [["accountType", "Account Type"], ["cdType", "C/D Type"]] as const) {
    const v = form[key].trim();
    if (v && !(Number.isInteger(Number(v)) && Number(v) >= -32768 && Number(v) <= 32767)) return `${label} must be a whole number`;
  }
  return null;
}

const toPayload = (form: AccountForm) => ({
  accountCode: form.accountCode.trim(),
  accountName: form.accountName.trim(),
  explanation: form.explanation.trim(),
  accountType: form.accountType.trim() === "" ? null : Number(form.accountType),
  cdType: form.cdType.trim() === "" ? null : Number(form.cdType),
  specialCode: form.specialCode.trim(),
  accessCode: form.accessCode.trim(),
  inUse: form.status === "Active",
});

const show = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));

export default function ChartOfAccountsPage() {
  const router = useRouter();
  const params = useWorkspaceSearchParams();
  const mode = params.get("mode") === "lookup" ? "lookup" : "manage";
  const requestId = params.get("requestId") || undefined;
  const returnTab = params.get("returnTab") ? decodeURIComponent(params.get("returnTab")!) : undefined;
  const tabCtx = useWorkspaceTabContext();
  const closeTab = useWorkspaceStore((s) => s.closeTab);
  const activateTab = useWorkspaceStore((s) => s.activateTab);
  const resolveLookup = useWorkspaceLookupStore((s) => s.resolve);

  const [accounts, setAccounts] = useState<GlAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const rowRefs = useRef(new Map<number, HTMLTableRowElement>());

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<AccountForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GlAccount | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const rows: any = await legacyErpApi.glAccounts.list();
      setAccounts(Array.isArray(rows) ? rows : []);
    } catch (e: any) {
      setLoadError(e?.message || "Could not load the chart of accounts");
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // View-only state for the grid layout (no effect on what is loaded or saved).
  const [codeFilter, setCodeFilter] = useState("");
  const [nameFilter, setNameFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [sidePanel, setSidePanel] = useState<"utilities" | "details" | null>(null);

  // Display hierarchy derived ONLY from the account codes themselves (GL_Account has no parent
  // column): an account sits under another listed account when its code starts with that code
  // followed by "-" or "." (e.g. 01 > 01-01 > 01-01-01). Used for indentation and group shading.
  const hierarchy = useMemo(() => {
    const codes = new Set(accounts.map((a) => a.accountCode ?? ""));
    const level = new Map<number, number>();
    const groups = new Set<string>();
    for (const a of accounts) {
      const code = a.accountCode ?? "";
      let depth = 0;
      for (let i = 1; i < code.length; i++) {
        if ((code[i] === "-" || code[i] === ".") && codes.has(code.slice(0, i))) { depth++; groups.add(code.slice(0, i)); }
      }
      level.set(a.id, depth);
    }
    return { level, groups };
  }, [accounts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qc = codeFilter.trim().toLowerCase();
    const qn = nameFilter.trim().toLowerCase();
    return accounts.filter((a) => {
      const code = (a.accountCode ?? "").toLowerCase();
      const name = (a.accountName ?? "").toLowerCase();
      if (q && !code.includes(q) && !name.includes(q)) return false;
      if (qc && !code.includes(qc)) return false;
      if (qn && !name.includes(qn)) return false;
      if (statusFilter === "active" && !a.inUse) return false;
      if (statusFilter === "inactive" && a.inUse) return false;
      return true;
    });
  }, [accounts, search, codeFilter, nameFilter, statusFilter]);

  const selected = accounts.find((a) => a.id === selectedId) ?? null;

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (acc: GlAccount) => {
    setEditingId(acc.id);
    setForm({
      accountCode: acc.accountCode ?? "", accountName: acc.accountName ?? "", explanation: acc.explanation ?? "",
      accountType: acc.accountType == null ? "" : String(acc.accountType), cdType: acc.cdType == null ? "" : String(acc.cdType),
      specialCode: acc.specialCode ?? "", accessCode: acc.accessCode ?? "", status: acc.inUse ? "Active" : "Inactive",
    });
    setDialogOpen(true);
  };

  const save = async () => {
    const error = validate(form);
    if (error) return toast.error(error);
    setSaving(true);
    try {
      const saved: any = editingId
        ? await legacyErpApi.glAccounts.update(editingId, toPayload(form))
        : await legacyErpApi.glAccounts.create(toPayload(form));
      toast.success(editingId ? "Account updated" : "Account created");
      setDialogOpen(false);
      await load();
      if (saved?.id) setSelectedId(saved.id);
    } catch (e: any) {
      toast.error(e?.message || "Failed to save account");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (acc: GlAccount) => {
    setTogglingId(acc.id);
    try {
      await legacyErpApi.glAccounts.update(acc.id, { inUse: !acc.inUse });
      toast.success(`${acc.accountName} is now ${acc.inUse ? "Inactive" : "Active"}`);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to change status");
    } finally {
      setTogglingId(null);
    }
  };

  // The server decides (it blocks any account still referenced) — the dialog only confirms intent.
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleting(true);
    try {
      await legacyErpApi.glAccounts.delete(target.id);
      toast.success(`Account ${target.accountCode} deleted`);
      setDeleteTarget(null);
      if (selectedId === target.id) setSelectedId(null);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete account");
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  // --- Lookup mode: hand the chosen account back to the field that opened this tab ---------
  const closeSelf = () => {
    closeTab(tabCtx?.tabKey ?? CHART_OF_ACCOUNTS_PATH);
    if (returnTab) {
      const [returnPath] = returnTab.split("?");
      activateTab(resolveTabKey(returnPath, returnTab));
      replaceWorkspaceUrl(router, returnTab);
    } else {
      router.back();
    }
  };

  const returnAndClose = (acc: GlAccount) => {
    if (mode !== "lookup" || !requestId) return;
    if (!acc.inUse) return toast.error("Inactive accounts cannot be selected");
    resolveLookup(requestId, { id: acc.id, code: acc.accountCode, name: acc.accountName });
    closeSelf();
  };

  // Same handlers as before, offered from the toolbar, the right-click menu and the Details panel.
  const getRowActions = (acc: GlAccount): RowAction[] => [
    { key: "select", label: "Select", icon: MousePointerClick, hidden: mode !== "lookup", disabled: !acc.inUse, onSelect: () => returnAndClose(acc) },
    { key: "details", label: "Details", icon: Eye, onSelect: () => { setSelectedId(acc.id); setSidePanel("details"); } },
    { key: "edit", label: "Edit", icon: Pencil, onSelect: () => openEdit(acc) },
    { key: "status", label: acc.inUse ? "Deactivate" : "Activate", icon: Power, disabled: togglingId === acc.id, onSelect: () => toggleStatus(acc) },
    { key: "delete", label: "Delete", icon: Trash2, destructive: true, separatorBefore: true, onSelect: () => setDeleteTarget(acc) },
  ];

  const moveSelection = (index: number) => {
    const next = filtered[index];
    if (!next) return;
    setSelectedId(next.id);
    rowRefs.current.get(next.id)?.focus();
  };

  const handleRowKeyDown = (e: React.KeyboardEvent, acc: GlAccount, index: number) => {
    if (e.key === "ArrowDown") { e.preventDefault(); moveSelection(index + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); moveSelection(index - 1); }
    else if (e.key === "Enter" && mode === "lookup") { e.preventDefault(); returnAndClose(acc); }
  };

  const activeCount = accounts.filter((a) => a.inUse).length;
  const toolbarButton = "h-7 px-2 text-xs";

  return (
    <div className="flex h-full min-h-[calc(100vh-8rem)] flex-col gap-2 p-3">
      {/* Toolbar: actions apply to the selected row */}
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-2 text-sm font-semibold">Chart of Accounts</span>
        {mode === "lookup" && (
          <>
            <Button size="sm" className={toolbarButton} disabled={!selected || !selected.inUse} onClick={() => selected && returnAndClose(selected)}>
              <MousePointerClick className="h-3.5 w-3.5 mr-1" />Select
            </Button>
            <Button variant="outline" size="sm" className={toolbarButton} onClick={closeSelf}><XCircle className="h-3.5 w-3.5 mr-1" />Close</Button>
            <span className="mx-1 h-5 w-px bg-border" />
          </>
        )}
        <Button variant="outline" size="sm" className={toolbarButton} onClick={openCreate}><Plus className="h-3.5 w-3.5 mr-1" />Add</Button>
        <Button variant="outline" size="sm" className={toolbarButton} disabled={!selected} onClick={() => selected && openEdit(selected)}><Pencil className="h-3.5 w-3.5 mr-1" />Edit</Button>
        <Button variant="outline" size="sm" className={toolbarButton} disabled={!selected || togglingId === selected.id} onClick={() => selected && toggleStatus(selected)}>
          <Power className="h-3.5 w-3.5 mr-1" />{selected && !selected.inUse ? "Activate" : "Deactivate"}
        </Button>
        <Button variant="outline" size="sm" className={cn(toolbarButton, "text-destructive hover:text-destructive")} disabled={!selected} onClick={() => selected && setDeleteTarget(selected)}>
          <Trash2 className="h-3.5 w-3.5 mr-1" />Delete
        </Button>
        <Button variant="ghost" size="sm" className={toolbarButton} onClick={load} disabled={loading} title="Refresh"><RefreshCw className="h-3.5 w-3.5" /></Button>
        {mode === "lookup" && <span className="ml-2 text-xs text-muted-foreground">Double-click an active account, or press Select, to choose it</span>}
      </div>

      <div className="flex min-h-0 flex-1 gap-1.5">
        {/* Left: Filter tab + panel */}
        <button
          type="button"
          onClick={() => setFilterOpen((o) => !o)}
          className={cn(
            "flex w-6 shrink-0 items-start justify-center rounded-sm border bg-muted/40 pt-3 text-[11px] font-medium tracking-[0.2em] text-primary hover:bg-muted",
            filterOpen && "bg-muted",
          )}
          title="Filter"
        >
          <span className="[writing-mode:vertical-rl]">Filter</span>
        </button>
        {filterOpen && (
          <div className="w-48 shrink-0 space-y-3 rounded-sm border bg-card p-3 text-xs">
            <div className="font-semibold">Filter</div>
            <div className="space-y-1">
              <div className="text-muted-foreground">Status</div>
              {(["all", "active", "inactive"] as const).map((s) => (
                <label key={s} className="flex cursor-pointer items-center gap-2">
                  <input type="radio" name="coa-status" checked={statusFilter === s} onChange={() => setStatusFilter(s)} />
                  <span className="capitalize">{s}</span>
                </label>
              ))}
            </div>
            <Button variant="ghost" size="sm" className="h-7 w-full text-xs" onClick={() => { setStatusFilter("all"); setCodeFilter(""); setNameFilter(""); setSearch(""); }}>
              Clear filters
            </Button>
          </div>
        )}

        {/* Center: search + grid */}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="relative">
            <Input placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 rounded-sm pr-8 text-sm" />
            <Search className="absolute right-2.5 top-2 h-4 w-4 text-muted-foreground" />
          </div>

          <div className="min-h-[320px] flex-1 overflow-auto rounded-sm border bg-background">
            <table className="w-full min-w-[820px] border-collapse text-[13px]">
              <thead className="sticky top-0 z-10 bg-muted">
                <tr className="text-left">
                  <th className="w-5 border-b border-r" />
                  <th className="w-[180px] border-b border-r px-2 py-1 font-normal">Account Code</th>
                  <th className="border-b border-r px-2 py-1 font-normal">Account Name</th>
                  <th className="w-[120px] border-b border-r px-2 py-1 text-right font-normal">Debit</th>
                  <th className="w-[120px] border-b border-r px-2 py-1 text-right font-normal">Credit</th>
                  <th className="w-[120px] border-b border-r px-2 py-1 text-right font-normal">Balance</th>
                  <th className="w-[70px] border-b px-2 py-1 font-normal">BT</th>
                </tr>
                <tr className="bg-background">
                  <th className="border-b border-r text-center"><Filter className="mx-auto h-3 w-3 text-muted-foreground" /></th>
                  <th className="border-b border-r p-0">
                    <input value={codeFilter} onChange={(e) => setCodeFilter(e.target.value)} aria-label="Filter by account code" className="h-6 w-full bg-transparent px-2 text-[13px] font-normal outline-none focus:bg-muted/40" />
                  </th>
                  <th className="border-b border-r p-0">
                    <input value={nameFilter} onChange={(e) => setNameFilter(e.target.value)} aria-label="Filter by account name" className="h-6 w-full bg-transparent px-2 text-[13px] font-normal outline-none focus:bg-muted/40" />
                  </th>
                  <th className="border-b border-r" /><th className="border-b border-r" /><th className="border-b border-r" /><th className="border-b" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i}><td colSpan={7} className="border-b px-2 py-1"><Skeleton className="h-4 w-full" /></td></tr>
                  ))
                ) : loadError ? (
                  <tr><td colSpan={7}>
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon"><TriangleAlert /></EmptyMedia>
                        <EmptyTitle>Could not load accounts</EmptyTitle>
                        <EmptyDescription>{loadError}</EmptyDescription>
                      </EmptyHeader>
                      <EmptyContent><Button size="sm" variant="outline" onClick={load}><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Retry</Button></EmptyContent>
                    </Empty>
                  </td></tr>
                ) : accounts.length === 0 ? (
                  <tr><td colSpan={7}>
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon"><FolderTree /></EmptyMedia>
                        <EmptyTitle>No accounts</EmptyTitle>
                        <EmptyDescription>Add your first account to get started.</EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  </td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No accounts match the current search or filters.</td></tr>
                ) : (
                  filtered.map((acc, index) => {
                    const depth = hierarchy.level.get(acc.id) ?? 0;
                    const isTopGroup = depth === 0 && hierarchy.groups.has(acc.accountCode ?? "");
                    const isSelected = selectedId === acc.id;
                    return (
                      <RowContextMenu key={acc.id} actions={getRowActions(acc)}>
                        <tr
                          ref={(el) => { if (el) rowRefs.current.set(acc.id, el); else rowRefs.current.delete(acc.id); }}
                          tabIndex={0}
                          aria-selected={isSelected}
                          onClick={() => setSelectedId(acc.id)}
                          onContextMenu={() => setSelectedId(acc.id)}
                          onDoubleClick={() => (mode === "lookup" ? returnAndClose(acc) : (setSelectedId(acc.id), setSidePanel("details")))}
                          onKeyDown={(e) => handleRowKeyDown(e, acc, index)}
                          className={cn(
                            "cursor-pointer outline-none",
                            isTopGroup && "bg-amber-100/70 dark:bg-amber-900/25",
                            !isTopGroup && "hover:bg-muted/50",
                            isSelected && "bg-selected hover:bg-selected-hover dark:bg-selected",
                            !acc.inUse && "text-muted-foreground",
                          )}
                        >
                          <td className="border-b border-r text-center text-primary">{isSelected && <Play className="mx-auto h-2.5 w-2.5 fill-current" />}</td>
                          <td className="whitespace-nowrap border-b border-r px-2 py-[3px] font-mono text-[12px]">{acc.accountCode}</td>
                          <td className="border-b border-r px-2 py-[3px]">
                            <div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: `${Math.min(depth, 6) * 12}px` }}>
                              <span className="truncate">{acc.accountName}</span>
                              {!acc.inUse && <StatusBadge status="Inactive" className="h-4 px-1 text-[10px]" />}
                            </div>
                          </td>
                          <td className="border-b border-r px-2 py-[3px]" />
                          <td className="border-b border-r px-2 py-[3px]" />
                          <td className="border-b border-r px-2 py-[3px]" />
                          <td className="border-b px-2 py-[3px]" />
                        </tr>
                      </RowContextMenu>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-muted-foreground">
            <span>{loading ? "Loading…" : `${filtered.length} of ${accounts.length} accounts`}</span>
            <span>Debit, Credit, Balance and BT are blank: no account balance source is connected to this screen yet.</span>
          </div>
        </div>

        {/* Right: Utilities / Details panel + tabs */}
        {sidePanel && (
          <div className="w-64 shrink-0 overflow-auto rounded-sm border bg-card p-3 text-sm">
            {sidePanel === "details" ? (
              <>
                <div className="mb-3 text-sm font-semibold">Account Details</div>
                {selected ? (
                  <div className="space-y-2.5">
                    <div><div className="text-xs text-muted-foreground">Code</div><div className="font-mono font-medium">{selected.accountCode}</div></div>
                    <div><div className="text-xs text-muted-foreground">Name</div><div className="font-medium">{selected.accountName}</div></div>
                    <div><div className="text-xs text-muted-foreground">Explanation</div><div>{show(selected.explanation)}</div></div>
                    <div><div className="text-xs text-muted-foreground">Account Type</div><div>{show(selected.accountType)}</div></div>
                    <div><div className="text-xs text-muted-foreground">C/D Type</div><div>{show(selected.cdType)}</div></div>
                    <div><div className="text-xs text-muted-foreground">Special Code</div><div>{show(selected.specialCode)}</div></div>
                    <div><div className="text-xs text-muted-foreground">Access Code</div><div>{show(selected.accessCode)}</div></div>
                    <div><div className="text-xs text-muted-foreground">Status</div><StatusBadge status={selected.inUse ? "Active" : "Inactive"} /></div>
                    <div className="flex flex-wrap gap-1 border-t pt-2.5">
                      <Button variant="outline" size="sm" className={toolbarButton} onClick={() => openEdit(selected)}><Pencil className="h-3.5 w-3.5 mr-1" />Edit</Button>
                      <Button variant="outline" size="sm" className={toolbarButton} disabled={togglingId === selected.id} onClick={() => toggleStatus(selected)}>
                        <Power className="h-3.5 w-3.5 mr-1" />{selected.inUse ? "Deactivate" : "Activate"}
                      </Button>
                      <Button variant="outline" size="sm" className={cn(toolbarButton, "text-destructive hover:text-destructive")} onClick={() => setDeleteTarget(selected)}>
                        <Trash2 className="h-3.5 w-3.5 mr-1" />Delete
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Select an account to view its details.</p>
                )}
              </>
            ) : (
              <>
                <div className="mb-3 text-sm font-semibold">Utilities</div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between"><span className="text-muted-foreground">Accounts</span><span>{accounts.length}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Active</span><span>{activeCount}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Inactive</span><span>{accounts.length - activeCount}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Shown</span><span>{filtered.length}</span></div>
                </div>
                <div className="mt-3 flex flex-col gap-1">
                  <Button variant="outline" size="sm" className={toolbarButton} onClick={openCreate}><Plus className="h-3.5 w-3.5 mr-1" />Add account</Button>
                  <Button variant="outline" size="sm" className={toolbarButton} onClick={load} disabled={loading}><RefreshCw className="h-3.5 w-3.5 mr-1" />Refresh</Button>
                </div>
              </>
            )}
          </div>
        )}
        <div className="flex w-6 shrink-0 flex-col gap-1">
          {(["utilities", "details"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setSidePanel((cur) => (cur === p ? null : p))}
              className={cn(
                "flex items-start justify-center rounded-sm border bg-muted/40 py-3 text-[11px] font-medium text-muted-foreground hover:bg-muted",
                sidePanel === p && "bg-muted text-foreground",
              )}
              title={p === "utilities" ? "Utilities" : "Details"}
            >
              <span className="capitalize [writing-mode:vertical-rl]">{p}</span>
            </button>
          ))}
        </div>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Account</AlertDialogTitle>
            <AlertDialogDescription>
              Delete account <span className="font-mono font-medium text-foreground">{deleteTarget?.accountCode}</span> — {deleteTarget?.accountName}?
              {" "}An account that is used by any ERP record cannot be deleted; deactivate it instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>No</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              disabled={deleting}
              onClick={(e) => { e.preventDefault(); confirmDelete(); }}
            >
              {deleting ? "Deleting..." : "Yes, delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Account" : "Add Account"}</DialogTitle>
            <DialogDescription>Account codes must be unique within the company.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormTextField label="Account Code *" value={form.accountCode} onChange={(v) => setForm((f) => ({ ...f, accountCode: v }))} />
            <FormTextField label="Account Name *" value={form.accountName} onChange={(v) => setForm((f) => ({ ...f, accountName: v }))} span="wide" />
            <FormTextField label="Account Type" type="number" value={form.accountType} onChange={(v) => setForm((f) => ({ ...f, accountType: v }))} />
            <FormTextField label="C/D Type" type="number" value={form.cdType} onChange={(v) => setForm((f) => ({ ...f, cdType: v }))} />
            <FormTextField label="Explanation" value={form.explanation} onChange={(v) => setForm((f) => ({ ...f, explanation: v }))} span="wide" />
            <FormTextField label="Special Code" value={form.specialCode} onChange={(v) => setForm((f) => ({ ...f, specialCode: v }))} />
            <FormTextField label="Access Code" value={form.accessCode} onChange={(v) => setForm((f) => ({ ...f, accessCode: v }))} />
            <FormSelectField label="Status" value={form.status} onChange={(v) => setForm((f) => ({ ...f, status: v as AccountForm["status"] }))} options={[{ value: "Active", label: "Active" }, { value: "Inactive", label: "Inactive" }]} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save Account"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
