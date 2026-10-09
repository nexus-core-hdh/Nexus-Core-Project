"use client";

import { useEffect, useRef, useState } from "react";
import useChatStore from "@/app/[company]/(auth)/apps/chat/useChatStore";
import { ChatMessageProps, ChatItemProps } from "../types";
import { chatApi, chatMessageApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";

import {
  ChatHeader,
  ChatBubble,
  ChatFooter,
  UserDetailSheet
} from "@/app/[company]/(auth)/apps/chat/components";
import Image from "next/image";

export function ChatContent({ chats = [] }: { chats?: ChatItemProps[] }) {
  const { selectedChat, setSelectedChat } = useChatStore();
  const [messages, setMessages] = useState<ChatMessageProps[]>([]);
  const [loading, setLoading] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastMessageCountRef = useRef<number>(0);

  useEffect(() => {
    if (selectedChat) {
      // Reset message count when chat changes
      lastMessageCountRef.current = 0;
      loadMessages();

      // Set up polling for new messages in the active chat (every 2 seconds)
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
              loadMessages(true); // Pass true to indicate it's a polling call
            }, 2000);
          }
        }
      };

      // Start polling
      pollingIntervalRef.current = setInterval(() => {
        loadMessages(true); // Pass true to indicate it's a polling call
      }, 2000);

      // Listen for visibility changes
      document.addEventListener("visibilitychange", handleVisibilityChange);

      // Cleanup interval and event listener when chat changes or component unmounts
      return () => {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
        }
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      };
    } else {
      setMessages([]);
      lastMessageCountRef.current = 0;
      // Clear polling when no chat is selected
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    }
  }, [selectedChat?.id]);

  // Auto-scroll to bottom when messages change or chat changes
  useEffect(() => {
    if (scrollContainerRef.current && messages.length > 0) {
      // Use setTimeout to ensure DOM is updated
      setTimeout(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
        }
      }, 100);
    }
  }, [messages, selectedChat?.id]);

  const loadMessages = async (isPolling = false) => {
    if (!selectedChat) return;

    try {
      // Only show loading spinner on initial load, not on polling
      if (!isPolling) {
        setLoading(true);
      }
      
      const user = getCurrentUser();
      if (!user) return;

      const response = await chatMessageApi.getMessages(selectedChat.id, {
        limit: 100,
      });

      // Debug: Log first message to check createdAt
      if (response.length > 0 && !isPolling) {
        console.log("First message sample:", response[0]);
      }

      // Check if there are new messages
      const hasNewMessages = response.length > lastMessageCountRef.current;
      
      // Only update if there are new messages or it's the initial load
      if (hasNewMessages || !isPolling) {
        setMessages(response);
        lastMessageCountRef.current = response.length;

        // Mark messages as read
        await chatMessageApi.markMessagesAsRead(selectedChat.id);

        // Update selected chat with messages
        setSelectedChat({
          ...selectedChat,
          messages: response,
        });

        // Scroll to bottom after messages are loaded (only on initial load)
        if (!isPolling && scrollContainerRef.current) {
          setTimeout(() => {
            if (scrollContainerRef.current) {
              scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
            }
          }, 100);
        }
      }
    } catch (error: any) {
      console.error("Failed to load messages:", error);
      // Only show error toast on initial load, not on polling
      if (!isPolling) {
        toast.error("Failed to load messages");
      }
    } finally {
      if (!isPolling) {
        setLoading(false);
      }
    }
  };

  if (!selectedChat) {
    return (
      <figure className="hidden h-full items-center justify-center text-center lg:flex">
        <Image
          width={200}
          height={200}
          className="block max-w-sm dark:hidden"
          src={`/not-selected-chat.svg`}
          alt="shadcn/ui"
          unoptimized
        />
        <Image
          width={200}
          height={200}
          className="hidden max-w-sm dark:block"
          src={`/not-selected-chat-light.svg`}
          alt="shadcn/ui"
        />
      </figure>
    );
  }

  return (
    <div className="bg-background fixed inset-0 z-50 flex h-full flex-col p-4 lg:relative lg:z-10 lg:bg-transparent lg:p-0">
      <ChatHeader user={selectedChat.user} chatName={selectedChat.name} />

      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto lg:px-4">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <div ref={messagesContainerRef}>
            <div className="flex flex-col items-start space-y-10 py-8">
              {messages.length > 0 ? (
                messages.map((item: ChatMessageProps, key) => (
                  <ChatBubble 
                    message={item} 
                    type={item.type} 
                    key={item.id || key}
                    chats={chats}
                    onMessageUpdated={loadMessages}
                  />
                ))
              ) : (
                <div className="text-muted-foreground w-full text-center text-sm">No messages yet</div>
              )}
            </div>
          </div>
        )}
      </div>

      <ChatFooter onSendMessage={loadMessages} />

      <UserDetailSheet user={selectedChat.user} />
    </div>
  );
}
