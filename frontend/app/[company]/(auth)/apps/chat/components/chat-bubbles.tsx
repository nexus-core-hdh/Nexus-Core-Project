import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { FileIcon, PlayIcon, Check, X } from "lucide-react";
import { ChatMessageProps, ChatItemProps } from "../types";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageStatusIcon, MessageActions } from "@/app/[company]/(auth)/apps/chat/components";
import Image from "next/image";
import { formatMessageTime } from "../utils/formatTime";
import { chatMessageApi } from "@/lib/api";
import { toast } from "sonner";

interface ChatBubbleProps {
  message: ChatMessageProps;
  type?: string;
  chats?: ChatItemProps[];
  onMessageUpdated?: () => void;
}

function TextChatBubble({ message, chats, onMessageUpdated }: ChatBubbleProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content || "");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Check if this is a system message
  const isSystemMessage = message.data && (message.data as any).systemMessage === true;

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleStartEdit = () => {
    setEditContent(message.content || "");
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditContent(message.content || "");
  };

  const handleSaveEdit = async () => {
    if (!editContent.trim()) {
      toast.error("Message cannot be empty");
      return;
    }

    if (editContent.trim() === message.content) {
      setIsEditing(false);
      return;
    }

    try {
      setSaving(true);
      await chatMessageApi.updateMessage(message.id, { content: editContent.trim() });
      setIsEditing(false);
      onMessageUpdated?.();
    } catch (error: any) {
      console.error("Failed to update message:", error);
      toast.error("Failed to update message");
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSaveEdit();
    } else if (e.key === "Escape") {
      handleCancelEdit();
    }
  };

  // Render system message differently
  if (isSystemMessage) {
    return (
      <div className="flex justify-center my-2">
        <div className="bg-muted/50 text-muted-foreground text-xs px-3 py-1.5 rounded-full">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn("max-w-(--breakpoint-sm) space-y-1", {
        "self-end": message.own_message
      })}>
      <div className="flex items-center gap-2">
        {isEditing ? (
          <div className={cn("bg-muted inline-flex items-center gap-2 rounded-md border p-2", {
            "order-1": message.own_message
          })}>
            <Input
              ref={inputRef}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={saving}
              className="min-w-[200px] border-0 bg-transparent focus-visible:ring-0"
            />
            <div className="flex gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={handleSaveEdit}
                disabled={saving || !editContent.trim()}
              >
                <Check className="h-4 w-4 text-green-600" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={handleCancelEdit}
                disabled={saving}
              >
                <X className="h-4 w-4 text-red-600" />
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div
              className={cn("bg-muted inline-flex rounded-md border p-4", {
                "order-1": message.own_message
              })}>
              {message.content}
            </div>
            <div className={cn({ "order-2": !message.own_message })}>
              <MessageActions 
                message={message} 
                chats={chats} 
                onMessageUpdated={onMessageUpdated}
                onEdit={handleStartEdit}
              />
            </div>
          </>
        )}
      </div>
      <div
        className={cn("flex items-center gap-2", {
          "justify-end": message.own_message
        })}>
        <time
          className={cn("text-muted-foreground mt-1 flex items-center gap-1 text-xs", {
            "justify-end": message.own_message
          })}>
          {formatMessageTime(message.createdAt) || "Just now"}
          {message.isEdited && (
            <span className="text-muted-foreground/70 italic">(edited)</span>
          )}
        </time>
        {message.own_message && !isEditing && <MessageStatusIcon status={message.read ? "read" : "sent"} />}
      </div>
    </div>
  );
}

function FileChatBubble({ message, chats, onMessageUpdated }: ChatBubbleProps) {
  return (
    <div
      className={cn("max-w-(--breakpoint-sm) space-y-1", {
        "self-end": message.own_message
      })}>
      <div className="flex items-center gap-2">
        <div
          className={cn("bg-muted inline-flex items-start rounded-md border p-4", {
            "order-1": message.own_message
          })}>
          <FileIcon className="me-4 mt-1 size-8 opacity-50" strokeWidth={1.5} />
          <div className="flex flex-col gap-2">
            <div className="text-sm">
              {message.data?.file_name || message.data?.name}
              <span className="text-muted-foreground ms-2 text-sm">({message.data?.size})</span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => window.open(message.data?.path, '_blank')}>
                Download
              </Button>
              <Button variant="outline" size="sm" onClick={() => window.open(message.data?.path, '_blank')}>
                Preview
              </Button>
            </div>
          </div>
        </div>
        <div className={cn({ "order-2": !message.own_message })}>
          <MessageActions message={message} chats={chats} onMessageUpdated={onMessageUpdated} />
        </div>
      </div>
      <div
        className={cn("flex items-center gap-2", {
          "justify-end": message.own_message
        })}>
        <time
          className={cn("text-muted-foreground mt-1 flex items-center text-xs", {
            "justify-end": message.own_message
          })}>
          {formatMessageTime(message.createdAt) || "Just now"}
        </time>
        {message.own_message && <MessageStatusIcon status={message.read ? "read" : "sent"} />}
      </div>
    </div>
  );
}

