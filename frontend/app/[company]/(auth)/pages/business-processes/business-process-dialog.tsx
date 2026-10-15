"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { businessProcessesApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
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
  FormMessage
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorkflowBuilder, WorkflowData } from "./workflow-builder";
import { FileText, GitBranch, Clock, Calendar, Zap } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

const businessProcessFormSchema = z.object({
  name: z.string().min(1, "Process name is required"),
  description: z.string().optional(),
  trigger: z.enum(["MANUAL", "SCHEDULED", "EVENT_BASED", "WEBHOOK", "API_CALL"]),
  status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"]),
  isActive: z.boolean().default(false),
  steps: z.any().optional(),
  conditions: z.any().optional(),
  settings: z.any().optional(),
  scheduleConfig: z.object({
    scheduleType: z.enum(["DAILY", "WEEKLY", "MONTHLY", "DAY_END", "MONTH_END", "CUSTOM"]).optional(),
    time: z.string().optional(),
    dayOfWeek: z.number().optional(),
    dayOfMonth: z.number().optional(),
    cronExpression: z.string().optional(),
    timezone: z.string().optional()
  }).optional(),
  eventConfig: z.object({
    events: z.array(z.string()).optional(),
    entityType: z.string().optional(),
    conditions: z.any().optional()
  }).optional()
});

type BusinessProcessFormValues = z.input<typeof businessProcessFormSchema>;

interface BusinessProcessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  process?: BusinessProcess | null;
  onSuccess?: () => void;
}

type BusinessProcess = {
  id: number;
  name: string;
  description?: string | null;
  trigger: "MANUAL" | "SCHEDULED" | "EVENT_BASED" | "WEBHOOK" | "API_CALL";
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";
  isActive: boolean;
  steps?: any;
  conditions?: any;
  settings?: any;
};

const triggerOptions = [
  { value: "MANUAL", label: "Manual", description: "Triggered manually by users" },
  { value: "SCHEDULED", label: "Scheduled", description: "Runs on a schedule (cron)" },
  { value: "EVENT_BASED", label: "Event Based", description: "Triggered by system events" },
  { value: "WEBHOOK", label: "Webhook", description: "Triggered by external webhook" },
  { value: "API_CALL", label: "API Call", description: "Triggered via API request" }
];

const statusOptions = [
  { value: "DRAFT", label: "Draft", description: "Process is being designed" },
  { value: "ACTIVE", label: "Active", description: "Process is live and running" },
  { value: "PAUSED", label: "Paused", description: "Process is temporarily stopped" },
  { value: "ARCHIVED", label: "Archived", description: "Process is archived" }
];

// Generate time options (24-hour format with 15-minute intervals)
const generateTimeOptions = () => {
  const options = [];
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      const formattedHour = hour.toString().padStart(2, "0");
      const formattedMinute = minute.toString().padStart(2, "0");
      const value = `${formattedHour}:${formattedMinute}`;
      const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
      const ampm = hour < 12 ? "AM" : "PM";
      const label = `${displayHour}:${formattedMinute} ${ampm}`;
      options.push({ value, label });
    }
  }
  return options;
};

const timeOptions = generateTimeOptions();

