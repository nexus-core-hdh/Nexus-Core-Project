// Shared status vocabulary + badge styling for the whole Finance module (spec section 18) — one
// place mapping every document status to a Badge variant so a "Paid" pill looks identical on
// Sales Invoice, Vendor Bill, and the Aging Report.

export type FinanceStatus =
  | "Draft"
  | "Pending Approval"
  | "Approved"
  | "Rejected"
  | "Posted"
  | "Partially Paid"
  | "Paid"
  | "Partially Received"
  | "Received"
  | "Cancelled"
  | "Overdue"
  | "Closed"
  | "Matched"
  | "Partially Matched"
  | "Mismatch"
  | "Pending"
  | "Active"
  | "Inactive"
  | "Under Maintenance"
  | "Disposed"
  | "Transferred"
  | "Reconciled"
  | "Adjusted"
  | "Open"
  | "Deducted"
  | "Deposited"
  | "Scheduled"
  | "In Progress"
  | "Completed";

export type BadgeVariant = "default" | "secondary" | "warning" | "info" | "success" | "destructive" | "outline";

export const STATUS_VARIANT: Record<string, BadgeVariant> = {
  Draft: "secondary",
  "Pending Approval": "warning",
  Pending: "warning",
  Approved: "info",
  Rejected: "destructive",
  Posted: "success",
  "Partially Paid": "warning",
  Paid: "success",
  "Partially Received": "warning",
  Received: "success",
  Cancelled: "destructive",
  Overdue: "destructive",
  Closed: "secondary",
  Matched: "success",
  "Partially Matched": "warning",
  Mismatch: "destructive",
  Active: "success",
  Inactive: "secondary",
  "Under Maintenance": "warning",
  Disposed: "destructive",
  Transferred: "info",
  Reconciled: "success",
  Adjusted: "info",
  Open: "outline",
  Deducted: "info",
  Deposited: "success",
  Scheduled: "info",
  "In Progress": "warning",
  Completed: "success",
};

export function statusVariant(status: string): BadgeVariant {
  return STATUS_VARIANT[status] ?? "outline";
}
