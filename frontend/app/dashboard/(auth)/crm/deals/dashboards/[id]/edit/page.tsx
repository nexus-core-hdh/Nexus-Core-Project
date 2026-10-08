"use client";

import * as React from "react";
import { useWorkspaceRecordLabel } from "@/hooks/use-workspace-tab-title";
import { useRouter } from "next/navigation";
import { use } from "react";
import {
  dealDashboardsApi,
  userRolesApi,
  usersApi,
  formTemplatesApi,
  entityDataApi,
  dealPipelinesApi,
  DealDashboardVisibility
} from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { DealFilterQueryInput } from "../../components/deal-filter-query-input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DealQueryAst, parseDealQuery } from "@/lib/deal-advanced-query";

export default function EditDealDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  const dashboardId = parseInt(id);

  const user = getCurrentUser();

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const [name, setName] = React.useState("");
  useWorkspaceRecordLabel(name || undefined);
  const [description, setDescription] = React.useState("");

  const [text, setText] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [pipelineId, setPipelineId] = React.useState<string>("");
  const [stageId, setStageId] = React.useState<string>("__any__");
  const [status, setStatus] = React.useState<string>("__any__");
  const [priority, setPriority] = React.useState<string>("__any__");
  const [assigneeName, setAssigneeName] = React.useState<string>("__any__");

  const [pipelines, setPipelines] = React.useState<Array<{ id: number; name: string }>>([]);
  const [stages, setStages] = React.useState<Array<{ id: number; name: string }>>([]);

  const [fieldNames, setFieldNames] = React.useState<string[]>([]);
  const [valueSuggestionsByField, setValueSuggestionsByField] = React.useState<Record<string, Array<string | number>>>(
    {}
  );

  const [visibility, setVisibility] = React.useState<DealDashboardVisibility>("PRIVATE");
  const [sharedRoleIds, setSharedRoleIds] = React.useState<number[]>([]);
  const [sharedUserIds, setSharedUserIds] = React.useState<number[]>([]);
  const [roles, setRoles] = React.useState<any[]>([]);
  const [users, setUsers] = React.useState<any[]>([]);

  const [widgetsEnabled, setWidgetsEnabled] = React.useState(true);
  const [basicFromAdvancedError, setBasicFromAdvancedError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const loadRoles = async () => {
      try {
        const data = await userRolesApi.getUserRoles(user?.companyId ?? undefined, user?.branchId ?? undefined);
        setRoles(Array.isArray(data) ? data : []);
      } catch {
        setRoles([]);
      }
    };
    loadRoles();
  }, [user?.companyId, user?.branchId]);

  React.useEffect(() => {
    const loadUsers = async () => {
      try {
        const data = await usersApi.getUsers();
        const all = Array.isArray(data) ? data : [];
        const scoped = user?.companyId ? all.filter((u: any) => u.companyId === user.companyId) : all;
        setUsers(scoped);
      } catch {
        setUsers([]);
      }
    };
    loadUsers();
  }, [user?.companyId]);

  React.useEffect(() => {
    const loadPipelines = async () => {
      try {
        const data = await dealPipelinesApi.getDealPipelines(user?.companyId ?? undefined, user?.branchId ?? undefined);
        setPipelines(Array.isArray(data) ? data : []);
      } catch {
        setPipelines([]);
      }
    };
    loadPipelines();
  }, [user?.companyId, user?.branchId]);

  React.useEffect(() => {
    const loadStages = async () => {
      if (!pipelineId) {
        setStages([]);
        setStageId("__any__");
        return;
      }
      const pid = parseInt(pipelineId, 10);
      if (Number.isNaN(pid)) return;
      try {
        const data = await dealPipelinesApi.getPipelineStages(pid);
        setStages(Array.isArray(data) ? data : []);
      } catch {
        setStages([]);
      }
    };
    loadStages();
  }, [pipelineId]);

  const toggleRole = (rid: number) => {
    setSharedRoleIds((prev) => (prev.includes(rid) ? prev.filter((x) => x !== rid) : [...prev, rid]));
  };

  const toggleUser = (uid: number) => {
    setSharedUserIds((prev) => (prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]));
  };

  const applyLoadedFilter = (filter: any) => {
    const f = filter || {};
    setText(f.text ?? "");
    setQuery(f.query ?? "");
    setPipelineId(f.pipelineId ? String(f.pipelineId) : "");
    setStageId(Array.isArray(f.stageIds) && f.stageIds.length > 0 ? String(f.stageIds[0]) : "__any__");
    setStatus(f.status ? String(f.status) : "__any__");
    setPriority(f.priority ? String(f.priority) : "__any__");
    setAssigneeName(f.assigneeName ? String(f.assigneeName) : "__any__");
  };

  React.useEffect(() => {
    const load = async () => {
      if (Number.isNaN(dashboardId)) {
        toast.error("Invalid dashboard id");
        router.push("/dashboard/crm/deals/dashboards");
        return;
      }
      try {
        setLoading(true);
        const d = await dealDashboardsApi.get(dashboardId);
        setName(d.name || "");
        setDescription(d.description || "");
        setVisibility((d.visibility as DealDashboardVisibility) || "PRIVATE");
        applyLoadedFilter(d.filter);
        setSharedRoleIds(Array.isArray(d.roleShareRoleIds) ? d.roleShareRoleIds : []);
        setSharedUserIds(Array.isArray(d.userShareUserIds) ? d.userShareUserIds : []);
        const layout = d.layout || {};
        setWidgetsEnabled(!!layout.widgetsEnabled);
      } catch (e: any) {
        console.error(e);
        toast.error(e?.message || "Failed to load dashboard");
        router.push("/dashboard/crm/deals/dashboards");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [dashboardId, router]);

  React.useEffect(() => {
    const loadFieldNames = async () => {
      try {
        const templates = await formTemplatesApi.getFormTemplates(
          user?.companyId ?? undefined,
          user?.branchId ?? undefined,
          "DEAL",
          true
        );
        const active = Array.isArray(templates)
          ? templates.find((t: any) => t.entityType === "DEAL" && t.isActive)
          : null;
        const fields = Array.isArray(active?.formFields) ? active.formFields : [];
        const fromTemplate = fields
          .map((f: any) => String(f?.name || "").trim())
          .filter(Boolean);

        let fromSample: string[] = [];
        try {
          const list = await entityDataApi.getEntityDataByType("DEAL", {
            companyId: user?.companyId ?? undefined,
            branchId: user?.branchId ?? undefined
          });
          const first = Array.isArray(list) ? list[0] : null;
          const data = first && typeof first.data === "object" && first.data ? first.data : null;
          fromSample = data ? Object.keys(data) : [];
        } catch {
          // ignore
        }

        const merged = Array.from(new Set([...fromTemplate, ...fromSample, "amount", "status", "priority", "stageId"]));
        merged.sort((a, b) => a.localeCompare(b));
        setFieldNames(merged);

        const selectFields = fields
          .filter((f: any) => String(f?.type || "").toLowerCase() === "select" && Array.isArray(f?.options))
          .map((f: any) => ({ name: String(f.name), options: f.options as any[] }));
        const map: Record<string, Array<string | number>> = {
          status: ["completed", "inProgress", "notStarted"],
          priority: ["high", "medium", "low"],
          ...Object.fromEntries(
            selectFields.map((sf: any) => [
              sf.name,
              (sf.options || []).map((o: any) => (typeof o === "string" ? o : o?.value ?? o?.label)).filter(Boolean),
            ])
          ),
        };
        if (users.length > 0) {
          map.assigneeName = users.map((u: any) => u.name).filter(Boolean);
        }
        setValueSuggestionsByField(map);
      } catch {
        setFieldNames(["amount", "status", "priority", "stageId"]);
      }
    };
    loadFieldNames();
  }, [user?.companyId, user?.branchId, users]);

  const buildFilter = () => {
    const filter: any = {};
    if (text.trim()) filter.text = text.trim();
    if (query.trim()) filter.query = query.trim();
    if (pipelineId) {
      const n = parseInt(pipelineId, 10);
      if (!Number.isNaN(n)) filter.pipelineId = n;
    }
    if (stageId && stageId !== "__any__") filter.stageIds = [parseInt(stageId, 10)];
    if (status && status !== "__any__") filter.status = status;
    if (priority && priority !== "__any__") filter.priority = priority;
    if (assigneeName && assigneeName !== "__any__") filter.assigneeName = assigneeName;
    return filter;
  };

  const compileBasicToAdvanced = () => {
    const parts: string[] = [];
    if (pipelineId) {
      const pid = parseInt(pipelineId, 10);
      if (!Number.isNaN(pid) && stages.length > 0) {
        parts.push(`stageId IN (${stages.map((s) => s.id).join(",")})`);
      }
    }
    if (stageId && stageId !== "__any__") parts.push(`stageId = ${stageId}`);
    if (status && status !== "__any__") parts.push(`status = ${status}`);
    if (priority && priority !== "__any__") parts.push(`priority = ${priority}`);
    if (assigneeName && assigneeName !== "__any__") parts.push(`assigneeName CONTAINS \"${assigneeName.replace(/\"/g, "\\\"")}\"`);
    return parts.join(" AND ");
  };

  const tryConvertAdvancedToBasic = (q: string) => {
    const parsed = parseDealQuery(q);
    if (!parsed.ok) return { ok: false as const, error: parsed.error };

    const clauses: Array<{ field: string; op: string; value?: any }> = [];
    const walk = (ast: DealQueryAst): boolean => {
      if (ast.kind === "and") return walk(ast.left) && walk(ast.right);
      if (ast.kind === "clause") {
        clauses.push({ field: ast.field, op: ast.op, value: ast.value });
        return true;
      }
      return false;
    };
    if (!walk(parsed.ast)) {
      return { ok: false as const, error: "Query is too complex to convert to Basic (OR / groups)." };
    }

    let nextStageId = "__any__";
    let nextStatus = "__any__";
    let nextPriority = "__any__";
    let nextAssignee = "__any__";

    for (const c of clauses) {
      if (c.field === "stageId" && (c.op === "=" || c.op === "in")) {
        if (c.op === "=") nextStageId = String(c.value);
        if (c.op === "in" && Array.isArray(c.value) && c.value.length === 1) nextStageId = String(c.value[0]);
      }
      if (c.field === "status" && c.op === "=") nextStatus = String(c.value);
      if (c.field === "priority" && c.op === "=") nextPriority = String(c.value);
      if (c.field === "assigneeName" && c.op === "contains") nextAssignee = String(c.value);
    }

    return {
      ok: true as const,
      values: {
        stageId: nextStageId,
        status: nextStatus,
        priority: nextPriority,
        assigneeName: nextAssignee,
      },
    };
  };

  const buildLayout = () => {
    return {
      version: 1,
      board: "deals-kanban",
      widgetsEnabled,
    };
  };

  const buildWidgets = () => {
    if (!widgetsEnabled) return [];
    return [
      { id: "w-summary", type: "stat_row", title: "Summary", config: { metrics: ["count"] } },
      { id: "w-pipeline", type: "pipeline_breakdown", title: "By stage", config: { kind: "bar" } },
    ];
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      await dealDashboardsApi.update(dashboardId, {
        name: name.trim(),
        description: description.trim() || undefined,
        filter: buildFilter(),
        layout: buildLayout(),
        widgets: buildWidgets(),
        visibility,
        sharedRoleIds: visibility === "ROLES" ? sharedRoleIds : [],
        sharedUserIds: visibility === "USERS" ? sharedUserIds : [],
      });
      toast.success("Dashboard updated");
      router.replace("/dashboard/crm/deals/dashboards");
      router.refresh();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to update dashboard");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Edit Deal Dashboard</h1>
        <p className="text-muted-foreground text-sm">Update the saved filter, sharing, and widgets.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Basics</CardTitle>
          <CardDescription>Name and sharing.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>

          <div className="space-y-2">
            <Label>Visibility</Label>
            <Select value={visibility} onValueChange={(v) => setVisibility(v as DealDashboardVisibility)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PRIVATE">Private (only me)</SelectItem>
                <SelectItem value="COMPANY">Company (everyone in company)</SelectItem>
                <SelectItem value="ROLES">Shared with roles</SelectItem>
                <SelectItem value="USERS">Shared with specific users</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {visibility === "ROLES" ? (
            <div className="space-y-2">
              <Label>Roles</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {roles.map((r) => (
                  <label key={r.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={sharedRoleIds.includes(r.id)} onChange={() => toggleRole(r.id)} />
                    <span className="truncate">{r.name}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          {visibility === "USERS" ? (
            <div className="space-y-2">
              <Label>Users</Label>
              <div className="max-h-56 overflow-auto border rounded-md p-2 space-y-2">
                {users.map((u) => (
                  <label key={u.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={sharedUserIds.includes(u.id)} onChange={() => toggleUser(u.id)} />
                    <span className="truncate">
                      {u.name} <span className="text-muted-foreground">({u.email})</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Filter</CardTitle>
          <CardDescription>Applied via `?df=` when you open the dashboard.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs
            defaultValue="basic"
            className="w-full"
            onValueChange={(v) => {
              if (v === "advanced" && !query.trim()) {
                const next = compileBasicToAdvanced();
                if (next) setQuery(next);
              }
              if (v === "basic" && query.trim()) {
                const converted = tryConvertAdvancedToBasic(query);
                if (!converted.ok) {
                  setBasicFromAdvancedError(converted.error);
                  return;
                }
                setBasicFromAdvancedError(null);
                setQuery("");
                setStageId(converted.values.stageId);
                setStatus(converted.values.status);
                setPriority(converted.values.priority);
                setAssigneeName(converted.values.assigneeName);
              }
            }}
          >
            <TabsList>
              <TabsTrigger value="basic">Basic</TabsTrigger>
              <TabsTrigger value="advanced">Advanced</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="pt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Pipeline</Label>
                  <Select value={pipelineId || "__any__"} onValueChange={(v) => setPipelineId(v === "__any__" ? "" : v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Any" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__any__">Any</SelectItem>
                      {pipelines.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Stage</Label>
                  <Select value={stageId} onValueChange={setStageId} disabled={!pipelineId || stages.length === 0}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={pipelineId ? "Any" : "Select pipeline first"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__any__">Any</SelectItem>
                      {stages.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={status} onValueChange={setStatus} disabled={query.trim().length > 0}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__any__">Any</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="inProgress">In Progress</SelectItem>
                      <SelectItem value="notStarted">Not Started</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select value={priority} onValueChange={setPriority} disabled={query.trim().length > 0}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__any__">Any</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label>Assignee</Label>
                  <Select value={assigneeName} onValueChange={setAssigneeName} disabled={query.trim().length > 0}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Any" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__any__">Any</SelectItem>
                      {users.map((u) => (
                        <SelectItem key={u.id} value={u.name}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {query.trim().length > 0 ? (
                  <div className="text-xs text-muted-foreground md:col-span-2">
                    Advanced query is set, so Basic filters are ignored.
                  </div>
                ) : null}

                {basicFromAdvancedError ? (
                  <div className="text-xs text-destructive md:col-span-2">
                    {basicFromAdvancedError}
                  </div>
                ) : null}
              </div>
            </TabsContent>

            <TabsContent value="advanced" className="pt-4">
              <div className="space-y-2">
                <Label>Advanced query</Label>
                <DealFilterQueryInput
                  value={query}
                  onChange={setQuery}
                  fieldNames={fieldNames}
                  valueSuggestionsByField={valueSuggestionsByField}
                  placeholder="e.g. amount >= 1000 AND status = inProgress"
                />
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Layout / Widgets</CardTitle>
          <CardDescription>Toggle the widget strip (stored as JSON).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-medium">Enable widget strip</div>
              <div className="text-sm text-muted-foreground">Renderer can be upgraded without losing saved config.</div>
            </div>
            <Switch checked={widgetsEnabled} onCheckedChange={setWidgetsEnabled} />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button variant="outline" onClick={() => router.back()} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
