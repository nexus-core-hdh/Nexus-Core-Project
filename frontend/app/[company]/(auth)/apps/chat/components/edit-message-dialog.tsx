"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { chatMessageApi } from "@/lib/api";
import { toast } from "sonner";

interface EditMessageDialogProps {
  isOpen: boolean;
  onClose: () => void;
  messageId: number;
  currentContent: string;
  onSuccess?: () => void;
}

export function EditMessageDialog({
  isOpen,
  onClose,
  messageId,
  currentContent,
  onSuccess,
}: EditMessageDialogProps) {
  const [content, setContent] = useState(currentContent);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setContent(currentContent);
    }
  }, [isOpen, currentContent]);

  const handleSave = async () => {
    if (!content.trim()) {
      toast.error("Message cannot be empty");
      return;
    }

    try {
      setSaving(true);
      await chatMessageApi.updateMessage(messageId, { content: content.trim() });
      toast.success("Message updated successfully");
      onSuccess?.();
      onClose();
    } catch (error: any) {
      console.error("Failed to update message:", error);
      toast.error("Failed to update message");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit Message</DialogTitle>
          <DialogDescription>
            Update your message content
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Input
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Enter message..."
            onKeyPress={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSave();
              }
            }}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!content.trim() || saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}











































