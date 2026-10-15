"use client";

import * as React from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { formTemplatesApi } from "@/lib/api";
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
  SelectValue
} from "@/components/ui/select";
import { FormField as FormFieldType } from "./form-builder";
import { Plus, Trash2, GripVertical, Settings, ShieldCheck, SlidersHorizontal } from "lucide-react";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

const fieldConfigSchema = z.object({
  label: z.string().min(1, "Label is required"),
  name: z.string().min(1, "Name is required").regex(/^[a-z0-9-_]+$/, "Name must be lowercase alphanumeric with hyphens/underscores"),
  placeholder: z.string().optional(),
  required: z.boolean(),
  defaultValue: z.string().optional(),
  helpText: z.string().optional(),
  width: z.enum(["full", "half", "third", "quarter"]),
  validation: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    pattern: z.string().optional(),
    message: z.string().optional()
  }).optional(),
  options: z.array(z.object({
    label: z.string().min(1, "Label is required"),
    value: z.string().min(1, "Value is required")
  })).optional(),
  databaseConfig: z.object({
    model: z.string().min(1, "Model is required"),
    displayField: z.string().optional(),
    valueField: z.string().optional(),
    filter: z.any().optional()
  }).optional(),
  conditional: z.object({
    field: z.string().min(1, "Field is required"),
    operator: z.enum(["equals", "notEquals", "contains", "greaterThan", "lessThan"]),
    value: z.any()
  }).optional(),
  readonly: z.boolean().optional(),
  disabled: z.boolean().optional(),
  autoFocus: z.boolean().optional(),
  tabIndex: z.number().optional(),
  customClass: z.string().optional(),
  typeOptions: z.array(z.string()).optional(),
  allowMultiple: z.boolean().optional()
}).superRefine((data, ctx) => {
  // If databaseConfig exists and has a model, displayField and valueField are required
  if (data.databaseConfig && data.databaseConfig.model) {
    if (!data.databaseConfig.displayField || !data.databaseConfig.displayField.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Display Field is required when using database",
        path: ["databaseConfig", "displayField"]
      });
    }
    if (!data.databaseConfig.valueField || !data.databaseConfig.valueField.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Value Field is required when using database",
        path: ["databaseConfig", "valueField"]
      });
    }
  }
});

type FieldConfigFormValues = z.infer<typeof fieldConfigSchema>;

interface FieldConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  field: FormFieldType;
  onSave: (field: FormFieldType) => void;
}

// Utility function to convert label to standard field name (snake_case with hyphens/underscores)
function labelToFieldName(label: string): string {
  if (!label || !label.trim()) return "";
  
  let name = label
    .trim()
    .toLowerCase()
    // Replace spaces and special characters (except hyphens/underscores) with hyphens
    .replace(/[^a-z0-9_-]+/g, "-")
    // Replace multiple consecutive hyphens/underscores with a single hyphen
    .replace(/[-_]+/g, "-")
    // Remove leading/trailing hyphens/underscores
    .replace(/^[-_]+|[-_]+$/g, "");
  
  // Ensure it doesn't start with a number (prepend with underscore if it does)
  if (/^\d/.test(name)) {
    name = `field_${name}`;
  }
  
  // Ensure it's not empty
  if (!name) {
    name = "field";
  }
  
  return name;
}

