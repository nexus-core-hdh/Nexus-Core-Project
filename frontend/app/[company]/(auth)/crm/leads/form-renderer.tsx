 "use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { format } from "date-fns";
import { CalendarIcon, Upload, X, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FormField, FormSection } from "@/app/[company]/(auth)/pages/form-builder/form-builder";
import { cn } from "@/lib/utils";
import { formTemplatesApi } from "@/lib/api";
import { toast } from "sonner";
import { MinimalTiptapEditor } from "@/components/ui/custom/minimal-tiptap/minimal-tiptap";
import { SignaturePad } from "@/components/ui/signature-pad";

import { TimePicker } from "@/components/ui/time-picker";
// Separate component for file/image fields to avoid hooks order issues
interface FileUploadFieldProps {
  field: FormField;
  fieldValue: any;
  isRequired: boolean | undefined;
  widthClass: string;
  form: any;
}

// Separate component for tags fields to avoid hooks order issues
interface TagsFieldProps {
  field: FormField;
  fieldValue: any;
  isRequired: boolean | undefined;
  widthClass: string;
  form: any;
}

const TagsField: React.FC<TagsFieldProps> = ({
  field,
  fieldValue,
  isRequired,
  widthClass,
  form
}) => {
  const tagsValue = Array.isArray(fieldValue) ? fieldValue : (fieldValue ? [fieldValue] : []);
  const [newTag, setNewTag] = React.useState("");

  const addTag = () => {
    if (newTag.trim() && !tagsValue.includes(newTag.trim())) {
      const updatedTags = [...tagsValue, newTag.trim()];
      form.setValue(field.name, updatedTags);
      setNewTag("");
      form.clearErrors(field.name);
    }
  };

  const removeTag = (tagToRemove: string) => {
    const updatedTags = tagsValue.filter((tag) => tag !== tagToRemove);
    form.setValue(field.name, updatedTags.length > 0 ? updatedTags : []);
    if (isRequired && updatedTags.length === 0) {
      form.setError(field.name, {
        type: "required",
        message: `${field.label} is required`
      });
    }
  };

  return (
    <div className={widthClass}>
      <Label>
        {field.label}
        {isRequired && <span className="text-destructive ml-1">*</span>}
      </Label>
      <div className="mt-2 space-y-2">
        {/* Display existing tags */}
        {tagsValue.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tagsValue.map((tag: string, index: number) => (
              <Badge
                key={index}
                variant="secondary"
                className="flex items-center gap-1 pr-1"
              >
                {tag}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 hover:bg-destructive hover:text-destructive-foreground"
                  onClick={() => removeTag(tag)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            ))}
          </div>
        )}
        {/* Input to add new tag */}
        <div className="flex gap-2">
          <Input
            placeholder={field.placeholder || "Add a tag"}
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={addTag}
            disabled={!newTag.trim() || tagsValue.includes(newTag.trim())}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {field.helpText && (
        <p className="text-sm text-muted-foreground mt-1">{field.helpText}</p>
      )}
      {form.formState.errors[field.name] && (
        <p className="text-sm text-destructive mt-1">
          {form.formState.errors[field.name]?.message as string}
        </p>
      )}
    </div>
  );
};

