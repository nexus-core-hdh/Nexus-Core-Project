"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "@/components/app-link";
import { useRouter } from "@/lib/app-navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { costingSheetLabel, plmApi } from "@/lib/nexuscore-api";
import { replaceWorkspaceUrl } from "@/lib/workspace/navigate";
import { useWorkspaceSearchParams } from "@/hooks/use-workspace-search-params";
import { useWorkspaceStore } from "@/lib/store/workspace-store";
import { useWorkspaceLookupStore } from "@/lib/store/workspace-lookup-store";
import { useWorkspaceTabContext } from "@/components/layout/workspace/workspace-tab-context";
import { resolveTabKey } from "@/lib/workspace/registry";

const COSTING_SHEETS_PATH = "/plm/costing-sheets";
import { Plus, Search, ExternalLink, Lock } from "lucide-react";
import { toast } from "sonner";
import { RowActionsMenu, RowContextMenu } from "@/components/legacy-erp/row-actions";
import { useCostingSheetActions } from "@/components/plm/costing-sheet-actions";

const fmt4 = (n: any) => Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });

export default function CostingSheetsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [sheets, setSheets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Lookup mode — this same list opened from a Costing Sheet field (Work Order → Initial Cost:
  // search icon / F2) instead of the menu: double-click or Enter on a row returns that sheet to
  // the field and closes this tab. Same manage-vs-lookup convention as the Yarn Cards list.
  const params = useWorkspaceSearchParams();
  const lookupMode = params.get("mode") === "lookup";
  const requestId = params.get("requestId") || undefined;
  const returnTab = params.get("returnTab") ? decodeURIComponent(params.get("returnTab")!) : undefined;
  const tabCtx = useWorkspaceTabContext();
  const closeTab = useWorkspaceStore((s) => s.closeTab);
  const activateTab = useWorkspaceStore((s) => s.activateTab);
  const resolveLookup = useWorkspaceLookupStore((s) => s.resolve);
  const returnAndClose = (row: any) => {
    if (!lookupMode || !requestId) return;
    resolveLookup(requestId, { id: row.id, code: row.costingNo, name: costingSheetLabel(row) });
    closeTab(tabCtx?.tabKey ?? COSTING_SHEETS_PATH);
    if (returnTab) {
      const [returnPath] = returnTab.split("?");
      activateTab(resolveTabKey(returnPath, returnTab));
      replaceWorkspaceUrl(router, returnTab);
    } else {
      router.back();
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q: any = { page: '1', limit: '100' };
      if (search) q.search = search;
      const r: any = await plmApi.costingSheets.list(q);
      setSheets(Array.isArray(r) ? r : (r?.data ?? []));
    } catch (e: any) {
      // e.g. BRANCH_REQUIRED (user account without a branch) or the API temporarily unavailable.
      setSheets([]);
      toast.error(e?.message || "Failed to load costing sheets");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { load(); }, [load]);

  // Right-click / ⋮ on a row: Edit, Save, Lock, Unlock, Print (components/plm/costing-sheet-actions.tsx).
  const { actionsFor, dialog } = useCostingSheetActions(router, (id, isLocked) =>
    setSheets((rows) => rows.map((r) => (r.id === id ? { ...r, isLocked } : r))));
  const rowActions = (row: any) => actionsFor({ id: row.id, costingNo: row.costingNo, isLocked: !!row.isLocked });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Costing Sheets</h1>
          <p className="text-xs text-muted-foreground">
            {lookupMode ? "Double-click a costing sheet (or select it and press Enter) to use it" : `${sheets.length} costing sheets total`}
          </p>
        </div>
        <Button size="sm" onClick={() => router.push("/plm/costing-sheets/new")}>
          <Plus className="h-4 w-4 mr-1" />New Costing
        </Button>
      </div>

      <div className="relative w-64">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search costing sheets..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9" />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Costing No</TableHead>
              <TableHead>Style</TableHead>
              <TableHead>Style Name</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Brand</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Quoted Price</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
            )) : sheets.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No costing sheets yet</TableCell></TableRow>
            ) : sheets.map((row) => (
              <RowContextMenu key={row.id} actions={rowActions(row)}>
              <TableRow
                className="cursor-pointer hover:bg-muted/30 focus-visible:bg-muted/50 focus-visible:outline-none"
                tabIndex={lookupMode ? 0 : undefined}
                onDoubleClick={lookupMode ? () => returnAndClose(row) : undefined}
                onKeyDown={lookupMode ? (e) => { if (e.key === "Enter") { e.preventDefault(); returnAndClose(row); } } : undefined}
              >
                <TableCell className="font-mono text-xs">
                  <Link href={`/plm/costing-sheets/${row.id}`} className="hover:underline flex items-center gap-1">
                    {row.costingNo}<ExternalLink className="h-3 w-3 text-muted-foreground" />
                    {row.isLocked && <Lock className="h-3 w-3 text-amber-600" aria-label="Locked" />}
                  </Link>
                </TableCell>
                <TableCell>{row.styleCode || "—"}</TableCell>
                <TableCell className="text-muted-foreground">{row.styleName || "—"}</TableCell>
                <TableCell>{row.accountName || "—"}</TableCell>
                <TableCell>{row.brand || "—"}</TableCell>
                <TableCell>{row.costingDate ? new Date(row.costingDate).toLocaleDateString() : "—"}</TableCell>
                <TableCell className="text-right font-mono">{fmt4(row.quotedPrice)}</TableCell>
                <TableCell className="py-0"><RowActionsMenu actions={rowActions(row)} /></TableCell>
              </TableRow>
              </RowContextMenu>
            ))}
          </TableBody>
        </Table>
      </div>
      {dialog}
    </div>
  );
}