function VideoChatBubble({ message, chats, onMessageUpdated }: ChatBubbleProps) {
  return (
    <div
      className={cn("max-w-(--breakpoint-sm) space-y-1", {
        "self-end": message.own_message
      })}>
      <div className="flex items-center gap-4">
        <div
          style={{
            backgroundImage: `url(${message?.data?.cover || message?.data?.path})`
          }}
          className={cn(
            "relative order-1 flex aspect-4/3 w-52 shrink-0 cursor-pointer items-center justify-center self-start rounded-lg bg-cover transition-opacity hover:opacity-90"
          )}>
          <PlayIcon className="size-8 text-white/80" />
          <div className="absolute end-2 top-2 text-xs font-semibold text-white/60">
            {message?.data?.duration}
          </div>
        </div>
        <div className={cn({ "order-2": !message.own_message })}>
          <MessageActions message={message} chats={chats} onMessageUpdated={onMessageUpdated} />
        </div>
      </div>
      <div
        className={cn("flex items-center gap-2", {
          "justify-end": message.own_message
        })}>
        <time
          className={cn("text-muted-foreground mt-1 flex items-center text-xs", {
            "justify-end": message.own_message
          })}>
          {formatMessageTime(message.createdAt) || "Just now"}
        </time>
        {message.own_message && <MessageStatusIcon status={message.read ? "read" : "sent"} />}
      </div>
    </div>
  );
}

function SoundChatBubble({ message, chats, onMessageUpdated }: ChatBubbleProps) {
  return (
    <div
      className={cn("max-w-(--breakpoint-sm)", {
        "self-end": message.own_message
      })}>
      <div className="flex items-center gap-2">
        <div
          className={cn("bg-muted inline-flex gap-4 rounded-md p-4", {
            "relative order-1 flex items-center justify-center": message.own_message
          })}>
          {message.content}
          <audio id={`audio-${message.id}`} className="block w-80" controls>
            <source src={message?.data?.path} type="audio/mpeg" />
          </audio>
        </div>
        <div className={cn({ "order-2": !message.own_message })}>
          <MessageActions message={message} chats={chats} onMessageUpdated={onMessageUpdated} />
        </div>
      </div>
      <div
        className={cn("flex items-center gap-2", {
          "justify-end": message.own_message
        })}>
        <time
          className={cn("text-muted-foreground mt-1 flex items-center text-sm", {
            "justify-end": message.own_message
          })}>
          {formatMessageTime(message.createdAt) || "Just now"}
        </time>
        {message.own_message && <MessageStatusIcon status={message.read ? "read" : "sent"} />}
      </div>
    </div>
  );
}

function ImageChatBubble({ message, chats, onMessageUpdated }: ChatBubbleProps) {
  const images_limit = 4;
  // Support both formats: array of images or single image path
  const imagesArray = message?.data?.images ?? [];
  const singleImagePath = message?.data?.path;
  
  // If we have a single image path, convert it to array format
  const images = singleImagePath 
    ? [singleImagePath] 
    : imagesArray;
  
  const images_with_limit = images.slice(0, images_limit);

  return (
    <div
      className={cn("max-w-(--breakpoint-sm)", {
        "self-end": message.own_message
      })}>
      <div className="flex items-center gap-2">
        <div
          className={cn("bg-muted inline-flex gap-4 rounded-md border p-4", {
            "relative order-1 flex items-center justify-center": message.own_message
          })}>
          {message.content && message.content !== "Voice message" && (
            <div className="mb-2 text-sm">{message.content}</div>
          )}
          {images.length > 0 && (
            <div
              className={cn("grid gap-2", {
                "grid-cols-1": images.length === 1,
                "grid-cols-2": images.length > 1
              })}>
              {images_with_limit.map((image, key) => (
                <figure
                  className="relative cursor-pointer overflow-hidden rounded-lg transition-opacity hover:opacity-90"
                  key={key}>
                  <Image
                    src={image}
                    className="aspect-4/3 object-cover"
                    width={200}
                    height={200}
                    alt={message.content || "Image"}
                    unoptimized
                  />
                  {key + 1 === images_limit && images.length > images_limit && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-3xl font-semibold text-white">
                      +{images.length - images_with_limit.length}
                    </div>
                  )}
                </figure>
              ))}
            </div>
          )}
        </div>
        <div className={cn({ "order-2": !message.own_message })}>
          <MessageActions message={message} chats={chats} onMessageUpdated={onMessageUpdated} />
        </div>
      </div>
      <div
        className={cn("mt-1 flex items-center gap-2", {
          "justify-end": message.own_message
        })}>
        <time
          className={cn("text-muted-foreground mt-1 flex items-center text-xs", {
            "justify-end": message.own_message
          })}>
          {formatMessageTime(message.createdAt) || "Just now"}
        </time>
        {message.own_message && <MessageStatusIcon status={message.read ? "read" : "sent"} />}
      </div>
    </div>
  );
}

export function ChatBubble({ message, type, chats, onMessageUpdated }: ChatBubbleProps) {
  switch (type) {
    case "text":
      return <TextChatBubble message={message} chats={chats} onMessageUpdated={onMessageUpdated} />;
    case "video":
      return <VideoChatBubble message={message} chats={chats} onMessageUpdated={onMessageUpdated} />;
    case "sound":
    case "audio":
      return <SoundChatBubble message={message} chats={chats} onMessageUpdated={onMessageUpdated} />;
    case "image":
      return <ImageChatBubble message={message} chats={chats} onMessageUpdated={onMessageUpdated} />;
    case "file":
      return <FileChatBubble message={message} chats={chats} onMessageUpdated={onMessageUpdated} />;
    default:
      return <TextChatBubble message={message} chats={chats} onMessageUpdated={onMessageUpdated} />;
  }
}
