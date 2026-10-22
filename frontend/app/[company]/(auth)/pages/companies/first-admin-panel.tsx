"use client";

// First administrator of another (newly registered) company — platform users with
// companies:invite-admin only; the backend (CompanyFirstAdminService) authorizes every request.
//
//  * Create First Admin opens the Users screen's own create-user dialog (CreateUserDialog, first-
//    admin mode): same fields, same generated temporary password shown once, same forced password
//    change at first sign-in. Company, Main Branch and Admin role are fixed. No email is needed.
//  * Emailing a set-password link is a separate, optional notification that needs SMTP; its status
//    is shown on its own line so a missing mail setup never reads as "cannot create the user".
// Everything shown is what the backend reported.

import * as React from "react";
import { Loader2, Mail, MailCheck, MailWarning, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { companiesApi } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import { FIRST_ADMIN_STATUS_LABEL, type FirstAdminStatus } from "@/lib/companies/company-details";
import { CreateUserDialog } from "../users/create-user-dialog";

interface StatusData {
  status: FirstAdminStatus;
  name?: string;
  email?: string;
  reason?: string;
  mainBranch?: { id: string; name: string } | null;
  setupLink?: { status: "none" | "pending" | "expired"; expiresAt?: string };
  emailConfigured?: boolean;
}

export function FirstAdminPanel({ companyId, companyName, canInvite, onChanged }: {
  companyId: string;
  companyName: string;
  canInvite: boolean;
  /** Called after the first administrator was created, so the caller can reload the company (user count). */
  onChanged?: () => void;
}) {
  const [state, setState] = React.useState<StatusData | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [emailResult, setEmailResult] = React.useState<{ sent: boolean; message: string } | null>(null);
  const [emailError, setEmailError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoadError(null);
    try {
      const res: any = await companiesApi.getFirstAdmin(companyId);
      setState((res?.data ?? res) as StatusData);
    } catch (e: any) {
      setLoadError(e?.message || "The administrator status could not be loaded.");
    }
  }, [companyId]);
  React.useEffect(() => { load(); }, [load]);

  const sendSetupLink = async () => {
    if (sending) return;
    setSending(true);
    setEmailError(null);
    setEmailResult(null);
    try {
      const res: any = await companiesApi.sendFirstAdminSetupLink(companyId);
      setEmailResult((res?.data ?? res) as { sent: boolean; message: string });
    } catch (e: any) {
      setEmailError(String(e?.message || "The set-password email could not be sent."));
    } finally {
      setSending(false);
      load();
    }
  };

  const status = state?.status;
  const branchName = state?.mainBranch?.name ?? "";
  return (
    <section className="space-y-2 rounded-md border p-3" aria-label="First administrator">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">First administrator</p>
        {status && <Badge variant={status === "active" ? "default" : status === "awaiting_first_sign_in" ? "secondary" : "outline"}>{FIRST_ADMIN_STATUS_LABEL[status]}</Badge>}
      </div>
      {loadError && <p className="text-xs text-destructive">{loadError}</p>}
      {!state && !loadError && <p className="text-xs text-muted-foreground">Loading...</p>}
      {state?.email && <p className="text-xs text-muted-foreground">{state.name} · {state.email}{branchName ? ` · ${branchName}` : ""}</p>}
      {status === "awaiting_first_sign_in" && (
        <p className="text-xs text-muted-foreground">Created with a temporary password — they must change it at their first sign-in.</p>
      )}
      {state?.reason && <p className="text-xs text-muted-foreground">{state.reason}</p>}

      {canInvite && status === "not_configured" && (
        branchName ? (
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <UserPlus /> Create First Admin
          </Button>
        ) : (
          <p className="text-xs text-destructive">This company has no branch, so it cannot receive users yet.</p>
        )
      )}

      {state && status !== "not_eligible" && (
        <div className="space-y-1.5 border-t pt-2">
          <p className="text-xs text-muted-foreground">
            Email notifications: {state.emailConfigured ? "configured" : "not configured"} — creating the administrator does not need email.
          </p>
          {canInvite && status === "awaiting_first_sign_in" && (
            <>
              {state.setupLink && state.setupLink.status !== "none" && (
                <p className="text-xs text-muted-foreground">
                  Set-password link: {state.setupLink.status === "pending" ? `sent, valid until ${state.setupLink.expiresAt ? formatDateTime(state.setupLink.expiresAt) : "—"}` : "expired or not delivered"}
                </p>
              )}
              <Button size="sm" variant="outline" disabled={sending || !state.emailConfigured} onClick={sendSetupLink}
                title={state.emailConfigured ? "Optional: email a single-use link to choose their own password" : "Email is not configured on the server"}>
                {sending ? <Loader2 className="animate-spin" /> : <Mail />} Email set-password link (optional)
              </Button>
            </>
          )}
          {emailResult && (
            <div className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${emailResult.sent ? "border-green-600/40 bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-300" : "border-amber-600/40 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"}`}>
              {emailResult.sent ? <MailCheck className="mt-0.5 h-4 w-4 shrink-0" /> : <MailWarning className="mt-0.5 h-4 w-4 shrink-0" />}
              <span>{emailResult.message}</span>
            </div>
          )}
          {emailError && <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">{emailError}</p>}
        </div>
      )}

      {/* Stays mounted while open, so the one-time password screen survives the status refresh. */}
      {canInvite && branchName && (status === "not_configured" || dialogOpen) && (
        <CreateUserDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSuccess={() => { load(); onChanged?.(); }}
          firstAdmin={{
            companyId,
            companyName,
            branchName,
            roleName: "Admin",
            create: (body) => companiesApi.createFirstAdmin(companyId, body),
          }}
        />
      )}
    </section>
  );
}
