"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import { Users, Loader2, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn, generateAvatarFallback } from "@/lib/utils";
import { formPermissionsApi, usersApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";

interface User {
  id: number;
  name: string;
  email: string;
  image?: string | null;
}

interface Permission {
  id: number;
  userId: number;
  canView: boolean;
  user: User;
}

interface SectionPermissionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sectionId: number;
  sectionTitle: string;
}

export function SectionPermissionsDialog({
  open,
  onOpenChange,
  sectionId,
  sectionTitle,
}: SectionPermissionsDialogProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [permissionMap, setPermissionMap] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (open && sectionId && !isNaN(sectionId) && sectionId > 0) {
      console.log('Loading permissions for section:', sectionId);
      loadData();
    } else {
      console.log('Dialog open but invalid sectionId:', { open, sectionId, isNaN: isNaN(sectionId) });
      if (open && (isNaN(sectionId) || sectionId <= 0)) {
        toast.error("Invalid section ID. Please save the section to database first.");
        onOpenChange(false);
      }
      setPermissions([]);
      setPermissionMap({});
      setSearchQuery("");
    }
  }, [open, sectionId, onOpenChange]);

  const loadData = async () => {
    try {
      setLoading(true);
      console.log('Loading data for section:', sectionId);
      const currentUser = getCurrentUser();
      if (!currentUser) {
        toast.error("Please log in");
        return;
      }

      // Load all users in the company/branch
      console.log('Loading users...');
      const users = await usersApi.getUsers();
      console.log('Users loaded:', users.length);
      setAllUsers(users);

      // Load existing permissions
      console.log('Loading permissions for section:', sectionId);
      const existingPermissions = await formPermissionsApi.getSectionPermissions(sectionId);
      console.log('Permissions loaded:', existingPermissions);
      setPermissions(existingPermissions);

      // Create permission map for quick lookup
      const map: Record<number, boolean> = {};
      existingPermissions.forEach((perm: Permission) => {
        map[perm.userId] = perm.canView;
      });

      // Set default permissions for users without explicit permissions (default: true)
      users.forEach((user: User) => {
        if (!(user.id in map)) {
          map[user.id] = true; // Default: all users have access
        }
      });

      setPermissionMap(map);
    } catch (error: any) {
      console.error("Failed to load permissions:", error);
      toast.error("Failed to load permissions");
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePermission = (userId: number) => {
    setPermissionMap((prev) => ({
      ...prev,
      [userId]: !prev[userId],
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const currentUser = getCurrentUser();
      if (!currentUser) {
        toast.error("Please log in");
        return;
      }

      // Prepare permissions array
      const permissionsToUpdate = Object.entries(permissionMap).map(([userId, canView]) => ({
        userId: parseInt(userId),
        canView: canView === true,
      }));

      // Bulk update permissions
      await formPermissionsApi.bulkUpdateSectionPermissions(sectionId, permissionsToUpdate);

      toast.success("Permissions updated successfully");
      onOpenChange(false);
      loadData(); // Reload to refresh
    } catch (error: any) {
      console.error("Failed to update permissions:", error);
      toast.error(error.message || "Failed to update permissions");
    } finally {
      setSaving(false);
    }
  };

  const filteredUsers = allUsers.filter(
    (user) =>
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Don't render if sectionId is invalid
  if (!sectionId || isNaN(sectionId) || sectionId <= 0) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Manage Section Permissions</DialogTitle>
          <DialogDescription>
            Control who can view the section: <strong>{sectionTitle}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground size-4" />
            <Input
              type="text"
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Users List */}
          <div className="flex-1 overflow-y-auto border rounded-md">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Loading...</span>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {searchQuery ? "No users found" : "No users available"}
              </div>
            ) : (
              <div className="divide-y">
                {filteredUsers.map((user) => {
                  const hasAccess = permissionMap[user.id] !== false; // Default true
                  return (
                    <div
                      key={user.id}
                      className="flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors"
                    >
                      <Avatar className="size-10">
                        <AvatarImage src={user.image || undefined} alt={user.name} />
                        <AvatarFallback>{generateAvatarFallback(user.name)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{user.name}</div>
                        <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={hasAccess ? "default" : "secondary"}>
                          {hasAccess ? "Can View" : "No Access"}
                        </Badge>
                        <Checkbox
                          checked={hasAccess}
                          onCheckedChange={() => handleTogglePermission(user.id)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Users className="mr-2 size-4" />
                Save Permissions
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

