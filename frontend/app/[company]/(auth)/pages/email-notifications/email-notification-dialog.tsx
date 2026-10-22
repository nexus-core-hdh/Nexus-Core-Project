"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { emailNotificationsApi, emailTemplatesApi } from "@/lib/api";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Bell, Users, Mail, Settings, FileText, Clock, Zap } from "lucide-react";
import { Label } from "@/components/ui/label";
import { EmailNotification } from "./page";

const emailNotificationFormSchema = z.object({
  name: z.string().min(1, "Notification name is required"),
  type: z.enum([
    "LEAD_CREATED",
    "LEAD_UPDATED",
    "LEAD_ASSIGNED",
    "LEAD_STAGE_CHANGED",
    "DEAL_CREATED",
    "DEAL_UPDATED",
    "DEAL_CLOSED",
    "DEAL_LOST",
    "TASK_CREATED",
    "TASK_ASSIGNED",
    "TASK_COMPLETED",
    "TASK_OVERDUE",
    "CONTACT_CREATED",
    "CONTACT_UPDATED",
    "INVOICE_CREATED",
    "INVOICE_SENT",
    "INVOICE_PAID",
    "INVOICE_OVERDUE",
    "QUOTE_CREATED",
    "QUOTE_SENT",
    "QUOTE_ACCEPTED",
    "QUOTE_REJECTED",
    "USER_MENTIONED",
    "COMMENT_ADDED",
    "FILE_UPLOADED",
    "CUSTOM"
  ]),
  description: z.string().optional(),
  frequency: z.enum(["IMMEDIATE", "HOURLY_DIGEST", "DAILY_DIGEST", "WEEKLY_DIGEST", "NEVER"]),
  templateId: z.number().optional().nullable(),
  isActive: z.boolean().default(true)
});

type EmailNotificationFormValues = z.input<typeof emailNotificationFormSchema>;

interface EmailNotificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notification?: EmailNotification | null;
  onSuccess?: () => void;
}

const notificationTypeOptions = [
  { value: "LEAD_CREATED", label: "Lead Created", category: "Leads" },
  { value: "LEAD_UPDATED", label: "Lead Updated", category: "Leads" },
  { value: "LEAD_ASSIGNED", label: "Lead Assigned", category: "Leads" },
  { value: "LEAD_STAGE_CHANGED", label: "Lead Stage Changed", category: "Leads" },
  { value: "DEAL_CREATED", label: "Deal Created", category: "Deals" },
  { value: "DEAL_UPDATED", label: "Deal Updated", category: "Deals" },
  { value: "DEAL_CLOSED", label: "Deal Closed", category: "Deals" },
  { value: "DEAL_LOST", label: "Deal Lost", category: "Deals" },
  { value: "TASK_CREATED", label: "Task Created", category: "Tasks" },
  { value: "TASK_ASSIGNED", label: "Task Assigned", category: "Tasks" },
  { value: "TASK_COMPLETED", label: "Task Completed", category: "Tasks" },
  { value: "TASK_OVERDUE", label: "Task Overdue", category: "Tasks" },
  { value: "CONTACT_CREATED", label: "Contact Created", category: "Contacts" },
  { value: "CONTACT_UPDATED", label: "Contact Updated", category: "Contacts" },
  { value: "INVOICE_CREATED", label: "Invoice Created", category: "Invoices" },
  { value: "INVOICE_SENT", label: "Invoice Sent", category: "Invoices" },
  { value: "INVOICE_PAID", label: "Invoice Paid", category: "Invoices" },
  { value: "INVOICE_OVERDUE", label: "Invoice Overdue", category: "Invoices" },
  { value: "QUOTE_CREATED", label: "Quote Created", category: "Quotes" },
  { value: "QUOTE_SENT", label: "Quote Sent", category: "Quotes" },
  { value: "QUOTE_ACCEPTED", label: "Quote Accepted", category: "Quotes" },
  { value: "QUOTE_REJECTED", label: "Quote Rejected", category: "Quotes" },
  { value: "USER_MENTIONED", label: "User Mentioned", category: "Social" },
  { value: "COMMENT_ADDED", label: "Comment Added", category: "Social" },
  { value: "FILE_UPLOADED", label: "File Uploaded", category: "Files" },
  { value: "CUSTOM", label: "Custom", category: "Custom" }
];

