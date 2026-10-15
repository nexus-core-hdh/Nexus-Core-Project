"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { securitiesApi } from "@/lib/api";
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

const securityFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.string().min(1, "Type is required"),
  value: z.string().optional(),
  config: z.any().optional(), // JSON object for additional configuration
  description: z.string().optional(),
  isActive: z.boolean().default(true)
});

type SecurityFormValues = z.input<typeof securityFormSchema>;

interface SecurityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  security?: Security | null;
  onSuccess?: () => void;
}

type Security = {
  id: number;
  name: string;
  type: string;
  value?: string | null;
  config?: any;
  description?: string | null;
  isActive: boolean;
  companyId?: number | null;
  branchId?: number | null;
};

const securityTypeOptions = [
  { value: "password-policy", label: "Password Policy" },
  { value: "session-timeout", label: "Session Timeout" },
  { value: "two-factor", label: "Two-Factor Authentication" },
  { value: "ip-whitelist", label: "IP Whitelist" },
  { value: "login-attempts", label: "Login Attempts Limit" },
  { value: "data-encryption", label: "Data Encryption" },
  { value: "audit-logging", label: "Audit Logging" },
  { value: "api-security", label: "API Security" },
  { value: "ssl-certificate", label: "SSL Certificate" },
  { value: "backup-policy", label: "Backup Policy" }
];

