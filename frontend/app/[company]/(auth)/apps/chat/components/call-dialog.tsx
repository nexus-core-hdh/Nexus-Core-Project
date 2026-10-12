"use client";

import React, { useState, useEffect, useCallback } from "react";
import { PhoneMissedIcon, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { WebRTCCall } from "./webrtc-call";
import { getCurrentUser } from "@/lib/auth";
import { callApi } from "@/lib/api";
import { toast } from "sonner";
import { UserPropsTypes } from "../types";

interface CallDialogProps {
  user?: UserPropsTypes;
  chatId?: number; // For group calls
}

export function CallDialog({ user, chatId }: CallDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [callData, setCallData] = useState<{
    callId: string;
    participants: Array<{ userId: number; name?: string; avatar?: string }>;
  } | null>(null);
  const currentUser = getCurrentUser();

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  useEffect(() => {
    if (isOpen && currentUser && !callData) {
      startCall();
    } else if (!isOpen) {
      // Reset call data when dialog closes
      setCallData(null);
    }
  }, [isOpen]);

  const startCall = async () => {
    if (!currentUser) return;

    try {
      setLoading(true);
      
      let participantIds: number[] = [];
      let type: 'direct' | 'group' = 'direct';

      if (user) {
        // 1-to-1 call
        participantIds = [user.id];
        type = 'direct';
      } else if (chatId) {
        // Group call from chat
        type = 'group';
      }

      const response = await callApi.startCall({
        participantIds,
        type,
        chatId,
        isVideoCall: false,
      });

      if (!response?.callId) {
        throw new Error('Invalid call ID received from server');
      }

      setCallData({
        callId: response.callId,
        participants: response.participants || [],
      });
    } catch (error: any) {
      console.error("Failed to start call:", error);
      toast.error(error.message || "Failed to start call");
      setIsOpen(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="outline">
          <PhoneMissedIcon />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[95vw] h-[95vh] p-0">
        <VisuallyHidden>
          <DialogTitle>Audio Call with {user?.name || "User"}</DialogTitle>
        </VisuallyHidden>
        <div className="h-full w-full">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
                <p className="text-muted-foreground">Connecting to call...</p>
              </div>
            </div>
          ) : callData ? (
            <WebRTCCall
              callId={callData.callId}
              participants={callData.participants.map(p => ({
                userId: p.userId,
                socketId: '', // Will be set when participant joins
                name: p.name,
                avatar: p.avatar,
              }))}
              isAudioOnly={true}
              onClose={handleClose}
              localUser={currentUser ? {
                id: currentUser.id,
                name: currentUser.name || 'User',
                email: currentUser.email || '',
                avatar: currentUser.image,
              } : undefined}
              targetUser={user ? {
                id: user.id,
                name: user.name || 'User',
                avatar: user.avatar,
              } : undefined}
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
