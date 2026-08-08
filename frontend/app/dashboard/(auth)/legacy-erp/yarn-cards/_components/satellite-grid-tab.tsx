"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { legacyErpApi } from "@/lib/nexuscore-api";
import { toast } from "sonner";
import { Plus, Trash2, Inbox } from "lucide-react";

export interface SatelliteField {
  key: string;
  label: string;
  type?: "text" | "number" | "date" | "checkbox";
}

interface Props {
  itemId: number;
  tab: string; // matches backend SATELLITES key in yarn-card-satellites.service.ts, e.g. "prices"
  fields: SatelliteField[];
  addLabel?: string;
  readOnly?: boolean;
}

// Same generic grid+dialog pattern as current-accounts/_components/satellite-grid-tab.tsx,
// pointed at legacyErpApi.yarnCards instead of .accounts — kept as its own copy rather than
// a shared cross-screen component, matching this codebase's existing convention of each
// master screen owning its private _components (see Unit Sets, Current Account, Trim Cards).
export function SatelliteGridTab({ itemId, tab, fields, addLabel = "Add Row", readOnly = false }: Props) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r: any = await legacyErpApi.yarnCards.listTab(itemId, tab);
      setRows(Array.isArray(r) ? r : []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [itemId, tab]);

  const set = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await legacyErpApi.yarnCards.createTabRow(itemId, tab, form);
      toast.success("Added");
      setOpen(false);
      setForm({});
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    try {
      await legacyErpApi.yarnCards.removeTabRow(itemId, tab, id);
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="space-y-4">
      {!readOnly && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => { setForm({}); setOpen(true); }}>
            <Plus className="h-3.5 w-3.5 mr-2" />{addLabel}
          </Button>
        </div>
      )}
      <div className="rounded-xl border shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-b bg-muted/40 hover:bg-muted/40">
              {fields.map((f) => <TableHead key={f.key} className="h-10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">{f.label}</TableHead>)}
              {!readOnly && <TableHead className="w-10 h-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow className="hover:bg-transparent"><TableCell colSpan={fields.length + 1} className="py-4"><Skeleton className="h-6 w-full" /></TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={fields.length + 1} className="py-8">
                  <Empty>
                    <EmptyHeader>
                      <EmptyMedia variant="icon"><Inbox /></EmptyMedia>
                      <EmptyTitle className="text-sm">No records</EmptyTitle>
                      <EmptyDescription>{readOnly ? "Nothing has been added yet." : `Click "${addLabel}" to add the first one.`}</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </TableCell>
              </TableRow>
            ) : rows.map((row) => (
              <TableRow key={row.id} className="group">
                {fields.map((f) => (
                  <TableCell key={f.key} className="py-3">
                    {f.type === "checkbox" ? (
                      row[f.key] ? <span className="text-foreground">Yes</span> : <span className="text-muted-foreground">No</span>
                    ) : (row[f.key] ?? <span className="text-muted-foreground">—</span>)}
                  </TableCell>
                ))}
                {!readOnly && (
                  <TableCell className="py-3">
                    <Button variant="ghost" size="icon" className="opacity-60 group-hover:opacity-100 transition-opacity" onClick={() => remove(row.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{addLabel}</DialogTitle>
            <DialogDescription>Fill in the fields below and save to add this row.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {fields.map((f) => (
              <div key={f.key} className={f.type === "checkbox" ? "flex items-center gap-2 self-end h-9" : "space-y-2"}>
                {f.type === "checkbox" ? (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Switch checked={!!form[f.key]} onCheckedChange={(v) => set(f.key, v)} />
                    <span className="text-sm">{f.label}</span>
                  </label>
                ) : (
                  <>
                    <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">{f.label}</Label>
                    <Input className="h-9" type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                      value={form[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} />
                  </>
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
