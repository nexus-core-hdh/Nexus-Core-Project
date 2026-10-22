"use client";

import React, { useState } from "react";
import { ArrowLeft, Ellipsis, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateAvatarFallback } from "@/lib/utils";
import useChatStore from "@/app/[company]/(auth)/apps/chat/useChatStore";
import { chatApi } from "@/lib/api";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  CallDialog,
  ChatUserDropdown,
  VideoCallDialog,
  AddUsersDialog
} from "@/app/[company]/(auth)/apps/chat/components";
import { Avatar, AvatarFallback, AvatarImage, AvatarIndicator } from "@/components/ui/avatar";
import { UserPropsTypes } from "@/app/[company]/(auth)/apps/chat/types";

interface ChatHeaderProps {
  user?: UserPropsTypes | null;
  chatName?: string;
}

export function ChatHeader({ user, chatName }: ChatHeaderProps) {
  const { selectedChat, setSelectedChat } = useChatStore();
  const [addUsersOpen, setAddUsersOpen] = useState(false);
  const [existingUserIds, setExistingUserIds] = useState<number[]>([]);
  const isGroupChat = selectedChat?.type === "GROUP";

  // Fetch participants when group chat is selected
  React.useEffect(() => {
    if (isGroupChat && selectedChat) {
      const fetchParticipants = async () => {
        try {
          const chatData = await chatApi.getChatById(selectedChat.id);
          if (chatData.participants) {
            setExistingUserIds(chatData.participants.map((p: any) => p.userId || p.user?.id));
          }
        } catch (error) {
          console.error("Failed to fetch participants:", error);
        }
      };
      fetchParticipants();
    }
  }, [isGroupChat, selectedChat?.id]);

  return (
    <>
      <div className="flex justify-between gap-4 lg:px-4">
        <div className="flex gap-4">
          <Button
            size="sm"
            variant="outline"
            className="flex size-10 p-0 lg:hidden"
            onClick={() => setSelectedChat(null)}>
            <ArrowLeft />
          </Button>
          {isGroupChat ? (
            <>
              <Avatar className="overflow-visible lg:size-10">
                <AvatarFallback>{generateAvatarFallback(chatName || "Group")}</AvatarFallback>
              </Avatar>
              <div className="flex flex-col gap-1">
                <span className="text-sm font-semibold">{chatName || "Group Chat"}</span>
                <span className="text-muted-foreground text-xs">Group</span>
              </div>
            </>
          ) : (
            <>
              <Avatar className="overflow-visible lg:size-10">
                <AvatarImage src={`${user?.avatar}`} alt="avatar image" />
                <AvatarIndicator variant={user?.online_status} />
                <AvatarFallback>{generateAvatarFallback(user?.name || "")}</AvatarFallback>
              </Avatar>
              <div className="flex flex-col gap-1">
                <span className="text-sm font-semibold">{user?.name || "User"}</span>
                {user?.online_status == "success" ? (
                  <span className="text-xs text-green-500">Online</span>
                ) : (
                  <span className="text-muted-foreground text-xs">{user?.last_seen || ""}</span>
                )}
              </div>
            </>
          )}
        </div>
        <div className="flex gap-2">
          {isGroupChat && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setAddUsersOpen(true)}
                  >
                    <UserPlus className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Add Users</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <div className="hidden lg:flex lg:gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <VideoCallDialog 
                      user={selectedChat?.type === "GROUP" ? undefined : (user ?? undefined)}
                      chatId={selectedChat?.type === "GROUP" ? selectedChat.id : undefined}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {selectedChat?.type === "GROUP" ? "Start Group Video Call" : "Start Video Chat"}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <CallDialog 
                      user={selectedChat?.type === "GROUP" ? undefined : (user ?? undefined)}
                      chatId={selectedChat?.type === "GROUP" ? selectedChat.id : undefined}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {selectedChat?.type === "GROUP" ? "Start Group Call" : "Start Call"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <ChatUserDropdown>
            <Button size="icon" variant="ghost">
              <Ellipsis />
            </Button>
          </ChatUserDropdown>
        </div>
      </div>
      {isGroupChat && selectedChat && (
        <AddUsersDialog
          open={addUsersOpen}
          onOpenChange={setAddUsersOpen}
          chatId={selectedChat.id}
          existingUserIds={existingUserIds}
          onUsersAdded={() => {
            // Refresh chat list or reload messages
            window.location.reload(); // Simple refresh for now
          }}
        />
      )}
    </>
  );
}
