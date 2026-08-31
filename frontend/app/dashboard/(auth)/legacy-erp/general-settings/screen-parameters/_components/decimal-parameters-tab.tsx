"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { screenParametersApi } from "@/lib/nexuscore-api";
import { useDecimalParameters } from "@/hooks/use-decimal-parameters";
import {
  DECIMAL_PARAMETERS_SCREEN_KEY, DECIMAL_FIELD_DEFS, ROUNDING_MODES, ROUNDING_MODE_PARAM_KEY,
  UNIT_PRICE_NO_DECIMAL_OVERRIDE_PARAM_KEY, parseDecimalParameterRows, isValidDecimalPrecision,
  type DecimalFieldKey, type RoundingMode,
} from "@/lib/legacy-erp/decimal-parameters";
import { toast } from "sonner";
import { Save } from "lucide-react";

// Settings -> Screen Parameters -> Decimal. A dedicated fixed-fields form over the SAME
// centralized ScreenParameter table/API every other Screen Parameter uses (screenKey =
// DECIMAL_PARAMETERS_SCREEN_KEY, one row per field) — not a new table, not a new endpoint. The
// consumer-facing read side (round()/format()) lives in hooks/use-decimal-parameters.ts; this
// component is the write side (admin form) only.
type DecimalsForm = Record<DecimalFieldKey, string>;

export function DecimalParametersTab() {
  const [existingRows, setExistingRows] = useState<any[]>([]);
  const [decimals, setDecimals] = useState<DecimalsForm>(
    Object.fromEntries(DECIMAL_FIELD_DEFS.map((f) => [f.key, String(f.defaultDecimals)])) as DecimalsForm,
  );
  const [roundingMode, setRoundingMode] = useState<RoundingMode>("standard");
  const [unitPriceOverride, setUnitPriceOverride] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<DecimalFieldKey, string>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const { refresh } = useDecimalParameters();

  const load = async () => {
    setLoading(true);
    try {
      const rows: any = await screenParametersApi.list(DECIMAL_PARAMETERS_SCREEN_KEY);
      const list = Array.isArray(rows) ? rows : [];
      setExistingRows(list);
      const config = parseDecimalParameterRows(list);
      // config.decimals[f.key] is absent (not defaulted) for a field never saved before — the
      // form still needs SOME starting digit to show/edit, so it falls back to the field's own
      // display default here. This is purely a form pre-fill, not a runtime rounding default —
      // round() itself (lib/legacy-erp/decimal-parameters.ts) never applies this fallback.
      setDecimals(Object.fromEntries(DECIMAL_FIELD_DEFS.map((f) => [f.key, String(config.decimals[f.key] ?? f.defaultDecimals)])) as DecimalsForm);
      setRoundingMode(config.roundingMode);
      setUnitPriceOverride(config.unitPriceNoDecimalOverride);
    } catch (e: any) {
      toast.error(e.message || "Failed to load Decimal Parameters");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const setDecimal = (key: DecimalFieldKey, v: string) => {
    setDecimals((p) => ({ ...p, [key]: v }));
    setErrors((p) => ({ ...p, [key]: undefined }));
  };

  // Upserts one paramKey — updates the existing row if the field was already saved before, else
  // creates it. Reuses the exact same generic create/update calls the Screen Parameters tab uses.
  const upsertRow = async (paramKey: string, name: string, type: "number" | "select" | "boolean", value: string, options?: string[]) => {
    const existing = existingRows.find((r) => r.paramKey === paramKey);
    if (existing) return screenParametersApi.update(existing.id, { value });
    return screenParametersApi.create({ screenKey: DECIMAL_PARAMETERS_SCREEN_KEY, paramKey, name, type, value, options, isActive: true });
  };

  const save = async () => {
    // Decimal precision must be a non-negative integer — validated here, before any request is
    // sent, so an invalid entry can never reach the (intentionally generic, unvalidated-by-type)
    // ScreenParameter API.
    const nextErrors: Partial<Record<DecimalFieldKey, string>> = {};
    for (const f of DECIMAL_FIELD_DEFS) {
      const raw = decimals[f.key].trim();
      const n = Number(raw);
      if (raw === "" || !isValidDecimalPrecision(n)) nextErrors[f.key] = "Enter a whole number, 0–6";
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return toast.error("Fix the highlighted decimal precision values");
    }

    setSaving(true);
    try {
      await Promise.all([
        ...DECIMAL_FIELD_DEFS.map((f) => upsertRow(f.key, f.label, "number", decimals[f.key].trim())),
        upsertRow(ROUNDING_MODE_PARAM_KEY, "Rounding", "select", roundingMode, ROUNDING_MODES.map((m) => m.value)),
        upsertRow(UNIT_PRICE_NO_DECIMAL_OVERRIDE_PARAM_KEY, "Do NOT Use Decimals Parameter for Unit Price Entry", "boolean", unitPriceOverride ? "true" : "false"),
      ]);
      toast.success("Decimal Parameters saved");
      refresh(); // pushes the new config to every already-mounted consumer (e.g. EditableGridInput)
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed to save Decimal Parameters");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-xl border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="border-b bg-muted/40 hover:bg-muted/40">
              <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Field</TableHead>
              <TableHead className="h-10 w-40 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Decimal Places</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {DECIMAL_FIELD_DEFS.map((f) => (
              <TableRow key={f.key}>
                <TableCell className="py-2.5 font-medium">{f.label}</TableCell>
                <TableCell className="py-2.5">
                  <Input
                    type="number" min={0} max={6} step={1}
                    className="h-8 w-24"
                    value={decimals[f.key]}
                    onChange={(e) => setDecimal(f.key, e.target.value)}
                  />
                  {errors[f.key] && <p className="mt-1 text-[11px] text-destructive">{errors[f.key]}</p>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Rounding</Label>
          <Select value={roundingMode} onValueChange={(v) => setRoundingMode(v as RoundingMode)}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ROUNDING_MODES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 pt-6">
          <Switch checked={unitPriceOverride} onCheckedChange={setUnitPriceOverride} />
          <Label className="text-sm font-normal leading-snug">Do NOT Use Decimals Parameter for Unit Price Entry</Label>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}><Save className="h-3.5 w-3.5 mr-2" />Save Decimal Parameters</Button>
      </div>
    </div>
  );
}
