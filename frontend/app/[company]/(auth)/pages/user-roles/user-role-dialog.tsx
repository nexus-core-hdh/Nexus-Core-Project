"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { userRolesApi } from "@/lib/api";
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

const userRoleFormSchema = z.object({
  name: z.string().min(1, "Role name is required"),
  description: z.string().optional(),
  permissions: z.any().optional(), // JSON object for future RBAC
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true)
});

type UserRoleFormValues = z.input<typeof userRoleFormSchema>;

interface UserRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role?: UserRole | null;
  onSuccess?: () => void;
}

type UserRole = {
  id: number;
  name: string;
  description?: string | null;
  permissions?: any;
  isSystem: boolean;
  isDefault: boolean;
  isActive: boolean;
  companyId?: number | null;
  branchId?: number | null;
};

export function UserRoleDialog({
  open,
  onOpenChange,
  role,
  onSuccess
}: UserRoleDialogProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const form = useForm<UserRoleFormValues>({
    resolver: zodResolver(userRoleFormSchema),
    defaultValues: {
      name: "",
      description: "",
      permissions: null,
      isDefault: false,
      isActive: true
    }
  });

  React.useEffect(() => {
    if (open) {
      if (role) {
        form.reset({
          name: role.name,
          description: role.description || "",
          permissions: role.permissions || null,
          isDefault: role.isDefault,
          isActive: role.isActive
        });
      } else {
        form.reset({
          name: "",
          description: "",
          permissions: null,
          isDefault: false,
          isActive: true
        });
      }
    }
  }, [open, role, form]);

  const onSubmit = async (data: UserRoleFormValues) => {
    setIsSubmitting(true);
    try {
      const parsed = userRoleFormSchema.parse(data);
      if (role) {
        // Prevent modification of system roles
        if (role.isSystem) {
          toast.error("System roles cannot be modified");
          return;
        }
        await userRolesApi.updateUserRole(role.id, parsed);
        toast.success("User role updated successfully");
      } else {
        await userRolesApi.createUserRole(parsed);
        toast.success("User role created successfully");
      }
      if (onSuccess) onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Failed to save user role:", error);
      toast.error(error.message || "Failed to save user role");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isSystemRole = role?.isSystem || false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{role ? "Edit User Role" : "Add User Role"}</DialogTitle>
          <DialogDescription>
            {role
              ? isSystemRole
                ? "System roles have restricted permissions and cannot be fully modified."
                : "Update the user role information below. Permissions can be configured for role-based access control."
              : "Add a new user role to your system. You can configure permissions for role-based access control later."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role Name *</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Manager" 
                      {...field} 
                      disabled={isSystemRole}
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
                      placeholder="Role description..."
                      {...field}
                      rows={3}
                      disabled={isSystemRole}
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
                    <FormLabel>Default Role</FormLabel>
                    <div className="text-xs text-muted-foreground">
                      Set this as the default user role
                    </div>
                  </div>
                  <FormControl>
                    <Switch 
                      checked={field.value} 
                      onCheckedChange={field.onChange}
                      disabled={isSystemRole}
                    />
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
                      Enable or disable this role
                    </div>
                  </div>
                  <FormControl>
                    <Switch 
                      checked={field.value} 
                      onCheckedChange={field.onChange}
                      disabled={isSystemRole}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            {isSystemRole && (
              <div className="bg-muted/50 border border-muted rounded-lg p-3 text-sm text-muted-foreground">
                <p className="font-medium mb-1">System Role</p>
                <p>This is a system role. Some fields cannot be modified to maintain system integrity.</p>
              </div>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || isSystemRole}>
                {isSubmitting ? "Saving..." : role ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}








































































