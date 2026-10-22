"use client";

import {
  AlertCircle,
  Archive,
  ArchiveX,
  File,
  Inbox,
  MessagesSquare,
  Send,
  ShoppingCart,
  Trash2,
  Users2
} from "lucide-react";

import { Nav } from "./nav";
import { Separator } from "@/components/ui/separator";
import * as React from "react";
import { cn } from "@/lib/utils";
import { AccountSwitcher } from "./account-switcher";
import { mailApi } from "@/lib/api";

interface NavDesktopProps {
  isCollapsed: boolean;
  accounts: any[];
  currentFolder?: string;
  onFolderChange?: (folder: string) => void;
}

export function NavDesktop({ isCollapsed, accounts, currentFolder = "INBOX", onFolderChange }: NavDesktopProps) {
  const [mailCounts, setMailCounts] = React.useState({
    folders: {
      inbox: 0,
      drafts: 0,
      sent: 0,
      junk: 0,
      trash: 0,
      archive: 0
    },
    labels: {
      social: 0,
      updates: 0,
      forums: 0,
      shopping: 0,
      promotions: 0
    }
  });

  const loadCounts = React.useCallback(async () => {
    try {
      const counts = await mailApi.getMailCounts();
      if (counts && typeof counts === 'object') {
        setMailCounts(counts);
      }
    } catch (error: any) {
      console.error("Failed to load mail counts:", error);
      // Don't show error to user, just log it
      // The counts will remain at 0 if there's an error
    }
  }, []);

  React.useEffect(() => {
    loadCounts();
    // Refresh counts every 30 seconds
    const interval = setInterval(loadCounts, 30000);
    return () => clearInterval(interval);
  }, [loadCounts]);

  // Also refresh when folder changes (user might have deleted/moved emails)
  React.useEffect(() => {
    loadCounts();
  }, [currentFolder, loadCounts]);


  const handleFolderClick = (folder: string) => {
    if (onFolderChange) {
      onFolderChange(folder);
    }
  };

  /** Keeps `variant` typed as "default" | "ghost" (not `string`) for Nav props. */
  const folderVariant = (active: boolean): "default" | "ghost" =>
    active ? "default" : "ghost";

  const folderLinks = [
    {
      title: "Inbox",
      label: mailCounts.folders.inbox > 0 ? mailCounts.folders.inbox.toString() : "",
      icon: Inbox,
      variant: folderVariant(currentFolder === "INBOX"),
      folder: "INBOX"
    },
    {
      title: "Drafts",
      label: mailCounts.folders.drafts > 0 ? mailCounts.folders.drafts.toString() : "",
      icon: File,
      variant: folderVariant(currentFolder === "DRAFT"),
      folder: "DRAFT"
    },
    {
      title: "Sent",
      label: "",
      icon: Send,
      variant: folderVariant(currentFolder === "SENT"),
      folder: "SENT"
    },
    {
      title: "Junk",
      label: mailCounts.folders.junk > 0 ? mailCounts.folders.junk.toString() : "",
      icon: ArchiveX,
      variant: folderVariant(currentFolder === "SPAM"),
      folder: "SPAM"
    },
    {
      title: "Trash",
      label: "",
      icon: Trash2,
      variant: folderVariant(currentFolder === "TRASH"),
      folder: "TRASH"
    },
    {
      title: "Archive",
      label: "",
      icon: Archive,
      variant: folderVariant(currentFolder === "ARCHIVE"),
      folder: "ARCHIVE"
    }
  ];

  const labelLinks = [
    {
      title: "Social",
      label: mailCounts.labels.social > 0 ? mailCounts.labels.social.toString() : "",
      icon: Users2,
      dot: <span className="me-2 size-3.5 rounded-full bg-indigo-400 dark:bg-indigo-700" />,
      variant: "ghost" as const
    },
    {
      title: "Updates",
      label: mailCounts.labels.updates > 0 ? mailCounts.labels.updates.toString() : "",
      icon: AlertCircle,
      dot: <span className="me-2 size-3.5 rounded-full bg-teal-400 dark:bg-teal-700" />,
      variant: "ghost" as const
    },
    {
      title: "Forums",
      label: mailCounts.labels.forums > 0 ? mailCounts.labels.forums.toString() : "",
      icon: MessagesSquare,
      dot: <span className="me-2 size-3.5 rounded-full bg-orange-400 dark:bg-orange-700" />,
      variant: "ghost" as const
    },
    {
      title: "Shopping",
      label: mailCounts.labels.shopping > 0 ? mailCounts.labels.shopping.toString() : "",
      icon: ShoppingCart,
      dot: <span className="me-2 size-3.5 rounded-full bg-lime-400 dark:bg-lime-700" />,
      variant: "ghost" as const
    },
    {
      title: "Promotions",
      label: mailCounts.labels.promotions > 0 ? mailCounts.labels.promotions.toString() : "",
      icon: Archive,
      dot: <span className="me-2 size-3.5 rounded-full bg-pink-400 dark:bg-pink-700" />,
      variant: "ghost" as const
    }
  ];

  return (
    <>
      <div
        className={cn(
          "flex h-[52px] items-center justify-center",
          isCollapsed ? "h-[52px]" : "px-2"
        )}>
        <AccountSwitcher isCollapsed={isCollapsed} accounts={accounts} />
      </div>

      <Separator />

      <Nav
        isCollapsed={isCollapsed}
        links={folderLinks}
        onLinkClick={handleFolderClick}
      />

      <Separator />

      <Nav
        isCollapsed={isCollapsed}
        links={labelLinks}
      />
    </>
  );
}
