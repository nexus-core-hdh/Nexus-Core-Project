"use client";

import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { autoNumberingApi } from "@/lib/api";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";

const autoNumberingFormSchema = z.object({
  prefix: z.string().optional(),
  suffix: z.string().optional(),
  format: z.string().min(1, "Format is required"),
  startingNumber: z.number().min(1, "Starting number must be at least 1").default(1),
  numberLength: z.number().min(1).max(10).optional(),
  resetPeriod: z.string().optional(),
  isActive: z.boolean().default(true)
});

// For react-hook-form + zodResolver, the form type should match the *input* shape
// (defaults make fields optional on input).
type AutoNumberingFormValues = z.input<typeof autoNumberingFormSchema>;

interface AutoNumberingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: string;
  setting?: AutoNumbering | null;
  onSuccess?: () => void;
}

export type AutoNumbering = {
  id: number;
  entity: string;
  prefix?: string | null;
  suffix?: string | null;
  format: string;
  startingNumber: number;
  currentNumber: number;
  numberLength?: number | null;
  resetPeriod?: string | null;
  isActive: boolean;
  companyId?: number | null;
  branchId?: number | null;
  createdAt?: string;
  updatedAt?: string;
};

const resetPeriods = [
  { value: "never", label: "Never" },
  { value: "daily", label: "Daily" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" }
];

const formatExamples = [
  { value: "{prefix}{number}{suffix}", label: "Prefix + Number + Suffix (e.g., LEAD-001-2024)" },
  { value: "{prefix}{YYYY}{MM}{number}", label: "Prefix + Year + Month + Number (e.g., LEAD-202401-001)" },
  { value: "{prefix}{number}", label: "Prefix + Number (e.g., LEAD-001)" },
  { value: "{number}{suffix}", label: "Number + Suffix (e.g., 001-2024)" },
  { value: "{number}", label: "Number only (e.g., 001)" }
];

export function AutoNumberingDialog({
  open,
  onOpenChange,
  entity,
  setting,
  onSuccess
}: AutoNumberingDialogProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const form = useForm<AutoNumberingFormValues>({
    resolver: zodResolver(autoNumberingFormSchema),
    defaultValues: {
      prefix: "",
      suffix: "",
      format: "{prefix}{number}{suffix}",
      startingNumber: 1,
      numberLength: 3,
      resetPeriod: "never",
      isActive: true
    }
  });

  const selectedFormat = useWatch({
    control: form.control,
    name: "format",
    defaultValue: "{prefix}{number}{suffix}"
  });

  React.useEffect(() => {
    if (open) {
      if (setting) {
        form.reset({
          prefix: setting.prefix || "",
          suffix: setting.suffix || "",
          format: setting.format,
          startingNumber: setting.startingNumber,
          numberLength: setting.numberLength || undefined,
          resetPeriod: setting.resetPeriod || "never",
          isActive: setting.isActive
        });
      } else {
        form.reset({
          prefix: "",
          suffix: "",
          format: "{prefix}{number}{suffix}",
          startingNumber: 1,
          numberLength: 3,
          resetPeriod: "never",
          isActive: true
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, setting]);

  const onSubmit = async (data: AutoNumberingFormValues) => {
    setIsSubmitting(true);
    try {
      const settingData = {
        entity,
        prefix: data.prefix || null,
        suffix: data.suffix || null,
        format: data.format,
        startingNumber: data.startingNumber,
        numberLength: data.numberLength || null,
        resetPeriod: data.resetPeriod || null,
        isActive: data.isActive
      };

      if (setting) {
        // Update existing setting
        await autoNumberingApi.updateAutoNumbering(setting.id, settingData);
        toast.success("Auto-numbering setting updated successfully");
      } else {
        // Create new setting
        await autoNumberingApi.createAutoNumbering(settingData);
        toast.success("Auto-numbering setting created successfully");
      }

      if (onSuccess) {
        onSuccess();
      }
      
      onOpenChange(false);
    } catch (error: any) {
      console.error("Failed to save auto-numbering setting:", error);
      toast.error(error.message || "Failed to save auto-numbering setting");
    } finally {
      setIsSubmitting(false);
    }
  };

  const generatePreview = () => {
    const prefix = form.watch("prefix") || "";
    const suffix = form.watch("suffix") || "";
    const numberLength = form.watch("numberLength") || 3;
    const format = form.watch("format");
    const startingNumber = form.watch("startingNumber") || 1;

    const numberPart = startingNumber.toString().padStart(numberLength, '0');
    const now = new Date();
    const year = now.getFullYear().toString();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');

    let preview = format
      .replace(/{prefix}/g, prefix)
      .replace(/{suffix}/g, suffix)
      .replace(/{number}/g, numberPart)
      .replace(/{YYYY}/g, year)
      .replace(/{MM}/g, month)
      .replace(/{DD}/g, day);

    return preview || "Preview will appear here";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 flex-shrink-0">
          <DialogTitle>{setting ? "Edit Auto-Numbering" : "Add Auto-Numbering"}</DialogTitle>
          <DialogDescription>
            {setting
              ? `Update the auto-numbering settings for ${entity}.`
              : `Configure auto-numbering for ${entity}.`}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
            <ScrollArea className="h-[calc(90vh-220px)] px-6">
              <div className="space-y-4 pb-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="prefix"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Prefix</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., LEAD-" {...field} />
                        </FormControl>
                        <FormDescription>Optional prefix for the number</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="suffix"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Suffix</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., -2024" {...field} />
                        </FormControl>
                        <FormDescription>Optional suffix for the number</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="format"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Format *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select format" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {formatExamples.map((example) => (
                            <SelectItem key={example.value} value={example.value}>
                              {example.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Available placeholders: {"{prefix}"}, {"{suffix}"}, {"{number}"}, {"{YYYY}"}, {"{MM}"}, {"{DD}"}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="startingNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Starting Number *</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min="1"
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                            value={field.value}
                          />
                        </FormControl>
                        <FormDescription>Number to start counting from</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="numberLength"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Number Length</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min="1"
                            max="10"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                            value={field.value || ""}
                          />
                        </FormControl>
                        <FormDescription>Minimum digits (padding with zeros)</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="resetPeriod"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reset Period</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || "never"}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select reset period" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {resetPeriods.map((period) => (
                            <SelectItem key={period.value} value={period.value}>
                              {period.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>When to reset the numbering sequence</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="rounded-lg border p-4 bg-muted/50">
                  <FormLabel className="text-sm font-medium mb-2">Preview</FormLabel>
                  <div className="text-lg font-mono font-semibold text-primary">
                    {generatePreview()}
                  </div>
                  <FormDescription className="mt-2">
                    This is how your numbers will look
                  </FormDescription>
                </div>

                <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                      <div className="space-y-0.5">
                        <FormLabel>Active</FormLabel>
                        <FormDescription>
                          Enable or disable this auto-numbering setting
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
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
                {isSubmitting ? "Saving..." : setting ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

























