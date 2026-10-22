"use client";

import { useState, useRef, useEffect } from "react";
import { Mic, Paperclip, PlusCircleIcon, SendIcon, SmileIcon, X, StopCircle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import useChatStore from "@/app/[company]/(auth)/apps/chat/useChatStore";
import { chatMessageApi, uploadApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import dynamic from "next/dynamic";
import { Theme as EmojiTheme, type EmojiClickData } from "emoji-picker-react";

// Dynamically import EmojiPicker to avoid SSR issues
const EmojiPicker = dynamic(
  () => import("emoji-picker-react").then((mod) => mod.default),
  { ssr: false }
);

export function ChatFooter({ onSendMessage }: { onSendMessage?: () => void }) {
  const { selectedChat } = useChatStore();
  const { resolvedTheme } = useTheme();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Handle emoji selection
  const onEmojiClick = (emojiData: EmojiClickData) => {
    setMessage(prev => prev + emojiData.emoji);
    setShowEmojiPicker(false);
  };

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check file size (max 3MB)
      const maxSize = 3 * 1024 * 1024; // 3MB
      if (file.size > maxSize) {
        toast.error("File size should be up to 3MB");
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        return;
      }
      setSelectedFile(file);
    }
  };

  // Remove selected file
  const removeFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Send file message
  const sendFile = async () => {
    if (!selectedChat || !selectedFile) return;

    try {
      setSending(true);
      const user = getCurrentUser();
      if (!user) {
        toast.error("Please log in to send messages");
        return;
      }

      // Upload file
      const uploadResult = await uploadApi.uploadSingle(selectedFile, user.id);
      
      // Determine file type
      let messageType: 'file' | 'image' | 'video' = 'file';
      if (selectedFile.type.startsWith('image/')) {
        messageType = 'image';
      } else if (selectedFile.type.startsWith('video/')) {
        messageType = 'video';
      }

      // Send message with file
      await chatMessageApi.sendMessage(selectedChat.id, {
        content: selectedFile.name,
        type: messageType,
        data: {
          path: uploadResult.url || uploadResult.path,
          name: selectedFile.name,
          size: selectedFile.size,
          type: selectedFile.type,
        },
      });

      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      if (onSendMessage) {
        onSendMessage();
      }
      toast.success("File sent successfully");
    } catch (error: any) {
      console.error("Failed to send file:", error);
      const errorMessage = error.message || "Failed to send file";
      toast.error(errorMessage);
    } finally {
      setSending(false);
    }
  };

  // Start voice recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await sendVoiceMessage(audioBlob);
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      // Start timer
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (error: any) {
      console.error("Error starting recording:", error);
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        toast.error("Microphone permission denied. Please enable it in your browser settings.");
      } else {
        toast.error("Failed to start recording");
      }
    }
  };

  // Stop voice recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
    }
  };

  // Send voice message
  const sendVoiceMessage = async (audioBlob: Blob) => {
    if (!selectedChat) return;

    try {
      setSending(true);
      const user = getCurrentUser();
      if (!user) {
        toast.error("Please log in to send messages");
        return;
      }

      // Convert blob to file
      const audioFile = new File([audioBlob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
      
      // Check file size (max 3MB)
      const maxSize = 3 * 1024 * 1024; // 3MB
      if (audioFile.size > maxSize) {
        toast.error("Voice message size should be up to 3MB");
        setSending(false);
        return;
      }
      
      // Upload audio file
      const uploadResult = await uploadApi.uploadSingle(audioFile, user.id);

      // Send message with audio
      await chatMessageApi.sendMessage(selectedChat.id, {
        content: "Voice message",
        type: "audio",
        data: {
          path: uploadResult.url || uploadResult.path,
          name: audioFile.name,
          size: audioFile.size,
          type: audioFile.type,
          duration: recordingTime, // Duration in seconds
        },
      });

      setRecordingTime(0);
      if (onSendMessage) {
        onSendMessage();
      }
      toast.success("Voice message sent successfully");
    } catch (error: any) {
      console.error("Failed to send voice message:", error);
      const errorMessage = error.message || "Failed to send voice message";
      toast.error(errorMessage);
    } finally {
      setSending(false);
    }
  };

  // Format recording time
  const formatRecordingTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
      if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.stop();
      }
    };
  }, [isRecording]);

  const handleSend = async () => {
    if (!selectedChat || (!message.trim() && !selectedFile)) return;

    // If file is selected, send file instead
    if (selectedFile) {
      await sendFile();
      return;
    }

    if (!message.trim()) return;

    try {
      setSending(true);
      const user = getCurrentUser();
      if (!user) {
        toast.error("Please log in to send messages");
        return;
      }

      await chatMessageApi.sendMessage(selectedChat.id, {
        content: message.trim(),
        type: "text",
      });

      setMessage("");
      if (onSendMessage) {
        onSendMessage();
      }
    } catch (error: any) {
      console.error("Failed to send message:", error);
      toast.error("Failed to send message");
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="lg:px-4">
      {/* File preview */}
      {selectedFile && (
        <div className="mb-2 flex items-center gap-2 rounded-md border bg-muted p-2">
          <div className="flex-1">
            <p className="text-sm font-medium">{selectedFile.name}</p>
            <p className="text-xs text-muted-foreground">
              {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={removeFile}
            className="h-6 w-6"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Recording indicator */}
      {isRecording && (
        <div className="mb-2 flex items-center gap-2 rounded-md border border-red-500 bg-red-50 p-2 dark:bg-red-950">
          <div className="flex-1">
            <p className="text-sm font-medium text-red-600 dark:text-red-400">
              Recording... {formatRecordingTime(recordingTime)}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={stopRecording}
            className="h-6 w-6 text-red-600 dark:text-red-400"
          >
            <StopCircle className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="bg-muted relative flex items-center rounded-md border">
        <Input
          type="text"
          className="h-14 border-transparent bg-white pe-32 text-base! shadow-transparent! ring-transparent! lg:pe-56"
          placeholder={isRecording ? "Recording voice message..." : selectedFile ? "File selected, click send..." : "Enter message..."}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          disabled={!selectedChat || sending || isRecording}
        />
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileSelect}
          accept="*/*"
        />
        <div className="absolute end-4 flex items-center">
          <div className="block lg:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="size-11 rounded-full p-0" disabled={!selectedChat || sending || isRecording}>
                  <PlusCircleIcon className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => setShowEmojiPicker(true)}>
                  Emoji
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                  Add File
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={sending}
                >
                  {isRecording ? "Stop Recording" : "Send Voice"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="hidden lg:flex lg:items-center lg:gap-1">
            <TooltipProvider>
              <Tooltip>
                <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
                  <PopoverTrigger asChild>
                    <TooltipTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="rounded-full"
                        disabled={!selectedChat || sending || isRecording}
                      >
                        <SmileIcon />
                      </Button>
                    </TooltipTrigger>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <EmojiPicker
                      onEmojiClick={onEmojiClick}
                      autoFocusSearch={false}
                      theme={resolvedTheme === "dark" ? EmojiTheme.DARK : EmojiTheme.LIGHT}
                    />
                  </PopoverContent>
                </Popover>
                <TooltipContent side="top">Emoji</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="rounded-full"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!selectedChat || sending || isRecording}
                  >
                    <Paperclip />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Select File</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className={cn(
                      "rounded-full",
                      isRecording && "text-red-600 dark:text-red-400"
                    )}
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={!selectedChat || sending}
                  >
                    {isRecording ? <StopCircle /> : <Mic />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {isRecording ? "Stop Recording" : "Send Voice"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Button 
            variant="outline" 
            className="ms-3"
            onClick={handleSend}
            disabled={!selectedChat || (!message.trim() && !selectedFile) || sending || isRecording}
          >
            {sending ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <>
                <span className="hidden lg:inline">Send</span> <SendIcon className="inline lg:hidden" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
