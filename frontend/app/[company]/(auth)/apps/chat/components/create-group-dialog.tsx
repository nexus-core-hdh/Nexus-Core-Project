"use client";

import { useState, useEffect } from "react";
import { Search, Loader2, Users, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn, generateAvatarFallback } from "@/lib/utils";
import { usersApi, chatApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";
import useChatStore from "@/app/[company]/(auth)/apps/chat/useChatStore";
import { ChatItemProps } from "@/app/[company]/(auth)/apps/chat/types";

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

interface CreateGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGroupCreated?: () => void;
}

export function CreateGroupDialog({ open, onOpenChange, onGroupCreated }: CreateGroupDialogProps) {
  const [groupName, setGroupName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const { setSelectedChat } = useChatStore();

  useEffect(() => {
    if (open) {
      loadUsers();
    } else {
      // Reset state when dialog closes
      setGroupName("");
      setSearchQuery("");
      setUsers([]);
      setFilteredUsers([]);
      setSelectedUsers([]);
    }
  }, [open]);

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

      const allUsers = await usersApi.getUsers();
      
      // Filter out the current user from the list
      const otherUsers = allUsers.filter((user: User) => user.id !== currentUser.id);
      setUsers(otherUsers);
      setFilteredUsers(otherUsers);
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

  const removeSelectedUser = (userId: number) => {
    setSelectedUsers((prev) => prev.filter((u) => u.id !== userId));
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      toast.error("Please enter a group name");
      return;
    }

    if (selectedUsers.length === 0) {
      toast.error("Please select at least one user to add to the group");
      return;
    }

    try {
      setCreatingGroup(true);
      const currentUser = getCurrentUser();
      if (!currentUser) {
        toast.error("Please log in to create a group");
        return;
      }

      // Create group chat
      const chatData = await chatApi.createChat({
        userId: currentUser.id,
        participantIds: selectedUsers.map((u) => u.id),
        type: "GROUP",
        name: groupName.trim(),
      });

      // Transform the chat data to match ChatItemProps format
      const transformedChat: ChatItemProps = {
        id: chatData.id,
        name: chatData.name || groupName.trim(),
        user_id: currentUser.id,
        user: {
          id: currentUser.id,
          name: currentUser.name || "You",
          avatar: currentUser.image || undefined,
          email: currentUser.email || "",
        },
        type: "GROUP",
        last_message: "",
        date: "Just now",
        status: "sent",
        is_archive: false,
        messages: [],
      };

      // Select the newly created group
      setSelectedChat(transformedChat);
      
      // Close the dialog
      onOpenChange(false);
      
      // Refresh chat list if callback provided
      if (onGroupCreated) {
        onGroupCreated();
      }

      toast.success(`Group "${groupName.trim()}" created successfully`);
    } catch (error: any) {
      console.error("Failed to create group:", error);
      toast.error(error.message || "Failed to create group");
    } finally {
      setCreatingGroup(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Create Group</DialogTitle>
          <DialogDescription>
            Create a group chat and add members
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Group Name Input */}
          <div className="space-y-2">
            <Label htmlFor="group-name">Group Name</Label>
            <Input
              id="group-name"
              type="text"
              placeholder="Enter group name..."
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              disabled={creatingGroup}
            />
          </div>

          {/* Selected Users */}
          {selectedUsers.length > 0 && (
            <div className="space-y-2">
              <Label>Selected Members ({selectedUsers.length})</Label>
              <div className="flex flex-wrap gap-2">
                {selectedUsers.map((user) => (
                  <Badge key={user.id} variant="secondary" className="gap-1 pr-1">
                    <Avatar className="size-4">
                      <AvatarImage src={user.image || undefined} alt={user.name} />
                      <AvatarFallback className="text-xs">
                        {generateAvatarFallback(user.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs">{user.name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4 rounded-full hover:bg-destructive hover:text-destructive-foreground"
                      onClick={() => removeSelectedUser(user.id)}
                      disabled={creatingGroup}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Search Input */}
          <div className="space-y-2">
            <Label>Add Members</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground size-4" />
              <Input
                type="text"
                placeholder="Search users by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                disabled={creatingGroup}
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
                {searchQuery ? "No users found matching your search" : "No users available"}
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
                        creatingGroup && "opacity-50 cursor-not-allowed",
                        isSelected && "bg-muted"
                      )}
                      onClick={() => !creatingGroup && toggleUserSelection(user)}
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
                          disabled={creatingGroup}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Create Button */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creatingGroup}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateGroup}
              disabled={!groupName.trim() || selectedUsers.length === 0 || creatingGroup}
            >
              {creatingGroup ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Users className="mr-2 size-4" />
                  Create Group
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

