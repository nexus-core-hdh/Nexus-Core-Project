"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { smtpSettingsApi } from "@/lib/api";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Eye, EyeOff, Server, Lock, Mail, User } from "lucide-react";
import { SmtpSetting } from "./page";

const smtpSettingFormSchema = z.object({
  name: z.string().min(1, "Configuration name is required"),
  host: z.string().min(1, "SMTP host is required"),
  port: z.string().min(1, "Port is required").refine((val) => {
    const port = parseInt(val);
    return !isNaN(port) && port > 0 && port <= 65535;
  }, "Port must be a valid number between 1 and 65535"),
  secure: z.boolean().default(false),
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  fromEmail: z.string().email("Invalid email address"),
  fromName: z.string().optional(),
  isActive: z.boolean().default(false),
  isDefault: z.boolean().default(false)
});

type SmtpSettingFormValues = z.input<typeof smtpSettingFormSchema>;

interface SmtpSettingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  setting?: SmtpSetting | null;
  onSuccess?: () => void;
}

const commonPorts = [
  { value: "587", label: "587 (TLS/STARTTLS)" },
  { value: "465", label: "465 (SSL)" },
  { value: "25", label: "25 (Standard)" },
  { value: "2525", label: "2525 (Alternative)" }
];

const commonProviders = [
  {
    name: "Gmail",
    host: "smtp.gmail.com",
    port: "587",
    secure: false
  },
  {
    name: "Outlook",
    host: "smtp-mail.outlook.com",
    port: "587",
    secure: false
  },
  {
    name: "Yahoo",
    host: "smtp.mail.yahoo.com",
    port: "587",
    secure: false
  },
  {
    name: "SendGrid",
    host: "smtp.sendgrid.net",
    port: "587",
    secure: false
  },
  {
    name: "Mailgun",
    host: "smtp.mailgun.org",
    port: "587",
    secure: false
  },
  {
    name: "Amazon SES",
    host: "email-smtp.us-east-1.amazonaws.com",
    port: "587",
    secure: false
  }
];

