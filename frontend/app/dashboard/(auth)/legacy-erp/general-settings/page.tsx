"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { approvalConfigApi } from "@/lib/nexuscore-api";
import { toast } from "sonner";
import { Settings, ChevronRight, ShieldCheck } from "lucide-react";

// General Settings -> Approval Configuration. Screens come from the same existing MenuItem
// registry every other Legacy ERP nav entry uses (group: "Legacy ERP") — nothing hardcoded
// here. Editing is attempted directly and relies on the backend's existing RolesGuard +
// @Permissions('general-settings','manage-approval-configuration') to reject unauthorized
// users (same "backend is authoritative, frontend just shows the resulting toast on failure"
// convention already used by every other Legacy ERP screen in this app — there is no existing
// client-side permission-list mechanism to reuse instead).
interface ConfigRow {
  screenKey: string;
  screenName: string;
  approvalRequired: boolean;
  approvalLevel: number;
  isActive: boolean;
  selfApprovalAllowed: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
}

const LEVEL_OPTIONS = [1, 2, 3];

export default function GeneralSettingsPage() {
  const [rows, setRows] = useState<ConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r: any = await approvalConfigApi.list();
      setRows(Array.isArray(r) ? r : []);
    } catch (e: any) {
      toast.error(e.message || "Failed to load approval configuration");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const save = async (screenKey: string, patch: Partial<ConfigRow>) => {
    setSavingKey(screenKey);
    // Optimistic update — reverted on failure (e.g. a 403 from an unauthorized user).
    const prev = rows;
    setRows((p) => p.map((r) => (r.screenKey === screenKey ? { ...r, ...patch } : r)));
    try {
      const updated: any = await approvalConfigApi.update({ screenKey, ...patch });
      setRows((p) => p.map((r) => (r.screenKey === screenKey ? { ...r, ...updated } : r)));
      toast.success("Configuration saved");
    } catch (e: any) {
      setRows(prev);
      toast.error(e.message || "Failed to save configuration");
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 p-6 lg:p-8">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Legacy ERP</span>
        <ChevronRight className="h-3 w-3" />
        <span className="font-medium text-foreground">General Settings</span>
      </div>

      <div className="flex items-center gap-4 border-b pb-6">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10">
          <Settings className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-[22px] font-semibold leading-tight tracking-tight">General Settings</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">Approval Configuration — control which Legacy ERP screens require approval before completion</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-b bg-muted/40 hover:bg-muted/40">
                <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Screen Name</TableHead>
                <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Approval Required</TableHead>
                <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Approval Level</TableHead>
                <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Status</TableHead>
                <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Last Updated By</TableHead>
                <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Last Updated On</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>{Array.from({ length: 6 }).map((_, j) => <TableCell key={j} className="py-3"><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="py-12">
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon"><ShieldCheck /></EmptyMedia>
                        <EmptyTitle>No Legacy ERP screens found</EmptyTitle>
                        <EmptyDescription>The screen registry (MenuItem, group "Legacy ERP") is empty.</EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  </TableCell>
                </TableRow>
              ) : rows.map((row) => (
                <TableRow key={row.screenKey} className="group">
                  <TableCell className="py-3 font-medium">{row.screenName}</TableCell>
                  <TableCell className="py-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={row.approvalRequired}
                        disabled={savingKey === row.screenKey}
                        onCheckedChange={(v) => save(row.screenKey, { approvalRequired: v })}
                      />
                      <span className="text-xs text-muted-foreground">{row.approvalRequired ? "Yes" : "No"}</span>
                    </div>
                  </TableCell>
                  <TableCell className="py-3">
                    <Select
                      value={String(row.approvalLevel)}
                      disabled={savingKey === row.screenKey || !row.approvalRequired}
                      onValueChange={(v) => save(row.screenKey, { approvalLevel: Number(v) })}
                    >
                      <SelectTrigger className="h-8 w-24 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {LEVEL_OPTIONS.map((l) => <SelectItem key={l} value={String(l)}>{l}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="py-3">
                    <button
                      type="button"
                      onClick={() => save(row.screenKey, { isActive: !row.isActive })}
                      disabled={savingKey === row.screenKey}
                    >
                      <Badge variant={row.isActive ? "default" : "secondary"} className="text-[11px] font-normal">
                        {row.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </button>
                  </TableCell>
                  <TableCell className="py-3 text-sm text-muted-foreground">{row.updatedBy || <span>—</span>}</TableCell>
                  <TableCell className="py-3 text-sm text-muted-foreground">
                    {row.updatedAt ? new Date(row.updatedAt).toLocaleString() : <span>—</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
