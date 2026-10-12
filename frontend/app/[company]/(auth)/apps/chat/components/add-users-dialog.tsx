"use client";

import { useState, useEffect } from "react";
import { Search, Loader2, Users } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn, generateAvatarFallback } from "@/lib/utils";
import { usersApi, chatApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";

interface User {
  id: number;
  name: string;
  email: string;
  image?: string | null;
  status?: string;
  company?: {
    id: number;
    name: string;
  };
  branch?: {
    id: number;
    name: string;
  };
}

interface AddUsersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chatId: number;
  existingUserIds?: number[];
  onUsersAdded?: () => void;
}

export function AddUsersDialog({
  open,
  onOpenChange,
  chatId,
  existingUserIds = [],
  onUsersAdded,
}: AddUsersDialogProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [shareHistory, setShareHistory] = useState(false);
  const [loading, setLoading] = useState(false);
  const [addingUsers, setAddingUsers] = useState(false);

  useEffect(() => {
    if (open) {
      loadUsers();
    } else {
      // Reset state when dialog closes
      setSearchQuery("");
      setUsers([]);
      setFilteredUsers([]);
      setSelectedUsers([]);
      setShareHistory(false);
    }
  }, [open, existingUserIds]);

  useEffect(() => {
    if (searchQuery.trim()) {
      const filtered = users.filter(
        (user) =>
          user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          user.email.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredUsers(filtered);
    } else {
      setFilteredUsers(users);
    }
  }, [searchQuery, users]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const currentUser = getCurrentUser();
      if (!currentUser) {
        toast.error("Please log in to search users");
        return;
      }

      // Fetch current participants to ensure we have the latest data
      let currentParticipantIds: number[] = existingUserIds;
      try {
        const chatData = await chatApi.getChatById(chatId);
        if (chatData.participants) {
          currentParticipantIds = chatData.participants.map((p: any) => {
            // Handle different participant data structures
            if (p.userId) return p.userId;
            if (p.user?.id) return p.user.id;
            return null;
          }).filter((id: number | null): id is number => id !== null);
        }
      } catch (error) {
        console.error("Failed to fetch chat participants:", error);
        // Use existingUserIds as fallback
      }

      const allUsers = await usersApi.getUsers();
      
      // Filter out current user and users already in the group
      const availableUsers = allUsers.filter(
        (user: User) => user.id !== currentUser.id && !currentParticipantIds.includes(user.id)
      );
      
      if (availableUsers.length === 0) {
        toast.info("All available users are already in this group");
      }
      
      setUsers(availableUsers);
      setFilteredUsers(availableUsers);
    } catch (error: any) {
      console.error("Failed to load users:", error);
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  const toggleUserSelection = (user: User) => {
    setSelectedUsers((prev) => {
      const isSelected = prev.some((u) => u.id === user.id);
      if (isSelected) {
        return prev.filter((u) => u.id !== user.id);
      } else {
        return [...prev, user];
      }
    });
  };

  const handleAddUsers = async () => {
    if (selectedUsers.length === 0) {
      toast.error("Please select at least one user to add");
      return;
    }

    try {
      setAddingUsers(true);
      
      // Double-check that selected users are not already in the group
      let currentParticipantIds: number[] = existingUserIds;
      try {
        const chatData = await chatApi.getChatById(chatId);
        if (chatData.participants) {
          currentParticipantIds = chatData.participants.map((p: any) => {
            if (p.userId) return p.userId;
            if (p.user?.id) return p.user.id;
            return null;
          }).filter((id: number | null): id is number => id !== null);
        }
      } catch (error) {
        console.error("Failed to fetch chat participants:", error);
      }

      const selectedUserIds = selectedUsers.map((u) => u.id);
      const alreadyInGroup = selectedUserIds.filter((id) => currentParticipantIds.includes(id));
      
      if (alreadyInGroup.length > 0) {
        toast.error("Some selected users are already in the group. Please refresh and try again.");
        // Reload users to update the list
        await loadUsers();
        setSelectedUsers([]);
        setAddingUsers(false);
        return;
      }

      await chatApi.addUsersToGroup(chatId, {
        userIds: selectedUserIds,
        shareHistory: shareHistory,
      });

      toast.success(`${selectedUsers.length} user${selectedUsers.length > 1 ? 's' : ''} added to group`);
      onOpenChange(false);
      onUsersAdded?.();
    } catch (error: any) {
      console.error("Failed to add users:", error);
      const errorMessage = error.message || "Failed to add users to group";
      toast.error(errorMessage);
      
      // If error is about users already in group, reload the user list
      if (errorMessage.includes("already in the group") || errorMessage.includes("already in")) {
        await loadUsers();
        setSelectedUsers([]);
      }
    } finally {
      setAddingUsers(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Add Users to Group</DialogTitle>
          <DialogDescription>
            Select users to add to this group
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Share History Option */}
          <div className="flex items-center space-x-2 rounded-md border p-3">
            <Checkbox
              id="share-history"
              checked={shareHistory}
              onCheckedChange={(checked) => setShareHistory(checked === true)}
              disabled={addingUsers}
            />
            <Label
              htmlFor="share-history"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
            >
              Share chat history with new members
            </Label>
          </div>

          {/* Search Input */}
          <div className="space-y-2">
            <Label>Search Users</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground size-4" />
              <Input
                type="text"
                placeholder="Search users by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                disabled={addingUsers}
              />
            </div>
          </div>

          {/* Users List */}
          <div className="max-h-[300px] overflow-y-auto border rounded-md">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Loading users...</span>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {searchQuery ? "No users found matching your search" : "No users available to add"}
              </div>
            ) : (
              <div className="divide-y">
                {filteredUsers.map((user) => {
                  const isSelected = selectedUsers.some((u) => u.id === user.id);
                  return (
                    <div
                      key={user.id}
                      className={cn(
                        "w-full flex items-center gap-3 h-auto py-3 px-4 rounded-none cursor-pointer hover:bg-muted/50 transition-colors",
                        addingUsers && "opacity-50 cursor-not-allowed",
                        isSelected && "bg-muted"
                      )}
                      onClick={() => !addingUsers && toggleUserSelection(user)}
                    >
                      <Avatar className="size-10 shrink-0">
                        <AvatarImage src={user.image || undefined} alt={user.name} />
                        <AvatarFallback>{generateAvatarFallback(user.name)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 text-left min-w-0">
                        <div className="font-medium truncate">{user.name}</div>
                        <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                        {(user.company || user.branch) && (
                          <div className="text-xs text-muted-foreground truncate">
                            {user.company?.name}
                            {user.company && user.branch && " • "}
                            {user.branch?.name}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleUserSelection(user)}
                          disabled={addingUsers}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Add Button */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={addingUsers}>
              Cancel
            </Button>
            <Button
              onClick={handleAddUsers}
              disabled={selectedUsers.length === 0 || addingUsers}
            >
              {addingUsers ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Users className="mr-2 size-4" />
                  Add {selectedUsers.length > 0 ? `${selectedUsers.length} ` : ''}User{selectedUsers.length !== 1 ? 's' : ''}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