export function SmtpSettingDialog({
  open,
  onOpenChange,
  setting,
  onSuccess
}: SmtpSettingDialogProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);
  const [selectedProvider, setSelectedProvider] = React.useState<string>("");

  const form = useForm<SmtpSettingFormValues>({
    resolver: zodResolver(smtpSettingFormSchema),
    defaultValues: {
      name: "",
      host: "",
      port: "587",
      secure: false,
      username: "",
      password: "",
      fromEmail: "",
      fromName: "",
      isActive: false,
      isDefault: false
    }
  });

  React.useEffect(() => {
    if (open) {
      if (setting) {
        form.reset({
          name: setting.name,
          host: setting.host,
          port: setting.port.toString(),
          secure: setting.secure,
          username: setting.username,
          password: "••••••••", // Masked password
          fromEmail: setting.fromEmail,
          fromName: setting.fromName || "",
          isActive: setting.isActive,
          isDefault: setting.isDefault
        });
      } else {
        form.reset({
          name: "",
          host: "",
          port: "587",
          secure: false,
          username: "",
          password: "",
          fromEmail: "",
          fromName: "",
          isActive: false,
          isDefault: false
        });
      }
      setSelectedProvider("");
      setShowPassword(false);
    }
  }, [open, setting, form]);

  const handleProviderSelect = (providerName: string) => {
    const provider = commonProviders.find((p) => p.name === providerName);
    if (provider) {
      form.setValue("host", provider.host);
      form.setValue("port", provider.port);
      form.setValue("secure", provider.secure);
      setSelectedProvider(providerName);
    }
  };

  const onSubmit = async (data: SmtpSettingFormValues) => {
    setIsSubmitting(true);
    try {
      const parsed = smtpSettingFormSchema.parse(data);
      // Don't send masked password
      const submitData = {
        ...parsed,
        port: parseInt(parsed.port),
        password: parsed.password === "••••••••" ? undefined : parsed.password
      };

      if (setting) {
        await smtpSettingsApi.updateSmtpSetting(setting.id, submitData);
        toast.success("SMTP setting updated successfully");
      } else {
        // Password is required for new settings
        if (!submitData.password) {
          toast.error("Password is required for new SMTP settings");
          setIsSubmitting(false);
          return;
        }
        await smtpSettingsApi.createSmtpSetting(submitData);
        toast.success("SMTP setting created successfully");
      }
      if (onSuccess) onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Failed to save SMTP setting:", error);
      toast.error(error.message || "Failed to save SMTP setting");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-w-[90vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {setting ? "Edit SMTP Setting" : "Create SMTP Setting"}
          </DialogTitle>
          <DialogDescription>
            {setting
              ? "Update the SMTP server configuration below."
              : "Configure a new SMTP server for sending emails. You can use preset configurations for common providers."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Quick Setup - Common Providers */}
            {!setting && (
              <div className="space-y-4">
                <div className="border-b pb-2">
                  <h3 className="text-lg font-semibold">Quick Setup</h3>
                  <p className="text-sm text-muted-foreground">
                    Select a common email provider to auto-fill settings
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {commonProviders.map((provider) => (
                    <Button
                      key={provider.name}
                      type="button"
                      variant={selectedProvider === provider.name ? "default" : "outline"}
                      onClick={() => handleProviderSelect(provider.name)}
                      className="justify-start">
                      <Server className="mr-2 h-4 w-4" />
                      {provider.name}
                    </Button>
                  ))}
                </div>
                <Separator />
              </div>
            )}

            {/* Basic Information */}
            <div className="space-y-4">
              <div className="border-b pb-2">
                <h3 className="text-lg font-semibold">Basic Information</h3>
              </div>
              
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Configuration Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="Gmail SMTP" {...field} />
                    </FormControl>
                    <FormDescription>
                      A friendly name to identify this SMTP configuration
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* SMTP Server Settings */}
            <div className="space-y-4">
              <div className="border-b pb-2">
                <h3 className="text-lg font-semibold">SMTP Server Settings</h3>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="host"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>SMTP Host *</FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-2">
                          <Server className="h-4 w-4 text-muted-foreground" />
                          <Input placeholder="smtp.example.com" {...field} />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="port"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Port *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select port" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {commonPorts.map((port) => (
                            <SelectItem key={port.value} value={port.value}>
                              {port.label}
                            </SelectItem>
                          ))}
                          <SelectItem value="custom">Custom Port</SelectItem>
                        </SelectContent>
                      </Select>
                      {field.value === "custom" && (
                        <Input
                          type="number"
                          placeholder="Enter custom port"
                          className="mt-2"
                          onChange={(e) => field.onChange(e.target.value)}
                        />
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="secure"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Use SSL/TLS</FormLabel>
                      <FormDescription>
                        Enable secure connection (recommended for port 465)
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            {/* Authentication */}
            <div className="space-y-4">
              <div className="border-b pb-2">
                <h3 className="text-lg font-semibold">Authentication</h3>
              </div>
              
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username/Email *</FormLabel>
                    <FormControl>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <Input placeholder="your-email@example.com" {...field} />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password *</FormLabel>
                    <FormControl>
                      <div className="flex items-center gap-2">
                        <Lock className="h-4 w-4 text-muted-foreground" />
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder={setting ? "Leave blank to keep current password" : "Enter password"}
                          {...field}
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setShowPassword(!showPassword)}>
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </FormControl>
                    <FormDescription>
                      {setting
                        ? "Leave blank to keep the current password"
                        : "App password for Gmail or your SMTP account password"}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Email Settings */}
            <div className="space-y-4">
              <div className="border-b pb-2">
                <h3 className="text-lg font-semibold">Email Settings</h3>
              </div>
              
              <FormField
                control={form.control}
                name="fromEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>From Email Address *</FormLabel>
                    <FormControl>
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <Input placeholder="noreply@example.com" type="email" {...field} />
                      </div>
                    </FormControl>
                    <FormDescription>
                      Default sender email address for all emails
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="fromName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>From Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Your Company Name" {...field} />
                    </FormControl>
                    <FormDescription>
                      Display name for the sender (optional)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Settings */}
            <div className="space-y-4">
              <div className="border-b pb-2">
                <h3 className="text-lg font-semibold">Configuration Settings</h3>
              </div>
              
              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Active</FormLabel>
                      <FormDescription>
                        Activate this SMTP configuration for sending emails
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
                name="isDefault"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Default Configuration</FormLabel>
                      <FormDescription>
                        Set as the default SMTP configuration
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : setting ? "Update Setting" : "Create Setting"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}








































