const FileUploadField: React.FC<FileUploadFieldProps> = ({
  field,
  fieldValue,
  isRequired,
  widthClass,
  form
}) => {
  const [dragActive, setDragActive] = React.useState(false);
  const [uploadedFiles, setUploadedFiles] = React.useState<File[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    // Initialize with existing files if any
    const existingValue = fieldValue;
    if (existingValue && typeof existingValue === 'string') {
      // If it's a string URL, we can't convert it back to File, so leave it empty
      // This is just for display purposes
    }
  }, [fieldValue]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const files = Array.from(e.dataTransfer.files);
      handleFiles(files);
    }
  };

  const handleFiles = (files: File[]) => {
    if (field.type === "image") {
      // Filter only image files
      const imageFiles = files.filter(file => file.type.startsWith('image/'));
      if (imageFiles.length === 0) {
        toast.error("Please drop only image files");
        return;
      }
      const newFiles = [...uploadedFiles, ...imageFiles];
      setUploadedFiles(newFiles);
      form.setValue(field.name, newFiles);
      form.clearErrors(field.name);
    } else {
      const newFiles = [...uploadedFiles, ...files];
      setUploadedFiles(newFiles);
      form.setValue(field.name, newFiles);
      form.clearErrors(field.name);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      handleFiles(files);
    }
  };

  const removeFile = (index: number) => {
    const newFiles = uploadedFiles.filter((_, i) => i !== index);
    setUploadedFiles(newFiles);
    form.setValue(field.name, newFiles.length > 0 ? newFiles : null);
  };

  return (
    <div className={widthClass}>
      <Label htmlFor={field.name}>
        {field.label}
        {isRequired && <span className="text-destructive ml-1">*</span>}
      </Label>
      <div
        className={cn(
          "mt-1 border-2 border-dashed rounded-lg p-6 transition-colors",
          dragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25",
          "cursor-pointer hover:border-primary/50"
        )}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="flex flex-col items-center justify-center text-center">
          <Upload className="h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground mb-1">
            <span className="font-medium text-primary">Click to upload</span> or drag and drop
          </p>
          <p className="text-xs text-muted-foreground">
            {field.type === "image" ? "Images only" : "Files"}
          </p>
        </div>
        <input
          ref={fileInputRef}
          id={field.name}
          type="file"
          multiple
          accept={field.type === "image" ? "image/*" : undefined}
          className="hidden"
          onChange={handleFileInput}
        />
      </div>
      {uploadedFiles.length > 0 && (
        <div className="mt-2 space-y-2">
          {uploadedFiles.map((file, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-2 bg-muted rounded-md"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {field.type === "image" && file.type.startsWith('image/') ? (
                  <img
                    src={URL.createObjectURL(file)}
                    alt={file.name}
                    className="h-10 w-10 object-cover rounded"
                  />
                ) : (
                  <div className="h-10 w-10 bg-muted-foreground/20 rounded flex items-center justify-center">
                    <Upload className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024).toFixed(2)} KB
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile(index);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
      {field.helpText && (
        <p className="text-sm text-muted-foreground mt-1">{field.helpText}</p>
      )}
      {form.formState.errors[field.name] && (
        <p className="text-sm text-destructive mt-1">
          {form.formState.errors[field.name]?.message as string}
        </p>
      )}
    </div>
  );
};

interface FormRendererProps {
  templateId?: number;
  entityType?: string;
  initialData?: Record<string, any>;
  onSubmit: (data: Record<string, any>) => void | Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
  showButtons?: boolean; // Control whether to show buttons in FormRenderer
  formId?: string; // Form ID for external submit buttons
  onSubmittingChange?: (isSubmitting: boolean) => void; // Callback when submitting state changes
}

export function FormRenderer({
  templateId,
  entityType = "LEAD",
  initialData = {},
  onSubmit,
  onCancel,
  submitLabel = "Submit",
  showButtons = true,
  formId = "form-renderer-form",
  onSubmittingChange
}: FormRendererProps) {
  const [template, setTemplate] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [dateOpen, setDateOpen] = React.useState<Record<string, boolean>>({});
  const [datetimeOpen, setDatetimeOpen] = React.useState<Record<string, boolean>>({});

  const form = useForm({
    defaultValues: initialData
  });

  React.useEffect(() => {
    const loadTemplate = async () => {
      try {
        setLoading(true);
        let templateData = null;

        if (templateId) {
          templateData = await formTemplatesApi.getFormTemplate(templateId);
        } else {
          const templates = await formTemplatesApi.getFormTemplates(
            undefined,
            undefined,
            entityType,
            true
          );
          templateData = Array.isArray(templates)
            ? templates.find((t: any) => t.entityType === entityType && t.isActive)
            : null;
        }

        if (templateData) {
          setTemplate(templateData);
          // Set default values from template fields
          const fields = Array.isArray(templateData.formFields) ? templateData.formFields : [];
          const defaultValues = fields.reduce((acc: any, field: FormField) => {
            if (field.defaultValue !== undefined) {
              acc[field.name] = field.defaultValue;
            } else if (field.type === "checkbox") {
              acc[field.name] = false;
            } else if (["phone", "email", "website"].includes(field.type) && field.allowMultiple) {
              // Initialize with one empty entry by default
              acc[field.name] = field.typeOptions && field.typeOptions.length > 0 
                ? [{ type: field.typeOptions[0], value: "" }]
                : [{ value: "" }];
            } else {
              acc[field.name] = "";
            }
            return acc;
          }, {});
          form.reset({ ...defaultValues, ...initialData });
        } else {
          toast.error("No active form template found");
        }
      } catch (error: any) {
        console.error("Error loading form template:", error);
        toast.error("Failed to load form template");
      } finally {
        setLoading(false);
      }
    };

    loadTemplate();
  }, [templateId, entityType]);

  const getWidthClass = (width?: string) => {
    switch (width) {
      case "half":
        return "w-full md:flex-[0_0_calc(50%-0.5rem)] md:max-w-[calc(50%-0.5rem)]";
      case "third":
        return "w-full md:flex-[0_0_calc(33.333%-0.67rem)] md:max-w-[calc(33.333%-0.67rem)]";
      case "quarter":
        return "w-full md:flex-[0_0_calc(25%-0.75rem)] md:max-w-[calc(25%-0.75rem)]";
      default:
        return "w-full";
    }
  };

  const renderField = (field: FormField) => {
    const widthClass = getWidthClass(field.width);
    const isRequired = field.required;
    const fieldValue = form.watch(field.name);

    switch (field.type) {
      case "text":
        return (
          <div key={field.id} className={widthClass}>
            <Label htmlFor={field.name}>
              {field.label}
              {isRequired && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Input
              id={field.name}
              type="text"
              placeholder={field.placeholder}
              {...form.register(field.name, {
                required: isRequired ? `${field.label} is required` : false
              })}
              className="mt-2"
            />
            {field.helpText && (
              <p className="text-sm text-muted-foreground mt-1">{field.helpText}</p>
            )}
          </div>
        );

      case "email":
      case "url":
      case "phone":
      case "website":
        const hasTypeOptions = field.typeOptions && field.typeOptions.length > 0;
        const allowMultiple = field.allowMultiple;
        const inputType = field.type === "email" ? "email" : 
                         field.type === "url" || field.type === "website" ? "url" : 
                         field.type === "phone" ? "tel" : "text";
        
        // For multiple entries, use array structure
        if (allowMultiple) {
          let entries = Array.isArray(fieldValue) ? fieldValue : (fieldValue ? [fieldValue] : []);
          // Ensure at least one entry is shown
          if (entries.length === 0) {
            entries = hasTypeOptions 
              ? [{ type: field.typeOptions![0], value: "" }]
              : [{ value: "" }];
            form.setValue(field.name, entries);
          }
          
          return (
            <div key={field.id} className={widthClass}>
              <Label>
                {field.label}
                {isRequired && <span className="text-destructive ml-1">*</span>}
              </Label>
              <div className="space-y-2 mt-1">
                {entries.map((entry: any, index: number) => {
                  const entryValue = typeof entry === "object" ? entry.value : entry;
                  const entryType = typeof entry === "object" ? entry.type : "";
                  const entryId = `${field.name}-${index}`;
                  
                  return (
                    <div key={index} className="flex gap-2">
                      <Input
                        type={inputType}
                        placeholder={field.placeholder}
                        value={entryValue || ""}
                        onChange={(e) => {
                          const newEntries = [...entries];
                          if (hasTypeOptions) {
                            newEntries[index] = { type: entryType || field.typeOptions![0], value: e.target.value };
                          } else {
                            newEntries[index] = { value: e.target.value };
                          }
                          form.setValue(field.name, newEntries);
                        }}
                        className="flex-1"
                      />
                      {hasTypeOptions && (
                        <Select
                          value={entryType}
                          onValueChange={(value) => {
                            const newEntries = [...entries];
                            newEntries[index] = { type: value, value: entryValue || "" };
                            form.setValue(field.name, newEntries);
                          }}
                        >
                          <SelectTrigger className="w-[140px]">
                            <SelectValue placeholder="Type" />
                          </SelectTrigger>
                          <SelectContent>
                            {field.typeOptions!.map((option) => (
                              <SelectItem key={option} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const newEntries = entries.filter((_: any, i: number) => i !== index);
                          form.setValue(field.name, newEntries.length > 0 ? newEntries : undefined);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const currentEntries = Array.isArray(fieldValue) ? fieldValue : (fieldValue ? [fieldValue] : []);
                    const newEntry = hasTypeOptions 
                      ? { type: field.typeOptions![0], value: "" }
                      : { value: "" };
                    form.setValue(field.name, [...currentEntries, newEntry]);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add
                </Button>
              </div>
              {field.helpText && (
                <p className="text-sm text-muted-foreground mt-1">{field.helpText}</p>
              )}
            </div>
          );
        }
        
        // Single entry
        return (
          <div key={field.id} className={widthClass}>
            <Label htmlFor={field.name}>
              {field.label}
              {isRequired && <span className="text-destructive ml-1">*</span>}
            </Label>
            <div className={cn("mt-2", hasTypeOptions && "flex gap-2")}>
              <Input
                id={field.name}
                type={inputType}
                placeholder={field.placeholder}
                value={typeof fieldValue === "object" ? fieldValue?.value || "" : (fieldValue || "")}
                {...(hasTypeOptions
                  ? {
                      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                        const currentType =
                          typeof fieldValue === "object" ? fieldValue?.type : field.typeOptions![0];
                        form.setValue(field.name, { type: currentType, value: e.target.value });
                      },
                    }
                  : {})}
                className={hasTypeOptions ? "flex-1" : ""}
                {...(hasTypeOptions ? {} : form.register(field.name, {
                  required: isRequired ? `${field.label} is required` : false
                }))}
              />
              {hasTypeOptions && (
                <Select
                  value={typeof fieldValue === "object" ? fieldValue?.type : ""}
                  onValueChange={(value) => {
                    const currentValue = typeof fieldValue === "object" ? fieldValue?.value : (fieldValue || "");
                    form.setValue(field.name, { type: value, value: currentValue });
                  }}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    {field.typeOptions!.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            {field.helpText && (
              <p className="text-sm text-muted-foreground mt-1">{field.helpText}</p>
            )}
          </div>
        );

      case "textarea":
        return (
          <div key={field.id} className={widthClass}>
            <Label htmlFor={field.name}>
              {field.label}
              {isRequired && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Textarea
              id={field.name}
              placeholder={field.placeholder}
              {...form.register(field.name, {
                required: isRequired ? `${field.label} is required` : false
              })}
              className="mt-2"
              rows={4}
            />
            {field.helpText && (
              <p className="text-sm text-muted-foreground mt-1">{field.helpText}</p>
            )}
          </div>
        );

      case "number":
      case "currency":
      case "percentage":
        return (
          <div key={field.id} className={widthClass}>
            <Label htmlFor={field.name}>
              {field.label}
              {isRequired && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Input
              id={field.name}
              type="number"
              placeholder={field.placeholder}
              {...form.register(field.name, {
                required: isRequired ? `${field.label} is required` : false,
                valueAsNumber: true
              })}
              className="mt-2"
            />
            {field.helpText && (
              <p className="text-sm text-muted-foreground mt-1">{field.helpText}</p>
            )}
          </div>
        );

      case "date":
        const dateValue = fieldValue;
        return (
          <div key={field.id} className={widthClass}>
            <Label htmlFor={field.name}>
              {field.label}
              {isRequired && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Popover open={dateOpen[field.name] || false} onOpenChange={(open) => setDateOpen({ ...dateOpen, [field.name]: open })}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full mt-1 justify-start text-left font-normal",
                    !dateValue && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateValue ? (
                    format(new Date(dateValue), "PPP")
                  ) : (
                    <span>{field.placeholder || "Pick a date"}</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateValue ? new Date(dateValue) : undefined}
                  onSelect={(date) => {
                    if (date) {
                      form.setValue(field.name, format(date, "yyyy-MM-dd"));
                      setDateOpen({ ...dateOpen, [field.name]: false });
                    }
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            {field.helpText && (
              <p className="text-sm text-muted-foreground mt-1">{field.helpText}</p>
            )}
          </div>
        );

      case "datetime":
        const datetimeValue = fieldValue;
        const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(
          datetimeValue ? new Date(datetimeValue) : undefined
        );
        const [selectedTime, setSelectedTime] = React.useState<string>(
          datetimeValue ? format(new Date(datetimeValue), "HH:mm") : ""
        );

        React.useEffect(() => {
          if (datetimeValue) {
            const date = new Date(datetimeValue);
            setSelectedDate(date);
            setSelectedTime(format(date, "HH:mm"));
          }
        }, [datetimeValue]);

        const handleDateSelect = (date: Date | undefined) => {
          if (date) {
            setSelectedDate(date);
            if (selectedTime) {
              const [hours, minutes] = selectedTime.split(":");
              const newDateTime = new Date(date);
              newDateTime.setHours(parseInt(hours), parseInt(minutes));
              form.setValue(field.name, newDateTime.toISOString());
            }
          }
        };

        const handleTimeChange = (time: string) => {
          setSelectedTime(time);
          if (selectedDate && time) {
            const [hours, minutes] = time.split(":");
            const newDateTime = new Date(selectedDate);
            newDateTime.setHours(parseInt(hours), parseInt(minutes));
            form.setValue(field.name, newDateTime.toISOString());
          }
        };

        return (
          <div key={field.id} className={widthClass}>
            <Label htmlFor={field.name}>
              {field.label}
              {isRequired && <span className="text-destructive ml-1">*</span>}
            </Label>
            <div className="mt-2 space-y-2">
              <Popover open={datetimeOpen[field.name] || false} onOpenChange={(open) => setDatetimeOpen({ ...datetimeOpen, [field.name]: open })}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !selectedDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDate ? (
                      format(selectedDate, "PPP")
                    ) : (
                      <span>Pick a date</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={handleDateSelect}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <TimePicker value={selectedTime} onValueChange={handleTimeChange} />
            </div>
            {field.helpText && (
              <p className="text-sm text-muted-foreground mt-1">{field.helpText}</p>
            )}
          </div>
        );

      case "select":
        return (
          <div key={field.id} className={widthClass}>
            <Label htmlFor={field.name}>
              {field.label}
              {isRequired && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Select
              onValueChange={(value) => form.setValue(field.name, value)}
              defaultValue={fieldValue || field.defaultValue || ""}
            >
              <SelectTrigger className="mt-2 w-full">
                <SelectValue placeholder={field.placeholder || "Select an option"} />
              </SelectTrigger>
              <SelectContent>
                {field.options && field.options.length > 0 ? (
                  field.options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="no-options" disabled>No options available</SelectItem>
                )}
              </SelectContent>
            </Select>
            {field.helpText && (
              <p className="text-sm text-muted-foreground mt-1">{field.helpText}</p>
            )}
          </div>
        );

      case "multiselect":
        const multiselectValue = fieldValue || [];
        return (
          <div key={field.id} className={widthClass}>
            <Label htmlFor={field.name}>
              {field.label}
              {isRequired && <span className="text-destructive ml-1">*</span>}
            </Label>
            {field.options && field.options.length > 0 ? (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className={cn(
                      "w-full mt-1 justify-between font-normal",
                      multiselectValue.length === 0 && "text-muted-foreground"
                    )}
                  >
                    <span className="truncate">
                      {Array.isArray(multiselectValue) && multiselectValue.length > 0
                        ? multiselectValue.length === 1
                          ? field.options.find((opt) => opt.value === multiselectValue[0])?.label
                          : `${multiselectValue.length} items selected`
                        : field.placeholder || "Select options..."}
                    </span>
                    <svg
                      className="ml-2 h-4 w-4 shrink-0 opacity-50"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <div className="max-h-60 overflow-auto p-1">
                    {field.options.map((option) => {
                      const isSelected = Array.isArray(multiselectValue) && multiselectValue.includes(option.value);
                      return (
                        <div
                          key={option.value}
                          className={cn(
                            "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                            isSelected && "bg-accent"
                          )}
                          onClick={() => {
                            const current = form.watch(field.name) || [];
                            if (isSelected) {
                              form.setValue(field.name, current.filter((v: string) => v !== option.value));
                            } else {
                              form.setValue(field.name, [...current, option.value]);
                            }
                          }}
                        >
                          <div className="flex items-center space-x-2 flex-1">
                            <div className={cn(
                              "h-4 w-4 border rounded flex items-center justify-center",
                              isSelected && "bg-primary border-primary"
                            )}>
                              {isSelected && (
                                <svg
                                  className="h-3 w-3 text-primary-foreground"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M5 13l4 4L19 7"
                                  />
                                </svg>
                              )}
                            </div>
                            <span>{option.label}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
            ) : (
              <p className="text-sm text-muted-foreground mt-1">No options available</p>
            )}
            {field.helpText && (
              <p className="text-sm text-muted-foreground mt-1">{field.helpText}</p>
            )}
          </div>
        );

      case "radio":
        const radioValue = fieldValue || field.defaultValue || "";
        return (
          <div key={field.id} className={widthClass}>
            <Label>
              {field.label}
              {isRequired && <span className="text-destructive ml-1">*</span>}
            </Label>
            {field.options && field.options.length > 0 ? (
              <RadioGroup
                className="mt-2"
                value={radioValue}
                onValueChange={(value) => form.setValue(field.name, value)}
              >
                {field.options.map((option) => (
                  <div key={option.value} className="flex items-center space-x-2">
                    <RadioGroupItem value={option.value} id={`${field.name}-${option.value}`} />
                    <Label htmlFor={`${field.name}-${option.value}`} className="font-normal cursor-pointer">
                      {option.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            ) : (
              <p className="text-sm text-muted-foreground mt-1">No options available</p>
            )}
            {field.helpText && (
              <p className="text-sm text-muted-foreground mt-1">{field.helpText}</p>
            )}
          </div>
        );

      case "checkbox":
        return (
          <div key={field.id} className={widthClass}>
            <div className="flex items-center space-x-2">
              <Checkbox
                id={field.name}
                checked={fieldValue || false}
                onCheckedChange={(checked) => form.setValue(field.name, checked)}
              />
              <Label htmlFor={field.name} className="font-normal cursor-pointer">
                {field.label}
                {isRequired && <span className="text-destructive ml-1">*</span>}
              </Label>
            </div>
            {field.helpText && (
              <p className="text-sm text-muted-foreground mt-1 ml-6">{field.helpText}</p>
            )}
          </div>
        );

      case "richText":
        return (
          <div key={field.id} className={widthClass}>
            <Label htmlFor={field.name}>
              {field.label}
              {isRequired && <span className="text-destructive ml-1">*</span>}
            </Label>
            <div className="mt-2">
              <MinimalTiptapEditor
                value={fieldValue || ""}
                onChange={(content) => {
                  form.setValue(field.name, content);
                }}
                placeholder={field.placeholder || "Enter rich text content..."}
                className="min-h-[200px]"
              />
            </div>
            {field.helpText && (
              <p className="text-sm text-muted-foreground mt-1">{field.helpText}</p>
            )}
          </div>
        );

      case "file":
      case "image":
        return (
          <FileUploadField
            key={field.id}
            field={field}
            fieldValue={fieldValue}
            isRequired={isRequired}
            widthClass={widthClass}
            form={form}
          />
        );

      case "address":
        return (
          <div key={field.id} className={widthClass}>
            <Label>
              {field.label}
              {isRequired && <span className="text-destructive ml-1">*</span>}
            </Label>
            <div className="mt-1 space-y-2">
              <Input
                placeholder="Street address"
                {...form.register(`${field.name}.street`, {
                  required: isRequired ? `${field.label} is required` : false
                })}
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="City"
                  {...form.register(`${field.name}.city`, {
                    required: isRequired ? `${field.label} is required` : false
                  })}
                />
                <Input
                  placeholder="State"
                  {...form.register(`${field.name}.state`)}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="ZIP Code"
                  {...form.register(`${field.name}.zip`)}
                />
                <Input
                  placeholder="Country"
                  {...form.register(`${field.name}.country`)}
                />
              </div>
            </div>
            {field.helpText && (
              <p className="text-sm text-muted-foreground mt-1">{field.helpText}</p>
            )}
          </div>
        );

      case "company":
      case "user":
        return (
          <div key={field.id} className={widthClass}>
            <Label htmlFor={field.name}>
              {field.label}
              {isRequired && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Select
              onValueChange={(value) => form.setValue(field.name, value)}
              defaultValue={fieldValue || field.defaultValue || ""}
            >
              <SelectTrigger className="mt-2 w-full">
                <SelectValue placeholder={field.placeholder || `Select a ${field.type}`} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="preview-1">Preview {field.type} 1</SelectItem>
                <SelectItem value="preview-2">Preview {field.type} 2</SelectItem>
              </SelectContent>
            </Select>
            {field.helpText && (
              <p className="text-sm text-muted-foreground mt-1">{field.helpText}</p>
            )}
          </div>
        );

      case "signature":
        return (
          <div key={field.id} className={widthClass}>
            <Label htmlFor={field.name}>
              {field.label}
              {isRequired && <span className="text-destructive ml-1">*</span>}
            </Label>
            <div className="mt-2">
              <SignaturePad
                value={fieldValue || undefined}
                onChange={(value) => {
                  form.setValue(field.name, value || "");
                  if (isRequired && !value) {
                    form.setError(field.name, {
                      type: "required",
                      message: `${field.label} is required`
                    });
                  } else {
                    form.clearErrors(field.name);
                  }
                }}
                onBlur={() => {
                  form.trigger(field.name);
                }}
              />
            </div>
            {field.helpText && (
              <p className="text-sm text-muted-foreground mt-1">{field.helpText}</p>
            )}
            {form.formState.errors[field.name] && (
              <p className="text-sm text-destructive mt-1">
                {form.formState.errors[field.name]?.message as string}
              </p>
            )}
          </div>
        );

      case "tags":
        return (
          <TagsField
            key={field.id}
            field={field}
            fieldValue={fieldValue}
            isRequired={isRequired}
            widthClass={widthClass}
            form={form}
          />
        );

      default:
        return (
          <div key={field.id} className={widthClass}>
            <Label htmlFor={field.name}>
              {field.label}
              {isRequired && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Input
              id={field.name}
              placeholder={field.placeholder}
              {...form.register(field.name)}
              className="mt-2"
            />
            {field.helpText && (
              <p className="text-sm text-muted-foreground mt-1">{field.helpText}</p>
            )}
          </div>
        );
    }
  };

  const handleSubmit = async (data: any) => {
    // Validate required file/image fields
    const templateFields = template?.formFields || [];
    const missingFiles: string[] = [];
    
    templateFields.forEach((field: FormField) => {
      if ((field.type === "file" || field.type === "image") && field.required) {
        const fieldValue = data[field.name];
        if (!fieldValue || (Array.isArray(fieldValue) && fieldValue.length === 0)) {
          missingFiles.push(field.label);
          form.setError(field.name, {
            type: "required",
            message: `${field.label} is required`
          });
        }
      }
    });

    if (missingFiles.length > 0) {
      toast.error(`Please upload: ${missingFiles.join(", ")}`);
      return;
    }

    setIsSubmitting(true);
    onSubmittingChange?.(true);
    try {
      await onSubmit(data);
    } catch (error: any) {
      toast.error(error.message || "Failed to submit form");
      throw error; // Re-throw so parent can handle
    } finally {
      setIsSubmitting(false);
      onSubmittingChange?.(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-muted-foreground">Loading form template...</div>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <p className="text-muted-foreground mb-4">No active form template found for {entityType}</p>
        <p className="text-sm text-muted-foreground">Please create a form template in Form Builder first.</p>
      </div>
    );
  }

  const fields: FormField[] = Array.isArray(template.formFields) ? template.formFields : [];
  const sections: FormSection[] = Array.isArray((template.settings as any)?.sections)
    ? (template.settings as any).sections
    : [];
  const sortedSections = [...sections].sort((a, b) => a.order - b.order);
  const fieldsWithoutSection = fields.filter((f) => !f.sectionId);
  const fieldsBySection = sortedSections.reduce((acc, section) => {
    acc[section.id] = fields.filter((f) => f.sectionId === section.id);
    return acc;
  }, {} as Record<string, FormField[]>);

  return (
    <div className="space-y-6">
      <form 
        id={formId}
        onSubmit={form.handleSubmit(handleSubmit)} 
        className="space-y-6"
      >
        {/* Fields without section */}
        {fieldsWithoutSection.length > 0 && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-4 items-start">
              {fieldsWithoutSection.map((field) => renderField(field))}
            </div>
          </div>
        )}

        {/* Sections with their fields */}
        {(() => {
          // Group sections into rows based on column count and available space
          const rows: FormSection[][] = [];
          let currentRow: FormSection[] = [];
          let currentRowUsed = 0;

          sortedSections.forEach((section) => {
            const sectionFields = fieldsBySection[section.id] || [];
            if (sectionFields.length === 0) return;
            
            const columns = section.columns || 12;
            
            // If section takes full width (12 columns), always start a new row
            if (columns >= 12) {
              if (currentRow.length > 0) {
                rows.push([...currentRow]);
                currentRow = [];
                currentRowUsed = 0;
              }
              rows.push([section]);
              currentRow = [];
              currentRowUsed = 0;
            } 
            // For sections with less than 12 columns, try to fit in current row
            else {
              if (currentRowUsed + columns <= 12) {
                // Can fit in current row
                currentRow.push(section);
                currentRowUsed += columns;
              } else {
                // Start new row
                if (currentRow.length > 0) {
                  rows.push([...currentRow]);
                }
                currentRow = [section];
                currentRowUsed = columns;
              }
            }
          });

          // Add remaining row
          if (currentRow.length > 0) {
            rows.push(currentRow);
          }

          return rows.map((row, rowIndex) => (
            <div key={`row-${rowIndex}`} className="grid grid-cols-12 gap-4">
              {row.map((section) => {
                const sectionFields = fieldsBySection[section.id] || [];
                if (sectionFields.length === 0) return null;
                
                const columns = section.columns || 12;
                
                // Determine column span
                const colSpan = Math.min(Math.max(columns, 1), 12);
                const colSpanClasses: Record<number, string> = {
                  1: "col-span-1", 2: "col-span-2", 3: "col-span-3", 4: "col-span-4",
                  5: "col-span-5", 6: "col-span-6", 7: "col-span-7", 8: "col-span-8",
                  9: "col-span-9", 10: "col-span-10", 11: "col-span-11", 12: "col-span-12"
                };
                const colSpanClass = colSpanClasses[colSpan] || "col-span-12";

                return (
                  <div key={section.id} className={cn("space-y-4", colSpanClass)}>
                    <div className="border-b pb-2">
                      <h4 className="font-semibold">{section.title}</h4>
                      {section.description && (
                        <p className="text-sm text-muted-foreground mt-1">{section.description}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-4 items-start">
                      {sectionFields.map((field) => renderField(field))}
                    </div>
                  </div>
                );
              })}
            </div>
          ));
        })()}

        {fields.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <p>No fields configured in this template.</p>
          </div>
        )}

        {showButtons && fields.length > 0 && (
          <div className="flex justify-end gap-2 pt-4 border-t">
            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            )}
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Submitting..." : submitLabel}
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}


