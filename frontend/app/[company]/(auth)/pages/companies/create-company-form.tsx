"use client";

// Create Company — registers a company through POST /companies (backend CompanyProvisioningService:
// platform-owner company + companies:create only; creates the company and its "Main Branch").
// Shown only when GET /companies/access says canCreate; the backend authorizes the request again.
// After saving, the dialog shows the new company, its URL and subscription (a Demo company is on a
// Trial until its end date); the Companies list is refreshed and, for users allowed to, Set Up
// First Admin is offered right there (FirstAdminPanel).

import * as React from "react";
import { Check, Copy, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { companiesApi } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FirstAdminPanel } from "./first-admin-panel";
import {
  EMPTY_COMPANY_FORM,
  companyDetailRows,
  defaultTrialEndDate,
  trialEndLabel,
  utcToday,
  fieldForServerError,
  suggestCompanySlug,
  toCreateCompanyPayload,
  unwrapCompany,
  validateCompanyForm,
  type CompanyDetailsSource,
  type CompanyForm
} from "@/lib/companies/company-details";

type TextField = Exclude<keyof CompanyForm, "accountType" | "trialEndDate">;

const FIELDS: { key: TextField; label: string; required?: boolean; type?: string; placeholder?: string }[] = [
  { key: "name", label: "Company Name", required: true, placeholder: "Acme Apparel" },
  { key: "slug", label: "Company URL", required: true, placeholder: "acme-apparel" },
  { key: "email", label: "Email", type: "email", placeholder: "info@acme.com" },
  { key: "phone", label: "Phone" },
  { key: "address", label: "Address" },
  { key: "industry", label: "Industry", placeholder: "Apparel" },
  { key: "website", label: "Website", placeholder: "https://acme.com" },
];