// Event options for EVENT_BASED trigger
const eventOptions = [
  {
    category: "Lead Events",
    events: [
      { value: "lead.created", label: "Lead Created", description: "Triggered when a new lead is created" },
      { value: "lead.updated", label: "Lead Updated", description: "Triggered when a lead is updated" },
      { value: "lead.status_changed", label: "Lead Status Changed", description: "Triggered when lead status changes" },
      { value: "lead.stage_changed", label: "Lead Stage Changed", description: "Triggered when lead moves to a new stage" },
      { value: "lead.assigned", label: "Lead Assigned", description: "Triggered when a lead is assigned to a user" },
      { value: "lead.unassigned", label: "Lead Unassigned", description: "Triggered when a lead is unassigned" },
      { value: "lead.converted", label: "Lead Converted", description: "Triggered when a lead is converted to contact/deal" },
      { value: "lead.deleted", label: "Lead Deleted", description: "Triggered when a lead is deleted" }
    ]
  },
  {
    category: "Deal Events",
    events: [
      { value: "deal.created", label: "Deal Created", description: "Triggered when a new deal is created" },
      { value: "deal.updated", label: "Deal Updated", description: "Triggered when a deal is updated" },
      { value: "deal.status_changed", label: "Deal Status Changed", description: "Triggered when deal status changes" },
      { value: "deal.stage_changed", label: "Deal Stage Changed", description: "Triggered when deal moves to a new stage" },
      { value: "deal.won", label: "Deal Won", description: "Triggered when a deal is marked as won" },
      { value: "deal.lost", label: "Deal Lost", description: "Triggered when a deal is marked as lost" },
      { value: "deal.assigned", label: "Deal Assigned", description: "Triggered when a deal is assigned to a user" },
      { value: "deal.value_changed", label: "Deal Value Changed", description: "Triggered when deal value is updated" }
    ]
  },
  {
    category: "Contact Events",
    events: [
      { value: "contact.created", label: "Contact Created", description: "Triggered when a new contact is created" },
      { value: "contact.updated", label: "Contact Updated", description: "Triggered when a contact is updated" },
      { value: "contact.email_changed", label: "Contact Email Changed", description: "Triggered when contact email is updated" },
      { value: "contact.phone_changed", label: "Contact Phone Changed", description: "Triggered when contact phone is updated" },
      { value: "contact.deleted", label: "Contact Deleted", description: "Triggered when a contact is deleted" }
    ]
  },
  {
    category: "Company Events",
    events: [
      { value: "company.created", label: "Company Created", description: "Triggered when a new company is created" },
      { value: "company.updated", label: "Company Updated", description: "Triggered when a company is updated" },
      { value: "company.deleted", label: "Company Deleted", description: "Triggered when a company is deleted" }
    ]
  },
  {
    category: "Task Events",
    events: [
      { value: "task.created", label: "Task Created", description: "Triggered when a new task is created" },
      { value: "task.completed", label: "Task Completed", description: "Triggered when a task is marked as completed" },
      { value: "task.due_date_approaching", label: "Task Due Date Approaching", description: "Triggered when task due date is approaching" },
      { value: "task.overdue", label: "Task Overdue", description: "Triggered when a task becomes overdue" },
      { value: "task.assigned", label: "Task Assigned", description: "Triggered when a task is assigned to a user" },
      { value: "task.status_changed", label: "Task Status Changed", description: "Triggered when task status changes" }
    ]
  },
  {
    category: "Document Events",
    events: [
      { value: "document.created", label: "Document Created", description: "Triggered when a new document is created" },
      { value: "document.updated", label: "Document Updated", description: "Triggered when a document is updated" },
      { value: "document.signed", label: "Document Signed", description: "Triggered when a document is signed" },
      { value: "document.deleted", label: "Document Deleted", description: "Triggered when a document is deleted" }
    ]
  },
  {
    category: "Invoice Events",
    events: [
      { value: "invoice.created", label: "Invoice Created", description: "Triggered when a new invoice is created" },
      { value: "invoice.sent", label: "Invoice Sent", description: "Triggered when an invoice is sent" },
      { value: "invoice.paid", label: "Invoice Paid", description: "Triggered when an invoice is paid" },
      { value: "invoice.overdue", label: "Invoice Overdue", description: "Triggered when an invoice becomes overdue" }
    ]
  },
  {
    category: "User Events",
    events: [
      { value: "user.created", label: "User Created", description: "Triggered when a new user is created" },
      { value: "user.updated", label: "User Updated", description: "Triggered when a user profile is updated" },
      { value: "user.login", label: "User Login", description: "Triggered when a user logs in" }
    ]
  }
];

