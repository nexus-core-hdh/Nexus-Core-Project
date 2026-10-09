"use client";

import * as React from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  NodeTypes,
  Handle,
  Position,
  MarkerType
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Trash2,
  Save,
  Play,
  Pause,
  PlayCircle,
  GitBranch,
  Mail,
  Clock,
  User,
  FileEdit,
  Database,
  Webhook,
  CheckCircle,
  AlertCircle,
  X,
  GripVertical,
  Brackets,
  ChevronRight,
  ChevronDown,
  Repeat,
  CheckSquare,
  Tag,
  MessageSquare,
  Calculator,
  Search,
  Filter,
  TrendingUp,
  Calendar,
  FileText,
  GitMerge,
  Split,
  CircleCheck,
  ToggleLeft
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { permissionSettingsApi } from "@/lib/api";
import { toast } from "sonner";

import { DatePicker } from "@/components/ui/date-picker";
export type StepType = 
  | "START"
  | "CONDITION"
  | "ACTION"
  | "DELAY"
  | "NOTIFICATION"
  | "ASSIGNMENT"
  | "UPDATE_FIELD"
  | "CREATE_RECORD"
  | "SEND_EMAIL"
  | "WEBHOOK"
  | "LOOP"
  | "APPROVAL"
  | "TAG"
  | "COMMENT"
  | "CALCULATE"
  | "SEARCH"
  | "FILTER"
  | "ESCALATION"
  | "SCHEDULE_TASK"
  | "LOG"
  | "SPLIT"
  | "MERGE"
  | "DONE"
  | "SWITCH";

export type ConditionRule = {
  id: string;
  field: string;
  operator: string;
  value: string | number | boolean;
  dataType?: string;
};

export type ConditionGroup = {
  id: string;
  logic: "AND" | "OR";
  rules: ConditionRule[];
  groups?: ConditionGroup[]; // Nested groups support
};

export type ConditionConfig = {
  logic: "AND" | "OR";
  groups: ConditionGroup[];
  rules: ConditionRule[]; // Top-level rules for backward compatibility
};

type LegacyConditionConfig = {
  logic?: "AND" | "OR";
  rules?: Array<{
    id?: string;
    field?: string;
    operator?: string;
    value?: string | number | boolean;
    dataType?: string;
  }>;
  groups?: unknown;
};

type ConditionConfigLike = ConditionConfig | LegacyConditionConfig;

type WorkflowNodeData = {
  label: string;
  type: StepType;
  description?: string;
  config?: any;
  conditionConfig?: ConditionConfigLike;
};

export type WorkflowStep = {
  id: string;
  type: StepType;
  label: string;
  config?: any;
  conditionConfig?: ConditionConfig;
  position?: { x: number; y: number };
};

export type WorkflowEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
  condition?: string;
  conditionType?: "true" | "false";
  switchCase?: string;
};

export type WorkflowData = {
  steps: WorkflowStep[];
  edges: WorkflowEdge[];
};

interface WorkflowBuilderProps {
  initialData?: WorkflowData | null;
  onSave?: (data: WorkflowData) => void;
  onClose?: () => void;
  companyId?: number | null;
  branchId?: number | null;
}

const stepTypeConfig: Record<StepType, { label: string; icon: React.ComponentType<any>; color: string }> = {
  START: { label: "Start", icon: PlayCircle, color: "bg-green-600" },
  CONDITION: { label: "Condition", icon: GitBranch, color: "bg-blue-500" },
  ACTION: { label: "Action", icon: Play, color: "bg-green-500" },
  DELAY: { label: "Delay", icon: Clock, color: "bg-yellow-500" },
  NOTIFICATION: { label: "Notification", icon: AlertCircle, color: "bg-purple-500" },
  ASSIGNMENT: { label: "Assignment", icon: User, color: "bg-indigo-500" },
  UPDATE_FIELD: { label: "Update Field", icon: FileEdit, color: "bg-orange-500" },
  CREATE_RECORD: { label: "Create Record", icon: Database, color: "bg-teal-500" },
  SEND_EMAIL: { label: "Send Email", icon: Mail, color: "bg-pink-500" },
  WEBHOOK: { label: "Webhook", icon: Webhook, color: "bg-red-500" },
  LOOP: { label: "Loop", icon: Repeat, color: "bg-cyan-500" },
  APPROVAL: { label: "Approval", icon: CheckSquare, color: "bg-emerald-500" },
  TAG: { label: "Tag", icon: Tag, color: "bg-violet-500" },
  COMMENT: { label: "Comment", icon: MessageSquare, color: "bg-slate-500" },
  CALCULATE: { label: "Calculate", icon: Calculator, color: "bg-amber-500" },
  SEARCH: { label: "Search", icon: Search, color: "bg-sky-500" },
  FILTER: { label: "Filter", icon: Filter, color: "bg-rose-500" },
  ESCALATION: { label: "Escalation", icon: TrendingUp, color: "bg-fuchsia-500" },
  SCHEDULE_TASK: { label: "Schedule Task", icon: Calendar, color: "bg-lime-500" },
  LOG: { label: "Log", icon: FileText, color: "bg-stone-500" },
  SPLIT: { label: "Split", icon: Split, color: "bg-cyan-600" },
  MERGE: { label: "Merge", icon: GitMerge, color: "bg-indigo-600" },
  DONE: { label: "Done", icon: CircleCheck, color: "bg-green-700" },
  SWITCH: { label: "Switch", icon: ToggleLeft, color: "bg-blue-600" }
};

