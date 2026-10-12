"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { plmApi } from "@/lib/nexuscore-api";

const WASH_CARE_OPTIONS: Record<string, string[]> = {
  washing: ["Machine Wash Cold", "Machine Wash Warm", "Machine Wash Hot", "Hand Wash Only", "Do Not Wash"],
  bleaching: ["Do Not Bleach", "Non-Chlorine Bleach Only", "Chlorine Bleach OK"],
  tumbleDrying: ["Tumble Dry Low", "Tumble Dry Medium", "Tumble Dry High", "Do Not Tumble Dry"],
  naturalDrying: ["Line Dry", "Flat Dry", "Dry in Shade", "Drip Dry"],
  ironing: ["Iron Low", "Iron Medium", "Iron High", "Do Not Iron"],
  chemicalCleaning: ["Dry Clean Any Solvent", "Dry Clean Petroleum Only", "Do Not Dry Clean"],
  wetCleaning: ["Professional Wet Clean", "Do Not Wet Clean"],
};

const FIELDS: { key: keyof typeof WASH_CARE_OPTIONS; label: string }[] = [
  { key: "washing", label: "Washing" },
  { key: "bleaching", label: "Bleaching" },
  { key: "tumbleDrying", label: "Tumble Drying" },
  { key: "naturalDrying", label: "Natural Drying" },
  { key: "ironing", label: "Ironing" },
  { key: "chemicalCleaning", label: "Chemical Cleaning" },
  { key: "wetCleaning", label: "Wet Cleaning" },
];

// Reused wholesale for Sample Card via the optional `sampleCardId` prop, backed by its own
// independent SampleWashCare table (plmApi.sampleWashCare, exact mirror of styleWashCare).
export function WashCareTab({ styleCardId, sampleCardId }: { styleCardId?: string; sampleCardId?: string; card: any; onReloadCard: () => void }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const r = sampleCardId ? await plmApi.sampleWashCare.get(sampleCardId) : await plmApi.styleWashCare.get(styleCardId!);
        const next: Record<string, string> = {};
        FIELDS.forEach((f) => { next[f.key] = r?.[f.key] || ""; });
        setForm(next);
      } catch {
        const next: Record<string, string> = {};
        FIELDS.forEach((f) => { next[f.key] = ""; });
        setForm(next);
      } finally {
        setLoading(false);
      }
    })();
  }, [styleCardId, sampleCardId]);

  const save = async () => {
    setSaving(true);
    try {
      if (sampleCardId) await plmApi.sampleWashCare.upsert(sampleCardId, form);
      else await plmApi.styleWashCare.upsert(styleCardId!, form);
      toast.success("Wash & Care saved");
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p>;

  return (
    <div className="rounded-md border p-4 max-w-xl space-y-3">
      {FIELDS.map((f) => (
        <div key={f.key} className="grid grid-cols-3 items-center gap-3">
          <Label className="text-sm text-muted-foreground">{f.label}</Label>
          <div className="col-span-2">
            <Select value={form[f.key] || ""} onValueChange={(v) => setForm((s) => ({ ...s, [f.key]: v }))}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select instruction" /></SelectTrigger>
              <SelectContent>{WASH_CARE_OPTIONS[f.key].map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      ))}
      <div className="flex justify-end pt-2">
        <Button size="sm" onClick={save} disabled={saving}><Save className="h-4 w-4 mr-1" />{saving ? "Saving..." : "Save"}</Button>
      </div>
    </div>
  );
}
