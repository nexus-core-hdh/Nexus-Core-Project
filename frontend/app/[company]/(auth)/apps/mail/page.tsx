"use client";

import { useEffect, useState } from "react";
import { generateMeta } from "@/lib/utils";
import { Mail } from "./components/mail";
import { mailApi } from "@/lib/api";
import { toast } from "sonner";

export default function MailPage() {
  const [mails, setMails] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [defaultLayout, setDefaultLayout] = useState<number[] | undefined>([20, 32, 48]);
  const [defaultCollapsed, setDefaultCollapsed] = useState<boolean>(false);

  useEffect(() => {
    // Load layout from cookies
    if (typeof window !== 'undefined') {
      const layoutCookie = document.cookie
        .split('; ')
        .find(row => row.startsWith('react-resizable-panels:layout:mail='));
      if (layoutCookie) {
        const layoutValue = layoutCookie.split('=')[1];
        try {
          setDefaultLayout(JSON.parse(decodeURIComponent(layoutValue)));
        } catch (e) {
          console.error('Failed to parse layout cookie:', e);
        }
      }

      const collapsedCookie = document.cookie
        .split('; ')
        .find(row => row.startsWith('react-resizable-panels:collapsed='));
      if (collapsedCookie) {
        const collapsedValue = collapsedCookie.split('=')[1];
        try {
          setDefaultCollapsed(JSON.parse(decodeURIComponent(collapsedValue)));
        } catch (e) {
          console.error('Failed to parse collapsed cookie:', e);
        }
      }
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [mailsResponse, accountsResponse] = await Promise.all([
          mailApi.getMails({ folder: 'INBOX', page: 1, limit: 100 }),
          mailApi.getMailAccounts()
        ]);

        // Transform email addresses to account format
        // Handle both array of strings and array of objects
        let transformedAccounts: any[] = [];
        if (Array.isArray(accountsResponse)) {
          transformedAccounts = accountsResponse.map((item: any) => {
            // Handle object format with email and smtpSettingId
            const email = item.email || (typeof item === 'string' ? item : '');
            if (email && typeof email === 'string') {
              return {
                label: email.split('@')[0] || email,
                email: email,
                smtpSettingId: item.smtpSettingId || null,
                icon: null
              };
            }
            return null;
          }).filter((account: any) => account !== null && account.email);
        } else if (accountsResponse && typeof accountsResponse === 'object') {
          // If response is an object, try to extract emails
          console.warn('Unexpected accounts response format:', accountsResponse);
        }

        setAccounts(transformedAccounts.length > 0 ? transformedAccounts : []);

        // Transform mails to match the expected format
        const transformedMails = mailsResponse.mails?.map((mail: any) => ({
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
        console.error("Failed to load mail data:", error);
        toast.error("Failed to load emails", {
          description: error.message || "Please try again later"
        });
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  if (loading) {
    return (
      <div className="h-[calc(100vh-var(--header-height)-3rem)] rounded-md border flex items-center justify-center">
        <div className="text-muted-foreground">Loading emails...</div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-var(--header-height)-3rem)] rounded-md border">
      <Mail
        accounts={accounts}
        mails={mails}
        defaultLayout={defaultLayout}
        defaultCollapsed={defaultCollapsed}
        navCollapsedSize={4}
      />
    </div>
  );
}
