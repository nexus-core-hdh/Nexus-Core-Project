"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { plmApi } from "@/lib/nexuscore-api";

// The existing single StyleCard.explanations free-text field, moved out of General into its
// own tab to match the reference screenshot's tab list — same field/data, same save path
// (plmApi.styleCards.update), no schema change.
export function ExplanationTab({ styleCardId, card, onReloadCard }: { styleCardId: string; card: any; onReloadCard: () => void }) {
  const [text, setText] = useState(card.explanations || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => { setText(card.explanations || ""); }, [card]);

  const save = async () => {
    setSaving(true);
    try {
      await plmApi.styleCards.update(styleCardId, { explanations: text });
      toast.success("Saved");
      onReloadCard();
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <Textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder="Notes about this style..." />
      <div className="flex justify-end">
        <Button size="sm" onClick={save} disabled={saving}><Save className="h-4 w-4 mr-1" />{saving ? "Saving..." : "Save"}</Button>
      </div>
    </div>
  );
}
