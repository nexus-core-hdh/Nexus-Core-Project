"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { formTemplatesApi, businessProcessesApi, bpmApi } from "@/lib/api";
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PenTool, Eye, Settings } from "lucide-react";
import { FormTemplate } from "./page";
import { FormBuilder } from "./form-builder";
import { FormPreview } from "./form-preview";

const formTemplateFormSchema = z.object({
  name: z.string().min(1, "Template name is required"),
  description: z.string().optional(),
  entityType: z.string().optional().default("CUSTOM"),
  customEntityName: z.string().optional(),
  requestTypeId: z.string().optional(),
  formFields: z.array(z.any()),
  sections: z.array(z.any()).optional(),
  workflowId: z.number().optional().nullable(),
  path: z.string().optional().nullable(),
  isActive: z.boolean(),
  settings: z.any().optional()
});

type FormTemplateFormValues = z.infer<typeof formTemplateFormSchema>;

interface FormTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: FormTemplate | null;
  onSuccess?: () => void;
}

export function FormTemplateDialog({
  open,
  onOpenChange,
  template,
  onSuccess
}: FormTemplateDialogProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState("builder");
  const [workflows, setWorkflows] = React.useState<any[]>([]);
  const [loadingWorkflows, setLoadingWorkflows] = React.useState(false);
  const [requestTypes, setRequestTypes] = React.useState<any[]>([]);
  const [loadingRequestTypes, setLoadingRequestTypes] = React.useState(false);
  const [sections, setSections] = React.useState<any[]>([]);
  const [currentTemplate, setCurrentTemplate] = React.useState<FormTemplate | null>(template || null);

  // Map a BPM request type's entityType string to the FormTemplate entityType value
  const RT_ENTITY_TO_FORM_TYPE: Record<string, string> = {
    Lead: "LEAD", Deal: "DEAL", Contact: "CONTACT", User: "USER",
    BpmTask: "TASK", Invoice: "INVOICE", Product: "PRODUCT",
    Customer: "CUSTOMER", Quote: "QUOTE",
  };

  const form = useForm<FormTemplateFormValues>({
    resolver: zodResolver(formTemplateFormSchema) as any,
    defaultValues: {
      name: "",
      description: "",
      entityType: "CUSTOM",
      customEntityName: "",
      requestTypeId: "",
      formFields: [],
      workflowId: null,
      path: "",
      isActive: true,
      settings: {}
    }
  });

  React.useEffect(() => {
    if (open) {
      loadWorkflows();
      loadRequestTypes();
      const templateToUse = template || currentTemplate;
      if (templateToUse) {
        // Only update currentTemplate if it's different to avoid infinite loops
        if (currentTemplate?.id !== templateToUse.id) {
          setCurrentTemplate(templateToUse);
        }
        const templateSections = Array.isArray((templateToUse.settings as any)?.sections) ? (templateToUse.settings as any).sections : [];
        const templateFields = Array.isArray(templateToUse.formFields) ? templateToUse.formFields : [];
        
        console.log('Loading template sections with dbIds:', templateSections.map((s: any) => ({ id: s.id, dbId: s.dbId, title: s.title })));
        console.log('Loading template fields with dbIds:', templateFields.map((f: any) => ({ id: f.id, dbId: f.dbId, label: f.label })));

        const normalizedEntityType =
          templateToUse.entityType === "COMPANY" ? "CUSTOMER" : templateToUse.entityType;
        
        form.reset({
          name: templateToUse.name,
          description: templateToUse.description || "",
          entityType: normalizedEntityType,
          customEntityName: (templateToUse as any).customEntityName || "",
          requestTypeId: (templateToUse.settings as any)?.requestTypeId || "",
          formFields: templateFields,
          sections: templateSections,
          workflowId: templateToUse.workflowId || null,
          path: templateToUse.path || "",
          isActive: templateToUse.isActive,
          settings: templateToUse.settings || {}
        });
        
        // If template has no sections, create a default one
        if (templateSections.length === 0) {
          const defaultSection = {
            id: `section-default-${Date.now()}`,
            title: "Default Section",
            order: 0
          };
          setSections([defaultSection]);
        } else {
          setSections(templateSections);
        }
      } else {
        form.reset({
          name: "",
          description: "",
          entityType: "CUSTOM",
          customEntityName: "",
          requestTypeId: "",
          formFields: [],
          sections: [],
          workflowId: null,
          path: "",
          isActive: true,
          settings: {}
        });
        // Create default section for new templates
        const defaultSection = {
          id: `section-default-${Date.now()}`,
          title: "Default Section",
          order: 0
        };
        setSections([defaultSection]);
      }
      setActiveTab("builder");
    } else {
      // Clear currentTemplate when dialog closes
      setCurrentTemplate(null);
    }
  }, [open, template?.id]); // Only depend on open and template.id, not form or currentTemplate

  const loadWorkflows = async () => {
    try {
      setLoadingWorkflows(true);
      const data = await businessProcessesApi.getBusinessProcesses();
      setWorkflows(Array.isArray(data) ? data : []);
    } catch (error: any) {
      console.error("Error loading workflows:", error);
      toast.error("Failed to load workflows");
    } finally {
      setLoadingWorkflows(false);
    }
  };

  const loadRequestTypes = async () => {
    try {
      setLoadingRequestTypes(true);
      const data: any = await bpmApi.requestTypes.list();
      setRequestTypes(Array.isArray(data) ? data : []);
    } catch (error: any) {
      console.error("Error loading request types:", error);
    } finally {
      setLoadingRequestTypes(false);
    }
  };

  const handleRequestTypeChange = (rtId: string) => {
    form.setValue("requestTypeId", rtId);
    if (!rtId) return;
    const rt = requestTypes.find((r) => r.id === rtId);
    if (rt?.entityType) {
      const mapped = RT_ENTITY_TO_FORM_TYPE[rt.entityType] ?? "CUSTOM";
      form.setValue("entityType", mapped);
      if (mapped === "CUSTOM") {
        form.setValue("customEntityName", rt.customEntityName || rt.entityType);
      } else {
        form.setValue("customEntityName", "");
      }
    }
  };

  const onSubmit = async (data: FormTemplateFormValues, event?: React.BaseSyntheticEvent) => {
    // Prevent duplicate submissions
    if (isSubmitting) {
      return;
    }
    
    // Only allow form submission if it's explicitly triggered by the submit button
    // Check if the submitter is the actual Update Template button
    if (event && event.nativeEvent) {
      const submitter = (event.nativeEvent as any).submitter as HTMLButtonElement | null;
      if (submitter && submitter.form === event.currentTarget) {
        // Check if this is the template form submit button
        const isTemplateSubmitButton = submitter.getAttribute("form") === "template-form" || 
                                       submitter.textContent?.includes("Template");
        if (!isTemplateSubmitButton && submitter.type === "submit") {
          // This is a different submit button (like from field config dialog) - prevent submission
          event.preventDefault();
          return;
        }
      }
    }
    
    setIsSubmitting(true);
    try {
      const submitData = {
        ...data,
        customEntityName: data.entityType === "CUSTOM" ? data.customEntityName : undefined,
        settings: {
          ...(data.settings || {}),
          sections: sections,
          requestTypeId: data.requestTypeId || undefined,
        }
      };
      let updatedTemplate;
      const templateId = template?.id || currentTemplate?.id;
      
      if (templateId) {
        updatedTemplate = await formTemplatesApi.updateFormTemplate(templateId, submitData);
        toast.success("Form template updated successfully");
        
        // Reload the template to get updated dbIds and update the form
        const refreshedTemplate = await formTemplatesApi.getFormTemplate(templateId);
        setCurrentTemplate(refreshedTemplate);
        
        // Update form with refreshed data including dbIds
        form.reset({
          name: refreshedTemplate.name,
          description: refreshedTemplate.description || "",
          entityType: refreshedTemplate.entityType,
          customEntityName: (refreshedTemplate as any).customEntityName || "",
          requestTypeId: (refreshedTemplate.settings as any)?.requestTypeId || "",
          formFields: Array.isArray(refreshedTemplate.formFields) ? refreshedTemplate.formFields : [],
          sections: Array.isArray((refreshedTemplate.settings as any)?.sections) ? (refreshedTemplate.settings as any).sections : [],
          workflowId: refreshedTemplate.workflowId || null,
          path: refreshedTemplate.path || "",
          isActive: refreshedTemplate.isActive,
          settings: refreshedTemplate.settings || {}
        });
        
        const refreshedSections = Array.isArray((refreshedTemplate.settings as any)?.sections) ? (refreshedTemplate.settings as any).sections : [];
        setSections(refreshedSections);
        
        console.log('Template reloaded after save with dbIds:', {
          sections: refreshedSections.map((s: any) => ({ id: s.id, dbId: s.dbId, title: s.title })),
          fields: Array.isArray(refreshedTemplate.formFields) ? refreshedTemplate.formFields.map((f: any) => ({ id: f.id, dbId: f.dbId, label: f.label })) : []
        });
      } else {
        updatedTemplate = await formTemplatesApi.createFormTemplate(submitData);
        toast.success("Form template created successfully");
        setCurrentTemplate(updatedTemplate);
      }
      
      // Log the returned template to check if dbIds are present
      console.log('Template saved, checking returned data:', {
        sections: (updatedTemplate?.settings as any)?.sections?.map((s: any) => ({ id: s.id, dbId: s.dbId, title: s.title })),
        fields: updatedTemplate?.formFields?.map((f: any) => ({ id: f.id, dbId: f.dbId, label: f.label }))
      });
      
      if (onSuccess) onSuccess();
      // Don't close the dialog if updating - keep it open so user can manage permissions
      if (!templateId) {
        onOpenChange(false);
      }
    } catch (error: any) {
      console.error("Failed to save form template:", error);
      toast.error(error.message || "Failed to save form template");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFieldsChange = (fields: any[]) => {
    // Update form fields without triggering validation or submission
    form.setValue("formFields", fields, { 
      shouldValidate: false,
      shouldDirty: true,
      shouldTouch: false
    });
  };

  const handleSectionsChange = React.useCallback((newSections: any[]) => {
    setSections(newSections);
    form.setValue("sections", newSections);
    // Also update settings to include sections
    const currentSettings = form.getValues("settings") || {};
    form.setValue("settings", { ...currentSettings, sections: newSections });
  }, [form]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[95vw] max-w-[95vw] h-[95vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle>
            {template ? "Edit Form Template" : "Create Form Template"}
          </DialogTitle>
          <DialogDescription>
            {template
              ? "Update the form template configuration below."
              : "Create a new dynamic form template with custom fields and workflow integration."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form 
            id="template-form"
            onSubmit={(e) => {
              // Only allow submission if it's from the actual template form submit button
              const submitter = (e.nativeEvent as any).submitter as HTMLButtonElement | null;
              if (submitter) {
                const isTemplateSubmitButton = submitter.getAttribute("data-template-submit") === "true" ||
                                               submitter.id === "template-submit-button" ||
                                               (submitter.getAttribute("form") === "template-form" && 
                                                submitter.closest("#template-form") !== null);
                if (!isTemplateSubmitButton) {
                  e.preventDefault();
                  e.stopPropagation();
                  if (e.nativeEvent) {
                    (e.nativeEvent as any).stopImmediatePropagation?.();
                  }
                  return false;
                }
              } else {
                // If no submitter (programmatic submission), prevent it
                e.preventDefault();
                e.stopPropagation();
                if (e.nativeEvent) {
                  (e.nativeEvent as any).stopImmediatePropagation?.();
                }
                return false;
              }
              e.preventDefault();
              e.stopPropagation();
              form.handleSubmit(onSubmit)(e);
            }} 
            className="flex-1 flex flex-col overflow-hidden"
            onKeyDown={(e) => {
              // Prevent form submission on Enter key unless explicitly in a submit button
              if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "BUTTON" && (e.target as HTMLElement).tagName !== "TEXTAREA") {
                e.preventDefault();
                e.stopPropagation();
              }
            }}
          >
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col px-6 pb-6 overflow-hidden">
              <TabsList className="mb-4">
                <TabsTrigger value="builder">
                  <PenTool className="h-4 w-4 mr-2" />
                  Form Builder
                </TabsTrigger>
                <TabsTrigger value="preview">
                  <Eye className="h-4 w-4 mr-2" />
                  Preview
                </TabsTrigger>
                <TabsTrigger value="settings">
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="builder" className="flex-1 overflow-hidden flex flex-col">
                <div className="space-y-4 flex-1 flex flex-col overflow-hidden">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Template Name *</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., Lead Capture Form" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="requestTypeId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Request Type</FormLabel>
                          <Select
                            value={field.value || "__none__"}
                            onValueChange={(v) => handleRequestTypeChange(v === "__none__" ? "" : v)}
                            disabled={loadingRequestTypes}
                          >
                            <FormControl>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="— No request type —" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="w-full">
                              <SelectItem value="__none__">— No request type —</SelectItem>
                              {requestTypes.map((rt: any) => (
                                <SelectItem key={rt.id} value={rt.id}>{rt.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            Link this template to a BPM request type.
                          </FormDescription>
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

                  <div className="flex-1 overflow-hidden flex flex-col border rounded-lg">
                    <FormBuilder
                      fields={form.watch("formFields") || []}
                      sections={sections}
                      onFieldsChange={handleFieldsChange}
                      onSectionsChange={handleSectionsChange}
                      entityType={form.watch("entityType")}
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="preview" className="flex-1 overflow-hidden flex flex-col">
                <FormPreview
                  fields={form.watch("formFields") || []}
                  sections={sections}
                  templateName={form.watch("name")}
                  templateDescription={form.watch("description")}
                />
              </TabsContent>

              <TabsContent value="settings" className="flex-1 overflow-y-auto">
                <div className="space-y-6">
                  <div className="border-b pb-2">
                    <h3 className="text-lg font-semibold">Template Settings</h3>
                  </div>
                  
                  <div className="space-y-2">
                    <FormLabel>Linked Request Type</FormLabel>
                    <div className="rounded-lg border p-4 bg-muted/50">
                      <div className="flex items-center justify-between">
                        <div>
                          {(() => {
                            const rtId = form.watch("requestTypeId");
                            const rt = requestTypes.find((r) => r.id === rtId);
                            if (rt) {
                              return (
                                <>
                                  <p className="font-medium">Request Type: {rt.name}</p>
                                  {rt.entityType && (
                                    <p className="text-sm text-muted-foreground mt-1">
                                      Entity: {rt.entityType}{rt.customEntityName ? ` (${rt.customEntityName})` : ""}
                                    </p>
                                  )}
                                </>
                              );
                            }
                            return <p className="text-sm text-muted-foreground">No request type linked. Select one in the Form Builder tab.</p>;
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>

                  <FormField
                    control={form.control}
                    name="path"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Route Path (Optional)</FormLabel>
                        <FormControl>
                          <div className="flex gap-2">
                            <span className="flex items-center text-sm text-muted-foreground">/forms</span>
                            <Input
                              placeholder="lead-capture"
                              {...field}
                              value={field.value || ""}
                            />
                          </div>
                        </FormControl>
                        <FormDescription>
                          Additional URL path where this form will be accessible. Leave empty if not needed.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="workflowId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Attached Workflow</FormLabel>
                        <Select
                          value={field.value != null ? String(field.value) : "__none__"}
                          onValueChange={(v) => field.onChange(v === "__none__" ? null : parseInt(v))}
                          disabled={loadingWorkflows}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="No Workflow" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="w-full">
                            <SelectItem value="__none__">No Workflow</SelectItem>
                            {workflows
                              .filter((w) => w.isActive && w.status === "ACTIVE")
                              .map((workflow) => (
                                <SelectItem key={workflow.id} value={String(workflow.id)}>
                                  {workflow.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Select a workflow to trigger when this form is submitted.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="isActive"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Active</FormLabel>
                          <FormDescription>
                            Only active templates can be used
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              </TabsContent>
            </Tabs>
            <DialogFooter className="px-6 pb-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                form="template-form"
                id="template-submit-button"
                onClick={(e) => {
                  // Ensure this button click explicitly submits the form
                  e.stopPropagation();
                  // Mark this as the intended submit button
                  (e.currentTarget as HTMLButtonElement).setAttribute("data-template-submit", "true");
                }}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Saving..." : template ? "Update Template" : "Create Template"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

