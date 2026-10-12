"use client";

import React, { useState } from "react";
import { Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatItemProps } from "../types";
import { ChatListItem } from "./chat-list-item";
import { chatMessageApi } from "@/lib/api";
import { toast } from "sonner";

interface ForwardMessageDialogProps {
  isOpen: boolean;
  onClose: () => void;
  messageId: number;
  chats: ChatItemProps[];
  onSuccess?: () => void;
}

export function ForwardMessageDialog({
  isOpen,
  onClose,
  messageId,
  chats,
  onSuccess,
}: ForwardMessageDialogProps) {
  const [selectedChatId, setSelectedChatId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [forwarding, setForwarding] = useState(false);

  const filteredChats = chats.filter((chat) =>
    chat.user.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleForward = async () => {
    if (!selectedChatId) {
      toast.error("Please select a chat to forward to");
      return;
    }

    try {
      setForwarding(true);
      await chatMessageApi.forwardMessage(messageId, selectedChatId);
      toast.success("Message forwarded successfully");
      onSuccess?.();
      onClose();
      setSelectedChatId(null);
      setSearchQuery("");
    } catch (error: any) {
      console.error("Failed to forward message:", error);
      toast.error("Failed to forward message");
    } finally {
      setForwarding(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Forward Message</DialogTitle>
          <DialogDescription>
            Select a chat to forward this message to
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="relative">
            <Search className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
            <Input
              type="text"
              className="pl-9"
              placeholder="Search chats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <ScrollArea className="h-[300px]">
            <div className="space-y-1">
              {filteredChats.length > 0 ? (
                filteredChats.map((chat) => (
                  <div
                    key={chat.id}
                    onClick={() => setSelectedChatId(chat.id)}
                    className={`cursor-pointer rounded-md p-2 transition-colors ${
                      selectedChatId === chat.id
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted"
                    }`}
                  >
                    <ChatListItem chat={chat} active={selectedChatId === chat.id} />
                  </div>
                ))
              ) : (
                <div className="text-muted-foreground py-8 text-center text-sm">
                  No chats found
                </div>
              )}
            </div>
          </ScrollArea>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={forwarding}>
              Cancel
            </Button>
            <Button onClick={handleForward} disabled={!selectedChatId || forwarding}>
              {forwarding ? "Forwarding..." : "Forward"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}











































