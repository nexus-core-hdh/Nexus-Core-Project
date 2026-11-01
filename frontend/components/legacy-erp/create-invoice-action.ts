// Create Invoice for one inventory receipt — shared by the Inventory Receipt screen and the receipt
// lists (right-click / ⋮). Asks the backend for the receipt's invoice (invoice.service.ts
// createFromReceipt: the existing one, else a new one carrying the receipt's saved header) and opens
// it on that receipt type's Invoice screen. Ineligible receipts (no lines, another type, another
// company) come back as the API's own message.
import { ReceiptText } from "lucide-react";
import { toast } from "sonner";
import { legacyErpApi } from "@/lib/nexuscore-api";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import type { RowAction } from "@/components/legacy-erp/row-actions";

export async function createInvoiceForReceipt(router: Parameters<typeof navigateOrOpenTab>[0], receipt: { id: number; receiptType: number }) {
  try {
    const res: any = await legacyErpApi.invoices(receipt.receiptType).createFromReceipt(receipt.id);
    const invoice = res?.invoice;
    if (!invoice?.id) throw new Error("The invoice could not be opened.");
    if (res.created) toast.success(`Invoice ${invoice.receiptNo ?? ""} created`);
    else toast.info(`This receipt already has invoice ${invoice.receiptNo ?? ""} — opening it`);
    navigateOrOpenTab(router, `/legacy-erp/receipt-invoices?receiptType=${receipt.receiptType}&id=${invoice.id}`);
  } catch (e: any) {
    toast.error(e?.message || "Could not create the invoice");
  }
}

/** The menu entry Create Invoice — needs a saved receipt (and no unsaved changes: the invoice is
 *  built from the receipt's saved data). */
export function createInvoiceAction(
  router: Parameters<typeof navigateOrOpenTab>[0],
  receipt: { id: number | null | undefined; receiptType: number; isDirty?: boolean },
): RowAction {
  const reason = !receipt.id ? "Save the receipt first" : receipt.isDirty ? "Save your changes first — the invoice uses the saved receipt" : undefined;
  return {
    key: "create-invoice", label: "Create Invoice", icon: ReceiptText, separatorBefore: true,
    disabled: !!reason, title: reason,
    onSelect: () => { if (receipt.id && !receipt.isDirty) void createInvoiceForReceipt(router, { id: receipt.id, receiptType: receipt.receiptType }); },
  };
}
