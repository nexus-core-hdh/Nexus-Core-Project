"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RowContextMenu, RowActionsMenu, type RowAction } from "@/components/legacy-erp/row-actions";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { WorklistTable, type WorklistTableColumn } from "@/components/legacy-erp/worklist-table";
import { LogDetailsDialog } from "@/components/legacy-erp/log-details-dialog";
import { useUniversalActionShortcuts } from "@/hooks/legacy-erp/use-universal-action-shortcuts";
import { auditApi, type AuditLogRow } from "@/lib/nexuscore-api";
import { toast } from "sonner";
import { ScrollText, RefreshCw, Eye, ChevronRight, ChevronLeft, SearchX } from "lucide-react";

// Log Tracking — the project-wide Audit worklist (Section 7/8 of the Audit framework spec).
// Server-side filtered/paginated, driven entirely by real persisted AuditLog rows via
// auditApi.list() (never hardcoded/fake records) — company scope is resolved server-side from
// the caller's own token, never a client-controlled param (see audit.controller.ts). Reuses the
// exact same WorklistTable/RowContextMenu/RowActionsMenu components every other Legacy ERP list
// screen already uses; F4 (or the right-click "Log Details" action) opens the generic
// LogDetailsDialog for the selected row.
const PAGE_SIZE = 50;

// Shared semantic status tokens (globals.css), not per-badge hardcoded colors — create/approve
// share the same real-world meaning ("succeeded") so they share the same token, same for
// delete/reject ("destructive") and update/restore's own distinct meanings. No `dark:` variant
// needed: each token already branches light/dark itself (see globals.css's own :root/.dark).
const ACTION_BADGE: Record<string, string> = {
  create: "bg-success hover:bg-success/90 text-success-foreground border-transparent",
  update: "bg-info hover:bg-info/90 text-info-foreground border-transparent",
  delete: "bg-destructive hover:bg-destructive/90 text-white border-transparent",
  restore: "bg-warning hover:bg-warning/90 text-warning-foreground border-transparent",
  approve: "bg-success hover:bg-success/90 text-success-foreground border-transparent",
  reject: "bg-destructive hover:bg-destructive/90 text-white border-transparent",
};

