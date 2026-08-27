"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Save, Trash2 } from "lucide-react";
import { plmApi } from "@/lib/nexuscore-api";
import { GridInput, uid } from "./grid-input";

type Row = { id: string; designDetailTypeId: string; description: string; imageUrl: string; notes: string };

// The "Attributes" tab the reference doc asks for, built directly on StyleCardDetail — an
// already-existing Prisma model + already-existing backend endpoints
// (plmApi.styleCards.getDetails/addDetail/upsertDetails, see plm-cards.service.ts) that simply
// had no frontend tab rendering them anywhere yet. No new schema, no new backend route — only
// this UI was missing.
export function AttributesTab({ styleCardId, card }: { styleCardId: string; card: any; onReloadCard: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [types, setTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [details, dts]: [any, any] = await Promise.all([
        plmApi.styleCards.getDetails(styleCardId),
        plmApi.designDetailTypes.list(),
      ]);
      const list = Array.isArray(details) ? details : details?.data || [];
      setRows(list.map((d: any) => ({ id: d.id, designDetailTypeId: d.designDetailTypeId, description: d.description || "", imageUrl: d.imageUrl || "", notes: d.notes || "" })));
      setTypes(Array.isArray(dts) ? dts : dts?.data || []);
    } catch (e: any) {
      toast.error(e.message || "Failed to load attributes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [styleCardId]);

  const update = (id: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, { id: uid(), designDetailTypeId: types[0]?.id || "", description: "", imageUrl: "", notes: "" }]);
  const removeRow = (id: string) => setRows((rs) => rs.filter((r) => r.id !== id));

  const save = async () => {
    if (rows.some((r) => !r.designDetailTypeId)) return toast.error("Every row needs a Detail Type");
    setSaving(true);
    try {
      await plmApi.styleCards.upsertDetails(styleCardId, rows.map(({ designDetailTypeId, description, imageUrl, notes }) => ({ designDetailTypeId, description, imageUrl, notes })));
      toast.success("Attributes saved");
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed to save attributes");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground py-8 text-center">Loading attributes...</p>;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={save} disabled={saving}><Save className="h-4 w-4 mr-1" />{saving ? "Saving..." : "Save"}</Button>
      </div>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="[&>th]:border-r [&>th]:text-[11px] [&>th]:h-8">
              <TableHead className="min-w-[180px]">Detail Type</TableHead>
              <TableHead className="min-w-[220px]">Description</TableHead>
              <TableHead className="min-w-[160px]">Image URL</TableHead>
              <TableHead className="min-w-[220px]">Notes</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">No attributes yet</TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.id} className="[&>td]:border-r [&>td]:p-0">
                <TableCell className="p-1">
                  <select value={r.designDetailTypeId} onChange={(e) => update(r.id, { designDetailTypeId: e.target.value })} className="h-7 w-full text-xs bg-transparent outline-none rounded focus:bg-accent/50">
                    <option value="">—</option>
                    {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </TableCell>
                <TableCell><GridInput value={r.description} onChange={(v) => update(r.id, { description: v })} /></TableCell>
                <TableCell><GridInput value={r.imageUrl} onChange={(v) => update(r.id, { imageUrl: v })} /></TableCell>
                <TableCell><GridInput value={r.notes} onChange={(v) => update(r.id, { notes: v })} /></TableCell>
                <TableCell className="p-0 text-center"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeRow(r.id)}><Trash2 className="h-3.5 w-3.5 text-muted-foreground" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addRow}><Plus className="h-3.5 w-3.5 mr-1" />Add Row</Button>
    </div>
  );
}