export function FieldConfigDialog({
  open,
  onOpenChange,
  field,
  onSave
}: FieldConfigDialogProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState("basic");
  const [databaseModels, setDatabaseModels] = React.useState<any[]>([]);
  const [modelData, setModelData] = React.useState<any[]>([]);
  const [loadingModels, setLoadingModels] = React.useState(false);
  const [loadingData, setLoadingData] = React.useState(false);
  const [useDatabase, setUseDatabase] = React.useState(false);
  const [nameManuallyEdited, setNameManuallyEdited] = React.useState(false);
  const [initialNameValue, setInitialNameValue] = React.useState<string>("");

  const form = useForm<FieldConfigFormValues>({
    resolver: zodResolver(fieldConfigSchema) as any,
    defaultValues: {
      label: field.label || "",
      name: field.name || "",
      placeholder: field.placeholder || "",
      required: field.required || false,
      defaultValue: field.defaultValue || "",
      helpText: field.helpText || "",
      width: field.width || "full",
      validation: field.validation || {},
      options: field.options || [],
      databaseConfig: field.databaseConfig || undefined,
      conditional: field.conditional || undefined,
      readonly: (field as any).readonly || false,
      disabled: (field as any).disabled || false,
      autoFocus: (field as any).autoFocus || false,
      tabIndex: (field as any).tabIndex || undefined,
      customClass: (field as any).customClass || "",
      typeOptions: (field as any).typeOptions || [],
      allowMultiple: (field as any).allowMultiple || false
    }
  });

  // Auto-fill name from label when label changes (only if name wasn't manually edited in this session)
  const labelValue = form.watch("label");
  const currentNameValue = form.watch("name");
  
  React.useEffect(() => {
    if (open && labelValue && labelValue.trim()) {
      // Auto-fill if:
      // 1. Name is empty, OR
      // 2. Name hasn't been manually edited in this session (!nameManuallyEdited), OR
      // 3. Name still matches the initial value (user hasn't changed it yet)
      // This allows auto-fill when label changes even if field was originally manually edited
      const shouldAutoFill = !currentNameValue || 
                             currentNameValue.trim() === "" || 
                             !nameManuallyEdited ||
                             currentNameValue === initialNameValue;
      
      if (shouldAutoFill) {
        const autoName = labelToFieldName(labelValue);
        if (autoName && autoName !== currentNameValue) {
          form.setValue("name", autoName, { shouldValidate: false });
          // Update initialNameValue to the new auto-generated name so future changes can track properly
          // This ensures that if user changes label again, it will auto-fill unless they manually edited name
          if (!nameManuallyEdited || currentNameValue === initialNameValue) {
            setInitialNameValue(autoName);
            setNameManuallyEdited(false);
          }
        }
      }
    }
  }, [labelValue, open, nameManuallyEdited, currentNameValue, initialNameValue, form]);

  // Initialize form when dialog opens
  React.useEffect(() => {
    if (open) {
      const initialLabel = field.label || "";
      const autoNameFromLabel = initialLabel ? labelToFieldName(initialLabel) : "";
      const initialName = field.name || autoNameFromLabel;
      
      // Store the initial name value to track if user changes it in this session
      setInitialNameValue(initialName);
      
      // Reset manual edit flag - we'll track edits during this session
      // Don't assume it was manually edited based on whether it matches auto-generated name
      // Allow auto-fill to work when label changes, as long as user hasn't edited name in this session
      setNameManuallyEdited(false);
      
      loadDatabaseModels();
      setUseDatabase(!!field.databaseConfig);
      form.reset({
        label: initialLabel,
        name: initialName,
        placeholder: field.placeholder || "",
        required: field.required || false,
        defaultValue: field.defaultValue || "",
        helpText: field.helpText || "",
        width: field.width || "full",
        validation: field.validation || {},
        options: field.options || [],
        databaseConfig: field.databaseConfig || undefined,
        conditional: field.conditional || undefined,
        readonly: (field as any).readonly || false,
        disabled: (field as any).disabled || false,
        autoFocus: (field as any).autoFocus || false,
        tabIndex: (field as any).tabIndex || undefined,
        customClass: (field as any).customClass || "",
        typeOptions: (field as any).typeOptions || [],
        allowMultiple: (field as any).allowMultiple || false,
      });
      setActiveTab("basic");
    }
  }, [open, field, form]);

  React.useEffect(() => {
    if (useDatabase && form.watch("databaseConfig.model")) {
      loadModelData();
    }
  }, [useDatabase, form.watch("databaseConfig.model"), form.watch("databaseConfig.displayField"), form.watch("databaseConfig.valueField")]);

  const loadDatabaseModels = async () => {
    try {
      setLoadingModels(true);
      const data = await formTemplatesApi.getDatabaseModels();
      setDatabaseModels(Array.isArray(data) ? data : []);
    } catch (error: any) {
      console.error("Error loading database models:", error);
      toast.error("Failed to load database models");
    } finally {
      setLoadingModels(false);
    }
  };

  const loadModelData = async () => {
    const config = form.watch("databaseConfig");
    if (!config?.model) return;
    if (typeof config.displayField !== "string" || typeof config.valueField !== "string") return;
    const displayField = config.displayField;
    const valueField = config.valueField;

    try {
      setLoadingData(true);
      const data = await formTemplatesApi.getModelData(
        config.model,
        displayField,
        valueField
      );
      setModelData(Array.isArray(data) ? data : []);
      
      // Auto-populate options from database
      if (data && Array.isArray(data) && data.length > 0) {
        form.setValue("options", data.map((item: any) => ({
          label: item.label || item[displayField],
          value: item.value || item[valueField]
        })));
      }
    } catch (error: any) {
      console.error("Error loading model data:", error);
      toast.error("Failed to load data from database");
    } finally {
      setLoadingData(false);
    }
  };

  const onSubmit = async (data: FieldConfigFormValues) => {
    setIsSubmitting(true);
    try {
      const updatedField: FormFieldType = {
        ...field,
        ...data,
        databaseConfig: useDatabase ? data.databaseConfig : undefined,
        options: useDatabase && data.databaseConfig ? data.options : (data.options || []),
        // Include conditional only if field is set
        conditional: data.conditional?.field ? data.conditional : undefined,
        // Include advanced properties
        readonly: data.readonly || undefined,
        disabled: data.disabled || undefined,
        autoFocus: data.autoFocus || undefined,
        tabIndex: data.tabIndex !== undefined ? data.tabIndex : undefined,
        customClass: data.customClass || undefined,
        typeOptions: data.typeOptions && data.typeOptions.length > 0 ? data.typeOptions : undefined,
        allowMultiple: data.allowMultiple || undefined
      } as FormFieldType;
      // Save the field update (this updates the template form fields but doesn't submit)
      onSave(updatedField);
      // Close the dialog after successful save
      // Use setTimeout to ensure the save completes and prevent any event bubbling
      setTimeout(() => {
        onOpenChange(false);
      }, 0);
    } catch (error: any) {
      console.error("Failed to save field configuration:", error);
      toast.error(error.message || "Failed to save field configuration");
      setIsSubmitting(false);
      // Don't close dialog on error
      throw error;
    }
  };

  const selectedModel = databaseModels.find((m) => m.name === form.watch("databaseConfig.model"));
  const isSelectType = ["select", "multiselect", "radio"].includes(field.type);
  const isPhoneEmailWebsiteType = ["phone", "email", "website"].includes(field.type);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[90vw] max-w-[90vw] h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle>Configure Field: {field.type}</DialogTitle>
          <DialogDescription>
            Configure the field properties, validation, and behavior
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form 
            id="field-config-form"
            onSubmit={(e) => {
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
                <TabsTrigger value="basic">
                  <Settings className="h-4 w-4 mr-2" />
                  Basic
                </TabsTrigger>
                {isSelectType && <TabsTrigger value="options">Options</TabsTrigger>}
                <TabsTrigger value="validation">
                  <ShieldCheck className="h-4 w-4 mr-2" />
                  Validation
                </TabsTrigger>
                <TabsTrigger value="advanced">
                  <SlidersHorizontal className="h-4 w-4 mr-2" />
                  Advanced
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="basic" className="flex-1 overflow-y-auto">
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="label"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Field Label *</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., First Name" {...field} />
                        </FormControl>
                        <FormDescription>
                          The label displayed to users
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Field Name *</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="e.g., first-name" 
                            {...field}
                            onFocus={(e) => {
                              // Store the initial value when user focuses (before they edit)
                              const beforeEditValue = e.target.value;
                              // Use a small delay to check if value changed (user typed)
                              setTimeout(() => {
                                const afterEditValue = form.getValues("name");
                                // Only mark as manually edited if user actually changed it AND it's different from auto-generated
                                if (afterEditValue !== beforeEditValue && afterEditValue !== labelToFieldName(form.getValues("label"))) {
                                  setNameManuallyEdited(true);
                                }
                              }, 200);
                            }}
                            onChange={(e) => {
                              field.onChange(e);
                              // Check if the new value differs from what would be auto-generated
                              const currentValue = e.target.value.trim();
                              const expectedAutoName = labelToFieldName(form.getValues("label"));
                              // Only mark as manually edited if user is typing something different from auto-generated
                              // AND it's different from the initial value (user actually changed it)
                              if (currentValue && currentValue !== expectedAutoName && currentValue !== initialNameValue) {
                                // Use a small delay to avoid marking during auto-fill
                                setTimeout(() => {
                                  if (form.getValues("name") === currentValue && currentValue !== expectedAutoName) {
                                    setNameManuallyEdited(true);
                                  }
                                }, 100);
                              }
                            }}
                            onBlur={(e) => {
                              // Mark as manually edited if the value differs from what would be auto-generated
                              // AND it's different from the initial value (user actually edited it)
                              const currentValue = e.target.value.trim();
                              const expectedAutoName = labelToFieldName(form.getValues("label"));
                              if (currentValue && currentValue !== expectedAutoName && currentValue !== initialNameValue) {
                                setNameManuallyEdited(true);
                              }
                            }}
                          />
                        </FormControl>
                        <FormDescription>
                          Internal field name (lowercase, alphanumeric, hyphens/underscores only)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="placeholder"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Placeholder</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter placeholder text..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="helpText"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Help Text</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Help text displayed below the field..."
                            {...field}
                            rows={2}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="defaultValue"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Default Value</FormLabel>
                        <FormControl>
                          <Input placeholder="Default value..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="width"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Field Width</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || "full"}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select width" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="full">Full Width</SelectItem>
                              <SelectItem value="half">Half Width</SelectItem>
                              <SelectItem value="third">Third Width</SelectItem>
                              <SelectItem value="quarter">Quarter Width</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="required"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">Required</FormLabel>
                            <FormDescription>
                              Field must be filled
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

                    {isPhoneEmailWebsiteType && (
                      <>
                        <FormField
                          control={form.control}
                          name="allowMultiple"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                              <div className="space-y-0.5">
                                <FormLabel className="text-base">Allow Multiple Entries</FormLabel>
                                <FormDescription>
                                  Allow users to add multiple entries with an "Add" button
                                </FormDescription>
                              </div>
                              <FormControl>
                                <Switch
                                  checked={field.value || false}
                                  onCheckedChange={field.onChange}
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="typeOptions"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Type Options</FormLabel>
                              <FormDescription>
                                Configure dropdown options (e.g., "Work Phone", "Mobile", "Home")
                              </FormDescription>
                              <FormControl>
                                <TypeOptionsEditor
                                  options={field.value || []}
                                  onOptionsChange={(options) => field.onChange(options)}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </>
                    )}
                  </div>
                </div>
              </TabsContent>


              {isSelectType && (
                <TabsContent value="options" className="flex-1 overflow-y-auto">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold">Options Configuration</h3>
                        <p className="text-sm text-muted-foreground">
                          Configure options for {field.type} field
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={useDatabase}
                          onCheckedChange={(checked) => {
                            setUseDatabase(checked);
                            if (checked) {
                              // Initialize databaseConfig if it doesn't exist
                              const currentConfig = form.getValues("databaseConfig");
                              if (!currentConfig) {
                                form.setValue("databaseConfig", {
                                  model: "",
                                  displayField: "",
                                  valueField: "",
                                  filter: undefined
                                });
                              }
                            } else {
                              // Clear databaseConfig when disabled
                              form.setValue("databaseConfig", undefined);
                              form.setValue("options", []);
                            }
                          }}
                        />
                        <label className="text-sm">Use Database</label>
                      </div>
                    </div>

                    {useDatabase ? (
                      <div className="space-y-4">
                        <FormField
                          control={form.control}
                          name="databaseConfig.model"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Database Model</FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                value={field.value || ""}
                                disabled={loadingModels}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select a model" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {databaseModels.map((model) => (
                                    <SelectItem key={model.name} value={model.name}>
                                      {model.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormDescription>
                                Select the database table/model to pull options from
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        {selectedModel && (
                          <>
                            <FormField
                              control={form.control}
                              name="databaseConfig.displayField"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Display Field</FormLabel>
                                  <Select
                                    onValueChange={field.onChange}
                                    value={field.value || ""}
                                  >
                                    <FormControl>
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select display field" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      {selectedModel.fields.map((f: string) => (
                                        <SelectItem key={f} value={f}>
                                          {f}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <FormDescription>
                                    Field to display in the dropdown
                                  </FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="databaseConfig.valueField"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Value Field</FormLabel>
                                  <Select
                                    onValueChange={field.onChange}
                                    value={field.value || ""}
                                  >
                                    <FormControl>
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select value field" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      {selectedModel.fields.map((f: string) => (
                                        <SelectItem key={f} value={f}>
                                          {f}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <FormDescription>
                                    Field to use as the option value
                                  </FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {loadingData && (
                              <div className="text-sm text-muted-foreground">Loading data...</div>
                            )}

                            {modelData.length > 0 && (
                              <div className="border rounded-lg p-4">
                                <div className="text-sm font-medium mb-2">Preview ({modelData.length} items)</div>
                                <div className="max-h-40 overflow-y-auto space-y-1">
                                  {modelData.slice(0, 10).map((item: any, index: number) => (
                                    <div key={index} className="text-xs text-muted-foreground">
                                      {item.label} ({item.value})
                                    </div>
                                  ))}
                                  {modelData.length > 10 && (
                                    <div className="text-xs text-muted-foreground">
                                      ... and {modelData.length - 10} more
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    ) : (
                      <ManualOptionsEditor
                        options={form.watch("options") || []}
                        onOptionsChange={(options) => form.setValue("options", options)}
                      />
                    )}
                  </div>
                </TabsContent>
              )}

              <TabsContent value="validation" className="flex-1 overflow-y-auto">
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="validation.min"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Minimum Value/Length</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="Min value..."
                            {...field}
                            value={field.value || ""}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="validation.max"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Maximum Value/Length</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="Max value..."
                            {...field}
                            value={field.value || ""}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="validation.pattern"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Validation Pattern (Regex)</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., ^[A-Za-z]+$" {...field} />
                        </FormControl>
                        <FormDescription>
                          Regular expression pattern for validation
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="validation.message"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Custom Error Message</FormLabel>
                        <FormControl>
                          <Input placeholder="Custom validation error message..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </TabsContent>

              <TabsContent value="advanced" className="flex-1 overflow-y-auto">
                <div className="space-y-6">
                  {/* Conditional Logic Section */}
                  <div className="space-y-4">
                    <div>
                      <h3 className="font-semibold mb-1">Conditional Logic</h3>
                      <p className="text-sm text-muted-foreground">
                        Show or hide this field based on another field's value
                      </p>
                    </div>

                    <FormField
                      control={form.control}
                      name="conditional.field"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Show When Field</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Enter field name (e.g., subscription-type)" 
                              {...field}
                              value={field.value || ""}
                            />
                          </FormControl>
                          <FormDescription>
                            Name of the field to check (must match another field's name)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="conditional.operator"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Condition Operator</FormLabel>
                          <Select 
                            onValueChange={field.onChange} 
                            value={field.value || ""}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select operator" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="equals">Equals</SelectItem>
                              <SelectItem value="notEquals">Not Equals</SelectItem>
                              <SelectItem value="contains">Contains</SelectItem>
                              <SelectItem value="greaterThan">Greater Than</SelectItem>
                              <SelectItem value="lessThan">Less Than</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            Comparison operator for the condition
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="conditional.value"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Expected Value</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Enter expected value (e.g., premium)" 
                              {...field}
                              value={field.value !== undefined && field.value !== null ? String(field.value) : ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                // Try to parse as number if it's a numeric value, otherwise keep as string
                                if (val && !isNaN(Number(val)) && val.trim() !== "") {
                                  field.onChange(Number(val));
                                } else {
                                  field.onChange(val || undefined);
                                }
                              }}
                            />
                          </FormControl>
                          <FormDescription>
                            Value to compare against (can be text or number)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                      <div className="text-sm">
                        <span className="font-medium">Condition:</span>{" "}
                        <span className="text-muted-foreground">
                          Show this field when{" "}
                          <code className="px-1 py-0.5 bg-background rounded text-xs">
                            {form.watch("conditional.field") || "[field name]"}
                          </code>{" "}
                          {form.watch("conditional.operator") ? (
                            <span className="lowercase">
                              {form.watch("conditional.operator") === "equals" && "equals"}
                              {form.watch("conditional.operator") === "notEquals" && "does not equal"}
                              {form.watch("conditional.operator") === "contains" && "contains"}
                              {form.watch("conditional.operator") === "greaterThan" && "is greater than"}
                              {form.watch("conditional.operator") === "lessThan" && "is less than"}
                            </span>
                          ) : (
                            "[operator]"
                          )}{" "}
                          <code className="px-1 py-0.5 bg-background rounded text-xs">
                            {form.watch("conditional.value") !== undefined && form.watch("conditional.value") !== null 
                              ? String(form.watch("conditional.value")) 
                              : "[value]"}
                          </code>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="border-t pt-6 space-y-4">
                    <div>
                      <h3 className="font-semibold mb-1">Field Behavior</h3>
                      <p className="text-sm text-muted-foreground">
                        Control how the field behaves and appears to users
                      </p>
                    </div>

                    <FormField
                      control={form.control}
                      name="readonly"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">Read Only</FormLabel>
                            <FormDescription>
                              Field value cannot be changed by users
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value || false}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="disabled"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">Disabled</FormLabel>
                            <FormDescription>
                              Field is disabled and cannot be interacted with
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value || false}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="autoFocus"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">Auto Focus</FormLabel>
                            <FormDescription>
                              Automatically focus this field when the form loads
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value || false}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="border-t pt-6 space-y-4">
                    <div>
                      <h3 className="font-semibold mb-1">Accessibility & Styling</h3>
                      <p className="text-sm text-muted-foreground">
                        Additional settings for accessibility and custom styling
                      </p>
                    </div>

                    <FormField
                      control={form.control}
                      name="tabIndex"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tab Index</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              placeholder="Tab order (0, 1, 2, ...)"
                              {...field}
                              value={field.value !== undefined ? String(field.value) : ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                field.onChange(val ? parseInt(val, 10) : undefined);
                              }}
                            />
                          </FormControl>
                          <FormDescription>
                            Tab order for keyboard navigation (lower numbers come first)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="customClass"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Custom CSS Classes</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="e.g., custom-field my-class" 
                              {...field}
                              value={field.value || ""}
                            />
                          </FormControl>
                          <FormDescription>
                            Additional CSS classes to apply to the field container
                          </FormDescription>
                          <FormMessage />
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
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button 
                type="button"
                onClick={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  // Prevent any form submission from bubbling up
                  if (e.nativeEvent) {
                    e.nativeEvent.stopImmediatePropagation();
                  }
                  
                  // If useDatabase is enabled, ensure databaseConfig is properly set
                  if (useDatabase) {
                    const currentConfig = form.getValues("databaseConfig");
                    if (!currentConfig || !currentConfig.model) {
                      form.setError("databaseConfig.model", {
                        type: "manual",
                        message: "Model is required when using database"
                      });
                      setActiveTab("options");
                      return;
                    }
                    if (!currentConfig.displayField || !currentConfig.displayField.trim()) {
                      form.setError("databaseConfig.displayField", {
                        type: "manual",
                        message: "Display Field is required when using database"
                      });
                      setActiveTab("options");
                      return;
                    }
                    if (!currentConfig.valueField || !currentConfig.valueField.trim()) {
                      form.setError("databaseConfig.valueField", {
                        type: "manual",
                        message: "Value Field is required when using database"
                      });
                      setActiveTab("options");
                      return;
                    }
                  }
                  
                  // Manually trigger form validation and submission
                  const isValid = await form.trigger();
                  if (isValid) {
                    const formData = form.getValues();
                    try {
                      await onSubmit(formData);
                    } catch (error) {
                      // Error already handled in onSubmit
                    }
                  } else {
                    // If validation fails, switch to the tab with errors
                    const errors = form.formState.errors;
                    if (errors.databaseConfig) {
                      setActiveTab("options");
                    } else if (errors.validation) {
                      setActiveTab("validation");
                    } else if (errors.conditional) {
                      setActiveTab("advanced");
                    }
                  }
                }}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Saving..." : "Save Field"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

interface ManualOptionsEditorProps {
  options: Array<{ label: string; value: string }>;
  onOptionsChange: (options: Array<{ label: string; value: string }>) => void;
}

function OptionItem({ 
  option, 
  index, 
  onUpdate, 
  onDelete 
}: { 
  option: { label: string; value: string }; 
  index: number;
  onUpdate: (index: number, option: { label: string; value: string }) => void;
  onDelete: (index: number) => void;
}) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [label, setLabel] = React.useState(option.label);
  const [value, setValue] = React.useState(option.value);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({
    id: `option-${index}`,
    data: {
      type: "option",
      index
    }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  React.useEffect(() => {
    setLabel(option.label);
    setValue(option.value);
  }, [option]);

  const handleSave = () => {
    if (label.trim() && value.trim()) {
      onUpdate(index, { label: label.trim(), value: value.trim() });
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setLabel(option.label);
    setValue(option.value);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="border rounded-lg p-3 space-y-2 bg-background">
        <div className="grid grid-cols-2 gap-2">
          <Input
            placeholder="Label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            autoFocus
          />
          <Input
            placeholder="Value"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!label.trim() || !value.trim()}
          >
            Save
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleCancel}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border rounded-lg p-3 bg-background flex items-center gap-3"
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 grid grid-cols-2 gap-2">
        <div>
          <span className="text-sm font-medium">{option.label}</span>
        </div>
        <div>
          <span className="text-sm text-muted-foreground">{option.value}</span>
        </div>
      </div>
      <div className="flex gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsEditing(true)}
        >
          Edit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(index)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function ManualOptionsEditor({ options, onOptionsChange }: ManualOptionsEditorProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  const handleAddOption = () => {
    const newOption = {
      label: `Option ${options.length + 1}`,
      value: `option-${options.length + 1}`
    };
    onOptionsChange([...options, newOption]);
  };

  const handleUpdateOption = (index: number, updatedOption: { label: string; value: string }) => {
    const newOptions = [...options];
    newOptions[index] = updatedOption;
    onOptionsChange(newOptions);
  };

  const handleDeleteOption = (index: number) => {
    if (confirm("Are you sure you want to delete this option?")) {
      const newOptions = options.filter((_, i) => i !== index);
      onOptionsChange(newOptions);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const oldIndex = options.findIndex((_, i) => `option-${i}` === active.id);
    const newIndex = options.findIndex((_, i) => `option-${i}` === over.id);

    if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
      onOptionsChange(arrayMove(options, oldIndex, newIndex));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Manual Options</h3>
          <p className="text-sm text-muted-foreground">
            Add, edit, and reorder options manually
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddOption}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Option
        </Button>
      </div>

      {options.length === 0 ? (
        <div className="border rounded-lg p-8 text-center">
          <p className="text-sm text-muted-foreground mb-4">
            No options added yet. Click "Add Option" to get started.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={handleAddOption}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add First Option
          </Button>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={options.map((_, i) => `option-${i}`)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {options.map((option, index) => (
                <OptionItem
                  key={`option-${index}`}
                  option={option}
                  index={index}
                  onUpdate={handleUpdateOption}
                  onDelete={handleDeleteOption}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {options.length > 0 && (
        <div className="text-xs text-muted-foreground">
          {options.length} option{options.length !== 1 ? "s" : ""} configured
        </div>
      )}
    </div>
  );
}

interface TypeOptionsEditorProps {
  options: string[];
  onOptionsChange: (options: string[]) => void;
}

function TypeOptionsEditor({ options, onOptionsChange }: TypeOptionsEditorProps) {
  const handleAddOption = () => {
    onOptionsChange([...options, ""]);
  };

  const handleUpdateOption = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = value;
    onOptionsChange(newOptions);
  };

  const handleDeleteOption = (index: number) => {
    const newOptions = options.filter((_, i) => i !== index);
    onOptionsChange(newOptions);
  };

  return (
    <div className="space-y-3">
      {options.length === 0 ? (
        <div className="border rounded-lg p-4 text-center">
          <p className="text-sm text-muted-foreground mb-3">
            No options configured. Add options to show a dropdown.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddOption}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Option
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {options.map((option, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                value={option}
                onChange={(e) => handleUpdateOption(index, e.target.value)}
                placeholder={`Option ${index + 1} (e.g., Work Phone, Mobile, Home)`}
                className="flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleDeleteOption(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddOption}
            className="w-full"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Option
          </Button>
        </div>
      )}
    </div>
  );
}

