"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { accessControlsApi, usersApi, leadStagesApi, dealPipelinesApi } from "@/lib/api";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { getCurrentUser } from "@/lib/auth";

const accessControlFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  resource: z.string().min(1, "Resource is required"),
  action: z.string().min(1, "Action is required"),
  conditions: z.any().optional(), // JSON object for conditions
  isActive: z.boolean().default(true)
});

type AccessControlFormValues = z.input<typeof accessControlFormSchema>;

interface AccessControlDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accessControl?: AccessControl | null;
  onSuccess?: () => void;
}

type AccessControl = {
  id: number;
  name: string;
  resource: string;
  action: string;
  conditions?: any;
  isActive: boolean;
  companyId?: number | null;
  branchId?: number | null;
};

const resourceOptions = [
  { value: "leads", label: "Leads" },
  { value: "contacts", label: "Contacts" },
  { value: "deals", label: "Deals" },
  { value: "companies", label: "Companies" },
  { value: "reports", label: "Reports" },
  { value: "settings", label: "Settings" },
  { value: "users", label: "Users" },
  { value: "tasks", label: "Tasks" },
  { value: "documents", label: "Documents" },
  { value: "invoices", label: "Invoices" },
  { value: "estimates", label: "Estimates" }
];

const actionOptions = [
  { value: "read", label: "Read" },
  { value: "write", label: "Write" },
  { value: "delete", label: "Delete" },
  { value: "manage", label: "Manage" },
  { value: "export", label: "Export" },
  { value: "import", label: "Import" },
  { value: "drag-drop", label: "Drag & Drop" }
];

