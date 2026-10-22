"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { emailTemplatesApi } from "@/lib/api";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Eye, Code, Mail, Plus } from "lucide-react";
import { EmailTemplate } from "./page";

const emailTemplateFormSchema = z.object({
  name: z.string().min(1, "Template name is required"),
  subject: z.string().min(1, "Subject is required"),
  body: z.string().min(1, "Email body is required"),
  category: z.enum([
    "WELCOME",
    "NOTIFICATION",
    "FOLLOW_UP",
    "REMINDER",
    "INVOICE",
    "QUOTE",
    "LEAD_NURTURING",
    "DEAL_CLOSED",
    "TASK_ASSIGNED",
    "CUSTOM"
  ]),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false)
});

type EmailTemplateFormValues = z.input<typeof emailTemplateFormSchema>;

interface EmailTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: EmailTemplate | null;
  onSuccess?: () => void;
}

const availableVariables = [
  { label: "Lead Name", value: "{{lead.name}}", category: "Lead" },
  { label: "Lead Email", value: "{{lead.email}}", category: "Lead" },
  { label: "Lead Phone", value: "{{lead.phone}}", category: "Lead" },
  { label: "Lead Company", value: "{{lead.company}}", category: "Lead" },
  { label: "Lead Stage", value: "{{lead.stage}}", category: "Lead" },
  { label: "Contact Name", value: "{{contact.name}}", category: "Contact" },
  { label: "Contact Email", value: "{{contact.email}}", category: "Contact" },
  { label: "Contact Phone", value: "{{contact.phone}}", category: "Contact" },
  { label: "Deal Name", value: "{{deal.name}}", category: "Deal" },
  { label: "Deal Value", value: "{{deal.value}}", category: "Deal" },
  { label: "Deal Stage", value: "{{deal.stage}}", category: "Deal" },
  { label: "Company Name", value: "{{company.name}}", category: "Company" },
  { label: "Company Email", value: "{{company.email}}", category: "Company" },
  { label: "User Name", value: "{{user.name}}", category: "User" },
  { label: "User Email", value: "{{user.email}}", category: "User" },
  { label: "Current Date", value: "{{date.current}}", category: "System" },
  { label: "Current Time", value: "{{time.current}}", category: "System" }
];

