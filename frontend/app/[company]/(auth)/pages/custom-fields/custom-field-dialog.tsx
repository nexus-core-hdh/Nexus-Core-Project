"use client";

import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { customFieldsApi } from "@/lib/api";
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
  FormDescription,
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
import { ScrollArea } from "@/components/ui/scroll-area";

const customFieldFormSchema = z.object({
  name: z.string().min(1, "Field name is required"),
  type: z.string().min(1, "Field type is required"),
  entity: z.string().min(1, "Entity is required"),
  required: z.boolean().default(false),
  includeInReports: z.boolean().default(false),
  options: z.string().optional()
});

type CustomFieldFormValues = z.input<typeof customFieldFormSchema>;

interface CustomFieldDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  field?: CustomField | null;
  onSuccess?: () => void;
}

export type CustomField = {
  id: string;
  name: string;
  type: string;
  entity: string;
  required: boolean;
  options?: string[];
  includeInReports: boolean;
};

const crmEntities = [
  { value: "leads", label: "Leads" },
  { value: "deals", label: "Deals" },
  { value: "contacts", label: "Contacts" },
  { value: "companies", label: "Companies" },
  { value: "tasks", label: "Tasks" },
  { value: "documents", label: "Documents" }
];

const fieldTypes = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "select", label: "Select" },
  { value: "checkbox", label: "Checkbox" },
  { value: "textarea", label: "Textarea" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" }
];

export function CustomFieldDialog({
  open,
  onOpenChange,
  field,
  onSuccess
}: CustomFieldDialogProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const form = useForm<CustomFieldFormValues>({
    resolver: zodResolver(customFieldFormSchema),
    defaultValues: {
      name: "",
      type: "text",
      entity: "leads",
      required: false,
      includeInReports: false,
      options: ""
    }
  });

  const selectedType = useWatch({
    control: form.control,
    name: "type",
    defaultValue: "text"
  });

  React.useEffect(() => {
    if (open) {
      if (field) {
        const optionsArray = Array.isArray(field.options) ? field.options : [];
        form.reset({
          name: field.name,
          type: field.type,
          entity: field.entity,
          required: field.required,
          includeInReports: field.includeInReports,
          options: optionsArray.join("\n")
        });
      } else {
        form.reset({
          name: "",
          type: "text",
          entity: "leads",
          required: false,
          includeInReports: false,
          options: ""
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, field]);

  const onSubmit = async (data: CustomFieldFormValues) => {
    setIsSubmitting(true);
    try {
      const parsed = customFieldFormSchema.parse(data);
      const fieldData = {
        name: parsed.name,
        type: parsed.type,
        entity: parsed.entity,
        required: parsed.required,
        includeInReports: parsed.includeInReports,
        options:
          parsed.type === "select" && parsed.options
            ? parsed.options.split("\n").filter((opt) => opt.trim())
            : null
      };

      if (field) {
        // Update existing field
        await customFieldsApi.updateCustomField(parseInt(field.id), fieldData);
        toast.success("Custom field updated successfully");
      } else {
        // Create new field
        await customFieldsApi.createCustomField(fieldData);
        toast.success("Custom field created successfully");
      }

      if (onSuccess) {
        onSuccess();
      }
      
      onOpenChange(false);
    } catch (error: any) {
      console.error("Failed to save custom field:", error);
      toast.error(error.message || "Failed to save custom field");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 flex-shrink-0">
          <DialogTitle>{field ? "Edit Custom Field" : "Add Custom Field"}</DialogTitle>
          <DialogDescription>
            {field
              ? "Update the custom field details below."
              : "Create a new custom field for your CRM entities."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
            <ScrollArea className="h-[calc(90vh-220px)] px-6">
              <div className="space-y-4 pb-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Field Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter field name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="entity"
                    render={({ field }) => (
                      <FormItem className="w-full">
                        <FormLabel>Entity *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select entity" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {crmEntities.map((entity) => (
                              <SelectItem key={entity.value} value={entity.value}>
                                {entity.label}
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
                    name="type"
                    render={({ field }) => (
                      <FormItem className="w-full">
                        <FormLabel>Field Type *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {fieldTypes.map((type) => (
                              <SelectItem key={type.value} value={type.value}>
                                {type.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {selectedType === "select" && (
                  <FormField
                    control={form.control}
                    name="options"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Select Options (one per line)</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Option 1&#10;Option 2&#10;Option 3"
                            {...field}
                            rows={4}
                          />
                        </FormControl>
                        <FormDescription>
                          Enter each option on a new line
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <div className="space-y-3">
                  <FormField
                    control={form.control}
                    name="required"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel>Required Field</FormLabel>
                          <FormDescription>
                            Make this field mandatory when filling forms
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="includeInReports"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel>Include in Reports</FormLabel>
                          <FormDescription>
                            Include this field in analytical reports
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
            </ScrollArea>
            <DialogFooter className="px-6 pb-6 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : field ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

