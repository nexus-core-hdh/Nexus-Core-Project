"use client";

import { useEffect, useState } from "react";
import { useWorkspaceRecordLabel } from "@/hooks/use-workspace-tab-title";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { plmApi } from "@/lib/nexuscore-api";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Image as ImageIcon, Edit2, Check, X } from "lucide-react";

const STATUSES = ['draft', 'review', 'approved', 'archived'];
const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  review: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  archived: 'bg-gray-100 text-gray-500',
};
const SEASONS = ['SS25', 'AW25', 'SS26', 'AW26', 'Resort', 'Pre-Fall'];
const THEMES = ['Minimal', 'Bold', 'Romantic', 'Urban', 'Nature', 'Futuristic', 'Vintage', 'Luxe'];

export default function MoodBoardDetailPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [board, setBoard] = useState<any>(null);
  useWorkspaceRecordLabel(board?.title || undefined);
  const [loading, setLoading] = useState(true);
  const [editDialog, setEditDialog] = useState(false);
  const [statusDialog, setStatusDialog] = useState(false);
  const [imageDialog, setImageDialog] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [newStatus, setNewStatus] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await plmApi.moodBoards.get(id);
      setBoard(r);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const openEdit = () => {
    setEditForm({ title: board.title, season: board.season || '', theme: board.theme || '', description: board.description || '' });
    setEditDialog(true);
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      await plmApi.moodBoards.update(id, editForm);
      toast.success("Board updated");
      setEditDialog(false);
      load();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  const changeStatus = async () => {
    if (!newStatus) return;
    setSaving(true);
    try {
      await plmApi.moodBoards.update(id, { status: newStatus });
      toast.success("Status updated");
      setStatusDialog(false);
      load();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  const addImage = async () => {
    if (!imageUrl.trim()) return toast.error("Image URL required");
    setSaving(true);
    try {
      const existing = board.images ?? [];
      await plmApi.moodBoards.addImages(id, [...existing, imageUrl.trim()]);
      toast.success("Image added");
      setImageDialog(false);
      setImageUrl('');
      load();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  const removeImage = async (url: string) => {
    const updated = (board.images ?? []).filter((u: string) => u !== url);
    try {
      await plmApi.moodBoards.addImages(id, updated);
      toast.success("Image removed");
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  if (loading) return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-48 w-full rounded-xl" />
      <div className="grid grid-cols-3 gap-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-lg" />)}</div>
    </div>
  );

  if (!board) return <div className="p-6 text-muted-foreground">Mood board not found.</div>;

  const images: string[] = board.images ?? [];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => router.back()}><ArrowLeft className="h-4 w-4" /></Button>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-semibold">{board.title}</h1>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[board.status] || 'bg-gray-100 text-gray-700'}`}>{board.status}</span>
            {board.season && <Badge variant="secondary">{board.season}</Badge>}
            {board.theme && <Badge variant="outline">{board.theme}</Badge>}
          </div>
          {board.description && <p className="text-sm text-muted-foreground mt-0.5 max-w-2xl">{board.description}</p>}
        </div>
        <div className="flex gap-2 shrink-0">
          <Button size="sm" variant="outline" onClick={openEdit}><Edit2 className="h-3.5 w-3.5 mr-1" />Edit</Button>
          <Button size="sm" variant="outline" onClick={() => { setNewStatus(board.status); setStatusDialog(true); }}>Change Status</Button>
          <Button size="sm" onClick={() => { setImageUrl(''); setImageDialog(true); }}><Plus className="h-4 w-4 mr-1" />Add Image</Button>
        </div>
      </div>

      {/* Hero banner */}
      <div className="h-40 rounded-xl bg-gradient-to-br from-purple-100 via-pink-50 to-orange-100 dark:from-purple-900/30 dark:via-pink-900/20 dark:to-orange-900/20 flex items-center justify-center">
        <div className="text-center">
          <span className="text-5xl opacity-40">🎨</span>
          <p className="text-sm text-muted-foreground mt-2">{board.title}</p>
        </div>
      </div>

      {/* Meta cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Status</p><p className="font-medium capitalize">{board.status}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Season</p><p className="font-medium">{board.season || '—'}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Theme</p><p className="font-medium">{board.theme || '—'}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Images</p><p className="text-2xl font-bold">{images.length}</p></CardContent></Card>
      </div>

      {/* Image gallery */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Images</CardTitle>
            <Button size="sm" variant="ghost" onClick={() => { setImageUrl(''); setImageDialog(true); }}>
              <Plus className="h-4 w-4 mr-1" />Add
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {images.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 border-2 border-dashed rounded-lg">
              <ImageIcon className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No images yet</p>
              <Button size="sm" variant="outline" onClick={() => { setImageUrl(''); setImageDialog(true); }}>
                <Plus className="h-4 w-4 mr-1" />Add First Image
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {images.map((url, i) => (
                <div key={i} className="group relative rounded-lg overflow-hidden border bg-muted aspect-square">
                  <img
                    src={url}
                    alt={`Board image ${i + 1}`}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const target = e.currentTarget;
                      target.style.display = 'none';
                      const parent = target.parentElement;
                      if (parent) {
                        const placeholder = parent.querySelector('.img-placeholder') as HTMLElement;
                        if (placeholder) placeholder.style.display = 'flex';
                      }
                    }}
                  />
                  <div className="img-placeholder absolute inset-0 hidden items-center justify-center bg-muted">
                    <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
                  </div>
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                    <Button
                      size="icon"
                      variant="destructive"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => removeImage(url)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
              {/* Add more tile */}
              <button
                onClick={() => { setImageUrl(''); setImageDialog(true); }}
                className="rounded-lg border-2 border-dashed aspect-square flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors"
              >
                <Plus className="h-6 w-6" />
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Mood Board</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Title *</Label><Input value={editForm.title} onChange={(e) => setEditForm((p: any) => ({ ...p, title: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Season</Label>
                <Select value={editForm.season} onValueChange={(v) => setEditForm((p: any) => ({ ...p, season: v }))}>
                  <SelectTrigger><SelectValue placeholder="Season" /></SelectTrigger>
                  <SelectContent>{SEASONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Theme</Label>
                <Select value={editForm.theme} onValueChange={(v) => setEditForm((p: any) => ({ ...p, theme: v }))}>
                  <SelectTrigger><SelectValue placeholder="Theme" /></SelectTrigger>
                  <SelectContent>{THEMES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Description</Label><Textarea value={editForm.description} onChange={(e) => setEditForm((p: any) => ({ ...p, description: e.target.value }))} rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(false)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={saving}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Status dialog */}
      <Dialog open={statusDialog} onOpenChange={setStatusDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Change Status</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>New Status</Label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusDialog(false)}>Cancel</Button>
            <Button onClick={changeStatus} disabled={saving}>Update</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add image dialog */}
      <Dialog open={imageDialog} onOpenChange={setImageDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Image</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Image URL *</Label>
              <Input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://example.com/image.jpg"
              />
              <p className="text-xs text-muted-foreground mt-1">Enter a direct URL to an image file</p>
            </div>
            {imageUrl && (
              <div className="rounded-lg border overflow-hidden h-40 bg-muted">
                <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" onError={(e) => (e.currentTarget.style.opacity = '0')} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImageDialog(false)}>Cancel</Button>
            <Button onClick={addImage} disabled={saving}>Add Image</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