export default function LogTrackingPage() {
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(true);

  const [documentNoInput, setDocumentNoInput] = useState("");
  const [documentNo, setDocumentNo] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [module, setModule] = useState<string>("all");
  const [action, setAction] = useState<string>("all");
  const [entityType, setEntityType] = useState<string>("all");

  const [modules, setModules] = useState<string[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [entityTypes, setEntityTypes] = useState<string[]>([]);

  const [selected, setSelected] = useState<AuditLogRow | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);

  useEffect(() => {
    auditApi.listModules().then(setModules).catch(() => {});
    auditApi.listActions().then(setActions).catch(() => {});
    auditApi.listEntityTypes().then(setEntityTypes).catch(() => {});
  }, []);

  const load = useCallback(async (nextSkip = skip) => {
    setLoading(true);
    try {
      const r = await auditApi.list({
        documentNo: documentNo.trim() || undefined,
        from: from || undefined,
        to: to || undefined,
        module: module !== "all" ? module : undefined,
        action: action !== "all" ? action : undefined,
        entityType: entityType !== "all" ? entityType : undefined,
        skip: nextSkip,
        take: PAGE_SIZE,
        sortDir: "desc",
      });
      setRows(r.rows);
      setTotal(r.total);
      setSkip(r.skip);
    } catch (e: any) {
      toast.error(e.message || "Failed to load audit log");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentNo, from, to, module, action, entityType]);

  useEffect(() => { load(0); }, [documentNo, from, to, module, action, entityType]); // eslint-disable-line react-hooks/exhaustive-deps

  const openDetails = (row: AuditLogRow) => { setSelected(row); setDetailsId(row.id); };

  const getRowActions = (row: AuditLogRow): RowAction[] => [
    { key: "log-details", label: "Log Details", icon: Eye, onSelect: () => openDetails(row), shortcut: "F4" },
  ];

  // F4 opens Log Details for whichever row is currently selected (click-to-select, same
  // convention a real ERP grid uses) — the shared shortcuts hook already maps "f4" ->
  // "log-details" (see use-universal-action-shortcuts.ts).
  useUniversalActionShortcuts(selected ? getRowActions(selected) : []);

  const columns: WorklistTableColumn<AuditLogRow>[] = useMemo(() => [
    {
      key: "createdAt", label: "Transaction Date/Time", defaultWidth: 170,
      render: (row) => <span className="text-xs">{new Date(row.createdAt).toLocaleString()}</span>,
    },
    {
      key: "user", label: "User", defaultWidth: 170,
      render: (row) => <span className="text-xs">{row.user?.name || row.user?.email || row.changedBy}</span>,
    },
    { key: "moduleName", label: "Module", defaultWidth: 140, render: (row) => row.moduleName || <span className="text-muted-foreground">—</span> },
    { key: "menuTitle", label: "Menu", defaultWidth: 160, render: (row) => row.menuTitle || <span className="text-muted-foreground">—</span> },
    {
      key: "action", label: "Action", defaultWidth: 110,
      render: (row) => (
        <Badge className={`text-[11px] font-normal ${ACTION_BADGE[row.action] ?? "bg-secondary text-secondary-foreground hover:bg-secondary/90"}`}>
          {row.action}
        </Badge>
      ),
    },
    { key: "entityType", label: "Entity", defaultWidth: 160, render: (row) => <span className="font-mono text-xs">{row.entityType}</span> },
    { key: "documentNo", label: "Document No", defaultWidth: 140, render: (row) => row.documentNo || <span className="text-muted-foreground">—</span> },
    { key: "entityId", label: "Record ID", defaultWidth: 110, render: (row) => <span className="font-mono text-xs text-muted-foreground">{row.entityId}</span> },
    { key: "parentDocumentNo", label: "Parent Document", defaultWidth: 140, render: (row) => row.parentDocumentNo || <span className="text-muted-foreground">—</span> },
  ], []);

  const pageFrom = total === 0 ? 0 : skip + 1;
  const pageTo = Math.min(skip + PAGE_SIZE, total);

  return (
    <div className="mx-auto max-w-[1700px] space-y-5 p-6 lg:p-8">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Administration</span>
        <ChevronRight className="h-3 w-3" />
        <span className="font-medium text-foreground">Log Tracking</span>
      </div>

      <div className="flex flex-col gap-4 border-b pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10">
            <ScrollText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-[22px] font-semibold leading-tight tracking-tight">Log Tracking</h1>
            <div className="mt-0.5 flex items-center gap-2">
              <p className="text-xs text-muted-foreground">Audit trail of every document/master-data change across the ERP</p>
              {!loading && <Badge variant="secondary" className="h-5 text-[11px] font-normal">{total} {total === 1 ? "record" : "records"}</Badge>}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <InputGroup className="h-9 w-64 shrink-0">
          <InputGroupAddon><SearchX className="h-3.5 w-3.5 text-muted-foreground opacity-0" /></InputGroupAddon>
          <InputGroupInput
            placeholder="Search Document No..."
            value={documentNoInput}
            onChange={(e) => setDocumentNoInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && setDocumentNo(documentNoInput.trim())}
            className="text-sm"
          />
        </InputGroup>
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] uppercase text-muted-foreground">From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-36 text-xs" />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] uppercase text-muted-foreground">To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-36 text-xs" />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] uppercase text-muted-foreground">Module</Label>
          <Select value={module} onValueChange={setModule}>
            <SelectTrigger className="h-9 w-40 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Modules</SelectItem>
              {modules.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] uppercase text-muted-foreground">Action</Label>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="h-9 w-36 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              {actions.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] uppercase text-muted-foreground">Entity</Label>
          <Select value={entityType} onValueChange={setEntityType}>
            <SelectTrigger className="h-9 w-44 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Entities</SelectItem>
              {entityTypes.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" className="h-9" onClick={() => load(0)} title="Refresh">
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border shadow-sm">
        <WorklistTable
          columns={columns}
          rows={rows}
          storageKey="logTrackingList"
          getRowKey={(row) => row.id}
          loading={loading}
          onRowDoubleClick={openDetails}
          getRowProps={(row) => ({
            className: `group cursor-pointer hover:bg-muted/40 ${selected?.id === row.id ? "bg-selected hover:bg-selected-hover" : ""}`,
            onClick: () => setSelected(row),
          })}
          renderRowActions={(row) => (
            <RowActionsMenu actions={getRowActions(row)} className="opacity-60 group-hover:opacity-100 transition-opacity" />
          )}
          wrapRow={(row, el) => <RowContextMenu actions={getRowActions(row)}>{el}</RowContextMenu>}
          emptyState={
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><ScrollText /></EmptyMedia>
                <EmptyTitle>No audit records found</EmptyTitle>
                <EmptyDescription>Try adjusting the date range or filters above.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          }
        />
      </div>

      {total > 0 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Showing {pageFrom}–{pageTo} of {total}</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={skip === 0} onClick={() => load(Math.max(0, skip - PAGE_SIZE))}>
              <ChevronLeft className="h-3.5 w-3.5 mr-1" />Previous
            </Button>
            <Button variant="outline" size="sm" disabled={skip + PAGE_SIZE >= total} onClick={() => load(skip + PAGE_SIZE)}>
              Next<ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </div>
      )}

      <LogDetailsDialog id={detailsId} open={!!detailsId} onOpenChange={(open) => !open && setDetailsId(null)} />
    </div>
  );
}
