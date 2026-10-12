"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { currenciesApi } from "@/lib/api";
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
import { Switch } from "@/components/ui/switch";

const currencyFormSchema = z.object({
  code: z.string().min(1, "Currency code is required").max(3, "Currency code must be 3 characters"),
  name: z.string().min(1, "Currency name is required"),
  symbol: z.string().optional(),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true)
});

type CurrencyFormValues = z.input<typeof currencyFormSchema>;

interface CurrencyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currency?: Currency | null;
  onSuccess?: () => void;
}

type Currency = {
  id: number;
  code: string;
  name: string;
  symbol?: string | null;
  isDefault: boolean;
  isActive: boolean;
  companyId?: number | null;
  branchId?: number | null;
};

export function CurrencyDialog({
  open,
  onOpenChange,
  currency,
  onSuccess
}: CurrencyDialogProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const form = useForm<CurrencyFormValues>({
    resolver: zodResolver(currencyFormSchema),
    defaultValues: {
      code: "",
      name: "",
      symbol: "",
      isDefault: false,
      isActive: true
    }
  });

  React.useEffect(() => {
    if (open) {
      if (currency) {
        form.reset({
          code: currency.code,
          name: currency.name,
          symbol: currency.symbol || "",
          isDefault: currency.isDefault,
          isActive: currency.isActive
        });
      } else {
        form.reset({
          code: "",
          name: "",
          symbol: "",
          isDefault: false,
          isActive: true
        });
      }
    }
  }, [open, currency, form]);

  const onSubmit = async (data: CurrencyFormValues) => {
    setIsSubmitting(true);
    try {
      const parsed = currencyFormSchema.parse(data);
      if (currency) {
        await currenciesApi.updateCurrency(currency.id, parsed);
        toast.success("Currency updated successfully");
      } else {
        await currenciesApi.createCurrency(parsed);
        toast.success("Currency created successfully");
      }
      if (onSuccess) onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Failed to save currency:", error);
      toast.error(error.message || "Failed to save currency");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{currency ? "Edit Currency" : "Add Currency"}</DialogTitle>
          <DialogDescription>
            {currency
              ? "Update the currency information below."
              : "Add a new currency to your system."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Currency Code *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="USD"
                      {...field}
                      onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                      maxLength={3}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Currency Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="US Dollar" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="symbol"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Symbol</FormLabel>
                  <FormControl>
                    <Input placeholder="$" {...field} />
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
                    <FormLabel>Default Currency</FormLabel>
                    <div className="text-xs text-muted-foreground">
                      Set this as the default currency
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
                      Enable or disable this currency
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
                {isSubmitting ? "Saving..." : currency ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

