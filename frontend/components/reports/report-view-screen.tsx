"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "@/lib/app-navigation";
import { format, parseISO } from "date-fns";
import { Download, FileBarChart2, FileSpreadsheet, FileText, Lock, Pencil, Play, Printer, RefreshCw, Sheet } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ModuleHeader } from "@/components/legacy-erp/module-header";
import { useWorkspaceSearchParams } from "@/hooks/use-workspace-search-params";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { MENU_CHANGED_EVENT } from "@/lib/workspace/menu-events";
import {
  REPORT_MODULE_UI,
  reportBuilderApiFor,
  type ReportModuleKey,
  type ReportCatalog,
  type ReportDefinition,
  type ReportExportFormat,
  type ReportParams,
  type ReportResult,
  type ReportSourceField,
} from "@/lib/nexuscore-api";
import { PromptFiltersForm, ReportResultTable, ReportSections } from "./report-shared";

const EXPORTS: { format: ReportExportFormat; label: string; icon: typeof FileText }[] = [
  { format: "pdf", label: "PDF", icon: FileText },
  { format: "xlsx", label: "Excel (.xlsx)", icon: FileSpreadsheet },
  { format: "csv", label: "CSV", icon: Sheet },
];

/** One user-defined report, opened from its own menu entry as its own screen/tab. */
export function ReportViewScreen({ module }: { module: ReportModuleKey }) {
  const reportApi = useMemo(() => reportBuilderApiFor(module), [module]);
  const ui = REPORT_MODULE_UI[module];
  const router = useRouter();
  const searchParams = useWorkspaceSearchParams();
  const id = searchParams.get("id");
  // ?p.<field>=<value>[&pl.<field>=<display text>] fills that field's "ask when running" filter —
  // e.g. the Work Orders list's Print → Order Form passes the right-clicked Work Order.
  const prefill = searchParams.toString();
  const [catalog, setCatalog] = useState<ReportCatalog | null>(null);
  const [definition, setDefinition] = useState<ReportDefinition | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [params, setParams] = useState<ReportParams>({});
  const [paramLabels, setParamLabels] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ReportResult | null>(null);
  const [running, setRunning] = useState(false);
  const [exporting, setExporting] = useState<ReportExportFormat | null>(null);

  const hasPrompts = !!definition?.filters?.some((f) => f.prompt);
  // Database table sources list no fields in the catalog: resolve the ones the prompt filters use.
  const [tableFields, setTableFields] = useState<ReportSourceField[]>([]);
  const source = catalog?.sources.find((s) => s.key === definition?.dataSource);
  useEffect(() => {
    if (!source?.dynamic || !definition) return;
    const keys = definition.filters.filter((f) => f.prompt).map((f) => f.field);
    if (!keys.length) return;
    reportApi.resolveFields(definition.dataSource, keys).then((r) => setTableFields(r.fields)).catch(() => setTableFields([]));
  }, [source?.dynamic, definition, reportApi]);
  const fields = useMemo(
    () => new Map((source?.dynamic ? tableFields : source?.fields ?? []).map((f) => [f.key, f])),
    [source, tableFields],
  );

  const run = useCallback(async (reportId: string, runParams: ReportParams) => {
    setRunning(true);
    try {
      setResult(await reportApi.run(reportId, runParams));
    } catch (e: any) {
      toast.error(e.message || "Could not run the report");
    } finally {
      setRunning(false);
    }
  }, [reportApi]);

  // Loads the definition; runs it straight away unless it asks for filter values first.
  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [cat, def] = await Promise.all([reportApi.catalog(), reportApi.get(id)]);
      setCatalog(cat);
      setDefinition(def);
      setLoadError(null);
      const query = new URLSearchParams(prefill);
      const prompts = (def.filters ?? []).filter((f) => f.prompt);
      const filled: ReportParams = {};
      const labels: Record<string, string> = {};
      for (const f of prompts) {
        const value = query.get(`p.${f.field}`);
        if (!value) continue;
        filled[f.id] = { value };
        const label = query.get(`pl.${f.field}`);
        if (label) labels[f.id] = label;
      }
      setParams(filled);
      setParamLabels(labels);
      // Run straight away when nothing is asked, or when the opener filled the prompts it means (e.g.
      // Print → Yarn Requirement fills Work Orders; a prompt left blank means "no restriction").
      if (!prompts.length || Object.keys(filled).length) void run(def.id, filled);
    } catch (e: any) {
      setLoadError(e.status === 404 ? "This report no longer exists." : e.status === 403 ? "You don't have permission to view reports." : e.message || "Could not load the report");
    }
  }, [id, run, reportApi, prefill]);

  useEffect(() => {
    void load();
    // A save in the designer (or a delete) re-announces the menu — pick up the new definition.
    window.addEventListener(MENU_CHANGED_EVENT, load);
    return () => window.removeEventListener(MENU_CHANGED_EVENT, load);
  }, [load]);

  // Document reports (e.g. the Order Form): the PDF export, opened for the browser's Print dialog.
  const doPrint = () => {
    if (!definition) return;
    reportApi.printPdf(definition.id, params).catch((e: any) => toast.error(e.message || "Could not create the PDF"));
  };

  const doExport = async (fmt: ReportExportFormat) => {
    if (!definition) return;
    setExporting(fmt);
    try {
      await reportApi.export(definition.id, fmt, params);
    } catch (e: any) {
      toast.error(e.message || "Export failed");
    } finally {
      setExporting(null);
    }
  };

  if (!id || loadError) {
    return (
      <Empty className="py-16">
        <EmptyHeader>
          <EmptyMedia variant="icon"><Lock /></EmptyMedia>
          <EmptyTitle>Report unavailable</EmptyTitle>
          <EmptyDescription>{loadError ?? "No report was selected."}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (!definition || !catalog) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const caps = catalog.capabilities;
  const sourceLabel = catalog.sources.find((s) => s.key === definition.dataSource)?.label ?? definition.dataSource;

  return (
    <div className="space-y-4 p-4">
      <ModuleHeader
        icon={FileBarChart2}
        title={definition.name}
        subtitle={definition.description || `${ui.label} report · ${sourceLabel}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {caps.update && (
              <Button variant="outline" size="sm" onClick={() => navigateOrOpenTab(router, `${ui.basePath}/designer?id=${definition.id}`)}>
                <Pencil className="mr-2 h-3.5 w-3.5" />Edit
              </Button>
            )}
            {caps.export && source?.document && (
              <Button variant="outline" size="sm" onClick={doPrint} disabled={!result?.sections?.length}>
                <Printer className="mr-2 h-3.5 w-3.5" />Print
              </Button>
            )}
            {caps.export && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" disabled={!result || !!exporting}>
                    <Download className="mr-2 h-3.5 w-3.5" />{exporting ? "Exporting..." : "Export"}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {EXPORTS.map((x) => (
                    <DropdownMenuItem key={x.format} onSelect={() => doExport(x.format)}>
                      <x.icon className="h-4 w-4" />{x.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button size="sm" onClick={() => run(definition.id, params)} disabled={running}>
              {hasPrompts ? <Play className="mr-2 h-3.5 w-3.5" /> : <RefreshCw className={`mr-2 h-3.5 w-3.5 ${running ? "animate-spin" : ""}`} />}
              {running ? "Running..." : hasPrompts ? "Run" : "Refresh"}
            </Button>
          </div>
        }
      />

      {hasPrompts && (
        <div className="rounded-md border p-4">
          <PromptFiltersForm filters={definition.filters} fields={fields} params={params} onChange={setParams} labels={paramLabels} />
          <p className="mt-3 text-xs text-muted-foreground">Leave a value blank to include everything for that filter.</p>
        </div>
      )}

      {result ? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{result.sections ? `${result.sections.length} ${result.sections.length === 1 ? "section" : "sections"}` : `${result.rowCount.toLocaleString()} ${result.rowCount === 1 ? "row" : "rows"}`}</span>
            <span>·</span>
            <span>Generated {format(parseISO(result.generatedAt), "dd MMM yyyy, HH:mm")}</span>
            {result.appliedFilters.map((f) => <Badge key={f} variant="secondary" className="font-normal">{f}</Badge>)}
          </div>
          {result.notice ? (
            <Empty className="rounded-md border py-10">
              <EmptyHeader>
                <EmptyMedia variant="icon"><Play /></EmptyMedia>
                <EmptyTitle>Nothing to show yet</EmptyTitle>
                <EmptyDescription>{result.notice}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : result.sections ? (
            <ReportSections sections={result.sections} />
          ) : (
            <ReportResultTable result={result} />
          )}
        </>
      ) : running ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <Empty className="rounded-md border py-10">
          <EmptyHeader>
            <EmptyMedia variant="icon"><Play /></EmptyMedia>
            <EmptyTitle>Ready to run</EmptyTitle>
            <EmptyDescription>Fill in the filters above, then choose Run.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}
