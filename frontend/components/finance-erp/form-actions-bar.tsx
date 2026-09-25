"use client";

import { Button } from "@/components/ui/button";
import { Save, Send, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Sticky Save Draft / Submit / Cancel bar for every Finance transaction form (spec section 8). */
export function FormActionsBar({
  onSaveDraft, onSubmit, onCancel, submitLabel = "Submit", saving = false, submitDisabled, className,
}: {
  onSaveDraft?: () => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel?: string;
  saving?: boolean;
  submitDisabled?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("sticky bottom-0 z-10 flex items-center justify-end gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur", className)}>
      <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
        <X className="h-3.5 w-3.5 mr-1.5" />Cancel
      </Button>
      {onSaveDraft && (
        <Button type="button" variant="outline" onClick={onSaveDraft} disabled={saving}>
          <Save className="h-3.5 w-3.5 mr-1.5" />Save Draft
        </Button>
      )}
      <Button type="button" onClick={onSubmit} disabled={saving || submitDisabled}>
        {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
        {submitLabel}
      </Button>
    </div>
  );
}
