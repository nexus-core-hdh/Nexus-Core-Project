"use client";

import { useEffect, useRef, useState } from "react";
import { JitsiMeeting } from "@jitsi/react-sdk";
import { X, Mic, MicOff, Video, VideoOff, Monitor, MonitorOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface JitsiMeetProps {
  roomName: string;
  userDisplayName: string;
  userEmail?: string;
  onClose: () => void;
  isAudioOnly?: boolean;
  startWithAudioMuted?: boolean;
  startWithVideoMuted?: boolean;
}

export function JitsiMeet({
  roomName,
  userDisplayName,
  userEmail,
  onClose,
  isAudioOnly = false,
  startWithAudioMuted = false,
  startWithVideoMuted = false,
}: JitsiMeetProps) {
  const [isAudioMuted, setIsAudioMuted] = useState(startWithAudioMuted);
  const [isVideoMuted, setIsVideoMuted] = useState(startWithVideoMuted);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const apiRef = useRef<any>(null);

  const handleApiReady = (api: any) => {
    apiRef.current = api;
    
    // Set user display name and email immediately
    if (userDisplayName) {
      api.executeCommand("displayName", userDisplayName);
    }
    if (userEmail) {
      api.executeCommand("email", userEmail);
    }
    
    // Disable lobby/prejoin authentication
    api.executeCommand("toggleLobby", false);
    
    // Set initial audio/video state
    if (startWithAudioMuted) {
      api.executeCommand("toggleAudio");
    }
    if (startWithVideoMuted || isAudioOnly) {
      api.executeCommand("toggleVideo");
    }

    // Force join the meeting (bypass any prejoin checks)
    try {
      api.executeCommand("subject", "");
    } catch (e) {
      // Ignore errors
    }
  };

  const toggleAudio = () => {
    if (apiRef.current) {
      apiRef.current.executeCommand("toggleAudio");
      setIsAudioMuted(!isAudioMuted);
    }
  };

  const toggleVideo = () => {
    if (apiRef.current) {
      apiRef.current.executeCommand("toggleVideo");
      setIsVideoMuted(!isVideoMuted);
    }
  };

  const toggleScreenShare = () => {
    if (apiRef.current) {
      if (isScreenSharing) {
        apiRef.current.executeCommand("toggleShareScreen");
      } else {
        apiRef.current.executeCommand("toggleShareScreen");
      }
      setIsScreenSharing(!isScreenSharing);
    }
  };

  const handleLeave = () => {
    if (apiRef.current) {
      apiRef.current.dispose();
    }
    onClose();
  };

  const config = {
    startWithAudioMuted,
    startWithVideoMuted: startWithVideoMuted || isAudioOnly,
    enableWelcomePage: false,
    enableClosePage: false,
    disableDeepLinking: true,
    // Completely disable prejoin page
    prejoinPageEnabled: false,
    enablePrejoinPage: false,
    // Disable authentication and third-party logins
    disableThirdPartyRequests: true,
    enableInsecureRoomNameWarning: false,
    // Disable invite functions
    disableInviteFunctions: true,
    // Audio/video settings
    enableNoAudioDetection: false,
    enableNoisyMicDetection: false,
    enableTalkWhileMuted: false,
    enableRemb: true,
    enableTcc: true,
    useStunTurn: true,
    // Auto-join settings
    enableLayerSuspension: true,
    channelLastN: -1,
    // Disable login prompts and stats
    enableEmailInStats: false,
    enableDisplayNameInStats: false,
    // Toolbar buttons
    toolbarButtons: [
      "microphone",
      "camera",
      "closedcaptions",
      "desktop",
      "fullscreen",
      "fodeviceselection",
      "hangup",
      "chat",
      "settings",
      "videoquality",
      "filmstrip",
      "feedback",
      "stats",
      "shortcuts",
    ],
    disableRemoteMute: false,
    // Additional settings to prevent authentication prompts
    hosts: {
      domain: "meet.jit.si",
      muc: "conference.meet.jit.si",
    },
    // Disable authentication UI
    enableUserRolesBasedOnToken: false,
    enableLobbyChat: false,
  };

  const interfaceConfig = {
    TOOLBAR_BUTTONS: [
      "microphone",
      "camera",
      "closedcaptions",
      "desktop",
      "fullscreen",
      "fodeviceselection",
      "hangup",
      "chat",
      "settings",
      "videoquality",
      "filmstrip",
      "feedback",
      "stats",
      "shortcuts",
    ],
    SETTINGS_SECTIONS: ["devices", "language", "moderator", "profile"],
    SHOW_JITSI_WATERMARK: false,
    SHOW_WATERMARK_FOR_GUESTS: false,
    SHOW_BRAND_WATERMARK: false,
    BRAND_WATERMARK_LINK: "",
    SHOW_POWERED_BY: false,
    DISPLAY_WELCOME_PAGE_CONTENT: false,
    DISPLAY_WELCOME_PAGE_TOOLBAR_ADDITIONAL_CONTENT: false,
    APP_NAME: "Nexus Core Chat",
    NATIVE_APP_NAME: "Nexus Core Chat",
    PROVIDER_NAME: "Nexus Core",
    DEFAULT_BACKGROUND: "#1a1a1a",
    DEFAULT_WELCOME_PAGE_LOGO_URL: "",
    DEFAULT_LOGO_URL: "",
    CONNECTION_INDICATOR_AUTO_HIDE_ENABLED: true,
    CONNECTION_INDICATOR_AUTO_HIDE_TIMEOUT: 5000,
    CONNECTION_INDICATOR_DISABLED: false,
    VIDEO_LAYOUT_FIT: "both",
    SHOW_CHROME_EXTENSION_BANNER: false,
    // Disable prejoin page completely
    DISABLE_PREJOIN_PAGE: true,
    DISABLE_JOIN_LEAVE_NOTIFICATIONS: false,
    DISABLE_FOCUS_INDICATOR: false,
    DISABLE_DOMINANT_SPEAKER_INDICATOR: false,
    // Hide authentication options
    AUTHENTICATION_ENABLE: false,
    SHOW_AUTHENTICATION_USERS: false,
    // Hide login buttons
    HIDE_INVITE_MORE_HEADER: true,
    MOBILE_APP_PROMO: false,
    MOBILE_DOWNLOAD_LINK_ANDROID: "",
    MOBILE_DOWNLOAD_LINK_IOS: "",
  };

  return (
    <div className="relative h-full w-full">
      <div className="absolute top-4 right-4 z-50 flex gap-2">
        <Button
          variant="secondary"
          size="icon"
          onClick={toggleAudio}
          className={cn(
            "h-10 w-10 rounded-full",
            isAudioMuted && "bg-red-500 hover:bg-red-600"
          )}
        >
          {isAudioMuted ? (
            <MicOff className="h-5 w-5" />
          ) : (
            <Mic className="h-5 w-5" />
          )}
        </Button>
        {!isAudioOnly && (
          <>
            <Button
              variant="secondary"
              size="icon"
              onClick={toggleVideo}
              className={cn(
                "h-10 w-10 rounded-full",
                isVideoMuted && "bg-red-500 hover:bg-red-600"
              )}
            >
              {isVideoMuted ? (
                <VideoOff className="h-5 w-5" />
              ) : (
                <Video className="h-5 w-5" />
              )}
            </Button>
            <Button
              variant="secondary"
              size="icon"
              onClick={toggleScreenShare}
              className={cn(
                "h-10 w-10 rounded-full",
                isScreenSharing && "bg-blue-500 hover:bg-blue-600"
              )}
            >
              {isScreenSharing ? (
                <MonitorOff className="h-5 w-5" />
              ) : (
                <Monitor className="h-5 w-5" />
              )}
            </Button>
          </>
        )}
        <Button
          variant="destructive"
          size="icon"
          onClick={handleLeave}
          className="h-10 w-10 rounded-full"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>
      <JitsiMeeting
        domain="meet.jit.si"
        roomName={roomName}
        configOverwrite={config}
        interfaceConfigOverwrite={interfaceConfig}
        userInfo={{
          displayName: userDisplayName || "User",
          email: userEmail || "",
        }}
        getIFrameRef={(iframeRef) => {
          iframeRef.style.height = "100%";
          iframeRef.style.width = "100%";
        }}
        onApiReady={handleApiReady}
        onReadyToClose={handleLeave}
        lang="en"
      />
    </div>
  );
}


