import { Metadata } from "next";

// Set permissions policy to allow camera and microphone access for WebRTC calls
export const metadata: Metadata = {
  other: {
    "Permissions-Policy": 'camera=*, microphone=*, display-capture=*'
  }
};

export default function ChatLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