// Custom Node Component
function WorkflowNode({ data, selected }: { data: any; selected: boolean }) {
  const config = stepTypeConfig[data.type as StepType] || stepTypeConfig.ACTION;
  const Icon = config.icon;
  const isCondition = data.type === "CONDITION";
  const isStart = data.type === "START";
  const isDone = data.type === "DONE";
  const isSwitch = data.type === "SWITCH";
  const switchCases = data.config?.cases || [];

  return (
    <div
      className={`px-4 py-3 shadow-lg rounded-lg border-2 min-w-[180px] ${
        selected ? "border-primary" : "border-border"
      } ${config.color} bg-background`}>
      {!isStart && <Handle type="target" position={Position.Top} className="w-3 h-3" />}
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-foreground" />
        <div className="flex-1">
          <div className="font-semibold text-sm">{data.label || config.label}</div>
          {data.description && (
            <div className="text-xs text-muted-foreground mt-1 line-clamp-1">
              {data.description}
            </div>
          )}
          {isCondition && data.conditionConfig && (
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                {(() => {
                  const totalRules = (data.conditionConfig.rules?.length || 0) +
                    (data.conditionConfig.groups?.reduce((acc: number, g: ConditionGroup) => 
                      acc + (g.rules?.length || 0) + (g.groups?.reduce((nestedAcc: number, ng: ConditionGroup) => 
                        nestedAcc + (ng.rules?.length || 0), 0) || 0), 0) || 0);
                  return `${totalRules} rule${totalRules !== 1 ? 's' : ''}`;
                })()}
              </Badge>
              <span className="text-[10px]">{data.conditionConfig.logic}</span>
              {data.conditionConfig.groups && data.conditionConfig.groups.length > 0 && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                  {data.conditionConfig.groups.length} group{data.conditionConfig.groups.length !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>
          )}
          {isSwitch && switchCases.length > 0 && (
            <div className="text-xs text-muted-foreground mt-1">
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                {switchCases.length} case{switchCases.length !== 1 ? 's' : ''}
              </Badge>
            </div>
          )}
        </div>
      </div>
      {isCondition ? (
        <div className="flex gap-1 mt-2 justify-center">
          <Handle
            type="source"
            position={Position.Bottom}
            id="true"
            className="w-3 h-3 !bg-green-500"
            style={{ left: "30%" }}
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="false"
            className="w-3 h-3 !bg-red-500"
            style={{ left: "70%" }}
          />
        </div>
      ) : isSwitch ? (
        <div className="flex gap-1 mt-2 justify-center flex-wrap relative">
          {switchCases.length > 0 ? (
            switchCases.map((switchCase: any, index: number) => {
              // Distribute handles evenly across the width
              const totalCases = switchCases.length;
              const spacing = totalCases > 1 ? 100 / (totalCases - 1) : 50;
              const left = totalCases === 1 ? '50%' : `${(index / (totalCases - 1)) * 100}%`;
              return (
                <Handle
                  key={switchCase.id || index}
                  type="source"
                  position={Position.Bottom}
                  id={switchCase.id || `case-${index}`}
                  className="w-3 h-3 !bg-blue-500"
                  style={{ left, transform: 'translateX(-50%)' }}
                  data-label={switchCase.label || switchCase.value || `Case ${index + 1}`}
                />
              );
            })
          ) : (
            <Handle type="source" position={Position.Bottom} className="w-3 h-3 !bg-blue-500" id="default" />
          )}
        </div>
      ) : !isDone ? (
        <Handle type="source" position={Position.Bottom} className="w-3 h-3" />
      ) : null}
    </div>
  );
}

const nodeTypes: NodeTypes = {
  workflow: WorkflowNode
};

// Modern Condition Rule Component
function ConditionRuleComponent({
  rule,
  onUpdate,
  onRemove
}: {
  rule: ConditionRule;
  onUpdate: (ruleId: string, updates: Partial<ConditionRule>) => void;
  onRemove: (ruleId: string) => void;
}) {
  return (
    <Card className="border-l-4 border-l-blue-500">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Condition Rule</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onRemove(rule.id)}
            className="h-8 w-8 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs font-medium mb-1.5 block">Field</Label>
            <Select
              value={rule.field}
              onValueChange={(value) => onUpdate(rule.id, { field: value })}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select field" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lead.status">Lead: Status</SelectItem>
                <SelectItem value="lead.stage">Lead: Stage</SelectItem>
                <SelectItem value="lead.source">Lead: Source</SelectItem>
                <SelectItem value="lead.value">Lead: Value</SelectItem>
                <SelectItem value="lead.priority">Lead: Priority</SelectItem>
                <SelectItem value="lead.assignedTo">Lead: Assigned To</SelectItem>
                <SelectItem value="contact.type">Contact: Type</SelectItem>
                <SelectItem value="contact.email">Contact: Email</SelectItem>
                <SelectItem value="contact.phone">Contact: Phone</SelectItem>
                <SelectItem value="deal.stage">Deal: Stage</SelectItem>
                <SelectItem value="deal.value">Deal: Value</SelectItem>
                <SelectItem value="deal.probability">Deal: Probability</SelectItem>
                <SelectItem value="deal.status">Deal: Status</SelectItem>
                <SelectItem value="task.status">Task: Status</SelectItem>
                <SelectItem value="task.priority">Task: Priority</SelectItem>
                <SelectItem value="task.dueDate">Task: Due Date</SelectItem>
                <SelectItem value="user.role">User: Role</SelectItem>
                <SelectItem value="user.department">User: Department</SelectItem>
                <SelectItem value="custom.field">Custom: Field</SelectItem>
                <SelectItem value="workflow.variable">Workflow: Variable</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <Label className="text-xs font-medium mb-1.5 block">Operator</Label>
            <Select
              value={rule.operator}
              onValueChange={(value) => onUpdate(rule.id, { operator: value })}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="equals">Equals (=)</SelectItem>
                <SelectItem value="not_equals">Not Equals (≠)</SelectItem>
                <SelectItem value="contains">Contains</SelectItem>
                <SelectItem value="not_contains">Not Contains</SelectItem>
                <SelectItem value="starts_with">Starts With</SelectItem>
                <SelectItem value="ends_with">Ends With</SelectItem>
                <SelectItem value="greater_than">Greater Than (&gt;)</SelectItem>
                <SelectItem value="less_than">Less Than (&lt;)</SelectItem>
                <SelectItem value="greater_equal">Greater or Equal (≥)</SelectItem>
                <SelectItem value="less_equal">Less or Equal (≤)</SelectItem>
                <SelectItem value="is_empty">Is Empty</SelectItem>
                <SelectItem value="is_not_empty">Is Not Empty</SelectItem>
                <SelectItem value="is_true">Is True</SelectItem>
                <SelectItem value="is_false">Is False</SelectItem>
                <SelectItem value="in_list">In List</SelectItem>
                <SelectItem value="not_in_list">Not In List</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <Label className="text-xs font-medium mb-1.5 block">Value</Label>
            <Input
              value={rule.value?.toString() || ""}
              onChange={(e) =>
                onUpdate(rule.id, {
                  value: e.target.value,
                  dataType: rule.dataType || "text"
                })
              }
              placeholder="Value"
              className="h-9"
              type={
                rule.dataType === "number"
                  ? "number"
                  : rule.dataType === "date"
                  ? "date"
                  : "text"
              }
            />
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <Label className="text-xs text-muted-foreground">Data Type:</Label>
          <Select
            value={rule.dataType || "text"}
            onValueChange={(value) => onUpdate(rule.id, { dataType: value })}>
            <SelectTrigger className="h-8 w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="text">Text</SelectItem>
              <SelectItem value="number">Number</SelectItem>
              <SelectItem value="date">Date</SelectItem>
              <SelectItem value="boolean">Boolean</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}

// Modern Condition Group Component with nested support
function ConditionGroupComponent({
  group,
  groupId,
  onUpdateRule,
  onRemoveRule,
  onAddRule,
  onAddGroup,
  onRemoveGroup,
  onUpdateLogic,
  level = 0
}: {
  group: ConditionGroup;
  groupId: string;
  onUpdateRule: (ruleId: string, rule: Partial<ConditionRule>, groupId: string) => void;
  onRemoveRule: (ruleId: string, groupId: string) => void;
  onAddRule: (groupId: string) => void;
  onAddGroup: (parentId: string) => void;
  onRemoveGroup: (groupId: string) => void;
  onUpdateLogic: (groupId: string, logic: "AND" | "OR") => void;
  level?: number;
}) {
  const [isExpanded, setIsExpanded] = React.useState(true);
  const indentLevel = level * 24;

  return (
    <Card className={`border-l-4 ${level === 0 ? 'border-l-purple-500' : 'border-l-indigo-400'}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="h-7 w-7 p-0">
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
            <Brackets className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Group ({group.logic})</span>
            <Badge variant="outline" className="text-xs">
              {group.rules.length} rule{group.rules.length !== 1 ? 's' : ''}
              {group.groups && group.groups.length > 0 && `, ${group.groups.length} group${group.groups.length !== 1 ? 's' : ''}`}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={group.logic}
              onValueChange={(value) => onUpdateLogic(groupId, value as "AND" | "OR")}>
              <SelectTrigger className="h-8 w-full max-w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AND">AND</SelectItem>
                <SelectItem value="OR">OR</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onRemoveGroup(groupId)}
              className="h-8 w-8 p-0">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      
      {isExpanded && (
        <CardContent className="space-y-3" style={{ paddingLeft: `${indentLevel + 16}px` }}>
          {/* Rules in this group */}
          {group.rules.map((rule) => (
            <ConditionRuleComponent
              key={rule.id}
              rule={rule}
              onUpdate={(ruleId, updates) => onUpdateRule(ruleId, updates, groupId)}
              onRemove={(ruleId) => onRemoveRule(ruleId, groupId)}
            />
          ))}

          {/* Nested groups */}
          {group.groups && group.groups.length > 0 && (
            <div className="space-y-3">
              {group.groups.map((nestedGroup) => (
                <ConditionGroupComponent
                  key={nestedGroup.id}
                  group={nestedGroup}
                  groupId={nestedGroup.id}
                  onUpdateRule={onUpdateRule}
                  onRemoveRule={onRemoveRule}
                  onAddRule={onAddRule}
                  onAddGroup={onAddGroup}
                  onRemoveGroup={onRemoveGroup}
                  onUpdateLogic={onUpdateLogic}
                  level={level + 1}
                />
              ))}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onAddRule(groupId)}
              className="h-8">
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Rule
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onAddGroup(groupId)}
              className="h-8">
              <Brackets className="h-3.5 w-3.5 mr-1" />
              Add Nested Group
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export function WorkflowBuilder({ initialData, onSave, onClose, companyId, branchId }: WorkflowBuilderProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<WorkflowNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = React.useState<Node<WorkflowNodeData> | null>(null);
  const [nodeDialogOpen, setNodeDialogOpen] = React.useState(false);
  const [editingNode, setEditingNode] = React.useState<Node<WorkflowNodeData> | null>(null);
  const [nodeLabel, setNodeLabel] = React.useState("");
  const [nodeType, setNodeType] = React.useState<StepType>("ACTION");
  const [nodeDescription, setNodeDescription] = React.useState("");
  const [stepConfig, setStepConfig] = React.useState<any>({});
  const [conditionConfig, setConditionConfig] = React.useState<ConditionConfig>({
    logic: "AND",
    groups: [],
    rules: []
  });
  const [availableRoles, setAvailableRoles] = React.useState<Array<{ id: number; name: string; description?: string }>>([]);
  const [loadingRoles, setLoadingRoles] = React.useState(false);

  // Helper function to generate unique IDs
  const generateId = React.useCallback(() => `cond-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, []);

  const normalizeConditionConfig = React.useCallback(
    (input?: ConditionConfigLike): ConditionConfig => {
      if (!input || typeof input !== "object") {
        return { logic: "AND", groups: [], rules: [] };
      }

      const cfg = input as Partial<ConditionConfig> & LegacyConditionConfig;
      const logic: "AND" | "OR" = cfg.logic === "OR" ? "OR" : "AND";
      const groups = Array.isArray(cfg.groups) ? (cfg.groups as ConditionGroup[]) : [];
      const rules = Array.isArray(cfg.rules) ? (cfg.rules as ConditionRule[]) : [];
      return { logic, groups, rules };
    },
    []
  );

  // Fetch roles from database based on company and branch
  React.useEffect(() => {
    const fetchRoles = async () => {
      try {
        setLoadingRoles(true);
        // Fetch roles with companyId and branchId filters
        const roles = await permissionSettingsApi.getRoles(companyId || undefined, branchId || undefined);
        // Handle both array response and object with roles property
        const rolesList = Array.isArray(roles) ? roles : (roles.roles || roles.data || []);
        setAvailableRoles(rolesList.map((role: any) => ({
          id: role.id,
          name: role.name || role.label || role.roleName,
          description: role.description || role.name || role.label || role.roleName
        })));
      } catch (error: any) {
        console.error("Failed to fetch roles:", error);
        // Don't show error toast if it's just missing company/branch info
        if (companyId || branchId) {
          toast.error("Failed to load roles");
        }
      } finally {
        setLoadingRoles(false);
      }
    };

    fetchRoles();
  }, [companyId, branchId]);

  // Load initial data
  React.useEffect(() => {
    if (initialData) {
      const flowNodes: Node<WorkflowNodeData>[] = initialData.steps.map((step) => ({
        id: step.id,
        type: "workflow",
        position: step.position || { x: Math.random() * 400, y: Math.random() * 400 },
        data: {
          label: step.label,
          type: step.type,
          description: step.config?.description,
          config: step.config,
          conditionConfig: step.conditionConfig
        }
      }));

      const flowEdges: Edge[] = initialData.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { strokeWidth: 2 },
        data: { 
          conditionType: edge.conditionType,
          switchCase: edge.switchCase
        }
      }));

      // Check if Start node exists, if not add it
      const hasStartNode = flowNodes.some(node => node.data.type === "START");
      if (!hasStartNode) {
        const startNode: Node<any> = {
          id: "start-node",
          type: "workflow",
          position: { x: 400, y: 50 },
          data: {
            label: "Start",
            type: "START",
            description: "",
            config: {},
            conditionConfig: undefined
          }
        };
        flowNodes.unshift(startNode);
      }

      setNodes(flowNodes);
      setEdges(flowEdges);
    } else {
      // No initial data - create default Start node
      const startNode: Node<any> = {
        id: "start-node",
        type: "workflow",
        position: { x: 400, y: 50 },
        data: {
          label: "Start",
          type: "START",
          description: "",
          config: {},
          conditionConfig: undefined
        }
      };
      setNodes([startNode]);
      setEdges([]);
    }
  }, [initialData, setNodes, setEdges]);

  const onConnect = React.useCallback(
    (params: Connection) => {
      if (params.source && params.target) {
        const sourceNode = nodes.find((n) => n.id === params.source);
        // If source is a condition node, use sourceHandle to determine condition type
        if (sourceNode?.data.type === "CONDITION") {
          const conditionType = params.sourceHandle === "true" ? "true" : "false";
          const label = conditionType === "true" ? "Yes" : "No";

          setEdges((eds) =>
            addEdge(
              {
                ...params,
                markerEnd: { type: MarkerType.ArrowClosed },
                label,
                data: { conditionType },
                style: conditionType === "true" 
                  ? { stroke: "#22c55e", strokeWidth: 2 }
                  : { stroke: "#ef4444", strokeWidth: 2 }
              },
              eds
            )
          );
        } else if (sourceNode?.data.type === "SWITCH" && params.sourceHandle) {
          // If source is a switch node, use sourceHandle to get the case label
          const switchCases = (sourceNode.data.config as any)?.cases || [];
          const switchCase = switchCases.find((c: any) => (c.id || `case-${switchCases.indexOf(c)}`) === params.sourceHandle);
          const label = switchCase?.label || switchCase?.value || params.sourceHandle;

          setEdges((eds) =>
            addEdge(
              {
                ...params,
                markerEnd: { type: MarkerType.ArrowClosed },
                label,
                data: { switchCase: params.sourceHandle },
                style: { stroke: "#3b82f6", strokeWidth: 2 }
              },
              eds
            )
          );
        } else {
          setEdges((eds) =>
            addEdge({ ...params, markerEnd: { type: MarkerType.ArrowClosed } }, eds)
          );
        }
      }
    },
    [setEdges, nodes]
  );

  const onNodeClick = React.useCallback((_event: React.MouseEvent, node: Node<any>) => {
    setSelectedNode(node);
    setEditingNode(node);
    setNodeLabel(node.data.label || "");
    setNodeType(node.data.type || "ACTION");
    setNodeDescription(node.data.description || "");
    // Initialize config based on node type
    const defaultConfig = node.data.type === "SWITCH" ? { cases: [] } : {};
    setStepConfig(node.data.config || defaultConfig);
    setConditionConfig(node.data.conditionConfig || { logic: "AND", groups: [], rules: [] });
    setNodeDialogOpen(true);
  }, []);

  const onPaneClick = React.useCallback(() => {
    setSelectedNode(null);
  }, []);

  const handleAddNode = (type: StepType) => {
    const config = stepTypeConfig[type];
    const initialConfig = type === "SWITCH" ? { cases: [] } : type === "CONDITION" ? {} : {};
    const newNode: Node<any> = {
      id: `node-${Date.now()}`,
      type: "workflow",
      position: { x: Math.random() * 400 + 100, y: Math.random() * 400 + 100 },
      data: {
        label: config.label,
        type: type,
        description: "",
        config: initialConfig,
        conditionConfig: type === "CONDITION" ? { logic: "AND", groups: [], rules: [] } : undefined
      }
    };
    setNodes((nds) => [...nds, newNode]);
    setEditingNode(newNode);
    setNodeLabel(config.label);
    setNodeType(type);
    setNodeDescription("");
    setStepConfig(initialConfig);
    setConditionConfig(type === "CONDITION" ? { logic: "AND", groups: [], rules: [] } : { logic: "AND", groups: [], rules: [] });
    setNodeDialogOpen(true);
  };

  const handleDeleteNode = () => {
    if (selectedNode) {
      // Prevent deletion of Start node
      if (selectedNode.data.type === "START") {
        toast.error("Cannot delete the Start node. It is required for all workflows.");
        return;
      }
      setNodes((nds) => nds.filter((node) => node.id !== selectedNode.id));
      setEdges((eds) =>
        eds.filter((edge) => edge.source !== selectedNode.id && edge.target !== selectedNode.id)
      );
      setSelectedNode(null);
    }
  };

  const handleSaveNode = () => {
    if (editingNode) {
      setNodes((nds) =>
        nds.map((node) =>
          node.id === editingNode.id
            ? {
                ...node,
                data: {
                  ...node.data,
                  label: nodeLabel,
                  type: nodeType,
                  description: nodeDescription,
                  config: stepConfig,
                  conditionConfig: nodeType === "CONDITION" ? conditionConfig : undefined
                }
              }
            : node
        )
      );
      setNodeDialogOpen(false);
      setEditingNode(null);
    }
  };

  // Initialize condition config with backward compatibility
  React.useEffect(() => {
    if (editingNode && editingNode.data.type === "CONDITION") {
      const existingConfig = editingNode.data.conditionConfig;
      if (existingConfig) {
        const cfg = existingConfig as LegacyConditionConfig;
        // Check if it's old format (has rules but no groups)
        if (Array.isArray(cfg.rules) && (!("groups" in cfg) || !Array.isArray(cfg.groups))) {
          // Migrate old format to new format
          const migratedGroups: ConditionGroup[] = cfg.rules.length > 0 ? [{
            id: generateId(),
            logic: cfg.logic || "AND",
            rules: cfg.rules.map((r) => ({
              id: r.id || generateId(),
              field: r.field || "",
              operator: r.operator || "equals",
              value: r.value || "",
              dataType: r.dataType || "text"
            })),
            groups: []
          }] : [];
          setConditionConfig({
            logic: cfg.logic || "AND",
            groups: migratedGroups,
            rules: []
          });
        } else {
          // New format or already migrated
          setConditionConfig(normalizeConditionConfig(existingConfig));
        }
      }
    }
  }, [editingNode]);

  // Recursive helper to find and update groups
  const updateGroupRecursive = (
    groups: ConditionGroup[],
    targetId: string,
    updater: (group: ConditionGroup) => ConditionGroup
  ): ConditionGroup[] => {
    return groups.map(group => {
      if (group.id === targetId) {
        return updater(group);
      }
      if (group.groups && group.groups.length > 0) {
        return {
          ...group,
          groups: updateGroupRecursive(group.groups, targetId, updater)
        };
      }
      return group;
    });
  };

  const addConditionRule = (groupId?: string) => {
    const newRule: ConditionRule = {
      id: generateId(),
      field: "",
      operator: "equals",
      value: "",
      dataType: "text"
    };

    if (groupId) {
      // Add rule to specific group (can be nested)
      setConditionConfig({
        ...conditionConfig,
        groups: updateGroupRecursive(conditionConfig.groups, groupId, (group) => ({
          ...group,
          rules: [...group.rules, newRule]
        }))
      });
    } else {
      // Add to top-level rules (backward compatibility)
      setConditionConfig({
        ...conditionConfig,
        rules: [...conditionConfig.rules, newRule]
      });
    }
  };

  const updateConditionRule = (ruleId: string, rule: Partial<ConditionRule>, groupId?: string) => {
    if (groupId) {
      setConditionConfig({
        ...conditionConfig,
        groups: updateGroupRecursive(conditionConfig.groups, groupId, (group) => ({
          ...group,
          rules: group.rules.map(r => r.id === ruleId ? { ...r, ...rule } : r)
        }))
      });
    } else {
      setConditionConfig({
        ...conditionConfig,
        rules: conditionConfig.rules.map(r =>
          r.id === ruleId ? { ...r, ...rule } : r
        )
      });
    }
  };

  const removeConditionRule = (ruleId: string, groupId?: string) => {
    if (groupId) {
      setConditionConfig({
        ...conditionConfig,
        groups: updateGroupRecursive(conditionConfig.groups, groupId, (group) => ({
          ...group,
          rules: group.rules.filter(r => r.id !== ruleId)
        }))
      });
    } else {
      setConditionConfig({
        ...conditionConfig,
        rules: conditionConfig.rules.filter(r => r.id !== ruleId)
      });
    }
  };

  const addConditionGroup = (parentGroupId?: string) => {
    const newGroup: ConditionGroup = {
      id: generateId(),
      logic: "AND",
      rules: [],
      groups: []
    };

    if (parentGroupId) {
      // Add nested group
      setConditionConfig({
        ...conditionConfig,
        groups: updateGroupRecursive(conditionConfig.groups, parentGroupId, (group) => ({
          ...group,
          groups: [...(group.groups || []), newGroup]
        }))
      });
    } else {
      // Add top-level group
      setConditionConfig({
        ...conditionConfig,
        groups: [...conditionConfig.groups, newGroup]
      });
    }
  };

  const removeConditionGroup = (groupId: string) => {
    // Recursive removal
    const removeFromGroups = (groups: ConditionGroup[]): ConditionGroup[] => {
      return groups
        .filter(g => g.id !== groupId)
        .map(group => ({
          ...group,
          groups: group.groups ? removeFromGroups(group.groups) : []
        }));
    };

    setConditionConfig({
      ...conditionConfig,
      groups: removeFromGroups(conditionConfig.groups)
    });
  };

  const updateGroupLogic = (groupId: string, logic: "AND" | "OR") => {
    setConditionConfig({
      ...conditionConfig,
      groups: updateGroupRecursive(conditionConfig.groups, groupId, (group) => ({
        ...group,
        logic
      }))
    });
  };

  const handleSaveWorkflow = () => {
    const workflowData: WorkflowData = {
      steps: nodes.map((node) => ({
        id: node.id,
        type: node.data.type,
        label: node.data.label,
        config: {
          description: node.data.description,
          ...node.data.config
        },
        conditionConfig:
          node.data.type === "CONDITION"
            ? normalizeConditionConfig(node.data.conditionConfig)
            : undefined,
        position: node.position
      })),
      edges: edges.map((edge) => {
        const label = typeof edge.label === "string" ? edge.label : undefined;
        const condition = typeof edge.data?.condition === "string" ? edge.data.condition : undefined;
        const conditionType =
          edge.data?.conditionType === "true" || edge.data?.conditionType === "false"
            ? edge.data.conditionType
            : undefined;
        const switchCase = typeof edge.data?.switchCase === "string" ? edge.data.switchCase : undefined;

        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          label,
          condition,
          conditionType,
          switchCase
        };
      })
    };

    if (onSave) {
      onSave(workflowData);
    }
  };

  const handleDeleteEdge = (edgeId: string) => {
    setEdges((eds) => eds.filter((edge) => edge.id !== edgeId));
  };

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="flex items-center justify-between p-4 border-b bg-card">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Workflow Builder</h2>
          </div>
          <Badge variant="outline" className="font-medium">
            {nodes.length} {nodes.length === 1 ? 'step' : 'steps'}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Add Step
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {Object.entries(stepTypeConfig)
                .filter(([type]) => type !== "START") // Don't show START in dropdown as it's automatic
                .map(([type, config]) => {
                  const Icon = config.icon;
                  return (
                    <DropdownMenuItem key={type} onClick={() => handleAddNode(type as StepType)} className="gap-2">
                      <Icon className="h-4 w-4" />
                      {config.label}
                    </DropdownMenuItem>
                  );
                })}
            </DropdownMenuContent>
          </DropdownMenu>
          {selectedNode && (
            <Button variant="destructive" size="sm" onClick={handleDeleteNode} className="gap-2">
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          )}
          <Button onClick={handleSaveWorkflow} size="sm" className="gap-2">
            <Save className="h-4 w-4" />
            Save Workflow
          </Button>
          {onClose && (
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onEdgeDoubleClick={(_, edge) => handleDeleteEdge(edge.id)}
          nodeTypes={nodeTypes}
          fitView
          className="bg-muted/20">
          <Background />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </div>

      <Dialog open={nodeDialogOpen} onOpenChange={setNodeDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {(() => {
                const Icon = stepTypeConfig[nodeType]?.icon;
                return Icon ? <Icon className="h-5 w-5" /> : null;
              })()}
              Configure Step: {stepTypeConfig[nodeType]?.label}
            </DialogTitle>
            <DialogDescription>
              Configure the details and settings for this workflow step. Use the condition builder to create complex logic flows.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            {/* Basic Information */}
            <div className="space-y-4">
              <div className="border-b pb-2">
                <h4 className="font-semibold">Basic Information</h4>
              </div>
              <div>
                <Label>Step Type</Label>
                <Select 
                  value={nodeType} 
                  onValueChange={(value) => setNodeType(value as StepType)}
                  disabled={nodeType === "START"}>
                  <SelectTrigger className="mt-1 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(stepTypeConfig)
                      .filter(([type]) => type !== "START") // Don't allow changing Start node type
                      .map(([type, config]) => (
                        <SelectItem key={type} value={type}>
                          {config.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {nodeType === "START" && (
                  <p className="text-xs text-muted-foreground mt-1">
                    The Start node type cannot be changed. It is the entry point of the workflow.
                  </p>
                )}
              </div>
              <div>
                <Label>Label *</Label>
                <Input
                  value={nodeLabel}
                  onChange={(e) => setNodeLabel(e.target.value)}
                  placeholder="Step label"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  value={nodeDescription}
                  onChange={(e) => setNodeDescription(e.target.value)}
                  placeholder="Step description"
                  rows={3}
                  className="mt-1"
                />
              </div>
            </div>

            {/* Condition Configuration - Modern Builder */}
            {nodeType === "CONDITION" && (
              <div className="space-y-6">
                <Separator />
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold text-base mb-1">Condition Builder</h4>
                    <p className="text-sm text-muted-foreground">
                      Build complex conditions with multiple rules and nested groups. Use groups to organize conditions with AND/OR logic.
                    </p>
                  </div>
                  
                  <div>
                    <Label className="text-sm font-medium mb-2 block">Top-Level Logic</Label>
                    <RadioGroup
                      value={conditionConfig.logic}
                      onValueChange={(value) =>
                        setConditionConfig({ ...conditionConfig, logic: value as "AND" | "OR" })
                      }
                      className="flex gap-4">
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="AND" id="and" />
                        <Label htmlFor="and" className="font-normal cursor-pointer text-sm">
                          AND - All groups must be true
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="OR" id="or" />
                        <Label htmlFor="or" className="font-normal cursor-pointer text-sm">
                          OR - At least one group must be true
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  {/* Condition Groups */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">Condition Groups</Label>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => addConditionGroup()}>
                          <Brackets className="h-4 w-4 mr-1" />
                          Add Group
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => addConditionRule()}>
                          <Plus className="h-4 w-4 mr-1" />
                          Add Rule
                        </Button>
                      </div>
                    </div>

                    {/* Render Condition Groups */}
                    {conditionConfig.groups && conditionConfig.groups.length > 0 ? (
                      <div className="space-y-3">
                        {conditionConfig.groups.map((group) => (
                          <ConditionGroupComponent
                            key={group.id}
                            group={group}
                            groupId={group.id}
                            onUpdateRule={updateConditionRule}
                            onRemoveRule={removeConditionRule}
                            onAddRule={addConditionRule}
                            onAddGroup={addConditionGroup}
                            onRemoveGroup={removeConditionGroup}
                            onUpdateLogic={updateGroupLogic}
                            level={0}
                          />
                        ))}
                      </div>
                    ) : null}

                    {/* Render Top-Level Rules (backward compatibility) */}
                    {conditionConfig.rules && conditionConfig.rules.length > 0 ? (
                      <div className="space-y-3">
                        {conditionConfig.rules.map((rule) => (
                          <ConditionRuleComponent
                            key={rule.id}
                            rule={rule}
                            onUpdate={(ruleId, updates) => updateConditionRule(ruleId, updates)}
                            onRemove={(ruleId) => removeConditionRule(ruleId)}
                          />
                        ))}
                      </div>
                    ) : null}

                    {/* Empty State */}
                    {(!conditionConfig.groups || conditionConfig.groups.length === 0) &&
                     (!conditionConfig.rules || conditionConfig.rules.length === 0) && (
                      <Card className="border-dashed">
                        <CardContent className="flex flex-col items-center justify-center py-8 text-center">
                          <GitBranch className="h-10 w-10 text-muted-foreground mb-3" />
                          <p className="text-sm font-medium mb-1">No conditions defined</p>
                          <p className="text-xs text-muted-foreground mb-4">
                            Add rules or groups to create your condition logic
                          </p>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => addConditionGroup()}>
                              <Brackets className="h-4 w-4 mr-1" />
                              Add Group
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => addConditionRule()}>
                              <Plus className="h-4 w-4 mr-1" />
                              Add Rule
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Action Configuration */}
            {nodeType === "ACTION" && (
              <div className="space-y-4">
                <Separator />
                <div className="border-b pb-2">
                  <h4 className="font-semibold">Action Configuration</h4>
                </div>
                <div>
                  <Label>Action Type</Label>
                  <Select
                    value={stepConfig.actionType || ""}
                    onValueChange={(value) =>
                      setStepConfig({ ...stepConfig, actionType: value })
                    }>
                    <SelectTrigger className="mt-1 w-full">
                      <SelectValue placeholder="Select action" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="update_record">Update Record</SelectItem>
                      <SelectItem value="create_record">Create Record</SelectItem>
                      <SelectItem value="delete_record">Delete Record</SelectItem>
                      <SelectItem value="move_stage">Move to Stage</SelectItem>
                      <SelectItem value="assign_user">Assign User</SelectItem>
                      <SelectItem value="set_field">Set Field Value</SelectItem>
                      <SelectItem value="calculate">Calculate Value</SelectItem>
                      <SelectItem value="merge_records">Merge Records</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {stepConfig.actionType && (
                  <div>
                    <Label>Target Record</Label>
                    <Select
                      value={stepConfig.targetRecord || ""}
                      onValueChange={(value) =>
                        setStepConfig({ ...stepConfig, targetRecord: value })
                      }>
                      <SelectTrigger className="mt-1 w-full">
                        <SelectValue placeholder="Select record type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lead">Lead</SelectItem>
                        <SelectItem value="contact">Contact</SelectItem>
                        <SelectItem value="deal">Deal</SelectItem>
                        <SelectItem value="company">Company</SelectItem>
                        <SelectItem value="task">Task</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}

            {/* Delay Configuration */}
            {nodeType === "DELAY" && (
              <div className="space-y-4">
                <Separator />
                <div className="border-b pb-2">
                  <h4 className="font-semibold">Delay Configuration</h4>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Duration</Label>
                    <Input
                      type="number"
                      value={stepConfig.duration || ""}
                      onChange={(e) =>
                        setStepConfig({ ...stepConfig, duration: parseInt(e.target.value) || 0 })
                      }
                      placeholder="0"
                      className="mt-1"
                      min="0"
                    />
                  </div>
                  <div>
                    <Label>Unit</Label>
                    <Select
                      value={stepConfig.unit || "minutes"}
                      onValueChange={(value) =>
                        setStepConfig({ ...stepConfig, unit: value })
                      }>
                      <SelectTrigger className="mt-1 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="seconds">Seconds</SelectItem>
                        <SelectItem value="minutes">Minutes</SelectItem>
                        <SelectItem value="hours">Hours</SelectItem>
                        <SelectItem value="days">Days</SelectItem>
                        <SelectItem value="weeks">Weeks</SelectItem>
                        <SelectItem value="months">Months</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Delay Type</Label>
                  <Select
                    value={stepConfig.delayType || "fixed"}
                    onValueChange={(value) =>
                      setStepConfig({ ...stepConfig, delayType: value })
                    }>
                    <SelectTrigger className="mt-1 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">Fixed Duration</SelectItem>
                      <SelectItem value="until_date">Until Specific Date</SelectItem>
                      <SelectItem value="until_time">Until Specific Time</SelectItem>
                      <SelectItem value="business_hours">Business Hours Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Email Configuration */}
            {nodeType === "SEND_EMAIL" && (
              <div className="space-y-4">
                <Separator />
                <div className="border-b pb-2">
                  <h4 className="font-semibold">Email Configuration</h4>
                </div>
                <div>
                  <Label>Email Template</Label>
                  <Select
                    value={stepConfig.template || ""}
                    onValueChange={(value) =>
                      setStepConfig({ ...stepConfig, template: value })
                    }>
                    <SelectTrigger className="mt-1 w-full">
                      <SelectValue placeholder="Select template" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="custom">Custom Email</SelectItem>
                      <SelectItem value="welcome">Welcome Email</SelectItem>
                      <SelectItem value="notification">Notification</SelectItem>
                      <SelectItem value="follow_up">Follow Up</SelectItem>
                      <SelectItem value="reminder">Reminder</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Recipient *</Label>
                  <Input
                    value={stepConfig.recipient || ""}
                    onChange={(e) =>
                      setStepConfig({ ...stepConfig, recipient: e.target.value })
                    }
                    placeholder="email@example.com or {{lead.email}}"
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Use <code className="text-xs">{"{{variable}}"}</code> to reference workflow data
                  </p>
                </div>
                <div>
                  <Label>Subject *</Label>
                  <Input
                    value={stepConfig.subject || ""}
                    onChange={(e) =>
                      setStepConfig({ ...stepConfig, subject: e.target.value })
                    }
                    placeholder="Email subject"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Body</Label>
                  <Textarea
                    value={stepConfig.body || ""}
                    onChange={(e) =>
                      setStepConfig({ ...stepConfig, body: e.target.value })
                    }
                    placeholder="Email body content (HTML supported)"
                    rows={6}
                    className="mt-1"
                  />
                </div>
              </div>
            )}

            {/* Notification Configuration */}
            {nodeType === "NOTIFICATION" && (
              <div className="space-y-4">
                <Separator />
                <div className="border-b pb-2">
                  <h4 className="font-semibold">Notification Configuration</h4>
                </div>
                <div>
                  <Label>Notification Type</Label>
                  <Select
                    value={stepConfig.notificationType || ""}
                    onValueChange={(value) =>
                      setStepConfig({ ...stepConfig, notificationType: value })
                    }>
                    <SelectTrigger className="mt-1 w-full">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in_app">In-App Notification</SelectItem>
                      <SelectItem value="email">Email Notification</SelectItem>
                      <SelectItem value="sms">SMS Notification</SelectItem>
                      <SelectItem value="push">Push Notification</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Recipient</Label>
                  <Input
                    value={stepConfig.recipient || ""}
                    onChange={(e) =>
                      setStepConfig({ ...stepConfig, recipient: e.target.value })
                    }
                    placeholder="User ID, email, or {{user.id}}"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Message *</Label>
                  <Textarea
                    value={stepConfig.message || ""}
                    onChange={(e) =>
                      setStepConfig({ ...stepConfig, message: e.target.value })
                    }
                    placeholder="Notification message"
                    rows={4}
                    className="mt-1"
                  />
                </div>
              </div>
            )}

            {/* Assignment Configuration */}
            {nodeType === "ASSIGNMENT" && (
              <div className="space-y-4">
                <Separator />
                <div className="border-b pb-2">
                  <h4 className="font-semibold">Assignment Configuration</h4>
                </div>
                <div>
                  <Label>Assign To</Label>
                  <Select
                    value={stepConfig.assignTo || ""}
                    onValueChange={(value) =>
                      setStepConfig({ ...stepConfig, assignTo: value })
                    }>
                    <SelectTrigger className="mt-1 w-full">
                      <SelectValue placeholder="Select assignment type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">Specific User</SelectItem>
                      <SelectItem value="role">User Role</SelectItem>
                      <SelectItem value="team">Team</SelectItem>
                      <SelectItem value="round_robin">Round Robin</SelectItem>
                      <SelectItem value="least_busy">Least Busy</SelectItem>
                      <SelectItem value="workload_based">Workload Based</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {stepConfig.assignTo && (
                  <div>
                    <Label>Target Record</Label>
                    <Select
                      value={stepConfig.targetRecord || ""}
                      onValueChange={(value) =>
                        setStepConfig({ ...stepConfig, targetRecord: value })
                      }>
                    <SelectTrigger className="mt-1 w-full">
                      <SelectValue placeholder="Select record" />
                    </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lead">Lead</SelectItem>
                        <SelectItem value="contact">Contact</SelectItem>
                        <SelectItem value="deal">Deal</SelectItem>
                        <SelectItem value="task">Task</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}

            {/* Update Field Configuration */}
            {nodeType === "UPDATE_FIELD" && (
              <div className="space-y-4">
                <Separator />
                <div className="border-b pb-2">
                  <h4 className="font-semibold">Field Update Configuration</h4>
                </div>
                <div>
                  <Label>Target Record</Label>
                  <Select
                    value={stepConfig.targetRecord || ""}
                    onValueChange={(value) =>
                      setStepConfig({ ...stepConfig, targetRecord: value })
                    }>
                    <SelectTrigger className="mt-1 w-full">
                      <SelectValue placeholder="Select record type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lead">Lead</SelectItem>
                      <SelectItem value="contact">Contact</SelectItem>
                      <SelectItem value="deal">Deal</SelectItem>
                      <SelectItem value="company">Company</SelectItem>
                      <SelectItem value="task">Task</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Field Name *</Label>
                  <Input
                    value={stepConfig.fieldName || ""}
                    onChange={(e) =>
                      setStepConfig({ ...stepConfig, fieldName: e.target.value })
                    }
                    placeholder="e.g., status, stage, priority"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>New Value *</Label>
                  <Input
                    value={stepConfig.fieldValue || ""}
                    onChange={(e) =>
                      setStepConfig({ ...stepConfig, fieldValue: e.target.value })
                    }
                    placeholder="New field value or {{variable}}"
                    className="mt-1"
                  />
                </div>
              </div>
            )}

            {/* Create Record Configuration */}
            {nodeType === "CREATE_RECORD" && (
              <div className="space-y-4">
                <Separator />
                <div className="border-b pb-2">
                  <h4 className="font-semibold">Record Creation Configuration</h4>
                </div>
                <div>
                  <Label>Record Type *</Label>
                  <Select
                    value={stepConfig.recordType || ""}
                    onValueChange={(value) =>
                      setStepConfig({ ...stepConfig, recordType: value })
                    }>
                    <SelectTrigger className="mt-1 w-full">
                      <SelectValue placeholder="Select record type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lead">Lead</SelectItem>
                      <SelectItem value="contact">Contact</SelectItem>
                      <SelectItem value="deal">Deal</SelectItem>
                      <SelectItem value="company">Company</SelectItem>
                      <SelectItem value="task">Task</SelectItem>
                      <SelectItem value="note">Note</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Initial Data (JSON) *</Label>
                  <Textarea
                    value={stepConfig.initialData || ""}
                    onChange={(e) =>
                      setStepConfig({ ...stepConfig, initialData: e.target.value })
                    }
                    placeholder='{"name": "{{lead.name}}", "email": "{{lead.email}}"}'
                    rows={6}
                    className="mt-1 font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Use JSON format. Reference previous step data with <code className="text-xs">{"{{variable}}"}</code>
                  </p>
                </div>
              </div>
            )}

            {/* Webhook Configuration */}
            {nodeType === "WEBHOOK" && (
              <div className="space-y-4">
                <Separator />
                <div className="border-b pb-2">
                  <h4 className="font-semibold">Webhook Configuration</h4>
                </div>
                <div>
                  <Label>Webhook URL *</Label>
                  <Input
                    value={stepConfig.url || ""}
                    onChange={(e) =>
                      setStepConfig({ ...stepConfig, url: e.target.value })
                    }
                    placeholder="https://api.example.com/webhook"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>HTTP Method</Label>
                  <Select
                    value={stepConfig.method || "POST"}
                    onValueChange={(value) =>
                      setStepConfig({ ...stepConfig, method: value })
                    }>
                    <SelectTrigger className="mt-1 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GET">GET</SelectItem>
                      <SelectItem value="POST">POST</SelectItem>
                      <SelectItem value="PUT">PUT</SelectItem>
                      <SelectItem value="PATCH">PATCH</SelectItem>
                      <SelectItem value="DELETE">DELETE</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Headers (JSON)</Label>
                  <Textarea
                    value={stepConfig.headers || ""}
                    onChange={(e) =>
                      setStepConfig({ ...stepConfig, headers: e.target.value })
                    }
                    placeholder='{"Authorization": "Bearer token", "Content-Type": "application/json"}'
                    rows={3}
                    className="mt-1 font-mono text-sm"
                  />
                </div>
                <div>
                  <Label>Body (JSON)</Label>
                  <Textarea
                    value={stepConfig.body || ""}
                    onChange={(e) =>
                      setStepConfig({ ...stepConfig, body: e.target.value })
                    }
                    placeholder='{"data": "{{previous_step.data}}"}'
                    rows={4}
                    className="mt-1 font-mono text-sm"
                  />
                </div>
              </div>
            )}

            {/* Loop Configuration */}
            {nodeType === "LOOP" && (
              <div className="space-y-4">
                <Separator />
                <div className="border-b pb-2">
                  <h4 className="font-semibold">Loop Configuration</h4>
                </div>
                <div>
                  <Label>Loop Type *</Label>
                  <Select
                    value={stepConfig.loopType || ""}
                    onValueChange={(value) =>
                      setStepConfig({ ...stepConfig, loopType: value })
                    }>
                    <SelectTrigger className="mt-1 w-full">
                      <SelectValue placeholder="Select loop type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="foreach">For Each Record</SelectItem>
                      <SelectItem value="while">While Condition</SelectItem>
                      <SelectItem value="count">Count Based</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {stepConfig.loopType === "foreach" && (
                  <div>
                    <Label>Record Collection *</Label>
                    <Input
                      value={stepConfig.collection || ""}
                      onChange={(e) =>
                        setStepConfig({ ...stepConfig, collection: e.target.value })
                      }
                      placeholder="e.g., {{leads}}, {{tasks}}"
                      className="mt-1"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Reference to a collection of records to iterate over
                    </p>
                  </div>
                )}
                {stepConfig.loopType === "count" && (
                  <div>
                    <Label>Count *</Label>
                    <Input
                      type="number"
                      value={stepConfig.count || ""}
                      onChange={(e) =>
                        setStepConfig({ ...stepConfig, count: parseInt(e.target.value) || 0 })
                      }
                      placeholder="Number of iterations"
                      className="mt-1"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Approval Configuration */}
            {nodeType === "APPROVAL" && (
              <div className="space-y-4">
                <Separator />
                <div className="border-b pb-2">
                  <h4 className="font-semibold">Approval Configuration</h4>
                </div>
                <div>
                  <Label>Approval Type *</Label>
                  <Select
                    value={stepConfig.approvalType || ""}
                    onValueChange={(value) =>
                      setStepConfig({ ...stepConfig, approvalType: value })
                    }>
                    <SelectTrigger className="mt-1 w-full">
                      <SelectValue placeholder="Select approval type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="single">Single Approver</SelectItem>
                      <SelectItem value="multiple">Multiple Approvers</SelectItem>
                      <SelectItem value="sequential">Sequential Approval</SelectItem>
                      <SelectItem value="parallel">Parallel Approval</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label>Approvers (Users)</Label>
                  <Input
                    value={stepConfig.approvers || ""}
                    onChange={(e) =>
                      setStepConfig({ ...stepConfig, approvers: e.target.value })
                    }
                    placeholder="User IDs or emails (comma-separated)"
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Enter specific user IDs or emails separated by commas
                  </p>
                </div>

                <div>
                  <Label>Approver Roles</Label>
                  <div className="space-y-2 mt-1">
                    {loadingRoles ? (
                      <div className="border rounded-lg p-4 bg-muted/20 text-center text-sm text-muted-foreground">
                        Loading roles...
                      </div>
                    ) : availableRoles.length === 0 ? (
                      <div className="border rounded-lg p-4 bg-muted/20 text-center">
                        <p className="text-sm text-muted-foreground">
                          {companyId || branchId 
                            ? "No roles found for this company/branch" 
                            : "Company/Branch information not available. Roles cannot be loaded."}
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="border rounded-lg p-3 bg-muted/20 max-h-48 overflow-y-auto">
                          {(() => {
                            const selectedRoles = stepConfig.approverRoles || [];
                            
                            return (
                              <div className="space-y-2">
                                {availableRoles.map((role) => {
                                  const isSelected = selectedRoles.includes(role.id.toString()) || selectedRoles.includes(role.id);
                                  return (
                                    <div
                                      key={role.id}
                                      onClick={() => {
                                        const currentRoles = selectedRoles;
                                        const roleId = role.id.toString();
                                        if (isSelected) {
                                          setStepConfig({
                                            ...stepConfig,
                                            approverRoles: currentRoles.filter((r: string | number) => 
                                              r.toString() !== roleId && r !== role.id
                                            )
                                          });
                                        } else {
                                          setStepConfig({
                                            ...stepConfig,
                                            approverRoles: [...currentRoles, roleId]
                                          });
                                        }
                                      }}
                                      className={`flex items-start gap-2 p-2 border rounded-md cursor-pointer transition-colors ${
                                        isSelected
                                          ? "border-primary bg-primary/5"
                                          : "border-border hover:bg-accent/50"
                                      }`}>
                                      <Checkbox
                                        checked={isSelected}
                                        onCheckedChange={() => {
                                          const currentRoles = selectedRoles;
                                          const roleId = role.id.toString();
                                          if (isSelected) {
                                            setStepConfig({
                                              ...stepConfig,
                                              approverRoles: currentRoles.filter((r: string | number) => 
                                                r.toString() !== roleId && r !== role.id
                                              )
                                            });
                                          } else {
                                            setStepConfig({
                                              ...stepConfig,
                                              approverRoles: [...currentRoles, roleId]
                                            });
                                          }
                                        }}
                                        className="mt-0.5"
                                      />
                                      <div className="flex-1">
                                        <div className="text-sm font-medium">{role.name}</div>
                                        {role.description && (
                                          <div className="text-xs text-muted-foreground">{role.description}</div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </div>
                        {stepConfig.approverRoles && stepConfig.approverRoles.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {stepConfig.approverRoles.map((roleId: string | number) => {
                              const role = availableRoles.find(r => r.id.toString() === roleId.toString() || r.id === roleId);
                              return role ? (
                                <Badge key={role.id} variant="secondary" className="text-xs">
                                  {role.name}
                                </Badge>
                              ) : null;
                            })}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Select roles - any user with these roles can approve. Users with selected roles will be able to approve this request.
                  </p>
                </div>

                <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg">
                  <p className="text-xs text-blue-900 dark:text-blue-100">
                    <strong>Note:</strong> If both users and roles are specified, approval can come from either the specified users OR any user with the selected roles.
                  </p>
                </div>

                <div>
                  <Label>Timeout (hours)</Label>
                  <Input
                    type="number"
                    value={stepConfig.timeout || ""}
                    onChange={(e) =>
                      setStepConfig({ ...stepConfig, timeout: parseInt(e.target.value) || 0 })
                    }
                    placeholder="0 (no timeout)"
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Auto-reject if not approved within this time (0 = no timeout)
                  </p>
                </div>
              </div>
            )}

            {/* Tag Configuration */}
            {nodeType === "TAG" && (
              <div className="space-y-4">
                <Separator />
                <div className="border-b pb-2">
                  <h4 className="font-semibold">Tag Configuration</h4>
                </div>
                <div>
                  <Label>Target Record Type *</Label>
                  <Select
                    value={stepConfig.targetRecord || ""}
                    onValueChange={(value) =>
                      setStepConfig({ ...stepConfig, targetRecord: value })
                    }>
                    <SelectTrigger className="mt-1 w-full">
                      <SelectValue placeholder="Select record type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lead">Lead</SelectItem>
                      <SelectItem value="contact">Contact</SelectItem>
                      <SelectItem value="deal">Deal</SelectItem>
                      <SelectItem value="company">Company</SelectItem>
                      <SelectItem value="task">Task</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Tags *</Label>
                  <Input
                    value={stepConfig.tags || ""}
                    onChange={(e) =>
                      setStepConfig({ ...stepConfig, tags: e.target.value })
                    }
                    placeholder="tag1, tag2, tag3"
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Enter tags separated by commas
                  </p>
                </div>
                <div>
                  <Label>Action</Label>
                  <Select
                    value={stepConfig.tagAction || "add"}
                    onValueChange={(value) =>
                      setStepConfig({ ...stepConfig, tagAction: value })
                    }>
                    <SelectTrigger className="mt-1 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="add">Add Tags</SelectItem>
                      <SelectItem value="remove">Remove Tags</SelectItem>
                      <SelectItem value="replace">Replace All Tags</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Comment Configuration */}
            {nodeType === "COMMENT" && (
              <div className="space-y-4">
                <Separator />
                <div className="border-b pb-2">
                  <h4 className="font-semibold">Comment Configuration</h4>
                </div>
                <div>
                  <Label>Target Record Type *</Label>
                  <Select
                    value={stepConfig.targetRecord || ""}
                    onValueChange={(value) =>
                      setStepConfig({ ...stepConfig, targetRecord: value })
                    }>
                    <SelectTrigger className="mt-1 w-full">
                      <SelectValue placeholder="Select record type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lead">Lead</SelectItem>
                      <SelectItem value="contact">Contact</SelectItem>
                      <SelectItem value="deal">Deal</SelectItem>
                      <SelectItem value="company">Company</SelectItem>
                      <SelectItem value="task">Task</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Comment *</Label>
                  <Textarea
                    value={stepConfig.comment || ""}
                    onChange={(e) =>
                      setStepConfig({ ...stepConfig, comment: e.target.value })
                    }
                    placeholder="Enter comment text..."
                    rows={4}
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Use <code className="text-xs">{"{{variable}}"}</code> to reference workflow data
                  </p>
                </div>
                <div>
                  <Label>Comment Type</Label>
                  <Select
                    value={stepConfig.commentType || "note"}
                    onValueChange={(value) =>
                      setStepConfig({ ...stepConfig, commentType: value })
                    }>
                    <SelectTrigger className="mt-1 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="note">Note</SelectItem>
                      <SelectItem value="internal">Internal Note</SelectItem>
                      <SelectItem value="public">Public Comment</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Calculate Configuration */}
            {nodeType === "CALCULATE" && (
              <div className="space-y-4">
                <Separator />
                <div className="border-b pb-2">
                  <h4 className="font-semibold">Calculate Configuration</h4>
                </div>
                <div>
                  <Label>Formula *</Label>
                  <Input
                    value={stepConfig.formula || ""}
                    onChange={(e) =>
                      setStepConfig({ ...stepConfig, formula: e.target.value })
                    }
                    placeholder="e.g., {{deal.value}} * 0.1"
                    className="mt-1 font-mono"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Use mathematical expressions with variables (e.g., +, -, *, /, %)
                  </p>
                </div>
                <div>
                  <Label>Result Variable Name *</Label>
                  <Input
                    value={stepConfig.resultVariable || ""}
                    onChange={(e) =>
                      setStepConfig({ ...stepConfig, resultVariable: e.target.value })
                    }
                    placeholder="e.g., calculatedValue"
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Name of the variable to store the calculation result
                  </p>
                </div>
              </div>
            )}

            {/* Search Configuration */}
            {nodeType === "SEARCH" && (
              <div className="space-y-4">
                <Separator />
                <div className="border-b pb-2">
                  <h4 className="font-semibold">Search Configuration</h4>
                </div>
                <div>
                  <Label>Record Type *</Label>
                  <Select
                    value={stepConfig.recordType || ""}
                    onValueChange={(value) =>
                      setStepConfig({ ...stepConfig, recordType: value })
                    }>
                    <SelectTrigger className="mt-1 w-full">
                      <SelectValue placeholder="Select record type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lead">Lead</SelectItem>
                      <SelectItem value="contact">Contact</SelectItem>
                      <SelectItem value="deal">Deal</SelectItem>
                      <SelectItem value="company">Company</SelectItem>
                      <SelectItem value="task">Task</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Search Criteria *</Label>
                  <Textarea
                    value={stepConfig.searchCriteria || ""}
                    onChange={(e) =>
                      setStepConfig({ ...stepConfig, searchCriteria: e.target.value })
                    }
                    placeholder='{"field": "email", "operator": "equals", "value": "{{lead.email}}"}'
                    rows={4}
                    className="mt-1 font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    JSON format with search criteria
                  </p>
                </div>
                <div>
                  <Label>Result Variable Name *</Label>
                  <Input
                    value={stepConfig.resultVariable || ""}
                    onChange={(e) =>
                      setStepConfig({ ...stepConfig, resultVariable: e.target.value })
                    }
                    placeholder="e.g., foundRecords"
                    className="mt-1"
                  />
                </div>
              </div>
            )}

            {/* Filter Configuration */}
            {nodeType === "FILTER" && (
              <div className="space-y-4">
                <Separator />
                <div className="border-b pb-2">
                  <h4 className="font-semibold">Filter Configuration</h4>
                </div>
                <div>
                  <Label>Input Collection *</Label>
                  <Input
                    value={stepConfig.inputCollection || ""}
                    onChange={(e) =>
                      setStepConfig({ ...stepConfig, inputCollection: e.target.value })
                    }
                    placeholder="e.g., {{records}}"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Filter Criteria *</Label>
                  <Textarea
                    value={stepConfig.filterCriteria || ""}
                    onChange={(e) =>
                      setStepConfig({ ...stepConfig, filterCriteria: e.target.value })
                    }
                    placeholder='{"field": "status", "operator": "equals", "value": "active"}'
                    rows={4}
                    className="mt-1 font-mono text-sm"
                  />
                </div>
                <div>
                  <Label>Output Variable Name *</Label>
                  <Input
                    value={stepConfig.outputVariable || ""}
                    onChange={(e) =>
                      setStepConfig({ ...stepConfig, outputVariable: e.target.value })
                    }
                    placeholder="e.g., filteredRecords"
                    className="mt-1"
                  />
                </div>
              </div>
            )}

            {/* Escalation Configuration */}
            {nodeType === "ESCALATION" && (
              <div className="space-y-4">
                <Separator />
                <div className="border-b pb-2">
                  <h4 className="font-semibold">Escalation Configuration</h4>
                </div>
                <div>
                  <Label>Escalation Type *</Label>
                  <Select
                    value={stepConfig.escalationType || ""}
                    onValueChange={(value) =>
                      setStepConfig({ ...stepConfig, escalationType: value })
                    }>
                    <SelectTrigger className="mt-1 w-full">
                      <SelectValue placeholder="Select escalation type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manager">Escalate to Manager</SelectItem>
                      <SelectItem value="specific">Escalate to Specific User</SelectItem>
                      <SelectItem value="role">Escalate to Role</SelectItem>
                      <SelectItem value="team">Escalate to Team</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {stepConfig.escalationType && (
                  <div>
                    <Label>Escalate To *</Label>
                    <Input
                      value={stepConfig.escalateTo || ""}
                      onChange={(e) =>
                        setStepConfig({ ...stepConfig, escalateTo: e.target.value })
                      }
                      placeholder="User ID, email, role, or team name"
                      className="mt-1"
                    />
                  </div>
                )}
                <div>
                  <Label>Reason</Label>
                  <Textarea
                    value={stepConfig.reason || ""}
                    onChange={(e) =>
                      setStepConfig({ ...stepConfig, reason: e.target.value })
                    }
                    placeholder="Reason for escalation..."
                    rows={3}
                    className="mt-1"
                  />
                </div>
              </div>
            )}

            {/* Schedule Task Configuration */}
            {nodeType === "SCHEDULE_TASK" && (
              <div className="space-y-4">
                <Separator />
                <div className="border-b pb-2">
                  <h4 className="font-semibold">Schedule Task Configuration</h4>
                </div>
                <div>
                  <Label>Task Title *</Label>
                  <Input
                    value={stepConfig.taskTitle || ""}
                    onChange={(e) =>
                      setStepConfig({ ...stepConfig, taskTitle: e.target.value })
                    }
                    placeholder="Task title"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Task Description</Label>
                  <Textarea
                    value={stepConfig.taskDescription || ""}
                    onChange={(e) =>
                      setStepConfig({ ...stepConfig, taskDescription: e.target.value })
                    }
                    placeholder="Task description"
                    rows={3}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Assign To *</Label>
                  <Input
                    value={stepConfig.assignTo || ""}
                    onChange={(e) =>
                      setStepConfig({ ...stepConfig, assignTo: e.target.value })
                    }
                    placeholder="User ID or email"
                    className="mt-1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Due Date</Label>
                    <DatePicker
                      value={stepConfig.dueDate || ""}
                      onChange={(e) =>
                        setStepConfig({ ...stepConfig, dueDate: e.target.value })
                      }
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Priority</Label>
                    <Select
                      value={stepConfig.priority || "medium"}
                      onValueChange={(value) =>
                        setStepConfig({ ...stepConfig, priority: value })
                      }>
                      <SelectTrigger className="mt-1 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            {/* Log Configuration */}
            {nodeType === "LOG" && (
              <div className="space-y-4">
                <Separator />
                <div className="border-b pb-2">
                  <h4 className="font-semibold">Log Configuration</h4>
                </div>
                <div>
                  <Label>Log Level *</Label>
                  <Select
                    value={stepConfig.logLevel || "info"}
                    onValueChange={(value) =>
                      setStepConfig({ ...stepConfig, logLevel: value })
                    }>
                    <SelectTrigger className="mt-1 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="debug">Debug</SelectItem>
                      <SelectItem value="info">Info</SelectItem>
                      <SelectItem value="warning">Warning</SelectItem>
                      <SelectItem value="error">Error</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Log Message *</Label>
                  <Textarea
                    value={stepConfig.logMessage || ""}
                    onChange={(e) =>
                      setStepConfig({ ...stepConfig, logMessage: e.target.value })
                    }
                    placeholder="Log message..."
                    rows={4}
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Use <code className="text-xs">{"{{variable}}"}</code> to reference workflow data
                  </p>
                </div>
              </div>
            )}

            {/* Split Configuration */}
            {nodeType === "SPLIT" && (
              <div className="space-y-4">
                <Separator />
                <div className="border-b pb-2">
                  <h4 className="font-semibold">Split Configuration</h4>
                </div>
                <div>
                  <Label>Split Type *</Label>
                  <Select
                    value={stepConfig.splitType || "parallel"}
                    onValueChange={(value) =>
                      setStepConfig({ ...stepConfig, splitType: value })
                    }>
                    <SelectTrigger className="mt-1 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="parallel">Parallel Split</SelectItem>
                      <SelectItem value="conditional">Conditional Split</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Number of Paths *</Label>
                  <Input
                    type="number"
                    value={stepConfig.paths || ""}
                    onChange={(e) =>
                      setStepConfig({ ...stepConfig, paths: parseInt(e.target.value) || 2 })
                    }
                    placeholder="2"
                    min="2"
                    max="10"
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Number of parallel paths to create (2-10)
                  </p>
                </div>
              </div>
            )}

            {/* Merge Configuration */}
            {nodeType === "MERGE" && (
              <div className="space-y-4">
                <Separator />
                <div className="border-b pb-2">
                  <h4 className="font-semibold">Merge Configuration</h4>
                </div>
                <div>
                  <Label>Merge Type *</Label>
                  <Select
                    value={stepConfig.mergeType || "all"}
                    onValueChange={(value) =>
                      setStepConfig({ ...stepConfig, mergeType: value })
                    }>
                    <SelectTrigger className="mt-1 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Wait for All</SelectItem>
                      <SelectItem value="first">First to Complete</SelectItem>
                      <SelectItem value="any">Any One</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    How to merge multiple incoming paths
                  </p>
                </div>
              </div>
            )}

            {/* Switch Configuration */}
            {nodeType === "SWITCH" && (
              <div className="space-y-4">
                <Separator />
                <div className="border-b pb-2">
                  <h4 className="font-semibold">Switch Configuration</h4>
                </div>
                <div>
                  <Label>Field to Check *</Label>
                  <Input
                    value={stepConfig.field || ""}
                    onChange={(e) =>
                      setStepConfig({ ...stepConfig, field: e.target.value })
                    }
                    placeholder="e.g., {{lead.status}}, {{deal.stage}}"
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Field or variable to check. Use <code className="text-xs">{"{{variable}}"}</code> to reference workflow data
                  </p>
                </div>
                <div>
                  <Label>Switch Cases *</Label>
                  <div className="space-y-3 mt-2">
                    {(stepConfig.cases || []).map((switchCase: any, index: number) => (
                      <Card key={switchCase.id || index} className="border-l-4 border-l-blue-500">
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <GripVertical className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm font-medium">Case {index + 1}</span>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const newCases = (stepConfig.cases || []).filter((_: any, i: number) => i !== index);
                                setStepConfig({ ...stepConfig, cases: newCases });
                              }}
                              className="h-8 w-8 p-0">
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label className="text-xs font-medium mb-1.5 block">Value *</Label>
                              <Input
                                value={switchCase.value || ""}
                                onChange={(e) => {
                                  const newCases = [...(stepConfig.cases || [])];
                                  newCases[index] = { ...switchCase, value: e.target.value };
                                  setStepConfig({ ...stepConfig, cases: newCases });
                                }}
                                placeholder="Value to match"
                                className="h-9"
                              />
                            </div>
                            <div>
                              <Label className="text-xs font-medium mb-1.5 block">Label</Label>
                              <Input
                                value={switchCase.label || ""}
                                onChange={(e) => {
                                  const newCases = [...(stepConfig.cases || [])];
                                  newCases[index] = { ...switchCase, label: e.target.value };
                                  setStepConfig({ ...stepConfig, cases: newCases });
                                }}
                                placeholder="Display label (optional)"
                                className="h-9"
                              />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const newCase = {
                          id: `case-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                          value: "",
                          label: ""
                        };
                        setStepConfig({
                          ...stepConfig,
                          cases: [...(stepConfig.cases || []), newCase]
                        });
                      }}
                      className="w-full">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Case
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Define cases based on the field value. Each case will create an output connection point.
                  </p>
                </div>
              </div>
            )}

            {/* Done Configuration */}
            {nodeType === "DONE" && (
              <div className="space-y-4">
                <Separator />
                <div className="border-b pb-2">
                  <h4 className="font-semibold">Done Configuration</h4>
                </div>
                <div className="p-4 bg-muted/30 rounded-lg border">
                  <div className="flex items-start gap-2">
                    <CircleCheck className="h-5 w-5 text-green-600 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium mb-1">Workflow End Point</p>
                      <p className="text-xs text-muted-foreground">
                        This step marks the end of the workflow. No further steps will execute after this point.
                        The workflow will be considered complete when it reaches this step.
                      </p>
                    </div>
                  </div>
                </div>
                <div>
                  <Label>Completion Message (Optional)</Label>
                  <Textarea
                    value={stepConfig.completionMessage || ""}
                    onChange={(e) =>
                      setStepConfig({ ...stepConfig, completionMessage: e.target.value })
                    }
                    placeholder="Optional message to display when workflow completes..."
                    rows={3}
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Optional message to log or display when the workflow reaches this step
                  </p>
                </div>
              </div>
            )}

            <Separator />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setNodeDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveNode} disabled={!nodeLabel}>
                Save Step
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

