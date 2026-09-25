"use client";

import { useEffect, useMemo, useState } from "react";
import { Network, ChevronRight, ChevronDown, Plus, Pencil, Power, Search, FolderTree } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { ModuleHeader } from "@/components/legacy-erp/module-header";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { StatusBadge } from "@/components/finance-erp/status-badge";
import { FormTextField, FormSelectField } from "@/components/forms/form-field";
import { cn } from "@/lib/utils";
import {
  getAccounts, createAccount, updateAccount, toggleAccountStatus, ACCOUNT_TYPES,
  type AccountNode, type AccountInput,
} from "@/lib/finance-erp/general-ledger/chart-of-accounts";
import { FinanceValidationError } from "@/lib/finance-erp/utils/validation";

const EMPTY_FORM: AccountInput = { code: "", name: "", type: "Asset", parentId: null, nature: "Debit", status: "Active" };

export default function ChartOfAccountsPage() {
  const [accounts, setAccounts] = useState<AccountNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<AccountNode | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AccountInput>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const rows = await getAccounts();
    setAccounts(rows);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const byParent = useMemo(() => {
    const map = new Map<string | null, AccountNode[]>();
    for (const a of accounts) {
      const key = a.parentId;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return map;
  }, [accounts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    return accounts.filter((a) => a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q));
  }, [accounts, search]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const openCreate = (parentId: string | null = null) => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, parentId });
    setDialogOpen(true);
  };

  const openEdit = (acc: AccountNode) => {
    setEditingId(acc.id);
    setForm({ code: acc.code, name: acc.name, type: acc.type, parentId: acc.parentId, nature: acc.nature, status: acc.status });
    setDialogOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      if (editingId) {
        await updateAccount(editingId, form);
        toast.success("Account updated");
      } else {
        await createAccount(form);
        toast.success("Account created");
      }
      setDialogOpen(false);
      await load();
    } catch (e) {
      if (e instanceof FinanceValidationError) toast.error(e.message);
      else toast.error("Failed to save account");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (acc: AccountNode) => {
    await toggleAccountStatus(acc.id);
    toast.success(`${acc.name} is now ${acc.status === "Active" ? "Inactive" : "Active"}`);
    await load();
  };

  const parentOptions = accounts.map((a) => ({ value: a.id, label: `${a.code} - ${a.name}` }));

  function Row({ node, level }: { node: AccountNode; level: number }) {
    const children = byParent.get(node.id) ?? [];
    const hasChildren = children.length > 0;
    const isOpen = expanded.has(node.id);
    return (
      <div>
        <div
          className={cn(
            "group flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 cursor-pointer",
            selected?.id === node.id && "bg-primary/5",
          )}
          style={{ paddingLeft: `${level * 20 + 8}px` }}
          onClick={() => setSelected(node)}
        >
          <div className="flex min-w-0 items-center gap-1.5">
            {hasChildren ? (
              <button type="button" onClick={(e) => { e.stopPropagation(); toggleExpand(node.id); }} className="text-muted-foreground">
                {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
            ) : <span className="w-3.5" />}
            <span className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-xs">{node.code}</span>
            <span className="truncate text-sm font-medium">{node.name}</span>
            <Badge variant="outline" className="text-[10px] font-normal">{node.type}</Badge>
            {node.status === "Inactive" && <StatusBadge status="Inactive" className="text-[10px]" />}
          </div>
          <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); openCreate(node.id); }} title="Add child account">
              <Plus className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); openEdit(node); }} title="Edit">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); toggleStatus(node); }} title="Activate/Deactivate">
              <Power className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        {hasChildren && isOpen && children.sort((a, b) => a.code.localeCompare(b.code)).map((c) => <Row key={c.id} node={c} level={level + 1} />)}
      </div>
    );
  }

  const roots = (byParent.get(null) ?? []).sort((a, b) => a.code.localeCompare(b.code));

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-6 lg:p-8">
      <LegacyErpBreadcrumb trail={[{ label: "Finance", href: "/dashboard/finance-erp" }, { label: "General Ledger" }, { label: "Chart of Accounts" }]} />
      <ModuleHeader
        icon={Network}
        size="lg"
        title="Chart of Accounts"
        subtitle="Hierarchical account structure — Asset, Liability, Equity, Revenue, Expense"
        actions={<Button size="sm" onClick={() => openCreate(null)}><Plus className="h-3.5 w-3.5 mr-1.5" />Add Account</Button>}
      />

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input placeholder="Search by code or name..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 pl-8 text-sm" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-lg border p-3 lg:col-span-2">
          {loading ? (
            <div className="space-y-2 p-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}</div>
          ) : accounts.length === 0 ? (
            <Empty><EmptyHeader><EmptyMedia variant="icon"><FolderTree /></EmptyMedia><EmptyTitle>No accounts</EmptyTitle><EmptyDescription>Add your first account to get started.</EmptyDescription></EmptyHeader></Empty>
          ) : filtered ? (
            <div className="space-y-0.5">
              {filtered.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">No accounts match &ldquo;{search}&rdquo;.</div>
              ) : filtered.sort((a, b) => a.code.localeCompare(b.code)).map((a) => <Row key={a.id} node={a} level={0} />)}
            </div>
          ) : (
            <div className="space-y-0.5">{roots.map((a) => <Row key={a.id} node={a} level={0} />)}</div>
          )}
        </div>

        <div className="rounded-lg border p-4">
          <div className="mb-3 text-sm font-semibold">Account Details</div>
          {selected ? (
            <div className="space-y-3 text-sm">
              <div><div className="text-xs text-muted-foreground">Code</div><div className="font-mono font-medium">{selected.code}</div></div>
              <div><div className="text-xs text-muted-foreground">Name</div><div className="font-medium">{selected.name}</div></div>
              <div><div className="text-xs text-muted-foreground">Type</div><Badge variant="outline">{selected.type}</Badge></div>
              <div><div className="text-xs text-muted-foreground">Nature</div><div>{selected.nature}</div></div>
              <div><div className="text-xs text-muted-foreground">Parent</div><div>{accounts.find((a) => a.id === selected.parentId)?.name ?? "— (Root)"}</div></div>
              <div><div className="text-xs text-muted-foreground">Status</div><StatusBadge status={selected.status} /></div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Select an account to view its details.</p>
          )}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Account" : "Add Account"}</DialogTitle>
            <DialogDescription>Codes and names must be unique across the whole chart.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormTextField label="Account Code *" value={form.code} onChange={(v) => setForm((f) => ({ ...f, code: v }))} />
            <FormTextField label="Account Name *" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} span="wide" />
            <FormSelectField label="Account Type" value={form.type} onChange={(v) => setForm((f) => ({ ...f, type: v as AccountNode["type"] }))} options={ACCOUNT_TYPES.map((t) => ({ value: t, label: t }))} />
            <FormSelectField label="Nature" value={form.nature} onChange={(v) => setForm((f) => ({ ...f, nature: v as AccountNode["nature"] }))} options={[{ value: "Debit", label: "Debit" }, { value: "Credit", label: "Credit" }]} />
            <FormSelectField
              label="Parent Account"
              value={form.parentId ?? ""}
              onChange={(v) => setForm((f) => ({ ...f, parentId: v || null }))}
              options={[{ value: "", label: "— None (Root) —" }, ...parentOptions.filter((o) => o.value !== editingId)]}
              span="wide"
            />
            <FormSelectField label="Status" value={form.status} onChange={(v) => setForm((f) => ({ ...f, status: v as AccountNode["status"] }))} options={[{ value: "Active", label: "Active" }, { value: "Inactive", label: "Inactive" }]} />
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
