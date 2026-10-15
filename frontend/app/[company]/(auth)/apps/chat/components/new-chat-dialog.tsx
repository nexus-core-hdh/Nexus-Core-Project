"use client";

import { useState, useEffect } from "react";
import { Search, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, generateAvatarFallback } from "@/lib/utils";
import { usersApi, chatApi, chatAccessApi } from "@/lib/api";
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

interface NewChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChatCreated?: () => void;
}

export function NewChatDialog({ open, onOpenChange, onChatCreated }: NewChatDialogProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [creatingChat, setCreatingChat] = useState(false);
  const { setSelectedChat } = useChatStore();

  useEffect(() => {
    if (open) {
      loadUsers();
    } else {
      // Reset state when dialog closes
      setSearchQuery("");
      setUsers([]);
      setFilteredUsers([]);
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

      // Get users who have granted access to current user (users current user can chat with)
      const usersWithAccess = await chatAccessApi.getUsersWithChatAccess();
      
      // Transform to User format
      const accessibleUsers = usersWithAccess.map((access: any) => ({
        id: access.user.id,
        name: access.user.name,
        email: access.user.email,
        image: access.user.image,
        status: access.user.status,
      }));
      
      setUsers(accessibleUsers);
      setFilteredUsers(accessibleUsers);
    } catch (error: any) {
      console.error("Failed to load users:", error);
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateChat = async (user: User) => {
    try {
      setCreatingChat(true);
      const currentUser = getCurrentUser();
      if (!currentUser) {
        toast.error("Please log in to create a chat");
        return;
      }

      // Create a direct chat with the selected user
      // Note: userId is not needed as backend gets it from auth token
      const chatData = await chatApi.createChat({
        userId: currentUser.id, // API signature requires it, but backend uses req.userId
        participantIds: [user.id],
        type: "DIRECT",
      });

      // Get the other participant (the selected user)
      const otherParticipant = chatData.participants?.find(
        (p: any) => p.userId !== currentUser.id
      )?.user;

      // Transform the chat data to match ChatItemProps format
      const transformedChat: ChatItemProps = {
        id: chatData.id,
        user_id: otherParticipant?.id || user.id,
        user: otherParticipant
          ? {
              id: otherParticipant.id,
              name: otherParticipant.name,
              avatar: otherParticipant.image || undefined,
              email: otherParticipant.email,
              online_status: otherParticipant.status === "active" ? "success" : "danger",
            }
          : {
              id: user.id,
              name: user.name,
              avatar: user.image || undefined,
              email: user.email,
              online_status: user.status === "active" ? "success" : "danger",
            },
        last_message: "",
        date: "Just now",
        status: "sent",
        is_archive: false,
        messages: [],
      };

      // Select the newly created chat
      setSelectedChat(transformedChat);
      
      // Close the dialog
      onOpenChange(false);
      
      // Refresh chat list if callback provided
      if (onChatCreated) {
        onChatCreated();
      }

      toast.success(`Chat with ${user.name} created`);
    } catch (error: any) {
      console.error("Failed to create chat:", error);
      toast.error(error.message || "Failed to create chat");
    } finally {
      setCreatingChat(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>New Chat</DialogTitle>
          <DialogDescription>
            Search for users who have granted you chat access to start a conversation
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground size-4" />
            <Input
              type="text"
              placeholder="Search users by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Users List */}
          <div className="max-h-[400px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Loading users...</span>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {searchQuery ? "No users found matching your search" : "No users have granted you chat access. Ask users to grant you chat access in Settings > Permissions > Chat Access."}
              </div>
            ) : (
              <div className="space-y-1">
                {filteredUsers.map((user) => (
                  <Button
                    key={user.id}
                    variant="ghost"
                    className={cn(
                      "w-full justify-start gap-3 h-auto py-3 px-4",
                      creatingChat && "opacity-50 cursor-not-allowed"
                    )}
                    onClick={() => handleCreateChat(user)}
                    disabled={creatingChat}
                  >
                    <Avatar className="size-10">
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
                  </Button>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