export function EmailNotificationDialog({
  open,
  onOpenChange,
  notification,
  onSuccess
}: EmailNotificationDialogProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState("basic");
  const [emailTemplates, setEmailTemplates] = React.useState<any[]>([]);
  const [recipientType, setRecipientType] = React.useState<string>("assigned_user");
  const [selectedChannels, setSelectedChannels] = React.useState<string[]>(["EMAIL"]);
  const [selectedUsers, setSelectedUsers] = React.useState<number[]>([]);
  const [selectedRoles, setSelectedRoles] = React.useState<number[]>([]);

  const form = useForm<EmailNotificationFormValues>({
    resolver: zodResolver(emailNotificationFormSchema),
    defaultValues: {
      name: "",
      type: "CUSTOM",
      description: "",
      frequency: "IMMEDIATE",
      templateId: null,
      isActive: true
    }
  });

  React.useEffect(() => {
    if (open) {
      // Load email templates
      emailTemplatesApi.getEmailTemplates().then((templates) => {
        setEmailTemplates(templates.filter((t: any) => t.isActive));
      }).catch(console.error);

      if (notification) {
        form.reset({
          name: notification.name,
          type: notification.type as any,
          description: notification.description || "",
          frequency: notification.frequency as any,
          templateId: notification.templateId || null,
          isActive: notification.isActive
        });

        // Load recipient settings
        if (notification.recipients) {
          const recipients = notification.recipients as any;
          setRecipientType(recipients.type || "assigned_user");
          setSelectedUsers(recipients.users || []);
          setSelectedRoles(recipients.roles || []);
        }

        // Load channels
        if (notification.channels) {
          setSelectedChannels(notification.channels as string[] || ["EMAIL"]);
        }
      } else {
        form.reset({
          name: "",
          type: "CUSTOM",
          description: "",
          frequency: "IMMEDIATE",
          templateId: null,
          isActive: true
        });
        setRecipientType("assigned_user");
        setSelectedUsers([]);
        setSelectedRoles([]);
        setSelectedChannels(["EMAIL"]);
      }
      setActiveTab("basic");
    }
  }, [open, notification, form]);

  const onSubmit = async (data: EmailNotificationFormValues) => {
    setIsSubmitting(true);
    try {
      const parsed = emailNotificationFormSchema.parse(data);
      const notificationData = {
        ...parsed,
        trigger: {
          event: parsed.type,
          conditions: {}
        },
        recipients: {
          type: recipientType,
          users: selectedUsers,
          roles: selectedRoles,
          teams: []
        },
        channels: selectedChannels,
        conditions: {}
      };

      if (notification) {
        await emailNotificationsApi.updateEmailNotification(notification.id, notificationData);
        toast.success("Email notification updated successfully");
      } else {
        await emailNotificationsApi.createEmailNotification(notificationData);
        toast.success("Email notification created successfully");
      }
      if (onSuccess) onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Failed to save email notification:", error);
      toast.error(error.message || "Failed to save email notification");
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleChannel = (channel: string) => {
    setSelectedChannels((prev) =>
      prev.includes(channel) ? prev.filter((c) => c !== channel) : [...prev, channel]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[90vw] max-w-[90vw] h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle>
            {notification ? "Edit Email Notification" : "Create Email Notification"}
          </DialogTitle>
          <DialogDescription>
            {notification
              ? "Update the email notification configuration below."
              : "Create a new automated email notification with triggers, recipients, and templates."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col px-6 pb-6 overflow-hidden">
              <TabsList className="mb-4">
                <TabsTrigger value="basic">Basic Info</TabsTrigger>
                <TabsTrigger value="recipients">Recipients</TabsTrigger>
                <TabsTrigger value="template">Template</TabsTrigger>
                <TabsTrigger value="settings">Settings</TabsTrigger>
              </TabsList>

              <TabsContent value="basic" className="flex-1 overflow-y-auto">
                <div className="space-y-6">
                <div className="space-y-4">
                  <div className="border-b pb-2">
                    <h3 className="text-lg font-semibold">Notification Information</h3>
                  </div>

                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notification Name *</FormLabel>
                        <FormControl>
                          <Input placeholder="New Lead Notification" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notification Type *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select notification type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {Object.entries(
                              notificationTypeOptions.reduce((acc, option) => {
                                if (!acc[option.category]) {
                                  acc[option.category] = [];
                                }
                                acc[option.category].push(option);
                                return acc;
                              }, {} as Record<string, typeof notificationTypeOptions>)
                            ).map(([category, options]) => (
                              <div key={category}>
                                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                                  {category}
                                </div>
                                {options.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </div>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Select the event that triggers this notification
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Describe when and why this notification is sent..."
                            {...field}
                            rows={3}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="space-y-4">
                  <div className="border-b pb-2">
                    <h3 className="text-lg font-semibold">Delivery Settings</h3>
                  </div>

                  <FormField
                    control={form.control}
                    name="frequency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Frequency *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="IMMEDIATE">
                              <div className="flex items-center gap-2">
                                <Zap className="h-4 w-4" />
                                <span>Immediate - Send right away</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="HOURLY_DIGEST">
                              <div className="flex items-center gap-2">
                                <Clock className="h-4 w-4" />
                                <span>Hourly Digest - Group notifications hourly</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="DAILY_DIGEST">
                              <div className="flex items-center gap-2">
                                <Clock className="h-4 w-4" />
                                <span>Daily Digest - Group notifications daily</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="WEEKLY_DIGEST">
                              <div className="flex items-center gap-2">
                                <Clock className="h-4 w-4" />
                                <span>Weekly Digest - Group notifications weekly</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="NEVER">Never - Disable sending</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          How often should notifications be sent
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </TabsContent>

          <TabsContent value="recipients" className="flex-1 overflow-y-auto">
            <div className="space-y-6">
              <div className="border-b pb-2">
                <h3 className="text-lg font-semibold">Recipient Configuration</h3>
                <p className="text-sm text-muted-foreground">
                  Configure who should receive this notification
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <Label>Recipient Type</Label>
                  <Select value={recipientType} onValueChange={setRecipientType}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="assigned_user">
                        <div className="flex flex-col">
                          <span className="font-medium">Assigned User</span>
                          <span className="text-xs text-muted-foreground">
                            User assigned to the record
                          </span>
                        </div>
                      </SelectItem>
                      <SelectItem value="record_owner">
                        <div className="flex flex-col">
                          <span className="font-medium">Record Owner</span>
                          <span className="text-xs text-muted-foreground">
                            Owner of the record
                          </span>
                        </div>
                      </SelectItem>
                      <SelectItem value="specific_users">
                        <div className="flex flex-col">
                          <span className="font-medium">Specific Users</span>
                          <span className="text-xs text-muted-foreground">
                            Select specific users
                          </span>
                        </div>
                      </SelectItem>
                      <SelectItem value="user_roles">
                        <div className="flex flex-col">
                          <span className="font-medium">User Roles</span>
                          <span className="text-xs text-muted-foreground">
                            All users with specific roles
                          </span>
                        </div>
                      </SelectItem>
                      <SelectItem value="team">
                        <div className="flex flex-col">
                          <span className="font-medium">Team</span>
                          <span className="text-xs text-muted-foreground">
                            All members of a team
                          </span>
                        </div>
                      </SelectItem>
                      <SelectItem value="custom">
                        <div className="flex flex-col">
                          <span className="font-medium">Custom</span>
                          <span className="text-xs text-muted-foreground">
                            Custom recipient logic
                          </span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {(recipientType === "specific_users" || recipientType === "user_roles") && (
                  <div className="border rounded-lg p-4 space-y-3">
                    <Label className="text-sm font-medium">
                      {recipientType === "specific_users" ? "Select Users" : "Select Roles"}
                    </Label>
                    <div className="text-sm text-muted-foreground">
                      {recipientType === "specific_users"
                        ? "Select individual users who should receive this notification"
                        : "Select roles - all users with these roles will receive notifications"}
                    </div>
                    <div className="border rounded p-3 min-h-[100px] bg-muted/30">
                      <p className="text-sm text-muted-foreground text-center py-4">
                        User/Role selection will be implemented with user management integration
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <Separator />

              <div className="space-y-4">
                <div>
                  <Label>Notification Channels</Label>
                  <p className="text-sm text-muted-foreground mb-3">
                    Select which channels to use for sending notifications
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {["EMAIL", "SMS", "IN_APP", "PUSH"].map((channel) => (
                      <div
                        key={channel}
                        className="flex items-center space-x-2 border rounded-lg p-3 cursor-pointer hover:bg-muted/50"
                        onClick={() => toggleChannel(channel)}>
                        <Checkbox
                          checked={selectedChannels.includes(channel)}
                          onCheckedChange={() => toggleChannel(channel)}
                        />
                        <Label className="cursor-pointer flex-1">
                          <div className="font-medium">{channel}</div>
                          <div className="text-xs text-muted-foreground">
                            {channel === "EMAIL" && "Send via email"}
                            {channel === "SMS" && "Send via SMS"}
                            {channel === "IN_APP" && "Show in-app notification"}
                            {channel === "PUSH" && "Send push notification"}
                          </div>
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="template" className="flex-1 overflow-y-auto">
            <div className="space-y-6">
              <div className="border-b pb-2">
                <h3 className="text-lg font-semibold">Email Template</h3>
                <p className="text-sm text-muted-foreground">
                  Select an email template to use for this notification
                </p>
              </div>

              <FormField
                control={form.control}
                name="templateId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Template</FormLabel>
                    <Select
                      onValueChange={(value) => field.onChange(value === "none" ? null : parseInt(value))}
                      value={field.value?.toString() || "none"}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select email template (optional)" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">No Template (Use Default)</SelectItem>
                        {emailTemplates.map((template) => (
                          <SelectItem key={template.id} value={template.id.toString()}>
                            <div className="flex flex-col">
                              <span className="font-medium">{template.name}</span>
                              <span className="text-xs text-muted-foreground">
                                {template.category}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Choose a template to customize the email content. If not selected, a default template will be used.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {form.watch("templateId") && (
                <div className="border rounded-lg p-4 bg-muted/30">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="h-4 w-4" />
                    <span className="font-medium">Template Preview</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    The selected template will be used to format the notification email. Template variables will be automatically replaced with actual data.
                  </p>
                </div>
              )}
            </div>
          </TabsContent>

              <TabsContent value="settings" className="flex-1 overflow-y-auto">
                <div className="space-y-6">
                  <div className="space-y-4">
                    <div className="border-b pb-2">
                      <h3 className="text-lg font-semibold">Notification Settings</h3>
                    </div>

                    <FormField
                      control={form.control}
                      name="isActive"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">Active</FormLabel>
                            <FormDescription>
                              Enable this notification to start sending emails
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </TabsContent>
            </Tabs>
            <DialogFooter className="px-6 pb-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : notification ? "Update Notification" : "Create Notification"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