export function AccessControlDialog({
  open,
  onOpenChange,
  accessControl,
  onSuccess
}: AccessControlDialogProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [users, setUsers] = React.useState<any[]>([]);
  const [stages, setStages] = React.useState<any[]>([]);
  const [pipelines, setPipelines] = React.useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = React.useState(false);
  const [loadingStages, setLoadingStages] = React.useState(false);
  const [loadingPipelines, setLoadingPipelines] = React.useState(false);
  const [selectedUserIds, setSelectedUserIds] = React.useState<number[]>([]);
  const [fromStageIds, setFromStageIds] = React.useState<number[]>([]);
  const [toStageIds, setToStageIds] = React.useState<number[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = React.useState<number | null>(null);

  const form = useForm<AccessControlFormValues>({
    resolver: zodResolver(accessControlFormSchema),
    defaultValues: {
      name: "",
      resource: "",
      action: "",
      conditions: null,
      isActive: true
    }
  });

  // Load users when dialog opens
  React.useEffect(() => {
    if (open) {
      const loadUsers = async () => {
        try {
          setLoadingUsers(true);
          const user = getCurrentUser();
          const usersData = await usersApi.getUsers();
          // Filter users by same company/branch
          const filteredUsers = Array.isArray(usersData)
            ? usersData.filter((u: any) => 
                u.companyId === user?.companyId && 
                (user?.branchId === null || u.branchId === user?.branchId)
              )
            : [];
          setUsers(filteredUsers);
        } catch (error) {
          console.error("Failed to load users:", error);
        } finally {
          setLoadingUsers(false);
        }
      };
      loadUsers();
    }
  }, [open]);

  // Load pipelines when resource is deals
  const resource = form.watch("resource");
  const action = form.watch("action");
  
  React.useEffect(() => {
    if (open && resource === "deals" && action === "drag-drop") {
      const loadPipelines = async () => {
        try {
          setLoadingPipelines(true);
          const user = getCurrentUser();
          const pipelinesData = await dealPipelinesApi.getDealPipelines(
            user?.companyId ?? undefined,
            user?.branchId ?? undefined
          );
          setPipelines(Array.isArray(pipelinesData) ? pipelinesData : []);
        } catch (error) {
          console.error("Failed to load pipelines:", error);
        } finally {
          setLoadingPipelines(false);
        }
      };
      loadPipelines();
    } else {
      setPipelines([]);
      setSelectedPipelineId(null);
    }
  }, [open, resource, action]);

  // Load stages when resource, action, or selected pipeline changes
  React.useEffect(() => {
    if (open && (resource === "leads" || resource === "deals") && action === "drag-drop") {
      const loadStages = async () => {
        try {
          setLoadingStages(true);
          const user = getCurrentUser();
          if (resource === "leads") {
            const stagesData = await leadStagesApi.getLeadStages(
              user?.companyId ?? undefined,
              user?.branchId ?? undefined
            );
            setStages(Array.isArray(stagesData) ? stagesData : []);
          } else if (resource === "deals" && selectedPipelineId) {
            // For deals, load stages from selected pipeline
            const stagesData = await dealPipelinesApi.getPipelineStages(selectedPipelineId);
            setStages(Array.isArray(stagesData) ? stagesData : []);
          } else {
            setStages([]);
          }
        } catch (error) {
          console.error("Failed to load stages:", error);
        } finally {
          setLoadingStages(false);
        }
      };
      loadStages();
    } else {
      setStages([]);
    }
  }, [open, resource, action, selectedPipelineId]);

  React.useEffect(() => {
    if (open) {
      if (accessControl) {
        const conditions = accessControl.conditions || {};
        form.reset({
          name: accessControl.name,
          resource: accessControl.resource,
          action: accessControl.action,
          conditions: accessControl.conditions || null,
          isActive: accessControl.isActive
        });
        // Set selected values from conditions
        if (accessControl.action === "drag-drop" && conditions) {
          setSelectedUserIds(Array.isArray(conditions.userIds) ? conditions.userIds : []);
          setFromStageIds(Array.isArray(conditions.fromStages) ? conditions.fromStages : []);
          setToStageIds(Array.isArray(conditions.toStages) ? conditions.toStages : []);
          setSelectedPipelineId(conditions.pipelineId || null);
        } else {
          setSelectedUserIds([]);
          setFromStageIds([]);
          setToStageIds([]);
          setSelectedPipelineId(null);
        }
      } else {
        form.reset({
          name: "",
          resource: "",
          action: "",
          conditions: null,
          isActive: true
        });
        setSelectedUserIds([]);
        setFromStageIds([]);
        setToStageIds([]);
        setSelectedPipelineId(null);
      }
    }
  }, [open, accessControl, form]);

  const onSubmit = async (data: AccessControlFormValues) => {
    setIsSubmitting(true);
    try {
      // Build conditions object for drag-drop action
      let conditions = data.conditions;
      if (data.action === "drag-drop") {
        conditions = {
          userIds: selectedUserIds,
          fromStages: fromStageIds,
          toStages: toStageIds
        };
        // Add pipelineId for deals
        if (data.resource === "deals" && selectedPipelineId) {
          conditions.pipelineId = selectedPipelineId;
        }
      }

      const submitData = {
        ...data,
        conditions
      };

      if (accessControl) {
        await accessControlsApi.updateAccessControl(accessControl.id, submitData);
        toast.success("Access control updated successfully");
      } else {
        await accessControlsApi.createAccessControl(submitData);
        toast.success("Access control created successfully");
      }
      if (onSuccess) onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Failed to save access control:", error);
      toast.error(error.message || "Failed to save access control");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{accessControl ? "Edit Access Control" : "Add Access Control"}</DialogTitle>
          <DialogDescription>
            {accessControl
              ? "Update the access control rule below."
              : "Create a new access control rule to manage permissions for resources and actions."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Rule Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="View Leads" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="resource"
                render={({ field }) => (
                  <FormItem className="w-full">
                    <FormLabel>Resource *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select resource" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {resourceOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="action"
                render={({ field }) => (
                  <FormItem className="w-full">
                    <FormLabel>Action *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select action" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {actionOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>Active</FormLabel>
                    <div className="text-xs text-muted-foreground">
                      Enable or disable this access control rule
                    </div>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
            {action === "drag-drop" && (resource === "leads" || resource === "deals") && (
              <div className="space-y-4">
                <Separator />
                <div className="space-y-2">
                  <FormLabel>Drag & Drop Configuration</FormLabel>
                  <FormDescription>
                    Configure which users can drag {resource} between stages
                  </FormDescription>
                </div>

                {/* Pipeline Selection for Deals */}
                {resource === "deals" && (
                  <FormItem>
                    <FormLabel>Pipeline *</FormLabel>
                    <FormDescription>
                      Select the pipeline to configure drag and drop permissions for
                    </FormDescription>
                    <Select
                      value={selectedPipelineId?.toString() || ""}
                      onValueChange={(value) => {
                        const pipelineId = parseInt(value);
                        setSelectedPipelineId(isNaN(pipelineId) ? null : pipelineId);
                        // Clear stage selections when pipeline changes
                        setFromStageIds([]);
                        setToStageIds([]);
                      }}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select pipeline" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {loadingPipelines ? (
                          <div className="px-2 py-1.5 text-sm text-muted-foreground">Loading pipelines...</div>
                        ) : pipelines.length === 0 ? (
                          <div className="px-2 py-1.5 text-sm text-muted-foreground">No pipelines available</div>
                        ) : (
                          pipelines.map((pipeline: any) => (
                            <SelectItem key={pipeline.id} value={pipeline.id.toString()}>
                              {pipeline.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}

                {/* User Selection */}
                <FormItem>
                  <FormLabel>Allowed Users</FormLabel>
                  <FormDescription>
                    Select users who can perform drag and drop operations
                  </FormDescription>
                  <ScrollArea className="h-48 border rounded-md p-3">
                    {loadingUsers ? (
                      <p className="text-sm text-muted-foreground">Loading users...</p>
                    ) : users.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No users available</p>
                    ) : (
                      <div className="space-y-2">
                        {users.map((user: any) => (
                          <div key={user.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={`user-${user.id}`}
                              checked={selectedUserIds.includes(user.id)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedUserIds([...selectedUserIds, user.id]);
                                } else {
                                  setSelectedUserIds(selectedUserIds.filter(id => id !== user.id));
                                }
                              }}
                            />
                            <label
                              htmlFor={`user-${user.id}`}
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer">
                              {user.name} ({user.email})
                            </label>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </FormItem>

                {/* From Stages */}
                <FormItem>
                  <FormLabel>From Stages (Optional)</FormLabel>
                  <FormDescription>
                    Select stages that {resource} can be dragged from. Leave empty to allow all stages.
                    {resource === "deals" && !selectedPipelineId && " Please select a pipeline first."}
                  </FormDescription>
                  <ScrollArea className="h-48 border rounded-md p-3">
                    {resource === "deals" && !selectedPipelineId ? (
                      <p className="text-sm text-muted-foreground">Please select a pipeline first</p>
                    ) : loadingStages ? (
                      <p className="text-sm text-muted-foreground">Loading stages...</p>
                    ) : stages.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No stages available</p>
                    ) : (
                      <div className="space-y-2">
                        {stages.map((stage: any) => (
                          <div key={stage.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={`from-stage-${stage.id}`}
                              checked={fromStageIds.includes(stage.id)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setFromStageIds([...fromStageIds, stage.id]);
                                } else {
                                  setFromStageIds(fromStageIds.filter(id => id !== stage.id));
                                }
                              }}
                            />
                            <label
                              htmlFor={`from-stage-${stage.id}`}
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer">
                              {stage.name}
                            </label>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </FormItem>

                {/* To Stages */}
                <FormItem>
                  <FormLabel>To Stages (Optional)</FormLabel>
                  <FormDescription>
                    Select stages that {resource} can be dragged to. Leave empty to allow all stages.
                    {resource === "deals" && !selectedPipelineId && " Please select a pipeline first."}
                  </FormDescription>
                  <ScrollArea className="h-48 border rounded-md p-3">
                    {resource === "deals" && !selectedPipelineId ? (
                      <p className="text-sm text-muted-foreground">Please select a pipeline first</p>
                    ) : loadingStages ? (
                      <p className="text-sm text-muted-foreground">Loading stages...</p>
                    ) : stages.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No stages available</p>
                    ) : (
                      <div className="space-y-2">
                        {stages.map((stage: any) => (
                          <div key={stage.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={`to-stage-${stage.id}`}
                              checked={toStageIds.includes(stage.id)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setToStageIds([...toStageIds, stage.id]);
                                } else {
                                  setToStageIds(toStageIds.filter(id => id !== stage.id));
                                }
                              }}
                            />
                            <label
                              htmlFor={`to-stage-${stage.id}`}
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer">
                              {stage.name}
                            </label>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </FormItem>
              </div>
            )}

            {action !== "drag-drop" && (
              <div className="bg-muted/50 border border-muted rounded-lg p-3 text-sm text-muted-foreground">
                <p className="font-medium mb-1">Conditions</p>
                <p>Advanced conditions can be configured later for role-based access control implementation.</p>
              </div>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : accessControl ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}















































