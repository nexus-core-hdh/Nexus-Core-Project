"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { format, startOfWeek, endOfWeek, getWeek, getYear, startOfMonth } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { FormField, FormSection } from "./form-builder";
import { cn } from "@/lib/utils";
import { Star, X, Plus, Trash2 } from "lucide-react";
import { SignaturePad } from "@/components/ui/signature-pad";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { TimePicker } from "@/components/ui/time-picker";
interface FormPreviewProps {
  fields: FormField[];
  sections?: FormSection[];
  templateName?: string;
  templateDescription?: string;
}

export function FormPreview({ fields, sections = [], templateName, templateDescription }: FormPreviewProps) {
  const [dateOpen, setDateOpen] = React.useState<Record<string, boolean>>({});
  const [datetimeOpen, setDatetimeOpen] = React.useState<Record<string, boolean>>({});
  const [monthOpen, setMonthOpen] = React.useState<Record<string, boolean>>({});
  const [weekOpen, setWeekOpen] = React.useState<Record<string, boolean>>({});
  const [tagInputs, setTagInputs] = React.useState<Record<string, string>>({});
  
  const form = useForm({
    defaultValues: fields.reduce((acc, field) => {
      if (field.type === "checkbox" || field.type === "toggle") {
        acc[field.name] = field.defaultValue || false;
      } else if (field.type === "tags") {
        acc[field.name] = field.defaultValue || [];
      } else if (field.type === "range") {
        acc[field.name] = field.defaultValue || field.validation?.min || 50;
      } else if (field.type === "rating") {
        acc[field.name] = field.defaultValue || 0;
      } else if (["phone", "email", "website"].includes(field.type) && field.allowMultiple) {
        if (field.defaultValue) {
          acc[field.name] = Array.isArray(field.defaultValue) ? field.defaultValue : [field.defaultValue];
        } else {
          // Initialize with one empty entry by default
          acc[field.name] = field.typeOptions && field.typeOptions.length > 0 
            ? [{ type: field.typeOptions[0], value: "" }]
            : [{ value: "" }];
        }
      } else {
        acc[field.name] = field.defaultValue || "";
      }
      return acc;
    }, {} as Record<string, any>)
  });

  const sortedSections = [...sections].sort((a, b) => a.order - b.order);
  const fieldsWithoutSection = fields.filter((f) => !f.sectionId);
  const fieldsBySection = sortedSections.reduce((acc, section) => {
    acc[section.id] = fields.filter((f) => f.sectionId === section.id);
    return acc;
  }, {} as Record<string, FormField[]>);

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

    switch (field.type) {
      case "text":
      case "password":
      case "search":
        return (
          <div key={field.id} className={widthClass}>
            <Label htmlFor={field.name}>
              {field.label}
              {isRequired && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Input
              id={field.name}
              type={
                field.type === "password" ? "password" : 
                field.type === "search" ? "search" : 
                "text"
              }
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
        
        // Get current field value
        const fieldValue = form.watch(field.name);
        
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
        const registered = !hasTypeOptions
          ? form.register(field.name, {
              required: isRequired ? `${field.label} is required` : false
            })
          : null;
        const { onChange: registeredOnChange, ...registeredRest } =
          (registered ?? {}) as unknown as { onChange?: (e: unknown) => void };

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
                onChange={(e) => {
                  if (hasTypeOptions) {
                    const fallbackType = field.typeOptions?.[0] ?? "";
                    const currentType = typeof fieldValue === "object" ? (fieldValue?.type ?? fallbackType) : fallbackType;
                    form.setValue(field.name, { type: currentType, value: e.target.value });
                  } else {
                    registeredOnChange?.(e);
                  }
                }}
                className={hasTypeOptions ? "flex-1" : ""}
                {...registeredRest}
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
                    {(field.typeOptions ?? []).map((option) => (
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

      case "currency":
        return (
          <div key={field.id} className={widthClass}>
            <Label htmlFor={field.name}>
              {field.label}
              {isRequired && <span className="text-destructive ml-1">*</span>}
            </Label>
            <div className="mt-1 relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input
                id={field.name}
                type="number"
                step="0.01"
                placeholder={field.placeholder || "0.00"}
                {...form.register(field.name, {
                  required: isRequired ? `${field.label} is required` : false,
                  valueAsNumber: true
                })}
                className="pl-7"
              />
            </div>
            {field.helpText && (
              <p className="text-sm text-muted-foreground mt-1">{field.helpText}</p>
            )}
          </div>
        );

      case "percentage":
        return (
          <div key={field.id} className={widthClass}>
            <Label htmlFor={field.name}>
              {field.label}
              {isRequired && <span className="text-destructive ml-1">*</span>}
            </Label>
            <div className="mt-1 relative">
              <Input
                id={field.name}
                type="number"
                step="0.01"
                min="0"
                max="100"
                placeholder={field.placeholder || "0"}
                {...form.register(field.name, {
                  required: isRequired ? `${field.label} is required` : false,
                  valueAsNumber: true
                })}
                className="pr-7"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
            </div>
            {field.helpText && (
              <p className="text-sm text-muted-foreground mt-1">{field.helpText}</p>
            )}
          </div>
        );

      case "date":
        const dateValue = form.watch(field.name);
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

      case "time":
        return (
          <div key={field.id} className={widthClass}>
            <Label htmlFor={field.name}>
              {field.label}
              {isRequired && <span className="text-destructive ml-1">*</span>}
            </Label>
            {/* Registered for its required rule; the picker writes through setValue like the date field above. */}
            <input type="hidden" {...form.register(field.name, { required: isRequired ? `${field.label} is required` : false })} />
            <TimePicker
              id={field.name}
              placeholder={field.placeholder || undefined}
              value={form.watch(field.name) ?? ""}
              onValueChange={(v) => form.setValue(field.name, v, { shouldValidate: true, shouldDirty: true })}
              className="mt-2"
            />
            {field.helpText && (
              <p className="text-sm text-muted-foreground mt-1">{field.helpText}</p>
            )}
          </div>
        );

      case "month":
        const monthValue = form.watch(field.name);
        const selectedMonth = monthValue ? new Date(monthValue + "-01") : undefined;
        const firstDayOfMonth = selectedMonth ? startOfMonth(selectedMonth) : undefined;
        
        return (
          <div key={field.id} className={widthClass}>
            <Label htmlFor={field.name}>
              {field.label}
              {isRequired && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Popover open={monthOpen[field.name] || false} onOpenChange={(open) => setMonthOpen({ ...monthOpen, [field.name]: open })}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full mt-1 justify-start text-left font-normal",
                    !monthValue && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {monthValue && selectedMonth ? (
                    format(selectedMonth, "MMMM yyyy")
                  ) : (
                    <span>{field.placeholder || "Pick a month"}</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={firstDayOfMonth}
                  onSelect={(date) => {
                    if (date) {
                      // When any day in a month is selected, use the first day of that month
                      const firstDay = startOfMonth(date);
                      const monthString = format(firstDay, "yyyy-MM");
                      form.setValue(field.name, monthString);
                      setMonthOpen({ ...monthOpen, [field.name]: false });
                    }
                  }}
                  initialFocus
                  defaultMonth={selectedMonth || new Date()}
                  captionLayout="dropdown"
                  fromYear={1900}
                  toYear={2100}
                />
              </PopoverContent>
            </Popover>
            {field.helpText && (
              <p className="text-sm text-muted-foreground mt-1">{field.helpText}</p>
            )}
          </div>
        );

      case "week":
        const weekValue = form.watch(field.name);
        let selectedWeekDate: Date | undefined;
        let weekDisplayText = "";
        
        if (weekValue) {
          // Parse ISO week string (e.g., "2024-W01")
          const weekMatch = weekValue.match(/^(\d{4})-W(\d{2})$/);
          if (weekMatch) {
            const year = parseInt(weekMatch[1]);
            const week = parseInt(weekMatch[2]);
            // Calculate first day of week
            const jan4 = new Date(year, 0, 4);
            const jan4Day = jan4.getDay() || 7;
            const daysToMonday = jan4Day - 1;
            const firstMonday = new Date(jan4);
            firstMonday.setDate(jan4.getDate() - daysToMonday);
            selectedWeekDate = new Date(firstMonday);
            selectedWeekDate.setDate(firstMonday.getDate() + (week - 1) * 7);
            const weekStart = startOfWeek(selectedWeekDate, { weekStartsOn: 1 });
            const weekEnd = endOfWeek(selectedWeekDate, { weekStartsOn: 1 });
            weekDisplayText = `${format(weekStart, "MMM d")} - ${format(weekEnd, "MMM d, yyyy")}`;
          }
        }
        
        return (
          <div key={field.id} className={widthClass}>
            <Label htmlFor={field.name}>
              {field.label}
              {isRequired && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Popover open={weekOpen[field.name] || false} onOpenChange={(open) => setWeekOpen({ ...weekOpen, [field.name]: open })}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full mt-1 justify-start text-left font-normal",
                    !weekValue && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {weekValue && weekDisplayText ? (
                    weekDisplayText
                  ) : (
                    <span>{field.placeholder || "Pick a week"}</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedWeekDate}
                  onSelect={(date) => {
                    if (date) {
                      const weekStart = startOfWeek(date, { weekStartsOn: 1 });
                      const year = getYear(weekStart);
                      const weekNum = getWeek(weekStart, { weekStartsOn: 1 });
                      const weekString = `${year}-W${weekNum.toString().padStart(2, "0")}`;
                      form.setValue(field.name, weekString);
                      setWeekOpen({ ...weekOpen, [field.name]: false });
                    }
                  }}
                  initialFocus
                  defaultMonth={selectedWeekDate || new Date()}
                  modifiersClassNames={{
                    selected: "bg-primary text-primary-foreground rounded-md",
                  }}
                  modifiers={{
                    selected: selectedWeekDate ? (date) => {
                      if (!selectedWeekDate) return false;
                      const weekStart = startOfWeek(selectedWeekDate, { weekStartsOn: 1 });
                      const weekEnd = endOfWeek(selectedWeekDate, { weekStartsOn: 1 });
                      return date >= weekStart && date <= weekEnd;
                    } : undefined
                  }}
                />
              </PopoverContent>
            </Popover>
            {field.helpText && (
              <p className="text-sm text-muted-foreground mt-1">{field.helpText}</p>
            )}
          </div>
        );

      case "datetime":
        const datetimeValue = form.watch(field.name);
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
            <div className="mt-1 space-y-2">
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
              defaultValue={field.defaultValue || ""}
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
        const multiselectValue = form.watch(field.name) || [];
        const selectedLabels = field.options
          ?.filter((opt) => Array.isArray(multiselectValue) && multiselectValue.includes(opt.value))
          .map((opt) => opt.label) || [];
        
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
                      {selectedLabels.length > 0
                        ? selectedLabels.length === 1
                          ? selectedLabels[0]
                          : `${selectedLabels.length} items selected`
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
        const radioValue = form.watch(field.name) || field.defaultValue || "";
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
                onCheckedChange={(checked) => form.setValue(field.name, checked)}
                defaultChecked={field.defaultValue}
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

      case "toggle":
        const toggleValue = form.watch(field.name) || false;
        return (
          <div key={field.id} className={widthClass}>
            <div className="flex items-center justify-between space-x-2 rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor={field.name} className="cursor-pointer">
                  {field.label}
                  {isRequired && <span className="text-destructive ml-1">*</span>}
                </Label>
                {field.helpText && (
                  <p className="text-sm text-muted-foreground">{field.helpText}</p>
                )}
              </div>
              <Switch
                id={field.name}
                checked={toggleValue}
                onCheckedChange={(checked) => form.setValue(field.name, checked)}
              />
            </div>
          </div>
        );

      case "file":
      case "image":
        return (
          <div key={field.id} className={widthClass}>
            <Label htmlFor={field.name}>
              {field.label}
              {isRequired && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Input
              id={field.name}
              type="file"
              accept={field.type === "image" ? "image/*" : undefined}
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
              defaultValue={field.defaultValue || ""}
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

      case "color":
        return (
          <div key={field.id} className={widthClass}>
            <Label htmlFor={field.name}>
              {field.label}
              {isRequired && <span className="text-destructive ml-1">*</span>}
            </Label>
            <div className="mt-1 flex items-center gap-2">
              <Input
                id={field.name}
                type="color"
                {...form.register(field.name, {
                  required: isRequired ? `${field.label} is required` : false
                })}
                className="h-10 w-20 cursor-pointer"
                defaultValue={field.defaultValue || "#000000"}
              />
              <Input
                type="text"
                placeholder="#000000"
                {...form.register(field.name, {
                  required: isRequired ? `${field.label} is required` : false
                })}
                className="flex-1"
              />
            </div>
            {field.helpText && (
              <p className="text-sm text-muted-foreground mt-1">{field.helpText}</p>
            )}
          </div>
        );

      case "range":
        const rangeValue = form.watch(field.name) || field.defaultValue || field.validation?.min || 50;
        const rangeMin = field.validation?.min || 0;
        const rangeMax = field.validation?.max || 100;
        return (
          <div key={field.id} className={widthClass}>
            <Label htmlFor={field.name}>
              {field.label}
              {isRequired && <span className="text-destructive ml-1">*</span>}
            </Label>
            <div className="mt-1 space-y-2">
              <Slider
                value={[Number(rangeValue)]}
                onValueChange={(value) => form.setValue(field.name, value[0])}
                min={rangeMin}
                max={rangeMax}
                step={1}
                className="w-full"
              />
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>{rangeMin}</span>
                <span className="font-medium">{rangeValue}</span>
                <span>{rangeMax}</span>
              </div>
            </div>
            {field.helpText && (
              <p className="text-sm text-muted-foreground mt-1">{field.helpText}</p>
            )}
          </div>
        );

      case "rating":
        const ratingValue = form.watch(field.name) || 0;
        const maxRating = field.validation?.max || 5;
        return (
          <div key={field.id} className={widthClass}>
            <Label>
              {field.label}
              {isRequired && <span className="text-destructive ml-1">*</span>}
            </Label>
            <div className="mt-1 flex items-center gap-1">
              {Array.from({ length: maxRating }).map((_, index) => {
                const starValue = index + 1;
                return (
                  <button
                    key={index}
                    type="button"
                    onClick={() => form.setValue(field.name, starValue)}
                    className="focus:outline-none"
                  >
                    <Star
                      className={cn(
                        "h-5 w-5 transition-colors",
                        starValue <= ratingValue
                          ? "fill-yellow-400 text-yellow-400"
                          : "text-muted-foreground"
                      )}
                    />
                  </button>
                );
              })}
              {ratingValue > 0 && (
                <span className="ml-2 text-sm text-muted-foreground">
                  {ratingValue} / {maxRating}
                </span>
              )}
            </div>
            {field.helpText && (
              <p className="text-sm text-muted-foreground mt-1">{field.helpText}</p>
            )}
          </div>
        );

      case "tags":
        const tagsValue = form.watch(field.name) || [];
        const tagInput = tagInputs[field.name] || "";
        
        const handleAddTag = (fieldName: string) => {
          const currentTags = form.watch(fieldName) || [];
          const inputValue = tagInputs[fieldName] || "";
          if (inputValue.trim() && !currentTags.includes(inputValue.trim())) {
            form.setValue(fieldName, [...currentTags, inputValue.trim()]);
            setTagInputs({ ...tagInputs, [fieldName]: "" });
          }
        };

        const handleRemoveTag = (fieldName: string, tagToRemove: string) => {
          const currentTags = form.watch(fieldName) || [];
          form.setValue(fieldName, currentTags.filter((tag: string) => tag !== tagToRemove));
        };

        return (
          <div key={field.id} className={widthClass}>
            <Label htmlFor={field.name}>
              {field.label}
              {isRequired && <span className="text-destructive ml-1">*</span>}
            </Label>
            <div className="mt-1 space-y-2">
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="Add a tag..."
                  value={tagInput}
                  onChange={(e) => setTagInputs({ ...tagInputs, [field.name]: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddTag(field.name);
                    }
                  }}
                />
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => handleAddTag(field.name)}
                >
                  Add
                </Button>
              </div>
              {Array.isArray(tagsValue) && tagsValue.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {tagsValue.map((tag: string, index: number) => (
                    <div
                      key={index}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-muted rounded-md text-sm"
                    >
                      <span>{tag}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(field.name, tag)}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {field.helpText && (
              <p className="text-sm text-muted-foreground mt-1">{field.helpText}</p>
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
            <Textarea
              id={field.name}
              placeholder={field.placeholder || "Enter rich text content..."}
              {...form.register(field.name, {
                required: isRequired ? `${field.label} is required` : false
              })}
              className="mt-1 min-h-[150px]"
              rows={8}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Rich text editor will be available in the actual form
            </p>
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
            <div className="mt-1 border-2 border-dashed rounded-lg p-8 text-center bg-muted/30">
              <p className="text-sm text-muted-foreground">
                Signature pad will be available in the actual form
              </p>
              <Textarea
                id={field.name}
                placeholder="Signature placeholder..."
                {...form.register(field.name)}
                className="mt-2 hidden"
              />
            </div>
            {field.helpText && (
              <p className="text-sm text-muted-foreground mt-1">{field.helpText}</p>
            )}
          </div>
        );

      case "hidden":
        return (
          <Input
            key={field.id}
            id={field.name}
            type="hidden"
            {...form.register(field.name)}
            value={field.defaultValue || ""}
          />
        );

      case "creditCard":
        return (
          <div key={field.id} className={widthClass}>
            <Label htmlFor={field.name}>
              {field.label}
              {isRequired && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Input
              id={field.name}
              type="text"
              placeholder="1234 5678 9012 3456"
              maxLength={19}
              {...form.register(field.name, {
                required: isRequired ? `${field.label} is required` : false,
                pattern: {
                  value: /^[\d\s-]+$/,
                  message: "Please enter a valid credit card number"
                }
              })}
              onChange={(e) => {
                let value = e.target.value.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
                if (value.length > 19) value = value.slice(0, 19);
                e.target.value = value;
                form.setValue(field.name, value);
              }}
              className="mt-2"
            />
            {field.helpText && (
              <p className="text-sm text-muted-foreground mt-1">{field.helpText}</p>
            )}
          </div>
        );

      case "ssn":
        return (
          <div key={field.id} className={widthClass}>
            <Label htmlFor={field.name}>
              {field.label}
              {isRequired && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Input
              id={field.name}
              type="text"
              placeholder="XXX-XX-XXXX"
              maxLength={11}
              {...form.register(field.name, {
                required: isRequired ? `${field.label} is required` : false,
                pattern: {
                  value: /^\d{3}-\d{2}-\d{4}$/,
                  message: "Please enter a valid SSN (XXX-XX-XXXX)"
                }
              })}
              onChange={(e) => {
                let value = e.target.value.replace(/\D/g, "");
                if (value.length > 9) value = value.slice(0, 9);
                if (value.length > 5) {
                  value = value.slice(0, 3) + "-" + value.slice(3, 5) + "-" + value.slice(5);
                } else if (value.length > 3) {
                  value = value.slice(0, 3) + "-" + value.slice(3);
                }
                e.target.value = value;
                form.setValue(field.name, value);
              }}
              className="mt-2"
            />
            {field.helpText && (
              <p className="text-sm text-muted-foreground mt-1">{field.helpText}</p>
            )}
          </div>
        );

      case "signature":
        const signatureValue = form.watch(field.name);
        return (
          <div key={field.id} className={widthClass}>
            <Label htmlFor={field.name}>
              {field.label}
              {isRequired && <span className="text-destructive ml-1">*</span>}
            </Label>
            <div className="mt-2">
              <SignaturePad
                value={signatureValue || undefined}
                onChange={(value) => {
                  form.setValue(field.name, value || "");
                }}
              />
            </div>
            {field.helpText && (
              <p className="text-sm text-muted-foreground mt-1">{field.helpText}</p>
            )}
          </div>
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = form.getValues();
    console.log("Form preview submit:", data);
    // In preview mode, we just log the data
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-muted/30">
      <div className="max-w-3xl mx-auto">
        <Card>
          <CardHeader>
            {templateName && (
              <CardTitle className="text-2xl">{templateName}</CardTitle>
            )}
            {templateDescription && (
              <p className="text-sm text-muted-foreground mt-2">{templateDescription}</p>
            )}
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Fields without section */}
              {fieldsWithoutSection.length > 0 && (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-4 items-start">
                    {fieldsWithoutSection.map((field) => renderField(field))}
                  </div>
                </div>
              )}

              {/* Sections with their fields using grid system */}
              {(() => {
                // Group sections into rows based on column count and available space
                const rows: typeof sortedSections[] = [];
                let currentRow: typeof sortedSections = [];
                let currentRowUsed = 0;

                sortedSections.forEach((section) => {
                  const sectionFields = fieldsBySection[section.id] || [];
                  if (sectionFields.length === 0) return;
                  
                  const position = section.position || "center";
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
                      const position = section.position || "center";
                      const columns = section.columns || 12;
                      
                      // Determine column span
                      const colSpan = Math.min(Math.max(columns, 1), 12);
                      const colSpanClasses: Record<number, string> = {
                        1: "col-span-1", 2: "col-span-2", 3: "col-span-3", 4: "col-span-4",
                        5: "col-span-5", 6: "col-span-6", 7: "col-span-7", 8: "col-span-8",
                        9: "col-span-9", 10: "col-span-10", 11: "col-span-11", 12: "col-span-12"
                      };
                      const colSpanClass = colSpanClasses[colSpan] || "col-span-12";
                      
                      // For center position, center the section within its columns
                      const justifyClass = position === "center" ? "justify-self-center" : 
                                          position === "right" ? "justify-self-end" : 
                                          "justify-self-start";
                      
                      return (
                        <div
                          key={section.id}
                          className={cn(colSpanClass, justifyClass, "w-full space-y-4")}
                        >
                          <div className="border-b pb-2">
                            <h3 className="text-lg font-semibold">{section.title}</h3>
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
                <div className="text-center py-12 text-muted-foreground">
                  <p>No fields added yet. Add fields in the Form Builder tab to see the preview.</p>
                </div>
              )}

              {fields.length > 0 && (
                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button type="button" variant="outline" onClick={() => form.reset()}>
                    Reset
                  </Button>
                  <Button type="button" onClick={handleSubmit}>Submit (Preview)</Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

