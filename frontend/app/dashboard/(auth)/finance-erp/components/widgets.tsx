"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/finance-erp/status-badge";
import { formatAmount, formatDate } from "@/lib/finance-erp/utils/format";
import {
  RECENT_SALES_INVOICES, RECENT_PURCHASE_INVOICES, PENDING_PAYMENTS, PENDING_RECEIPTS,
  OVERDUE_INVOICES, PENDING_APPROVALS, RECENT_JOURNAL_ENTRIES,
} from "@/lib/finance-erp/dashboard/mock";
import { AlertTriangle, Clock } from "lucide-react";

function WidgetCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">{children}</CardContent>
    </Card>
  );
}

function Row({ left, mid, right, badge }: { left: React.ReactNode; mid?: React.ReactNode; right: React.ReactNode; badge?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b py-2 text-sm last:border-b-0">
      <div className="min-w-0">
        <div className="truncate font-medium">{left}</div>
        {mid && <div className="truncate text-xs text-muted-foreground">{mid}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="font-medium">{right}</span>
        {badge}
      </div>
    </div>
  );
}

export function RecentSalesInvoicesWidget() {
  return (
    <WidgetCard title="Recent Sales Invoices">
      {RECENT_SALES_INVOICES.map((r) => (
        <Row key={r.id} left={r.id} mid={`${r.customer} · ${formatDate(r.date)}`} right={formatAmount(r.amount)} badge={<StatusBadge status={r.status} />} />
      ))}
    </WidgetCard>
  );
}

export function RecentPurchaseInvoicesWidget() {
  return (
    <WidgetCard title="Recent Purchase Invoices">
      {RECENT_PURCHASE_INVOICES.map((r) => (
        <Row key={r.id} left={r.id} mid={`${r.vendor} · ${formatDate(r.date)}`} right={formatAmount(r.amount)} badge={<StatusBadge status={r.status} />} />
      ))}
    </WidgetCard>
  );
}

export function PendingPaymentsWidget() {
  return (
    <WidgetCard title="Pending Payments">
      {PENDING_PAYMENTS.map((r) => (
        <Row key={r.id} left={r.id} mid={`${r.vendor} · due ${formatDate(r.dueDate)}`} right={formatAmount(r.amount)} />
      ))}
    </WidgetCard>
  );
}

export function PendingReceiptsWidget() {
  return (
    <WidgetCard title="Pending Receipts">
      {PENDING_RECEIPTS.map((r) => (
        <Row key={r.id} left={r.id} mid={`${r.customer} · due ${formatDate(r.dueDate)}`} right={formatAmount(r.amount)} />
      ))}
    </WidgetCard>
  );
}

export function OverdueInvoicesWidget() {
  return (
    <WidgetCard title="Overdue Invoices">
      {OVERDUE_INVOICES.map((r) => (
        <Row
          key={r.id}
          left={r.id}
          mid={r.party}
          right={formatAmount(r.amount)}
          badge={<span className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 dark:text-rose-400"><AlertTriangle className="h-3 w-3" />{r.daysOverdue}d</span>}
        />
      ))}
    </WidgetCard>
  );
}

export function PendingApprovalsWidget() {
  return (
    <WidgetCard title="Pending Approvals">
      {PENDING_APPROVALS.map((r) => (
        <Row key={r.id} left={`${r.id} · ${r.type}`} mid={`Raised by ${r.raisedBy}`} right={formatAmount(r.amount)} badge={<Clock className="h-3.5 w-3.5 text-orange-500" />} />
      ))}
    </WidgetCard>
  );
}

export function RecentJournalEntriesWidget() {
  return (
    <WidgetCard title="Recent Journal Entries">
      {RECENT_JOURNAL_ENTRIES.map((r) => (
        <Row key={r.id} left={r.id} mid={`${r.description} · ${formatDate(r.date)}`} right={formatAmount(r.debit)} badge={<StatusBadge status={r.status} />} />
      ))}
    </WidgetCard>
  );
}
