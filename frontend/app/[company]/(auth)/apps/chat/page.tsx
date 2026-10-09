"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { generateMeta } from "@/lib/utils";
import { ChatItemProps } from "./types";
import { ChatSidebar, ChatContent, IncomingCallDialog } from "@/app/[company]/(auth)/apps/chat/components";
import { chatApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";
import useChatStore from "@/app/[company]/(auth)/apps/chat/useChatStore";
import { io, Socket } from "socket.io-client";

//const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

export default function Page() {
  const [chats, setChats] = useState<ChatItemProps[]>([]);
  const [loading, setLoading] = useState(true);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const { selectedChat, setSelectedChat } = useChatStore();
  
  // Incoming call state
  const [incomingCall, setIncomingCall] = useState<{
    callId: string;
    caller: { id: number; name: string; avatar?: string };
    isVideoCall: boolean;
  } | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const loadChats = useCallback(async () => {
    try {
      const user = getCurrentUser();
      if (!user) {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
        }
        return;
      }

      const response = await chatApi.getChats();

      // Filter out chats without user (shouldn't happen, but just in case)
      const validChats = response.filter((chat: ChatItemProps) => chat.user !== null);
      
      // Update chats
      setChats(validChats);

      // Update loading state only on initial load
      setLoading((prevLoading) => {
        if (prevLoading) {
          return false;
        }
        return prevLoading;
      });
    } catch (error: any) {
      console.error("Failed to load chats:", error);
      // Only show error toast on initial load, not on polling
      setLoading((prevLoading) => {
        if (prevLoading) {
          toast.error("Failed to load chats");
          return false;
        }
        return prevLoading;
      });
    }
  }, []);

  // Update selected chat when chats are updated (separate effect to avoid render conflicts)
  useEffect(() => {
    if (selectedChat && chats.length > 0) {
      const updatedChat = chats.find((c) => c.id === selectedChat.id);
      if (updatedChat && updatedChat !== selectedChat) {
        setSelectedChat(updatedChat);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chats]);

  // Set up global socket connection for incoming calls
  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    if (!token) return;

    const socket = io(API_BASE_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      console.log('Global socket connected for incoming calls');
    });

    socket.on('incoming-call', (data: {
      callId: string;
      caller: { id: number; name: string; email: string; avatar?: string };
      type: 'direct' | 'group';
      isVideoCall?: boolean;
    }) => {
      console.log('Incoming call received:', data);
      setIncomingCall({
        callId: data.callId,
        caller: {
          id: data.caller.id,
          name: data.caller.name,
          avatar: data.caller.avatar,
        },
        isVideoCall: data.isVideoCall || false,
      });
    });

    socket.on('call-cancelled', (data: { userId: number; callId: string }) => {
      console.log('Call cancelled by caller:', data.userId);
      // Close the incoming call dialog if it's open for this call
      setIncomingCall(prev => {
        if (prev && prev.callId === data.callId) {
          return null;
        }
        return prev;
      });
    });

    // Listen for group user added events
    socket.on('group-user-added', (data: {
      chatId: number;
      addedUsers: Array<{ id: number; name: string }>;
      addedBy: { id: number; name: string };
      shareHistory: boolean;
      systemMessages: Array<{ id: number; content: string; createdAt: string }>;
    }) => {
      console.log('Group user added event:', data);
      // Refresh chats to show updated participant list
      loadChats();
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, [loadChats]);

  useEffect(() => {
    loadChats();

    // Set up polling for new messages (every 3 seconds)
    // Only poll when page is visible
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Page is hidden, stop polling
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      } else {
        // Page is visible, start polling
        if (!pollingIntervalRef.current) {
          pollingIntervalRef.current = setInterval(() => {
            loadChats();
          }, 3000);
        }
      }
    };

    // Start polling
    pollingIntervalRef.current = setInterval(() => {
      loadChats();
    }, 3000);

    // Listen for visibility changes
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Cleanup interval and event listener on unmount
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loadChats]);

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-var(--header-height)-3rem)] w-full items-center justify-center">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
          <p className="text-muted-foreground">Loading chats...</p>
        </div>
      </div>
    );
  }

  const handleAcceptCall = () => {
    // The IncomingCallDialog will handle joining the call
    // No additional action needed here
  };

  const handleRejectCall = () => {
    // Notify the caller that the call was rejected
    if (socketRef.current && incomingCall) {
      socketRef.current.emit('call-rejected', {
        callId: incomingCall.callId,
      });
    }
    setIncomingCall(null);
  };

  return (
    <>
      <div className="flex h-[calc(100vh-var(--header-height)-3rem)] w-full">
        <ChatSidebar chats={chats} onRefresh={loadChats} />
        <div className="grow">
          <ChatContent chats={chats} />
        </div>
      </div>
      
      {incomingCall && (
        <IncomingCallDialog
          isOpen={!!incomingCall}
          callId={incomingCall.callId}
          caller={incomingCall.caller}
          isVideoCall={incomingCall.isVideoCall}
          onAccept={handleAcceptCall}
          onReject={handleRejectCall}
        />
      )}
    </>
  );
}