export function BusinessProcessDialog({
  open,
  onOpenChange,
  process,
  onSuccess
}: BusinessProcessDialogProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [workflowData, setWorkflowData] = React.useState<WorkflowData | null>(null);
  const [activeTab, setActiveTab] = React.useState("basic");
  const currentUser = getCurrentUser();
  const currentCompanyId = currentUser?.companyId ?? null;
  const currentBranchId = currentUser?.branchId ?? null;

  const form = useForm<BusinessProcessFormValues>({
    resolver: zodResolver(businessProcessFormSchema),
    defaultValues: {
      name: "",
      description: "",
      trigger: "MANUAL",
      status: "DRAFT",
      isActive: false,
      steps: null,
      conditions: null,
      settings: null,
      scheduleConfig: {
        scheduleType: "DAILY",
        time: "09:00",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      },
      eventConfig: {
        events: [],
        entityType: "",
        conditions: null
      }
    }
  });

  const triggerType = form.watch("trigger");

  React.useEffect(() => {
    if (open) {
      if (process) {
        const settings = typeof process.settings === 'string' 
          ? JSON.parse(process.settings) 
          : process.settings || {};
        
        form.reset({
          name: process.name,
          description: process.description || "",
          trigger: process.trigger,
          status: process.status,
          isActive: process.isActive,
          steps: process.steps || null,
          conditions: process.conditions || null,
          settings: settings,
          scheduleConfig: settings.scheduleConfig || {
            scheduleType: "DAILY",
            time: "09:00",
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
          },
          eventConfig: settings.eventConfig || {
            events: [],
            entityType: "",
            conditions: null
          }
        });
        // Load workflow data if exists
        if (process.steps) {
          try {
            const parsed = typeof process.steps === 'string' ? JSON.parse(process.steps) : process.steps;
            setWorkflowData(parsed);
          } catch (e) {
            setWorkflowData(null);
          }
        } else {
          setWorkflowData(null);
        }
      } else {
        form.reset({
          name: "",
          description: "",
          trigger: "MANUAL",
          status: "DRAFT",
          isActive: false,
          steps: null,
          conditions: null,
          settings: null,
          scheduleConfig: {
            scheduleType: "DAILY",
            time: "09:00",
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
          },
          eventConfig: {
            events: [],
            entityType: "",
            conditions: null
          }
        });
        setWorkflowData(null);
      }
      setActiveTab("basic");
    }
  }, [open, process?.id]); // Only depend on open and process.id, not form

  // Ensure eventConfig is initialized when trigger type is EVENT_BASED
  React.useEffect(() => {
    if (triggerType === "EVENT_BASED") {
      const currentEventConfig = form.getValues("eventConfig");
      if (!currentEventConfig || !Array.isArray(currentEventConfig.events)) {
        form.setValue("eventConfig", {
          events: [],
          entityType: "",
          conditions: null
        });
      }
    }
  }, [triggerType, form]);

  const handleWorkflowSave = (data: WorkflowData) => {
    setWorkflowData(data);
    form.setValue("steps", data);
    toast.success("Workflow saved successfully");
  };

  const onSubmit = async (data: BusinessProcessFormValues) => {
    setIsSubmitting(true);
    try {
      // Merge scheduleConfig and eventConfig into settings based on trigger type
      const submitData = {
        ...data,
        settings: {
          ...(data.settings || {}),
          ...(data.trigger === "SCHEDULED" && data.scheduleConfig
            ? { scheduleConfig: data.scheduleConfig }
            : {}),
          ...(data.trigger === "EVENT_BASED" && data.eventConfig
            ? { eventConfig: data.eventConfig }
            : {})
        }
      };

      if (process) {
        await businessProcessesApi.updateBusinessProcess(process.id, submitData);
        toast.success("Business process updated successfully");
      } else {
        await businessProcessesApi.createBusinessProcess(submitData);
        toast.success("Business process created successfully");
      }
      if (onSuccess) onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Failed to save business process:", error);
      toast.error(error.message || "Failed to save business process");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[90vw] max-w-[90vw] h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle>{process ? "Edit Business Process" : "Create Business Process"}</DialogTitle>
          <DialogDescription>
            {process
              ? "Update the business process configuration below."
              : "Create a new business process workflow. Define triggers, steps, and conditions to automate your business operations."}
          </DialogDescription>
        </DialogHeader>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col px-6 pb-6 overflow-hidden">
          <TabsList className="mb-4">
            <TabsTrigger value="basic" className="gap-2">
              <FileText className="h-4 w-4" />
              Basic Info
            </TabsTrigger>
            <TabsTrigger value="workflow" className="gap-2">
              <GitBranch className="h-4 w-4" />
              Workflow Builder
            </TabsTrigger>
          </TabsList>
          <TabsContent value="basic" className="flex-1 overflow-y-auto">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                {/* Process Information Section */}
                <div className="space-y-4">
                  <div className="border-b pb-2">
                    <h3 className="text-lg font-semibold">Process Information</h3>
                    <p className="text-sm text-muted-foreground">Basic details about your business process</p>
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base">Process Name *</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="e.g., Lead Qualification Process" 
                            {...field}
                            className="h-11"
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">
                          Give your process a clear, descriptive name
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base">Description</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Describe what this process does, when it runs, and what it accomplishes..."
                            {...field}
                            rows={4}
                            className="resize-none"
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">
                          Provide a detailed description to help team members understand this process
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Configuration Section */}
                <div className="space-y-4">
                  <div className="border-b pb-2">
                    <h3 className="text-lg font-semibold">Configuration</h3>
                    <p className="text-sm text-muted-foreground">How and when the process will be triggered</p>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="trigger"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-base">Trigger Type *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="h-11">
                                <SelectValue placeholder="Select trigger type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {triggerOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  <div className="flex flex-col">
                                    <span className="font-medium">{option.label}</span>
                                    <span className="text-xs text-muted-foreground">{option.description}</span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            Choose how this process will be initiated
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-base">Status *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="h-11">
                                <SelectValue placeholder="Select status" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {statusOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  <div className="flex flex-col">
                                    <span className="font-medium">{option.label}</span>
                                    <span className="text-xs text-muted-foreground">{option.description}</span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            Current state of the process
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Schedule Configuration - Only show for SCHEDULED trigger */}
                {triggerType === "SCHEDULED" && (
                  <div className="space-y-4">
                    <div className="border-b pb-2">
                      <div className="flex items-center gap-2">
                        <Clock className="h-5 w-5 text-primary" />
                        <h3 className="text-lg font-semibold">Schedule Configuration</h3>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Configure when and how often this process should run automatically
                      </p>
                    </div>

                    <FormField
                      control={form.control}
                      name="scheduleConfig.scheduleType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-base">Schedule Type *</FormLabel>
                          <FormControl>
                            <RadioGroup
                              value={field.value || "DAILY"}
                              onValueChange={field.onChange}
                              className="grid grid-cols-2 gap-4 mt-2">
                              <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-accent cursor-pointer">
                                <RadioGroupItem value="DAILY" id="daily" />
                                <Label htmlFor="daily" className="font-normal cursor-pointer flex-1">
                                  <div className="font-medium">Daily</div>
                                  <div className="text-xs text-muted-foreground">Runs every day at specified time</div>
                                </Label>
                              </div>
                              <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-accent cursor-pointer">
                                <RadioGroupItem value="WEEKLY" id="weekly" />
                                <Label htmlFor="weekly" className="font-normal cursor-pointer flex-1">
                                  <div className="font-medium">Weekly</div>
                                  <div className="text-xs text-muted-foreground">Runs on specific day of week</div>
                                </Label>
                              </div>
                              <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-accent cursor-pointer">
                                <RadioGroupItem value="MONTHLY" id="monthly" />
                                <Label htmlFor="monthly" className="font-normal cursor-pointer flex-1">
                                  <div className="font-medium">Monthly</div>
                                  <div className="text-xs text-muted-foreground">Runs on specific day of month</div>
                                </Label>
                              </div>
                              <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-accent cursor-pointer">
                                <RadioGroupItem value="DAY_END" id="dayend" />
                                <Label htmlFor="dayend" className="font-normal cursor-pointer flex-1">
                                  <div className="font-medium">Day End</div>
                                  <div className="text-xs text-muted-foreground">Runs at end of each day</div>
                                </Label>
                              </div>
                              <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-accent cursor-pointer">
                                <RadioGroupItem value="MONTH_END" id="monthend" />
                                <Label htmlFor="monthend" className="font-normal cursor-pointer flex-1">
                                  <div className="font-medium">Month End</div>
                                  <div className="text-xs text-muted-foreground">Runs at end of each month</div>
                                </Label>
                              </div>
                              <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-accent cursor-pointer">
                                <RadioGroupItem value="CUSTOM" id="custom" />
                                <Label htmlFor="custom" className="font-normal cursor-pointer flex-1">
                                  <div className="font-medium">Custom Cron</div>
                                  <div className="text-xs text-muted-foreground">Advanced cron expression</div>
                                </Label>
                              </div>
                            </RadioGroup>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Day of Week - Show for WEEKLY */}
                    {form.watch("scheduleConfig.scheduleType") === "WEEKLY" && (
                      <FormField
                        control={form.control}
                        name="scheduleConfig.dayOfWeek"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-base">Day of Week *</FormLabel>
                            <FormControl>
                              <Select
                                value={field.value?.toString() || "1"}
                                onValueChange={(value) => field.onChange(parseInt(value))}>
                                <SelectTrigger className="h-11">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="0">Sunday</SelectItem>
                                  <SelectItem value="1">Monday</SelectItem>
                                  <SelectItem value="2">Tuesday</SelectItem>
                                  <SelectItem value="3">Wednesday</SelectItem>
                                  <SelectItem value="4">Thursday</SelectItem>
                                  <SelectItem value="5">Friday</SelectItem>
                                  <SelectItem value="6">Saturday</SelectItem>
                                </SelectContent>
                              </Select>
                            </FormControl>
                            <p className="text-xs text-muted-foreground">
                              Select which day of the week to run the process
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    {/* Custom Cron Expression */}
                    {form.watch("scheduleConfig.scheduleType") === "CUSTOM" && (
                      <FormField
                        control={form.control}
                        name="scheduleConfig.cronExpression"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-base">Cron Expression *</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="0 9 * * * (Every day at 9:00 AM)"
                                value={field.value || ""}
                                onChange={field.onChange}
                                className="h-11 font-mono"
                              />
                            </FormControl>
                            <p className="text-xs text-muted-foreground">
                              Enter a valid cron expression (e.g., "0 9 * * *" for daily at 9 AM)
                            </p>
                            <div className="text-xs text-muted-foreground mt-2 p-3 bg-muted/50 rounded-md">
                              <p className="font-medium mb-1">Cron Format:</p>
                              <p>minute hour day month day-of-week</p>
                              <p className="mt-2 font-medium">Examples:</p>
                              <ul className="list-disc list-inside space-y-1 mt-1">
                                <li>0 9 * * * - Daily at 9:00 AM</li>
                                <li>0 0 * * 1 - Every Monday at midnight</li>
                                <li>0 0 1 * * - First day of month at midnight</li>
                                <li>0 0 * * 0 - Every Sunday at midnight</li>
                              </ul>
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    {/* Time, Day of Month, and Timezone in a row */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Time selection - Show for DAILY, WEEKLY, MONTHLY */}
                      {form.watch("scheduleConfig.scheduleType") !== "DAY_END" && 
                       form.watch("scheduleConfig.scheduleType") !== "MONTH_END" &&
                       form.watch("scheduleConfig.scheduleType") !== "CUSTOM" && (
                        <FormField
                          control={form.control}
                          name="scheduleConfig.time"
                          render={({ field }) => {
                            const currentTime = field.value || "09:00";
                            const selectedOption = timeOptions.find(opt => opt.value === currentTime);

                            return (
                              <FormItem>
                                <FormLabel className="text-base">Time *</FormLabel>
                                <FormControl>
                                  <Select
                                    value={currentTime}
                                    onValueChange={field.onChange}>
                                    <SelectTrigger className="h-11 w-full">
                                      <div className="flex items-center gap-2">
                                        <Clock className="h-4 w-4 text-muted-foreground" />
                                        <SelectValue placeholder="Select time">
                                          {selectedOption?.label || currentTime}
                                        </SelectValue>
                                      </div>
                                    </SelectTrigger>
                                    <SelectContent className="max-h-[300px]">
                                      {timeOptions.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                          {option.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </FormControl>
                                <p className="text-xs text-muted-foreground">
                                  Select the time when the process should run
                                </p>
                                <FormMessage />
                              </FormItem>
                            );
                          }}
                        />
                      )}

                      {/* Day of Month - Show for MONTHLY */}
                      {form.watch("scheduleConfig.scheduleType") === "MONTHLY" && (
                        <FormField
                          control={form.control}
                          name="scheduleConfig.dayOfMonth"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-base">Day of Month *</FormLabel>
                              <FormControl>
                                <Select
                                  value={field.value?.toString() || "1"}
                                  onValueChange={(value) => field.onChange(parseInt(value))}>
                                  <SelectTrigger className="h-11 w-full">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                                      <SelectItem key={day} value={day.toString()}>
                                        {day}{day === 1 ? "st" : day === 2 ? "nd" : day === 3 ? "rd" : "th"}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </FormControl>
                              <p className="text-xs text-muted-foreground">
                                Select which day of the month to run the process
                              </p>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}

                      {/* Timezone */}
                      <FormField
                        control={form.control}
                        name="scheduleConfig.timezone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-base">Timezone</FormLabel>
                            <FormControl>
                              <Select
                                value={field.value || Intl.DateTimeFormat().resolvedOptions().timeZone}
                                onValueChange={field.onChange}>
                                <SelectTrigger className="h-11 w-full">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="UTC">UTC</SelectItem>
                                  <SelectItem value="America/New_York">Eastern Time (ET)</SelectItem>
                                  <SelectItem value="America/Chicago">Central Time (CT)</SelectItem>
                                  <SelectItem value="America/Denver">Mountain Time (MT)</SelectItem>
                                  <SelectItem value="America/Los_Angeles">Pacific Time (PT)</SelectItem>
                                  <SelectItem value="Europe/London">London (GMT)</SelectItem>
                                  <SelectItem value="Europe/Paris">Paris (CET)</SelectItem>
                                  <SelectItem value="Asia/Tokyo">Tokyo (JST)</SelectItem>
                                  <SelectItem value="Asia/Shanghai">Shanghai (CST)</SelectItem>
                                  <SelectItem value="Australia/Sydney">Sydney (AEST)</SelectItem>
                                </SelectContent>
                              </Select>
                            </FormControl>
                            <p className="text-xs text-muted-foreground">
                              Timezone for the scheduled time
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Schedule Preview */}
                    <div className="p-4 bg-muted/30 rounded-lg border">
                      <div className="flex items-start gap-2">
                        <Clock className="h-4 w-4 text-primary mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm font-medium mb-1">Schedule Preview</p>
                          <p className="text-xs text-muted-foreground">
                            {(() => {
                              const scheduleType = form.watch("scheduleConfig.scheduleType");
                              const time = form.watch("scheduleConfig.time");
                              const dayOfWeek = form.watch("scheduleConfig.dayOfWeek");
                              const dayOfMonth = form.watch("scheduleConfig.dayOfMonth");
                              const cronExpression = form.watch("scheduleConfig.cronExpression");
                              const timezone = form.watch("scheduleConfig.timezone") || "UTC";

                              if (scheduleType === "DAY_END") {
                                return "Runs at the end of each day (23:59)";
                              } else if (scheduleType === "MONTH_END") {
                                return "Runs at the end of each month (last day at 23:59)";
                              } else if (scheduleType === "CUSTOM" && cronExpression) {
                                return `Custom cron: ${cronExpression}`;
                              } else if (scheduleType === "DAILY" && time) {
                                return `Runs daily at ${time} (${timezone})`;
                              } else if (scheduleType === "WEEKLY" && time && dayOfWeek !== undefined) {
                                const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
                                return `Runs every ${days[dayOfWeek]} at ${time} (${timezone})`;
                              } else if (scheduleType === "MONTHLY" && time && dayOfMonth) {
                                return `Runs on the ${dayOfMonth}${dayOfMonth === 1 ? "st" : dayOfMonth === 2 ? "nd" : dayOfMonth === 3 ? "rd" : "th"} of each month at ${time} (${timezone})`;
                              }
                              return "Configure schedule settings to see preview";
                            })()}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Event Configuration - Only show for EVENT_BASED trigger */}
                {triggerType === "EVENT_BASED" && (
                  <div className="space-y-4">
                    <div className="border-b pb-2">
                      <div className="flex items-center gap-2">
                        <Zap className="h-5 w-5 text-primary" />
                        <h3 className="text-lg font-semibold">Event Configuration</h3>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Select the system events that will trigger this process
                      </p>
                    </div>

                    <FormField
                      control={form.control}
                      name="eventConfig.events"
                      key={`event-config-${triggerType}`}
                      render={({ field }) => {
                        const selectedEvents = field.value || [];

                        const toggleEvent = (eventValue: string) => {
                          const currentEvents = selectedEvents;
                          if (currentEvents.includes(eventValue)) {
                            field.onChange(currentEvents.filter((e: string) => e !== eventValue));
                          } else {
                            field.onChange([...currentEvents, eventValue]);
                          }
                        };

                        return (
                          <FormItem>
                            <FormLabel className="text-base">Select Events *</FormLabel>
                            <FormControl>
                              <div className="space-y-4 border rounded-lg p-4 bg-muted/20">
                                {eventOptions.map((category) => (
                                  <div key={category.category} className="space-y-2">
                                    <h4 className="text-sm font-semibold text-foreground">
                                      {category.category}
                                    </h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                      {category.events.map((event) => {
                                        const isSelected = selectedEvents.includes(event.value);
                                        return (
                                          <div
                                            key={event.value}
                                            className={`flex items-start gap-2 p-3 border rounded-lg transition-colors ${
                                              isSelected
                                                ? "border-primary bg-primary/5"
                                                : "border-border hover:bg-accent/50"
                                            }`}>
                                            <Checkbox
                                              checked={isSelected}
                                              onCheckedChange={() => {
                                                toggleEvent(event.value);
                                              }}
                                              className="mt-0.5"
                                            />
                                            <div 
                                              className="flex-1 cursor-pointer"
                                              onClick={() => toggleEvent(event.value)}
                                            >
                                              <div className="text-sm font-medium">{event.label}</div>
                                              <div className="text-xs text-muted-foreground mt-0.5">
                                                {event.description}
                                              </div>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </FormControl>
                            {selectedEvents.length === 0 && (
                              <p className="text-xs text-destructive">
                                At least one event must be selected
                              </p>
                            )}
                            {selectedEvents.length > 0 && (
                              <p className="text-xs text-muted-foreground">
                                {selectedEvents.length} event{selectedEvents.length !== 1 ? "s" : ""} selected
                              </p>
                            )}
                            <FormMessage />
                          </FormItem>
                        );
                      }}
                    />

                    {/* Event Preview */}
                    {(() => {
                      const watchedEvents = form.watch("eventConfig.events") ?? [];
                      return watchedEvents.length > 0 ? (
                      <div className="p-4 bg-muted/30 rounded-lg border">
                        <div className="flex items-start gap-2">
                          <Zap className="h-4 w-4 text-primary mt-0.5" />
                          <div className="flex-1">
                            <p className="text-sm font-medium mb-2">Event Preview</p>
                            <div className="flex flex-wrap gap-2">
                              {watchedEvents.map((eventValue: string) => {
                                const event = eventOptions
                                  .flatMap((cat) => cat.events)
                                  .find((e) => e.value === eventValue);
                                return event ? (
                                  <Badge key={eventValue} variant="secondary" className="text-xs">
                                    {event.label}
                                  </Badge>
                                ) : null;
                              })}
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">
                              This process will trigger when any of the selected events occur
                            </p>
                          </div>
                        </div>
                      </div>
                      ) : null;
                    })()}
                  </div>
                )}

                {/* Activation Section */}
                <div className="space-y-4">
                  <div className="border-b pb-2">
                    <h3 className="text-lg font-semibold">Activation</h3>
                    <p className="text-sm text-muted-foreground">Control when the process is active</p>
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="isActive"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border-2 p-4 bg-muted/30">
                        <div className="space-y-1 flex-1">
                          <FormLabel className="text-base font-semibold">Activate Process</FormLabel>
                          <p className="text-sm text-muted-foreground">
                            When enabled, the process will run automatically based on its trigger settings
                          </p>
                          {form.watch("status") !== "ACTIVE" && (
                            <p className="text-xs text-amber-600 font-medium mt-1">
                              ⚠️ Process must be in ACTIVE status to enable
                            </p>
                          )}
                        </div>
                        <FormControl>
                          <Switch 
                            checked={field.value} 
                            onCheckedChange={field.onChange}
                            disabled={form.watch("status") !== "ACTIVE"}
                            className="ml-4"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onOpenChange(false)}
                    disabled={isSubmitting}
                    className="min-w-[100px]">
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={isSubmitting}
                    className="min-w-[100px]">
                    {isSubmitting ? (
                      <>
                        <span className="mr-2">Saving...</span>
                      </>
                    ) : process ? (
                      "Update Process"
                    ) : (
                      "Create Process"
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </TabsContent>
          <TabsContent value="workflow" className="flex-1 overflow-hidden">
            <div className="h-full border rounded-lg">
              <WorkflowBuilder
                initialData={workflowData}
                onSave={handleWorkflowSave}
                companyId={currentCompanyId}
                branchId={currentBranchId}
              />
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

