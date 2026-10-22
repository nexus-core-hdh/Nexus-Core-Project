"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { mailApi } from "@/lib/api";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MailDisplay } from "./mail-display";
import { MailList } from "./mail-list";
import { type Mail } from "../data";
import { useMailStore } from "../use-mail";
import { NavDesktop } from "@/app/[company]/(auth)/apps/mail/components/nav-desktop";
import { NavMobile } from "@/app/[company]/(auth)/apps/mail/components/nav-mobile";
import { MailDisplayMobile } from "@/app/[company]/(auth)/apps/mail/components/mail-display-mobile";

interface MailProps {
  accounts: {
    label: string;
    email: string;
    icon: React.ReactNode;
    /** Present when account comes from API (used for IMAP fetch). */
    smtpSettingId?: number | string | null;
  }[];
  mails: Mail[];
  defaultLayout: number[] | undefined;
  defaultCollapsed?: boolean;
  navCollapsedSize: number;
}

export function Mail({
  accounts: initialAccounts,
  mails: initialMails,
  defaultLayout = [20, 32, 48],
  defaultCollapsed = false,
  navCollapsedSize
}: MailProps) {
  const [isCollapsed, setIsCollapsed] = React.useState(defaultCollapsed);
  const isMobile = useIsMobile();
  const { selectedMail, setSelectedMail } = useMailStore();
  const [tab, setTab] = React.useState("all");
  const [folder, setFolder] = React.useState("INBOX");
  const [mails, setMails] = React.useState(initialMails);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  // Load mails when folder or search changes
  React.useEffect(() => {
    const loadMails = async () => {
      try {
        setLoading(true);
        const response = await mailApi.getMails({
          folder: folder,
          isRead: tab === "unread" ? false : undefined,
          search: searchQuery || undefined,
          page: 1,
          limit: 100
        });

        const transformedMails = response.mails?.map((mail: any) => ({
          id: mail.id.toString(),
          name: mail.fromName || mail.fromEmail.split('@')[0],
          avatar: `/images/avatars/${mail.id % 10}.png`,
          email: mail.fromEmail,
          subject: mail.subject,
          text: mail.body,
          date: mail.receivedAt || mail.sentAt || mail.createdAt,
          read: mail.isRead,
          labels: mail.labels || []
        })) || [];

        setMails(transformedMails);
      } catch (error: any) {
        console.error("Failed to load mails:", error);
        toast.error("Failed to load emails", {
          description: error.message || "Please try again later"
        });
      } finally {
        setLoading(false);
      }
    };

    loadMails();
  }, [folder, tab, searchQuery]);

  // Function to refresh mails (can be called after fetching)
  const refreshMails = React.useCallback(async () => {
    try {
      setLoading(true);
      const response = await mailApi.getMails({
        folder: folder,
        isRead: tab === "unread" ? false : undefined,
        search: searchQuery || undefined,
        page: 1,
        limit: 100
      });
      const transformedMails = response.mails?.map((mail: any) => ({
        id: mail.id.toString(),
        name: mail.fromName || mail.fromEmail.split('@')[0],
        avatar: `/images/avatars/${mail.id % 10}.png`,
        email: mail.fromEmail,
        subject: mail.subject,
        text: mail.body,
        date: mail.receivedAt || mail.sentAt || mail.createdAt,
        read: mail.isRead,
        labels: mail.labels || []
      })) || [];
      setMails(transformedMails);
    } catch (error: any) {
      console.error("Failed to reload mails:", error);
    } finally {
      setLoading(false);
    }
  }, [folder, tab, searchQuery]);

  return (
    <TooltipProvider delayDuration={0}>
      <ResizablePanelGroup
        direction="horizontal"
        onLayout={(sizes: number[]) => {
          document.cookie = `react-resizable-panels:layout:mail=${JSON.stringify(sizes)}`;
        }}
        className="items-stretch">
        <ResizablePanel
          hidden={isMobile}
          defaultSize={defaultLayout[0]}
          collapsedSize={navCollapsedSize}
          collapsible={true}
          minSize={15}
          maxSize={20}
          onCollapse={() => {
            setIsCollapsed(true);
            document.cookie = `react-resizable-panels:collapsed=${JSON.stringify(true)}`;
          }}
          onResize={() => {
            setIsCollapsed(false);
            document.cookie = `react-resizable-panels:collapsed=${JSON.stringify(false)}`;
          }}
          className={cn(isCollapsed && "min-w-[50px] transition-all duration-300 ease-in-out")}>
          <NavDesktop 
            isCollapsed={isCollapsed} 
            accounts={initialAccounts}
            currentFolder={folder}
            onFolderChange={setFolder}
          />
        </ResizablePanel>
        <ResizableHandle hidden={isMobile} withHandle />
        <ResizablePanel defaultSize={defaultLayout[1]} minSize={30}>
          <Tabs
            defaultValue="all"
            className="flex h-full flex-col gap-0"
            onValueChange={(value) => setTab(value)}>
            <div className="flex items-center px-4 py-2">
              <div className="flex items-center gap-2">
                {isMobile && <NavMobile />}
                <h1 className="text-lg font-bold">
                  {folder === "INBOX" ? "Inbox" : 
                   folder === "SENT" ? "Sent" :
                   folder === "DRAFT" ? "Drafts" :
                   folder === "TRASH" ? "Trash" :
                   folder === "ARCHIVE" ? "Archive" : folder}
                </h1>
              </div>
              <div className="ml-auto flex items-center gap-2">
                {folder === "INBOX" && initialAccounts.length > 0 && initialAccounts[0]?.smtpSettingId && (
                  <button
                    onClick={async () => {
                      try {
                        setLoading(true);
                        const rawId = initialAccounts[0].smtpSettingId;
                        const smtpSettingId =
                          typeof rawId === "string" ? Number(rawId) : rawId;
                        if (smtpSettingId != null && !Number.isNaN(smtpSettingId)) {
                          const result = await mailApi.fetchEmails(smtpSettingId);
                          toast.success(result.message || `Fetched ${result.count || 0} new emails`);
                          // Reload mails after a short delay
                          setTimeout(() => {
                            refreshMails();
                          }, 1000);
                        }
                      } catch (error: any) {
                        toast.error("Failed to fetch emails", {
                          description: error.message || "Please check your SMTP settings and ensure IMAP is enabled"
                        });
                      } finally {
                        setLoading(false);
                      }
                    }}
                    disabled={loading}
                    className="text-sm px-3 py-1.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50">
                    {loading ? "Fetching..." : "Fetch Emails"}
                  </button>
                )}
                <TabsList>
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="unread">Unread</TabsTrigger>
                </TabsList>
              </div>
            </div>
            <Separator />
            <div className="bg-background/95 supports-[backdrop-filter]:bg-background/60 p-4 backdrop-blur">
              <form onSubmit={(e) => e.preventDefault()}>
                <div className="relative">
                  <Search className="text-muted-foreground absolute top-2.5 left-2 h-4 w-4" />
                  <Input 
                    placeholder="Search" 
                    className="pl-8" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </form>
            </div>
            <div className="min-h-0">
              {loading ? (
                <div className="flex items-center justify-center h-64">
                  <div className="text-muted-foreground">Loading...</div>
                </div>
              ) : (
                <MailList
                  items={
                    tab === "all" ? mails : mails.filter((item) => !item.read)
                  }
                />
              )}
            </div>
          </Tabs>
        </ResizablePanel>
        <ResizableHandle hidden={isMobile} withHandle />
        <ResizablePanel defaultSize={defaultLayout[2]} hidden={isMobile} minSize={30}>
          {isMobile ? (
            <MailDisplayMobile mail={mails.find((item) => item.id === selectedMail?.id) || null} />
          ) : (
            <MailDisplay mail={mails.find((item) => item.id === selectedMail?.id) || null} />
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
    </TooltipProvider>
  );
}
