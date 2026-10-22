"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "@/lib/app-navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { plmApi } from "@/lib/nexuscore-api";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";
import { Plus } from "lucide-react";

const SIZES = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '28', '30', '32', '34', '36', '38'];

export default function ProductCardDetailPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [card, setCard] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [measurementDefs, setMeasurementDefs] = useState<any[]>([]);
  const [swatchCards, setSwatchCards] = useState<any[]>([]);
  const [measOpen, setMeasOpen] = useState(false);
  const [swatchOpen, setSwatchOpen] = useState(false);
  const [measForm, setMeasForm] = useState<any>({ measurementDefinitionId: '', size: '', value: '' });
  const [swatchForm, setSwatchForm] = useState<any>({ swatchCardId: '', quantity: '' });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [r, md, sw] = await Promise.all([plmApi.productCards.get(id), plmApi.measurementDefs.list(), plmApi.swatchCards.list({})]);
      setCard(r);
      setMeasurementDefs(Array.isArray(md) ? md : []);
      setSwatchCards(Array.isArray(sw) ? sw : (sw?.data ?? []));
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [id]);

  const addMeasurement = async () => {
    if (!measForm.measurementDefinitionId || !measForm.size || !measForm.value) return toast.error("All fields required");
    setSaving(true);
    try {
      await plmApi.productCards.addMeasurement(id, { ...measForm, value: parseFloat(measForm.value) });
      toast.success("Measurement added"); setMeasOpen(false); load();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  const addSwatch = async () => {
    if (!swatchForm.swatchCardId) return toast.error("Select a swatch");
    setSaving(true);
    try {
      await plmApi.productCards.addSwatch(id, { ...swatchForm, quantity: swatchForm.quantity ? parseFloat(swatchForm.quantity) : undefined });
      toast.success("Swatch added"); setSwatchOpen(false); load();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  if (loading) return <div className="p-6 space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-64 w-full" /></div>;
  if (!card) return <div className="p-6 text-muted-foreground">Product card not found.</div>;

  const measByDef = card.measurements?.reduce((acc: any, m: any) => {
    const defName = m.measurementDefinition?.name || m.definition?.name || m.measurementDefinitionId;
    if (!acc[defName]) acc[defName] = {};
    acc[defName][m.size] = m.value;
    return acc;
  }, {});

  const sizes = [...new Set(card.measurements?.map((m: any) => m.size) ?? [])].sort();

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">{card.productNumber}</h1>
            <Badge variant={card.status === 'active' ? 'default' : 'secondary'}>{card.status}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">{card.styleCard?.title} · {card.color || 'No color'} · {card.fabric || 'No fabric'}</p>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="measurements">Measurements ({card.measurements?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="swatches">Swatches ({card.swatches?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="samples">Samples ({card.sampleCards?.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="pt-4">
          <div className="grid grid-cols-2 gap-4 max-w-md">
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Color</p><p className="font-medium">{card.color || '—'}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Fabric</p><p className="font-medium">{card.fabric || '—'}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Fabric Content</p><p className="font-medium">{card.fabricContent || '—'}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Style</p><p className="font-medium">{card.styleCard?.title || '—'}</p></CardContent></Card>
          </div>
          {card.description && <Card className="max-w-2xl mt-4"><CardContent className="pt-4"><p className="text-sm text-muted-foreground">{card.description}</p></CardContent></Card>}
        </TabsContent>

        <TabsContent value="measurements" className="pt-4">
          <div className="flex justify-end mb-3">
            <Button size="sm" onClick={() => { setMeasForm({ measurementDefinitionId: '', size: '', value: '' }); setMeasOpen(true); }}><Plus className="h-4 w-4 mr-1" />Add Measurement</Button>
          </div>
          {!card.measurements?.length ? <p className="text-center py-6 text-muted-foreground">No measurements yet</p> : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Measurement</TableHead>
                    {sizes.map((s: any) => <TableHead key={s}>{s}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {measByDef && Object.entries(measByDef).map(([def, vals]: any) => (
                    <TableRow key={def}>
                      <TableCell className="font-medium">{def}</TableCell>
                      {sizes.map((s: any) => <TableCell key={s}>{vals[s] ?? '—'}</TableCell>)}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="swatches" className="pt-4">
          <div className="flex justify-end mb-3">
            <Button size="sm" onClick={() => { setSwatchForm({ swatchCardId: '', quantity: '' }); setSwatchOpen(true); }}><Plus className="h-4 w-4 mr-1" />Add Swatch</Button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {!card.swatches?.length ? <p className="col-span-4 text-center py-6 text-muted-foreground">No swatches yet</p>
              : card.swatches.map((sw: any) => (
                <Card key={sw.id} className="overflow-hidden">
                  <div className="h-16 bg-gradient-to-br from-muted to-muted/50" style={{ backgroundColor: sw.swatchCard?.colorCode }} />
                  <CardContent className="p-2"><p className="text-xs font-medium">{sw.swatchCard?.colorName || 'Swatch'}</p>{sw.quantity && <p className="text-xs text-muted-foreground">{sw.quantity} units</p>}</CardContent>
                </Card>
              ))}
          </div>
        </TabsContent>

        <TabsContent value="samples" className="pt-4">
          <div className="rounded-md border">
            <Table>
              <TableHeader><TableRow><TableHead>Sample #</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {!card.sampleCards?.length ? <TableRow><TableCell colSpan={3} className="text-center py-6 text-muted-foreground">No samples</TableCell></TableRow>
                  : card.sampleCards.map((s: any) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs">{s.sampleNumber}</TableCell>
                      <TableCell>{s.sampleType?.name || '—'}</TableCell>
                      <TableCell><Badge variant="outline">{s.status}</Badge></TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={measOpen} onOpenChange={setMeasOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Measurement</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Measurement *</Label>
              <Select value={measForm.measurementDefinitionId} onValueChange={(v) => setMeasForm((p: any) => ({ ...p, measurementDefinitionId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select measurement" /></SelectTrigger>
                <SelectContent>{measurementDefs.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Size *</Label>
              <Select value={measForm.size} onValueChange={(v) => setMeasForm((p: any) => ({ ...p, size: v }))}>
                <SelectTrigger><SelectValue placeholder="Select size" /></SelectTrigger>
                <SelectContent>{SIZES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Value (cm) *</Label><Input type="number" step="0.1" value={measForm.value} onChange={(e) => setMeasForm((p: any) => ({ ...p, value: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setMeasOpen(false)}>Cancel</Button><Button onClick={addMeasurement} disabled={saving}>Add</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={swatchOpen} onOpenChange={setSwatchOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Swatch</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Swatch *</Label>
              <Select value={swatchForm.swatchCardId} onValueChange={(v) => setSwatchForm((p: any) => ({ ...p, swatchCardId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select swatch" /></SelectTrigger>
                <SelectContent>{swatchCards.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.swatchNumber} — {s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Quantity</Label><Input type="number" value={swatchForm.quantity} onChange={(e) => setSwatchForm((p: any) => ({ ...p, quantity: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setSwatchOpen(false)}>Cancel</Button><Button onClick={addSwatch} disabled={saving}>Add</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
