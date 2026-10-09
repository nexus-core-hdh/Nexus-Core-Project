"use client";

import React, { useState } from "react";
import { Ellipsis, Star, Forward, Edit, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChatMessageProps, ChatItemProps } from "../types";
import { ForwardMessageDialog, EditMessageDialog } from "./";
import { chatMessageApi } from "@/lib/api";
import { toast } from "sonner";

interface MessageActionsProps {
  message: ChatMessageProps;
  chats?: ChatItemProps[];
  onMessageUpdated?: () => void;
  onEdit?: () => void;
}

export function MessageActions({ message, chats = [], onMessageUpdated, onEdit }: MessageActionsProps) {
  const [showForwardDialog, setShowForwardDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [isStarred, setIsStarred] = useState(message.data?.starred || false);

  const handleForward = () => {
    setShowForwardDialog(true);
  };

  const handleStar = async () => {
    try {
      const newStarredState = !isStarred;
      await chatMessageApi.starMessage(message.id, newStarredState);
      setIsStarred(newStarredState);
      toast.success(newStarredState ? "Message starred" : "Message unstarred");
      onMessageUpdated?.();
    } catch (error: any) {
      console.error("Failed to star message:", error);
      toast.error("Failed to update star status");
    }
  };

  const handleEdit = () => {
    if (message.type === "text") {
      // Use inline edit if onEdit callback is provided, otherwise use dialog
      if (onEdit) {
        onEdit();
      } else {
        setShowEditDialog(true);
      }
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this message?")) {
      return;
    }

    try {
      await chatMessageApi.deleteMessage(message.id);
      toast.success("Message deleted successfully");
      onMessageUpdated?.();
    } catch (error: any) {
      console.error("Failed to delete message:", error);
      toast.error("Failed to delete message");
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost">
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={message.own_message ? "start" : "end"}>
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={handleForward}>
              <Forward className="mr-2 h-4 w-4" />
              Forward
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleStar}>
              <Star className={`mr-2 h-4 w-4 ${isStarred ? "fill-yellow-400 text-yellow-400" : ""}`} />
              {isStarred ? "Unstar" : "Star"}
            </DropdownMenuItem>
            {message.own_message && message.type === "text" && (
              <DropdownMenuItem onClick={handleEdit}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
            )}
            {message.own_message && (
              <DropdownMenuItem onClick={handleDelete} className="text-red-600 focus:text-red-600">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {showForwardDialog && (
        <ForwardMessageDialog
          isOpen={showForwardDialog}
          onClose={() => setShowForwardDialog(false)}
          messageId={message.id}
          chats={chats}
          onSuccess={onMessageUpdated}
        />
      )}

      {showEditDialog && message.type === "text" && (
        <EditMessageDialog
          isOpen={showEditDialog}
          onClose={() => setShowEditDialog(false)}
          messageId={message.id}
          currentContent={message.content || ""}
          onSuccess={onMessageUpdated}
        />
      )}
    </>
  );
}


