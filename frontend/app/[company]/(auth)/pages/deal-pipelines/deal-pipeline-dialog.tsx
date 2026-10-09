"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { dealPipelinesApi } from "@/lib/api";
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

const dealPipelineFormSchema = z.object({
  name: z.string().min(1, "Pipeline name is required"),
  description: z.string().optional(),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true)
});

type DealPipelineFormValues = z.input<typeof dealPipelineFormSchema>;

interface DealPipelineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipeline?: DealPipeline | null;
  onSuccess?: () => void;
}

type DealPipeline = {
  id: number;
  name: string;
  description?: string | null;
  isDefault: boolean;
  isActive: boolean;
  companyId?: number | null;
  branchId?: number | null;
};

export function DealPipelineDialog({
  open,
  onOpenChange,
  pipeline,
  onSuccess
}: DealPipelineDialogProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const form = useForm<DealPipelineFormValues>({
    resolver: zodResolver(dealPipelineFormSchema),
    defaultValues: {
      name: "",
      description: "",
      isDefault: false,
      isActive: true
    }
  });

  React.useEffect(() => {
    if (open) {
      if (pipeline) {
        form.reset({
          name: pipeline.name,
          description: pipeline.description || "",
          isDefault: pipeline.isDefault,
          isActive: pipeline.isActive
        });
      } else {
        form.reset({
          name: "",
          description: "",
          isDefault: false,
          isActive: true
        });
      }
    }
  }, [open, pipeline, form]);

  const onSubmit = async (data: DealPipelineFormValues) => {
    setIsSubmitting(true);
    try {
      const parsed = dealPipelineFormSchema.parse(data);
      if (pipeline) {
        await dealPipelinesApi.updateDealPipeline(pipeline.id, parsed);
        toast.success("Deal pipeline updated successfully");
      } else {
        await dealPipelinesApi.createDealPipeline(parsed);
        toast.success("Deal pipeline created successfully");
      }
      if (onSuccess) onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Failed to save deal pipeline:", error);
      toast.error(error.message || "Failed to save deal pipeline");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{pipeline ? "Edit Deal Pipeline" : "Add Deal Pipeline"}</DialogTitle>
          <DialogDescription>
            {pipeline
              ? "Update the deal pipeline information below. Stages and connections are managed separately."
              : "Add a new deal pipeline to your system. You can add stages and connections after creating the pipeline."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Pipeline Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="Sales Pipeline" {...field} />
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
                      placeholder="Pipeline description..."
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
                    <FormLabel>Default Pipeline</FormLabel>
                    <div className="text-xs text-muted-foreground">
                      Set this as the default deal pipeline
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
                      Enable or disable this pipeline
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
                {isSubmitting ? "Saving..." : pipeline ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}








































































