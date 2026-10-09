"use client";

import React, { useEffect } from "react";

export default function ChatAccessLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Hide the CRM Settings sidebar and header text
  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'chat-access-layout-style';
    style.textContent = `
      /* Hide the CRM Settings header (title and description) */
      .space-y-4.lg\\:space-y-6 > .space-y-0\\.5:first-child {
        display: none !important;
      }
      /* Hide the CRM Settings sidebar (aside element) */
      aside.lg\\:w-64 {
        display: none !important;
      }
      /* Make the content area take full width */
      .flex.flex-col.space-y-4.lg\\:flex-row.lg\\:space-y-0.lg\\:space-x-4 > div.flex-1 {
        width: 100% !important;
        max-width: 100% !important;
      }
    `;
    document.head.appendChild(style);

    return () => {
      const existingStyle = document.getElementById('chat-access-layout-style');
      if (existingStyle) {
        document.head.removeChild(existingStyle);
      }
    };
  }, []);

  return (
    <div className="w-full">
      {children}
    </div>
  );
}

