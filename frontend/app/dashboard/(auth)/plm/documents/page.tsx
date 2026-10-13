"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { plmApi } from "@/lib/nexuscore-api";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";
import { Plus, Search, FileText, FileImage, Archive, File } from "lucide-react";

const DOC_TYPES = ['tech-pack', 'spec-sheet', 'bom', 'fit-report', 'approval', 'contract', 'photo', 'cad', 'other'];
const ENTITY_TYPES = ['style_card', 'sample_card', 'product_card', 'plm_order'];

const empty = { title: '', documentType: 'tech-pack', entityType: 'style_card', entityId: '', fileUrl: '', version: 'v1', notes: '' };

const FileIcon = ({ type }: { type: string }) => {
  if (type === 'photo' || type === 'cad') return <FileImage className="h-4 w-4 text-purple-500" />;
  if (type === 'contract') return <Archive className="h-4 w-4 text-orange-500" />;
  return <FileText className="h-4 w-4 text-blue-500" />;
};

export default function DocumentsPage() {
  const [data, setData] = useState<any[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [docType, setDocType] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(empty);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const q: any = { page: String(page), limit: '20' };
      if (search) q.search = search;
      if (docType) q.documentType = docType;
      const r: any = await plmApi.documents.list(q);
      setData(r?.data ?? []);
      setMeta(r?.meta ?? { total: 0, page: 1, pages: 1 });
    } finally { setLoading(false); }
  }, [search, docType]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.title || !form.entityId) return toast.error("Title and entity ID required");
    setSaving(true);
    try {
      const user = getCurrentUser();
      await plmApi.documents.create({ ...form, uploadedBy: user?.id });
      toast.success("Document added");
      setOpen(false); load();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-semibold">Documents</h1><p className="text-xs text-muted-foreground">{meta.total} documents</p></div>
        <Button size="sm" onClick={() => { setForm(empty); setOpen(true); }}><Plus className="h-4 w-4 mr-1" />Add Document</Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Search documents..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 w-56 h-9" /></div>
        <Select value={docType || '__all__'} onValueChange={(v) => setDocType(v === '__all__' ? '' : v)}><SelectTrigger className="w-40 h-9"><SelectValue placeholder="All types" /></SelectTrigger><SelectContent><SelectItem value="__all__">All Types</SelectItem>{DOC_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader><TableRow className="bg-slate-700 hover:bg-slate-700 dark:bg-slate-800 dark:hover:bg-slate-800 [&>th]:text-white [&>th]:border-r [&>th:last-child]:border-r-0"><TableHead>Document</TableHead><TableHead>Type</TableHead><TableHead>Entity</TableHead><TableHead>Version</TableHead><TableHead>Uploaded By</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
          <TableBody className="[&>tr>td]:border-r [&>tr>td:last-child]:border-r-0">
            {loading ? Array.from({ length: 8 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 6 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
            )) : data.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No documents yet</TableCell></TableRow>
            ) : data.map((row) => (
              <TableRow key={row.id} className="hover:bg-muted/30">
                <TableCell>
                  <div className="flex items-center gap-2">
                    <FileIcon type={row.documentType} />
                    <span className="font-medium text-sm">{row.title}</span>
                  </div>
                  {row.notes && <p className="text-xs text-muted-foreground pl-6">{row.notes}</p>}
                </TableCell>
                <TableCell><Badge variant="outline" className="text-xs">{row.documentType}</Badge></TableCell>
                <TableCell className="text-xs text-muted-foreground">{row.entityType?.replace('_', ' ')}</TableCell>
                <TableCell><Badge variant="secondary" className="text-xs">{row.version || 'v1'}</Badge></TableCell>
                <TableCell className="text-sm">{row.uploadedBy || '—'}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{row.createdAt ? new Date(row.createdAt).toLocaleDateString() : '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {meta.pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Page {meta.page} of {meta.pages}</span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={meta.page <= 1} onClick={() => load(meta.page - 1)}>Prev</Button>
            <Button variant="outline" size="sm" disabled={meta.page >= meta.pages} onClick={() => load(meta.page + 1)}>Next</Button>
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Document</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Title *</Label><Input value={form.title} onChange={(e) => setForm((p: any) => ({ ...p, title: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Document Type</Label>
                <Select value={form.documentType} onValueChange={(v) => setForm((p: any) => ({ ...p, documentType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DOC_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Version</Label><Input value={form.version} onChange={(e) => setForm((p: any) => ({ ...p, version: e.target.value }))} placeholder="v1" /></div>
            </div>
            <div><Label>Entity Type</Label>
              <Select value={form.entityType} onValueChange={(v) => setForm((p: any) => ({ ...p, entityType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ENTITY_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Entity ID *</Label><Input value={form.entityId} onChange={(e) => setForm((p: any) => ({ ...p, entityId: e.target.value }))} placeholder="Paste the ID of the related record" /></div>
            <div><Label>File URL</Label><Input value={form.fileUrl} onChange={(e) => setForm((p: any) => ({ ...p, fileUrl: e.target.value }))} placeholder="https://..." /></div>
            <div><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm((p: any) => ({ ...p, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving}>Add</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
