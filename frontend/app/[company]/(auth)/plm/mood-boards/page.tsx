"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "@/components/app-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { plmApi } from "@/lib/nexuscore-api";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";
import { Plus, Search, ExternalLink } from "lucide-react";

const SEASONS = ['SS25', 'AW25', 'SS26', 'AW26', 'Resort', 'Pre-Fall'];
const STATUSES = ['draft', 'review', 'approved', 'archived'];
const STATUS_COLORS: Record<string, string> = { draft: 'bg-slate-100 text-slate-700', review: 'bg-amber-100 text-amber-700', approved: 'bg-green-100 text-green-700', archived: 'bg-gray-100 text-gray-500' };
const THEMES = ['Minimal', 'Bold', 'Romantic', 'Urban', 'Nature', 'Futuristic', 'Vintage', 'Luxe'];

const empty = { title: '', season: '', theme: '', description: '', status: 'draft' };

export default function MoodBoardsPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(empty);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q: any = {};
      if (search) q.search = search;
      const r: any = await plmApi.moodBoards.list(q);
      setData(Array.isArray(r) ? r : (r?.data ?? []));
    } finally { setLoading(false); }
  }, [search]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.title) return toast.error("Title required");
    setSaving(true);
    try {
      const user = getCurrentUser();
      await plmApi.moodBoards.create({ ...form, branchId: user?.branchId, createdBy: user?.id });
      toast.success("Mood board created");
      setOpen(false); load();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-lg font-semibold">Mood Boards</h1><p className="text-xs text-muted-foreground">{data.length} boards</p></div>
        <Button size="sm" onClick={() => { setForm(empty); setOpen(true); }}><Plus className="h-4 w-4 mr-1" />New Board</Button>
      </div>

      <div className="flex gap-2">
        <div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Search boards..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 w-56 h-9" /></div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
        </div>
      ) : data.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">No mood boards yet. Create your first board.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.map((board) => (
            <div key={board.id} className="rounded-xl border bg-card overflow-hidden hover:shadow-md transition-shadow group">
              <div className="h-32 bg-gradient-to-br from-purple-100 via-pink-50 to-orange-100 dark:from-purple-900/30 dark:via-pink-900/20 dark:to-orange-900/20 relative">
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-4xl opacity-30">🎨</span>
                </div>
                <Link href={`/plm/mood-boards/${board.id}`} className="absolute inset-0 flex items-end justify-end p-2 opacity-0 group-hover:opacity-100">
                  <ExternalLink className="h-4 w-4 text-white bg-black/30 rounded p-0.5" />
                </Link>
              </div>
              <div className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-medium text-sm">{board.title}</h3>
                  <span className={`shrink-0 px-1.5 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[board.status] || 'bg-gray-100 text-gray-700'}`}>{board.status}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {board.season && <span className="text-xs text-muted-foreground">{board.season}</span>}
                  {board.theme && <Badge variant="outline" className="text-xs">{board.theme}</Badge>}
                </div>
                {board.description && <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{board.description}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Mood Board</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Title *</Label><Input value={form.title} onChange={(e) => setForm((p: any) => ({ ...p, title: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Season</Label>
                <Select value={form.season} onValueChange={(v) => setForm((p: any) => ({ ...p, season: v }))}>
                  <SelectTrigger><SelectValue placeholder="Season" /></SelectTrigger>
                  <SelectContent>{SEASONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Theme</Label>
                <Select value={form.theme} onValueChange={(v) => setForm((p: any) => ({ ...p, theme: v }))}>
                  <SelectTrigger><SelectValue placeholder="Theme" /></SelectTrigger>
                  <SelectContent>{THEMES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm((p: any) => ({ ...p, description: e.target.value }))} rows={3} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving}>Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
