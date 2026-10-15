"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  Monitor, 
  Phone, 
  Users,
  Settings,
  Maximize2,
  Minimize2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getCurrentUser } from "@/lib/auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { generateAvatarFallback } from "@/lib/utils";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

interface Participant {
  userId: number;
  socketId: string;
  name?: string;
  avatar?: string;
  isAudioMuted?: boolean;
  isVideoMuted?: boolean;
}

interface WebRTCCallProps {
  callId: string;
  participants: Participant[];
  isAudioOnly?: boolean;
  onClose: () => void;
  localUser?: {
    id: number;
    name: string;
    email: string;
    avatar?: string;
  };
  // For showing "Calling..." state with target user info
  targetUser?: {
    id: number;
    name: string;
    avatar?: string;
  };
}

export function WebRTCCall({
  callId,
  participants: initialParticipants,
  isAudioOnly = false,
  onClose,
  localUser,
  targetUser,
}: WebRTCCallProps) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [participants, setParticipants] = useState<Map<string, Participant>>(new Map());
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(isAudioOnly);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [isMinimized, setIsMinimized] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const createPeerConnectionRef = useRef<((socketId: string) => RTCPeerConnection) | null>(null);
  const socketInitializedRef = useRef<string | null>(null); // Track which callId we've initialized for

  const currentUser = localUser || getCurrentUser();
  const currentUserAvatar =
    currentUser && typeof currentUser === "object"
      ? "avatar" in currentUser
        ? currentUser.avatar
        : "image" in currentUser
          ? currentUser.image
          : undefined
      : undefined;

  // Initialize Socket.io connection
  useEffect(() => {
    // Prevent multiple socket connections for the same callId
    if (socketInitializedRef.current === callId) {
      console.log('Socket already initialized for call:', callId);
      return;
    }

    // If we had a previous socket for a different call, clean it up first
    if (socket && socketInitializedRef.current !== callId) {
      console.log('Cleaning up previous socket connection');
      if (socket.connected) {
        socket.emit('leave-call', { callId: socketInitializedRef.current });
      }
      socket.removeAllListeners();
      socket.disconnect();
      setSocket(null);
    }

    // Mark this callId as initialized
    socketInitializedRef.current = callId;

    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    if (!token) {
      console.error('No auth token found');
      onClose();
      return;
    }

    console.log('Creating new socket connection for call:', callId);
    
    const newSocket = io(API_BASE_URL, {
      auth: {
        token,
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    newSocket.on('connect', () => {
      console.log('Socket connected');
      setConnectionStatus('connected');
      
      // Join the call room
      newSocket.emit('join-call', { callId });
    });

    newSocket.on('disconnect', () => {
      console.log('Socket disconnected');
      setConnectionStatus('disconnected');
    });

    newSocket.on('error', (error: any) => {
      console.error('Socket error:', error);
    });

    // Handle new participant joining
    newSocket.on('user-joined', (data: { userId: number; socketId: string; user: any }) => {
      console.log('User joined:', data);
      setParticipants(prev => {
        const newMap = new Map(prev);
        newMap.set(data.socketId, {
          userId: data.userId,
          socketId: data.socketId,
          name: data.user.name,
          avatar: data.user.image,
        });
        return newMap;
      });

      // Create offer for new participant if we have local stream
      setTimeout(() => {
        if (localStreamRef.current && createPeerConnectionRef.current) {
          const pc = createPeerConnectionRef.current(data.socketId);
          pc.createOffer().then(offer => {
            return pc.setLocalDescription(offer);
          }).then(() => {
            if (newSocket && pc.localDescription) {
              newSocket.emit('webrtc-offer', {
                offer: pc.localDescription.toJSON(),
                targetSocketId: data.socketId,
                callId,
              });
            }
          }).catch(console.error);
        }
      }, 500);
    });

    // Handle participant leaving
    newSocket.on('user-left', (data: { userId: number; socketId: string }) => {
      console.log('User left:', data);
      setParticipants(prev => {
        const newMap = new Map(prev);
        newMap.delete(data.socketId);
        return newMap;
      });

      // Clean up peer connection
      const pc = peerConnectionsRef.current.get(data.socketId);
      if (pc) {
        pc.close();
        peerConnectionsRef.current.delete(data.socketId);
      }
    });

    // Handle existing participants
    newSocket.on('call-participants', async (data: { participants: Array<{ userId: number; socketId: string; user?: any }> }) => {
      console.log('Existing participants:', data);
      
      // Add existing participants to state with their user info
      if (data.participants.length > 0) {
        setParticipants(prev => {
          const newMap = new Map(prev);
          data.participants.forEach(participant => {
            // Only add if not already present
            if (!newMap.has(participant.socketId)) {
              newMap.set(participant.socketId, {
                userId: participant.userId,
                socketId: participant.socketId,
                name: participant.user?.name || `User ${participant.userId}`,
                avatar: participant.user?.image,
              });
            }
          });
          return newMap;
        });

        // Create offers for existing participants if we have local stream
        if (localStreamRef.current && createPeerConnectionRef.current) {
          setTimeout(() => {
            data.participants.forEach(participant => {
              const pc = createPeerConnectionRef.current!(participant.socketId);
              pc.createOffer().then(offer => {
                return pc.setLocalDescription(offer);
              }).then(() => {
                if (newSocket && pc.localDescription) {
                  newSocket.emit('webrtc-offer', {
                    offer: pc.localDescription.toJSON(),
                    targetSocketId: participant.socketId,
                    callId,
                  });
                }
              }).catch(console.error);
            });
          }, 500);
        }
      }
    });

    // Handle WebRTC offer
    newSocket.on('webrtc-offer', async (data: { 
      offer: RTCSessionDescriptionInit; 
      fromSocketId: string; 
      fromUserId: number;
      callId: string;
    }) => {
      console.log('Received offer from:', data.fromSocketId);
      // Handle offer inline to avoid closure issues
      if (createPeerConnectionRef.current) {
        const pc = createPeerConnectionRef.current(data.fromSocketId);
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        // After setLocalDescription, pc.localDescription is an RTCSessionDescription instance with toJSON()
        if (pc.localDescription) {
          newSocket.emit('webrtc-answer', {
            answer: pc.localDescription.toJSON(),
            targetSocketId: data.fromSocketId,
            callId,
          });
        }
      }
    });

    // Handle WebRTC answer
    newSocket.on('webrtc-answer', async (data: { 
      answer: RTCSessionDescriptionInit; 
      fromSocketId: string; 
      fromUserId: number;
      callId: string;
    }) => {
      console.log('Received answer from:', data.fromSocketId);
      const pc = peerConnectionsRef.current.get(data.fromSocketId);
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
      }
    });

    // Handle ICE candidate
    newSocket.on('webrtc-ice-candidate', async (data: { 
      candidate: RTCIceCandidateInit; 
      fromSocketId: string; 
      fromUserId: number;
      callId: string;
    }) => {
      console.log('Received ICE candidate from:', data.fromSocketId);
      const pc = peerConnectionsRef.current.get(data.fromSocketId);
      if (pc && data.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    });

    // Handle user actions (mute, video toggle)
    newSocket.on('user-action', (data: { 
      userId: number; 
      action: string; 
      value: any; 
      socketId: string;
    }) => {
      setParticipants(prev => {
        const newMap = new Map(prev);
        const participant = newMap.get(data.socketId);
        if (participant) {
          if (data.action === 'audio-mute') {
            participant.isAudioMuted = data.value;
          } else if (data.action === 'video-mute') {
            participant.isVideoMuted = data.value;
          }
          newMap.set(data.socketId, participant);
        }
        return newMap;
      });
    });

    // Handle call rejection
    newSocket.on('call-rejected', (data: { userId: number; callId: string }) => {
      console.log('Call rejected by user:', data.userId);
      // Close the call if it was rejected
      onClose();
    });

    // Handle call cancellation (caller cancelled)
    newSocket.on('call-cancelled', (data: { userId: number; callId: string }) => {
      console.log('Call cancelled by user:', data.userId);
      // Close the call if it was cancelled
      onClose();
    });

    setSocket(newSocket);

    return () => {
      // Only cleanup if this is still the current call
      if (socketInitializedRef.current === callId) {
        console.log('Cleaning up socket connection for call:', callId);
        socketInitializedRef.current = null;
        if (newSocket && newSocket.connected) {
          newSocket.emit('leave-call', { callId });
        }
        if (newSocket) {
          newSocket.removeAllListeners();
          newSocket.disconnect();
        }
        setSocket(null);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId]); // Only recreate socket if callId changes

  // Initialize local media stream
  useEffect(() => {
    const initLocalStream = async () => {
      try {
        const constraints: MediaStreamConstraints = {
          audio: true,
          video: !isAudioOnly && {
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        localStreamRef.current = stream;

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        // Join call room is already handled in socket connection effect
      } catch (error: any) {
        console.error('Error accessing media devices:', error);
        
        // Handle specific permission errors
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          // Try to get audio-only stream if video permission was denied
          if (!isAudioOnly) {
            try {
              const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
              localStreamRef.current = audioStream;
              setIsVideoMuted(true);
              // Show warning that video is disabled due to permission
              toast.warning('Camera permission denied. Call will continue with audio only.');
            } catch (audioError: any) {
              // Both audio and video denied
              if (audioError.name === 'NotAllowedError' || audioError.name === 'PermissionDeniedError') {
                setConnectionStatus('disconnected');
                toast.error('Microphone and camera permissions are required for calls. Please enable them in your browser settings.');
                // Close the call after a short delay
                setTimeout(() => {
                  onClose();
                }, 2000);
                return;
              }
              throw audioError;
            }
          } else {
            // Audio-only call but permission denied
            setConnectionStatus('disconnected');
            toast.error('Microphone permission is required for calls. Please enable it in your browser settings.');
            // Close the call after a short delay
            setTimeout(() => {
              onClose();
            }, 2000);
            return;
          }
        } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
          // No devices found
          setConnectionStatus('disconnected');
          toast.error('No camera or microphone found. Please connect a device and try again.');
          setTimeout(() => {
            onClose();
          }, 2000);
        } else {
          // Other errors
          setConnectionStatus('disconnected');
          toast.error('Failed to access media devices. Please check your browser settings.');
        }
      }
    };

    if (connectionStatus === 'connected') {
      initLocalStream();
    }

    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => track.stop());
        screenStreamRef.current = null;
      }
    };
  }, [connectionStatus, isAudioOnly, socket, callId, onClose]);

  // Create peer connection
  const createPeerConnection = useCallback((socketId: string): RTCPeerConnection => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    });

    // Add local stream tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        if (localStreamRef.current) {
          pc.addTrack(track, localStreamRef.current);
        }
      });
    }

    // Handle remote stream
    pc.ontrack = (event) => {
      console.log('Received remote track from:', socketId);
      const [remoteStream] = event.streams;
      remoteStreamsRef.current.set(socketId, remoteStream);
      
      // Force re-render by updating participants state
      setParticipants(prev => {
        const newMap = new Map(prev);
        const participant = newMap.get(socketId);
        if (participant) {
          // Create new object to trigger re-render
          newMap.set(socketId, { ...participant });
        }
        return newMap;
      });
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('webrtc-ice-candidate', {
          candidate: event.candidate.toJSON(),
          targetSocketId: socketId,
          callId,
        });
      }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      console.log(`Connection state with ${socketId}:`, pc.connectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        // Attempt to reconnect or handle error
      }
    };

    peerConnectionsRef.current.set(socketId, pc);
    return pc;
  }, [socket, callId]);

  // Store createPeerConnection in ref for access from socket handlers
  useEffect(() => {
    createPeerConnectionRef.current = createPeerConnection;
  }, [createPeerConnection]);

  // Toggle audio mute
  const toggleAudio = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = isAudioMuted;
      });
    }
    setIsAudioMuted(!isAudioMuted);

    if (socket) {
      socket.emit('user-action', {
        action: 'audio-mute',
        value: !isAudioMuted,
        callId,
      });
    }
  }, [isAudioMuted, socket, callId]);

  // Toggle video mute
  const toggleVideo = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(track => {
        track.enabled = isVideoMuted;
      });
    }
    setIsVideoMuted(!isVideoMuted);

    if (socket) {
      socket.emit('user-action', {
        action: 'video-mute',
        value: !isVideoMuted,
        callId,
      });
    }
  }, [isVideoMuted, socket, callId]);

  // Toggle screen sharing
  const toggleScreenShare = useCallback(async () => {
    try {
      if (isScreenSharing) {
        // Stop screen sharing
        if (screenStreamRef.current) {
          screenStreamRef.current.getTracks().forEach(track => track.stop());
          screenStreamRef.current = null;
        }

        // Switch back to camera
        if (localStreamRef.current) {
          const videoTrack = localStreamRef.current.getVideoTracks()[0];
          if (videoTrack) {
            videoTrack.enabled = true;
          }
        }

        // Replace tracks in all peer connections
        peerConnectionsRef.current.forEach((pc) => {
          if (localStreamRef.current) {
            const videoTrack = localStreamRef.current.getVideoTracks()[0];
            if (videoTrack) {
              const sender = pc.getSenders().find(s => s.track?.kind === 'video');
              if (sender && videoTrack) {
                sender.replaceTrack(videoTrack);
              }
            }
          }
        });

        setIsScreenSharing(false);
      } else {
        // Start screen sharing
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });

        screenStreamRef.current = screenStream;

        // Replace video track in all peer connections
        const videoTrack = screenStream.getVideoTracks()[0];
        peerConnectionsRef.current.forEach((pc) => {
          const sender = pc.getSenders().find(s => s.track?.kind === 'video');
          if (sender && videoTrack) {
            sender.replaceTrack(videoTrack);
          }
        });

        // Update local video
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = screenStream;
        }

        // Handle screen share end
        videoTrack.onended = () => {
          toggleScreenShare();
        };

        setIsScreenSharing(true);
      }
    } catch (error: any) {
      console.error('Error toggling screen share:', error);
      
      // Handle permission errors for screen sharing
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        toast.error('Screen sharing permission denied. Please allow screen sharing in your browser.');
      } else if (error.name === 'NotFoundError' || error.name === 'NotReadableError') {
        toast.error('Unable to start screen sharing. Please check your browser settings.');
      } else {
        toast.error('Failed to start screen sharing. Please try again.');
      }
    }
  }, [isScreenSharing]);

  // End call
  const endCall = useCallback(() => {
    // Stop all tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
    }

    // Close all peer connections
    peerConnectionsRef.current.forEach(pc => pc.close());
    peerConnectionsRef.current.clear();

    // Notify other participants that the call was cancelled
    if (socket) {
      // If we're the caller and no one has joined yet, send cancellation
      const currentParticipants = Array.from(participants.values());
      if (currentParticipants.length === 0) {
        socket.emit('call-cancelled', { callId });
      }
      socket.emit('leave-call', { callId });
    }

    onClose();
  }, [socket, callId, onClose, participants]);

  // Participant video component
  const ParticipantVideo = ({ socketId, participant, remoteStream }: { 
    socketId: string; 
    participant: Participant; 
    remoteStream: MediaStream | undefined;
  }) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
      if (videoRef.current && remoteStream) {
        const video = videoRef.current;
        video.srcObject = remoteStream;
        
        // Handle play() with proper error handling
        const playPromise = video.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              // Playback started successfully
            })
            .catch((error) => {
              // Handle play() errors gracefully
              if (error.name !== 'AbortError' && error.name !== 'NotAllowedError') {
                console.warn('Error playing video:', error);
              }
              // AbortError is expected when video source changes, so we can ignore it
            });
        }
      }
      
      // Cleanup: remove srcObject when component unmounts or stream changes
      return () => {
        if (videoRef.current && videoRef.current.srcObject) {
          videoRef.current.srcObject = null;
        }
      };
    }, [remoteStream]);

    return (
      <div className="relative w-full h-full bg-black rounded-lg overflow-hidden">
        {remoteStream && !participant.isVideoMuted ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted">
            <Avatar className="size-24">
              <AvatarImage src={participant.avatar} />
              <AvatarFallback>{generateAvatarFallback(participant.name || 'User')}</AvatarFallback>
            </Avatar>
          </div>
        )}
        <div className="absolute bottom-2 left-2 bg-black/50 text-white px-2 py-1 rounded text-xs">
          {participant.name || 'User'}
        </div>
        {participant.isAudioMuted && (
          <div className="absolute top-2 right-2">
            <MicOff className="size-4 text-red-500" />
          </div>
        )}
      </div>
    );
  };

  const participantArray = Array.from(participants.values());
  const totalParticipants = participantArray.length + 1; // +1 for local user

  return (
    <div className={cn(
      "relative w-full h-full bg-background flex flex-col",
      isMinimized && "max-w-md"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <Users className="size-4" />
          <span className="text-sm font-medium">
            {totalParticipants} {totalParticipants === 1 ? 'Participant' : 'Participants'}
          </span>
          {connectionStatus === 'connecting' && (
            <span className="text-xs text-muted-foreground">Connecting...</span>
          )}
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setIsMinimized(!isMinimized)}
        >
          {isMinimized ? <Maximize2 className="size-4" /> : <Minimize2 className="size-4" />}
        </Button>
      </div>

      {/* Video Grid */}
      <div className={cn(
        "flex-1 p-4 overflow-auto",
        isMinimized && "hidden"
      )}>
        {participantArray.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center">
              {targetUser ? (
                <>
                  <div className="mb-6 flex justify-center">
                    <div className="relative">
                      <Avatar className="size-32 ring-4 ring-primary/20 animate-pulse">
                        <AvatarImage src={targetUser.avatar} />
                        <AvatarFallback className="text-4xl">
                          {generateAvatarFallback(targetUser.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="absolute inset-0 rounded-full border-4 border-primary/30 animate-ping" />
                    </div>
                  </div>
                  <h3 className="text-xl font-semibold mb-2">{targetUser.name}</h3>
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      Calling
                      <span className="inline-flex gap-0.5">
                        <span 
                          className="inline-block animate-pulse"
                          style={{ animationDelay: '0ms', animationDuration: '1.5s' }}
                        >.</span>
                        <span 
                          className="inline-block animate-pulse"
                          style={{ animationDelay: '300ms', animationDuration: '1.5s' }}
                        >.</span>
                        <span 
                          className="inline-block animate-pulse"
                          style={{ animationDelay: '600ms', animationDuration: '1.5s' }}
                        >.</span>
                      </span>
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
                  <p className="text-muted-foreground">Waiting for participants...</p>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className={cn(
            "grid gap-4 h-full",
            participantArray.length === 1 ? "grid-cols-1" : 
            participantArray.length === 2 ? "grid-cols-2" : 
            "grid-cols-2 lg:grid-cols-3"
          )}>
            {/* Local Video */}
            <div className="relative w-full h-full bg-black rounded-lg overflow-hidden">
              {!isVideoMuted && localVideoRef.current ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-muted">
                  <Avatar className="size-24">
                    <AvatarImage src={currentUserAvatar} />
                    <AvatarFallback>{generateAvatarFallback(currentUser?.name || 'You')}</AvatarFallback>
                  </Avatar>
                </div>
              )}
              <div className="absolute bottom-2 left-2 bg-black/50 text-white px-2 py-1 rounded text-xs">
                You {isAudioMuted && '(Muted)'}
              </div>
            </div>

            {/* Remote Participants */}
            {participantArray.map(participant => (
              <ParticipantVideo
                key={participant.socketId}
                socketId={participant.socketId}
                participant={participant}
                remoteStream={remoteStreamsRef.current.get(participant.socketId)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className={cn(
        "p-4 border-t bg-background",
        isMinimized && "hidden"
      )}>
        <div className="flex items-center justify-center gap-2">
          <Button
            size="icon"
            variant={isAudioMuted ? "destructive" : "outline"}
            onClick={toggleAudio}
            title={isAudioMuted ? "Unmute" : "Mute"}
          >
            {isAudioMuted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
          </Button>

          {!isAudioOnly && (
            <>
              <Button
                size="icon"
                variant={isVideoMuted ? "destructive" : "outline"}
                onClick={toggleVideo}
                title={isVideoMuted ? "Turn on camera" : "Turn off camera"}
              >
                {isVideoMuted ? <VideoOff className="size-4" /> : <Video className="size-4" />}
              </Button>

              <Button
                size="icon"
                variant={isScreenSharing ? "default" : "outline"}
                onClick={toggleScreenShare}
                title={isScreenSharing ? "Stop sharing" : "Share screen"}
              >
                <Monitor className="size-4" />
              </Button>
            </>
          )}

          <Button
            size="icon"
            variant="destructive"
            onClick={endCall}
            title="End call"
          >
            <Phone className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

