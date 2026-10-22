"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { taxesApi } from "@/lib/api";
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
import { Switch } from "@/components/ui/switch";

const taxFormSchema = z.object({
  name: z.string().min(1, "Tax name is required"),
  rate: z.number().min(0, "Rate must be at least 0").max(100, "Rate must be at most 100"),
  description: z.string().optional(),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true)
});

type TaxFormValues = z.input<typeof taxFormSchema>;

interface TaxDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tax?: Tax | null;
  onSuccess?: () => void;
}

type Tax = {
  id: number;
  name: string;
  rate: number;
  description?: string | null;
  isDefault: boolean;
  isActive: boolean;
  companyId?: number | null;
  branchId?: number | null;
};

export function TaxDialog({
  open,
  onOpenChange,
  tax,
  onSuccess
}: TaxDialogProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const form = useForm<TaxFormValues>({
    resolver: zodResolver(taxFormSchema),
    defaultValues: {
      name: "",
      rate: 0,
      description: "",
      isDefault: false,
      isActive: true
    }
  });

  React.useEffect(() => {
    if (open) {
      if (tax) {
        form.reset({
          name: tax.name,
          rate: tax.rate,
          description: tax.description || "",
          isDefault: tax.isDefault,
          isActive: tax.isActive
        });
      } else {
        form.reset({
          name: "",
          rate: 0,
          description: "",
          isDefault: false,
          isActive: true
        });
      }
    }
  }, [open, tax, form]);

  const onSubmit = async (data: TaxFormValues) => {
    setIsSubmitting(true);
    try {
      const parsed = taxFormSchema.parse(data);
      if (tax) {
        await taxesApi.updateTax(tax.id, parsed);
        toast.success("Tax updated successfully");
      } else {
        await taxesApi.createTax(parsed);
        toast.success("Tax created successfully");
      }
      if (onSuccess) onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Failed to save tax:", error);
      toast.error(error.message || "Failed to save tax");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{tax ? "Edit Tax" : "Add Tax"}</DialogTitle>
          <DialogDescription>
            {tax
              ? "Update the tax information below."
              : "Add a new tax to your system."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tax Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="VAT" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="rate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tax Rate (%) *</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      placeholder="10.5"
                      {...field}
                      onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                    />
                  </FormControl>
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
                      placeholder="Tax description..."
                      {...field}
                      rows={3}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="isDefault"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>Default Tax</FormLabel>
                    <div className="text-xs text-muted-foreground">
                      Set this as the default tax
                    </div>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>Active</FormLabel>
                    <div className="text-xs text-muted-foreground">
                      Enable or disable this tax
                    </div>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : tax ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}








































































