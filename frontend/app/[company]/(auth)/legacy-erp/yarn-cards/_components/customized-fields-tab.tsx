"use client";

import { CustomizedFieldsPanel } from "@/components/custom-fields/customized-fields-panel";

// Yarn Card Customized Fields — the shared runtime panel (components/custom-fields/customized-fields-panel.tsx) for
// entity = "YarnCard"; definitions live in Administration > User Defined Fields.
export function CustomizedFieldsTab({ itemId, readOnly = false }: { itemId: string; readOnly?: boolean }) {
  return <CustomizedFieldsPanel entity="YarnCard" entityId={itemId} readOnly={readOnly} />;
}
