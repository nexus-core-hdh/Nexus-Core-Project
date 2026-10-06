"use client";

import { CustomizedFieldsPanel } from "@/components/custom-fields/customized-fields-panel";

// Financial Receipt Customized Fields — the shared runtime panel (components/custom-fields/customized-fields-panel.tsx) for
// entity = "FiReceipt"; definitions live in Administration > User Defined Fields.
export function CustomizedFieldsTab({ itemId, readOnly = false }: { itemId: string; readOnly?: boolean }) {
  return <CustomizedFieldsPanel entity="FiReceipt" entityId={itemId} readOnly={readOnly} />;
}