export function SecurityDialog({
  open,
  onOpenChange,
  security,
  onSuccess
}: SecurityDialogProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const form = useForm<SecurityFormValues>({
    resolver: zodResolver(securityFormSchema),
    defaultValues: {
      name: "",
      type: "",
      value: "",
      config: null,
      description: "",
      isActive: true
    }
  });

  const selectedType = form.watch("type");

  React.useEffect(() => {
    if (open) {
      if (security) {
        form.reset({
          name: security.name,
          type: security.type,
          value: security.value || "",
          config: security.config || null,
          description: security.description || "",
          isActive: security.isActive
        });
      } else {
        form.reset({
          name: "",
          type: "",
          value: "",
          config: null,
          description: "",
          isActive: true
        });
      }
    }
  }, [open, security, form]);

  // Helper function to get default config for each security type
  const getDefaultConfig = (type: string) => {
    switch (type) {
      case "password-policy":
        return {
          minLength: 8,
          requireUppercase: false,
          requireLowercase: false,
          requireNumbers: false,
          requireSpecialChars: false,
          preventReuse: 0,
          expirationDays: 0
        };
      case "session-timeout":
        return {
          timeoutMinutes: 30,
          extendOnActivity: true,
          warnBeforeTimeout: true,
          warnMinutes: 5
        };
      case "two-factor":
        return {
          method: "sms",
          requireForAllUsers: false,
          backupCodes: true,
          rememberDevice: true,
          rememberDays: 30
        };
      case "ip-whitelist":
        return {
          ips: [] as string[],
          allowAllExceptListed: false,
          notifyOnNewIp: true
        };
      case "login-attempts":
        return {
          maxAttempts: 5,
          lockoutDuration: 30,
          resetAfterMinutes: 15,
          notifyOnLockout: true
        };
      case "data-encryption":
        return {
          algorithm: "AES-256",
          encryptAtRest: true,
          encryptInTransit: true,
          keyRotationDays: 90
        };
      case "audit-logging":
        return {
          logLevel: "medium",
          logUserActions: true,
          logSystemEvents: true,
          logDataChanges: true,
          retentionDays: 365,
          alertOnSuspiciousActivity: true
        };
      case "api-security":
        return {
          requireApiKey: true,
          rateLimitPerMinute: 100,
          requireHttps: true,
          allowedOrigins: [] as string[],
          tokenExpirationHours: 24
        };
      case "ssl-certificate":
        return {
          certificateProvider: "letsencrypt",
          autoRenew: true,
          renewBeforeDays: 30,
          enforceHttps: true
        };
      case "backup-policy":
        return {
          frequency: "daily",
          retentionDays: 30,
          backupLocation: "cloud",
          encryptBackups: true,
          testRestore: true
        };
      default:
        return null;
    }
  };

  // Initialize config when type changes
  React.useEffect(() => {
    if (selectedType) {
      const currentConfig = form.getValues("config");
      const defaultConfig = getDefaultConfig(selectedType);
      
      if (defaultConfig) {
        // If no config exists or type changed, merge with defaults
        if (!currentConfig || typeof currentConfig !== 'object') {
          form.setValue("config", defaultConfig);
        } else {
          // Merge existing config with defaults to ensure all fields exist
          const mergedConfig = { ...defaultConfig, ...currentConfig };
          form.setValue("config", mergedConfig);
        }
      }
    }
  }, [selectedType, form]);

  const onSubmit = async (data: SecurityFormValues) => {
    setIsSubmitting(true);
    try {
      const parsed = securityFormSchema.parse(data);
      // Ensure config is properly structured
      if (!parsed.config && selectedType) {
        parsed.config = getDefaultConfig(selectedType);
      }
      
      if (security) {
        await securitiesApi.updateSecurity(security.id, parsed);
        toast.success("Security setting updated successfully");
      } else {
        await securitiesApi.createSecurity(parsed);
        toast.success("Security setting created successfully");
      }
      if (onSuccess) onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Failed to save security setting:", error);
      toast.error(error.message || "Failed to save security setting");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Render configuration fields based on security type
  const renderAdvancedConfig = () => {
    const config = form.watch("config") || {};
    const setConfigValue = (key: string, value: any) => {
      const currentConfig = form.getValues("config") || {};
      form.setValue("config", { ...currentConfig, [key]: value });
    };

    switch (selectedType) {
      case "password-policy":
        return (
          <div className="space-y-4">
            <FormItem>
              <FormLabel>Minimum Length</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min="4"
                  max="128"
                  value={config.minLength || 8}
                  onChange={(e) => setConfigValue("minLength", parseInt(e.target.value) || 8)}
                />
              </FormControl>
              <FormDescription>Minimum number of characters required</FormDescription>
            </FormItem>
            <div className="space-y-3">
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <FormLabel>Require Uppercase</FormLabel>
                  <FormDescription>Password must contain uppercase letters</FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={config.requireUppercase || false}
                    onCheckedChange={(checked) => setConfigValue("requireUppercase", checked)}
                  />
                </FormControl>
              </FormItem>
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <FormLabel>Require Lowercase</FormLabel>
                  <FormDescription>Password must contain lowercase letters</FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={config.requireLowercase || false}
                    onCheckedChange={(checked) => setConfigValue("requireLowercase", checked)}
                  />
                </FormControl>
              </FormItem>
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <FormLabel>Require Numbers</FormLabel>
                  <FormDescription>Password must contain numbers</FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={config.requireNumbers || false}
                    onCheckedChange={(checked) => setConfigValue("requireNumbers", checked)}
                  />
                </FormControl>
              </FormItem>
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <FormLabel>Require Special Characters</FormLabel>
                  <FormDescription>Password must contain special characters</FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={config.requireSpecialChars || false}
                    onCheckedChange={(checked) => setConfigValue("requireSpecialChars", checked)}
                  />
                </FormControl>
              </FormItem>
            </div>
            <FormItem>
              <FormLabel>Prevent Reuse (Last N passwords)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min="0"
                  max="24"
                  value={config.preventReuse || 0}
                  onChange={(e) => setConfigValue("preventReuse", parseInt(e.target.value) || 0)}
                />
              </FormControl>
              <FormDescription>Number of previous passwords to prevent reuse (0 = disabled)</FormDescription>
            </FormItem>
            <FormItem>
              <FormLabel>Password Expiration (Days)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min="0"
                  value={config.expirationDays || 0}
                  onChange={(e) => setConfigValue("expirationDays", parseInt(e.target.value) || 0)}
                />
              </FormControl>
              <FormDescription>Days before password expires (0 = never expires)</FormDescription>
            </FormItem>
          </div>
        );

      case "session-timeout":
        return (
          <div className="space-y-4">
            <FormItem>
              <FormLabel>Timeout (Minutes)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min="1"
                  value={config.timeoutMinutes || 30}
                  onChange={(e) => setConfigValue("timeoutMinutes", parseInt(e.target.value) || 30)}
                />
              </FormControl>
              <FormDescription>Session timeout in minutes</FormDescription>
            </FormItem>
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <FormLabel>Extend on Activity</FormLabel>
                <FormDescription>Automatically extend session on user activity</FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={config.extendOnActivity !== false}
                  onCheckedChange={(checked) => setConfigValue("extendOnActivity", checked)}
                />
              </FormControl>
            </FormItem>
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <FormLabel>Warn Before Timeout</FormLabel>
                <FormDescription>Show warning before session expires</FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={config.warnBeforeTimeout !== false}
                  onCheckedChange={(checked) => setConfigValue("warnBeforeTimeout", checked)}
                />
              </FormControl>
            </FormItem>
            {config.warnBeforeTimeout && (
              <FormItem>
                <FormLabel>Warning Time (Minutes)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min="1"
                    value={config.warnMinutes || 5}
                    onChange={(e) => setConfigValue("warnMinutes", parseInt(e.target.value) || 5)}
                  />
                </FormControl>
                <FormDescription>Minutes before timeout to show warning</FormDescription>
              </FormItem>
            )}
          </div>
        );

      case "two-factor":
        return (
          <div className="space-y-4">
            <FormItem>
              <FormLabel>2FA Method</FormLabel>
              <Select
                value={config.method || "sms"}
                onValueChange={(value) => setConfigValue("method", value)}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="app">Authenticator App</SelectItem>
                  <SelectItem value="both">Both SMS and App</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>Primary method for two-factor authentication</FormDescription>
            </FormItem>
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <FormLabel>Require for All Users</FormLabel>
                <FormDescription>Enforce 2FA for all users</FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={config.requireForAllUsers || false}
                  onCheckedChange={(checked) => setConfigValue("requireForAllUsers", checked)}
                />
              </FormControl>
            </FormItem>
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <FormLabel>Generate Backup Codes</FormLabel>
                <FormDescription>Allow users to generate backup codes</FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={config.backupCodes !== false}
                  onCheckedChange={(checked) => setConfigValue("backupCodes", checked)}
                />
              </FormControl>
            </FormItem>
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <FormLabel>Remember Device</FormLabel>
                <FormDescription>Allow users to remember trusted devices</FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={config.rememberDevice !== false}
                  onCheckedChange={(checked) => setConfigValue("rememberDevice", checked)}
                />
              </FormControl>
            </FormItem>
            {config.rememberDevice && (
              <FormItem>
                <FormLabel>Remember Duration (Days)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min="1"
                    value={config.rememberDays || 30}
                    onChange={(e) => setConfigValue("rememberDays", parseInt(e.target.value) || 30)}
                  />
                </FormControl>
                <FormDescription>Days to remember a trusted device</FormDescription>
              </FormItem>
            )}
          </div>
        );

      case "ip-whitelist":
        return (
          <div className="space-y-4">
            <FormItem>
              <FormLabel>IP Addresses (one per line)</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="192.168.1.1&#10;10.0.0.1&#10;172.16.0.1"
                  value={(config.ips || []).join("\n")}
                  onChange={(e) => {
                    const ips = e.target.value.split("\n").filter(ip => ip.trim());
                    setConfigValue("ips", ips);
                  }}
                  rows={6}
                />
              </FormControl>
              <FormDescription>Enter IP addresses, one per line</FormDescription>
            </FormItem>
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <FormLabel>Block All Except Listed</FormLabel>
                <FormDescription>Block all IPs except those in the whitelist</FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={config.allowAllExceptListed || false}
                  onCheckedChange={(checked) => setConfigValue("allowAllExceptListed", checked)}
                />
              </FormControl>
            </FormItem>
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <FormLabel>Notify on New IP</FormLabel>
                <FormDescription>Send notification when login from new IP</FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={config.notifyOnNewIp !== false}
                  onCheckedChange={(checked) => setConfigValue("notifyOnNewIp", checked)}
                />
              </FormControl>
            </FormItem>
          </div>
        );

      case "login-attempts":
        return (
          <div className="space-y-4">
            <FormItem>
              <FormLabel>Maximum Attempts</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min="1"
                  max="10"
                  value={config.maxAttempts || 5}
                  onChange={(e) => setConfigValue("maxAttempts", parseInt(e.target.value) || 5)}
                />
              </FormControl>
              <FormDescription>Maximum failed login attempts before lockout</FormDescription>
            </FormItem>
            <FormItem>
              <FormLabel>Lockout Duration (Minutes)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min="1"
                  value={config.lockoutDuration || 30}
                  onChange={(e) => setConfigValue("lockoutDuration", parseInt(e.target.value) || 30)}
                />
              </FormControl>
              <FormDescription>Duration of account lockout in minutes</FormDescription>
            </FormItem>
            <FormItem>
              <FormLabel>Reset After (Minutes)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min="1"
                  value={config.resetAfterMinutes || 15}
                  onChange={(e) => setConfigValue("resetAfterMinutes", parseInt(e.target.value) || 15)}
                />
              </FormControl>
              <FormDescription>Minutes before failed attempts counter resets</FormDescription>
            </FormItem>
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <FormLabel>Notify on Lockout</FormLabel>
                <FormDescription>Send notification when account is locked</FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={config.notifyOnLockout !== false}
                  onCheckedChange={(checked) => setConfigValue("notifyOnLockout", checked)}
                />
              </FormControl>
            </FormItem>
          </div>
        );

      case "data-encryption":
        return (
          <div className="space-y-4">
            <FormItem>
              <FormLabel>Encryption Algorithm</FormLabel>
              <Select
                value={config.algorithm || "AES-256"}
                onValueChange={(value) => setConfigValue("algorithm", value)}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="AES-128">AES-128</SelectItem>
                  <SelectItem value="AES-256">AES-256</SelectItem>
                  <SelectItem value="RSA-2048">RSA-2048</SelectItem>
                  <SelectItem value="RSA-4096">RSA-4096</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>Encryption algorithm to use</FormDescription>
            </FormItem>
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <FormLabel>Encrypt at Rest</FormLabel>
                <FormDescription>Encrypt data stored in database</FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={config.encryptAtRest !== false}
                  onCheckedChange={(checked) => setConfigValue("encryptAtRest", checked)}
                />
              </FormControl>
            </FormItem>
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <FormLabel>Encrypt in Transit</FormLabel>
                <FormDescription>Encrypt data during transmission</FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={config.encryptInTransit !== false}
                  onCheckedChange={(checked) => setConfigValue("encryptInTransit", checked)}
                />
              </FormControl>
            </FormItem>
            <FormItem>
              <FormLabel>Key Rotation (Days)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min="1"
                  value={config.keyRotationDays || 90}
                  onChange={(e) => setConfigValue("keyRotationDays", parseInt(e.target.value) || 90)}
                />
              </FormControl>
              <FormDescription>Days between encryption key rotations</FormDescription>
            </FormItem>
          </div>
        );

      case "audit-logging":
        return (
          <div className="space-y-4">
            <FormItem>
              <FormLabel>Log Level</FormLabel>
              <Select
                value={config.logLevel || "medium"}
                onValueChange={(value) => setConfigValue("logLevel", value)}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="minimal">Minimal</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="detailed">Detailed</SelectItem>
                  <SelectItem value="verbose">Verbose</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>Level of detail in audit logs</FormDescription>
            </FormItem>
            <div className="space-y-3">
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <FormLabel>Log User Actions</FormLabel>
                  <FormDescription>Log all user actions and activities</FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={config.logUserActions !== false}
                    onCheckedChange={(checked) => setConfigValue("logUserActions", checked)}
                  />
                </FormControl>
              </FormItem>
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <FormLabel>Log System Events</FormLabel>
                  <FormDescription>Log system-level events and changes</FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={config.logSystemEvents !== false}
                    onCheckedChange={(checked) => setConfigValue("logSystemEvents", checked)}
                  />
                </FormControl>
              </FormItem>
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <FormLabel>Log Data Changes</FormLabel>
                  <FormDescription>Log all data modifications</FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={config.logDataChanges !== false}
                    onCheckedChange={(checked) => setConfigValue("logDataChanges", checked)}
                  />
                </FormControl>
              </FormItem>
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <FormLabel>Alert on Suspicious Activity</FormLabel>
                  <FormDescription>Send alerts for suspicious activities</FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={config.alertOnSuspiciousActivity !== false}
                    onCheckedChange={(checked) => setConfigValue("alertOnSuspiciousActivity", checked)}
                  />
                </FormControl>
              </FormItem>
            </div>
            <FormItem>
              <FormLabel>Retention Period (Days)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min="1"
                  value={config.retentionDays || 365}
                  onChange={(e) => setConfigValue("retentionDays", parseInt(e.target.value) || 365)}
                />
              </FormControl>
              <FormDescription>Number of days to retain audit logs</FormDescription>
            </FormItem>
          </div>
        );

      case "api-security":
        return (
          <div className="space-y-4">
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <FormLabel>Require API Key</FormLabel>
                <FormDescription>Require API key for all API requests</FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={config.requireApiKey !== false}
                  onCheckedChange={(checked) => setConfigValue("requireApiKey", checked)}
                />
              </FormControl>
            </FormItem>
            <FormItem>
              <FormLabel>Rate Limit (per minute)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min="1"
                  value={config.rateLimitPerMinute || 100}
                  onChange={(e) => setConfigValue("rateLimitPerMinute", parseInt(e.target.value) || 100)}
                />
              </FormControl>
              <FormDescription>Maximum API requests per minute per key</FormDescription>
            </FormItem>
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <FormLabel>Require HTTPS</FormLabel>
                <FormDescription>Only allow API requests over HTTPS</FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={config.requireHttps !== false}
                  onCheckedChange={(checked) => setConfigValue("requireHttps", checked)}
                />
              </FormControl>
            </FormItem>
            <FormItem>
              <FormLabel>Allowed Origins (one per line)</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="https://example.com&#10;https://app.example.com"
                  value={(config.allowedOrigins || []).join("\n")}
                  onChange={(e) => {
                    const origins = e.target.value.split("\n").filter(origin => origin.trim());
                    setConfigValue("allowedOrigins", origins);
                  }}
                  rows={4}
                />
              </FormControl>
              <FormDescription>CORS allowed origins (leave empty to allow all)</FormDescription>
            </FormItem>
            <FormItem>
              <FormLabel>Token Expiration (Hours)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min="1"
                  value={config.tokenExpirationHours || 24}
                  onChange={(e) => setConfigValue("tokenExpirationHours", parseInt(e.target.value) || 24)}
                />
              </FormControl>
              <FormDescription>API token expiration time in hours</FormDescription>
            </FormItem>
          </div>
        );

      case "ssl-certificate":
        return (
          <div className="space-y-4">
            <FormItem>
              <FormLabel>Certificate Provider</FormLabel>
              <Select
                value={config.certificateProvider || "letsencrypt"}
                onValueChange={(value) => setConfigValue("certificateProvider", value)}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="letsencrypt">Let's Encrypt</SelectItem>
                  <SelectItem value="custom">Custom Certificate</SelectItem>
                  <SelectItem value="cloudflare">Cloudflare</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>SSL certificate provider</FormDescription>
            </FormItem>
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <FormLabel>Auto Renew</FormLabel>
                <FormDescription>Automatically renew certificate before expiration</FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={config.autoRenew !== false}
                  onCheckedChange={(checked) => setConfigValue("autoRenew", checked)}
                />
              </FormControl>
            </FormItem>
            {config.autoRenew && (
              <FormItem>
                <FormLabel>Renew Before (Days)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min="1"
                    value={config.renewBeforeDays || 30}
                    onChange={(e) => setConfigValue("renewBeforeDays", parseInt(e.target.value) || 30)}
                  />
                </FormControl>
                <FormDescription>Days before expiration to renew certificate</FormDescription>
              </FormItem>
            )}
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <FormLabel>Enforce HTTPS</FormLabel>
                <FormDescription>Redirect all HTTP traffic to HTTPS</FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={config.enforceHttps !== false}
                  onCheckedChange={(checked) => setConfigValue("enforceHttps", checked)}
                />
              </FormControl>
            </FormItem>
          </div>
        );

      case "backup-policy":
        return (
          <div className="space-y-4">
            <FormItem>
              <FormLabel>Backup Frequency</FormLabel>
              <Select
                value={config.frequency || "daily"}
                onValueChange={(value) => setConfigValue("frequency", value)}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="hourly">Hourly</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>How often to perform backups</FormDescription>
            </FormItem>
            <FormItem>
              <FormLabel>Retention Period (Days)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min="1"
                  value={config.retentionDays || 30}
                  onChange={(e) => setConfigValue("retentionDays", parseInt(e.target.value) || 30)}
                />
              </FormControl>
              <FormDescription>Number of days to retain backups</FormDescription>
            </FormItem>
            <FormItem>
              <FormLabel>Backup Location</FormLabel>
              <Select
                value={config.backupLocation || "cloud"}
                onValueChange={(value) => setConfigValue("backupLocation", value)}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="local">Local Storage</SelectItem>
                  <SelectItem value="cloud">Cloud Storage</SelectItem>
                  <SelectItem value="both">Both Local and Cloud</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>Where to store backups</FormDescription>
            </FormItem>
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <FormLabel>Encrypt Backups</FormLabel>
                <FormDescription>Encrypt backup files</FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={config.encryptBackups !== false}
                  onCheckedChange={(checked) => setConfigValue("encryptBackups", checked)}
                />
              </FormControl>
            </FormItem>
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <FormLabel>Test Restore</FormLabel>
                <FormDescription>Periodically test backup restoration</FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={config.testRestore !== false}
                  onCheckedChange={(checked) => setConfigValue("testRestore", checked)}
                />
              </FormControl>
            </FormItem>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 flex-shrink-0">
          <DialogTitle>{security ? "Edit Security Setting" : "Add Security Setting"}</DialogTitle>
          <DialogDescription>
            {security
              ? "Update the security setting below."
              : "Create a new security setting to manage system security policies and configurations."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
            <ScrollArea className="h-[calc(90vh-220px)] px-6">
              <div className="space-y-4 pb-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Setting Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="Password Minimum Length" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Security Type *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select security type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {securityTypeOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="value"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Value</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., 8, 3600, true" {...field} />
                      </FormControl>
                      <FormDescription>Primary value for this security setting (optional)</FormDescription>
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
                          placeholder="Security setting description..."
                          {...field}
                          rows={3}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {selectedType && (
                  <>
                    <Separator />
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-lg font-semibold mb-2">Advanced Configuration</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          Configure detailed settings for {securityTypeOptions.find(opt => opt.value === selectedType)?.label}
                        </p>
                      </div>
                      {renderAdvancedConfig()}
                    </div>
                  </>
                )}

                <Separator />

                <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                      <div className="space-y-0.5">
                        <FormLabel>Active</FormLabel>
                        <div className="text-xs text-muted-foreground">
                          Enable or disable this security setting
                        </div>
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
                {isSubmitting ? "Saving..." : security ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
















