export function EmailTemplateDialog({
  open,
  onOpenChange,
  template,
  onSuccess
}: EmailTemplateDialogProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState("compose");
  const [previewMode, setPreviewMode] = React.useState(false);
  const [selectedVariable, setSelectedVariable] = React.useState<string>("");

  const form = useForm<EmailTemplateFormValues>({
    resolver: zodResolver(emailTemplateFormSchema),
    defaultValues: {
      name: "",
      subject: "",
      body: "",
      category: "CUSTOM",
      description: "",
      isActive: true,
      isDefault: false
    }
  });

  React.useEffect(() => {
    if (open) {
      if (template) {
        form.reset({
          name: template.name,
          subject: template.subject,
          body: template.body,
          category: template.category,
          description: template.description || "",
          isActive: template.isActive,
          isDefault: template.isDefault
        });
      } else {
        form.reset({
          name: "",
          subject: "",
          body: "",
          category: "CUSTOM",
          description: "",
          isActive: true,
          isDefault: false
        });
      }
      setActiveTab("compose");
      setPreviewMode(false);
    }
  }, [open, template, form]);

  const insertVariable = (variable: string, field: "subject" | "body") => {
    const currentValue = form.getValues(field);
    const cursorPos = (document.activeElement as HTMLTextAreaElement)?.selectionStart || currentValue.length;
    const newValue = currentValue.slice(0, cursorPos) + variable + currentValue.slice(cursorPos);
    form.setValue(field, newValue);
  };

  const getPreviewContent = () => {
    const subject = form.watch("subject");
    const body = form.watch("body");
    
    // Replace variables with sample data for preview
    let previewSubject = subject;
    let previewBody = body;
    
    const sampleData: Record<string, string> = {
      "{{lead.name}}": "John Doe",
      "{{lead.email}}": "john.doe@example.com",
      "{{lead.phone}}": "+1 (555) 123-4567",
      "{{lead.company}}": "Acme Corp",
      "{{lead.stage}}": "Qualified",
      "{{contact.name}}": "Jane Smith",
      "{{contact.email}}": "jane.smith@example.com",
      "{{contact.phone}}": "+1 (555) 987-6543",
      "{{deal.name}}": "Enterprise Deal",
      "{{deal.value}}": "$50,000",
      "{{deal.stage}}": "Negotiation",
      "{{company.name}}": "Your Company",
      "{{company.email}}": "info@yourcompany.com",
      "{{user.name}}": "Current User",
      "{{user.email}}": "user@example.com",
      "{{date.current}}": new Date().toLocaleDateString(),
      "{{time.current}}": new Date().toLocaleTimeString()
    };

    Object.entries(sampleData).forEach(([key, value]) => {
      previewSubject = previewSubject.replace(new RegExp(key.replace(/[{}]/g, "\\$&"), "g"), value);
      previewBody = previewBody.replace(new RegExp(key.replace(/[{}]/g, "\\$&"), "g"), value);
    });

    return { subject: previewSubject, body: previewBody };
  };

  const onSubmit = async (data: EmailTemplateFormValues) => {
    setIsSubmitting(true);
    try {
      const parsed = emailTemplateFormSchema.parse(data);
      if (template) {
        await emailTemplatesApi.updateEmailTemplate(template.id, parsed);
        toast.success("Email template updated successfully");
      } else {
        await emailTemplatesApi.createEmailTemplate(parsed);
        toast.success("Email template created successfully");
      }
      if (onSuccess) onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Failed to save email template:", error);
      toast.error(error.message || "Failed to save email template");
    } finally {
      setIsSubmitting(false);
    }
  };

  const groupedVariables = availableVariables.reduce((acc, variable) => {
    if (!acc[variable.category]) {
      acc[variable.category] = [];
    }
    acc[variable.category].push(variable);
    return acc;
  }, {} as Record<string, typeof availableVariables>);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[90vw] max-w-[90vw] h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle>
            {template ? "Edit Email Template" : "Create Email Template"}
          </DialogTitle>
          <DialogDescription>
            {template
              ? "Update the email template configuration below."
              : "Create a new email template with variables and rich formatting."}
          </DialogDescription>
        </DialogHeader>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col px-6 pb-6 overflow-hidden">
          <TabsList className="mb-4">
            <TabsTrigger value="compose">Compose</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="variables">Variables</TabsTrigger>
          </TabsList>
          
          <TabsContent value="compose" className="flex-1 overflow-y-auto">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="space-y-4">
                  <div className="border-b pb-2">
                    <h3 className="text-lg font-semibold">Template Information</h3>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Template Name *</FormLabel>
                          <FormControl>
                            <Input placeholder="Welcome Email" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="category"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Category *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select category" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="WELCOME">Welcome</SelectItem>
                              <SelectItem value="NOTIFICATION">Notification</SelectItem>
                              <SelectItem value="FOLLOW_UP">Follow Up</SelectItem>
                              <SelectItem value="REMINDER">Reminder</SelectItem>
                              <SelectItem value="INVOICE">Invoice</SelectItem>
                              <SelectItem value="QUOTE">Quote</SelectItem>
                              <SelectItem value="LEAD_NURTURING">Lead Nurturing</SelectItem>
                              <SelectItem value="DEAL_CLOSED">Deal Closed</SelectItem>
                              <SelectItem value="TASK_ASSIGNED">Task Assigned</SelectItem>
                              <SelectItem value="CUSTOM">Custom</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Template description..."
                            {...field}
                            rows={2}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="space-y-4">
                  <div className="border-b pb-2">
                    <h3 className="text-lg font-semibold">Email Content</h3>
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="subject"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Subject Line *</FormLabel>
                        <FormControl>
                          <div className="flex gap-2">
                            <Input placeholder="Email subject with {{variables}}" {...field} />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (selectedVariable) {
                                  insertVariable(selectedVariable, "subject");
                                } else {
                                  setActiveTab("variables");
                                }
                              }}>
                              <Plus className="h-4 w-4 mr-1" />
                              Variable
                            </Button>
                          </div>
                        </FormControl>
                        <p className="text-xs text-muted-foreground">
                          Use variables like {"{{"}lead.name{"}}"} to personalize emails
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="body"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email Body (HTML) *</FormLabel>
                        <FormControl>
                          <div className="space-y-2">
                            <div className="flex gap-2 mb-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  if (selectedVariable) {
                                    insertVariable(selectedVariable, "body");
                                  } else {
                                    setActiveTab("variables");
                                  }
                                }}>
                                <Plus className="h-4 w-4 mr-1" />
                                Insert Variable
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setActiveTab("preview")}>
                                <Eye className="h-4 w-4 mr-1" />
                                Preview
                              </Button>
                            </div>
                            <Textarea
                              placeholder="Enter email body HTML content..."
                              {...field}
                              rows={15}
                              className="font-mono text-sm"
                            />
                          </div>
                        </FormControl>
                        <p className="text-xs text-muted-foreground">
                          HTML is supported. Use variables for dynamic content.
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="space-y-4">
                  <div className="border-b pb-2">
                    <h3 className="text-lg font-semibold">Settings</h3>
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="isActive"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Active</FormLabel>
                          <p className="text-sm text-muted-foreground">
                            Enable this template for use in workflows
                          </p>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="isDefault"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Default Template</FormLabel>
                          <p className="text-sm text-muted-foreground">
                            Set as default template for this category
                          </p>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onOpenChange(false)}
                    disabled={isSubmitting}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Saving..." : template ? "Update Template" : "Create Template"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </TabsContent>

          <TabsContent value="preview" className="flex-1 overflow-y-auto">
            <div className="space-y-4">
              <div className="border rounded-lg p-6 bg-muted/30">
                <h3 className="text-lg font-semibold mb-4">Email Preview</h3>
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm font-medium">Subject:</Label>
                    <div className="mt-1 p-2 bg-background border rounded">
                      {getPreviewContent().subject || "No subject"}
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Body:</Label>
                    <div
                      className="mt-1 p-4 bg-background border rounded min-h-[400px]"
                      dangerouslySetInnerHTML={{ __html: getPreviewContent().body || "<p>No content</p>" }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="variables" className="flex-1 overflow-y-auto">
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-2">Available Variables</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Click on a variable to insert it into your template. Variables will be replaced with actual data when the email is sent.
                </p>
              </div>
              
              {Object.entries(groupedVariables).map(([category, vars]) => (
                <div key={category} className="space-y-2">
                  <h4 className="font-medium text-sm">{category}</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {vars.map((variable) => (
                      <Button
                        key={variable.value}
                        type="button"
                        variant="outline"
                        className="justify-start"
                        onClick={() => {
                          setSelectedVariable(variable.value);
                          setActiveTab("compose");
                        }}>
                        <Code className="h-4 w-4 mr-2" />
                        <div className="text-left">
                          <div className="font-medium text-xs">{variable.label}</div>
                          <div className="text-xs text-muted-foreground font-mono">
                            {variable.value}
                          </div>
                        </div>
                      </Button>
                    ))}
                  </div>
                  <Separator className="my-4" />
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

