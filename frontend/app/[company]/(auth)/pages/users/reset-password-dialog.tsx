"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Key, Copy, Check, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { usersApi } from "@/lib/api";

const passwordFormSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
  generateTemporary: z.boolean().default(false),
}).refine((data) => {
  // If not generating temporary, password is required
  if (!data.generateTemporary && !data.password) {
    return false;
  }
  return true;
}, {
  message: "Password is required when not generating a temporary password",
  path: ["password"],
});

type PasswordFormValues = z.input<typeof passwordFormSchema>;

interface ResetPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: number;
  userName: string;
  onSuccess?: () => void;
}

export function ResetPasswordDialog({
  open,
  onOpenChange,
  userId,
  userName,
  onSuccess,
}: ResetPasswordDialogProps) {
  const [showPassword, setShowPassword] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [generatedPassword, setGeneratedPassword] = React.useState<string | null>(null);
  const [passwordCopied, setPasswordCopied] = React.useState(false);

  const form = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: {
      password: "",
      generateTemporary: false,
    },
  });

  const generateTemporary = form.watch("generateTemporary");

  React.useEffect(() => {
    if (!open) {
      form.reset();
      setGeneratedPassword(null);
      setPasswordCopied(false);
    }
  }, [open, form]);

  const onSubmit = async (data: PasswordFormValues) => {
    setIsSubmitting(true);
    try {
      const parsed = passwordFormSchema.parse(data);
      const response = await usersApi.setUserPassword(userId, {
        password: parsed.generateTemporary ? undefined : parsed.password,
        generateTemporary: parsed.generateTemporary,
      });

      if (response.temporaryPassword) {
        setGeneratedPassword(response.temporaryPassword);
        toast.success("Password reset successfully!");
      } else {
        toast.success("Password reset successfully!");
        form.reset();
        onOpenChange(false);
        if (onSuccess) onSuccess();
      }
    } catch (error: any) {
      toast.error("Failed to reset password", {
        description: error.message || "An error occurred",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyPassword = async () => {
    if (generatedPassword) {
      try {
        await navigator.clipboard.writeText(generatedPassword);
        setPasswordCopied(true);
        toast.success("Password copied to clipboard!");
        setTimeout(() => setPasswordCopied(false), 2000);
      } catch (error) {
        toast.error("Failed to copy password");
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset Password</DialogTitle>
          <DialogDescription>
            Set a new password for {userName}. The user will be required to change this password on next login.
          </DialogDescription>
        </DialogHeader>

        {!generatedPassword ? (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="generateTemporary"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                    <FormControl>
                      <input
                        type="checkbox"
                        checked={field.value}
                        onChange={field.onChange}
                        className="mt-1"
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Generate Temporary Password</FormLabel>
                      <p className="text-sm text-muted-foreground">
                        Automatically generate a secure temporary password
                      </p>
                    </div>
                  </FormItem>
                )}
              />

              {!generateTemporary && (
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showPassword ? "text" : "password"}
                            placeholder="Enter new password"
                            {...field}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-full"
                            onClick={() => setShowPassword(!showPassword)}
                          >
                            {showPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Resetting..." : "Reset Password"}
                </Button>
              </div>
            </form>
          </Form>
        ) : (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Temporary Password</label>
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  value={generatedPassword}
                  readOnly
                  className="font-mono"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={copyPassword}
                >
                  {passwordCopied ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                The user will be required to change this password on first login.
                Please share this password securely with the user.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setGeneratedPassword(null);
                  form.reset();
                  onOpenChange(false);
                  if (onSuccess) onSuccess();
                }}
              >
                Close
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

