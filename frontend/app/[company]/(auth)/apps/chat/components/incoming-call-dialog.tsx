"use client";

import React, { useEffect, useState, useRef } from "react";
import { Phone, PhoneOff, Video, VideoOff } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { generateAvatarFallback } from "@/lib/utils";
import { WebRTCCall } from "./webrtc-call";
import { getCurrentUser } from "@/lib/auth";

interface IncomingCallDialogProps {
  isOpen: boolean;
  callId: string;
  caller: {
    id: number;
    name: string;
    avatar?: string;
  };
  isVideoCall: boolean;
  onAccept: () => void;
  onReject: () => void;
}

export function IncomingCallDialog({
  isOpen,
  callId,
  caller,
  isVideoCall,
  onAccept,
  onReject,
}: IncomingCallDialogProps) {
  const [callAccepted, setCallAccepted] = useState(false);
  const currentUser = getCurrentUser();
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isPlayingRef = useRef(false);

  // Generate a Microsoft Teams-like ringtone using Web Audio API
  const playRingtone = () => {
    // Prevent multiple instances
    if (isPlayingRef.current) {
      return;
    }

    try {
      isPlayingRef.current = true;
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;

      const gainNode = audioContext.createGain();
      gainNode.connect(audioContext.destination);
      gainNodeRef.current = gainNode;

      // Microsoft Teams-like melodic ringtone pattern
      // Sequence: C5 - E5 - G5 - C6 (pleasant ascending tones)
      const playMelody = () => {
        if (!audioContextRef.current || !gainNodeRef.current) return;

        const ctx = audioContextRef.current;
        const gain = gainNodeRef.current;
        const baseTime = ctx.currentTime;
        const noteDuration = 0.15;
        const noteGap = 0.05;

        // Frequencies for a pleasant chord progression (C major scale)
        const frequencies = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6

        frequencies.forEach((freq, index) => {
          const startTime = baseTime + (index * (noteDuration + noteGap));
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, startTime);
          
          // Create a gain node for this note with smooth envelope
          const noteGain = ctx.createGain();
          osc.connect(noteGain);
          noteGain.connect(gain);
          
          // Smooth attack and release
          noteGain.gain.setValueAtTime(0, startTime);
          noteGain.gain.linearRampToValueAtTime(0.2, startTime + 0.02); // Quick fade in
          noteGain.gain.linearRampToValueAtTime(0.2, startTime + noteDuration - 0.02); // Hold
          noteGain.gain.linearRampToValueAtTime(0, startTime + noteDuration); // Fade out
          
          osc.start(startTime);
          osc.stop(startTime + noteDuration);
        });
      };

      // Play the melody pattern (similar to Teams: plays melody, then pause, repeat)
      const playPattern = () => {
        playMelody();
      };

      // Start immediately and repeat every 3 seconds (Teams-like timing)
      playPattern();
      intervalRef.current = setInterval(playPattern, 3000);
    } catch (error) {
      console.warn('Could not play ringtone:', error);
      isPlayingRef.current = false;
    }
  };

  const stopRingtone = () => {
    if (!isPlayingRef.current) {
      return; // Already stopped
    }

    isPlayingRef.current = false;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Fade out smoothly
    if (gainNodeRef.current && audioContextRef.current) {
      try {
        const now = audioContextRef.current.currentTime;
        gainNodeRef.current.gain.cancelScheduledValues(now);
        gainNodeRef.current.gain.linearRampToValueAtTime(0, now + 0.1);
        
        setTimeout(() => {
          if (audioContextRef.current) {
            audioContextRef.current.close().catch(() => {
              // Context might already be closed
            });
            audioContextRef.current = null;
          }
          gainNodeRef.current = null;
        }, 150);
      } catch (e) {
        // Ignore errors during cleanup
      }
    } else if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {
        // Context might already be closed
      });
      audioContextRef.current = null;
    }
  };

  // Play ringtone when call comes in - continue until accepted or rejected
  useEffect(() => {
    if (isOpen && !callAccepted) {
      // Start playing the ringtone
      playRingtone();
    } else {
      // Stop when dialog closes or call is accepted
      stopRingtone();
    }

    // Cleanup on unmount or when conditions change
    return () => {
      stopRingtone();
    };
  }, [isOpen, callAccepted]);

  useEffect(() => {
    if (!isOpen) {
      setCallAccepted(false);
      stopRingtone();
    }
  }, [isOpen]);

  const handleAccept = () => {
    stopRingtone();
    setCallAccepted(true);
    onAccept();
  };

  const handleReject = () => {
    stopRingtone();
    onReject();
  };

  if (callAccepted) {
    return (
      <Dialog open={isOpen} onOpenChange={() => {}}>
        <DialogContent className="max-w-[95vw] h-[95vh] p-0">
          <VisuallyHidden>
            <DialogTitle>
              {isVideoCall ? `Video Call with ${caller.name}` : `Audio Call with ${caller.name}`}
            </DialogTitle>
          </VisuallyHidden>
          <WebRTCCall
            callId={callId}
            participants={[{
              userId: caller.id,
              socketId: '',
              name: caller.name,
              avatar: caller.avatar,
            }]}
            isAudioOnly={!isVideoCall}
            onClose={onReject}
            localUser={currentUser ? {
              id: currentUser.id,
              name: currentUser.name || 'User',
              email: currentUser.email || '',
              avatar: currentUser.image,
            } : undefined}
          />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md">
        <VisuallyHidden>
          <DialogTitle>
            {isVideoCall ? `Incoming Video Call from ${caller.name}` : `Incoming Audio Call from ${caller.name}`}
          </DialogTitle>
        </VisuallyHidden>
        <div className="flex flex-col items-center gap-6 p-6">
          <div className="flex flex-col items-center gap-4">
            <Avatar className="size-24">
              <AvatarImage src={caller.avatar} />
              <AvatarFallback>{generateAvatarFallback(caller.name)}</AvatarFallback>
            </Avatar>
            <div className="text-center">
              <h3 className="text-lg font-semibold">{caller.name}</h3>
              <p className="text-sm text-muted-foreground">
                {isVideoCall ? 'Incoming video call' : 'Incoming audio call'}
              </p>
            </div>
          </div>

          <div className="flex gap-4 w-full">
            <Button
              size="lg"
              variant="destructive"
              className="flex-1"
              onClick={handleReject}
            >
              <PhoneOff className="size-5 mr-2" />
              Decline
            </Button>
            <Button
              size="lg"
              variant="default"
              className="flex-1"
              onClick={handleAccept}
            >
              {isVideoCall ? (
                <>
                  <Video className="size-5 mr-2" />
                  Accept
                </>
              ) : (
                <>
                  <Phone className="size-5 mr-2" />
                  Accept
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