export function CreateCompanyButton({ onCreated, trialDefaultDays, canInviteAdmin }: {
  onCreated: (company: CompanyDetailsSource) => void;
  /** COMPANY_TRIAL_DAYS from the server (GET /companies/access); null = no default, the date must be picked. */
  trialDefaultDays: number | null;
  canInviteAdmin: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<CompanyForm>(EMPTY_COMPANY_FORM);
  const [slugEdited, setSlugEdited] = React.useState(false);
  const [errors, setErrors] = React.useState<Partial<Record<keyof CompanyForm, string>>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [created, setCreated] = React.useState<CompanyDetailsSource | null>(null);
  const [copied, setCopied] = React.useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const reset = () => { setForm(EMPTY_COMPANY_FORM); setSlugEdited(false); setErrors({}); setFormError(null); setCreated(null); setCopied(false); };

  const set = (key: TextField, value: string) => {
    setForm((f) => {
      const next = { ...f, [key]: value };
      // The Company URL follows the name until the user edits it themselves.
      if (key === "name" && !slugEdited) next.slug = suggestCompanySlug(value);
      return next;
    });
    if (key === "slug") setSlugEdited(true);
    setErrors((e) => ({ ...e, [key]: undefined }));
    setFormError(null);
  };

  const setAccountType = (accountType: CompanyForm["accountType"]) => {
    setForm((f) => ({ ...f, accountType, trialEndDate: accountType === "Demo" ? f.trialEndDate || defaultTrialEndDate(trialDefaultDays) : "" }));
    setErrors((e) => ({ ...e, trialEndDate: undefined }));
    setFormError(null);
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (saving) return;
    const found = validateCompanyForm(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    setFormError(null);
    try {
      const company = unwrapCompany(await companiesApi.createCompany(toCreateCompanyPayload(form)));
      if (!company) throw new Error("The company was saved but could not be read back — refresh the list.");
      setCreated(company);
      onCreated(company);
      toast.success(`Company "${company.name}" created`);
    } catch (e: any) {
      const message = String(e?.message || "Failed to create the company");
      const field = fieldForServerError(message);
      if (field) setErrors((x) => ({ ...x, [field]: message }));
      else setFormError(message);
    } finally {
      setSaving(false);
    }
  };

  const copyUrl = async (url: string) => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard unavailable */ }
  };

  return (
    <>
      <Button onClick={() => { reset(); setOpen(true); }}>
        <Plus /> Create Company
      </Button>
      <Dialog open={open} onOpenChange={(o) => { if (!saving) setOpen(o); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          {created ? (
            <>
              <DialogHeader>
                <DialogTitle>Company created</DialogTitle>
                <DialogDescription>
                  {created.name} is registered with its Main Branch
                  {created.subscriptionStatus === "Trial" && created.trialEndDate ? `, on a Trial until ${trialEndLabel(created.trialEndDate)}` : ""}. It has no users yet.
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
                <code className="flex-1 truncate text-xs">{`${origin}/${created.slug}`}</code>
                <Button variant="ghost" size="icon" className="h-7 w-7" title="Copy URL" onClick={() => copyUrl(`${origin}/${created.slug}`)}>
                  {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
              <dl className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-1.5 text-sm">
                {companyDetailRows(created, formatDateTime).map(([label, value]) => (
                  <React.Fragment key={label}>
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="break-words">{value}</dd>
                  </React.Fragment>
                ))}
              </dl>
              {canInviteAdmin && <FirstAdminPanel companyId={created.id} companyName={created.name} canInvite onChanged={() => onCreated(created)} />}
              <DialogFooter>
                <Button variant="outline" onClick={reset}>Create another</Button>
                <Button onClick={() => setOpen(false)}>Done</Button>
              </DialogFooter>
            </>
          ) : (
            <form onSubmit={submit} noValidate className="space-y-4">
              <DialogHeader>
                <DialogTitle>Create Company</DialogTitle>
                <DialogDescription>Registers a new company with its own Main Branch. No users or data are copied from any other company.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3">
                {FIELDS.map(({ key, label, required, type, placeholder }) => (
                  <div key={key} className="grid gap-1">
                    <Label htmlFor={`company-${key}`}>{label}{required && <span className="text-destructive"> *</span>}</Label>
                    <Input
                      id={`company-${key}`} type={type ?? "text"} value={form[key]} placeholder={placeholder} disabled={saving}
                      aria-invalid={!!errors[key]} onChange={(e) => set(key, e.target.value)}
                    />
                    {key === "slug" && !errors.slug && form.slug && (
                      <p className="text-[11px] text-muted-foreground">Company address: {origin}/{form.slug.trim().toLowerCase()}</p>
                    )}
                    {errors[key] && <p className="text-xs text-destructive">{errors[key]}</p>}
                  </div>
                ))}
                <div className="grid gap-1">
                  <Label htmlFor="company-accountType">Account Type</Label>
                  <Select value={form.accountType} onValueChange={(v) => setAccountType(v as CompanyForm["accountType"])} disabled={saving}>
                    <SelectTrigger id="company-accountType"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Standard">Standard</SelectItem>
                      <SelectItem value="Demo">Demo — Trial subscription</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.accountType === "Demo" && (
                  <div className="grid gap-1">
                    <Label htmlFor="company-trialEndDate">Trial ends on<span className="text-destructive"> *</span></Label>
                    <Input
                      id="company-trialEndDate" type="date" value={form.trialEndDate} min={utcToday()} disabled={saving} aria-invalid={!!errors.trialEndDate}
                      onChange={(e) => { setForm((f) => ({ ...f, trialEndDate: e.target.value })); setErrors((x) => ({ ...x, trialEndDate: undefined })); setFormError(null); }}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      {trialDefaultDays ? `Default: ${trialDefaultDays} days. ` : "No default trial length is configured on the server — choose the date. "}
                      The trial ends at the end of this day (UTC). Plan stays Free; nothing is billed.
                    </p>
                    {errors.trialEndDate && <p className="text-xs text-destructive">{errors.trialEndDate}</p>}
                  </div>
                )}
              </div>
              {formError && <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{formError}</p>}
              <DialogFooter>
                <Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={saving}>{saving ? <><Loader2 className="animate-spin" /> Creating...</> : "Create Company"}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
