"use client";

import { CustomizedFieldsPanel } from "@/components/custom-fields/customized-fields-panel";

// Style Card / Sample Card Customized Fields — the shared runtime panel (components/custom-fields/
// customized-fields-panel.tsx). Sample Card reuses this component via `sampleCardId`, under its own
// "SampleCard" entity so its fields and values stay separate from Style Card's. `readOnly` follows
// the parent screen's own read-only state (Sample Card's view mode; Style Card has none).
export function CustomizedFieldsTab({ styleCardId, sampleCardId, readOnly = false }: {
  styleCardId?: string;
  sampleCardId?: string;
  card: any;
  onReloadCard: () => void;
  readOnly?: boolean;
}) {
  return (
    <CustomizedFieldsPanel
      entity={sampleCardId ? "SampleCard" : "StyleCard"}
      entityId={(sampleCardId || styleCardId)!}
      readOnly={readOnly}
    />
  );
}
