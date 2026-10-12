"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { getCurrentUser } from "@/lib/auth";
import { systemSettingsApi } from "@/lib/api";
import { toast } from "sonner";
import { Save, RefreshCw } from "lucide-react";

interface SettingsData {
  autoBackup: boolean;
  backupFrequency: string;
  fileRetentionDays: number;
  maxFileSize: number;
  allowedFileTypes: string;
  enableNotifications: boolean;
  enableAuditLog: boolean;
  customSettings: string;
}

export default function OtherSettingsPage() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<SettingsData>({
    autoBackup: false,
    backupFrequency: "daily",
    fileRetentionDays: 365,
    maxFileSize: 100, // MB
    allowedFileTypes: "pdf,doc,docx,xls,xlsx,ppt,pptx,jpg,jpeg,png,gif,mp4,mp3,zip,rar",
    enableNotifications: true,
    enableAuditLog: true,
    customSettings: ""
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const user = getCurrentUser();
      if (!user) {
        toast.error("User not found");
        return;
      }

      const data = await systemSettingsApi.getSystemSettings({
        companyId: user.companyId || undefined,
        branchId: user.branchId || undefined
      });

      setSettings((prev) => ({
        ...prev,
        ...(data || {})
      }));

    } catch (error: any) {
      console.error("Failed to fetch settings:", error);
      toast.error("Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const user = getCurrentUser();
      if (!user) {
        toast.error("User not found");
        return;
      }

      await systemSettingsApi.updateSystemSettings(settings as any);

      toast.success("Settings saved successfully");
    } catch (error: any) {
      console.error("Failed to save settings:", error);
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between space-y-2">
        <h1 className="text-lg font-bold tracking-tight">Other Settings</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={fetchSettings}
            disabled={loading || saving}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            <span className="hidden lg:inline">Refresh</span>
          </Button>
          <Button onClick={handleSave} disabled={loading || saving}>
            <Save className="h-4 w-4 mr-2" />
            <span className="hidden lg:inline">{saving ? "Saving..." : "Save Changes"}</span>
            <span className="lg:hidden">{saving ? "Saving..." : "Save"}</span>
          </Button>
        </div>
      </div>

      <div className="w-full space-y-6">

      {/* Backup Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Backup Settings</CardTitle>
          <CardDescription>Configure automatic backup preferences</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Automatic Backup</Label>
              <p className="text-sm text-muted-foreground">
                Enable automatic backup of your data
              </p>
            </div>
            <Switch
              checked={settings.autoBackup}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, autoBackup: checked })
              }
            />
          </div>

          {settings.autoBackup && (
            <div className="space-y-2">
              <Label htmlFor="backupFrequency">Backup Frequency</Label>
              <Select
                value={settings.backupFrequency}
                onValueChange={(value) =>
                  setSettings({ ...settings, backupFrequency: value })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select frequency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hourly">Hourly</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* File Management Settings */}
      <Card>
        <CardHeader>
          <CardTitle>File Management</CardTitle>
          <CardDescription>Configure file storage and retention policies</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fileRetentionDays">File Retention Period (Days)</Label>
            <Input
              id="fileRetentionDays"
              type="number"
              value={settings.fileRetentionDays}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  fileRetentionDays: parseInt(e.target.value) || 365
                })
              }
            />
            <p className="text-sm text-muted-foreground">
              Files older than this period will be automatically archived
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="maxFileSize">Maximum File Size (MB)</Label>
            <Input
              id="maxFileSize"
              type="number"
              value={settings.maxFileSize}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  maxFileSize: parseInt(e.target.value) || 100
                })
              }
            />
            <p className="text-sm text-muted-foreground">
              Maximum allowed file size for uploads
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="allowedFileTypes">Allowed File Types</Label>
            <Input
              id="allowedFileTypes"
              value={settings.allowedFileTypes}
              onChange={(e) =>
                setSettings({ ...settings, allowedFileTypes: e.target.value })
              }
              placeholder="pdf,doc,docx,jpg,png"
            />
            <p className="text-sm text-muted-foreground">
              Comma-separated list of allowed file extensions
            </p>
          </div>
        </CardContent>
      </Card>

      {/* System Settings */}
      <Card>
        <CardHeader>
          <CardTitle>System Settings</CardTitle>
          <CardDescription>Configure system-wide preferences</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Email Notifications</Label>
              <p className="text-sm text-muted-foreground">
                Receive email notifications for important events
              </p>
            </div>
            <Switch
              checked={settings.enableNotifications}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, enableNotifications: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Audit Log</Label>
              <p className="text-sm text-muted-foreground">
                Enable audit logging for all system activities
              </p>
            </div>
            <Switch
              checked={settings.enableAuditLog}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, enableAuditLog: checked })
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Custom Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Custom Settings</CardTitle>
          <CardDescription>Additional custom configuration (JSON format)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="customSettings">Custom Configuration</Label>
            <Textarea
              id="customSettings"
              value={settings.customSettings}
              onChange={(e) =>
                setSettings({ ...settings, customSettings: e.target.value })
              }
              placeholder='{"key": "value"}'
              rows={6}
              className="font-mono text-sm"
            />
            <p className="text-sm text-muted-foreground">
              Enter custom settings in JSON format
            </p>
          </div>
        </CardContent>
      </Card>
      </div>
    </>
  );
}

